import { Vector3, type Camera } from 'three'

/**
 * Where 3D objects currently sit on screen (client px), updated each frame by the
 * objects themselves. Used as hover regions for the 3D scene and the gold cursor —
 * cheap circle tests instead of raycasting high-poly meshes.
 */
export type Circle = { x: number; y: number; r: number }
/** The wheel also reports its horizontal squash (|cos| of its Y turn, ≥ its thickness),
 *  so HTML can be masked by the ellipse it actually covers while it turns. */
export type WheelShape = Circle & { sx: number }
export const screenShapes: { wheel: WheelShape | null; ganesha: Circle | null } = {
  wheel: null,
  ganesha: null,
}

/**
 * Glow centres for the backdrop, in UV space (0..1, y up). Written each frame by the
 * objects (they move: the wheel travels; under reduced motion both scroll with the page).
 */
export const glowCenters = {
  hero: [0.5, 0.6] as [number, number],
  ganesha: [0.5, 0.57] as [number, number],
  /** Sun flare behind the wheel's hero position (stays put as the wheel travels away). */
  sun: [0.5, 0.6] as [number, number],
  /** Wheel radius in UV-height units, so the flare scales with the wheel. */
  sunRadius: 0.2,
}

const v = new Vector3()

/**
 * Project a world-space sphere (centre + radius) to a client-space circle.
 * `width/height` are the canvas CSS size (the world canvas is fixed full-viewport).
 */
export function projectCircle(
  center: Vector3,
  radius: number,
  camera: Camera & { fov?: number },
  width: number,
  height: number,
): Circle {
  v.copy(center).project(camera)
  const x = (v.x * 0.5 + 0.5) * width
  const y = (-v.y * 0.5 + 0.5) * height
  const distance = camera.position.distanceTo(center)
  const fov = ((camera.fov ?? 35) * Math.PI) / 180
  const pxPerUnit = height / (2 * Math.tan(fov / 2) * distance)
  return { x, y, r: radius * pxPerUnit }
}

/** World position → backdrop UV (0..1, y up). */
export function toUv(center: Vector3, camera: Camera, out: [number, number]) {
  v.copy(center).project(camera)
  out[0] = v.x * 0.5 + 0.5
  out[1] = v.y * 0.5 + 0.5
  return out
}
