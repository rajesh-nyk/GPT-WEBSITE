import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { heroFx } from '../hero/fx'
import { useReducedMotion } from '../../lib/useReducedMotion'
import { Vector2, Vector3 } from 'three'
import { useQuality } from '../../lib/quality'
import { CloudLayer, makeNoiseTexture, type CloudSpec } from './PageTwoClouds'

/**
 * Page 1 footer clouds (approved 25 Nov 2026): clouds along the bottom of page 1. They
 * condense in once the sun has risen to the middle, then stay where
 * they are and, as soon as you scroll, MORPH OUT — thinning back into wisps, one after
 * another — the reverse of how page 2's clouds form (his direction: no rising layers,
 * nothing new brought in). Drawn in page 1's shared sky, behind the wheel and names.
 */
// Approved and made the default 25 Nov 2026; ?footerclouds=0 shows page 1 without them.
export const FOOTER_CLOUDS = typeof window === 'undefined' ||
  new URLSearchParams(window.location.search).get('footerclouds') !== '0'

const LANDSCAPE: CloudSpec[] = [
  { pos: [4.2, -3.0, -7.0], half: [3.4, 1.3, 1.5], seed: 4.4, drift: 0.03, bob: 0.06 },
  { pos: [-3.2, -2.75, -4.0], half: [3.2, 1.15, 1.4], seed: 2.9, drift: 0.04, bob: 0.06 },
  { pos: [2.9, -2.45, -1.8], half: [2.8, 0.95, 1.2], seed: 6.1, drift: 0.05, bob: 0.06 },
  { pos: [-2.4, -2.05, 0.2], half: [2.0, 0.65, 0.9], seed: 7.2, drift: 0.06, bob: 0.05 },
  { pos: [0.9, -1.9, 1.0], half: [2.2, 0.6, 0.9], seed: 8.3, drift: 0.06, bob: 0.05 },
]
const PORTRAIT: CloudSpec[] = [
  { pos: [-0.8, -2.85, -4.0], half: [2.4, 1.05, 1.3], seed: 2.9, drift: 0.04, bob: 0.06 },
  { pos: [1.0, -2.3, -1.2], half: [1.9, 0.75, 1.0], seed: 6.1, drift: 0.05, bob: 0.06 },
  { pos: [-0.3, -2.05, 1.0], half: [1.5, 0.5, 0.8], seed: 8.3, drift: 0.06, bob: 0.05 },
]

const LOW = PORTRAIT.slice(0, 2)

/** How long the clouds take to condense in after the sunrise. */
const INTRO_SECONDS = 3.2

/** The wheel's glow, top centre, lights their tops. */
const LIGHT = new Vector2(0, 2.4)
const NO_FACE = new Vector3()

/** Scroll position in screens: 0 at the top of page 1, 1 when page 2 fills the view. */
function scroll() {
  return typeof window === 'undefined' ? 0 : window.scrollY / Math.max(1, window.innerHeight)
}

export function PageOneFooterClouds() {
  const { tier } = useQuality()
  const { width, height } = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const noise = useMemo(() => makeNoiseTexture(), [])
  useEffect(() => () => noise.dispose(), [noise])
  const specs = width < height ? PORTRAIT : LANDSCAPE
  const reducedMotion = useReducedMotion()
  // When the sun reached the middle (real clock time, so slow screens don't slow it down).
  const risenAt = useRef<number | null>(null)
  useFrame(() => {
    if (heroFx.rise < 0.999) risenAt.current = null
    else if (risenAt.current == null) risenAt.current = performance.now()
  })
  const driver = useMemo(() => ({
    scroll,
    intro: () => reducedMotion ? 1
      : risenAt.current == null ? 0
      : Math.min(1, (performance.now() - risenAt.current) / 1000 / INTRO_SECONDS),
  }), [reducedMotion])
  return (
    <CloudLayer
      specs={tier === 'low' ? LOW : specs}
      front={false}
      noise={noise}
      steps={tier === 'high' ? 36 : 24}
      lightSteps={tier === 'low' ? 3 : 4}
      // Full sharpness on capable screens (he found the softer layer too blurry).
      resScale={tier === 'high' ? Math.min(dpr, 1) : tier === 'low' ? 0.5 : 0.75}
      light={LIGHT}
      face={NO_FACE}
      footer={driver}
    />
  )
}
