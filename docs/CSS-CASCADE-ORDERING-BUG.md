# CSS Cascade Ordering Bug — Full Investigation

This document records the full investigation, reproduction, and fix path for a CSS cascade ordering bug in TanStack Start that causes design-system component CSS to briefly override consumer-route CSS overrides during dev-mode hydration. Three patches were ultimately required, addressing three independent ordering issues — only one of which affects production.

## TL;DR

| # | Layer | What goes wrong | Status |
|---|-------|-----------------|--------|
| 1 | Prod manifest builder | Route-asset CSS list orders own-CSS before imports-CSS | **Fixed upstream in `@tanstack/start-plugin-core@1.169.1`** |
| 2 | Dev-styles link content | `Promise.all(...)` traversals race → DS / consumer ordering arbitrary | **Local pnpm patch on `dev-styles.js`** (apps/client) |
| 3 | Dev per-module `<style>` insertion position | Vite's `updateStyle()` `appendChild`s every per-module style after the dev-styles link → wrong cascade window during hydration | **Local pnpm patch on `vite/dist/client/client.mjs`** (apps/client) |

The project does **not** use CSS `@layer` — equal-specificity ties are decided purely by source order in the live cascade, so getting the order right at every layer of the pipeline is load-bearing.

---

## Why three patches

Two single-class CSS selectors (one DS, one consumer) at equal specificity are applied to the same DOM element. The browser cascade picks the rule that appears later in the document. Three places in the TanStack Start + Vite pipeline can break the "later" expectation:

### 1. Prod manifest builder (`getChunkCssAssets`)

In production, the route asset manifest lists CSS chunks per route. The original implementation appended own-CSS *before* imported-chunks-CSS. Since consumer routes import DS chunks, the consumer's own CSS landed in the asset list before the DS chunks' CSS. The browser then loaded consumer CSS first → DS rules later → DS wins → wrong colour.

Fixed in `getChunkCssAssets` upstream by reordering: imported-chunks-CSS first, own-CSS last. Released in **`@tanstack/start-plugin-core@1.169.1`**. No local patch needed beyond pinning to that version.

### 2. Dev-styles link content (`collectDevStyles`)

In dev, Start serves a route-scoped CSS bundle at `/@tanstack-start/styles.css?routes=...`. The function that builds the response (`collectDevStyles` in `dist/esm/vite/dev-server-plugin/dev-styles.js`) traverses the Vite module graph for each entry and emits the CSS in the order modules land in a shared `visited` Set.

The upstream original used `Promise.all` at two levels:

- Outer: `Promise.all(entries.map(processEntry))` over the matched route entries.
- Inner: `Promise.all(branches)` over the dependency branches at each module.

Both layers race. A leaf module with no nested dependencies finishes its recursion immediately and lands in `visited` *before* siblings whose deeper trees are still being awaited. The relative emit order between DS-dep and consumer became arbitrary across calls.

Fix: sequential `for...of await` at both levels, with a `visiting` cycle guard and post-order insertion:

```js
async function collectDevStyles({ viteDevServer, entries, cssModulesCache }) {
  const styles = new Map()
  const visiting = new Set()
  const visited = new Set()
  const rootDirectory = viteDevServer.config.root
  for (const entry of entries) {
    await processEntry(viteDevServer, resolveDevUrl(rootDirectory, entry), visiting, visited)
  }
  // ...emit `visited` as concatenated CSS...
}

async function findModuleDeps(viteDevServer, node, visiting, visited) {
  if (visited.has(node) || visiting.has(node)) return
  visiting.add(node)
  const deps = node.ssrTransformResult?.deps ?? node.transformResult?.deps ?? null
  const importedModules = node.importedModules
  if (deps) for (const depUrl of deps) {
    const dep = await viteDevServer.moduleGraph.getModuleByUrl(depUrl)
    if (!dep) continue
    await findModuleDeps(viteDevServer, dep, visiting, visited)
  }
  for (const depNode of importedModules) {
    await findModuleDeps(viteDevServer, depNode, visiting, visited)
  }
  visiting.delete(node)
  visited.add(node)
}
```

Sequential awaits guarantee post-order DFS: each module is emitted after all its dependencies have finished, and siblings are emitted in source order. Bounded perf hit because each call short-circuits when the node is already in `visiting`/`visited`.

Patch lives at `apps/client/patches/@tanstack__start-plugin-core@1.169.1.patch` in the openagri repo, registered via `pnpm.patchedDependencies` in the root `package.json`.

### 3. Dev per-module `<style>` insertion position (Vite's `updateStyle()`)

This is the patch most relevant to maintainer engagement, and the one that turned out to dominate the user-facing flash even after #2 was applied.

In dev, Vite serves every imported `.css.ts.vanilla.css` (or any CSS file) as a JS module that, when evaluated, calls `updateStyle(id, content)` to inject a `<style data-vite-dev-id>` tag into `<head>`. The current implementation in `vite/dist/client/client.mjs` is:

```js
let lastInsertedStyle
function updateStyle(id, content) {
  if (linkSheetsMap.has(id)) return
  let style = sheetsMap.get(id)
  if (!style) {
    style = document.createElement('style')
    style.setAttribute('type', 'text/css')
    style.setAttribute('data-vite-dev-id', id)
    style.textContent = content
    if (cspNonce) style.setAttribute('nonce', cspNonce)
    if (!lastInsertedStyle) {
      document.head.appendChild(style)                          // ← always at end of <head>
      setTimeout(() => { lastInsertedStyle = void 0 }, 0)
    } else {
      lastInsertedStyle.insertAdjacentElement('afterend', style)
    }
    lastInsertedStyle = style
  } else {
    style.textContent = content
  }
  sheetsMap.set(id, style)
}
```

Key fact: `document.head.appendChild(style)` always lands the new tag at the *end* of `<head>`, **after** the dev-styles `<link data-tanstack-router-dev-styles>` that Start hoists into head via `rootRoute.assets`.

So the runtime sequence on hard refresh is:

1. SSR HTML lands. `<head>` contains the dev-styles `<link>` (with full route-scoped CSS in correct DS-then-consumer order, after patch #2). Initial paint uses the link → consumer rule wins inside the link → **correct paint** (green).
2. Hydration runs. Each imported `.css.ts.vanilla.css` JS module evaluates and calls `updateStyle()`. Per-module DS `<style>` tags get appended to `<head>` *after* the link.
3. The DS dep's per-module `<style>` arrives before the consumer's per-module `<style>` because the consumer module imports the DS module — ESM evaluates deps first. Between those two `<style>` injections, only the DS per-module tag is present *after* the link. For any class the consumer overrode in the link, the DS rule from this fresh per-module tag is now the latest matching source → DS rule wins → **wrong paint** (DS colour).
4. The consumer's per-module `<style>` arrives next, after the DS one. The consumer rule from this newer tag is now the latest matching source → consumer rule wins → **correct paint again** (green).
5. React 19's stylesheet manager removes the dev-styles `<link>` shortly after, since the per-module `<style>` tags now cover the same content.

The flash is the brief window in step 3. In real apps with deeper module graphs it stretches to several hundred milliseconds and is plainly visible to users. In a flat minimal repro on localhost it's sub-frame.

Fix: insert per-module client `<style>` tags *before* the dev-styles link, so the link stays the latest matching source for any class the consumer overrides:

```js
if (!lastInsertedStyle) {
  const tssDevStyles = document.querySelector('link[data-tanstack-router-dev-styles]')
  if (tssDevStyles) document.head.insertBefore(style, tssDevStyles)
  else document.head.appendChild(style)
  setTimeout(() => { lastInsertedStyle = void 0 }, 0)
} else {
  lastInsertedStyle.insertAdjacentElement('afterend', style)
}
lastInsertedStyle = style
```

The chained `insertAdjacentElement('afterend', ...)` branch keeps subsequent same-tick siblings adjacent to the previous client tag — and since the previous tag is positioned before the link, the chain stays before the link too. Per-module client `<style>` tags retain their relative order both within and across batches; only their position relative to the dev-styles link changes.

Patch lives at `apps/client/patches/vite@8.0.10.patch` in the openagri repo.

---

## What this start-basic repo demonstrates

This repo is the minimal reproducer for issue #3 above — the **dev per-module `<style>` insertion position bug**. It also includes the original prod-manifest reproducer (issue #1, now upstream-fixed) as a script.

### Two routes, two purposes

| Route | Purpose | Code shape |
|-------|---------|------------|
| `/` | **Faithful structural repro** — matches the production app's eager-vanilla-extract import pattern exactly. Bug visible in the `[head]` console log; visual flash is sub-frame on localhost. | Eager `import` of DS + consumer CSS. |
| `/amplified` | **Perception amplifier** — defers the consumer CSS via `useEffect` + dynamic `import('./consumer-overrides.css')` so the flash window widens to ~25ms (perceptible). | DS eager, consumer CSS dynamically imported post-mount. |

**Important framing**: `/` is what the bug actually looks like in production code. `/amplified` is a *demonstration aid* that's not faithful to how apps/client is structured — it defers a CSS import via `useEffect` purely to widen the perception window past the sub-frame mark on localhost. The DOM ordering issue is identical between the two routes; only the *gap duration* between DS arrival and consumer arrival differs. Manuel-or-equivalent should read `/`'s console log to confirm the bug exists; `/amplified` is only useful if a perceptible visual is needed for stakeholder buy-in.

### Files

```
src/
├── design-system/
│   ├── panel.{css.ts,ts}    # DS dep — light-blue
│   ├── button.{css.ts,ts}   # DS dep — light-red
│   ├── badge.{css.ts,ts}    # DS dep — amber
│   └── card.{css.ts,ts}     # DS dep — lavender
├── routes/
│   ├── __root.tsx                    # adds the head-mutation observer (dev only)
│   ├── -css-order-bug.css.ts         # vanilla-extract: page styles + consumer overrides (used by /)
│   ├── index.tsx                     # / — eager DS + consumer (faithful)
│   ├── consumer-overrides.css        # plain CSS with hardcoded class names (used by /amplified)
│   ├── -consumer-styles-loader.tsx   # useEffect + dynamic import — perception amplifier
│   └── amplified.tsx                 # /amplified — eager DS + lazy consumer (visible flash)
└── styles/
    └── app.css                       # eager root stylesheet
scripts/
└── repro-manifest-order.mjs          # prod-manifest issue #1 (upstream-fixed)
```

### Layout

Both `routes/index.tsx` (`/`) and `routes/amplified.tsx` (`/amplified`) render the same four sections — panel, button, badge, card — each composing a DS class with the corresponding consumer override class on a single DOM element:

```tsx
<section className={[panelClassName, styles.consumerPanel].join(' ')}>
<button  className={[buttonClassName, styles.consumerButton].join(' ')}>
<span    className={[badgeClassName, styles.consumerBadge].join(' ')}>
<section className={[cardClassName, styles.consumerCard].join(' ')}>
```

Final cascade-correct paint: every section is green. If anything in the cascade misorders DS-vs-consumer, the section will paint with the DS colour (blue / red / amber / purple) until the right `<style>` arrives.

### How to verify the bug

```sh
pnpm install
pnpm dev
```

Open `http://localhost:3000` with the browser console open, then **hard refresh**.

The repo's `__root.tsx` installs a `MutationObserver` on `<head>` in dev that logs every `<link>` / `<style>` addition or removal with a timestamp. A representative trace:

```
[head] initial link /src/styles/app.css 30ms
[head] initial link [dev-styles] /@tanstack-start/styles.css?routes=__root__%2C%2F 31ms
[head] added   style /.../src/design-system/panel.css.ts.vanilla.css 210ms
[head] added   style /.../src/design-system/button.css.ts.vanilla.css 210ms
[head] added   style /.../src/design-system/badge.css.ts.vanilla.css 211ms
[head] added   style /.../src/design-system/card.css.ts.vanilla.css 211ms
[head] added   style /.../src/routes/-css-order-bug.css.ts.vanilla.css 211ms
[head] removed link [dev-styles] /@tanstack-start/styles.css?routes=__root__%2C%2F 228ms
```

Two things to read out of this trace:

1. **Every `style` line is a per-module `<style data-vite-dev-id>` tag inserted *after* the `[dev-styles]` link in DOM order.** That's the structural bug. Between the first DS `<style>` arrival (210ms) and the consumer `<style>` arrival (211ms), the link's consumer rule loses to the just-appended DS rule (latest matching source wins at equal specificity), so the four sections paint with their DS colours during that window.

2. **React 19's stylesheet manager removes the dev-styles `<link>` ~17ms after the per-module styles cover the same content.** From then on, ordering is fully driven by per-module `<style>` insertion order, which is correct (DS-first, consumer-last), so the page settles green. This is why the page doesn't *stay* misordered.

### Why the visual flash isn't reliably perceptible in this repro

The 210ms→211ms gap is **~1ms** — sub-frame on any monitor. Five small CSS modules in a flat import graph all fetch in parallel from the same localhost dev server and their JS evaluations land in the same microtask. No browser will paint a wrong-cascade frame during that 1ms window. Network throttling doesn't help because it slows every fetch equally — the *relative* gap between parallel fetches stays small.

This is a property of the repro size, not the bug. In a real-world app the gap stretches to hundreds of milliseconds because the consumer module sits behind several import-graph hops the DS dep doesn't have. In one production app (openagri's `apps/client`) the measured gap is **~600ms** on a normal hard refresh — plainly visible to users. The user-visible flash there motivated this entire investigation.

### What this repro does NOT do

- It does not use artificial timers, `setTimeout`, or any code-level delays. The trace above is from eager imports of vanilla-extract modules, exactly mirroring the production app's import structure.
- It does not visually demonstrate the flash on localhost without throttling. The structural trace is the canonical evidence; the visual flash scales with import-graph depth and is properly observable in larger apps.

If you need to *see* the flash visually:

1. **Read the trace** above (head order is the structural proof, independent of perception).
2. **Run a non-trivial app** with several route layouts and a route-leaf consumer override against unpatched Vite.
3. **Apply the patch** to `dist/client/client.mjs` `updateStyle()` (suggested fix below) and watch the trace flip — `<style data-vite-dev-id>` tags now land *before* the dev-styles link, which is the correct DOM order.

---

## React 19 `data-precedence` doesn't fix this

Both the eager root `<link>` (`app.css`) and the dev-styles `<link>` get auto-tagged `data-precedence="default"` by React 19's stylesheet management when rendered through `<HeadContent />`. That manages stylesheet ordering *within* the React-managed group but doesn't reorder Vite's runtime `appendChild` calls — those still land at the end of `<head>`, after the precedence-managed group. So the bug exists regardless of whether precedence is set; the fix has to be in Vite's `updateStyle()`.

---

## Suggested upstream fix in Vite

Modify the first-insertion branch of `updateStyle()` in `vite/dist/client/client.mjs`:

```js
if (!lastInsertedStyle) {
  const tssDevStyles = document.querySelector('link[data-tanstack-router-dev-styles]')
  if (tssDevStyles) document.head.insertBefore(style, tssDevStyles)
  else document.head.appendChild(style)
  setTimeout(() => { lastInsertedStyle = void 0 }, 0)
} else {
  lastInsertedStyle.insertAdjacentElement('afterend', style)
}
lastInsertedStyle = style
```

The `tssDevStyles` lookup is TanStack-Start-specific; a more general fix would discover any `<link rel="stylesheet">` that wraps "global content" the per-module tags should sit before. Either way, the relative order *between* per-module tags is preserved by the existing `insertAdjacentElement('afterend', ...)` chain — only their position relative to the framework-injected link changes.

The applied patch in openagri lives at `apps/client/patches/vite@8.0.10.patch`.

---

## Reproduction history (what we tried, what worked)

- **Eager-only vanilla-extract** (current state of this repo): structurally exhibits the bug (head trace), sub-frame visual flash on localhost. Faithful to apps/client structure.
- **Network throttling** (DevTools → Slow 4G + Disable cache): does not amplify the relative gap because parallel fetches are slowed equally. Useful in apps with depth, not in flat repros.
- **CPU throttling** (DevTools → Performance → 4× slowdown): widens the gap by slowing JS evaluation. Helps perception but still depends on graph depth.
- **`useEffect` + dynamic `import('./consumer-overrides.css')`**: produces a ~26ms gap reliably on localhost — visible to careful observation. Tried and rejected as the canonical repro because it doesn't match the production app's code (the production app uses eager imports throughout); kept as a note here for completeness.
- **Multiple chained `React.lazy` boundaries**: tried as a "more depth, less contrivance" alternative to the `useEffect` pattern. Vite preloads through the chain, gap stays around 30ms.
- **Adding `@base-ui/react` and other heavy deps**: not pursued. Increases bundle size and module count but doesn't directly widen the DS-vs-consumer relative timing — that gap is set by import-graph depth, not bundle weight.

---

## Sharing with maintainers

When opening a bug ticket against `@tanstack/react-start` or `vite`, lead with:

1. **The head-order trace from this repo** as structural proof. It's unambiguous: per-module `<style data-vite-dev-id>` tags land after `<link data-tanstack-router-dev-styles>`, which is the wrong DOM order for a stylesheet that's supposed to cover them.
2. **The screen recording from the production app** (apps/client) as user-visible evidence at scale. Localhost minimal repros can demonstrate the bug structurally but not always perceptibly — the perceptible flash needs real-world graph depth.
3. **The one-line patch suggestion** (`appendChild` → `insertBefore(linkRef)`). Diff is minimal, the relative order between per-module tags is preserved, and the change has no measurable cost.

---

## Verification (with patches applied)

After applying the dev-styles plugin patch (#2) and the Vite client patch (#3) to your project:

- Network tab → response of `/@tanstack-start/styles.css?routes=...`: comment headers in the response should show DS component CSS (e.g. `combobox.css.ts.vanilla.css`) before consumer CSS that overrides it (e.g. `farm-year-select.css.ts.vanilla.css`). This confirms patch #2.
- Elements panel → `<head>` after hydration: the `<link data-tanstack-router-dev-styles>` should be the *last* stylesheet element. Per-module `<style data-vite-dev-id>` tags should be *before* it. This confirms patch #3.
- Hard refresh: trigger / panel / etc. stays at its final colour the whole way through. No flash.

Restart the dev server after changing patches — `pnpm install` updates files on disk, but Vite caches the plugin in memory.

---

## Upgrade notes

**`@tanstack/start-plugin-core`** — when bumping past 1.169.1, copy the patched pattern (sequential `for...of await` in both `findModuleDeps` and `collectDevStyles`'s top-level `entries` loop) onto the new version's `dev-styles.js`. Regenerate the patch with `diff -u`, rename the file to the new version, update the version key in `package.json`, run `pnpm install`, restart dev.

**`vite`** — when bumping, check that `dist/client/client.mjs` still has the `updateStyle()` shape with `lastInsertedStyle` + `appendChild` for the first-insertion branch. Replace that `appendChild` with the `link[data-tanstack-router-dev-styles]` lookup + `insertBefore` fallback. Regenerate via `diff -u`, rename the patch file to the new version, update the version key. If the surrounding code restructures, re-derive the same intent: per-module client tags must end up before the TSS dev-styles link.
