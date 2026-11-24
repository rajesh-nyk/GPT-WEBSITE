import { useEffect, useRef } from 'react'
import { gsap, MOTION_OK } from '../../lib/gsap'

const DESKTOP = `(hover: hover) and (pointer: fine) and ${MOTION_OK} and (forced-colors: none)`
const INTERACTIVE = 'a[href], button:not(:disabled), [role="button"], [role="link"], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, label, [data-cursor="hover"]'

/** Tiny, precise champagne-gold pointer. Living Constellation remains in the
 * existing WebGL canvas; this only supplies the visual pointer hotspot. */
export function RoyalInteractionCursor() {
  const root = useRef<HTMLDivElement>(null)
  const flash = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const el = root.current
    if (!el) return
    const html = document.documentElement
    const media = window.matchMedia(DESKTOP)
    let x = 0
    let y = 0
    let visible = false
    let pulse: gsap.core.Tween | null = null
    gsap.set(el, { x: 0, y: 0, force3D: true })
    // Reuse the same two tweens; no allocation or React render per pointer event.
    const xTo = gsap.quickTo(el, 'x', { duration: 0.075, ease: 'power3.out' })
    const yTo = gsap.quickTo(el, 'y', { duration: 0.075, ease: 'power3.out' })

    const hide = () => {
      visible = false
      el.dataset.visible = 'false'
      el.dataset.hover = 'false'
      html.classList.remove('has-royal-cursor')
      xTo.tween.pause()
      yTo.tween.pause()
      pulse?.kill()
      if (flash.current) gsap.set(flash.current, { opacity: 0 })
    }
    const hover = (target: Element | null) => {
      const next = String(!!target?.closest(INTERACTIVE))
      if (el.dataset.hover !== next) el.dataset.hover = next
    }
    const move = (e: PointerEvent) => {
      if (!media.matches || e.pointerType !== 'mouse' || !html.hasAttribute('data-site-ready')) {
        hide()
        return
      }
      x = e.clientX
      y = e.clientY
      if (!visible) {
        // First movement after enter/blur: snap, never fly in from an old position.
        xTo(x, x)
        yTo(y, y)
        gsap.set(el, { x, y, force3D: true })
      } else {
        xTo(x)
        yTo(y)
      }
      hover(e.target instanceof Element ? e.target : document.elementFromPoint(x, y))
      if (!visible) {
        visible = true
        el.dataset.visible = 'true'
        html.classList.add('has-royal-cursor')
      }
    }
    const scroll = () => {
      if (visible) hover(document.elementFromPoint(x, y))
    }
    const down = (e: PointerEvent) => {
      if (!visible || e.pointerType !== 'mouse' || e.button !== 0 || !flash.current) return
      pulse?.kill()
      pulse = gsap.fromTo(flash.current,
        { opacity: 0.95, scale: 0.6 },
        { opacity: 0, scale: 1.45, duration: 0.24, ease: 'power3.out', overwrite: true },
      )
    }
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerdown', down, { passive: true })
    window.addEventListener('pointercancel', hide)
    window.addEventListener('scroll', scroll, { passive: true, capture: true })
    window.addEventListener('blur', hide)
    html.addEventListener('pointerleave', hide)
    media.addEventListener('change', hide)
    return () => {
      hide()
      xTo.tween.kill()
      yTo.tween.kill()
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointercancel', hide)
      window.removeEventListener('scroll', scroll, true)
      window.removeEventListener('blur', hide)
      html.removeEventListener('pointerleave', hide)
      media.removeEventListener('change', hide)
    }
  }, [])

  return (
    <div ref={root} aria-hidden="true" className="royal-interaction-cursor" data-visible="false" data-hover="false">
      <span className="royal-interaction-cursor__dot" />
      <svg className="royal-interaction-cursor__spark" viewBox="0 0 20 20" fill="currentColor">
        <path d="M10 0 Q10.9 9.1 20 10 Q10.9 10.9 10 20 Q9.1 10.9 0 10 Q9.1 9.1 10 0Z" />
        <circle cx="10" cy="10" r="1.6" fill="#fff9e8" />
      </svg>
      <svg ref={flash} className="royal-interaction-cursor__flash" viewBox="0 0 20 20" fill="currentColor">
        <path d="M10 1 Q11 9 19 10 Q11 11 10 19 Q9 11 1 10 Q9 9 10 1Z" />
      </svg>
    </div>
  )
}
