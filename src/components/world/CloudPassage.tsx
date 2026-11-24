import { useLayoutEffect, useRef } from 'react'
import { gsap, ScrollTrigger } from '../../lib/gsap'
import { useReducedMotion } from '../../lib/useReducedMotion'

const BASE = import.meta.env.BASE_URL + 'clouds/'
// Each image has genuine alpha; no black background, keying or low-res crops.
const layers = [
  { file: 'hd-far.webp', className: 'far', start: .20, end: .81, x: -13, drift: 12, size: .83, opacity: .58 },
  { file: 'hd-bank.webp', className: 'mid', start: .29, end: .91, x: 10, drift: -15, size: 1, opacity: .90 },
  { file: 'hd-near.webp', className: 'near', start: .38, end: .99, x: -5, drift: 13, size: 1.12, opacity: .91 },
] as const

/** Three independently composited photo layers create parallax without adding
 * transparent overdraw to the WebGL renderer or applying bloom to cloud edges. */
export function CloudPassage() {
  const root = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()
  useLayoutEffect(() => {
    const overlay = root.current
    const hero = document.getElementById('hero')
    if (!overlay || !hero || reducedMotion) return
    const context = gsap.context(() => {
      const images = Array.from(overlay.querySelectorAll<HTMLImageElement>('[data-cloud]'))
      const mist = overlay.querySelector('.cloud-passage__mist')
      const timeline = gsap.timeline({ paused: true })
      // A dummy duration pins the timeline length to exactly one scroll unit.
      timeline.to({}, { duration: 1 }, 0)
      images.forEach((img, i) => {
        const c = layers[i]
        const duration = c.end - c.start
        timeline.set(img, { xPercent: -50 + c.x, yPercent: 100, scale: c.size, opacity: 0 }, 0)
        timeline.to(img, { xPercent: -50 + c.x + c.drift, yPercent: -150, scale: c.size * 1.22, duration, ease: 'none' }, c.start)
        timeline.to(img, { opacity: c.opacity, duration: duration * .18, ease: 'sine.out' }, c.start)
        timeline.to(img, { opacity: 0, duration: duration * .23, ease: 'sine.inOut' }, c.end - duration * .23)
      })
      if (mist) {
        timeline.set(mist, { opacity: 0 }, 0)
        timeline.to(mist, { opacity: 1, duration: .24, ease: 'sine.inOut' }, .38)
        timeline.to(mist, { opacity: 0, duration: .29, ease: 'sine.inOut' }, .65)
      }
      let visible = false
      const apply = (self: ScrollTrigger) => {
        timeline.progress(self.progress)
        const active = self.progress > .18 && self.progress < .995
        if (visible !== active) {
          overlay.style.visibility = active ? 'visible' : 'hidden'
          visible = active
        }
      }
      const trigger = ScrollTrigger.create({
        trigger: hero, start: 'top top', end: 'bottom top', onUpdate: apply, onRefresh: apply,
      })
      apply(trigger)
    }, overlay)
    return () => { context.revert(); overlay.style.removeProperty('visibility') }
  }, [reducedMotion])

  if (reducedMotion) return null
  return (
    <div ref={root} className="cloud-passage" aria-hidden="true">
      <div className="cloud-passage__mist" />
      {layers.map(c => (
        <img key={c.file} className={'cloud-passage__layer cloud-passage__layer--' + c.className}
          data-cloud src={BASE + c.file} alt="" draggable={false}
          onError={e => { e.currentTarget.style.display = 'none' }} />
      ))}
    </div>
  )
}
