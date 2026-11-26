import { useEffect, useRef } from 'react'
import { SkipLink } from './components/SkipLink'
import { Hero } from './components/hero/Hero'
import { WorldCanvas } from './components/world/WorldCanvas'
import { SlicedPageTwo } from './components/SlicedPageTwo'
import { DiagonalWipe } from './components/DiagonalWipe'
import { PageThreeStage, SHOW_PAGE_THREE_STAGE } from './components/PageThreeStage'
import { ganeshaPosition } from './components/world/PageTwoGanesha'
import { BlessingSky, pageTwoExit } from './components/world/PageTwoSky'

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
      <SkipLink href="#page-2" />
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
        <section id="page-3" data-scroll-scene="" aria-label="Our story, framed" className="chapter-panel chapter-panel--sliced z-20 h-dvh">
          {SHOW_PAGE_THREE_STAGE
            ? (
              <DiagonalWipe from="page-2" className="page-angle--black" holdOutgoing={pageTwoExit}>
                {/* Swapped (Rajesh, 27 Nov 2026): page 3 now has the framed story, page 5 the full-screen one. */}
                <div className="p3-wipe-body"><PageThreeStage fill={false} /></div>
              </DiagonalWipe>
            )
            : <DiagonalWipe from="page-2" className="page-angle--purple" holdOutgoing={pageTwoExit} />}
        </section>
        {/* Page 4: plain black for now (Rajesh, 26 Nov 2026); content to come. */}
        <section id="page-4" data-scroll-scene="" aria-label="Closing blessing" className="relative z-20 grid h-dvh place-items-center bg-black px-6 text-center">
          <div>
            <p className="font-[var(--font-odia)] text-[clamp(1.4rem,3vw,2.4rem)] text-[color:var(--color-chapter-ivory)]">ଶୁଭ ବିବାହ</p>
            <p className="mt-5 font-[var(--font-inscription)] text-[clamp(.8rem,1.2vw,1.05rem)] font-semibold uppercase tracking-[.22em] text-[color:var(--color-chapter-champagne)]">Rajesh &amp; Chinmayee · 27 Jan · 26 Feb · 3 Mar · 2027</p>
          </div>
        </section>
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
