import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

// Testing aid: add ?reduced-motion to the URL to force the JS reduced-motion path
// (Lenis off, GSAP/3D motion off) without changing OS settings — handy on a phone.
// CSS @media rules still follow the real OS setting.
const forced =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('reduced-motion')

function subscribe(cb: () => void) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', cb)
  return () => mql.removeEventListener('change', cb)
}

/** Live value of prefers-reduced-motion; updates if the user toggles the OS setting. */
export function useReducedMotion() {
  return useSyncExternalStore(
    subscribe,
    () => forced || window.matchMedia(QUERY).matches,
    () => false,
  )
}
