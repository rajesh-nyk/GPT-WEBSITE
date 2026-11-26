import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { ScrollTrigger } from '../lib/gsap'
import { useReducedMotion } from '../lib/useReducedMotion'

type Props = {
  from: string
  className?: string
  children?: ReactNode
  holdOutgoing?: { offset: number; visibleBottom: number }
}

export function DiagonalWipe({ from, className = '', children, holdOutgoing }: Props) {
  const layer = useRef<HTMLDivElement>(null)
  const rim = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()

  useLayoutEffect(() => {
    const source = document.getElementById(from)
    const panel = layer.current
    const edge = rim.current
    if (!source || !panel || !edge || reducedMotion) return

    // Extend only the outgoing sky under the diagonal. Ganesha and the
    // full page-two stage keep their original size and natural document motion.
    const outgoingSky = holdOutgoing
      ? source.closest('.blessing-journey')?.querySelector<HTMLElement>('.blessing-journey-sky')
      : null
    let feather = 0
    let overhang = 0
    let angle = 0
    let lead = 0
    let clearance = 0
    const update = ({ progress, start, end }: ScrollTrigger) => {
      const p = Math.max(0, Math.min(1, progress))
      // The right corner enters at the viewport bottom. On arrival the left corner clears the top.
      const shift = Number((lead * (1 - p) - clearance * p).toFixed(2))
      const slopeScale = Math.cos(angle)
      if (holdOutgoing) {
        const distance = Math.max(1, end - start)
        // Zero compensation from the very first pixel of scroll.
        // Both chapters now follow the same document displacement immediately.
        // The sky overscan, not a hold on the outgoing stage, covers the seam.
        holdOutgoing.offset = 0
        // Keep the clouds drawing until both masks are opaque at the left edge.
        const opaqueEdge = Math.max(0, shift + 2 * feather * (1 - p) / slopeScale)
        holdOutgoing.visibleBottom = Math.min(window.innerHeight, distance * (1 - p) + opaqueEdge)
      }
      const offset = `${shift}px`
      if (holdOutgoing) {
        panel.style.clipPath = 'none'
        // Keep the entering side transparent at departure and the whole viewport opaque on arrival.
        const stop = (overhang + shift) * slopeScale + feather * (1 - 2 * p)
        panel.style.maskImage = `linear-gradient(${Math.PI - angle}rad, transparent ${stop - feather}px, black ${stop + feather}px), linear-gradient(transparent, black ${overhang}px)`
        panel.style.maskComposite = 'intersect'
      } else {
        panel.style.clipPath = `polygon(0 calc(var(--overhang) + ${offset}), 100% calc(var(--overhang) + ${offset} - var(--lead)), 100% 100%, 0 100%)`
      }
      edge.style.transform = `translateY(${offset}) rotate(var(--rim-angle))`
      if (holdOutgoing) {
        // A soft optical edge, visible only while the wipe is moving through the frame.
        const fade = (x: number) => {
          const t = Math.max(0, Math.min(1, x))
          return t * t * (3 - 2 * t)
        }
        edge.style.setProperty('--rim-energy', String(fade(p / 0.16) * fade((1 - p) / 0.18)))
      } else {
        edge.style.setProperty('--rim-energy', String(Math.min(1, Math.sin(Math.PI * p) ** 0.8 * 1.8)))
      }
    }
    const refresh = (trigger: ScrollTrigger) => {
      overhang = Math.min(window.innerHeight * 0.28, window.innerWidth * 0.20)
      feather = Math.min(160, window.innerHeight * 0.16)
      lead = Math.min(window.innerHeight * 0.23, window.innerWidth * 0.16, Math.max(0, overhang - 42))
      clearance = Math.min(40, Math.max(0, overhang - lead - 2))
      const width = Math.max(1, panel.clientWidth)
      angle = Math.atan2(lead, width)
      // Extend the sky past the full fade so its bottom never shows through.
      if (outgoingSky) outgoingSky.style.bottom = `${-Math.ceil(lead + 2 * feather / Math.cos(angle) + 2)}px`
      // Only resizes change the angle. Scroll moves the edge without changing its slope.
      panel.style.setProperty('--lead', `${lead.toFixed(2)}px`)
      edge.style.setProperty('--rim-angle', `${-angle}rad`)
      edge.style.setProperty('--rim-width', `${Math.hypot(width, lead)}px`)
      update(trigger)
    }
    const trigger = ScrollTrigger.create({
      trigger: source,
      start: 'top top',
      end: 'bottom top',
      onUpdate: update,
      onRefresh: refresh,
    })
    refresh(trigger)

    return () => {
      trigger.kill()
      outgoingSky?.style.removeProperty('bottom')
      if (holdOutgoing) {
        holdOutgoing.offset = 0
        holdOutgoing.visibleBottom = Infinity
        source.style.removeProperty('--wipe-hold-offset')
      }
      panel.style.removeProperty('--lead')
      panel.style.removeProperty('clip-path')
      panel.style.removeProperty('mask-image')
      panel.style.removeProperty('mask-composite')
      edge.style.removeProperty('transform')
      edge.style.removeProperty('--rim-angle')
      edge.style.removeProperty('--rim-width')
      edge.style.removeProperty('--rim-energy')
    }
  }, [from, holdOutgoing, reducedMotion])

  return (
    <div ref={layer} className={`page-angle ${className}`} aria-hidden={children ? undefined : true}>
      {children}
      {holdOutgoing ? (
        <div
          ref={rim}
          className="page-cinematic-rim"
          style={{
            position: 'absolute',
            left: 0,
            top: 'var(--overhang)',
            width: 'var(--rim-width, 100%)',
            height: '12px',
            transformOrigin: '0 0',
            transform: 'rotate(var(--rim-angle, 0rad))',
            // No purple line on the edge (Rajesh, 26 Nov 2026): page 3 meets page 2 clean.
            background: 'none',
            opacity: 'var(--rim-energy, 0)',
            pointerEvents: 'none',
          }}
        />
      ) : (
        <div ref={rim} className="page-glass-rim" />
      )}
    </div>
  )
}
