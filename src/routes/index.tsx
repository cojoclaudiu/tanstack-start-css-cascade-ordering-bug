import { createFileRoute } from '@tanstack/react-router'
import { panelClassName } from '../design-system/panel'
import * as styles from './-css-order-bug.css'

export const Route = createFileRoute('/')({
  component: CssOrderBugPage,
})

function CssOrderBugPage() {
  return (
    <main className={styles.page}>
      <div>
        <h3>CSS Cascade Ordering Repro</h3>
        <p>
          This section composes a design-system class with a route-local override at
          equal specificity.
        </p>
      </div>
      <section className={[panelClassName, styles.consumerOverride].join(' ')}>
        <strong>Expected final appearance</strong>
        <p>Green background and dark green text.</p>
      </section>
    </main>
  )
}
