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

    if (import.meta.env.DEV) {
      const stats = frameStats.current
      stats.frames++
      stats.elapsed += delta
      if (delta > 1 / 50) stats.slow++
      if (stats.elapsed >= 2) {
        document.documentElement.dataset.pageFps = (stats.frames / stats.elapsed).toFixed(1)
        document.documentElement.dataset.slowFrames = (stats.slow / stats.frames).toFixed(3)
        stats.frames = stats.elapsed = stats.slow = 0
      }
    }
  })

  return (
    <>
      <JourneyDirector reducedMotion={reducedMotion} />
      <WorldBackdrop />
      <GalaxyStars reducedMotion={reducedMotion} constellation={tier !== 'low'} />
      <WorldLighting />
      <TravelingWheel pointer={pointer} reducedMotion={reducedMotion} anchorY={anchorY} />
      <QualityEffects bloomRef={bloom} bloomIntensity={0.45} bloomThreshold={0.86} vignette={0.4} />
    </>
  )
}
