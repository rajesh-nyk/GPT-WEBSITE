import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLenis } from '../lib/LenisProvider'
import { ScrollTrigger } from '../lib/gsap'
import { preloadModels } from '../lib/preloadModels'
import { preloadFonts } from '../lib/fonts'
import { variantIsUltra } from '../lib/models'
import { useQuality } from '../lib/quality'
import { useReducedMotion } from '../lib/useReducedMotion'
import { heroFx } from './hero/fx'

type Phase = 'loading' | 'revealing' | 'done'

let loadProgress = 0
let loadJob: Promise<unknown> | null = null
function startLoading(ultra: boolean) {
  loadJob ??= Promise.all([preloadModels(ultra, (p) => (loadProgress = p)), preloadFonts()])
  return loadJob
}

/**
 * Full-screen loader. Holds the site back until:
 *   - every .glb in /public/models is downloaded and parsed,
 *   - GPU tier detection has finished (so the first frame renders at the right quality),
 *   - web fonts are ready (no text reflow after reveal).
 *
 * Progress is drawn by writing transform/textContent directly in rAF — no React
 * re-render per frame, and only compositor-friendly properties (scaleX) animate.
 */
export function Preloader({ children }: { children: ReactNode }) {
  const quality = useQuality()
  const lenis = useLenis()
  const reducedMotion = useReducedMotion()

  const [phase, setPhase] = useState<Phase>('loading')
  const [assetsDone, setAssetsDone] = useState(false)

  const target = useRef(0)
  const overlay = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const label = useRef<HTMLSpanElement>(null)
  const rim = useRef<SVGCircleElement>(null)
  const spokes = useRef<SVGGElement>(null)

  const ready = assetsDone && quality.ready

  // 1. Load everything (once per page load, even under StrictMode's double effects).
  //    Waits for GPU detection first: it decides standard vs @ultra model files.
  const ultra = variantIsUltra(quality.assetTier === 'high')
  useEffect(() => {
    if (!quality.ready) return
    let cancelled = false
    const sync = () => (target.current = loadProgress)
    const timer = setInterval(sync, 50)
    startLoading(ultra)
      .then(sync)
      .finally(() => !cancelled && setAssetsDone(true))
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [quality.ready, ultra])

  // 2. Draw progress (eased) until it reaches 100%, then start the reveal.
  useEffect(() => {
    if (phase !== 'loading') return
    let shown = 0
    let lastPercent = -1
    let raf = 0
    const draw = () => {
      // Hold at 99% until really ready so the bar never sits at 100% doing nothing.
      const goal = ready ? 1 : Math.min(target.current, 0.99)
      shown = reducedMotion ? goal : shown + (goal - shown) * 0.12
      if (goal - shown < 0.002) shown = goal

      const percent = Math.round(shown * 100)
      if (bar.current) bar.current.style.transform = `scaleX(${shown})`
      if (rim.current) rim.current.style.strokeDashoffset = String(1 - shown)
      if (spokes.current) {
        const lit = Math.floor(shown * 8 + 0.0001)
        spokes.current.querySelectorAll('line').forEach((l, i) => l.classList.toggle('is-lit', i < lit))
      }
      if (percent !== lastPercent && label.current && overlay.current) {
        label.current.textContent = String(percent).padStart(3, '0')
        overlay.current.setAttribute('aria-valuenow', String(percent))
        lastPercent = percent
      }

      if (ready && shown === 1) setPhase('revealing')
      else raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [phase, ready, reducedMotion])

  // 3. Hold page one through the loader reveal and the rendered sunrise.
  useEffect(() => {
    const root = document.documentElement
    if (phase !== 'done') {
      history.scrollRestoration = 'manual'
      root.style.overflow = 'hidden'
      lenis?.stop()
      return
    }

    if (!root.hasAttribute('data-site-ready')) window.scrollTo(0, 0)
    root.dataset.siteReady = ''
    let raf = 0
    const releaseAfterSunrise = () => {
      if (!reducedMotion && heroFx.rise < 1) {
        raf = requestAnimationFrame(releaseAfterSunrise)
        return
      }
      root.style.overflow = ''
      lenis?.start()
      ScrollTrigger.refresh()
    }
    releaseAfterSunrise()
    return () => cancelAnimationFrame(raf)
  }, [phase, lenis, reducedMotion])

  // 4. Reveal: wait two frames so the site has painted underneath, then slide away.
  useEffect(() => {
    if (phase !== 'revealing') return
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => overlay.current?.setAttribute('data-exit', ''))
    })
    // Safety net: transitionend can be skipped (background tab, interrupted transition).
    const fallback = setTimeout(() => setPhase('done'), 1500)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(fallback)
    }
  }, [phase])

  return (
    <>
      {phase !== 'loading' && <div inert={phase !== 'done'}>{children}</div>}

      {/* While loading, the page still has its landmark and heading (search engines and
          screen readers); the real <main> takes over when the site mounts. */}
      {phase === 'loading' && (
        <main className="sr-only">
          <h1>Rajesh &amp; Chinmayee</h1>
          <p>The wedding of Rajesh and Chinmayee in Odisha: 27 January, 26 February and 3 March 2027.</p>
        </main>
      )}

      {phase !== 'done' && (
        <div
          ref={overlay}
          role="progressbar"
          aria-label="Loading site"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={0}
          onTransitionEnd={(e) => e.target === e.currentTarget && setPhase('done')}
          className="loader fixed inset-0 z-50 bg-ink text-gold-light"
        >
          {/* The wheel's outline, drawn exactly where the 3D wheel will appear — the rim
              fills with progress, one spoke per eighth; on exit it dissolves into the
              dawn and the real wheel catches the light in the same place. */}
          <svg aria-hidden viewBox="0 0 100 100" className="loader-wheel">
            <circle cx="50" cy="50" r="49" className="loader-track" />
            <circle ref={rim} cx="50" cy="50" r="49" pathLength={1} transform="rotate(-90 50 50)" className="loader-rim" />
            <circle cx="50" cy="50" r="38" className="loader-track" />
            <circle cx="50" cy="50" r="7" className="loader-track" />
            <g ref={spokes}>
              {Array.from({ length: 8 }, (_, i) => {
                const a = (i / 8) * Math.PI * 2 - Math.PI / 2
                return (
                  <line
                    key={i}
                    x1={50 + Math.cos(a) * 7}
                    y1={50 + Math.sin(a) * 7}
                    x2={50 + Math.cos(a) * 38}
                    y2={50 + Math.sin(a) * 38}
                    className="loader-spoke"
                  />
                )
              })}
            </g>
          </svg>
          <div className="loader-caption">
            <span lang="or" className="font-odia loader-odia">
              ଶୁଭ ବିବାହ
            </span>
            <span ref={label} aria-hidden className="loader-count font-inscription">
              000
            </span>
          </div>
          <div ref={bar} hidden />
        </div>
      )}
    </>
  )
}
