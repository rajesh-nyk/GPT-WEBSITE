import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { BloomEffect } from 'postprocessing'
import { registerHoverRegion } from '../../lib/hoverRegions'
import { useSmoothedPointer } from '../../lib/pointer'
import { useQuality } from '../../lib/quality'
import { useReducedMotion } from '../../lib/useReducedMotion'
import { heroFx } from '../hero/fx'
import { QualityEffects } from '../three/QualityEffects'
import { JourneyDirector } from './journey'
import { GalaxyStars } from './GalaxyStars'
import { screenShapes } from './screenShapes'
import { TravelingWheel } from './TravelingWheel'
import { WorldBackdrop } from './WorldBackdrop'
import { WorldLighting } from './WorldLighting'

/** Optional diagnostic: measure GPU work for the hero composer without a synchronous readback.
 * Mounted only when the composer owns rendering (positive frame priority). */
function HeroGpuTiming() {
  const renderer = useThree((s) => s.gl)
  const timer = useRef<{ gl: WebGL2RenderingContext; target: number; disjoint: number; pending: WebGLQuery | null; running: boolean; frames: number } | null>(null)
  useEffect(() => {
    const gl = renderer.getContext() as WebGL2RenderingContext
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null
    if (!ext || typeof gl.createQuery !== 'function') {
      console.info('[ultra GPU] Timer queries unavailable on this browser/GPU')
      return
    }
    const state = { gl, target: ext.TIME_ELAPSED_EXT, disjoint: ext.GPU_DISJOINT_EXT, pending: null as WebGLQuery | null, running: false, frames: 0 }
    timer.current = state
    return () => {
      if (state.running) gl.endQuery(state.target)
      if (state.pending) gl.deleteQuery(state.pending)
      timer.current = null
    }
  }, [renderer])

  useFrame(() => {
    const s = timer.current
    if (!s) return
    const { gl } = s
    if (s.pending) {
      if (!gl.getQueryParameter(s.pending, gl.QUERY_RESULT_AVAILABLE)) return
      if (!gl.getParameter(s.disjoint)) {
        const ms = Number(gl.getQueryParameter(s.pending, gl.QUERY_RESULT)) / 1e6
        document.documentElement.dataset.heroGpuMs = ms.toFixed(2)
        console.info('[ultra GPU] Hero render + composer:', ms.toFixed(2) + ' ms', 'scrollY:', Math.round(window.scrollY))
      }
      gl.deleteQuery(s.pending)
      s.pending = null
    }
    if (++s.frames % 30 !== 0) return
    const query = gl.createQuery()
    if (!query) return
    s.pending = query
    gl.beginQuery(s.target, query)
    s.running = true
  }, -100)

  useFrame(() => {
    const s = timer.current
    if (s?.running) {
      s.gl.endQuery(s.target)
      s.running = false
    }
  }, 2)
  return null
}

/** The approved page-one scene, without later chapters or their runtime assets. */
export function PageOneWorld() {
  const reducedMotion = useReducedMotion()
  const { tier, postprocessing } = useQuality()
  const pointer = useSmoothedPointer(2)
  const bloom = useRef<BloomEffect>(null)
  const bloomBase = useRef<number | null>(null)
  const anchorY = useRef(0)
  const frameStats = useRef({ frames: 0, elapsed: 0, slow: 0 })

  useEffect(() => registerHoverRegion('wheel', () => screenShapes.wheel), [])

  useFrame((_, delta) => {
    const effect = bloom.current
    if (effect) {
      bloomBase.current ??= effect.intensity
      const breath = 0.85 + 0.3 * heroFx.breath
      effect.intensity = bloomBase.current * breath * (1 + 0.9 * heroFx.hover)
    }

    {
      const stats = frameStats.current
      // An intersection pause may leave a large first delta on resume.
      if (delta > 0.5) {
        stats.frames = stats.elapsed = stats.slow = 0
        return
      }
      stats.frames++
      stats.elapsed += delta
      if (delta > 1 / 50) stats.slow++
      if (stats.elapsed >= 0.5) {
        const fps = stats.frames / stats.elapsed
        const display = document.getElementById('scene-fps')
        if (display) {
          display.textContent = Math.round(fps) + ' FPS'
          display.removeAttribute('title')
          display.dataset.rate = fps >= 58 ? 'good' : fps >= 45 ? 'fair' : 'low'
        }
        document.documentElement.dataset.pageFps = (stats.frames / stats.elapsed).toFixed(1)
        document.documentElement.dataset.slowFrames = (stats.slow / stats.frames).toFixed(3)
        stats.frames = stats.elapsed = stats.slow = 0
      }
    }
  })

  return (
    <>
      <JourneyDirector reducedMotion={reducedMotion} directScroll />
      <WorldBackdrop continuous />
      <GalaxyStars reducedMotion={reducedMotion} constellation={tier !== 'low'} continuous clipHero />
      <WorldLighting heroOnly />
      <TravelingWheel pointer={pointer} reducedMotion={reducedMotion} anchorY={anchorY} pageTransition />
      <QualityEffects bloomRef={bloom} bloomIntensity={0.45} bloomThreshold={0.86} vignette={0.4} />
      {postprocessing !== 'none' && new URLSearchParams(window.location.search).has('gpu-profile') && <HeroGpuTiming />}
    </>
  )
}
