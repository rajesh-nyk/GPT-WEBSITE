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

