import { useEffect, type RefObject } from 'react'

/**
 * Marks [data-reveal] elements inside `root` with data-in="true" the first time they are
 * well into view; CSS does the (opacity + transform only) animation. Once revealed they
 * stay revealed — nothing blinks out again when scrolling back.
 * Reduced motion: the CSS shows everything immediately.
 */
export function useReveal(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current
    if (!el) return
    const items = el.querySelectorAll<HTMLElement>('[data-reveal]')
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          ;(e.target as HTMLElement).dataset.in = 'true'
          io.unobserve(e.target)
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.15 },
    )
    items.forEach((i) => io.observe(i))
    return () => io.disconnect()
  }, [root])
}
