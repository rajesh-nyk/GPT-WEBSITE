/* eslint-disable */
// Infinite Grid — Originkit (pasted by Rajesh, 22 Nov 2026). Motion logic kept as given.
// Changes for the site: React 19 ignores defaultProps on function components, so the
// defaults are inline; the Unsplash samples and the Google Fonts loader are dropped (no
// outside requests); captions render only when an item has a title; `alt` is its own field.
//
// A grid on a canvas with no edges: drag, flick or scroll it in any direction; it carries
// momentum, leans into the motion with a slight skew, and wraps seamlessly.
import * as React from 'react'
import { useEffect, useRef } from 'react'

export interface GridItem {
  title?: string
  subtitle?: string
  alt?: string
  imageUrl: string
}

interface InfiniteGridProps {
  items: GridItem[]
  columns?: number
  cardWidth?: number
  /** Corner radius of each card photo, in px. */
  radius?: number
  gap?: number
  background?: string
  textColor?: string
  mutedColor?: string
  onItemClick?: (item: GridItem) => void
  style?: React.CSSProperties
}

const FRICTION = 0.95
const DRAG_GAIN = 0.85
const WHEEL_GAIN = 0.45
const CLICK_SLOP = 6
const MAX_SKEW = 3
// Tap / click a photo: it grows out of its slot and rises above its neighbours. Tap it
// again, tap anywhere else, drag, scroll or press Esc to close (Rajesh: hover zoomed all
// the time as the cursor moved, so it is a tap now). Was a 1.05 hover inside the clip.
const HOVER_SCALE = 1.8
const HOVER_TAU = 0.16
// While a photo is zoomed, everything behind it softens by a light blur (Rajesh: "5%").
// Fixed strength; only the veil's opacity follows the zoom, so it stays smooth.
const HOVER_BLUR_PX = 5

const css = `
.ig-root { position: relative; width: 100%; height: 100%; overflow: hidden; }
.ig-pane { position: relative; width: 100%; height: 100%; overflow: hidden; cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none; outline: none; }
.ig-pane:active { cursor: grabbing; }
.ig-card { cursor: zoom-in; }
`

export default function InfiniteGrid(props: InfiniteGridProps) {
  const {
    items,
    columns = 4,
    cardWidth = 150,
    radius = 0,
    gap = 24,
    background = 'transparent',
    textColor = '#ffffffc7',
    mutedColor = '#ffffff',
    onItemClick,
    style,
  } = props
  const list = items
  const cols = Math.max(1, Math.round(columns))

  const paneRef = useRef<HTMLDivElement>(null)
  const matrixRef = useRef<HTMLDivElement>(null)
  const blockRef = useRef<HTMLDivElement>(null)
  const veilRef = useRef<HTMLDivElement>(null)

  const pos = useRef({ x: 0, y: 0 })
  const target = useRef({ x: 0, y: 0 })
  const vel = useRef({ x: 0, y: 0 })
  const block = useRef({ w: 0, h: 0 })
  const dragging = useRef(false)
  const dragFrom = useRef({ x: 0, y: 0 })
  const dragFromTarget = useRef({ x: 0, y: 0 })
  const last = useRef({ x: 0, y: 0, t: 0 })
  const moved = useRef(0)
  const placed = useRef(false)
  const hoverImg = useRef<HTMLElement | null>(null)
  // The photo under the finger at pointer-down (the click target is the pane once captured).
  const downCard = useRef<HTMLElement | null>(null)

  // Measure one tile of the 3 x 3 matrix and park the view on the middle one.
  useEffect(() => {
    const pane = paneRef.current
    const tile = blockRef.current
    if (!pane || !tile) return
    placed.current = false
    const measure = () => {
      const w = tile.offsetWidth
      const h = tile.offsetHeight
      const cw = pane.clientWidth
      const ch = pane.clientHeight
      if (!w || !h || !cw || !ch) return
      block.current = { w, h }
      if (!placed.current) {
        const x = -w + (cw - w) / 2
        const y = -h + (ch - h) / 2
        pos.current = { x, y }
        target.current = { x, y }
        placed.current = true
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(pane)
    ro.observe(tile)
    return () => ro.disconnect()
  }, [cols, cardWidth, gap, list.length])

  // One frame loop: coast, ease toward the target, wrap, skew. Idle while offscreen.
  useEffect(() => {
    const pane = paneRef.current
    if (!pane) return
    let raf = 0
    let visible = true
    let lastTransform = ''
    let wasGliding = false
    let lastTime = performance.now()
    const zoomed = new Map<HTMLElement, number>()
    let lastVeil = -1

    const frame = () => {
      const now = performance.now()
      const dt = Math.min((now - lastTime) / 1000, 0.1)
      lastTime = now
      const { w, h } = block.current
      const p = pos.current
      const t = target.current
      const v = vel.current

      if (!dragging.current && (Math.abs(v.x) > 0.01 || Math.abs(v.y) > 0.01)) {
        v.x *= FRICTION
        v.y *= FRICTION
        t.x += v.x
        t.y += v.y
      }
      const k = dragging.current ? 0.16 : 0.09
      p.x += (t.x - p.x) * k
      p.y += (t.y - p.y) * k

      const moving =
        dragging.current ||
        Math.abs(v.x) > 0.05 ||
        Math.abs(v.y) > 0.05 ||
        Math.abs(t.x - p.x) > 0.1 ||
        Math.abs(t.y - p.y) > 0.1
      if (!moving) {
        p.x = t.x
        p.y = t.y
      }
      const gliding = dragging.current ? moved.current >= CLICK_SLOP : moving
      if (gliding !== wasGliding) {
        if (gliding) hoverImg.current = null
        wasGliding = gliding
      }

      const hov = hoverImg.current
      if (hov && !zoomed.has(hov)) zoomed.set(hov, 1)
      const ease = 1 - Math.exp(-dt / HOVER_TAU)
      zoomed.forEach((s, img) => {
        const goal = img === hov ? HOVER_SCALE : 1
        let n = s + (goal - s) * ease
        if (Math.abs(goal - n) < 0.0005) n = goal
        if (n === 1 && goal === 1) {
          img.style.transform = ''
          img.style.zIndex = ''
          zoomed.delete(img)
        } else if (n !== s) {
          img.style.transform = `scale(${n.toFixed(4)})`
          // Above every neighbour while it is bigger; the one growing sits on top.
          img.style.zIndex = img === hov ? '3' : '2'
          zoomed.set(img, n)
        }
      })

      // Veil strength = how far the most-zoomed photo has grown.
      let veil = 0
      zoomed.forEach((n) => (veil = Math.max(veil, (n - 1) / (HOVER_SCALE - 1))))
      veil = Math.round(veil * 100) / 100
      if (veilRef.current && veil !== lastVeil) {
        veilRef.current.style.opacity = String(veil)
        veilRef.current.style.visibility = veil > 0 ? 'visible' : 'hidden'
        lastVeil = veil
      }

      if (w > 0 && h > 0) {
        const shift = (dx: number, dy: number) => {
          p.x += dx
          p.y += dy
          t.x += dx
          t.y += dy
          dragFromTarget.current.x += dx
          dragFromTarget.current.y += dy
        }
        while (p.x < -w * 1.75) shift(w, 0)
        while (p.x > -w * 0.25) shift(-w, 0)
        while (p.y < -h * 1.75) shift(0, h)
        while (p.y > -h * 0.25) shift(0, -h)
      }

      let tf: string
      if (moving) {
        const skewX = Math.max(-MAX_SKEW, Math.min(MAX_SKEW, v.x * 0.08))
        const skewY = Math.max(-MAX_SKEW, Math.min(MAX_SKEW, v.y * 0.08))
        tf = `translate3d(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px, 0) skew(${skewX.toFixed(2)}deg, ${skewY.toFixed(2)}deg)`
      } else {
        tf = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`
      }
      if (matrixRef.current && tf !== lastTransform) {
        matrixRef.current.style.transform = tf
        lastTransform = tf
      }
      raf = visible ? requestAnimationFrame(frame) : 0
    }

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible && !raf) raf = requestAnimationFrame(frame)
    })
    io.observe(pane)
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
    }
  }, [])

  // Wheel needs a non-passive listener so the page doesn't scroll underneath.
  useEffect(() => {
    const pane = paneRef.current
    if (!pane) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const dx = -e.deltaX * WHEEL_GAIN
      const dy = -e.deltaY * WHEEL_GAIN
      vel.current.x = vel.current.x * 0.3 + dx * 0.7
      vel.current.y = vel.current.y * 0.3 + dy * 0.7
      target.current.x += dx
      target.current.y += dy
    }
    pane.addEventListener('wheel', onWheel, { passive: false })
    return () => pane.removeEventListener('wheel', onWheel)
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const card = (e.target as Element).closest?.('.ig-card')
    downCard.current = card instanceof HTMLElement ? card : null
    dragging.current = true
    moved.current = 0
    dragFrom.current = { x: e.clientX, y: e.clientY }
    dragFromTarget.current = { ...target.current }
    last.current = { x: e.clientX, y: e.clientY, t: performance.now() }
    vel.current = { x: 0, y: 0 }
    paneRef.current?.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return
    const now = performance.now()
    const dt = Math.max(now - last.current.t, 1)
    moved.current += Math.hypot(e.clientX - last.current.x, e.clientY - last.current.y)
    vel.current = {
      x: vel.current.x * 0.25 + ((e.clientX - last.current.x) / dt) * 12 * 0.75,
      y: vel.current.y * 0.25 + ((e.clientY - last.current.y) / dt) * 12 * 0.75,
    }
    last.current = { x: e.clientX, y: e.clientY, t: now }
    target.current.x = dragFromTarget.current.x + (e.clientX - dragFrom.current.x) * DRAG_GAIN
    target.current.y = dragFromTarget.current.y + (e.clientY - dragFrom.current.y) * DRAG_GAIN
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging.current) return
    dragging.current = false
    const pane = paneRef.current
    if (pane && pane.hasPointerCapture(e.pointerId)) pane.releasePointerCapture(e.pointerId)
  }

  const matrix = [0, 1, 2, 3, 4, 5, 6, 7, 8]
  const fontStack = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'

  return (
    <div className="ig-root" style={{ ...style, background }}>
      <style>{css}</style>
      <div
        ref={paneRef}
        className="ig-pane"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={() => {
          // A tap (not a drag): on a photo toggles its zoom, anywhere else closes it.
          if (moved.current >= CLICK_SLOP) return
          const card = downCard.current
          hoverImg.current = card && card !== hoverImg.current ? card : null
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') hoverImg.current = null
        }}
      >
        <div
          ref={matrixRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, max-content)',
            width: 'max-content',
            transformOrigin: '50% 50%',
          }}
        >
          {/* Blur veil: above the resting photos, below any zoomed one (z-index 2–3). */}
          <div
            ref={veilRef}
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 1,
              pointerEvents: 'none',
              opacity: 0,
              visibility: 'hidden',
              backdropFilter: `blur(${HOVER_BLUR_PX}px)`,
              WebkitBackdropFilter: `blur(${HOVER_BLUR_PX}px)`,
            }}
          />
          {matrix.map((id) => (
            <div
              key={id}
              ref={id === 4 ? blockRef : null}
              aria-hidden={id === 4 ? undefined : true}
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${cols}, ${cardWidth}px)`,
                alignItems: 'start',
                gap,
                padding: gap / 2,
              }}
            >
              {list.map((item, i) => (
                <div
                  key={i}
                  className="ig-card"
                  onClick={() => {
                    if (moved.current < CLICK_SLOP) onItemClick?.(item)
                  }}
                  style={{
                    width: cardWidth,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 14,
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: '1 / 1',
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <img
                      src={item.imageUrl}
                      alt={id === 4 ? (item.alt ?? item.title ?? '') : ''}
                      draggable={false}
                      decoding="async"
                      // Sized to the picture itself (same fit as `contain`) so the radius
                      // rounds the photo, not the empty square around it — never stretched.
                      style={{
                        maxWidth: '100%',
                        maxHeight: '100%',
                        width: 'auto',
                        height: 'auto',
                        objectFit: 'contain',
                        borderRadius: radius,
                        pointerEvents: 'none',
                      }}
                    />
                  </div>
                  {(item.title || item.subtitle) && (
                    <div
                      style={{
                        width: '100%',
                        textAlign: 'center',
                        fontFamily: fontStack,
                        fontSize: 12,
                        lineHeight: 1.25,
                        textTransform: 'uppercase',
                        pointerEvents: 'none',
                      }}
                    >
                      {item.title && (
                        <div style={{ color: textColor, fontWeight: 500, letterSpacing: '-0.01em' }}>{item.title}</div>
                      )}
                      {item.subtitle && (
                        <div style={{ color: mutedColor, marginTop: 2, fontWeight: 400, fontSize: 6 }}>
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
