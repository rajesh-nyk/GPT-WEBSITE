import { useLayoutEffect, useRef } from 'react'
import { gsap, ScrollTrigger } from '../../lib/gsap'
import { useReducedMotion } from '../../lib/useReducedMotion'

const CLOUD = `${import.meta.env.BASE_URL}clouds/cloud-bank.svg`

/** A reversible cloud wipe, driven by the real Lenis-smoothed scroll position.
 * Page 2 is transparent only while the curtain is crossing it, so the hard white
 * section edge never cuts through the clouds. At the end, the white page takes over.
 */
export function CloudTransition() {
  const root = useRef<HTMLDivElement>(null)
  const distant = useRef<HTMLDivElement>(null)
  const middle = useRef<HTMLDivElement>(null)
  const curtain = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()

  useLayoutEffect(() => {
    const overlay = root.current
    const far = distant.current
    const mid = middle.current
    const front = curtain.current
    const hero = document.getElementById('hero')
    const page = document.getElementById('page-2')
    if (!overlay || !far || !mid || !front || !hero || !page || reducedMotion) return

    const context = gsap.context(() => {
      const timeline = gsap.timeline({ paused: true, defaults: { duration: 1, ease: 'none' } })
      timeline.fromTo(far, { yPercent: 140 }, { yPercent: -145 }, 0)
      timeline.fromTo(mid, { yPercent: 135 }, { yPercent: -120 }, 0)
      timeline.fromTo(front, { yPercent: 58 }, { yPercent: -45 }, 0)

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
      <div ref={distant} className="cloud-transition__distant">
        <img className="cloud-transition__art" src={CLOUD} alt="" draggable={false} />
      </div>
      <div ref={middle} className="cloud-transition__middle">
        <img className="cloud-transition__art" src={CLOUD} alt="" draggable={false} />
      </div>
      <div ref={curtain} className="cloud-transition__curtain">
        <img className="cloud-transition__art" src={CLOUD} alt="" draggable={false} />
        <div className="cloud-transition__white" />
      </div>
    </div>
  )
}
