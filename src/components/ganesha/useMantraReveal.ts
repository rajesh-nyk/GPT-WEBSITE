import { useEffect, type RefObject } from 'react'
import { ganeshaFx, MANTRA } from './fx'

const WIDE = '(min-aspect-ratio: 5/4)'

/**
 * When the mantra shows depends on the screen — it must never sit on Ganesha:
 *  - wide screens: flanking inscriptions beside him, during the full-frame hold
 *  - narrow screens: there is no free space beside or below him, so the mantra is the
 *    INVOCATION — chanted over the golden nebula, dissolving as the particles gather
 * Toggles data-shown from the governed progress in a light rAF loop (one attribute write
 * per change); CSS transitions do the soft fade + rise, and reverse gracefully.
 */
export function useMantraReveal(ref: RefObject<HTMLElement | null>, reducedMotion: boolean) {
  useEffect(() => {
    if (reducedMotion) return
    const wide = window.matchMedia(WIDE)
    let raf = 0
    let shown = false
    const tick = () => {
      const p = ganeshaFx.progress
      const [a, b] = wide.matches ? MANTRA.flanks : MANTRA.invocation
      // The invocation is visible from the moment the nebula has gathered.
      const inWindow = wide.matches ? p >= a && p < b : ganeshaFx.presence > 0.6 && p < b
      const next = inWindow && ganeshaFx.leave < 0.01
      if (next !== shown && ref.current) {
        shown = next
        ref.current.dataset.shown = String(next)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [ref, reducedMotion])
}
