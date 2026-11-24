import { useLoader } from '@react-three/fiber'
import { Box3, FileLoader, Vector3 } from 'three'

/**
 * Loads a baked surface point cloud (scripts/optimize-models.mjs → name.points.bin):
 * Float32[8] header [count, minX, minY, minZ, maxX, maxY, maxZ, 0], then Int16 xyz.
 * Suspends until loaded (it's small: ~6 bytes/point).
 */
export function useSurfacePoints(name: string) {
  const buffer = useLoader(
    FileLoader,
    `${import.meta.env.BASE_URL}models/${name}.points.bin`,
    (loader) => (loader as FileLoader).setResponseType('arraybuffer'),
  ) as unknown as ArrayBuffer
  return decode(buffer)
}

const cache = new WeakMap<ArrayBuffer, { positions: Float32Array; box: Box3 }>()

function decode(buffer: ArrayBuffer) {
  const hit = cache.get(buffer)
  if (hit) return hit
  const header = new Float32Array(buffer, 0, 8)
  const count = header[0]
  const min = new Vector3(header[1], header[2], header[3])
  const max = new Vector3(header[4], header[5], header[6])
  const q = new Int16Array(buffer, 32, count * 3)
  const positions = new Float32Array(count * 3)
  const lo = [min.x, min.y, min.z]
  const span = [max.x - min.x, max.y - min.y, max.z - min.z]
  for (let i = 0; i < count * 3; i++) {
    const a = i % 3
    positions[i] = lo[a] + ((q[i] + 32768) / 65535) * span[a]
  }
  const result = { positions, box: new Box3(min, max) }
  cache.set(buffer, result)
  return result
}
