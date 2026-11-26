import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { CanvasTexture, Color, Group, MathUtils, MeshBasicMaterial, SRGBColorSpace, TextureLoader, Vector3, type Texture } from 'three'
import { ScrollTrigger } from '../../lib/gsap'
import { useReducedMotion } from '../../lib/useReducedMotion'
import { DiagonalWipe } from '../DiagonalWipe'
import { SceneCanvas } from '../three/SceneCanvas'
import { pageTwoExit } from './PageTwoSky'
import './PageThreePortraits.css'

// Temporary, replaceable photo URLs. No personal pictures are used in this experiment.
const PHOTOS = [64, 1005, 1011, 1027, 1035, 177].map((id) => ({
  id,
  src: `https://picsum.photos/id/${id}/800/1000`,
}))
const SPACING = 7.8
const VIEW_DISTANCE = 6.9
const OFFSETS = [0, -2.7, 2.5, -2.4, 2.5, 0]
const HEIGHTS = [0, 0.38, -0.22, 0.3, -0.2, 0]
const ANGLES = [0, 0.13, -0.13, 0.11, -0.12, 0]

function usePhoto(src: string, index: number) {
  const [texture, setTexture] = useState<Texture | null>(null)
  useEffect(() => {
    let alive = true
    let loaded: Texture | undefined
    const canvas = document.createElement('canvas')
    canvas.width = 400
    canvas.height = 500
    const ctx = canvas.getContext('2d')
    if (ctx) {
      const g = ctx.createLinearGradient(0, 0, 400, 500)
      g.addColorStop(0, '#34264d')
      g.addColorStop(1, '#090711')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, 400, 500)
      ctx.fillStyle = '#d6b988'
      ctx.font = '24px serif'
      ctx.textAlign = 'center'
      ctx.fillText('Portrait ' + String(index + 1).padStart(2, '0'), 200, 250)
    }
    const placeholder = new CanvasTexture(canvas)
    placeholder.colorSpace = SRGBColorSpace
    setTexture(placeholder)
    const loader = new TextureLoader().setCrossOrigin('anonymous')
    const accept = (image: Texture) => {
      if (!alive) { image.dispose(); return }
      image.colorSpace = SRGBColorSpace
      image.anisotropy = 4
      loaded = image
      setTexture(image)
    }
    loader.load(src, accept, undefined, () => {
      if (alive) loader.load(`https://picsum.photos/seed/portrait-${index}/800/1000`, accept, undefined, () => {})
    })
    return () => { alive = false; placeholder.dispose(); loaded?.dispose() }
  }, [src, index])
  return texture
}

function Portrait({ index, progress, narrow }: { index: number; progress: RefObject<number>; narrow: number }) {
  const texture = usePhoto(PHOTOS[index].src, index)
  const group = useRef<Group>(null)
  const picture = useRef<MeshBasicMaterial>(null)
  const edge = useRef<MeshBasicMaterial>(null)
  const width = 3.25 * narrow
  const height = width * 1.25
  useFrame(({ clock, camera }) => {
    const g = group.current
    if (!g || !picture.current || !edge.current) return
    const t = progress.current * (PHOTOS.length - 1)
    const distance = index - t
    const focus = 1 - MathUtils.smoothstep(Math.abs(distance), 0, 1.25)
    const z = -index * SPACING
    const ahead = camera.position.z - z
    // The outgoing portrait gently loses opacity before the camera passes it.
    // This avoids flying through a solid photo or abruptly switching slides.
    const alpha = MathUtils.smoothstep(ahead, 1.1, 3.8)
    g.visible = alpha > 0.002
    g.position.set(OFFSETS[index] * narrow, HEIGHTS[index] + 0.045 * Math.sin(clock.elapsedTime * 0.55 + index * 1.6), z)
    g.rotation.y = ANGLES[index] * (1 - 0.75 * focus)
    g.rotation.z = 0.015 * Math.sin(index * 2.1) * (1 - focus)
    picture.current.opacity = alpha * MathUtils.lerp(0.64, 1, focus)
    picture.current.color.setScalar(MathUtils.lerp(0.65, 1, focus))
    edge.current.opacity = alpha * MathUtils.lerp(0.22, 0.57, focus)
  })
  return (
    <group ref={group} position={[OFFSETS[index] * narrow, HEIGHTS[index], -index * SPACING]}>
      <mesh>
        <boxGeometry args={[width + 0.025, height + 0.025, 0.065]} />
        <meshBasicMaterial ref={edge} color="#b29bce" transparent opacity={0.35} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0.035]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial ref={picture} map={texture} color="#ffffff" transparent opacity={1} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

function PhotoJourney({ progress }: { progress: RefObject<number> }) {
  const { size } = useThree()
  const narrow = Math.min(1, Math.max(0.40, size.width / Math.max(1, size.height) * 1.04))
  const cameraTarget = useMemo(() => new Vector3(), [])
  const stars = useMemo(() => {
    const p = new Float32Array(360 * 3)
    for (let i = 0; i < 360; i++) {
      p[i * 3] = Math.sin(i * 19.73) * 11
      p[i * 3 + 1] = Math.cos(i * 7.91) * 5
      p[i * 3 + 2] = 2 - ((i * 13.29) % 49)
    }
    return p
  }, [])
  useFrame(({ camera }) => {
    const p = MathUtils.clamp(progress.current, 0, 1) * (PHOTOS.length - 1)
    const i = Math.min(PHOTOS.length - 2, Math.floor(p))
    const f = p - i
    const ease = MathUtils.smootherstep(f, 0, 1)
    // The z path is continuous; the lateral movement settles at each portrait.
    const x = MathUtils.lerp(OFFSETS[i], OFFSETS[i + 1], ease) * narrow
    const y = MathUtils.lerp(HEIGHTS[i], HEIGHTS[i + 1], ease)
    const z = VIEW_DISTANCE - p * SPACING
    camera.position.set(x, y, z)
    cameraTarget.set(x * 0.94, y * 0.9, z - VIEW_DISTANCE)
    camera.lookAt(cameraTarget)
  }, -1)
  return (
    <>
      <fog attach="fog" args={[new Color('#090712'), 16, 46]} />
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[stars, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#d6c3f7" size={0.025} sizeAttenuation transparent opacity={0.38} depthWrite={false} />
      </points>
      {PHOTOS.map((photo, index) => <Portrait key={photo.id} index={index} narrow={narrow} progress={progress} />)}
    </>
  )
}

function StaticPortraits() {
  return <div className="portrait-fallback">{PHOTOS.map((photo, i) =>
    <img key={photo.id} src={photo.src} alt={`Temporary portrait ${i + 1}`} loading="lazy" />
  )}</div>
}

export function PageThreePortraits() {
  const section = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const progress = useRef(0)
  const reduced = useReducedMotion()
  useLayoutEffect(() => {
    const root = section.current, view = stage.current
    if (!root || !view || reduced) return
    const setEntry = (p: number) => {
      view.style.opacity = String(MathUtils.smoothstep(p, 0.18, 0.95))
    }
    const arrival = ScrollTrigger.create({
      trigger: root, start: 'top bottom', end: 'top top',
      onUpdate: self => setEntry(self.progress), onRefresh: self => setEntry(self.progress),
    })
    const journey = ScrollTrigger.create({
      trigger: root, start: 'top top', end: 'bottom bottom',
      onUpdate: self => { progress.current = self.progress },
      onRefresh: self => { progress.current = self.progress },
    })
    setEntry(arrival.progress)
    progress.current = journey.progress
    return () => { arrival.kill(); journey.kill(); view.style.removeProperty('opacity') }
  }, [reduced])
  return (
    <section ref={section} id="page-3" data-scroll-scene="" aria-label="Page 3 — Portrait journey"
      className={`chapter-panel chapter-panel--sliced z-20 portrait-chapter${reduced ? ' portrait-chapter--static' : ''}`}>
      <DiagonalWipe from="page-2" className="page-angle--purple" holdOutgoing={pageTwoExit} />
      {reduced ? <StaticPortraits /> :
        <div ref={stage} className="portrait-stage">
          <SceneCanvas label="A scroll-driven journey through six temporary photos in three-dimensional space"
            camera={{ position: [0, 0, VIEW_DISTANCE], fov: 44, near: 0.1, far: 80 }}
            gl={{ alpha: true }} effects={false} fallback={<StaticPortraits />}>
            <PhotoJourney progress={progress} />
          </SceneCanvas>
        </div>}
    </section>
  )
}
