import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { DoubleSide, Group, MathUtils, Mesh, MeshBasicMaterial, SRGBColorSpace } from 'three'
import { useRestViewport } from '../../lib/restViewport'
import { journey } from './journey'

// Realistic, softly lit cloud artwork extracted from the approved concept,
// with transparent edges. Cached once, sampled by all six planes.
const CLOUD_URL = `${import.meta.env.BASE_URL}clouds/soft-cloud.webp`

const CLOUDS = [
  { x: -.39, z: .9, start: .14, end: .81, width: .98, drift: -.10, opacity: .65 },
  { x: .36, z: 1.0, start: .17, end: .83, width: 1.02, drift: .10, opacity: .72 },
  { x: -.31, z: 1.85, start: .24, end: .91, width: 1.20, drift: -.12, opacity: .92 },
  { x: .37, z: 2.0, start: .27, end: .94, width: 1.16, drift: .11, opacity: .94 },
  { x: -.26, z: 2.85, start: .30, end: .98, width: 1.50, drift: -.16, opacity: 1 },
  { x: .34, z: 3.0, start: .32, end: .99, width: 1.52, drift: .15, opacity: 1 },
]

/** Six lightweight camera-facing textured planes in the existing canvas. At the end
 * they are hidden, revealing the very same stars, rather than a white page. */
export function CloudFlyThrough() {
  const group = useRef<Group>(null)
  const meshes = useRef<(Mesh | null)[]>([])
  const viewport = useRestViewport()
  const texture = useTexture(CLOUD_URL)
  texture.colorSpace = SRGBColorSpace
  const materials = useMemo(() => CLOUDS.map(() => new MeshBasicMaterial({
    map: texture, transparent: true, depthWrite: false, side: DoubleSide,
    toneMapped: false, opacity: 0,
  })), [texture])

  useEffect(() => () => {
    materials.forEach(m => m.dispose())
  }, [materials])

  useFrame(() => {
    const p = MathUtils.clamp(journey.target, 0, 1)
    if (!group.current) return
    group.current.visible = p > .14 && p < .99
    if (!group.current.visible) return
    CLOUDS.forEach((c, i) => {
      const mesh = meshes.current[i]
      if (!mesh) return
      const t = MathUtils.clamp((p - c.start) / (c.end - c.start), 0, 1)
      mesh.visible = t > 0 && t < 1
      if (!mesh.visible) return
      const depth = c.z + t * .50
      const ratio = (6 - depth) / 6
      const w = viewport.width * ratio, h = viewport.height * ratio
      const cloudWidth = Math.max(w * c.width, h * 1.65) * (1 + t * .18)
      mesh.position.set(w * (c.x + c.drift * t), h * MathUtils.lerp(-1.12, 1.23, t), depth)
      mesh.scale.set(cloudWidth * (i % 2 ? -1 : 1), cloudWidth * (77 / 192), 1)
      materials[i].opacity = c.opacity * MathUtils.smoothstep(t, 0, .14) * (1 - MathUtils.smoothstep(t, .79, 1))
    })
  })

  return (
    <group ref={group} visible={false}>
      {CLOUDS.map((_, i) => (
        <mesh key={i} ref={node => { meshes.current[i] = node }} material={materials[i]} renderOrder={20+i} frustumCulled={false}>
          <planeGeometry args={[1, 1]} />
        </mesh>
      ))}
    </group>
  )
}
