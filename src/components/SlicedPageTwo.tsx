import { useId, useLayoutEffect, useRef } from 'react'
import { ScrollTrigger } from '../lib/gsap'
import { useReducedMotion } from '../lib/useReducedMotion'
import { PageTwoSky } from './world/PageTwoSky'

/** A softly curved, feathered optical-glass wipe. One scroll clock drives
 * the mask and every reflection, so reversing is seamless. */
export function SlicedPageTwo() {
  const root = useRef<HTMLElement>(null)
  const layer = useRef<HTMLDivElement>(null)
  const maskPath = useRef<SVGPathElement>(null)
  const blur = useRef<SVGFEGaussianBlurElement>(null)
  const rim = useRef<SVGSVGElement>(null)
  const edge = useRef<SVGPathElement>(null)
  const reducedMotion = useReducedMotion()
  const id = 'page2-' + useId().replace(/[^a-zA-Z0-9_-]/g, '')

  useLayoutEffect(() => {
    const hero = document.getElementById('hero')
    const section = root.current
    const panel = layer.current
    const mask = maskPath.current
    const feather = blur.current
    const opticalRim = rim.current
    const outline = edge.current
    if (!hero || !section || !panel || !mask || !feather || !opticalRim || !outline) return

    let width = 1
    let height = 1
    let overhang = 0
    let amplitude = 0
    const measure = () => {
      width = Math.max(1, panel.clientWidth)
      height = Math.max(1, panel.clientHeight)
      overhang = Math.max(0, height - section.clientHeight)
      amplitude = Math.min(overhang * .86, window.innerHeight * .23, width * .16)
      opticalRim.setAttribute('viewBox', `0 0 ${width} ${height}`)
    }
    const render = (progress: number) => {
      const p = reducedMotion ? 0 : Math.max(0, Math.min(1, progress))
      const envelope = p <= 0 || p >= 1 ? 0 : Math.sin(Math.PI * p) ** 1.35
      const lead = amplitude * envelope
      const y0 = overhang
      const y1 = overhang - lead
      // A restrained S-curve, with gentle tangents rather than a hard slash.
      const c1 = y0 - lead * .12
      const c2 = y1 + lead * .12
      const start = y0 / height
      const end = y1 / height
      mask.setAttribute('d', `M -.025 ${start} L 0 ${start} C .30 ${c1 / height} .70 ${c2 / height} 1 ${end} L 1.025 ${end} V 1.04 H -.025 Z`)
      // Feather only while moving; the resting panel is completely opaque.
      feather.setAttribute('stdDeviation', `${.65 * envelope / width} ${3.2 * envelope / height}`)
      outline.setAttribute('d', `M 0 ${y0} C ${width * .30} ${c1} ${width * .70} ${c2} ${width} ${y1}`)
      section.style.setProperty('--glass-energy', String(envelope))
    }
    measure()
    const trigger = reducedMotion ? null : ScrollTrigger.create({
      trigger: hero,
      start: 'top top',
      end: 'bottom top',
      onUpdate: self => render(self.progress),
      onRefresh: self => { measure(); render(self.progress) },
    })
    const resize = new ResizeObserver(() => {
      measure()
      render(trigger?.progress ?? 0)
    })
    resize.observe(panel)
    render(trigger?.progress ?? 0)
    return () => {
      trigger?.kill()
      resize.disconnect()
      section.style.removeProperty('--glass-energy')
    }
  }, [reducedMotion])

  return (
    <section
      ref={root}
      id="page-2"
      data-scroll-scene=""
      aria-label="Page 2"
      className="chapter-panel chapter-panel--sliced relative z-10 min-h-dvh w-full text-gold-light"
    >
      <svg className="page-angle-defs" width="0" height="0" aria-hidden="true">
        <defs>
          <filter id={id + '-feather'} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x="-.05" y="-.05" width="1.10" height="1.10">
            <feGaussianBlur ref={blur} stdDeviation="0" />
          </filter>
          <mask id={id + '-mask'} maskUnits="objectBoundingBox" maskContentUnits="objectBoundingBox" x="0" y="0" width="1" height="1">
            <path ref={maskPath} d="M -.025 .2 H 1.025 V 1.04 H -.025 Z" fill="white" filter={`url(#${id}-feather)`} />
          </mask>
          <linearGradient id={id + '-prism'} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#fff" stopOpacity=".12" />
            <stop offset="22%" stopColor="#a8c4ff" stopOpacity=".56" />
            <stop offset="42%" stopColor="#b9fff5" stopOpacity=".7" />
            <stop offset="54%" stopColor="#fff5da" stopOpacity=".8" />
            <stop offset="68%" stopColor="#f1b6dc" stopOpacity=".55" />
            <stop offset="83%" stopColor="#a9a4f2" stopOpacity=".38" />
            <stop offset="100%" stopColor="#fff" stopOpacity=".1" />
          </linearGradient>
        </defs>
      </svg>
      <div ref={layer} className="page-angle" style={{ mask: `url(#${id}-mask)`, WebkitMask: `url(#${id}-mask)` }} aria-hidden="true">
        <PageTwoSky />
        <div className="page-glass" />
      </div>
      <svg ref={rim} className="page-angle-rim" aria-hidden="true" preserveAspectRatio="none">
        <defs><path ref={edge} id={id + '-edge'} /></defs>
        <use href={`#${id}-edge`} className="page-angle-rim__bloom" stroke={`url(#${id}-prism)`} />
        <use href={`#${id}-edge`} className="page-angle-rim__bevel" stroke={`url(#${id}-prism)`} />
        <use href={`#${id}-edge`} className="page-angle-rim__line" stroke="rgba(230,237,255,.62)" />
      </svg>
    </section>
  )
}
