import { useEffect, useRef } from 'react'
import { Hero } from './components/hero/Hero'
import { WorldCanvas } from './components/world/WorldCanvas'

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
      <WorldCanvas />
      <main className="relative">
        <Hero nextId="page-2" />
        <section
          id="page-2"
          data-scroll-scene=""
          aria-label="Page 2"
          className="relative z-10 min-h-dvh w-full text-gold-light"
          style={{ background: 'linear-gradient(155deg, #170d35 0%, #49218a 48%, #782cc2 100%)' }}
        />
      </main>
      <div className="scene-fps" aria-label="Performance testing">
        <output id="scene-fps" aria-label="WebGL frames per second" aria-live="off">-- FPS</output>
        <span className="scene-fps__divider" aria-hidden="true" />
        <output ref={velocityOutput} id="scene-velocity" aria-label="Page scroll velocity in pixels per second" aria-live="off">0 px/s</output>
      </div>
    </>
  )
}
