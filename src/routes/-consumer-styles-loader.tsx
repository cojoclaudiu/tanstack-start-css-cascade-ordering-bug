// Perception amplifier for the dev-mode CSS cascade flash.
//
// In a small localhost repro, all CSS modules fetch in parallel
// from the same dev server and arrive within ~1ms of each other —
// sub-frame, no browser ever paints a wrong-cascade frame. The
// structural bug is still there (per-module `<style data-vite-dev-id>`
// tags land after `<link data-tanstack-router-dev-styles>` in DOM),
// but the user-facing visual flash isn't perceptible.
//
// To make the flash perceptible without an artificial timer or
// network throttling, this component defers the consumer CSS
// injection into a post-mount `useEffect` and dynamically imports
// `consumer-overrides.css`. That puts the consumer module behind a
// real Vite dev-server fetch wave that the browser can't preload
// through the static import graph, widening the gap between the
// eager DS `<style>` tags and the consumer `<style>` tag to ~25ms
// on localhost — large enough to perceive a colour flash on hard
// refresh.
//
// IMPORTANT: this is NOT how the production app structures its
// imports. apps/client uses eager vanilla-extract throughout, with
// no `useEffect`-based deferral. The flash there comes from the
// natural depth of nested route layouts (the consumer module sits
// several import-graph hops deeper than the DS deps it overrides).
// This loader is a *perception amplifier* for the bug, not a
// reproduction of the import pattern that triggers it in production.
//
// The faithful eager-only structure lives in `routes/index.tsx` at
// `/` — the head-order trace there proves the bug exists at the
// structural level even when the visual flash is sub-frame.
import { useEffect } from 'react'

export default function ConsumerStylesLoader() {
  useEffect(() => {
    void import('./consumer-overrides.css')
  }, [])
  return null
}
