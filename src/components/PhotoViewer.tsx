import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLenis } from '../lib/LenisProvider'
import { useReducedMotion } from '../lib/useReducedMotion'
import { playGenie } from './genie'
import './PhotoViewer.css'

/** Enough copies of the six photos that a full-width strip (up to 4K) never reaches an end;
 * the scroll position always wraps back into copies 1–2. */
const COPIES = [0, 1, 2, 3, 4, 5, 6, 7]

export type ViewerSlide = { photo: string; land?: string; title: string; alt: string; focus: string }

/**
 * Full-screen photo viewer for page 3 (Rajesh, 27 Nov 2026): clicking a photo opens it full
 * screen (covering it edge to edge), with an endless strip of all the photos along the bottom
 * that the mouse wheel scrolls forever from anywhere in the viewer. Click a thumbnail to switch; Esc or × minimizes it back into page 3's frame with a macOS genie effect. Page scroll is paused while
 * open. Rendered into <body> so no page transform or mask can clip it.
 */
export function PhotoViewer({ slides, index, onIndex, onClose, base, target }: {
  slides: ViewerSlide[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
  base: string
  /** Where the photo minimizes to (page 3's big photo frame): the macOS genie "dock". */
  target?: () => HTMLElement | null
}) {
  const lenis = useLenis()
  const strip = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const [shown, setShown] = useState(false)
  // Hovering a strip photo previews it full screen without selecting it (his ask, 27 Nov 2026).
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const showing = hoverIndex ?? index
  // Latest values for the key handler, without re-running the open/close effect.
  const reduced = useReducedMotion()
  const genieCanvas = useRef<HTMLCanvasElement>(null)
  const [minimizing, setMinimizing] = useState(false)
  const busy = useRef(false)

  // Close = macOS genie minimize into page 3's big photo frame, then unmount (his ask, 27 Nov 2026).
  const minimize = () => {
    if (busy.current) return
    busy.current = true
    const dock = target?.()
    const img = document.querySelector<HTMLImageElement>('.pv-photo[data-selected] img')
    const canvas = genieCanvas.current
    const rect = dock?.getBoundingClientRect()
    if (reduced || !dock || !img || !canvas || !rect || !rect.width || !img.naturalWidth) {
      onClose()
      return
    }
    setHoverIndex(null)
    setMinimizing(true)
    // The frame stays hidden until the photo lands in it, so there's never a double.
    dock.style.visibility = 'hidden'
    const view = canvas.closest<HTMLElement>('.pv')
    playGenie({
      canvas, img,
      focus: img.style.objectPosition || '50% 50%',
      target: rect,
      onProgress: (t) => view?.style.setProperty('--pv-bg', String(1 - Math.min(1, Math.max(0, (t - 0.2) / 0.6)))),
    }).then(() => {
      dock.style.removeProperty('visibility')
      onClose()
    })
  }
  const latest = useRef({ index, onIndex, minimize })
  latest.current = { index, onIndex, minimize }

  // Open: pause the page, focus the close button, animate in. Close restores everything.
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const root = document.documentElement
    const overflow = root.style.overflow
    lenis?.stop()
    root.style.overflow = 'hidden'
    closeButton.current?.focus({ preventScroll: true })
    const raf = requestAnimationFrame(() => setShown(true))
    const onKey = (e: KeyboardEvent) => {
      const { index: i, onIndex: go, minimize: close } = latest.current
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight') go((i + 1) % slides.length)
      else if (e.key === 'ArrowLeft') go((i - 1 + slides.length) % slides.length)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
      root.style.overflow = overflow
      lenis?.start()
      previousFocus?.focus({ preventScroll: true })
    }
  }, [lenis, slides.length])

  // Endless strip: many copies; the scroll position wraps back to the middle copy, and the
  // wheel (or trackpad) slides it sideways. It also glides slowly on its own unless hovered.
  useLayoutEffect(() => {
    const rail = strip.current
    const group = rail?.firstElementChild as HTMLElement | null
    if (!rail || !group) return
    let span = 0
    // Where the strip grows from: the pointer's spot over the strip, else its middle. When the
    // strip changes size (the hover grow), the photo at that spot stays put instead of
    // everything sliding out from the left edge (his ask, 27 Nov 2026).
    let anchorX: number | null = null
    const measure = () => {
      const width = group.getBoundingClientRect().width
      if (!width || span === width) return
      if (!span) {
        span = width
        rail.scrollLeft = span
        return
      }
      const anchor = anchorX ?? rail.clientWidth / 2
      const next = (rail.scrollLeft + anchor) * (width / span) - anchor
      span = width
      rail.scrollLeft = loop(next)
    }
    const track = (e: PointerEvent) => { anchorX = e.clientX - rail.getBoundingClientRect().left }
    const loop = (x: number) => span && (x < span * .5 || x >= span * 2) ? span + ((x % span) + span) % span : x
    const wrap = () => { const next = loop(rail.scrollLeft); if (next !== rail.scrollLeft) rail.scrollLeft = next }
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || !span) return
      e.preventDefault()
      e.stopPropagation()
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      rail.scrollLeft = loop(rail.scrollLeft + d * (e.deltaMode === 1 ? 16 : 1))
    }
    let hovered = false
    let frame = 0
    let previous = 0
    let remainder = 0
    const glide = (time: number) => {
      const elapsed = previous ? Math.min(64, time - previous) : 0
      previous = time
      if (!hovered) {
        remainder += elapsed * 0.045 // px per ms (was 0.028; his "little faster", 27 Nov 2026)
        const px = Math.floor(remainder)
        if (px) { rail.scrollLeft = loop(rail.scrollLeft + px); remainder -= px }
      }
      frame = requestAnimationFrame(glide)
    }
    const enter = (e: PointerEvent) => { hovered = e.pointerType === 'mouse'; track(e) }
    const leave = () => { hovered = false }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(group)
    // Endless wheel scroll from anywhere in the viewer, not only over the strip.
    const viewer = rail.closest('.pv') ?? rail
    viewer.addEventListener('wheel', wheel as EventListener, { passive: false })
    rail.addEventListener('scroll', wrap, { passive: true })
    rail.addEventListener('pointerenter', enter)
    rail.addEventListener('pointerleave', leave)
    rail.addEventListener('pointermove', track)
    frame = requestAnimationFrame(glide)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      viewer.removeEventListener('wheel', wheel as EventListener)
      rail.removeEventListener('scroll', wrap)
      rail.removeEventListener('pointerenter', enter)
      rail.removeEventListener('pointerleave', leave)
      rail.removeEventListener('pointermove', track)
    }
  }, [])

  return createPortal(
    <div className="pv" data-shown={shown || undefined} data-minimizing={minimizing || undefined}
      role="dialog" aria-modal="true" aria-label="Photo, full screen"
      onClick={(e) => { if (e.target === e.currentTarget) minimize() }}>
      <canvas ref={genieCanvas} className="pv-genie" aria-hidden="true" />
      <div className="pv-stage" onClick={(e) => { if (e.target === e.currentTarget) minimize() }}>
        {slides.map((s, i) => (
          <picture key={s.photo} className="pv-photo" data-selected={i === showing || undefined} aria-hidden={i !== showing}>
            {s.land && <source media="(min-aspect-ratio: 1/1)" srcSet={base + s.land} />}
            <img src={base + s.photo} alt={s.alt} draggable={false} style={{ objectPosition: s.focus }} />
          </picture>
        ))}
      </div>
      <button ref={closeButton} type="button" className="pv-close" aria-label="Close full-screen photo" onClick={minimize}>
        {/* Drawn X (not the × character), so it sits exactly in the circle's centre. */}
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M3 3 13 13M13 3 3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      <div ref={strip} className="pv-strip" data-lenis-prevent-wheel aria-label="Choose a photo"
        onPointerLeave={() => setHoverIndex(null)}>
        {COPIES.map(copy => (
          <div className="pv-strip-set" key={copy} aria-hidden={copy !== 1 || undefined}>
            {slides.map((s, i) => (
              <button key={s.photo} type="button" tabIndex={copy === 1 ? 0 : -1}
                aria-label={`Photo ${i + 1} of ${slides.length}: ${s.title}`}
                aria-current={i === index || undefined}
                onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHoverIndex(i) }}
                onClick={() => { setHoverIndex(null); onIndex(i) }}>
                <img src={base + s.photo} alt="" draggable={false} style={{ objectPosition: s.focus }} />
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>,
    document.body,
  )
}
