import { Mesh, MeshBasicMaterial, type Material, type Object3D } from 'three'

const depthOnly = new MeshBasicMaterial({ colorWrite: false })
const PREPASS_MIN = 0.35


/**
 * Fades a solid model in/out without transparency artefacts. Plain opacity on a complex
 * mesh lets back parts show through front parts; a depth-only pre-pass (same geometry,
 * colourWrite off) first lays down the nearest surface, so only it gets blended.
 * At opacity 1 the model renders as normal opaque geometry (pre-pass removed); at 0 it's
 * hidden entirely (no draw cost).
 *
 * Usage (per frame):  fade ??= SolidFade.from(group); fade?.set(opacity)
 * from() returns null until the model has mounted (it loads inside Suspense).
 *
 * `occludes: true` keeps the depth pre-pass at ANY visible opacity: the object stays a
 * solid thing in the scene — dimmed, but whatever is behind it (stars, motes) is hidden,
 * never seen through it. Right for an object that sits dimmed for a long time (the
 * wheel as halo and watermark); wrong for a cross-fade between two objects in the same
 * place, where the pre-pass would cut a hole in the one behind.
 */
export class SolidFade {
  private materials: Material[]
  private meshes: Mesh[]
  private prepasses: Mesh[]
  private current = -1
  private prepassMin: number

  private constructor(meshes: Mesh[], occludes: boolean) {
    this.meshes = meshes
    this.prepassMin = occludes ? 0 : PREPASS_MIN
    this.materials = [...new Set(meshes.flatMap((m) => (Array.isArray(m.material) ? m.material : [m.material])))]
    this.prepasses = meshes.map((m) => {
      const p = new Mesh(m.geometry, depthOnly)
      p.renderOrder = -1
      return p
    })
  }

  static from(root: Object3D | null, { occludes = false }: { occludes?: boolean } = {}): SolidFade | null {
    if (!root) return null
    const meshes: Mesh[] = []
    root.traverse((o) => (o as Mesh).isMesh && !(o as Mesh).userData.prepass && meshes.push(o as Mesh))
    return meshes.length ? new SolidFade(meshes, occludes) : null
  }

  set(opacity: number) {
    // Snap the ends, so an eased fade really arrives at "gone" / "solid" (a value that
    // creeps toward 0 must not leave the model drawn at 0.00005 opacity — still writing
    // depth and cutting a hole in whatever is behind it).
    let o = Math.min(1, Math.max(0, opacity))
    if (o < 0.004) o = 0
    else if (o > 0.996) o = 1
    if (o === this.current) return
    const isSolid = o >= 1
    // The depth pre-pass prevents see-through artefacts — but it also hides whatever is
    // behind the model. Only worth it while the model is substantially visible; below
    // that, see-through is imperceptible while a hole in the background would not be.
    const usePrepass = o > 0 && o >= this.prepassMin && !isSolid
    this.current = o

    for (const m of this.meshes) m.visible = o > 0
    for (const m of this.materials) {
      m.transparent = !isSolid
      m.opacity = o
    }
    this.prepasses.forEach((p, i) => {
      if (usePrepass && !p.parent) {
        p.userData.prepass = true
        this.meshes[i].add(p)
      } else if (!usePrepass && p.parent) {
        p.removeFromParent()
      }
    })
  }
}
