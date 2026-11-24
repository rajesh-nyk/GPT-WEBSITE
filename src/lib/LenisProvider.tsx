import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import Lenis from 'lenis'
import { gsap, ScrollTrigger } from './gsap'
import { useReducedMotion } from './useReducedMotion'
import { scrollHold, trimDelta } from '../components/world/scrollHold'

/**
 * Lenis + GSAP ScrollTrigger, wired so there is exactly ONE scroll owner and ONE rAF loop:
 *
 * 1. Lenis smooths the *native* window scroll (no transformed wrapper), so ScrollTrigger
 *    keeps using the real window scroll position — no scrollerProxy needed.
 * 2. `autoRaf: false` + gsap.ticker drives lenis.raf(), so Lenis and every GSAP tween /
 *    ScrollTrigger update in the same frame instead of two competing rAF loops.
 * 3. lenis.on('scroll', ScrollTrigger.update) keeps triggers in sync with the smoothed position.
 * 4. lagSmoothing(0) stops GSAP from "catching up" after a slow frame, which would make
 *    the scroll position jump.
 * 5. ScrollSmoother is not registered (see lib/gsap.ts), so nothing smooths twice.
 *
 * With prefers-reduced-motion, Lenis is not created at all: native scrolling, no inertia.
 * ScrollTrigger still works on native scroll, and individual animations decide their own
 * reduced-motion fallback.
 */

const LenisContext = createContext<Lenis | null>(null)

/** The Lenis instance, or null when smoothing is off (reduced motion). */
export const useLenis = () => useContext(LenisContext)

export function LenisProvider({ children }: { children: ReactNode }) {
  const reducedMotion = useReducedMotion()
  const [lenis, setLenis] = useState<Lenis | null>(null)

  useEffect(() => {
    if (reducedMotion) return

    const instance = new Lenis({
      autoRaf: false,
      lerp: 0.1, // inertia: lower = floatier. 0.1 is responsive on touch and trackpad.
      // Lenis's own `anchors` option scrolls but leaves keyboard focus behind, which
      // breaks skip links. In-page links are handled by onAnchorClick below instead.
      anchors: false,
      // Touch scrolling goes through Lenis too, so the scroll hold (world/scrollHold.ts)
      // shapes it exactly like wheel scrolling instead of fighting native momentum.
      syncTouch: true,
      virtualScroll: (data) => {
        trimDelta(data, instance.targetScroll)
        return true
      },
    })

    instance.on('scroll', ScrollTrigger.update)
    const tick = (time: number) => instance.raf(time * 1000) // gsap time is in seconds
    // Prioritised: Lenis moves the scroll FIRST in every frame, before any other ticker
    // callback reads it (page 3's tick reads positions after this — no 1-frame lag).
    gsap.ticker.add(tick, false, true)
    gsap.ticker.lagSmoothing(0)
    setLenis(instance)
    if (import.meta.env.DEV) (window as unknown as { __lenis?: Lenis }).__lenis = instance // QA hook

    // Same-page #links: smooth-scroll with Lenis AND move focus to the target, so the
    // next Tab continues from there (what the browser does natively for anchor jumps).
    const onAnchorClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href^="#"]')
      const id = link?.hash.slice(1)
      const target = id ? document.getElementById(decodeURIComponent(id)) : null
      if (!link || !target) return
      event.preventDefault()
      if (!target.hasAttribute('tabindex') && !target.matches('a[href],button,input,select,textarea')) {
        target.setAttribute('tabindex', '-1')
      }
      target.focus({ preventScroll: true })
      scrollHold.bypass = true // a deliberate jump: never hold it back
      instance.scrollTo(target)
      history.replaceState(null, '', link.hash)
    }
    document.addEventListener('click', onAnchorClick)

    return () => {
      document.removeEventListener('click', onAnchorClick)
      gsap.ticker.remove(tick)
      gsap.ticker.lagSmoothing(500, 33) // GSAP default
      instance.destroy()
      setLenis(null)
    }
  }, [reducedMotion])

  return <LenisContext.Provider value={lenis}>{children}</LenisContext.Provider>
}
