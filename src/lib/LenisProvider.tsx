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

    // Virtual chapter navigation: input selects a scene, then a critically
    // damped spring drives the real document position through Lenis.
    // Existing ScrollTriggers and 3D transforms therefore share one clock.
    let position = window.scrollY
    let goal = position
    let velocity = 0
    let lastTime = 0
    let gestureTotal = 0
    let gestureDirection = 0
    let gestureConsumed = false
    let lastGestureAt = -Infinity
    let stops: number[] = [0]
    let chapter = 0

    const refreshStops = () => {
      const limit = instance.limit
      const scrollY = window.scrollY
      const points = Array.from(document.querySelectorAll<HTMLElement>('[data-scroll-scene]'))
        .map(el => Math.round(Math.max(0, Math.min(limit, el.getBoundingClientRect().top + scrollY))))
      stops = [...new Set([0, ...points, limit])].sort((a, b) => a - b)
      chapter = Math.max(0, Math.min(stops.length - 1, chapter))
    }
    const nearest = (y: number) => stops.reduce((best, point, i) =>
      Math.abs(point - y) < Math.abs(stops[best] - y) ? i : best, 0)
    const go = (index: number) => {
      chapter = Math.max(0, Math.min(stops.length - 1, index))
      goal = stops[chapter]
    }
    const stepChapter = (direction: number) => {
      refreshStops()
      // Use the destination while in motion, not whichever section is currently
      // closest: a new opposite gesture can always reverse the same transition.
      go(nearest(goal) + direction)
    }
    const resetGesture = () => {
      gestureTotal = 0
      gestureDirection = 0
      gestureConsumed = false
    }
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
        // Page 3's filmstrip slides its photos with the wheel while hovered: never jump a page.
        if (data.event.type === 'wheel' && data.event.target instanceof Element
          && data.event.target.closest('[data-lenis-prevent-wheel]')) {
          if (data.event.cancelable) data.event.preventDefault()
          return false
        }
        if (paced) {
          if (data.event.type === 'wheel' && (data.event as WheelEvent).ctrlKey) return true
          if (data.event.type === 'touchstart') { resetGesture(); return false }
          if (data.event.type === 'touchend') { resetGesture(); return false }
          if (Math.abs(data.deltaX) > Math.abs(data.deltaY)) return true
          if (data.event.cancelable) data.event.preventDefault()
          if (instance.isStopped || !document.documentElement.hasAttribute('data-site-ready')) return false

          const now = performance.now()
          const direction = Math.sign(data.deltaY)
          if (!direction) return false
          // Ignore the inertial tail of one trackpad gesture. A fresh gesture
          // or a deliberate opposite gesture can choose another chapter.
          if (now - lastGestureAt > 170 || direction !== gestureDirection) resetGesture()
          lastGestureAt = now
          gestureDirection = direction
          if (!gestureConsumed) {
            gestureTotal += Math.abs(data.deltaY)
            if (gestureTotal >= (data.event.type === 'wheel' ? 42 : 34)) {
              stepChapter(direction)
              gestureConsumed = true
            }
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
        resetGesture()
        return
      }
      const limit = instance.limit
      goal = Math.max(0, Math.min(limit, goal))
      const gap = goal - position
      if (Math.abs(gap) < 0.35 && Math.abs(velocity) < 3) {
        // Finish on the exact chapter stop, not one pixel before it.
        if (position !== goal || Math.abs(window.scrollY - goal) > 1) {
          position = goal
          instance.scrollTo(goal, { immediate: true, force: true })
        }
        velocity = 0
        return
      }

      // Analytic critically damped spring: stable across refresh rates, no
      // overshoot on arrival, and velocity carries through a reversal.
      const omega = 5.0
      const displacement = position - goal
      const b = velocity + omega * displacement
      const decay = Math.exp(-omega * dt)
      const next = goal + (displacement + b * dt) * decay
      const nextVelocity = (velocity - omega * b * dt) * decay
      const span = Math.max(1, window.innerHeight)
      const maxSpeed = span / 1.75
      const rawStep = next - position
      const step = Math.max(-maxSpeed * dt, Math.min(maxSpeed * dt, rawStep))
      if (Math.sign(step) === Math.sign(gap) && Math.abs(step) >= Math.abs(gap)) {
        position = goal
        velocity = 0
      } else {
        position = Math.max(0, Math.min(limit, position + step))
        velocity = step === rawStep ? nextVelocity : step / Math.max(dt, 0.0001)
        if (position === 0 || position === limit) velocity = 0
      }
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
      if (paced && instance.isStopped) return
      if (!target.hasAttribute('tabindex') && !target.matches('a[href],button,input,select,textarea')) {
        target.setAttribute('tabindex', '-1')
      }
      target.focus({ preventScroll: true })
      if (paced) {
        refreshStops()
        go(nearest(target.getBoundingClientRect().top + window.scrollY))
      }
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
      const direction = event.key === 'ArrowDown' || event.key === 'PageDown' ? 1
        : event.key === 'ArrowUp' || event.key === 'PageUp' ? -1
        : event.key === ' ' ? (event.shiftKey ? -1 : 1) : 0
      if (!direction && event.key !== 'Home' && event.key !== 'End') return
      event.preventDefault()
      if (event.repeat) return
      if (direction) stepChapter(direction)
      else {
        refreshStops()
        go(event.key === 'Home' ? 0 : stops.length - 1)
      }
    }
    const onResize = () => {
      if (!paced) return
      instance.resize()
      refreshStops()
      go(chapter)
    }
    if (paced) {
      refreshStops()
      chapter = nearest(position)
      window.addEventListener('resize', onResize)
      document.documentElement.classList.add('cinematic-scroll')
      window.addEventListener('keydown', onKey)
    }

    return () => {
      document.removeEventListener('click', onAnchorClick)
      document.documentElement.classList.remove('cinematic-scroll')
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
      gsap.ticker.remove(tick)
      gsap.ticker.lagSmoothing(500, 33) // GSAP default
      instance.destroy()
      setLenis(null)
    }
  }, [reducedMotion, paced])

  return <LenisContext.Provider value={lenis}>{children}</LenisContext.Provider>
}
