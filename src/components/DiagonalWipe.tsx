import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { ScrollTrigger } from '../lib/gsap'
import { useReducedMotion } from '../lib/useReducedMotion'

type Props = {
  from: string
  className?: string
  children?: ReactNode
  geometry?: { shift: number; lead: number }
  holdOutgoing?: { offset: number; visibleBottom: number }
}

export function DiagonalWipe({ from, className = '', children, geometry, holdOutgoing }: Props) {
  const layer = useRef<HTMLDivElement>(null)
  const rim = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()

  useLayoutEffect(() => {
    const source = document.getElementById(from)
    const panel = layer.current
    const edge = rim.current
    if (!source || !panel || !edge || reducedMotion) return

    let lead = 0
    let clearance = 0
    const update = ({ progress, start, end }: ScrollTrigger) => {
      const p = Math.max(0, Math.min(1, progress))
      // The right corner enters at the viewport bottom. On arrival the left corner clears the top.
      const shift = Number((lead * (1 - p) - clearance * p).toFixed(2))
      if (geometry) {
        geometry.shift = shift
        geometry.lead = Number(lead.toFixed(2))
      }
      if (holdOutgoing) {
        const distance = Math.max(1, end - start)
        // Pin the outgoing composition until the diagonal has completely covered it.
        // Release only once hidden, so Ganesha never slides out under a moving edge.
        // The same mapping is reversible when scrolling back.
        holdOutgoing.offset = p < 1 ? distance * p : 0
        holdOutgoing.visibleBottom = Math.max(0, Math.min(window.innerHeight, distance * (1 - p) + shift))
        source.style.setProperty('--wipe-hold-offset', `${holdOutgoing.offset}px`)
      }
      const offset = `${shift}px`
      panel.style.clipPath = `polygon(0 calc(var(--overhang) + ${offset}), 100% calc(var(--overhang) + ${offset} - var(--lead)), 100% 100%, 0 100%)`
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
      const overhang = Math.min(window.innerHeight * 0.28, window.innerWidth * 0.20)
      lead = Math.min(window.innerHeight * 0.23, window.innerWidth * 0.16, Math.max(0, overhang - 42))
      clearance = Math.min(40, Math.max(0, overhang - lead - 2))
      const width = Math.max(1, panel.clientWidth)
      // Only resizes change the angle. Scroll moves the edge without changing its slope.
      panel.style.setProperty('--lead', `${lead.toFixed(2)}px`)
      edge.style.setProperty('--rim-angle', `${-Math.atan2(lead, width)}rad`)
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
      if (geometry) geometry.shift = geometry.lead = 0
      if (holdOutgoing) {
        holdOutgoing.offset = 0
        holdOutgoing.visibleBottom = Infinity
        source.style.removeProperty('--wipe-hold-offset')
      }
      panel.style.removeProperty('--lead')
      panel.style.removeProperty('clip-path')
      edge.style.removeProperty('transform')
      edge.style.removeProperty('--rim-angle')
      edge.style.removeProperty('--rim-width')
      edge.style.removeProperty('--rim-energy')
    }
  }, [from, geometry, holdOutgoing, reducedMotion])

  return (
    <div ref={layer} className={`page-angle ${className}`} aria-hidden="true">
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
            background: 'linear-gradient(to bottom, rgb(220 210 255 / .38) 0px, rgb(180 157 240 / .16) 1px, rgb(140 109 210 / .07) 3px, transparent 12px)',
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
