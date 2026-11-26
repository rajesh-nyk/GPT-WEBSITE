import { describe, expect, it } from 'vitest'
import { backCloudArrival, cloudLightIntensity, faceVeil, footerCloudDeparture, growth } from './cloudMath'

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


describe('atmospheric handoff', () => {
  it('keeps the resting page endpoints unchanged', () => {
    for (let i = 0; i < 5; i++) {
      expect(footerCloudDeparture(0, i)).toBe(1)
      expect(footerCloudDeparture(1, i)).toBe(0)
    }
    expect(backCloudArrival(0)).toBe(0)
    expect(backCloudArrival(1)).toBe(1)
  })
  it('overlaps the outgoing and incoming atmosphere without a jump', () => {
    expect(footerCloudDeparture(0.4, 0)).toBeGreaterThan(footerCloudDeparture(0.4, 0, false))
    expect(backCloudArrival(0.4)).toBeGreaterThan(backCloudArrival(0.4, false))
    for (let i = 1; i <= 100; i++) {
      expect(footerCloudDeparture(i / 100, 2)).toBeLessThanOrEqual(footerCloudDeparture((i - 1) / 100, 2))
      expect(backCloudArrival(i / 100)).toBeGreaterThanOrEqual(backCloudArrival((i - 1) / 100))
    }
  })
})
