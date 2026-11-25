import { Environment, Lightformer } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
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
const EXIT_ANGLE = MathUtils.degToRad(28)
const EXIT_ROTATION_RESPONSE = 16
const PEAK_GLOW = 0.65
// Approved aura is now the default. Use aura=0 for the original scene.
const AURA_ENABLED = typeof window === 'undefined' ||
  new URLSearchParams(window.location.search).get('aura') !== '0'
const AURA_SETTINGS = { aura: 0, rays: 0.43, violet: 0.38, lotus: 0.27, rayCount: 48 } as const
// Optional A/B comparison: shine=0 restores the previous rays.
const RAY_SHINE = typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('shine') !== '0' ? 1 : 0
// Experimental atmosphere: disabled by default; use ?mist=1 to compare.
const MIST_EXPERIMENT = typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('mist') === '1'
const MIST_DEFINES = MIST_EXPERIMENT ? { FLOWING_MIST: 1 } : {}
const lotusAuraGlow = { value: 0 }

const AURA_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// One bounded billboard: soft halo, irregular polar rays and two-scale haze.
// Normal alpha blending is intentional: this canvas is composited over a
// separate galaxy canvas, so the stars remain visible through the light.
const AURA_FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime, uFade, uAura, uRays, uViolet, uLotus, uRayCount, uShine;
  const float TAU = 6.28318530718;
  float hash(float x) {
    return fract(sin(x * 127.1 + 19.17) * 43758.5453);
  }
  float cloud(vec2 p) {
    return 0.5 + 0.5 * sin(p.x * 5.7 + sin(p.y * 4.4))
                       * cos(p.y * 6.1 - sin(p.x * 3.3));
  }
  #ifdef FLOWING_MIST
  uniform float uMistTime;
  // Continuous lattice noise instead of hashing every moving UV directly.
  // This keeps the cloud coherent between frames rather than sparkling.
  float mistHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float mistNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(mistHash(i), mistHash(i + vec2(1.0, 0.0)), u.x),
               mix(mistHash(i + vec2(0.0, 1.0)), mistHash(i + vec2(1.0)), u.x), u.y);
  }
  float mistFbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    // Four octaves per field instead of five to limit fragment cost.
    for (int i = 0; i < 4; i++) {
      value += amplitude * mistNoise(p);
      p = mat2(0.8, -0.6, 0.6, 0.8) * p * 2.1 + vec2(3.1, 7.2);
      amplitude *= 0.5;
    }
    return value / 0.9375;
  }
  vec4 flowingMist(vec2 uv, float edge) {
    // Two counter-flowing fields, following the supplied shader's speed.
    float t = uMistTime * 0.15;
    vec2 p = (uv - 0.5) * vec2(1.64, 1.0);
    vec2 q = p * 3.4 + vec2(t * 0.3, t * 0.1);
    vec2 s = p * 2.8 + vec2(-t * 0.2, t * 0.15);
    float n1 = mistFbm(q);
    float n2 = mistFbm(s + vec2(n1 * 1.4, n1 * 0.9));
    float density = smoothstep(0.30, 0.70, n2);
    float wisps = smoothstep(0.47, 0.78, n2) * smoothstep(0.30, 0.67, n1);
    // User's deep blue / indigo / purple palette with a restrained luminous crest.
    // RGB values are display-space equivalents of the supplied hex colours.
    vec3 color = mix(vec3(0.059, 0.102, 0.227), vec3(0.102, 0.102, 0.290), density);
    color = mix(color, vec3(0.227, 0.165, 0.416), n1 * 0.6);
    color = mix(color, vec3(0.38, 0.33, 0.65), wisps * 0.64);
    float boundary = 1.0 - smoothstep(0.27, 0.83, length(p * vec2(1.05, 1.25)));
    float alpha = density * 0.65 * edge * boundary * uFade;
    return vec4(color, alpha);
  }
  #endif

  void main() {
    // Local coordinates in the same units as the original scanned model.
    vec2 p = (vUv - 0.5) * vec2(0.90, 0.55);
    vec2 head = p - vec2(0.0, 0.085);
    float r = length(head);
    float breathe = 0.94 + 0.06 * sin(uTime * 0.85);
    float halo = uAura * breathe * (
      0.62 * exp(-dot(head, head) / 0.0036) +
      0.34 * exp(-dot(head, head) / 0.018)
    );
    // Exactly 48 angular cells, with stable per-ray width/length/intensity.
    // No 48-iteration loop, no ray marching, no textures.
    float angle = atan(head.y, head.x + 0.000001);
    float rayCell = fract((angle + 3.14159265) / TAU + uTime * 0.0022) * uRayCount;
    float id = floor(rayCell);
    float seed = hash(id);
    float localAngle = fract(rayCell) - 0.5;
    float width = mix(0.10, 0.29, hash(id + 7.0));
    float rayDistance = localAngle / width;
    float beam = exp(-rayDistance * rayDistance);
    float reach = mix(0.16, 0.38, hash(id + 31.0));
    float rayFade = 1.0 - smoothstep(0.045, reach, r);
    float flicker = 0.90 + 0.10 * sin(uTime * 0.65 + seed * TAU);
    float rays = uRays * beam * rayFade * smoothstep(0.025, 0.075, r)
      * mix(0.15, 0.65, seed) * flicker;
    // Narrow champagne-white cores catch the light, with slow highlights
    // travelling outward along each ray. Stagger phases to avoid uniform flashes.
    float core = exp(-rayDistance * rayDistance * 7.0);
    float phase = TAU * (r / 0.24 - uTime * 0.19 + seed);
    float wave = 0.5 + 0.5 * cos(phase);
    float glint = wave * wave * wave * wave;
    float shine = uShine * rays * core * (0.62 + 0.90 * glint);
    // Soft violet atmosphere, not a hard ring or a new background.
    vec2 q = head * 8.0;
    float mist = 0.55 * cloud(q + vec2(uTime * 0.045, 0.0))
               + 0.45 * cloud(q * 1.8 + vec2(0.0, -uTime * 0.035));
    float violet = uViolet * (0.20 + 0.45 * mist)
      * exp(-dot(head, head) / 0.055) * smoothstep(0.035, 0.13, r);
    // A broad, soft pink-gold reflection under the petal roots.
    vec2 lower = (p - vec2(0.0, -0.105)) / vec2(0.19, 0.075);
    float lotus = uLotus * 0.66 * exp(-dot(lower, lower)) * breathe;
    float edge = (1.0 - smoothstep(0.32, 0.50, abs(vUv.x - 0.5)))
               * (1.0 - smoothstep(0.32, 0.50, abs(vUv.y - 0.5)));
    float energy = halo + rays + violet + lotus + shine;
    vec3 light = halo * vec3(1.0, 0.66, 0.30)
               + rays * vec3(1.0, 0.77, 0.42)
               + shine * vec3(1.0, 0.94, 0.76)
               + violet * vec3(0.43, 0.25, 0.72)
               + lotus * vec3(1.0, 0.58, 0.53);
    vec3 color = light / max(energy, 0.0001);
    float alpha = (1.0 - exp(-energy * 1.45)) * edge * uFade;
    #ifdef FLOWING_MIST
    // Straight-alpha source-over composition: existing golden rays and halo
    // sit in front of the mist. No new geometry, texture or WebGL render pass.
    vec4 atmosphere = flowingMist(vUv, edge);
    float backAlpha = atmosphere.a * (1.0 - alpha);
    float combinedAlpha = alpha + backAlpha;
    color = (color * alpha + atmosphere.rgb * backAlpha) / max(combinedAlpha, 0.0001);
    alpha = combinedAlpha;
    #endif
    gl_FragColor = vec4(color, alpha);
  }
`
const SWAY_ANGLE = MathUtils.degToRad(1.2)
const SEAT_HEIGHT = 0.08
const FRAMING_ASPECT_LIMIT = 1.16
const FULL_LENS = 2 * Math.tan(MathUtils.degToRad(35 / 2))
const petalBreath = new WeakMap<LotusMesh['material'], { value: number }>()
export const ganeshaPosition = { sample: null as (() => Vector3 | null) | null }

function gradePetals(material: LotusMesh['material']) {
  const opening = { value: 0 }
  petalBreath.set(material, opening)
  material.customProgramCacheKey = () => AURA_ENABLED ? 'page-two-lotus-blush-breath-aura' : 'page-two-lotus-blush-breath'
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
    if (AURA_ENABLED) {
      shader.uniforms.uLotusAuraGlow = lotusAuraGlow
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uLotusAuraGlow;')
        .replace('#include <emissivemap_fragment>', /* glsl */ `
          #include <emissivemap_fragment>
          float rootLight = (1.0 - smoothstep(0.035, 0.19, length(vPetalPosition.xz)))
                          * (1.0 - smoothstep(0.045, 0.135, vPetalPosition.y));
          totalEmissiveRadiance += vec3(1.0, 0.64, 0.30) * rootLight * uLotusAuraGlow;
        `)
    }
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

function LotusFigure({ frame, invocation }: {
  frame: RefObject<HTMLDivElement | null>
  invocation: RefObject<HTMLElement | null>
}) {
  const { width, height } = useThree((state) => state.size)
  const invalidate = useThree((state) => state.invalidate)
  const getSceneState = useThree((state) => state.get)
  const reducedMotion = useReducedMotion()
  const model = useRef<Group>(null)
  const auraMaterial = useRef<ShaderMaterial>(null)
  const auraUniforms = useMemo(() => ({
    uTime: { value: 0 }, uFade: { value: 0 }, uMistTime: { value: 0 },
    uAura: { value: AURA_SETTINGS.aura }, uRays: { value: AURA_SETTINGS.rays },
    uViolet: { value: AURA_SETTINGS.violet }, uLotus: { value: AURA_SETTINGS.lotus },
    uRayCount: { value: AURA_SETTINGS.rayCount }, uShine: { value: RAY_SHINE },
  }), [])
  const entry = useRef<ScrollTrigger | null>(null)
  const exit = useRef<ScrollTrigger | null>(null)
  const idleTime = useRef(0)
  const mistTime = useRef(0)
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
    const dt = Math.min(delta, 0.05)
    // A restrained turn begins with the first scroll increment. Frame-rate
    // independent damping absorbs wheel/trackpad step changes in either direction.
    // Rotate the entire seated sculpture to preserve the figure/lotus joins.
    const departureProgress = reducedMotion ? 0 : MathUtils.clamp(exit.current?.progress ?? 0, 0, 1)
    const targetYaw = EXIT_ANGLE * departureProgress
    if (model.current) {
      const yaw = model.current.rotation.y
      const nextYaw = reducedMotion || Math.abs(targetYaw - yaw) < 0.0001
        ? targetYaw
        : MathUtils.damp(yaw, targetYaw, EXIT_ROTATION_RESPONSE, dt)
      model.current.rotation.y = nextYaw
      if (Math.abs(targetYaw - nextYaw) >= 0.0001) invalidate()
    }
    const turn = ENTRY_ANGLE * (1 - MathUtils.smootherstep(progress, 0.24, 0.94))
    const idle = reducedMotion ? 0 : MathUtils.smootherstep(progress, 0.86, 1)
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
    // One shared envelope for the divine rays and the bilingual invocation.
    // DOM text uses the exact shader fade; no second trigger or timed animation.
    const fade = MathUtils.smoothstep(progress, 0.35, 0.96)
      * (1 - MathUtils.smoothstep(departureProgress, 0, 0.90))
    if (invocation.current) {
      const opacity = fade.toFixed(3)
      if (invocation.current.style.opacity !== opacity) {
        invocation.current.style.opacity = opacity
        invocation.current.style.transform = reducedMotion
          ? 'none'
          : `translate3d(0, ${(12 * (1 - fade)).toFixed(2)}px, 0)`
      }
    }
    if (AURA_ENABLED && auraMaterial.current) {
      auraMaterial.current.uniforms.uFade.value = fade
      auraMaterial.current.uniforms.uTime.value = reducedMotion ? 0 : idleTime.current
      if (MIST_EXPERIMENT) {
        if (!reducedMotion && fade > 0) {
          mistTime.current += dt
          invalidate()
        }
        auraMaterial.current.uniforms.uMistTime.value = reducedMotion ? 0 : mistTime.current
      }
      lotusAuraGlow.value = AURA_SETTINGS.lotus * fade * (0.96 + 0.04 * inhale)
    }
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

  // Keep the billboard behind even the rotated model. Compensate for
  // perspective at its depth so its projected centre tracks the statue.
  const auraDepth = 0.25 * scale
  const auraPerspective = (6 + auraDepth) / 6

  return (
    <>
      {AURA_ENABLED && (
        <mesh
          position={[0, (0.15 - LOTUS_PIVOT.y) * scale * auraPerspective, -auraDepth]}
          renderOrder={-1}
        >
          <planeGeometry args={[0.90 * scale * auraPerspective, 0.55 * scale * auraPerspective]} />
          <shaderMaterial
            ref={auraMaterial}
            uniforms={auraUniforms}
            defines={MIST_DEFINES}
            vertexShader={AURA_VERTEX}
            fragmentShader={AURA_FRAGMENT}
            transparent
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}
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
  const invocation = useRef<HTMLElement>(null)
  return (
    <div ref={frame} className="ganesha-shot pointer-events-none absolute inset-0">
      <SceneCanvas
        label="Ganesha seated on a lotus"
        camera={{ position: [0, 0, 6], fov: 35, near: 0.1, far: 50 }}
        effects={false}
        still
      >
        <LotusFigure frame={frame} invocation={invocation} />
      </SceneCanvas>
      <footer
        ref={invocation}
        aria-label="Ganesha invocation"
        style={{
          position: 'absolute',
          insetInline: 0,
          bottom: 'max(4.5dvh, calc(env(safe-area-inset-bottom, 0px) + 12px))',
          zIndex: 1,
          textAlign: 'center',
          paddingInline: '16px',
          opacity: 0,
          transform: 'translate3d(0, 12px, 0)',
          // Static multi-radius neon shadows travel with the existing opacity
          // reveal: no animated blur, additional canvas or WebGL render pass.
          color: '#fff5ce',
          pointerEvents: 'none',
        }}
      >
        <span lang="or" style={{
          display: 'block',
          fontFamily: 'var(--font-odia)',
          fontSize: 'clamp(1.25rem, min(3.1vw, 4.1dvh), 2.2rem)',
          fontWeight: 400,
          lineHeight: 1.5,
          color: '#fff9dc',
          textShadow: '0 0 2px #fffce8, 0 0 5px #fff1aa, 0 0 12px #ffc43d, 0 0 26px rgba(255, 153, 16, 0.88), 0 0 48px rgba(255, 103, 22, 0.52), 0 0 68px rgba(185, 76, 255, 0.30)',
        }}>ଶ୍ରୀ ଗଣେଶାୟ ନମଃ</span>
        <span lang="en" style={{
          display: 'block',
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(0.8rem, min(1.4vw, 2.2dvh), 1.2rem)',
          fontWeight: 500,
          lineHeight: 1.4,
          letterSpacing: '0.16em',
          color: '#ffe7b0',
          textShadow: '0 0 2px #fff3d0, 0 0 6px #ffd36e, 0 0 15px rgba(255, 162, 44, 0.95), 0 0 30px rgba(255, 105, 59, 0.55), 0 0 45px rgba(193, 94, 255, 0.32)',
          marginTop: '0.25em',
        }}>Sri Ganeshaya Namah</span>
      </footer>
    </div>
  )
}
