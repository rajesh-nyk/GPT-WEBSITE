import { Fragment, useRef } from 'react'
import { CEREMONIES } from '../../content/wedding'
import { useReducedMotion } from '../../lib/useReducedMotion'
import { useJourneySegment } from '../world/journey'
import { heroLayoutVars } from './layout'
import { useBehindWheel } from './useBehindWheel'
import { TechNames } from './TechNames'

const HERO_DATES = [CEREMONIES.nirbandha, CEREMONIES.bahaghara, CEREMONIES.reception]

/**
 * Full-screen opening (HTML layer). The wheel, glow and motes are rendered by the shared
 * WorldCanvas behind it; this section provides the names, the scroll cue, and reports
 * its scroll-out progress as journey segment 0 — which drives the wheel's travel and
 * the red glow deepening (governed speed, so it never jumps).
 *
 * Entrance, staged on the sunrise (heroFx.rise, ~0.5–3.6s): the sun climbs from the
 * horizon behind the wheel and the wheel catches its light; only then do the names
 * arrive (2.3s), followed by the ornament, the Odia names, place & year, and the cue.
 *
 * Leaving: the text scrolls up *behind* the travelling wheel, each line easing out before
 * it reaches the rim (useBehindWheel). Fade wrappers ([data-fade-line]) are separate from
 * the .hero-reveal elements so the entrance animation and the scroll fade never fight.
 *
 * All content is real HTML: selectable, translatable and screen-reader friendly.
 */
export function Hero({ nextId }: { nextId?: string }) {
  const section = useRef<HTMLElement>(null)
  useJourneySegment(section, 0, 'top top', 'bottom top')

  const reducedMotion = useReducedMotion()
  useBehindWheel(section, reducedMotion)

  return (
    <section
      ref={section}
      id="hero"
      aria-labelledby="hero-title"
      className="hero relative z-10 flex h-svh min-h-[34rem] flex-col items-center overflow-hidden"
      style={heroLayoutVars}
    >
      {/* Reserves the wheel's space: the copy flows beneath it (heights in index.css). */}
      <div aria-hidden className="hero-spacer" />

      <div data-wheel-mask className="hero-copy flex w-full flex-col items-center px-6 text-center">
        <div data-fade-line>
          {/* The real heading stays for screen readers/search; the TechText canvas draws it. */}
          <h1 id="hero-title" className="sr-only">
            Rajesh &amp; Chinmayee
          </h1>
          <div className="hero-reveal" style={{ animationDelay: '2.3s' }}>
            <TechNames />
          </div>
        </div>

        <div data-fade-line>
          <div aria-hidden className="hero-reveal hero-ornament" style={{ animationDelay: '2.6s' }}>
            <span className="hero-ornament__rule" />
            <span className="hero-ornament__gem" />
            <span className="hero-ornament__rule hero-ornament__rule--r" />
          </div>
        </div>

        <div data-fade-line>
          <p lang="or" className="hero-reveal hero-odia font-odia" style={{ animationDelay: '2.8s' }}>
            ରାଜେଶ ଓ ଚିନ୍ମୟୀ
          </p>
        </div>

        <div data-fade-line>
          {/* The three celebration dates (hero option A, approved 22 Nov 2026). */}
          <p className="hero-reveal hero-meta font-inscription" style={{ animationDelay: '3.05s' }}>
            <span className="sr-only">Celebrations on 27 January, 26 February and 3 March 2027</span>
            {HERO_DATES.map((c) => (
              <Fragment key={c.id}>
                <time aria-hidden dateTime={c.iso}>
                  {c.dayMonth}
                </time>
                <span aria-hidden className="hero-meta__dot" />
              </Fragment>
            ))}
            <span aria-hidden>2027</span>
          </p>
        </div>
      </div>

      {nextId && (
        <a
          href={`#${nextId}`}
          // .hero-reveal lives on an inner wrapper so the CSS entrance animation and the
          // scroll fade (opacity on this element) never fight.
          data-fade-line
          data-wheel-mask
          aria-label="Scroll to the next section"
          className="hero-cue font-inscription"
        >
          <span className="hero-reveal flex flex-col items-center gap-2.5" style={{ animationDelay: '3.5s' }}>
            <span className="scroll-label pl-[0.45em]">Scroll</span>
            <span aria-hidden className="relative block h-9 w-px overflow-hidden bg-gold/20">
              <span className="scroll-dot absolute top-0 left-0 block h-3 w-px bg-gold-light" />
            </span>
          </span>
        </a>
      )}
    </section>
  )
}
