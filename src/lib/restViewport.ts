import { useMemo } from 'react'
import { useThree } from '@react-three/fiber'

/**
 * The world's layouts (hero wheel size and place, motes, petals, page sections) are
 * designed for the site's RESTING camera: (0, 0, 6) looking at the origin, fov 35.
 *
 * R3F's own `viewport` is recomputed on every resize from the camera's CURRENT distance to
 * the origin. Since page 2's dive takes the camera ~150 units away, a resize there would
 * hand every layout a viewport 8–25× too big, and the hero would come back broken. This
 * view is the resting camera's, at the canvas size — the same whenever it is computed.
 */
const REST_DISTANCE = 6
const REST_FOV = 35

export type RestViewport = { width: number; height: number; aspect: number; factor: number; distance: number; dpr: number }

export function restViewport(width: number, height: number, dpr: number): RestViewport {
  const h = 2 * REST_DISTANCE * Math.tan(((REST_FOV / 2) * Math.PI) / 180)
  const aspect = width / height
  return { width: h * aspect, height: h, aspect, factor: height / h, distance: REST_DISTANCE, dpr }
}

/** `restViewport` for the world canvas (re-computed only when its size or pixel ratio changes). */
export function useRestViewport(): RestViewport {
  const width = useThree((s) => s.size.width)
  const height = useThree((s) => s.size.height)
  const dpr = useThree((s) => s.viewport.dpr)
  return useMemo(() => restViewport(width, height, dpr), [width, height, dpr])
}
