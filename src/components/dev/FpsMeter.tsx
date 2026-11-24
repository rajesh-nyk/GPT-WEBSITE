import { useEffect, useRef } from 'react'
import { useQuality } from '../../lib/quality'

/**
 * DEV ONLY (rendered behind `import.meta.env.DEV`, so it's stripped from production builds).
 *
 * Reads frame timings with its own rAF and writes text straight into the DOM twice a
 * second — it never re-renders React, so measuring doesn't cost the frames it measures.
 *   fps   average over the last 0.5s
 *   low   worst single frame in that window, as fps (shows hitches an average hides)
 *   drop  frames longer than 1.5× the 60fps budget (>25ms) since load
 * Turns red under 55fps, amber under 59.
 */
export function FpsMeter() {
  const { tier, dpr, gpu } = useQuality()
  const out = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let windowStart = last
    let frames = 0
    let worst = 0
    let dropped = 0

    const loop = (now: number) => {
      const dt = now - last
      last = now
      frames++
      if (dt > worst) worst = dt
      if (dt > 25) dropped++

      if (now - windowStart >= 500 && out.current) {
        const fps = (frames * 1000) / (now - windowStart)
        const low = 1000 / worst
        out.current.textContent = `${fps.toFixed(0)} fps · low ${low.toFixed(0)} · drop ${dropped}`
        out.current.dataset.state = fps < 55 ? 'bad' : fps < 59 ? 'warn' : 'ok'
        windowStart = now
        frames = 0
        worst = 0
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed bottom-2 left-2 z-[100] rounded bg-black/80 px-2 py-1 font-mono text-[11px] leading-tight text-white"
    >
      <div
        ref={out}
        className="data-[state=bad]:text-red-400 data-[state=warn]:text-amber-300 data-[state=ok]:text-emerald-400"
      >
        — fps
      </div>
      <div className="text-neutral-400">
        {tier} · dpr {dpr[0]}–{dpr[1]}
        {gpu?.gpu ? ` · ${gpu.gpu}` : ''}
      </div>
    </div>
  )
}
