import { Suspense, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Html, useGLTF } from '@react-three/drei'
import { createPortal, useFrame, useThree } from '@react-three/fiber'
import { Box3, MathUtils, Vector2, Vector3 } from 'three'
import { useQuality } from '../../lib/quality'
import { useReducedMotion } from '../../lib/useReducedMotion'
import { SceneCanvas } from '../three/SceneCanvas'
import { CloudLayer, makeNoiseTexture, type CloudSpec } from './PageTwoClouds'

// Taller peaks on the left, a dip in the middle, and a wide bank along the base.
const BANK: CloudSpec[] = [
  { pos: [-.32, -.1, -3.7], half: [.27, .63, 1.6], seed: 2.9, drift: .045, bob: .07, sway: .28 },
  { pos: [.33, -.2, -2.6], half: [.28, .51, 1.5], seed: 7.9, drift: .037, bob: .07, sway: .21 },
  { pos: [.01, -.43, -.5], half: [.57, .39, 1.7], seed: 5.2, drift: .032, bob: .05, sway: .23 },
  { pos: [-.23, -.43, .65], half: [.27, .36, 1.2], seed: 8.3, drift: .05, bob: .06, sway: .16 },
]
const LIGHT = new Vector2(-2, 3.8)
const NO_FACE = new Vector3()
const FULL_BANK = { scroll: () => 0, intro: () => 1 }
const previewParams = new URLSearchParams(window.location.search)
const cloudFile = previewParams.get('cloud-detail') === 'full' ? 'story-cloudscape-preview.glb' : 'story-cloudscape-lite.glb'
const CLOUDSCAPE_URL = `${import.meta.env.BASE_URL}clouds/${cloudFile}`
const USE_SHADER = previewParams.get('footer') === 'shader'
const namePreference = previewParams.get('cloud-names')
const SHOW_PUFF_NAMES = !USE_SHADER && (namePreference === '1' || (import.meta.env.DEV && namePreference !== '0'))

type CloudScroll = RefObject<{ coverage: number; visit: number }>
type PuffDrift = { index: number; delay: number; duration: number; from: Vector3; to: Vector3 }

function keepWithinCloudField(value: number, center: number, radius: number) {
  const min = center - radius
  return min + MathUtils.pingpong(value - min, 2 * radius)
}

function CloudBank() {
  const { tier, ultra } = useQuality()
  const camera = useThree((state) => state.camera)
  const viewport = useThree((state) => state.viewport)
  const { width, height } = useThree((state) => state.size)
  const noise = useMemo(() => makeNoiseTexture(), [])
  useEffect(() => () => noise.dispose(), [noise])

  const specs = useMemo(() => {
    const bank = tier === 'low' ? BANK.slice(0, 3) : BANK
    return bank.map<CloudSpec>((cloud) => {
      const [x, y, z] = cloud.pos
      const view = viewport.getCurrentViewport(camera, new Vector3(0, 0, z), { width, height, top: 0, left: 0 })
      return {
        ...cloud,
        pos: [x * view.width, y * view.height, z],
        half: [cloud.half[0] * view.width, cloud.half[1] * view.height, cloud.half[2]],
      }
    })
  }, [camera, height, tier, viewport, width])

  // Ultra supersamples a wide footer at 4K. The height limit bounds cost on narrow screens.
  const renderScale = ultra
    ? Math.min(3840 / Math.max(1, width), 1080 / Math.max(1, height))
    : tier === 'high'
    ? Math.min(viewport.dpr, 3840 / Math.max(1, width), Math.sqrt(1_600_000 / Math.max(1, width * height)))
    : tier === 'low' ? .45 : .82

  return <CloudLayer specs={specs} front={false} noise={noise} palette="pearl"
    steps={tier === 'high' ? 42 : tier === 'low' ? 20 : 28}
    lightSteps={tier === 'high' ? 5 : 3}
    resScale={renderScale}
    light={LIGHT} face={NO_FACE} footer={FULL_BANK} />
}

function CloudscapeModel({ labels, scroll }: { labels: RefObject<HTMLElement>; scroll: CloudScroll }) {
  const { scene } = useGLTF(CLOUDSCAPE_URL)
  const reduced = useReducedMotion()
  const { width, height } = useThree((state) => state.viewport)
  const { center, size } = useMemo(() => {
    const bounds = new Box3().setFromObject(scene)
    return { center: bounds.getCenter(new Vector3()), size: bounds.getSize(new Vector3()) }
  }, [scene])
  const scale = Math.min(width / size.x, height / size.y)
  const model = useMemo(() => scene.clone(), [scene])
  const puffs = useMemo(() => model.children.map(node => ({
    node,
    origin: node.position.clone(),
    label: null as HTMLSpanElement | null,
  })), [model])
  const reveal = useRef({ visit: -1, order: [] as number[], firstCount: 0, afterArrival: 0 })
  const motion = useRef({
    group: [] as PuffDrift[],
    elapsed: 0,
  })

  useFrame((_, delta) => {
    const { coverage, visit } = scroll.current
    const sequence = reveal.current
    if (sequence.visit !== visit) {
      sequence.visit = visit
      sequence.order = puffs.map((_, i) => i)
      for (let i = sequence.order.length - 1; i > 0; i--) {
        const j = MathUtils.randInt(0, i)
        const cloud = sequence.order[i]
        sequence.order[i] = sequence.order[j]
        sequence.order[j] = cloud
      }
      const previousCount = sequence.firstCount
      sequence.firstCount = previousCount
        ? (previousCount - 1 + MathUtils.randInt(1, 6)) % 7 + 1
        : MathUtils.randInt(1, 7)
      sequence.afterArrival = 0
    }
    if (coverage === 1 && !reduced) {
      sequence.afterArrival = Math.min(1, sequence.afterArrival + Math.min(delta, .1) / 4)
    }
    const earlyCount = sequence.firstCount
    const lateCount = puffs.length - earlyCount
    const lateProgress = Math.min(sequence.afterArrival, MathUtils.smoothstep(coverage, .62, 1))

    sequence.order.forEach((index, rank) => {
      const early = rank < earlyCount
      const start = early
        ? .16 + .58 * rank / Math.max(1, earlyCount - 1)
        : .74 * (rank - earlyCount) / Math.max(1, lateCount - 1)
      const amount = reduced ? 1 : MathUtils.smoothstep(early ? coverage : lateProgress, start, start + .26)
      const { node, label } = puffs[index]
      node.visible = amount > .001
      node.scale.set(.28 + .72 * amount, .03 + .97 * amount, .2 + .8 * amount)
      if (label) label.style.opacity = String(amount)
    })
  })

  useFrame((_, delta) => {
    const drift = motion.current
    if (reduced) {
      for (const { node, origin } of puffs) node.position.copy(origin)
      drift.group = []
      drift.elapsed = 0
      return
    }
    if (drift.group.every(puff => drift.elapsed >= puff.delay + puff.duration)) {
      const available = puffs.map((_, index) => index)
      const count = MathUtils.randInt(3, 10)
      const heading = MathUtils.randFloat(0, Math.PI * 2)
      drift.group = Array.from({ length: count }, (_, slot) => {
        const [index] = available.splice(MathUtils.randInt(0, available.length - 1), 1)
        const { node, origin } = puffs[index]
        const angle = heading + (slot + MathUtils.randFloat(-.2, .2)) * Math.PI * 2 / count
        const distance = MathUtils.randFloat(.11, .25)
        const from = node.position.clone()
        return {
          index,
          delay: MathUtils.randFloat(0, .95),
          duration: MathUtils.randFloat(15, 22),
          from,
          to: new Vector3(
            keepWithinCloudField(from.x + Math.cos(angle) * distance, origin.x, .32),
            keepWithinCloudField(from.y + Math.sin(angle) * distance * .65, origin.y, .2),
            keepWithinCloudField(from.z + MathUtils.randFloat(-.04, .04), origin.z, .09),
          ),
        }
      })
      drift.elapsed = 0
    }
    drift.elapsed += Math.min(delta, .05)
    for (const { index, delay, duration, from, to } of drift.group) {
      const amount = MathUtils.smoothstep(drift.elapsed - delay, 0, duration)
      puffs[index].node.position.lerpVectors(from, to, amount)
    }
  })

  return (
    <>
      <hemisphereLight color="#fff0d9" groundColor="#65536f" intensity={1.75} />
      <directionalLight color="#edc597" position={[-3, 4, 4]} intensity={2.8} />
      <directionalLight color="#d98979" position={[4, 1, -3]} intensity={.85} />
      <group position={[0, (size.y * scale - height) / 2, 0]} scale={scale}>
        <primitive object={model} position={[-center.x, -center.y, -center.z]} />
      </group>
      {SHOW_PUFF_NAMES && puffs.map(puff => createPortal(
        <Html portal={labels} center zIndexRange={[2, 0]}>
          <span ref={label => { puff.label = label }} className="p3-puff-name">{puff.node.name}</span>
        </Html>,
        puff.node,
      ))}
    </>
  )
}

export function StoryFooterClouds({ scroll }: { scroll: CloudScroll }) {
  const host = useRef<HTMLDivElement>(null)
  const labels = useRef<HTMLDivElement>(null!)
  const [opened, setOpened] = useState(false)

  useEffect(() => {
    const element = host.current
    if (!element) return
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      setOpened(true)
      observer.disconnect()
    }, { rootMargin: '200px 0px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <>
      <div ref={host} className="p3-footer-clouds" data-fullscreen={!USE_SHADER || undefined} aria-hidden="true">
        {opened && (
          <SceneCanvas label="3D footer clouds" effects={false} gl={{ antialias: !USE_SHADER, alpha: true }}
            camera={{ position: [0, 0, 6], fov: 40, near: .1, far: 30 }}>
            <Suspense fallback={null}>
              {USE_SHADER ? <CloudBank /> : <CloudscapeModel labels={labels} scroll={scroll} />}
            </Suspense>
          </SceneCanvas>
        )}
      </div>
      {SHOW_PUFF_NAMES && <div ref={labels} className="p3-puff-names" />}
    </>
  )
}
