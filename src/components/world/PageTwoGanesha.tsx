import { Environment, Lightformer } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef, type RefObject } from 'react'
import { Group, MathUtils, Mesh, Vector3, type BufferAttribute, type BufferGeometry, type MeshLambertMaterial, type MeshStandardMaterial, type Object3D, type Points, type ShaderMaterial } from 'three'
import { ScrollTrigger } from '../../lib/gsap'
import { pointer } from '../../lib/pointer'
import { useReducedMotion } from '../../lib/useReducedMotion'
import { Model } from '../Model'
import { Prewarm } from '../three/Prewarm'
import { SceneCanvas } from '../three/SceneCanvas'
import { ganeshaPose, ganeshaPoseGLSL, lotusGrade, makeOrnamentGlints } from './lotus/appearance'
import { LOTUS_H, LOTUS_PIVOT, LOTUS_R } from './lotus/layout'
import { splitByPart } from './lotus/parts'
import { projectCircle } from './screenShapes'

type LotusMesh = Mesh<BufferGeometry, MeshStandardMaterial | MeshLambertMaterial>
const PETALS = 'lotus-petals'
const GANESHA = 'ganesha-figure'
const SEAT = 'ganesha-seat'
const GLINTS = 'ganesha-ornament-glints'
const ENTRY_ANGLE = MathUtils.degToRad(-12)
const EXIT_ANGLE = MathUtils.degToRad(180)
const PEAK_GLOW = 0.65
const SWAY_ANGLE = MathUtils.degToRad(1.2)
const SEAT_HEIGHT = 0.08
const FRAMING_ASPECT_LIMIT = 1.16
const FULL_LENS = 2 * Math.tan(MathUtils.degToRad(35 / 2))
const petalBreath = new WeakMap<LotusMesh['material'], { value: number }>()
export const ganeshaPosition = { sample: null as (() => Vector3 | null) | null }

function gradePetals(material: LotusMesh['material']) {
  const opening = { value: 0 }
  petalBreath.set(material, opening)
  material.customProgramCacheKey = () => 'page-two-lotus-blush-breath'
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPetalBreath = opening
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPetalPosition;\nuniform float uPetalBreath;')
      .replace('#include <begin_vertex>', /* glsl */ `
        #include <begin_vertex>
        vPetalPosition = position;
        // The outermost join vertex is at radius 0.126. Flex only past the join.
        float tip = smoothstep(0.129, 0.20, length(position.xz)) * smoothstep(0.025, 0.09, position.y);
        transformed.xz += position.xz * (0.052 * tip * uPetalBreath);
        transformed.y -= 0.009 * tip * uPetalBreath;
      `)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vPetalPosition;\n${lotusGrade}`)
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = lotusGrade(diffuseColor.rgb, vPetalPosition);')
  }
}

function animateFigure(material: LotusMesh['material']) {
  material.customProgramCacheKey = () => 'page-two-ganesha-pose'
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, ganeshaPose)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${ganeshaPoseGLSL}`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = ganeshaPoseNormal(objectNormal, position);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = ganeshaPosePoint(position);')
  }
}

function prepareLotus(root: Object3D) {
  const petals = root.getObjectByProperty('isMesh', true) as LotusMesh | undefined
  const part = petals?.geometry.getAttribute('_part')
  if (!petals) return
  if (!part) {
    // The low-tier material conversion can clone a model that was already split.
    if (petals.name === PETALS) {
      gradePetals(petals.material)
      const figure = petals.getObjectByName(GANESHA) as LotusMesh | undefined
      if (figure) animateFigure(figure.material)
    }
    return
  }

  const [lotusGeometry, figureGeometry] = splitByPart(petals.geometry, part as BufferAttribute)
  const spark = petals.geometry.getAttribute('_spark') as BufferAttribute | undefined
  const figure = new Mesh(figureGeometry, petals.material.clone())
  figure.name = GANESHA
  figure.material.emissive.set('#ffd29b')
  figure.material.emissiveMap = figure.material.map
  figure.material.emissiveIntensity = 0
  animateFigure(figure.material)
  if (spark) {
    const glints = makeOrnamentGlints(petals.geometry, spark)
    glints.name = GLINTS
    figure.add(glints)
  }

  petals.name = PETALS
  petals.geometry = lotusGeometry
  const material = petals.material.clone()
  petals.material = material
  material.emissive.set('#ffb7bd')
  material.emissiveIntensity = 0
  if ('metalness' in material) {
    material.metalness = 0.12
    material.roughness = 0.85
  }
  gradePetals(material)
  const seat = new Group()
  seat.name = SEAT
  seat.position.y = SEAT_HEIGHT
  figure.position.y = -SEAT_HEIGHT
  seat.add(figure)
  petals.add(seat)
}

function LotusFigure({ frame }: { frame: RefObject<HTMLDivElement | null> }) {
  const { width, height } = useThree((state) => state.size)
  const invalidate = useThree((state) => state.invalidate)
  const getSceneState = useThree((state) => state.get)
  const reducedMotion = useReducedMotion()
  const model = useRef<Group>(null)
  const entry = useRef<ScrollTrigger | null>(null)
  const exit = useRef<ScrollTrigger | null>(null)
  const idleTime = useRef(0)
  const hover = useRef(0)
  const hoverCenter = useRef(new Vector3()).current
  const painted = useRef(false)
  // Keep the framing on ultrawide displays without hiding anything outside it.
  const aspect = MathUtils.clamp(width / Math.max(1, height), 0.1, FRAMING_ASPECT_LIMIT)
  const scale = Math.min(6 * FULL_LENS * aspect * 0.72 / (2 * LOTUS_R), 6 * FULL_LENS * 0.60 / LOTUS_H)

  useLayoutEffect(() => {
    const position = new Vector3()
    const sample = () => {
      const { frameloop } = getSceneState()
      if (frameloop === 'never') return null
      return model.current?.getObjectByName(SEAT)?.getWorldPosition(position) ?? null
    }
    ganeshaPosition.sample = sample
    return () => {
      if (ganeshaPosition.sample === sample) ganeshaPosition.sample = null
    }
  }, [getSceneState])

  useLayoutEffect(() => {
    if (reducedMotion) {
      invalidate()
      return
    }
    const arrival = ScrollTrigger.create({
      trigger: '#hero',
      start: 'top top',
      end: 'bottom top',
      onUpdate: () => invalidate(),
      onRefresh: () => invalidate(),
    })
    const departure = ScrollTrigger.create({
      trigger: '#page-2',
      start: 'top top',
      end: 'bottom top',
      onUpdate: () => invalidate(),
      onRefresh: () => invalidate(),
    })
    entry.current = arrival
    exit.current = departure
    invalidate()
    return () => {
      arrival.kill()
      departure.kill()
      entry.current = null
      exit.current = null
    }
  }, [invalidate, reducedMotion])

  useFrame(({ camera, size, viewport }, delta) => {
    const petals = model.current?.getObjectByName(PETALS) as LotusMesh | undefined
    const seat = petals?.getObjectByName(SEAT)
    const figure = seat?.getObjectByName(GANESHA) as LotusMesh | undefined
    if (!petals || !seat || !figure) return
    const progress = reducedMotion ? 1 : entry.current?.progress ?? 0
    // Rotate the complete seated sculpture around its central vertical axis.
    // Direct scroll progress: no scrub lag, hold, or independent time animation.
    // Turning the lotus together with the figure preserves the scanned joins.
    const departureProgress = reducedMotion ? 0 : MathUtils.clamp(exit.current?.progress ?? 0, 0, 1)
    if (model.current) model.current.rotation.y = EXIT_ANGLE * departureProgress
    const turn = ENTRY_ANGLE * (1 - MathUtils.smootherstep(progress, 0.24, 0.94))
    const idle = reducedMotion ? 0 : MathUtils.smootherstep(progress, 0.86, 1)
    const dt = Math.min(delta, 0.05)
    if (idle > 0) {
      idleTime.current += dt
      invalidate()
    }
    let hovering = false
    if (idle > 0 && pointer.active && pointer.type === 'mouse') {
      // Both hit areas stay anchored to the resting pose during each breath.
      const mouseX = pointer.clientX - size.left
      const mouseY = pointer.clientY - size.top
      hoverCenter.set(0, (0.194 - LOTUS_PIVOT.y) * scale, 0.035 * scale)
      const statue = projectCircle(hoverCenter, 0.105 * scale, camera, size.width, size.height)
      const x = (mouseX - statue.x) / statue.r
      const y = (mouseY - statue.y) / (statue.r * 0.87)
      hoverCenter.set(0, (0.062 - LOTUS_PIVOT.y) * scale, 0.055 * scale)
      const flower = projectCircle(hoverCenter, LOTUS_R * scale, camera, size.width, size.height)
      const petalX = (mouseX - flower.x) / flower.r
      const petalY = (mouseY - flower.y) / (flower.r * 0.39)
      hovering = x * x + y * y <= 1 || petalX * petalX + petalY * petalY <= 1
    }
    hover.current = idle > 0 ? MathUtils.damp(hover.current, Number(hovering), 3, dt) : 0
    const inhale = (0.5 - 0.5 * Math.cos(idleTime.current * 2 * Math.PI / 5.6)) * idle
    const sway = Math.sin(idleTime.current * 2 * Math.PI / 9) * SWAY_ANGLE * idle * (1 - hover.current * 0.8)
    const bodyWidth = 1 + inhale * (0.008 + 0.013 * hover.current)
    ganeshaPose.uFigureTurn.value = turn
    ganeshaPose.uFigureSway.value = sway
    ganeshaPose.uFigureStretch.value.set(bodyWidth, 1 + inhale * (0.024 + 0.062 * hover.current))
    const opening = petalBreath.get(petals.material)
    if (opening) opening.value = inhale * hover.current
    const glow = MathUtils.smootherstep(progress, 0.32, 1)
    petals.material.emissiveIntensity = glow * PEAK_GLOW
    figure.material.emissiveIntensity = glow * PEAK_GLOW * 0.6
    const glints = figure.getObjectByName(GLINTS) as Points<BufferGeometry, ShaderMaterial> | undefined
    if (glints) {
      glints.material.uniforms.uGlow.value = glow
      glints.material.uniforms.uDpr.value = viewport.dpr
    }
    if (!painted.current && frame.current) {
      frame.current.dataset.modelPainted = ''
      painted.current = true
    }
  })

  return (
    <>
      <Environment frames={1} resolution={64} environmentIntensity={0.55}>
        <Lightformer position={[-3, 3, 4]} target={[0, 0, 0]} scale={[4, 3, 1]} intensity={2} color="#ffe7cb" />
        <Lightformer position={[3, 2, -4]} target={[0, 0, 0]} scale={[2, 4, 1]} intensity={1.5} color="#c7b6ff" />
      </Environment>
      <hemisphereLight args={['#fff0d8', '#503042', 1.1]} />
      <directionalLight position={[-3, 4, 5]} intensity={2.1} color="#ffe6cc" />
      <directionalLight position={[3, 2, -3]} intensity={1.4} color="#ffbc80" />
      <group ref={model} scale={scale} position={[0, -LOTUS_PIVOT.y * scale, 0]}>
        <Model src="lotus-ganesha.glb" customize={prepareLotus} castShadow={false} receiveShadow={false}>
          <Prewarm models={[]} />
        </Model>
      </group>
    </>
  )
}

export function PageTwoGanesha() {
  const frame = useRef<HTMLDivElement>(null)
  return (
    <div ref={frame} className="ganesha-shot pointer-events-none absolute inset-0">
      <SceneCanvas
        label="Ganesha seated on a lotus"
        camera={{ position: [0, 0, 6], fov: 35, near: 0.1, far: 50 }}
        effects={false}
        still
      >
        <LotusFigure frame={frame} />
      </SceneCanvas>
    </div>
  )
}
