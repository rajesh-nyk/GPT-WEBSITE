import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
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

/** The approved page-one scene, without later chapters or their runtime assets. */
export function PageOneWorld() {
  const reducedMotion = useReducedMotion()
  const { tier } = useQuality()
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
      <GalaxyStars reducedMotion={reducedMotion} constellation={tier !== 'low'} continuous />
      <WorldLighting />
      <TravelingWheel pointer={pointer} reducedMotion={reducedMotion} anchorY={anchorY} pageTransition />
      <QualityEffects bloomRef={bloom} bloomIntensity={0.45} bloomThreshold={0.86} vignette={0.4} />
    </>
  )
}
