import { useEffect, useRef, useSyncExternalStore } from 'react'
import { isInAnyRegion } from '../../lib/hoverRegions'
import { useReducedMotion } from '../../lib/useReducedMotion'

/** Things that are interactive: the ring tightens and warms over them. */
const INTERACTIVE =
  'a[href], button, [role="button"], [role="link"], input, select, textarea, label, summary, [data-cursor="hover"]'

/** Only devices with a real mouse/trackpad. Touch screens keep their native behaviour. */
const FINE_POINTER = '(hover: hover) and (pointer: fine)'
const subscribeFine = (cb: () => void) => {
  const mql = window.matchMedia(FINE_POINTER)
  mql.addEventListener('change', cb)
  return () => mql.removeEventListener('change', cb)
}
const useFinePointer = () =>
  useSyncExternalStore(subscribeFine, () => window.matchMedia(FINE_POINTER).matches, () => false)

/**
 * A thin metallic-gold ring that replaces the system cursor.
 *
 * - Position is written straight to `transform` in rAF (no React renders, compositor
 *   only); the ring trails the pointer by a hair (~40ms) for a fluid, weighted feel, and
 *   the loop sleeps once it has caught up.
 * - States go through data-attributes → CSS transitions: data-hover (interactive element
 *   or the 3D wheel via hover regions), data-down (pressed), data-visible.
 * - Reduced motion: follows the pointer exactly, no transitions, no glow.
 * - Not rendered on touch devices or in forced-colors (Windows High Contrast) mode,
 *   where the system cursor is kept.
 * - Watchdog: if the ring can't be drawn for >160ms while the mouse moves (the page is
 *   busy), the system cursor reappears until the ring is drawing again.
 */
export function GoldCursor() {
  const fine = useFinePointer()
  const reducedMotion = useReducedMotion()
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = root.current
    if (!fine || !el) return
    const html = document.documentElement
    html.classList.add('has-gold-cursor')

    let x = 0
    let y = 0
    let tx = 0
    let ty = 0
    let overInteractive = false
    let hovered = false
    let raf = 0
    let last = 0
    // Watchdog: if the page is too busy to draw the ring (a long frame, a shader
    // compile), never leave the visitor without a cursor — the system cursor comes back
    // until the ring is drawing again.
    let wokeAt = 0
    let nativeShown = false
    const showNative = (on: boolean) => {
      if (on === nativeShown) return
      nativeShown = on
      html.classList.toggle('has-gold-cursor', !on)
    }

    const updateHover = () => {
      const h = overInteractive || isInAnyRegion(tx, ty)
      if (h !== hovered) {
        hovered = h
        el.dataset.hover = String(h)
      }
    }

    const render = (now: number) => {
      showNative(false)
      wokeAt = 0
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60
      last = now
      const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 26)
      x += (tx - x) * k
      y += (ty - y) * k
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`

      updateHover()

      if (Math.abs(tx - x) > 0.05 || Math.abs(ty - y) > 0.05) {
        raf = requestAnimationFrame(render)
        wokeAt = performance.now()
      } else {
        raf = 0
        last = 0
      }
    }
    const wake = () => {
      if (!raf) {
        raf = requestAnimationFrame(render)
        wokeAt = performance.now()
      } else if (wokeAt && performance.now() - wokeAt > 160) {
        showNative(true) // a frame was asked for and hasn't come: the page is stalled
      }
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return
      tx = e.clientX
      ty = e.clientY
      if (el.dataset.visible !== 'true') {
        x = tx // appear in place, don't fly in from the corner
        y = ty
        el.dataset.visible = 'true'
      }
      overInteractive = !!(e.target as Element | null)?.closest?.(INTERACTIVE)
      wake()
    }
    const onLeave = () => (el.dataset.visible = 'false')
    const onDown = () => (el.dataset.down = 'true')
    const onUp = () => (el.dataset.down = 'false')
    // Content moves under a still pointer when scrolling: re-check hover.
    const onScroll = () => {
      if (el.dataset.visible !== 'true') return
      overInteractive = !!document.elementFromPoint(tx, ty)?.closest(INTERACTIVE)
      updateHover()
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    html.addEventListener('pointerleave', onLeave)
    window.addEventListener('blur', onLeave)

    return () => {
      cancelAnimationFrame(raf)
      html.classList.remove('has-gold-cursor')
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('scroll', onScroll)
      html.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('blur', onLeave)
    }
  }, [fine, reducedMotion])

  if (!fine) return null

  return (
    <div
      ref={root}
      aria-hidden
      className="gold-cursor"
      data-visible="false"
      data-hover="false"
      data-down="false"
      data-reduced={reducedMotion}
    >
      <span className="gold-cursor__glow" />
      <span className="gold-cursor__edge" />
      <span className="gold-cursor__ring" />
    </div>
  )
}
