// Single place to register GSAP plugins. Import gsap from here, never from 'gsap'
// directly, so plugins are always registered before use.
//
// ScrollSmoother is deliberately NOT registered: Lenis owns smooth scrolling.
// Running both would smooth the page twice (double scrolling).
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(ScrollTrigger, useGSAP)

/**
 * Reduced-motion contract for every GSAP animation in this project:
 *
 *   useGSAP(() => {
 *     const mm = gsap.matchMedia()
 *     mm.add(MOTION_OK, () => { gsap.to(...)  /* scroll / entrance animations *\/ })
 *     return () => mm.revert()
 *   })
 *
 * Inside MOTION_OK the animation runs; when the user has reduced motion on (or switches
 * it on while the page is open) gsap reverts every tween and ScrollTrigger created there,
 * so elements sit in their natural, static, fully visible CSS state.
 * Rule: the un-animated CSS state must always be the finished, readable layout.
 */
const forceReduced =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('reduced-motion')

// With ?reduced-motion (testing aid, see useReducedMotion) use a query that never matches.
export const MOTION_OK = forceReduced
  ? '(max-width: 0px)'
  : '(prefers-reduced-motion: no-preference)'

export { gsap, ScrollTrigger, useGSAP }
