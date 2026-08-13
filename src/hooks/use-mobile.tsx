"use client";

import * as React from "react"

const MOBILE_BREAKPOINT = 768
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

/**
 * Viewport-width hook backed by useSyncExternalStore.
 *
 * matchMedia IS an external store, so this is what the primitive is for. The
 * previous version seeded state with a setState called synchronously inside an
 * effect, which renders once with the wrong value and then immediately again
 * with the right one — a cascading render that react-hooks/set-state-in-effect
 * flags (it became an error when eslint-plugin-react-hooks was upgraded).
 *
 * Subscribing this way also removes the tearing window: there is no frame where
 * React's view of the viewport disagrees with the browser's.
 *
 * getServerSnapshot returns false so SSR renders the desktop layout, matching
 * the previous `!!isMobile` behaviour when state was still undefined.
 */
function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

export function useIsMobile(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false
  )
}
