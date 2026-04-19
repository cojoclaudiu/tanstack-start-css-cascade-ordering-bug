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

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <head>
        <HeadContent />
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
