import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { DataTexture, Group, LinearFilter, LinearMipmapLinearFilter, MathUtils, Mesh, MeshBasicMaterial, RGBAFormat, SRGBColorSpace, UnsignedByteType } from 'three'
import { useRestViewport } from '../../lib/restViewport'
import { journey } from './journey'

// Deterministic, baked-once cloud texture: fractal noise displaces several
// overlapping density volumes, with cool shadows and bright upper lobes.
// No per-frame noise, DOM filters, volume marching, or external asset requests.
function bakeCloud(seed: number) {
  const width = 512, height = 256
  const data = new Uint8Array(width * height * 4)
  const hash = (x: number, y: number) => {
    let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 144269)
    n = Math.imul(n ^ (n >>> 13), 1274126177)
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295
  }
  const noise = (x: number, y: number) => {
    const ix = Math.floor(x), iy = Math.floor(y)
    let fx = x - ix, fy = y - iy
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy)
    return MathUtils.lerp(MathUtils.lerp(hash(ix, iy), hash(ix + 1, iy), fx),
      MathUtils.lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), fx), fy)
  }
  const fbm = (x: number, y: number) => {
    let v = 0, a = .54
    for (let i = 0; i < 5; i++) {
      v += noise(x, y) * a
      x = x * 2.07 + 17; y = y * 2.07 + 13; a *= .48
    }
    return v
  }
  const density = new Float32Array(width * height)
  const lobes = Array.from({ length: 9 }, (_, i) => ({
    x: .11 + i * .097,
    y: .44 + hash(i, 9) * .19 + Math.sin(i * .63) * .095,
    rx: .115 + hash(i, 11) * .09,
    ry: .22 + hash(i, 15) * .15,
  }))
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = x / (width - 1), v = y / (height - 1)
    const n = fbm(u * 7, v * 5)
    const warp = (n - .48) * .14
    let shape = 0
    for (const l of lobes) {
      const dx = (u + warp - l.x) / l.rx, dy = (v + warp - l.y) / l.ry
      shape = Math.max(shape, 1 - Math.sqrt(dx * dx + dy * dy))
    }
    const edge = MathUtils.smoothstep(u, 0, .07) * (1 - MathUtils.smoothstep(u, .93, 1))
      * MathUtils.smoothstep(v, 0, .10) * (1 - MathUtils.smoothstep(v, .90, 1))
    density[y * width + x] = MathUtils.smoothstep(shape + (n - .46) * .77, -.075, .32) * edge
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, d = density[i]
    const v = y / (height - 1)
    const above = density[Math.min(height - 1, y + 9) * width + Math.max(0, x - 5)]
    const light = MathUtils.clamp(.30 + .62 * v + (d - above) * .48 + (noise(x / 24, y / 24) - .5) * .20, 0, 1)
    data[4*i] = Math.round(MathUtils.lerp(101, 246, light))
    data[4*i+1] = Math.round(MathUtils.lerp(120, 249, light))
    data[4*i+2] = Math.round(MathUtils.lerp(158, 255, light))
    data[4*i+3] = Math.round(d * 255)
  }
  const texture = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearMipmapLinearFilter
  texture.magFilter = LinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

const CLOUDS = [
  { x: -.39, z: .9, start: .14, end: .81, width: .98, drift: -.10, opacity: .65 },
  { x: .36, z: 1.0, start: .17, end: .83, width: 1.02, drift: .10, opacity: .72 },
  { x: -.31, z: 1.85, start: .24, end: .91, width: 1.20, drift: -.12, opacity: .92 },
  { x: .37, z: 2.0, start: .27, end: .94, width: 1.16, drift: .11, opacity: .94 },
  { x: -.26, z: 2.85, start: .30, end: .98, width: 1.50, drift: -.16, opacity: 1 },
  { x: .34, z: 3.0, start: .32, end: .99, width: 1.52, drift: .15, opacity: 1 },
]

/** Six lightweight camera-facing planes in the existing canvas. At the end
 * they are hidden, revealing the very same stars, rather than a white page. */
export function CloudFlyThrough() {
  const group = useRef<Group>(null)
  const meshes = useRef<(Mesh | null)[]>([])
  const viewport = useRestViewport()
  const textures = useMemo(() => [bakeCloud(31), bakeCloud(71), bakeCloud(109)], [])
  const materials = useMemo(() => CLOUDS.map((_, i) => new MeshBasicMaterial({
    map: textures[i % textures.length], transparent: true, depthWrite: false,
    toneMapped: false, opacity: 0,
  })), [textures])

  useEffect(() => () => {
    materials.forEach(m => m.dispose())
    textures.forEach(t => t.dispose())
  }, [materials, textures])

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
      mesh.scale.set(cloudWidth, cloudWidth * .53, 1)
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
