import { MathUtils } from 'three'

/**
 * Page 2 cloud maths (preview ?clouds): build-up timing, the light each cloud gives
 * Ganesha, and the veil that keeps his face clear.
 */

const BUILD_START = 0.25
const BUILD_END = 0.95
/** Share of the build span each cloud takes to condense. */
const EACH = 0.35

/** 0..1 build-up of cloud `index` (of `count`) at page 2 arrival `progress`. */
export function growth(progress: number, index: number, count: number): number {
  const lead = count > 1 ? index / (count - 1) : 0
  const span = BUILD_END - BUILD_START
  const start = BUILD_START + lead * span * (1 - EACH)
  return MathUtils.smootherstep(progress, start, start + span * EACH)
}

/** Scroll-scrubbed atmospheric handoff; footer wisps linger while the distant
 * blessing clouds begin to form. Both envelopes retain their original endpoints. */
export function footerCloudDeparture(progress: number, index: number, handoff = true): number {
  const stagger = index * 0.06
  return 1 - MathUtils.smoothstep(progress, 0.02 + stagger, (handoff ? 0.58 : 0.4) + stagger)
}

export function backCloudArrival(progress: number, handoff = true): number {
  const p = MathUtils.clamp(progress, 0, 1)
  return handoff ? MathUtils.clamp(p + 0.12 * Math.sin(Math.PI * p), 0, 1) : p
}

const PEAK = 2.4

/** Light a cloud gives him: grows with the cloud, fades with the page, falls off with distance. */
export function cloudLightIntensity(grown: number, fade: number, distance: number): number {
  return (PEAK * grown * fade) / (1 + distance * distance * 0.08)
}

/** Multiplier on front-cloud density near his face: 0.15 at its centre, 1 at `radius`. */
export function faceVeil(dx: number, dy: number, radius: number): number {
  const r = Math.hypot(dx, dy) / Math.max(radius, 1e-6)
  return 0.15 + 0.85 * MathUtils.smoothstep(r, 0.45, 1)
}

