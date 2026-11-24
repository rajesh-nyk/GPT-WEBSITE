import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { wheelSwing } from './wheelPath'

function restCamera(aspect: number) {
  const cam = new PerspectiveCamera(35, aspect, 0.1, 50)
  cam.position.set(0, 0, 6)
  cam.lookAt(0, 0, 0)
  cam.updateMatrixWorld()
  cam.updateProjectionMatrix()
  return cam
}

/** Wheel centre at the end of the swing, as seen by the resting camera. */
function offScreen(aspect: number) {
  const s = wheelSwing(1)
  const p = new Vector3(0, 1, 0).add(new Vector3(s.dx, s.dy, s.dz))
  const cam = restCamera(aspect)
  const inFront = p.clone().applyMatrix4(cam.matrixWorldInverse).z < 0
  const ndc = p.clone().project(cam)
  return !inFront || Math.abs(ndc.x) > 1.2
}

describe('wheel swing-out', () => {
  it('identity before 0.55', () => {
    for (const t of [0, 0.3, 0.55]) {
      expect(wheelSwing(t)).toEqual({ dx: 0, dy: 0, dz: 0, rotY: 0, roll: 0, visible: true })
    }
  })

  it('turned 70° at the end, then gone', () => {
    const end = wheelSwing(1)
    expect(end.rotY).toBeCloseTo(1.2217, 2)
    expect(end.visible).toBe(true)
    expect(wheelSwing(0.999).visible).toBe(true)
    expect(wheelSwing(1.001).visible).toBe(false)
  })

  it('off screen on laptop', () => {
    expect(offScreen(1.6)).toBe(true)
  })

  it('off screen on phone', () => {
    expect(offScreen(0.46)).toBe(true)
  })
})
