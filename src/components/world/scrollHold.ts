import { useEffect } from 'react'
import { gsap } from '../../lib/gsap'
import { useLenis } from '../../lib/LenisProvider'
import { journey } from './journey'
import { nightFx } from './NightPortrait'
import { TEMPLE_MOVE, finaleScroll, templeFx } from './templeFx'
import { bgLimit } from '../brideGroom/fx'

/**
 * SCROLL HOLD — the page can never run ahead of the story.
 *
 * The 3D world plays at a fixed pace (journey.ts, PACE) however fast the visitor
 * scrolls. Without a hold the HTML would scroll on while the scene lagged behind, which
 * reads as broken. So, past the hero, the scroll position may lead the animation by only
 * a small margin (LEAD); beyond it the scroll eases to a stop and opens up again as the
 * scene moves on. Scrolling simply feels heavier during the big moments — there's no
 * snapping, no auto-play, and scrolling back up is never held.
 *
 *  - Hero (t < 0.95): free — its own animation is short.
 *  - In-page links (skip link, scroll cue) bypass the hold until the next manual scroll,
 *    so keyboard and assistive-tech navigation always reach their target.
 *  - Finale: the same rule holds the page while the photo is being revealed — the scroll
 *    may lead the reveal by only FINALE_LEAD and opens up once the photo is fully open.
 *  - Closing scene: likewise while the camera cranes down to the temple.
 *  - Page 3 (Bride & Groom): likewise while the petals pan and the selfie slides in.
 *  - Reduced motion: no governor, so no hold.
 */
const LEAD = 0.12 // timeline units the scroll may lead by
const FREE_UNTIL = 0.95

export const scrollHold = { bypass: false }

/** Scroll position (px) at journey time t — the inverse of the sections' triggers. */
function scrollForT(t: number) {
  const hero = document.getElementById('hero')
  const blessing = document.getElementById('blessing')
  const next = document.getElementById('story')
  if (!hero || !blessing || !next) return Infinity
  const vh = window.innerHeight
  if (t <= 1) return hero.offsetTop + t * hero.offsetHeight
  if (t <= 2) return blessing.offsetTop + (t - 1) * (blessing.offsetHeight - vh)
  if (t <= 3) return next.offsetTop - vh + (t - 2) * vh
  return Infinity
}

const FINALE_LEAD = 0.06 // reveal units the scroll may lead the photo's opening by

/** Furthest scroll (px) the finale allows while its photo is still opening. */
function finaleLimit() {
  if (nightFx.reveal >= 0.995) return Infinity
  const f = finaleScroll()
  if (!f) return Infinity
  // inverse of NightPortrait's mapping: reveal target = (p - 0.04) / 0.5
  const p = 0.04 + 0.5 * Math.min(1, nightFx.reveal + FINALE_LEAD)
  return f.top + p * f.portraitSpan
}

/** Furthest scroll (px) the closing scene allows while the camera is still on its way. */
function templeLimit() {
  if (templeFx.view >= 0.995) return Infinity
  const f = finaleScroll()
  if (!f) return Infinity
  // inverse of TempleNight's mapping: view target = temple progress / TEMPLE_MOVE
  const p = Math.min(1, templeFx.view + FINALE_LEAD) * TEMPLE_MOVE
  return f.top + f.portraitSpan + p * f.templeSpan
}

/** The furthest the page may currently scroll (px); Infinity when nothing is held. */
export function holdLimit() {
  if (scrollHold.bypass) return Infinity
  const allowedT = Math.max(journey.t + LEAD, FREE_UNTIL)
  const journeyLimit = journey.t >= 2.97 || allowedT >= 3 ? Infinity : scrollForT(allowedT)
  return Math.min(journeyLimit, finaleLimit(), templeLimit(), bgLimit())
}

/**
 * Lenis virtualScroll hook: trims each wheel / touch delta to the room that's left, so
 * the scroll target never passes the limit — the page eases into the hold, with no
 * overshoot and no pull-back.
 */
export function trimDelta(data: { deltaY: number }, targetScroll: number) {
  if (data.deltaY <= 0) return // scrolling back is never held
  const room = holdLimit() - targetScroll
  if (data.deltaY > room) data.deltaY = Math.max(0, room)
}

export function useScrollHold(reducedMotion: boolean) {
  const lenis = useLenis()

  useEffect(() => {
    if (reducedMotion || !lenis) return
    const release = () => (scrollHold.bypass = false)
    const opts = { passive: true } as const
    window.addEventListener('wheel', release, opts)
    window.addEventListener('touchstart', release, opts)
    window.addEventListener('keydown', release, opts)

    // Backstop for input that doesn't pass through trimDelta (touch inertia, keyboard).
    const tick = () => {
      const maxY = holdLimit()
      if (lenis.targetScroll > maxY + 1) lenis.scrollTo(maxY, { lerp: 0.12, force: true })
    }
    gsap.ticker.add(tick) // added after Lenis's own tick → runs after it each frame
    return () => {
      gsap.ticker.remove(tick)
      window.removeEventListener('wheel', release)
      window.removeEventListener('touchstart', release)
      window.removeEventListener('keydown', release)
    }
  }, [lenis, reducedMotion])
}
