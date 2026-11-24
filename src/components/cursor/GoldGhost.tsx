import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import GhostCursor from '../GhostCursor'
import { screenShapes } from '../world/screenShapes'
import { useReducedMotion } from '../../lib/useReducedMotion'

/** Only devices with a real mouse/trackpad (same rule as the gold ring). */
const FINE_POINTER = '(hover: hover) and (pointer: fine)'
const subscribeFine = (cb: () => void) => {
  const mql = window.matchMedia(FINE_POINTER)
  mql.addEventListener('change', cb)
  return () => mql.removeEventListener('change', cb)
}
const useFinePointer = () =>
  useSyncExternalStore(subscribeFine, () => window.matchMedia(FINE_POINTER).matches, () => false)

/**
 * The couple's own photos. The glow fades out while the pointer is on or near one of
 * these, so it never washes over their faces (photos stay in natural colours).
 */
const PHOTOS = '.story-photo, .np-frame, [data-no-ghost]'
/** How far from a photo's edge (px) the glow is already gone: covers the trail's size. */
const PHOTO_MARGIN = 110
/**
 * Words on the page (and the drawn names). Near these, and near the wheel, the glow drops
 * to 1% so the details underneath stay readable (Rajesh, 22 Nov 2026).
 */
const TEXT =
  'h1, h2, h3, h4, h5, h6, p, li, blockquote, figcaption, time, dt, dd, label, a, button, .hero-tech-names, [data-ghost-dim]'
const TEXT_MARGIN = 48
/**
 * Photos that WANT a gentle glow on hover (page 3 selfie — Rajesh, 22 Nov 2026: "ghost
 * cursor should come on the pic, just reduced"). Checked first, pointer inside only.
 */
const SOFT = '[data-ghost-soft]'
const WHEEL_MARGIN = 48

/**
 * A soft gold glow (React Bits Ghost Cursor) that trails behind the gold ring.
 * Fixed over the whole page, below the ring, never catches clicks. Mouse/trackpad only;
 * off when the visitor asks for reduced motion.
 */
export function GoldGhost() {
  const fine = useFinePointer()
  const reducedMotion = useReducedMotion()
  const layer = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(true)

  useEffect(() => {
    const el = layer.current
    if (!fine || reducedMotion || !el) return
    let state = 'false'
    let raf = 0
    let px = -1e4
    let py = -1e4

    const nearAny = (selector: string, margin: number) => {
      for (const node of document.querySelectorAll(selector)) {
        const r = node.getBoundingClientRect()
        // Skip hidden and screen-reader-only (1px) elements.
        if (r.width < 2 || r.height < 2) continue
        if (px > r.left - margin && px < r.right + margin && py > r.top - margin && py < r.bottom + margin) {
          // Ignore closed menus and text that has faded out.
          if (node.checkVisibility && !node.checkVisibility({ visibilityProperty: true, opacityProperty: true }))
            continue
          return true
        }
      }
      return false
    }
    const softUnder = (): Element | null => {
      for (const node of document.querySelectorAll(SOFT)) {
        const r = node.getBoundingClientRect()
        if (r.width < 2 || r.height < 2) continue
        if (px > r.left && px < r.right && py > r.top && py < r.bottom) {
          // Skip photos that are hidden or have slipped behind the blossoms.
          // Only photos in FRONT of the blossoms: this glow is one overlay above the whole
          // page, so on a photo behind the tree it would float over the flowers (his bug
          // report, 22 Nov 2026). Those photos keep their own tilt + frame glow.
          if ((node as HTMLElement).dataset.layer === 'behind') continue
          if (node.checkVisibility && !node.checkVisibility({ visibilityProperty: true })) continue
          return node
        }
      }
      return null
    }
    const nearWheel = () => {
      const w = screenShapes.wheel
      if (!w) return false
      const dx = (px - w.x) / Math.max(w.sx, 0.01)
      const dy = py - w.y
      return Math.hypot(dx, dy) < w.r + WHEEL_MARGIN
    }

    // Re-clip the full-screen (mix-blend) glow layer only when the outline actually moved:
    // a new clip-path every frame made Safari repaint + re-blend the whole layer.
    let lastClip = ''
    const setClip = (v: string) => {
      if (v === lastClip) return
      lastClip = v
      el.style.clipPath = v
    }
    const check = () => {
      raf = 0
      // Soft photos: reduced. Photos: gone. Wheel and words: 1%. Elsewhere: full glow.
      // Whole pages with no glow (the Ganesha page): only while the pointer is on them.
      const soft = softUnder()
      const next = soft
        ? 'soft'
        : // Zone first: on a no-ghost page (page 3 fills the screen) this short-circuits the
          // PHOTOS and TEXT scans, which read every element's rect.
          nearAny('[data-no-ghost-zone]', 0) || nearAny(PHOTOS, PHOTO_MARGIN)
          ? 'true'
        : nearWheel() || nearAny(TEXT, TEXT_MARGIN)
          ? 'dim'
          : 'false'
      // Over a soft photo the glow is clipped to that photo — it shows on the picture only,
      // never on the flowers around it (Rajesh, 22 Nov 2026). Follows the photo as it moves.
      if (soft) {
        // Clip to the photo's TRUE on-screen outline. Tilted in 3D, a photo is no longer a
        // rectangle on screen, and a bounding-box clip let the glow leak past its edges (his
        // bug photo, 22 Nov 2026). Its 8 corner markers ([data-ghost-corner], two per
        // rounded corner) are measured after every transform, so the polygon follows it.
        const pts = soft.querySelectorAll('[data-ghost-corner]')
        if (pts.length >= 3) {
          const poly = [...pts]
            .map((p) => {
              const b = p.getBoundingClientRect()
              return `${((b.left + b.right) / 2).toFixed(1)}px ${((b.top + b.bottom) / 2).toFixed(1)}px`
            })
            .join(', ')
          setClip(`polygon(${poly})`)
        } else {
          const r = soft.getBoundingClientRect()
          const rad = parseFloat(getComputedStyle(soft).borderTopLeftRadius) || 0
          setClip(`inset(${r.top}px ${innerWidth - r.right}px ${innerHeight - r.bottom}px ${r.left}px round ${rad}px)`)
        }
        schedule() // keep following while the photo slides / tilts under the pointer
      } else if (next !== 'true') setClip('')
      if (next !== state) {
        state = next
        el.dataset.hidden = next
        // `dim` is used over the wheel and text. Rendering the full-screen ghost at 1%
        // opacity still cost all of its simulation + bloom passes, so pause it there.
        setActive(next === 'false' || next === 'soft')
      }
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(check)
    }
    const onMove = (e: PointerEvent) => {
      px = e.clientX
      py = e.clientY
      schedule()
    }
    // Photos also move under a still pointer while the page scrolls.
    window.addEventListener('pointermove', onMove, { passive: true })
    // Throttled: one check per ~100 ms of scrolling (a hovered photo keeps its own per-frame
    // follow loop above), instead of a full element scan on every scrolled frame.
    let lastScrollCheck = 0
    const onScroll = () => {
      const now = performance.now()
      if (now - lastScrollCheck < 100) return
      lastScrollCheck = now
      schedule()
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    // The wheel also moves on its own under a still pointer.
    const tick = window.setInterval(schedule, 150)
    return () => {
      window.clearInterval(tick)
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('scroll', onScroll)
    }
  }, [fine, reducedMotion])

  if (!fine || reducedMotion) return null
  return (
    <div ref={layer} className="gold-ghost" aria-hidden="true">
      <GhostCursor
        active={active}
        color="#E9C46A"
        zIndex={0}
        intro={false}
        clickPuff={false}
        maxDevicePixelRatio={1}
        targetPixels={300_000}
      />
    </div>
  )
}
