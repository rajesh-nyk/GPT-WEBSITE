import { Matrix4, Vector3, type BufferGeometry, type Mesh, type Object3D } from 'three'

/**
 * Preview ?cine3: finds where the camera can fly THROUGH the wheel without grazing a spoke.
 * One pass, once: every triangle of the model is flattened onto the wheel's face (the
 * axle is its thinnest direction) and marked on a grid; spots whose whole surrounding disc
 * is empty are the openings. Coordinates are in the axle frame (the roll group's local
 * space), so the wheel's turn on its axle doesn't change them.
 */
const N = 192
const RADII = [0.3, 0.34, 0.38, 0.42, 0.46, 0.5, 0.54, 0.58, 0.62, 0.66, 0.7, 0.74]
const STEP_DEG = 3
const CLEAR = 0.055 // clearance radius, × wheel radius

export class WheelGap {
  readonly clear: Vector3[] = []
  done = false

  build(root: Object3D) {
    if (this.done) return
    root.updateWorldMatrix(true, true)
    const inv = new Matrix4().copy(root.matrixWorld).invert()
    const parts: { pos: Float32Array; index: ArrayLike<number> | null }[] = []
    const min = new Vector3(Infinity, Infinity, Infinity)
    const max = new Vector3(-Infinity, -Infinity, -Infinity)
    const v = new Vector3()
    const m = new Matrix4()
    root.traverse((o) => {
      const mesh = o as Mesh
      if (!mesh.isMesh || !mesh.visible) return
      const g = mesh.geometry as BufferGeometry
      const attr = g.attributes.position
      if (!attr) return
      m.multiplyMatrices(inv, mesh.matrixWorld)
      const pos = new Float32Array(attr.count * 3)
      for (let i = 0; i < attr.count; i++) {
        v.fromBufferAttribute(attr, i).applyMatrix4(m)
        pos[i * 3] = v.x
        pos[i * 3 + 1] = v.y
        pos[i * 3 + 2] = v.z
        min.min(v)
        max.max(v)
      }
      parts.push({ pos, index: g.index ? g.index.array : null })
    })
    if (!parts.length) return
    const size = max.clone().sub(min)
    const axle = size.x < size.y ? (size.x < size.z ? 0 : 2) : size.y < size.z ? 1 : 2
    const [ua, va] = [0, 1, 2].filter((a) => a !== axle)
    const c = min.clone().add(max).multiplyScalar(0.5).toArray()
    const R = Math.max(size.getComponent(ua), size.getComponent(va)) / 2
    const cell = (2 * R) / N
    const occ = new Uint8Array(N * N)
    const toCell = (x: number, cc: number) => Math.min(N - 1, Math.max(0, Math.floor((x - cc + R) / cell)))
    for (const { pos, index } of parts) {
      const tris = index ? index.length / 3 : pos.length / 9
      for (let t = 0; t < tris; t++) {
        let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
        for (let k = 0; k < 3; k++) {
          const i = index ? index[t * 3 + k] : t * 3 + k
          const u = pos[i * 3 + ua], w = pos[i * 3 + va]
          if (u < u0) u0 = u
          if (u > u1) u1 = u
          if (w < v0) v0 = w
          if (w > v1) v1 = w
        }
        const a0 = toCell(u0, c[ua]), a1 = toCell(u1, c[ua]), b0 = toCell(v0, c[va]), b1 = toCell(v1, c[va])
        for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) occ[b * N + a] = 1
      }
    }
    const rc = Math.ceil((CLEAR * R) / cell)
    for (const rf of RADII) {
      for (let d = 0; d < 360; d += STEP_DEG) {
        const an = (d * Math.PI) / 180
        const cu = c[ua] + Math.cos(an) * rf * R
        const cv = c[va] + Math.sin(an) * rf * R
        const ia = toCell(cu, c[ua]), ib = toCell(cv, c[va])
        let ok = true
        for (let b = -rc; ok && b <= rc; b++)
          for (let a = -rc; a <= rc; a++) {
            if (a * a + b * b > rc * rc) continue
            const x = ia + a, y = ib + b
            if (x < 0 || y < 0 || x >= N || y >= N || occ[y * N + x]) { ok = false; break }
          }
        if (!ok) continue
        const p = new Vector3().fromArray(c)
        p.setComponent(ua, cu)
        p.setComponent(va, cv)
        this.clear.push(p)
      }
    }
    this.done = true
  }
}
