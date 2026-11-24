import { MathUtils } from 'three'

/** The corona plane is seven units wide, so its visible radius is 3.5× the orb scale. */
export const ORB_VISUAL_RADIUS = 3.5

export const orbMotionDebug = { radiusPx: 0, targetRadiusPx: 0, intensity: 0 }

/** Rate-limit the complete visible corona to at most `pixels` of projected change per frame. */
export function stepOrbSize(current: number, target: number, distance: number, fov: number, height: number, pixels = 1) {
  const worldPerPixel = (2 * Math.max(distance, 0.01) * Math.tan(MathUtils.degToRad(fov) / 2)) / Math.max(height, 1)
  const delta = MathUtils.clamp(
    target - current,
    (-worldPerPixel * pixels) / ORB_VISUAL_RADIUS,
    (worldPerPixel * pixels) / ORB_VISUAL_RADIUS,
  )
  return current + delta
}

export function projectedOrbRadius(size: number, distance: number, fov: number, height: number) {
  return (size * ORB_VISUAL_RADIUS) / ((2 * distance * Math.tan(MathUtils.degToRad(fov) / 2)) / height)
}

/** Govern the final projected radius, accounting for camera distance changes too. */
export function stepProjectedOrbRadius(
  currentRadiusPx: number,
  targetSize: number,
  distance: number,
  fov: number,
  height: number,
  pixels = 1,
) {
  const targetRadiusPx = projectedOrbRadius(targetSize, distance, fov, height)
  const radiusPx = currentRadiusPx + MathUtils.clamp(targetRadiusPx - currentRadiusPx, -pixels, pixels)
  const worldPerPixel = (2 * Math.max(distance, 0.01) * Math.tan(MathUtils.degToRad(fov) / 2)) / Math.max(height, 1)
  return { radiusPx, targetRadiusPx, size: (radiusPx * worldPerPixel) / ORB_VISUAL_RADIUS }
}
