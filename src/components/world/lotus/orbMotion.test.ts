import { describe, expect, it } from 'vitest'
import { projectedOrbRadius, stepOrbSize, stepProjectedOrbRadius } from './orbMotion'

describe('glow radius governor', () => {
  it('never expands or contracts the outer corona by more than one projected pixel per frame', () => {
    const distance = 166
    const fov = 35
    const height = 750
    let size = 0.12
    for (const target of [9, 9, 9, 1.3, 1.3]) {
      const before = projectedOrbRadius(size, distance, fov, height)
      size = stepOrbSize(size, target, distance, fov, height)
      const after = projectedOrbRadius(size, distance, fov, height)
      expect(Math.abs(after - before)).toBeLessThanOrEqual(1.000001)
    }
  })

  it('includes rapid camera approach in the one-pixel screen-space limit', () => {
    let radiusPx = 0
    let previous = 0
    for (const distance of [166, 140, 95, 50, 24, 12, 7]) {
      const next = stepProjectedOrbRadius(radiusPx, 9, distance, 35, 750)
      radiusPx = next.radiusPx
      expect(Math.abs(radiusPx - previous)).toBeLessThanOrEqual(1.000001)
      previous = radiusPx
    }
  })
})
