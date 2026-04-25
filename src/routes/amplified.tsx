import { createFileRoute } from '@tanstack/react-router'
import { panelClassName } from '../design-system/panel'
import { buttonClassName } from '../design-system/button'
import { badgeClassName } from '../design-system/badge'
import { cardClassName } from '../design-system/card'
import * as styles from './-css-order-bug.css'
import ConsumerStylesLoader from './-consumer-styles-loader'

// `/amplified` — perception amplifier for the dev-mode cascade
// flash. Identical visual layout to `/`, but the consumer override
// classes are HARDCODED PLAIN CSS class names (`.consumer-panel`
// etc.) loaded via a deferred dynamic import in
// `<ConsumerStylesLoader />`. That puts the consumer style
// injection behind a real Vite dev-server fetch wave that lands
// after first paint, widening the structural sub-frame flash on
// localhost into a perceptible ~25ms window.
//
// This route is for VISUAL DEMONSTRATION ONLY — see
// `docs/CSS-CASCADE-ORDERING-BUG.md` for what's contrived here vs
// faithful to the production app.
export const Route = createFileRoute('/amplified')({
  component: AmplifiedRepro,
})

function AmplifiedRepro() {
  return (
    <main className={styles.page}>
      <div>
        <h3>CSS Cascade Ordering Repro — Amplified (visible flash)</h3>
        <p>
          This route is identical to <code>/</code> but the consumer override CSS
          loads via a deferred dynamic import. On hard refresh you should see the
          four sections paint briefly with their DS rule (blue / red / amber /
          purple) before the consumer rule lands and they settle to green.
        </p>
        <p>
          The faithful structural reproduction is at <a href="/">/</a> — same DOM
          ordering bug, but the gap is sub-frame on localhost so the visible flash
          isn't perceptible without throttling. Read the head-order trace in the
          console for the structural proof.
        </p>
      </div>

      <section className={`${panelClassName} consumer-panel`}>
        <strong>panel</strong>
        <p>DS: light-blue, dark-blue text. Consumer: green / dark-green.</p>
      </section>

      <button type="button" className={`${buttonClassName} consumer-button`}>
        button — DS red / consumer green
      </button>

      <span className={`${badgeClassName} consumer-badge`}>
        badge — DS amber / consumer green
      </span>

      <section className={`${cardClassName} consumer-card`}>
        <strong>card</strong>
        <p>DS: lavender, dark-purple text. Consumer: green / dark-green.</p>
      </section>

      <ConsumerStylesLoader />
    </main>
  )
}
