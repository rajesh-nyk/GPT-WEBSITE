import { useLayoutEffect, useRef } from 'react'
import { gsap, ScrollTrigger } from '../lib/gsap'
import { useReducedMotion } from '../lib/useReducedMotion'

const SLICES = 7

/** A sliced vertical push: each strip is a crop of the same full-page gradient.
 * The spring-controlled document offset is the only clock. Leading strips
 * overlap the outgoing hero slightly, and all align at either chapter stop.
 */
export function SlicedPageTwo() {
  const root = useRef<HTMLElement>(null)
  const reducedMotion = useReducedMotion()

  useLayoutEffect(() => {
    const section = root.current
    const hero = document.getElementById('hero')
    if (!section || !hero || reducedMotion) return
    const strips = Array.from(section.querySelectorAll<HTMLElement>('[data-page-slice]'))
    const setY = strips.map(strip => gsap.quickSetter(strip, 'y', 'px'))
    const update = (trigger: ScrollTrigger) => {
      const p = Math.max(0, Math.min(1, trigger.progress))
      const span = Math.max(1, trigger.end - trigger.start)
      // A smooth envelope makes the offset zero at both ends. Each slice
      // leads its neighbor by a different amount, forming a stepped edge.
      const envelope = Math.sin(Math.PI * p) ** 1.35
      const amplitude = Math.min(span, window.innerHeight) * .23
      setY.forEach((set, i) => {
        const lead = 1 - i / (SLICES - 1)
        set(-amplitude * envelope * lead)
      })
    }
    const trigger = ScrollTrigger.create({
      trigger: hero,
      start: 'top top',
      end: 'bottom top',
      onUpdate: update,
      onRefresh: update,
    })
    update(trigger)
    return () => {
      trigger.kill()
      gsap.set(strips, { clearProps: 'transform' })
    }
  }, [reducedMotion])

  return (
    <section
      ref={root}
      id="page-2"
      data-scroll-scene=""
      aria-label="Page 2"
      className="chapter-panel chapter-panel--sliced relative z-10 min-h-dvh w-full text-gold-light"
    >
      <div className="page-slice-grid" aria-hidden="true">
        {Array.from({ length: SLICES }, (_, i) => (
          <div
            key={i}
            data-page-slice=""
            className="page-slice"
            style={{
              backgroundSize: `${SLICES * 100}% 100%`,
              backgroundPosition: `${i / (SLICES - 1) * 100}% 0`,
            }}
          />
        ))}
      </div>
    </section>
  )
}
