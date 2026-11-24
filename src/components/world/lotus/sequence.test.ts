import { describe, expect, it } from 'vitest'
import { MathUtils, PerspectiveCamera, Vector3 } from 'three'
import { EXIT } from '../../ganesha/fx'
import { LOTUS_CENTER, LOTUS_PIVOT, LOTUS_SCALE, LOTUS_WORLD_CENTER } from './layout'
import { LOTUS_FRONT_REL, lotusSequence, makeLotusShot } from './sequence'

const shot = makeLotusShot()
const rel = new Vector3()
const relOf = (t: number, reduced = false) => {
  lotusSequence(t, reduced, shot)
  return rel.copy(shot.pos).sub(LOTUS_WORLD_CENTER)
}
/** Horizontal angle between the camera and his facing (+z), degrees. */
const angleFromFront = (r: Vector3) => MathUtils.radToDeg(Math.atan2(Math.abs(r.x), r.z))
const range = (a: number, b: number, step: number) => {
  const out: number[] = []
  for (let t = a; t <= b + 1e-9; t += step) out.push(+t.toFixed(6))
  return out
}

describe('lotus shot timeline', () => {
  it('hero untouched', () => {
    for (const t of [0, 0.3, 0.54]) {
      lotusSequence(t, false, shot)
      expect(shot.pos.distanceTo(new Vector3(0, 0, 6))).toBeLessThan(1e-6)
      expect(shot.target.distanceTo(new Vector3(0, 0, 0))).toBeLessThan(1e-6)
      expect(shot.fov).toBe(35)
      expect(shot.orbK).toBe(0)
    }
  })

  it('far star uncovered as the wheel leaves', () => {
    lotusSequence(1.0, false, shot)
    expect(shot.orbK).toBeGreaterThan(0.99)
    expect(shot.pos.distanceTo(shot.orbPos)).toBeGreaterThan(150)
  })

  it('keeps the glow horizontally screen-locked while the wheel leaves', () => {
    const camera = new PerspectiveCamera(35, 16 / 9, 0.1, 400)
    for (const t of range(0.72, 0.999, 0.003)) {
      lotusSequence(t, false, shot)
      camera.position.copy(shot.pos)
      camera.lookAt(shot.target)
      camera.updateMatrixWorld()
      const screen = shot.orbPos.clone().project(camera)
      expect(screen.x, `screen x at t=${t}`).toBeCloseTo(0, 5)
    }
  })

  it('moves the glow vertically into centre without a boundary jump', () => {
    const camera = new PerspectiveCamera(35, 16 / 9, 0.1, 400)
    let previousY: number | null = null
    for (const t of range(0.84, 1.01, 0.001)) {
      lotusSequence(t, false, shot)
      camera.position.copy(shot.pos)
      camera.lookAt(shot.target)
      camera.updateMatrixWorld()
      const screenY = (-shot.orbPos.clone().project(camera).y * 0.5 + 0.5) * 750
      if (previousY !== null) {
        expect(screenY, `screen y reversed at t=${t}`).toBeGreaterThanOrEqual(previousY - 0.02)
        expect(screenY - previousY, `screen y skipped at t=${t}`).toBeLessThanOrEqual(1)
      }
      previousY = screenY
    }
  })

  it('continuous: no camera jumps anywhere in the sequence', () => {
    const prev = makeLotusShot()
    lotusSequence(0, false, prev)
    for (const t of range(0.0005, 2.6, 0.0005)) {
      lotusSequence(t, false, shot)
      expect(shot.pos.distanceTo(prev.pos), `pos jump at t=${t}`).toBeLessThan(1.5)
      expect(Math.abs(shot.fov - prev.fov), `fov jump at t=${t}`).toBeLessThan(0.5)
      expect(Math.abs(shot.roll - prev.roll), `roll jump at t=${t}`).toBeLessThan(0.02)
      prev.pos.copy(shot.pos)
      prev.fov = shot.fov
      prev.roll = shot.roll
    }
  })

  it('never behind him', () => {
    for (const t of range(1.26, 2.6, 0.001)) {
      expect(angleFromFront(relOf(t)), `t=${t}`).toBeLessThanOrEqual(100)
    }
  })

  it('front shot', () => {
    const r = relOf(1.845)
    expect(r.distanceTo(LOTUS_FRONT_REL)).toBeLessThan(0.01)
    expect(shot.frontK).toBe(1)
    expect(shot.flashK).toBe(0)
    expect(shot.figure).toBe(1)
    expect(shot.fov).toBeCloseTo(35, 3)
  })

  it('draws opposing S-curves into and out of the reveal', () => {
    const entryX = range(1, 1.84, 0.002).map((t) => relOf(t).x)
    const exitX = range(1.86, 2.84, 0.002).map((t) => relOf(t).x)
    expect(Math.max(...entryX)).toBeGreaterThan(7)
    expect(Math.min(...entryX)).toBeLessThan(-7)
    expect(Math.max(...exitX)).toBeGreaterThan(7)
    expect(Math.min(...exitX)).toBeLessThan(-7)
  })

  it('keeps the reveal glow anchored to Ganesha throughout the approach', () => {
    const figureCenterY = LOTUS_WORLD_CENTER.y + (LOTUS_CENTER.y - LOTUS_PIVOT.y) * LOTUS_SCALE
    for (const t of range(1.01, 1.48, 0.005)) {
      lotusSequence(t, false, shot)
      expect(shot.orbPos.x, `x at t=${t}`).toBeCloseTo(LOTUS_WORLD_CENTER.x, 5)
      expect(shot.orbPos.y, `y at t=${t}`).toBeCloseTo(figureCenterY, 5)
      expect(shot.target.x, `target x at t=${t}`).toBeCloseTo(LOTUS_WORLD_CENTER.x, 5)
      expect(shot.orbSize, `size at t=${t}`).toBeGreaterThanOrEqual(2.2)
    }
  })

  it('starts the approach immediately without a second easing pause', () => {
    const a = relOf(1).clone()
    const b = relOf(1.005).clone()
    expect(a.distanceTo(b)).toBeGreaterThan(0.1)
  })

  it('shows the glow before Ganesha and keeps the early figure fully covered', () => {
    expect(lotusSequence(0.9, false, shot).orbK).toBeGreaterThan(0.9)
    expect(shot.figure).toBe(0)
    for (const t of range(1, 1.3, 0.002)) {
      lotusSequence(t, false, shot)
      if (shot.figure) expect(shot.orbSize, `t=${t}`).toBeGreaterThanOrEqual(6.8)
    }
  })

  it('ring only in front', () => {
    for (const t of range(0, 2.6, 0.0005)) {
      const r = relOf(t)
      if (shot.frontK > 0) {
        expect(angleFromFront(r), `t=${t}`).toBeLessThanOrEqual(10)
        expect(r.length(), `t=${t}`).toBeLessThanOrEqual(8)
      }
    }
  })

  it('hidden or shown only while the light covers him', () => {
    let prev = lotusSequence(0, false, shot).figure
    for (const t of range(0.0005, 2.9, 0.0005)) {
      lotusSequence(t, false, shot)
      if (shot.figure !== prev) {
        // the light actually drawn over him (overlay = orbK · flashK), or — on the exit — he
        // has already shrunk into the star (never a one-frame cut of a visible figure)
        const covered = shot.orbK * shot.flashK >= 0.3
        expect(covered || shot.figScale < 0.01, `t=${t}`).toBe(true)
      }
      prev = shot.figure
    }
  })

  it('nothing drawn over the wheel while it is still in frame', () => {
    // 24 Nov 2026: the light is born at t 0.7 at the right edge while the wheel leaves left.
    for (const t of range(0.55, 0.699, 0.001)) {
      lotusSequence(t, false, shot)
      expect(shot.figure, `t=${t}`).toBe(0)
      expect(shot.starsK, `t=${t}`).toBe(0)
      expect(shot.orbK, `t=${t}`).toBe(0)
    }
  })

  it('dive stars fade in behind the mantra', () => {
    expect(lotusSequence(0.99, false, shot).starsK).toBe(0)
    expect(lotusSequence(1.13, false, shot).starsK).toBeGreaterThan(0.2)
    expect(lotusSequence(1.13, false, shot).starsK).toBeLessThan(0.8)
    expect(lotusSequence(1.26, false, shot).starsK).toBe(1)
    expect(lotusSequence(2.5, false, shot).starsK).toBe(1)
  })

  it('speed changes smoothly (no lurch, no dead stop)', () => {
    const a = makeLotusShot()
    const b = makeLotusShot()
    lotusSequence(0, false, a)
    let prevSpeed = 0
    for (const t of range(0.0005, 2.9, 0.0005)) {
      lotusSequence(t, false, b)
      const speed = b.pos.distanceTo(a.pos)
      expect(Math.abs(speed - prevSpeed), `t=${t}`).toBeLessThan(0.02)
      prevSpeed = speed
      a.pos.copy(b.pos)
    }
  })

  it('exit ends as a rising star', () => {
    lotusSequence(2.6, false, shot)
    expect(shot.orbPos.y - LOTUS_WORLD_CENTER.y).toBeGreaterThanOrEqual(60)
    expect(shot.orbK).toBeLessThanOrEqual(0.01)
    expect([...EXIT.dark]).toEqual([2.45, 2.85])
  })

  it('reduced motion', () => {
    for (const t of [1.1, 1.5, 2.2]) {
      const r = relOf(t, true)
      expect(r.distanceTo(LOTUS_FRONT_REL), `t=${t}`).toBeLessThan(0.01)
      expect(shot.figure).toBe(1)
      expect(shot.flashK).toBe(0)
    }
    lotusSequence(0.7, true, shot)
    expect(shot.pos.distanceTo(new Vector3(0, 0, 6))).toBeLessThan(1e-6)
    expect(shot.figure).toBe(0)
    expect(shot.starsK).toBe(0)
    expect(shot.orbK).toBe(0)
  })
})
