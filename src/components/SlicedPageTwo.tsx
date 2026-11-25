import { useLayoutEffect, useRef } from 'react'
import { ScrollTrigger } from '../lib/gsap'
import { useReducedMotion } from '../lib/useReducedMotion'
import { PageTwoSky } from './world/PageTwoSky'

/** A continuous diagonal wipe, not a staggered strip effect.
 * Right edge leads at a constant angle until both corners are off-screen.
 * Both the vertical travel and the angled edge use the same scroll progress.
 */
export function SlicedPageTwo() {
  const root = useRef<HTMLElement>(null)
  const layer = useRef<HTMLDivElement>(null)
  const rim = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()

  useLayoutEffect(() => {
    const hero = document.getElementById('hero')
    const panel = layer.current
    if (!root.current || !hero || !panel || reducedMotion) return
    let amplitude = 0
    const update = (trigger: ScrollTrigger) => {
      const p = Math.max(0, Math.min(1, trigger.progress))
      const envelope = Math.sin(Math.PI * p) ** 0.8
      const lead = amplitude
      const clearance = Math.min(40, Math.max(0, Math.min(window.innerHeight * .28, window.innerWidth * .20) - lead - 2))
      // At entry the right corner touches the viewport bottom. At arrival
      // the left corner clears the top, including the optical rim.
      const shift = lead * (1 - p) - clearance * p
      panel.style.setProperty('--edge-shift', shift.toFixed(2) + 'px')
      panel.style.setProperty('--lead', lead.toFixed(2) + 'px')
      // The optical bevel follows the exact diagonal, without tilting the scene.
      const width = Math.max(1, panel.clientWidth)
      const angle = -Math.atan2(lead, width)
      rim.current?.style.setProperty('--rim-angle', angle + 'rad')
      rim.current?.style.setProperty('--rim-width', Math.hypot(width, lead) + 'px')
      rim.current?.style.setProperty('--rim-energy', String(Math.min(1, envelope * 1.8)))
    }
    const refresh = (trigger: ScrollTrigger) => {
      amplitude = Math.min(window.innerHeight * .23, window.innerWidth * .16, Math.max(0, Math.min(window.innerHeight * .28, window.innerWidth * .20) - 42))
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
      panel.style.removeProperty('--edge-shift')
      rim.current?.style.removeProperty('--rim-angle')
      rim.current?.style.removeProperty('--rim-width')
      rim.current?.style.removeProperty('--rim-energy')
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
        <div ref={rim} className="page-glass-rim" />
      </div>
    </section>
  )
}
