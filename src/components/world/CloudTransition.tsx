import { useLayoutEffect, useRef } from 'react'
import { gsap, ScrollTrigger } from '../../lib/gsap'
import { useReducedMotion } from '../../lib/useReducedMotion'
import { CloudArt } from './CloudArt'

type Cloud = { x: number; y: number; w: number; opacity: number; variant: number; drift: number }
const FAR: Cloud[] = [
  { x: -20, y: 9, w: 57, opacity: .43, variant: 1, drift: -6 },
  { x: 17, y: 26, w: 50, opacity: .38, variant: 2, drift: 4 },
  { x: 59, y: 5, w: 57, opacity: .49, variant: 0, drift: 7 },
]
const MIDDLE: Cloud[] = [
  { x: -22, y: 5, w: 73, opacity: .85, variant: 2, drift: -8 },
  { x: 37, y: 22, w: 62, opacity: .74, variant: 1, drift: 5 },
  { x: 72, y: 0, w: 54, opacity: .81, variant: 0, drift: 8 },
]
const NEAR: Cloud[] = [
  { x: -27, y: 0, w: 79, opacity: 1, variant: 0, drift: -7 },
  { x: 32, y: 3, w: 78, opacity: 1, variant: 1, drift: 7 },
  { x: 73, y: 0, w: 57, opacity: .95, variant: 2, drift: 9 },
  { x: -6, y: 11, w: 63, opacity: .97, variant: 2, drift: -4 },
  { x: 48, y: 14, w: 69, opacity: .98, variant: 0, drift: 3 },
]

function CloudBank({ name, clouds }: { name: string; clouds: Cloud[] }) {
  return (
    <div className={'cloud-transition__bank cloud-transition__bank--' + name} data-bank={name}>
      {name === 'near' && <div className="cloud-transition__mist" />}
      {clouds.map((cloud, index) => (
        <div key={index} className="cloud-transition__cloud"
          data-drift={cloud.drift}
          style={{ left: cloud.x + '%', top: cloud.y + '%', width: cloud.w + '%', opacity: cloud.opacity, aspectRatio: '2 / 1' }}>
          <CloudArt id={'cloud-' + name + '-' + index} variant={cloud.variant} />
        </div>
      ))}
    </div>
  )
}

/** Scroll-scrubbed SVG clouds. The white mist is completely opaque before we
 * hand off to Page 2, so the final change is invisible in either direction.
 */
export function CloudTransition() {
  const root = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()

  useLayoutEffect(() => {
    const overlay = root.current
    const hero = document.getElementById('hero')
    const page = document.getElementById('page-2')
    if (!overlay || !hero || !page || reducedMotion) return

    const context = gsap.context(() => {
      const far = overlay.querySelector('[data-bank="far"]')
      const mid = overlay.querySelector('[data-bank="middle"]')
      const near = overlay.querySelector('[data-bank="near"]')
      if (!far || !mid || !near) return
      const timeline = gsap.timeline({ paused: true, defaults: { duration: 1, ease: 'none' } })
      timeline.fromTo(far, { yPercent: 150 }, { yPercent: -155 }, 0)
      timeline.fromTo(mid, { yPercent: 125 }, { yPercent: -132 }, 0)
      timeline.fromTo(near, { yPercent: 53 }, { yPercent: -48 }, 0)
      overlay.querySelectorAll<HTMLElement>('[data-drift]').forEach(cloud => {
        const drift = Number(cloud.dataset.drift)
        timeline.fromTo(cloud, { xPercent: 0 }, { xPercent: drift }, 0)
      })
      // The distant banks have already moved out of sight when the mist covers
      // the viewport; ease out the remaining texture before the white hand-off.
      timeline.to([far, mid], { opacity: 0, duration: .2 }, .75)
      const nearClouds = near.querySelectorAll('[data-drift]')
      timeline.to(nearClouds, { opacity: 0, duration: .23 }, .76)

      let wasActive: boolean | null = null
      const apply = (self: ScrollTrigger) => {
        const p = self.progress
        const active = p > 0 && p < 0.998
        timeline.progress(p)
        if (active !== wasActive) {
          overlay.style.visibility = active ? 'visible' : 'hidden'
          page.style.backgroundColor = active ? 'transparent' : '#fff'
          wasActive = active
        }
      }
      const trigger = ScrollTrigger.create({
        trigger: hero,
        start: 'top top',
        end: 'bottom top',
        onUpdate: apply,
        onRefresh: apply,
      })
      apply(trigger)
    }, overlay)

    return () => {
      context.revert()
      overlay.style.removeProperty('visibility')
      page.style.removeProperty('background-color')
    }
  }, [reducedMotion])

  if (reducedMotion) return null
  return (
    <div ref={root} className="cloud-transition" aria-hidden="true">
      <CloudBank name="far" clouds={FAR} />
      <CloudBank name="middle" clouds={MIDDLE} />
      <CloudBank name="near" clouds={NEAR} />
    </div>
  )
}
