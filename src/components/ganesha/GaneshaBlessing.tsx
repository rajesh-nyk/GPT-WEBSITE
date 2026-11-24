import { useEffect, useRef } from 'react'
import { useReducedMotion } from '../../lib/useReducedMotion'
import { journey, useJourneySegment } from '../world/journey'
import { gsap } from '../../lib/gsap'
import { MathUtils } from 'three'

/**
 * Ganesha blessing (HTML layer). The 3D build happens in the shared WorldCanvas; this
 * section provides scroll distance (a tall section with a sticky stage), reports its
 * progress as journey segment 1, and holds the mantra.
 *
 * The mantra appears from the *governed* timeline (not raw scroll), so it always arrives
 * in step with the figure solidifying — even after a fast flick.
 *
 * Reduced motion: one screen tall; the finished figure and the mantra are simply there.
 */
export function GaneshaBlessing({ id }: { id: string }) {
  const reducedMotion = useReducedMotion()
  const section = useRef<HTMLElement>(null)
  const invocation = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const el = invocation.current
    if (!el || reducedMotion) return
    const sync = () => {
      const opacity = MathUtils.smootherstep(journey.t, 1.5, 1.56) *
        (1 - MathUtils.smootherstep(journey.t, 1.86, 1.94))
      el.style.opacity = String(opacity)
    }
    gsap.ticker.add(sync)
    return () => { gsap.ticker.remove(sync) }
  }, [reducedMotion])

  useJourneySegment(section, 1, 'top top', 'bottom bottom')

  return (
    <section
      ref={section}
      id={id}
      aria-labelledby="blessing-title"
      // No gold ghost glow on the Ganesha page (Rajesh, 22 Nov 2026).
      data-no-ghost-zone
      className={`relative z-10 ${reducedMotion ? 'h-svh' : 'h-[450svh]'}`}
    >
      <div className="sticky top-0 h-svh min-h-[34rem] overflow-hidden">
        <h2 ref={invocation} id="blessing-title" className="blessing-invocation" style={{opacity:reducedMotion?1:0}}>
          <span lang="or">ଶ୍ରୀ ଗଣେଶାୟ ନମଃ</span>
          <span lang="en">Salutations to Lord Ganesha</span>
        </h2>
      </div>
    </section>
  )
}
