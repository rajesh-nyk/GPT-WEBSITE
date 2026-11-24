import { useEffect, type RefObject } from 'react'
import { MathUtils } from 'three'
import { journey } from '../world/journey'
import { screenShapes } from '../world/screenShapes'

/** A line is fully transparent this far (px) *before* its top reaches the rim. */
const TOUCH_MARGIN = 6
/** Never fade over less than this much approach, even if a line sits very close. */
const MIN_FADE_PX = 28
/** Mask: the hole reaches a little past the rim's outermost ornaments, soft-edged. */
const MASK_REACH = 1.04
const FEATHER = 0.12

/**
 * Hero text passes *behind* the wheel while scrolling, easing out before it gets there.
 *
 * The wheel is in the WebGL layer under the HTML, so "behind" is done with a mask:
 * every [data-wheel-mask] element gets a soft-edged elliptical hole exactly where the
 * wheel is on screen (the ellipse narrows while it's still turning). Text crossing the
 * wheel is hidden by it, never drawn over it.
 *
 * Each [data-fade-line] fades as its top edge approaches the wheel's bottom edge: fully
 * visible at its resting distance, and completely transparent just *before* it touches
 * the rim — so text never visibly meets the wheel; it eases out, then slips behind.
 *
 * Reads all rects first, then writes styles (no layout thrashing); idle when the hero is
 * off-screen or the page is at rest. Reduced motion: the wheel scrolls with the text,
 * so they never meet — nothing to do.
 */
export function useBehindWheel(sectionRef: RefObject<HTMLElement | null>, reducedMotion: boolean) {
  useEffect(() => {
    const section = sectionRef.current
    if (!section || reducedMotion) return
    const lines = [...section.querySelectorAll<HTMLElement>('[data-fade-line]')]
    const masked = [...section.querySelectorAll<HTMLElement>('[data-wheel-mask]')]
    const restGap = new Map<HTMLElement, number>()
    let active = false
    let raf = 0

    const clear = () => {
      for (const el of lines) el.style.opacity = ''
      for (const el of masked) {
        el.style.maskImage = ''
        el.style.webkitMaskImage = ''
      }
    }

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const wheel = screenShapes.wheel
      if (!wheel) return
      const leaving = journey.t > 0.001 || journey.target > 0.001
      const wheelBottom = wheel.y + wheel.r

      // ---- reads
      const sectionBottom = section.getBoundingClientRect().bottom
      if (sectionBottom <= 0) return
      const lineRects = lines.map((el) => el.getBoundingClientRect())
      const maskRects = masked.map((el) => el.getBoundingClientRect())

      // ---- writes
      if (!leaving) {
        // At rest: remember how far each line naturally sits below the wheel.
        lines.forEach((el, i) => restGap.set(el, lineRects[i].top - wheelBottom))
        if (active) clear()
        active = false
        return
      }
      active = true

      lines.forEach((el, i) => {
        const r = lineRects[i]
        const rest = restGap.get(el) ?? r.top - wheelBottom
        const start = Math.max(rest, TOUCH_MARGIN + MIN_FADE_PX)
        const opacity = MathUtils.smoothstep(r.top - wheelBottom, TOUCH_MARGIN, start)
        el.style.opacity = opacity.toFixed(3)
      })

      const rx = wheel.r * wheel.sx * MASK_REACH
      const ry = wheel.r * MASK_REACH
      masked.forEach((el, i) => {
        const r = maskRects[i]
        const x = wheel.x - r.left
        const y = wheel.y - r.top
        const hole = `radial-gradient(${rx.toFixed(1)}px ${ry.toFixed(1)}px at ${x.toFixed(1)}px ${y.toFixed(1)}px, transparent ${((1 - FEATHER) * 100).toFixed(1)}%, #000 100%)`
        el.style.maskImage = hole
        el.style.webkitMaskImage = hole
      })
    }

    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      clear()
    }
  }, [sectionRef, reducedMotion])
}
