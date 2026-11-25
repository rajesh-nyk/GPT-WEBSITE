import { useLayoutEffect, useRef } from 'react'
import { ScrollTrigger } from '../lib/gsap'
import { useReducedMotion } from '../lib/useReducedMotion'
import { PageTwoSky } from './world/PageTwoSky'

/** A continuous diagonal wipe, not a staggered strip effect.
 * Right edge leads while the page rises; the top becomes level at rest.
 * Both the vertical travel and the angled edge use the same scroll progress.
 */
export function SlicedPageTwo() {
  const root = useRef<HTMLElement>(null)
  const layer = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()

  useLayoutEffect(() => {
    const hero = document.getElementById('hero')
    const panel = layer.current
    if (!root.current || !hero || !panel || reducedMotion) return
    let amplitude = 0
    const update = (trigger: ScrollTrigger) => {
      const p = Math.max(0, Math.min(1, trigger.progress))
      const envelope = Math.sin(Math.PI * p) ** 0.8
      panel.style.setProperty('--lead', (amplitude * envelope).toFixed(2) + 'px')
    }
    const refresh = (trigger: ScrollTrigger) => {
      amplitude = Math.min(window.innerHeight * .26, window.innerWidth * .18)
      update(trigger)
    }
    const trigger = ScrollTrigger.create({
      trigger: hero,
      start: 'top top',
      end: 'bottom top',
      onUpdate: update,
      onRefresh: refresh,
    })
    refresh(trigger)
    return () => {
      trigger.kill()
      panel.style.removeProperty('--lead')
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
      <div ref={layer} className="page-angle" aria-hidden="true">
        <PageTwoSky />
        <div className="page-glass" />
      </div>
    </section>
  )
}
