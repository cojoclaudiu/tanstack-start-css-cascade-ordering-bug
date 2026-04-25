/// <reference types="vite/client" />
import {
  ErrorComponent,
  HeadContent,
  Scripts,
  createRootRoute,
  useMatch,
  useRouter,
} from '@tanstack/react-router'
import * as React from 'react'
import appCss from '~/styles/app.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      { title: 'TanStack Start CSS Ordering Repro' },
      {
        name: 'description',
        content: 'Minimal reproduction for TanStack Start stylesheet ordering.',
      },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  errorComponent: RootErrorBoundary,
  notFoundComponent: () => <p>Not found.</p>,
  shellComponent: RootDocument,
})

// Observable for the dev-time CSS ordering bug. Set up a
// MutationObserver in <head> so every <link>/<style> insertion or
// removal lands in the console with a timestamp. Hard refresh in dev
// and read the log to see exactly when Vite's per-module `<style
// data-vite-dev-id>` tags arrive relative to the dev-styles
// `<link data-tanstack-router-dev-styles>`. The bug shows as
// `<style>` insertions landing AFTER the dev-styles link in DOM
// order — the latest matching rule wins, so the DS dep `<style>`
// briefly overrides the consumer rule from the link until the
// consumer's own `<style>` appends after it. No-ops in production
// (`import.meta.env.DEV` is statically false).
const DEV_HEAD_OBSERVER = `
(function () {
  if (typeof document === 'undefined') return;
  var label = function (kind, node) {
    if (!(node instanceof Element)) return;
    var tag = node.tagName.toLowerCase();
    var devId = node.getAttribute('data-vite-dev-id');
    var devStyles = node.getAttribute('data-tanstack-router-dev-styles');
    var href = node.getAttribute('href');
    var id = devId || (devStyles ? '[dev-styles] ' + href : href || '');
    if (tag !== 'link' && tag !== 'style') return;
    console.log('[head]', kind, tag, id, performance.now().toFixed(0) + 'ms');
  };
  for (var i = 0; i < document.head.children.length; i++) {
    label('initial', document.head.children[i]);
  }
  new MutationObserver(function (mutations) {
    for (var m = 0; m < mutations.length; m++) {
      var mut = mutations[m];
      for (var a = 0; a < mut.addedNodes.length; a++) label('added', mut.addedNodes[a]);
      for (var r = 0; r < mut.removedNodes.length; r++) label('removed', mut.removedNodes[r]);
    }
  }).observe(document.head, { childList: true });
})();
`

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <head>
        <HeadContent />
        {import.meta.env.DEV ? (
          <script dangerouslySetInnerHTML={{ __html: DEV_HEAD_OBSERVER }} />
        ) : null}
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function RootErrorBoundary({ error }: { error: unknown }) {
  const router = useRouter()
  const isRoot = useMatch({
    strict: false,
    select: (state) => state.id === '__root__',
  })

  console.error('Route error:', error)

  return (
    <div>
      <ErrorComponent error={error} />
      <div>
        <button
          onClick={() => {
            router.invalidate()
          }}
        >
          Try Again
        </button>
        <button
          onClick={() => {
            if (isRoot) {
              window.location.href = '/'
              return
            }
            window.history.back()
          }}
        >
          {isRoot ? 'Home' : 'Go Back'}
        </button>
      </div>
    </div>
  )
}
