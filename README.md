# TanStack Start - Basic Example

This is the basic TanStack Start example, demonstrating the fundamentals of building applications with TanStack Router and TanStack Start.

- [TanStack Router Docs](https://tanstack.com/router)

It's deployed automagically with Netlify!

- [Netlify](https://netlify.com/)

## Start a new project based on this example

To start a new project based on this example, run:

```sh
npx gitpick TanStack/router/tree/main/examples/react/start-basic start-basic
```

## Getting Started

From your terminal:

```sh
pnpm install
pnpm dev
```

This starts your app in development mode, rebuilding assets on file changes.

## Build

To build the app for production:

```sh
pnpm build
```

## Reproduce The TanStack Start CSS Ordering Bug

This repo demonstrates the CSS cascade ordering issue in two places:

1. **Prod (manifest builder)** — already covered by the `repro:manifest-order` script below. **Landed upstream in `@tanstack/start-plugin-core@1.169.1`**, so this only reproduces on older versions.
2. **Dev (per-module `<style>` insertion position)** — visible via `pnpm dev` + DevTools, described below.

### 1) Prod — manifest builder

```sh
pnpm install
pnpm repro:manifest-order
```

Expected output on buggy versions:

```txt
Route CSS asset order: /assets/field-detail-panel.css -> /assets/tabs.css
Bug reproduced: consumer CSS is emitted before dependency CSS.
Expected fixed order: /assets/tabs.css -> /assets/field-detail-panel.css
```

The script calls the installed `buildStartManifest` with a synthetic chunk graph where:

- `field-detail-panel.css` is the consumer chunk's own CSS
- `tabs.css` comes from an imported dependency chunk

If the manifest builder is buggy, it emits own CSS before imported CSS. The fix lives in `getChunkCssAssets` upstream.

### 2) Dev — per-module `<style>` insertion position

Two routes, same bug, two ways to observe it:

| Route | Purpose | Code shape |
|-------|---------|------------|
| `/` | **Faithful structural repro** — matches the production app's eager-vanilla-extract import pattern exactly. Bug visible in the `[head]` console log on hard refresh; visual flash is sub-frame on localhost. | Eager `import` of DS + consumer CSS. |
| `/amplified` | **Perception amplifier** — defers the consumer CSS via `useEffect` + dynamic `import('./consumer-overrides.css')` so the flash window widens to ~25ms (perceptible). | DS eager, consumer CSS dynamically imported post-mount. |

The faithful route mirrors apps/client; the amplified route is *for visual demonstration only* and is **not** how the production app is structured. See [`docs/CSS-CASCADE-ORDERING-BUG.md`](docs/CSS-CASCADE-ORDERING-BUG.md) for the full rationale on the trade-off.

Both routes render the same four DS components composed with consumer overrides at equal specificity. Each section reaches its final green paint only after the consumer's `<style>` has been appended to `<head>` — until then, that section's DS rule (blue / red / amber / purple respectively) is the most recent matching source and wins the cascade.

```tsx
import { panelClassName } from '../design-system/panel'   // DS deps
import { buttonClassName } from '../design-system/button'
import { badgeClassName }  from '../design-system/badge'
import { cardClassName }   from '../design-system/card'
import * as styles from './-css-order-bug.css'            // consumer overrides (faithful route)

<section className={[panelClassName, styles.consumerPanel].join(' ')}> … </section>
<button  className={[buttonClassName, styles.consumerButton].join(' ')}> … </button>
<span    className={[badgeClassName,  styles.consumerBadge].join(' ')}>  … </span>
<section className={[cardClassName,   styles.consumerCard].join(' ')}>   … </section>
```

#### Run

```sh
pnpm install
pnpm dev
```

Open `http://localhost:3000/` (faithful) or `http://localhost:3000/amplified` (visible flash) with the browser console open, then hard refresh.

#### Why the cascade flips during hydration

The dev-styles `<link>` injected by Start at `/@tanstack-start/styles.css?routes=...` contains all five vanilla-extract sources concatenated in correct DS-then-consumer order — you can verify with `curl 'http://localhost:3000/@tanstack-start/styles.css?routes=__root__%2C%2F'`. **But** Vite's client runtime (`dist/client/client.mjs`, `updateStyle()`) appends every per-module `<style data-vite-dev-id>` tag to the end of `<head>` via `document.head.appendChild`. Those tags land *after* the dev-styles `<link>` in DOM order, so for any class the per-module tag re-defines, the per-module tag is the latest matching source and overrides the link.

The consumer module imports the DS module, so the DS `<style>` always lands first, and the consumer `<style>` lands later. Between those two appends, the cascade for that section is "DS rule wins via the per-module style tag" — even though the link content was correct. Once the consumer's `<style>` appends, the consumer rule is once again the latest, and the section settles to green.

#### Confirming the order

This repo's `__root.tsx` installs a `MutationObserver` on `<head>` in dev that logs every `<link>` / `<style>` addition or removal with a timestamp. Hard refresh with the browser console open. A representative trace from this repo:

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

Two things are visible here:

1. Each `style` line is a Vite per-module `<style data-vite-dev-id>` tag inserted *after* the `[dev-styles] /@tanstack-start/styles.css?...` link in DOM order — that's the structural bug. From the moment the first DS `<style>` lands until the consumer `<style>` lands, the link's consumer rule loses to the just-appended DS rule (latest matching source wins at equal specificity), so the four sections paint with their DS colours during that window.

2. After ~17ms (228 – 211 in the trace above), React 19's stylesheet manager removes the dev-styles `<link>` because the per-module `<style>` tags now cover the same content. From then on, ordering is fully driven by the per-module `<style>` insertion order — which is correct (DS-first, consumer-last), so the page settles green.

**Why the visual flash isn't perceptible in this repro.** The gap between the first DS `<style>` (210ms) and the consumer `<style>` (211ms) is **~1ms** — a single sub-frame interval. Five small CSS modules in a flat import graph all fetch in parallel from localhost (same dev server, same worker), so the browser receives them and Vite evaluates them in the same JS microtask. No browser (Chrome, Firefox, Safari) will ever paint a frame in the 1ms window where the cascade is wrong.

This is a property of the repro size + locality, not the bug. **The bug is structurally present and observable in the head-order trace above** — that trace is the proof of the cascade order issue, independent of whether any frame visibly flickered.

In a real-world app the gap stretches to hundreds of milliseconds and the flash becomes plainly visible. The reason is graph depth, not a timing trick. Consumers are leaf modules deep inside route trees; the DS deps they import sit closer to the root (rendered in parent layouts, shared across siblings, first-paint-critical). On a hard refresh, the DS dep's `<style>` lands long before the consumer's `<style>` because the consumer module is several import-graph hops further than the DS dep. In one production app we measured ~600ms between the DS `<style>` arrival and the consumer `<style>` arrival on a normal hard refresh — visible enough that users reported the flash.

Network throttling (DevTools → Network → Slow 4G + Disable cache) does **not** reliably reproduce the flash in *this* repro — it slows every fetch equally, so the relative gap between the parallel CSS module fetches stays small. Throttling helps in apps where the import graph already has depth; in a flat 5-file repro it just delays everything together.

If you want to see the flash visually, you have three options, in increasing order of effort:

1. **Read the head-order trace** in this repo (above). For confirming the bug exists at all, that's the canonical signal — Manuel can verify the structural ordering issue from this minimal repro without needing to perceive any frame.

2. **Run the buggy version against a non-trivial app**. Any app with several route layouts, a moderately sized DS, and at least one route-leaf consumer override will exhibit the flash on hard refresh in unpatched Vite. The flash window scales with import-graph depth, and a flat repro can't reproduce that without artificial code.

3. **Apply the patch and observe disappearance**. Patch `dist/client/client.mjs` `updateStyle()` (suggested fix below) so the per-module `<style>` tags insert *before* the dev-styles `<link>` instead of after. In any app where the bug was visible, the flash goes away. Even in this minimal repro the head-order trace then shows `<style data-vite-dev-id>` tags landing before the dev-styles link — the cascade-correct DOM order.

A second cross-check via the Elements panel: while loading, the order under `<head>` reads top-to-bottom as `<link>` (precedence-managed app.css), `<link data-tanstack-router-dev-styles>`, then a sequence of `<style data-vite-dev-id>` tags. Click any section and watch the computed `background-color`: in unpatched Vite it transitions from the DS hex to `#dcfce7` (consumer green) when the matching consumer `<style>` is added — even if the transition is sub-frame in this minimal repro, you can pause execution before the consumer style lands and see the wrong background.

#### Suggested fix

In `dist/client/client.mjs` `updateStyle()`, look up the dev-styles link and `insertBefore` it instead of `appendChild`:

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

The `insertAdjacentElement('afterend', ...)` chain still keeps subsequent same-tick siblings adjacent to the previous client tag, and since the previous tag is positioned before the link, the chain stays before the link too. So per-module client `<style>` tags retain their relative order both within and across batches; only their position relative to the link changes — and that's the position that lets the link stay the latest matching source for any class the consumer overrides, restoring the correct cascade regardless of per-module arrival timing.
