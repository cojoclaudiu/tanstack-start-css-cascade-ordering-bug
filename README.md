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

This repo includes a minimal manifest-level reproduction of the CSS cascade ordering bug in `@tanstack/start-plugin-core`.

Run:

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

The script calls the installed `buildStartManifest` implementation with a synthetic chunk graph where:

- `field-detail-panel.css` is the consumer chunk's own CSS
- `tabs.css` comes from an imported dependency chunk

If the manifest builder is buggy, it emits own CSS before imported CSS. If TanStack fixes the bug upstream, the same script will instead report that dependency CSS is emitted first.
