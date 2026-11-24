import { useEffect, useRef } from 'react'
import { glowCenters } from '../world/screenShapes'
import { journey } from '../world/journey'
import { orbMotionDebug } from '../world/lotus/orbMotion'

type Point = { x: number; y: number }

/** DEV overlay: traces the Ganesha glow's projected screen path in real time. */
export function GlowPathOverlay() {
  const svg = useRef<SVGSVGElement>(null)
  const path = useRef<SVGPolylineElement>(null)
  const marker = useRef<SVGCircleElement>(null)
  const radius = useRef<SVGCircleElement>(null)
  const crossX = useRef<SVGLineElement>(null)
  const crossY = useRef<SVGLineElement>(null)
  const readout = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let raf = 0
    let lastT = -1
    const points: Point[] = []

    const draw = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      const x = glowCenters.ganesha[0] * width
      const y = (1 - glowCenters.ganesha[1]) * height
      const active = journey.t >= 0.68 && journey.t <= 2.85

      if (journey.t < lastT - 0.03 || !active) points.length = 0
      lastT = journey.t
      if (active) {
        const previous = points.at(-1)
        if (!previous || Math.hypot(x - previous.x, y - previous.y) > 1.5) points.push({ x, y })
        if (points.length > 900) points.shift()
      }

      svg.current?.setAttribute('viewBox', `0 0 ${width} ${height}`)
      path.current?.setAttribute('points', points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' '))
      marker.current?.setAttribute('cx', String(x))
      marker.current?.setAttribute('cy', String(y))
      radius.current?.setAttribute('cx', String(x))
      radius.current?.setAttribute('cy', String(y))
      radius.current?.setAttribute('r', String(orbMotionDebug.radiusPx))
      crossX.current?.setAttribute('x1', String(x - 16))
      crossX.current?.setAttribute('x2', String(x + 16))
      crossX.current?.setAttribute('y1', String(y))
      crossX.current?.setAttribute('y2', String(y))
      crossY.current?.setAttribute('x1', String(x))
      crossY.current?.setAttribute('x2', String(x))
      crossY.current?.setAttribute('y1', String(y - 16))
      crossY.current?.setAttribute('y2', String(y + 16))
      if (readout.current) readout.current.textContent = `X ${x.toFixed(0)} · Y ${y.toFixed(0)} · R ${orbMotionDebug.radiusPx.toFixed(0)} · T ${journey.t.toFixed(3)}`
      if (svg.current) svg.current.style.opacity = active ? '1' : '0.2'
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="pointer-events-none fixed inset-0 z-[119]" aria-hidden="true">
      <svg ref={svg} className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        <polyline ref={path} fill="none" stroke="#65e8ff" strokeWidth="2" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
        <circle ref={radius} fill="none" stroke="#65e8ff" strokeOpacity=".35" strokeWidth="1" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />
        <circle ref={marker} r="6" fill="#08070a" stroke="#fff2af" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <line ref={crossX} stroke="#fff2af" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <line ref={crossY} stroke="#fff2af" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="absolute right-3 top-3 rounded-lg border border-cyan-300/40 bg-black/80 px-3 py-2 font-mono text-[11px] text-cyan-100 backdrop-blur-sm">
        <span className="mr-2 text-[#fff2af]">GLOW PATH</span>
        <span ref={readout}>X — · Y — · T —</span>
      </div>
    </div>
  )
}
