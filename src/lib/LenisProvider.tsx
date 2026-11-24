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

export function LenisProvider({ children, paced = false }: { children: ReactNode; paced?: boolean }) {
  const reducedMotion = useReducedMotion()
  const [lenis, setLenis] = useState<Lenis | null>(null)

  useEffect(() => {
    if (reducedMotion) return

    // Pacing applies to real page position, not just to the animation. Fast
    // gestures queue a destination, while the GSAP clock moves at a fixed cap.
    let position = window.scrollY
    let goal = position
    let velocity = 0
    let lastTime = 0
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
        if (paced) {
          if (data.event.type === 'wheel' && (data.event as WheelEvent).ctrlKey) return true
          if (Math.abs(data.deltaX) > Math.abs(data.deltaY)) return true
          if (data.event.cancelable) data.event.preventDefault()
          if (!instance.isStopped && data.event.type !== 'touchend') {
            goal = Math.max(0, Math.min(instance.limit, goal + data.deltaY))
          }
          return false
        }
        trimDelta(data, instance.targetScroll)
        return true
      },
    })

    instance.on('scroll', ScrollTrigger.update)
    const tick = (time: number) => {
      if (!paced) { instance.raf(time * 1000); return }
      const dt = lastTime ? Math.min(0.033, Math.max(0, time - lastTime)) : 0
      lastTime = time
      if (instance.isStopped || !document.documentElement.hasAttribute('data-site-ready')) {
        position = goal = window.scrollY
        velocity = 0
        return
      }
      const limit = instance.limit
      goal = Math.max(0, Math.min(limit, goal))
      // The only source of motion: about 3.6 seconds at the cap for a full hero exit.
      // Input speed cannot change the maximum rate, in either direction.
      const span = document.getElementById('hero')?.offsetHeight || window.innerHeight
      const maxSpeed = span / 3.6
      const accel = maxSpeed * 3
      const gap = goal - position
      if (Math.abs(gap) < 0.5 && Math.abs(velocity) < 2) {
        if (Math.abs(window.scrollY - goal) > 2) goal = window.scrollY
        position = goal
        velocity = 0
        return
      }
      const desired = Math.sign(gap) * Math.min(maxSpeed, Math.sqrt(2 * accel * Math.abs(gap)))
      velocity += Math.max(-accel * dt, Math.min(accel * dt, desired - velocity))
      const step = velocity * dt
      if (Math.sign(step) === Math.sign(gap) && Math.abs(step) >= Math.abs(gap)) {
        position = goal
        velocity = 0
      } else position = Math.max(0, Math.min(limit, position + step))
      instance.scrollTo(position, { immediate: true, force: true })
    } // gsap time is in seconds
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
      if (paced) goal = Math.max(0, Math.min(instance.limit, target.getBoundingClientRect().top + window.scrollY))
      else {
        scrollHold.bypass = true
        instance.scrollTo(target)
      }
      history.replaceState(null, '', link.hash)
    }
    document.addEventListener('click', onAnchorClick)
    const onKey = (event: KeyboardEvent) => {
      if (!paced || instance.isStopped || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
      if (event.target instanceof Element && event.target.closest('input,textarea,select,button,[contenteditable="true"]')) return
      const h = window.innerHeight
      const delta = event.key === 'ArrowDown' ? 55 : event.key === 'ArrowUp' ? -55
        : event.key === 'PageDown' ? h : event.key === 'PageUp' ? -h
        : event.key === ' ' ? (event.shiftKey ? -h : h)
        : event.key === 'End' ? instance.limit : event.key === 'Home' ? -instance.limit : 0
      if (!delta) return
      event.preventDefault()
      goal = Math.max(0, Math.min(instance.limit, goal + delta))
    }
    if (paced) {
      document.documentElement.classList.add('cinematic-scroll')
      window.addEventListener('keydown', onKey)
    }

    return () => {
      document.removeEventListener('click', onAnchorClick)
      document.documentElement.classList.remove('cinematic-scroll')
      window.removeEventListener('keydown', onKey)
      gsap.ticker.remove(tick)
      gsap.ticker.lagSmoothing(500, 33) // GSAP default
      instance.destroy()
      setLenis(null)
    }
  }, [reducedMotion, paced])

  return <LenisContext.Provider value={lenis}>{children}</LenisContext.Provider>
}
