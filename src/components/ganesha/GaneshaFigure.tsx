import { useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { FrontSide, type Mesh, type MeshStandardMaterial, type Object3D } from 'three'
import type { Group } from 'three'
import { Model } from '../Model'
import { useMotionFrame } from '../../lib/useMotionFrame'
import { ganeshaFx } from './fx'
import { applyReveal, reveal } from './reveal'
import { useSurfacePoints } from './points'

const FLOAT_PX = 7
const FLOAT_SECONDS = 7.5
/** The seam starts just below the frame's bottom edge (the frame cuts at mid-trunk). */
const FRONT_START = -0.74

/**
 * The solid Ganesha, revealed by a rising seam of molten gold (see reveal.ts): below
 * the seam he is fully solid and opaque — no transparency, no see-through artefacts —
 * above it, only the gold dust. Once formed: a ±7px idle float. He is removed only
 * under the full cover of the flower shower.
 * Reduced motion: no frame updates run, so he's simply there, complete and still.
 */
export function GaneshaFigure() {
  const float = useRef<Group>(null)
  const pxToWorld = useThree((s) => s.viewport.height / s.size.height)
  const { box } = useSurfacePoints('ganesha')
  const frontEnd = box.max.y + 0.08

  useMotionFrame(() => {
    const g = float.current
    if (!g) return
    const u = reveal.uniforms
    u.uFront.value = FRONT_START + (frontEnd - FRONT_START) * ganeshaFx.reveal
    u.uSeam.value = ganeshaFx.seam
    if (g.parent) u.uToModel.value.copy(g.parent.matrixWorld).invert()
    g.visible = ganeshaFx.reveal > 0 && ganeshaFx.leave < 0.5 && ganeshaFx.presence > 0
    g.position.y =
      Math.sin((ganeshaFx.time / FLOAT_SECONDS) * Math.PI * 2) * FLOAT_PX * pxToWorld * ganeshaFx.idle
  })

  return (
    <group ref={float}>
      <Model src="ganesha.glb" castShadow={false} receiveShadow={false} customize={prepare} />
    </group>
  )
}

/**
 * Keep the painted colours (sindoor red, gold, deep purple sit right in the palette) and
 * let the gold ornaments read as metal under the rim light. The scan is a closed solid:
 * cull back faces for speed. Every material gets the reveal seam.
 */
function prepare(root: Object3D) {
  root.traverse((child) => {
    const mesh = child as Mesh
    if (!mesh.isMesh) return
    for (const m of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as MeshStandardMaterial[]) {
      m.side = FrontSide
      if (m.isMeshStandardMaterial) m.envMapIntensity = 1.2
      applyReveal(m)
    }
  })
}
