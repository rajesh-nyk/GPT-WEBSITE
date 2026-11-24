import { Suspense, useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { MathUtils } from 'three'
import type { BloomEffect } from 'postprocessing'
import { registerHoverRegion } from '../../lib/hoverRegions'
import { useSmoothedPointer } from '../../lib/pointer'
import { useQuality } from '../../lib/quality'
import { useReducedMotion } from '../../lib/useReducedMotion'
import { QualityEffects } from '../three/QualityEffects'
import { GoldenMotes } from '../hero/GoldenMotes'
import { heroFx } from '../hero/fx'
import { ganeshaFx, LOTUS } from '../ganesha/fx'
import { GaneshaStage, ganeshaRepel } from './GaneshaStage'
import { CameraRig } from './CameraRig'
import { LotusStage } from './LotusStage'
import { NightPortrait } from './NightPortrait'
import { TempleNight } from './TempleNight'
import { JourneyDirector, journey } from './journey'
import { screenShapes } from './screenShapes'
import { TravelingWheel } from './TravelingWheel'
import { WorldBackdrop } from './WorldBackdrop'
import { GalaxyStars } from './GalaxyStars'
import { WorldLighting } from './WorldLighting'
import { useRestViewport } from '../../lib/restViewport'

/**
 * Everything in the single fixed WebGL world, in update order (JourneyDirector first).
 *
 * Particles (budget from the quality tier: high 6000 / mid 2000 / low 400):
 *   sparse motes = 8%   → 480 / 160 / 32  (they drift away from a hovered Ganesha)
 *   larger orbs  = 0.3% →  18 /   6 /  2
 *   Ganesha build points: see GaneshaStage.
 * Reduced motion: no particles, no travel — objects are anchored to their sections.
 */
export function World() {
  const reducedMotion = useReducedMotion()
  const { particles } = useQuality()
  const pointer = useSmoothedPointer(2)
  const bloom = useRef<BloomEffect>(null)
  const bloomBase = useRef<number | null>(null)
  const anchors = useAnchors(reducedMotion)

  useEffect(() => {
    const offWheel = registerHoverRegion('wheel', () => (journey.t < 0.3 ? screenShapes.wheel : null))
    const offGanesha = registerHoverRegion('ganesha', () => screenShapes.ganesha)
    return () => {
      offWheel()
      offGanesha()
    }
  }, [])

  // One bloom for the whole journey: the hero's breathing/hover bloom hands over to
  // Ganesha's (bright while dust is in flight, a soft halo once solid, swelling on hover).
  useFrame(() => {
    const b = bloom.current
    if (!b) return
    bloomBase.current ??= b.intensity
    const heroW = 1 - MathUtils.smootherstep(journey.t, 0.1, 1)
    const hero = (0.85 + 0.3 * heroFx.breath) * (1 + 0.9 * heroFx.hover)
    const g = ganeshaFx
    const gan =
      (0.55 + 0.25 * g.particles * (1 - g.solid) + 0.35 * g.solid + 0.35 * g.seam) *
      (1 + 0.6 * g.hover) *
      (0.6 + 0.4 * g.presence * (1 - g.leave))
    b.intensity = bloomBase.current * (heroW * hero + (1 - heroW) * gan)
  })

  return (
    <>
      <JourneyDirector reducedMotion={reducedMotion} />
      <CameraRig reducedMotion={reducedMotion} />
      <WorldBackdrop />
      <GalaxyStars reducedMotion={reducedMotion} />
      <WorldLighting />
      <TravelingWheel pointer={pointer} reducedMotion={reducedMotion} anchorY={anchors.hero} />
      {LOTUS ? (
        <LotusStage reducedMotion={reducedMotion} />
      ) : (
        <Suspense fallback={null}>
          <GaneshaStage reducedMotion={reducedMotion} anchorY={anchors.ganesha} />
        </Suspense>
      )}
      {/* Flower shower (PushpaVrishti) removed at Rajesh's request, 22 Nov 2026. */}
      {!reducedMotion && (
        <>
          <GoldenMotes count={Math.round(particles * 0.08)} pointer={pointer} repel={ganeshaRepel} />
          {/* Large soft yellow orbs removed at Rajesh's request, 24 Nov 2026. */}
        </>
      )}
      <NightPortrait reducedMotion={reducedMotion} />
      <TempleNight reducedMotion={reducedMotion} />
      <QualityEffects bloomRef={bloom} bloomIntensity={0.45} bloomThreshold={0.86} vignette={0.4} />
    </>
  )
}

/**
 * Reduced motion: objects don't travel — they're pinned to their sections and scroll
 * with the page like ordinary content. Each frame (rendered on demand, on scroll), turn
 * section positions into world-space offsets.
 */
function useAnchors(reducedMotion: boolean) {
  const anchors = useRef({ hero: { current: 0 }, ganesha: { current: 0 } }).current
  const invalidate = useThree((s) => s.invalidate)
  const viewport = useRestViewport()
  const size = useThree((s) => s.size)

  useEffect(() => {
    if (!reducedMotion) return
    const onScroll = () => invalidate()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [reducedMotion, invalidate])

  useFrame(() => {
    if (!reducedMotion) return
    const pxToWorld = viewport.height / size.height
    const hero = document.getElementById('hero')?.getBoundingClientRect()
    const blessing = document.getElementById('blessing')?.getBoundingClientRect()
    if (hero) anchors.hero.current = -hero.top * pxToWorld
    if (blessing) {
      const offset = blessing.top + blessing.height / 2 - size.height / 2
      anchors.ganesha.current = -offset * pxToWorld
    }
  }, -20)

  return anchors
}
