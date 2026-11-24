import { useEffect } from 'react'
import { journey } from '../world/journey'
import { screenShapes } from '../world/screenShapes'

const REACH = 1.03 // a hair past the rim's outer ornaments
const FEATHER_PX = 28

/**
 * Chapter text passes BEHIND the watermark wheel, never over it — the same rule as the
 * hero. Each visible .chapter gets a soft circular hole in its mask exactly where the
 * wheel sits on screen (converted into the element's own coordinates every frame, so the
 * hole stays fixed to the viewport while the text scrolls through it).
 * Reads every rect first, then writes; idle until the wheel has left Ganesha.
 */
export function useMarkMask(reducedMotion: boolean) {
  useEffect(() => {
    if (reducedMotion) return
    let raf = 0
    let masking = false
    const chapters = () => [...document.querySelectorAll<HTMLElement>('.chapter')]

    const clear = () => {
      for (const el of chapters()) {
        el.style.maskImage = ''
        el.style.webkitMaskImage = ''
      }
    }

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const wheel = screenShapes.wheel
      const on = !!wheel && journey.t > 2
      if (!on) {
        if (masking) clear()
        masking = false
        return
      }
      masking = true
      const els = chapters()
      const vh = window.innerHeight
      const rects = els.map((el) => el.getBoundingClientRect())
      const r = wheel.r * REACH
      els.forEach((el, i) => {
        const b = rects[i]
        if (b.bottom < 0 || b.top > vh) return
        const x = wheel.x - b.left
        const y = wheel.y - b.top
        const m = `radial-gradient(circle ${r + FEATHER_PX}px at ${x}px ${y}px, transparent ${r}px, #000 ${r + FEATHER_PX}px)`
        el.style.maskImage = m
        el.style.webkitMaskImage = m
      })
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      clear()
    }
  }, [reducedMotion])
}
