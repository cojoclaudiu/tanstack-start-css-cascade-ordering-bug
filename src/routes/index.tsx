import { createFileRoute } from '@tanstack/react-router'
import { panelClassName } from '../design-system/panel'
import { buttonClassName } from '../design-system/button'
import { badgeClassName } from '../design-system/badge'
import { cardClassName } from '../design-system/card'
import * as styles from './-css-order-bug.css'

// `/` — faithful reproduction of the production app's import
// pattern: eager vanilla-extract for both DS components and the
// consumer override on this route. Same code shape as
// apps/client/src/features/farm-year-select (DS combobox + consumer
// farm-year-select override).
//
// On hard refresh, the bug shows up STRUCTURALLY in the head-order
// trace (open the browser console — `__root.tsx` installs a
// MutationObserver in dev). Per-module `<style data-vite-dev-id>`
// tags land in `<head>` AFTER the dev-styles `<link>`, which is the
// wrong DOM order: at equal specificity the per-module DS style
// briefly overrides the link's consumer rule, until the consumer's
// own per-module style arrives.
//
// In a flat repro on localhost the gap between DS arrival and
// consumer arrival is sub-frame, so the visual flash isn't
// perceptible. For a perceptible visual demonstration see
// `/amplified`. For the full investigation see
// `docs/CSS-CASCADE-ORDERING-BUG.md`.
export const Route = createFileRoute('/')({
  component: CssOrderBugPage,
})

function CssOrderBugPage() {
  return (
    <main className={styles.page}>
      <div>
        <h3>CSS Cascade Ordering Repro — Faithful (structural)</h3>
        <p>
          Each section composes a design-system class with a route-local override at
          equal specificity. Final paint should be green for every section.
        </p>
        <p>
          Open the browser console and hard refresh. The <code>[head]</code> log
          shows every <code>&lt;link&gt;</code> / <code>&lt;style&gt;</code>{' '}
          insertion or removal — that&rsquo;s the structural proof of the cascade
          ordering bug, independent of whether any frame visibly flickered.
        </p>
        <p>
          Want to <em>see</em> the flash visually? Visit{' '}
          <a href="/amplified">/amplified</a> — same DOM ordering bug, but the
          consumer CSS is loaded via a deferred dynamic import so the gap widens
          to ~25ms (perceptible).
        </p>
      </div>

      <section className={[panelClassName, styles.consumerPanel].join(' ')}>
        <strong>panel</strong>
        <p>DS: light-blue, dark-blue text. Consumer: green / dark-green.</p>
      </section>

      <button type="button" className={[buttonClassName, styles.consumerButton].join(' ')}>
        button — DS red / consumer green
      </button>

      <span className={[badgeClassName, styles.consumerBadge].join(' ')}>
        badge — DS amber / consumer green
      </span>

      <section className={[cardClassName, styles.consumerCard].join(' ')}>
        <strong>card</strong>
        <p>DS: lavender, dark-purple text. Consumer: green / dark-green.</p>
      </section>
    </main>
  )
}
