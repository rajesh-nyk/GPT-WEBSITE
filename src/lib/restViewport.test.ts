import { describe, expect, it } from 'vitest'
import { restViewport } from './restViewport'

describe('rest viewport', () => {
  it('is the resting camera view (z = 6, fov 35) at the canvas size', () => {
    const v = restViewport(1470, 800, 2)
    const h = 2 * 6 * Math.tan((35 / 2) * (Math.PI / 180))
    expect(v.height).toBeCloseTo(h, 6)
    expect(v.width).toBeCloseTo(h * (1470 / 800), 6)
    expect(v.aspect).toBeCloseTo(1470 / 800, 6)
    expect(v.factor).toBeCloseTo(800 / h, 6)
    expect(v.distance).toBe(6)
    expect(v.dpr).toBe(2)
  })

  it('does not depend on where the camera is now (resize far from rest)', () => {
    expect(restViewport(390, 844, 3)).toEqual(restViewport(390, 844, 3))
    expect(restViewport(390, 844, 3).height).toBeCloseTo(restViewport(1470, 800, 1).height, 9)
  })
})
