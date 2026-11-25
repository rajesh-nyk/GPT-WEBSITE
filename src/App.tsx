import { useEffect, useRef } from 'react'
import { Hero } from './components/hero/Hero'
import { WorldCanvas } from './components/world/WorldCanvas'
import { SlicedPageTwo } from './components/SlicedPageTwo'

export default function App() {
  const velocityOutput = useRef<HTMLOutputElement>(null)

  useEffect(() => {
    // Measure real rendered document displacement, not raw wheel-event input
    // or Lenis's queued destination. No per-frame React render or layout work.
    let previousY = window.scrollY
    let previousTime = performance.now()
    const reset = () => {
      previousY = window.scrollY
      previousTime = performance.now()
      if (velocityOutput.current) velocityOutput.current.textContent = '0 px/s'
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
    }, 200)
    document.addEventListener('visibilitychange', reset)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', reset)
    }
  }, [])

  return (
    <>
      <main className="relative">
        <div className="chapter-panel chapter-panel--hero">
          <WorldCanvas />
          <Hero nextId="page-2" />
        </div>
        <SlicedPageTwo />
      </main>
      <div className="scene-fps" aria-label="Performance testing">
        <output id="scene-fps" aria-label="WebGL frames per second" aria-live="off">-- FPS</output>
        <span className="scene-fps__divider" aria-hidden="true" />
        <output ref={velocityOutput} id="scene-velocity" aria-label="Page scroll velocity in pixels per second" aria-live="off">0 px/s</output>
      </div>
    </>
  )
}
