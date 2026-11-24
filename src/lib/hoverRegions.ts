/**
 * Hover targets that aren't DOM elements — e.g. the 3D wheel inside a canvas.
 * A region is a function returning a circle in client (CSS px) coordinates, computed
 * from layout maths rather than raycasting a 450k-triangle mesh on every pointer move.
 * Used by both the 3D scene (slow spin / brighten on hover) and the custom cursor.
 */
type Circle = { x: number; y: number; r: number }
const regions = new Map<string, () => Circle | null>()

export function registerHoverRegion(name: string, get: () => Circle | null) {
  regions.set(name, get)
  return () => {
    if (regions.get(name) === get) regions.delete(name)
  }
}

export function isInRegion(name: string, x: number, y: number) {
  const c = regions.get(name)?.()
  return !!c && (x - c.x) ** 2 + (y - c.y) ** 2 <= c.r ** 2
}

export function isInAnyRegion(x: number, y: number) {
  for (const name of regions.keys()) if (isInRegion(name, x, y)) return true
  return false
}
