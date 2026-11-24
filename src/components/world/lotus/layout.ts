import { Vector3 } from 'three'

/**
 * Where the Lotus Ganesha sits in the shared world, and the camera moves that reveal it.
 *
 * Model units: the baked model (public/models/lotus-ganesha*.glb) is centred on x/z with
 * its base at y = 0 — 0.3 tall, 0.41 across. Every number below that describes the model
 * (eyes, hands, paths) is in these units, exactly as tuned in the approved preview.
 *
 * World placement: the front shot's camera sits at the site's resting distance (6), so
 * the front shot fills the screen the way the preview did, and world = (local − PIVOT) × SCALE.
 */
export const LOTUS_H = 0.3
export const LOTUS_R = 0.2056
/** The front shot looks at this height on the model. */
const FRONT_TARGET_Y = LOTUS_H * 0.46
const FRONT_DIST = LOTUS_R * 3.5
export const LOTUS_PIVOT = new Vector3(0, FRONT_TARGET_Y, 0)
export const LOTUS_SCALE = 6 / FRONT_DIST
/**
 * Where the lotus Ganesha (and the light he is revealed in) sits in the world: far down
 * the hero camera's line of sight, so the far star shows exactly where the wheel was and
 * the dive travels real distance (design 2026-11-22).
 */
export const LOTUS_WORLD_CENTER = new Vector3(0, 0, -160)

/** Model point → world point (in place). */
export function lotusToWorld(v: Vector3) {
  return v.sub(LOTUS_PIVOT).multiplyScalar(LOTUS_SCALE).add(LOTUS_WORLD_CENTER)
}

/** World point → model point (in place). */
export function worldToLotus(v: Vector3) {
  return v.sub(LOTUS_WORLD_CENTER).divideScalar(LOTUS_SCALE).add(LOTUS_PIVOT)
}

/** His centre (model units): the rays and the hover circle are centred here. */
export const LOTUS_CENTER = new Vector3(0, 0.18, 0)
