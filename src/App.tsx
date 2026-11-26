import { useEffect, useRef } from 'react'
import { Hero } from './components/hero/Hero'
import { WorldCanvas } from './components/world/WorldCanvas'
import { SlicedPageTwo } from './components/SlicedPageTwo'
import { PageThreePortraits } from './components/world/PageThreePortraits'
import { ganeshaPosition } from './components/world/PageTwoGanesha'
import { BlessingSky } from './components/world/PageTwoSky'

const formatAxis = (value: number) => (Math.abs(value) < 0.005 ? 0 : value).toFixed(2)

export default function App() {
  const diagnostics = new URLSearchParams(window.location.search).has('diagnostics')
  const velocityOutput = useRef<HTMLOutputElement>(null)
  const scrollOutput = useRef<HTMLOutputElement>(null)
  const positionOutput = useRef<HTMLOutputElement>(null)
  const fpsOutput = useRef<HTMLOutputElement>(null)

  useEffect(() => {
    if (!diagnostics) return
    // Measure real rendered document displacement, not raw wheel-event input
    // or Lenis's queued destination. No per-frame React render or layout work.
    let previousY = window.scrollY
    let previousTime = performance.now()
    const pageTwo = document.getElementById('page-2')
    const updateReadouts = (y: number) => {
      const root = document.documentElement
      const range = root.scrollHeight - root.clientHeight
      const middle = pageTwo ? pageTwo.getBoundingClientRect().top + y : range / 2
      const progress = y <= middle
        ? 50 * Math.max(0, y / Math.max(1, middle))
        : 50 + 50 * Math.min(1, (y - middle) / Math.max(1, range - middle))
      if (scrollOutput.current) scrollOutput.current.textContent = `Scroll ${progress.toFixed(1)}%`
      if (range > 0 && y >= range && fpsOutput.current) {
        fpsOutput.current.textContent = '-- FPS'
        fpsOutput.current.removeAttribute('data-rate')
      }
      const seat = ganeshaPosition.sample?.()
      if (positionOutput.current) {
        positionOutput.current.textContent = seat
          ? `Ganesha X ${formatAxis(seat.x)} Y ${formatAxis(seat.y)} Z ${formatAxis(seat.z)}`
          : 'Ganesha X — Y — Z —'
      }
    }
    const reset = () => {
      previousY = window.scrollY
      previousTime = performance.now()
      if (velocityOutput.current) velocityOutput.current.textContent = '0 px/s'
      updateReadouts(previousY)
    }
    const timer = window.setInterval(() => {
      const now = performance.now()
      const y = window.scrollY
      if (document.hidden || now - previousTime > 1000) {
        reset()
        return
      }
      const elapsed = (now - previousTime) / 1000
      const velocity = elapsed > 0 ? Math.round((y - previousY) / elapsed) : 0
      previousY = y
      previousTime = now
      if (velocityOutput.current) {
        velocityOutput.current.textContent = (velocity > 0 ? '+' : '') + velocity + ' px/s'
      }
      updateReadouts(y)
    }, 200)
    document.addEventListener('visibilitychange', reset)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', reset)
    }
  }, [diagnostics])

  return (
    <>
      <main className="relative">
        <div className="blessing-journey relative">
          <BlessingSky />
          <div className="chapter-panel chapter-panel--hero">
            <WorldCanvas />
            <Hero nextId="page-2" />
          </div>
          <SlicedPageTwo />
          <div className="blessing-journey-mist" aria-hidden="true" />
        </div>
        <PageThreePortraits />
      </main>
      {diagnostics && <div className="scene-fps" role="group" aria-label="Scene diagnostics">
        <div className="scene-fps__group">
          <output ref={fpsOutput} id="scene-fps" aria-label="WebGL frames per second" aria-live="off">-- FPS</output>
          <span className="scene-fps__divider" aria-hidden="true" />
          <output ref={velocityOutput} id="scene-velocity" aria-label="Page scroll velocity in pixels per second" aria-live="off">0 px/s</output>
          <span className="scene-fps__divider" aria-hidden="true" />
          <output ref={scrollOutput} id="scene-scroll" aria-label="Scroll progress" aria-live="off">Scroll 0.0%</output>
        </div>
        <output ref={positionOutput} id="scene-ganesha-position" aria-label="Ganesha seat position in scene coordinates" aria-live="off">Ganesha X — Y — Z —</output>
      </div>}
    </>
  )
}
