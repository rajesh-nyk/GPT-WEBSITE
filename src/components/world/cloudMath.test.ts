import { describe, expect, it } from 'vitest'
import { cloudLightIntensity, faceVeil, growth } from './cloudMath'

describe('growth', () => {
  it('starts at 0 and ends at 1', () => {
    expect(growth(0, 0, 5)).toBe(0)
    expect(growth(1, 4, 5)).toBe(1)
  })
  it('is monotonic in progress and reversible (pure)', () => {
    let last = -1
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const g = growth(p, 2, 5)
      expect(g).toBeGreaterThanOrEqual(last)
      last = g
    }
    expect(growth(0.6, 2, 5)).toBe(growth(0.6, 2, 5))
  })
  it('staggers clouds: earlier ones grow first', () => {
    expect(growth(0.5, 0, 5)).toBeGreaterThan(growth(0.5, 4, 5))
  })
})

describe('cloudLightIntensity', () => {
  it('is zero when the page has faded or the cloud has not grown', () => {
    expect(cloudLightIntensity(1, 0, 1)).toBe(0)
    expect(cloudLightIntensity(0, 1, 1)).toBe(0)
  })
  it('is brighter for closer clouds', () => {
    expect(cloudLightIntensity(1, 1, 2)).toBeGreaterThan(cloudLightIntensity(1, 1, 6))
  })
})

describe('faceVeil', () => {
  it('thins clouds to a veil over the face and leaves them whole outside', () => {
    expect(faceVeil(0, 0, 1)).toBeCloseTo(0.15, 5)
    expect(faceVeil(1.2, 0, 1)).toBe(1)
  })
})

