import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BackSide, BoxGeometry, MathUtils, Color, CustomBlending, Data3DTexture, HalfFloatType, LinearFilter, Mesh,
  OneFactor, OneMinusSrcAlphaFactor, OrthographicCamera, PlaneGeometry, PointLight, RepeatWrapping,
  RGFormat, Scene, ShaderMaterial, UnsignedByteType, Vector2, Vector3, WebGLRenderTarget,
  type Camera, type Texture, type WebGLRenderer,
} from 'three'
import { useQuality } from '../../lib/quality'
import { useReducedMotion } from '../../lib/useReducedMotion'
import { buildCloudNoise } from './cloudNoise'
import { backCloudArrival, cloudLightIntensity, footerCloudDeparture, growth } from './cloudMath'
import { pageTwoExit } from './pageTwoExit'

/**
 * Page 2 clouds (design: docs/superpowers/specs/2026-11-25-page2-cloud-light-design.md).
 * Volumetric night clouds around Ganesha that LIGHT him: each cloud carries a soft light
 * of its own colour, so the side of him facing a bright cloud shines. Clouds condense out
 * of wisps as page 2 arrives (and thin away on exit, reversing with scroll). A back
 * layer sits behind everything; a front layer drifts over the lotus, thinning to a veil
 * over his face.
 */
// Approved and made the default 25 Nov 2026; ?clouds=0 shows page 2 without them.
export const CLOUDS_ENABLED = typeof window === 'undefined' ||
  new URLSearchParams(window.location.search).get('clouds') !== '0'

// TEST comparison: ?handoff=0 restores the previous transition timing.
const ATMOSPHERIC_HANDOFF = typeof window === 'undefined' ||
  new URLSearchParams(window.location.search).get('handoff') !== '0'

/** Set by the Ganesha figure each frame. */
export const cloudFade = {
  /** Overall page 2 fade (arrival × exit), kept for callers. */
  value: 0,
  /** Page 2 arrival progress 0..1 (drives the build-up). */
  progress: 0,
  /** 1 while on page 2, falling to 0 as it leaves. */
  exit: 1,
}

export type CloudSpec = {
  /** World centre (camera at z = 6 looking down −z). */
  pos: [number, number, number]
  /** Half-size of the cloud's box. */
  half: [number, number, number]
  seed: number
  /** Side-to-side float (speed) and vertical bob (world units). */
  drift: number
  bob: number
  /** How far it floats side to side (world units). */
  sway?: number
  /**
   * Front clouds: drift one way across a band this wide (±, world units), fading at
   * its ends; each pass is a new cloud (new shape, slightly different height).
   */
  pass?: number
}

// Laptop, behind him. Nothing over the mantra (upper left).
const BACK_LANDSCAPE: CloudSpec[] = [
  { pos: [1.6, -0.75, -4.6], half: [4.0, 1.7, 1.7], seed: 1.3, drift: 0.05, bob: 0.12 },
  { pos: [4.4, 1.3, -6.8], half: [2.7, 1.7, 1.5], seed: 4.7, drift: 0.06, bob: 0.14 },
  { pos: [0.9, -2.0, -2.4], half: [3.8, 0.95, 1.3], seed: 7.9, drift: 0.045, bob: 0.08 },
  { pos: [-3.4, -2.0, -3.8], half: [2.5, 0.85, 1.2], seed: 2.2, drift: 0.04, bob: 0.08 },
  { pos: [5.2, 3.1, -10], half: [3.4, 1.2, 1.6], seed: 9.1, drift: 0.07, bob: 0.1 },
  { pos: [-5.5, -1.6, -9], half: [2.6, 0.9, 1.4], seed: 6.4, drift: 0.05, bob: 0.1 },
]

// Phone, behind him: the mantra sits at the bottom.
const BACK_PORTRAIT: CloudSpec[] = [
  { pos: [0.3, -0.35, -3.8], half: [2.4, 1.25, 1.3], seed: 1.3, drift: 0.04, bob: 0.1 },
  { pos: [-1.0, 2.3, -5.8], half: [2.2, 0.95, 1.2], seed: 9.1, drift: 0.05, bob: 0.1 },
  { pos: [0.9, -1.35, -2.6], half: [2.1, 0.75, 1.1], seed: 7.9, drift: 0.04, bob: 0.07 },
  { pos: [1.4, 1.2, -7.5], half: [2.0, 0.8, 1.2], seed: 4.7, drift: 0.05, bob: 0.1 },
]

// Slow devices: fewer clouds (fixed arrays, so the clouds aren't rebuilt each render).
const BACK_LANDSCAPE_LOW = BACK_LANDSCAPE.slice(0, 3)
const BACK_PORTRAIT_LOW = BACK_PORTRAIT.slice(0, 3)

// In front of the lotus: thin clouds drifting across it, below his face.
const FRONT_LANDSCAPE: CloudSpec[] = [
  { pos: [0.4, -0.6, 1.6], half: [1.6, 0.3, 0.7], seed: 5.3, drift: 0.11, bob: 0.06, pass: 3.6 },
  { pos: [-0.6, -1.0, 2.0], half: [1.4, 0.26, 0.6], seed: 8.6, drift: 0.08, bob: 0.05, pass: 3.8 },
]
const FRONT_PORTRAIT: CloudSpec[] = [
  { pos: [0.1, -0.45, 1.6], half: [1.0, 0.24, 0.6], seed: 5.3, drift: 0.07, bob: 0.05, pass: 1.9 },
]

const VERTEX = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`

const FRAGMENT = /* glsl */ `
  precision highp sampler3D;
  varying vec3 vWorld;
  uniform sampler3D uNoise;
  uniform float uTime, uSeed, uFrame, uGrowth, uFaceR, uDensity;
  uniform vec3 uCenter, uHalf, uLight;
  uniform vec2 uFace, uRes;

  float remap(float v, float a, float b, float c, float d) {
    return c + (v - a) / (b - a) * (d - c);
  }
  // Interleaved gradient noise: an even jitter pattern, no visible grain.
  float hash(vec2 p) {
    return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
  }

  // Cumulus shape in the box's own -1..1 space: domed puffs on a flat base.
  float shape(vec3 q) {
    float s = 0.0;
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float h1 = fract(sin(uSeed * 17.1 + fi * 7.31) * 4375.85);
      float h2 = fract(sin(uSeed * 31.7 + fi * 3.17) * 2463.46);
      float h3 = fract(sin(uSeed * 11.3 + fi * 5.71) * 3183.21);
      vec3 c = vec3(mix(-0.62, 0.62, fi / 4.0) + (h1 - 0.5) * 0.25,
                    -0.4 + h2 * 0.7 * (1.0 - abs(fi / 2.0 - 1.0)),
                    (h3 - 0.5) * 0.5);
      float r = mix(0.55, 0.8, h3) * (1.0 - 0.25 * abs(fi / 2.0 - 1.0));
      vec3 d = (q - c) / vec3(r * 1.35, r, r * 1.25);
      s = max(s, 1.0 - dot(d, d));
    }
    // The underside is shaped per point in density() (no flat, level base).
    // Fade before every side of the box, the top included, so nothing is sliced flat.
    float edge = (1.0 - smoothstep(0.75, 1.0, max(abs(q.x), abs(q.z)))) * (1.0 - smoothstep(0.7, 0.98, q.y));
    return clamp(s, 0.0, 1.0) * edge;
  }

  // A soft, ragged underside: its height wanders across the cloud and it thins into
  // wisps gradually, so no straight line ever shows under a cloud.
  float underside(vec3 p, vec3 q) {
    float wob = texture(uNoise, p * 0.17 + vec3(uSeed * 0.53, 0.0, uSeed * 0.29)).r - 0.5;
    float fine = texture(uNoise, p * 0.55 + vec3(0.0, uTime * 0.01, uSeed)).g - 0.5;
    return smoothstep(-1.0, -0.2, q.y + wob * 0.75 + fine * 0.25);
  }

  float density(vec3 p) {
    vec3 q = (p - uCenter) / uHalf;
    float sh = shape(q);
    if (sh <= 0.0) return 0.0;
    sh *= underside(p, q);
    if (sh <= 0.0) return 0.0;
    float t = uTime;
    // Slow wind plus a vertical churn so the billows roll.
    vec3 uvw = p * 0.3 + vec3(uSeed * 0.37 + t * 0.022, t * 0.016, uSeed * 0.21 + t * 0.006);
    float base = texture(uNoise, uvw).r;
    float d = remap(base, (1.0 - sh) * 0.55, 1.0, 0.0, 1.0) * sh;
    if (d <= 0.0) return 0.0;
    // Detail: billowy on top, torn at the base. Cells stay several pixels wide (finer
    // reads as sand), plus one fine layer for texture up close.
    vec3 duvw = p * 0.62 + vec3(-t * 0.035, t * 0.03, t * 0.012);
    float detail = 0.62 * texture(uNoise, duvw).g + 0.25 * texture(uNoise, duvw * 2.1 + 0.37).g
                 + 0.13 * texture(uNoise, duvw * 4.3 + 0.71).g;
    float hf = clamp(q.y * 0.5 + 0.5, 0.0, 1.0);
    float erode = mix(detail, 1.0 - detail, clamp(hf * 3.0, 0.0, 1.0));
    d = remap(d, erode * 0.45, 1.0, 0.0, 1.0);
    // Build-up: while it condenses only the densest cores show, then it fills outward.
    d = remap(d, (1.0 - uGrowth) * 0.85, 1.0, 0.0, 1.0);
    return clamp(d, 0.0, 1.0) * 6.0 * uDensity;
  }

  // For light tracing: the cloud's broad shape only (one noise read). Shadows are soft,
  // so the fine detail adds nothing there but cost.
  float densityLight(vec3 p) {
    vec3 q = (p - uCenter) / uHalf;
    float sh = shape(q);
    if (sh <= 0.0) return 0.0;
    sh *= underside(p, q);
    if (sh <= 0.0) return 0.0;
    float t = uTime;
    vec3 uvw = p * 0.3 + vec3(uSeed * 0.37 + t * 0.022, t * 0.016, uSeed * 0.21 + t * 0.006);
    float d = remap(texture(uNoise, uvw).r, (1.0 - sh) * 0.55, 1.0, 0.0, 1.0) * sh;
    d = remap(d, (1.0 - uGrowth) * 0.85, 1.0, 0.0, 1.0);
    return clamp(d, 0.0, 1.0) * 3.5 * uDensity;
  }

  float hg(float c, float g) {
    float g2 = g * g;
    return (1.0 - g2) / (4.0 * 3.14159 * pow(1.0 + g2 - 2.0 * g * c, 1.5));
  }

  vec2 boxHit(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax) {
    vec3 inv = 1.0 / rd;
    vec3 t0 = (bmin - ro) * inv, t1 = (bmax - ro) * inv;
    vec3 tmin = min(t0, t1), tmax = max(t0, t1);
    return vec2(max(max(tmin.x, tmin.y), tmin.z), min(min(tmax.x, tmax.y), tmax.z));
  }

  void main() {
    if (uGrowth <= 0.001) discard;
    vec3 ro = cameraPosition;
    vec3 rd = normalize(vWorld - ro);
    vec2 hit = boxHit(ro, rd, uCenter - uHalf, uCenter + uHalf);
    if (hit.y <= max(hit.x, 0.0)) discard;
    // Front clouds thin to a veil over his face (screen space, aspect-correct).
    float veil = 1.0;
    if (uFaceR > 0.0) {
      vec2 sp = gl_FragCoord.xy / uRes;
      vec2 dv = (sp - uFace) * vec2(uRes.x / uRes.y, 1.0);
      veil = 0.15 + 0.85 * smoothstep(0.45, 1.0, length(dv) / uFaceR);
    }
    float t0 = max(hit.x, 0.0);
    float stepLen = (hit.y - t0) / float(STEPS);
    // A different jitter each frame; the frame blend averages them into a clean image.
    float t = t0 + stepLen * hash(gl_FragCoord.xy + uFrame * vec2(5.588238, 3.1173));

    vec3 gold = vec3(1.0, 0.70, 0.38) * 1.6;
    vec3 moonDir = normalize(vec3(-0.35, 1.0, 0.4));
    vec3 moon = vec3(0.62, 0.56, 0.86) * 0.45;
    vec3 skyTop = vec3(0.26, 0.20, 0.40);
    vec3 skyBottom = vec3(0.09, 0.065, 0.15);

    vec3 col = vec3(0.0);
    float trans = 1.0;
    const float SIGMA = 3.0;
    for (int i = 0; i < STEPS; i++) {
      vec3 p = ro + rd * t;
      float d = density(p) * veil;
      if (d > 0.002) {
        // Light from his halo, traced through the cloud toward it.
        vec3 toL = uLight - p;
        float dl = length(toL);
        vec3 L = toL / dl;
        float shadow = 0.0;
        float ls = 0.2;
        for (int j = 1; j <= LIGHT_STEPS; j++) shadow += densityLight(p + L * ls * float(j));
        float lightT = exp(-shadow * ls * SIGMA * 1.1);
        // A softer trace toward the sky above for starlit tops.
        float up = densityLight(p + moonDir * 0.25);
        float moonT = exp(-up * 0.25 * SIGMA);
        float powder = 1.0 - exp(-d * 2.0);
        float c = dot(rd, L);
        float phase = 0.5 * hg(c, 0.55) + 0.5 * hg(c, -0.2) + 0.03;
        float fall = 1.0 / (1.0 + dl * dl * 0.12);
        vec3 q = (p - uCenter) / uHalf;
        vec3 amb = mix(skyBottom, skyTop, clamp(q.y * 0.5 + 0.55, 0.0, 1.0));
        vec3 S = gold * lightT * phase * fall * powder * 10.0
               + moon * moonT * powder
               + amb * (0.45 + 0.45 * moonT);
        float a = exp(-d * SIGMA * stepLen);
        col += trans * S * (1.0 - a);
        trans *= a;
        if (trans < 0.01) break;
      }
      t += stepLen;
    }
    float alpha = 1.0 - trans;
    if (alpha < 0.002) discard;
    // Premultiplied colour (the integration already weighted it by coverage).
    gl_FragColor = vec4(col, alpha);
  }
`

const premultiplied = {
  transparent: true,
  depthTest: false,
  depthWrite: false,
  blending: CustomBlending,
  blendSrc: OneFactor,
  blendDst: OneMinusSrcAlphaFactor,
  blendSrcAlpha: OneFactor,
  blendDstAlpha: OneMinusSrcAlphaFactor,
} as const

const SCREEN_VERTEX = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }'

export function makeNoiseTexture() {
  const size = 64
  const tex = new Data3DTexture(buildCloudNoise(size), size, size, size)
  tex.format = RGFormat
  tex.type = UnsignedByteType
  tex.minFilter = tex.magFilter = LinearFilter
  tex.wrapS = tex.wrapT = tex.wrapR = RepeatWrapping
  tex.unpackAlignment = 1
  tex.needsUpdate = true
  return tex
}

/** Blends each fresh frame into a short history (ping-pong). */
function makeBlend() {
  const material = new ShaderMaterial({
    vertexShader: SCREEN_VERTEX,
    fragmentShader: `varying vec2 vUv; uniform sampler2D uCur, uPrev; uniform float uMix;
      void main(){ gl_FragColor = mix(texture2D(uPrev, vUv), texture2D(uCur, vUv), uMix); }`,
    uniforms: { uCur: { value: null }, uPrev: { value: null }, uMix: { value: 1 } },
    depthTest: false,
    depthWrite: false,
  })
  const quad = new Mesh(new PlaneGeometry(2, 2), material)
  quad.frustumCulled = false
  const scene = new Scene()
  scene.add(quad)
  return { scene, material, quad, camera: new OrthographicCamera() }
}

const clearColor = new Color()
const WARM = new Color('#ffc27a')
const COOL = new Color('#b9a6ff')
/** Converts the shared light curve into the scene's light units. */
const LIGHT_SCALE = 0.9
/** Each fresh frame's share of the blended image: high enough that detail stays crisp. */
const BLEND = 0.45

type LayerProps = {
  specs: CloudSpec[]
  front: boolean
  noise: Texture
  steps: number
  lightSteps: number
  resScale: number
  light: Vector2
  face: Vector3
  /** Ganesha's centre: clouds light him. Omitted where there is no figure to light. */
  model?: Vector3
  /** Page 1 footer clouds: driven by scroll (0 at the top, 1 one screen down) instead of page 2. */
  footer?: {
    scroll: () => number
    /** 0..1 arrival: page 1's clouds condense in once the sun has risen to the middle. */
    intro: () => number
  }
}

export function CloudLayer({ specs, front, noise, steps, lightSteps, resScale, light, face, model, footer }: LayerProps) {
  const reducedMotion = useReducedMotion()
  const gl = useThree((s) => s.gl) as WebGLRenderer
  const invalidate = useThree((s) => s.invalidate)
  const { width, height } = useThree((s) => s.size)
  const time = useRef(0)
  const history = useRef({ index: 0, frames: 0 })
  const lightWorld = useMemo(() => new Vector3(), [])
  const faceNdc = useMemo(() => new Vector3(), [])
  const toModel = useMemo(() => new Vector3(), [])
  const lowPoint = useMemo(() => new Vector3(), [])
  const cloudScene = useMemo(() => new Scene(), [])
  const blend = useMemo(() => makeBlend(), [])
  const targets = useMemo(() => [0, 1, 2].map(() =>
    new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false })), [])
  const lights = useRef<(PointLight | null)[]>([])

  const meshes = useMemo(() => specs.map((spec) => {
    const mesh = new Mesh(new BoxGeometry(2, 2, 2), new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      defines: { STEPS: steps, LIGHT_STEPS: lightSteps },
      uniforms: {
        uNoise: { value: noise },
        uTime: { value: 0 },
        uSeed: { value: spec.seed },
        uFrame: { value: 0 },
        uGrowth: { value: 0 },
        uCenter: { value: new Vector3(...spec.pos) },
        uHalf: { value: new Vector3(...spec.half) },
        uLight: { value: new Vector3() },
        uFace: { value: new Vector2() },
        uFaceR: { value: front ? 0.11 : 0 },
        // Front clouds are thin drifts: the lotus shows through them.
        uDensity: { value: front ? 0.22 : 1 },
        uRes: { value: new Vector2(1, 1) },
      },
      side: BackSide,
      ...premultiplied,
    }))
    mesh.scale.set(...spec.half)
    mesh.frustumCulled = false
    return mesh
  }), [specs, steps, lightSteps, noise, front])

  useEffect(() => {
    cloudScene.add(...meshes)
    return () => {
      cloudScene.remove(...meshes)
      for (const m of meshes) {
        m.geometry.dispose()
        ;(m.material as ShaderMaterial).dispose()
      }
    }
  }, [cloudScene, meshes])

  useEffect(() => {
    const w = Math.max(1, Math.round(width * resScale)), h = Math.max(1, Math.round(height * resScale))
    for (const t of targets) t.setSize(w, h)
    for (const m of meshes) (m.material as ShaderMaterial).uniforms.uRes.value.set(w, h)
    history.current.frames = 0
  }, [targets, meshes, width, height, resScale])

  const composite = useMemo(() => new ShaderMaterial({
    vertexShader: SCREEN_VERTEX,
    // Page 2's clouds melt away over the bottom of their canvas: the canvas ends with the
    // page, and a cloud cut by that edge showed as a straight line (his feedback).
    fragmentShader: `varying vec2 vUv; uniform sampler2D uImage; uniform float uFade, uBottomFade;
      void main(){
        float bottom = mix(1.0, smoothstep(0.0, 0.16, vUv.y), uBottomFade);
        gl_FragColor = texture2D(uImage, vUv) * uFade * bottom;
      }`,
    uniforms: { uImage: { value: null as Texture | null }, uFade: { value: 0 }, uBottomFade: { value: footer ? 0 : 1 } },
    ...premultiplied,
    // Back: drawn in the opaque pass with the lowest order, so it lies behind him (a
    // transparent object would draw after him and cover the lotus). Front: a normal
    // transparent pass drawn last, over the lotus.
    transparent: front,
  }), [front, footer])

  useEffect(() => () => {
    for (const t of targets) t.dispose()
    blend.material.dispose()
    blend.quad.geometry.dispose()
    composite.dispose()
  }, [targets, blend, composite])

  useFrame(({ camera }, delta) => {
    const scroll = footer ? footer.scroll() : 0
    const exit = footer ? 1 : cloudFade.exit
    composite.uniforms.uFade.value = exit
    const progress = footer ? 1 : cloudFade.progress
    // Footer wisps linger through the shared-sky handoff; no extra layers or rising motion.
    const intro = footer ? footer.intro() : 1
    const footerLast = footer
      ? Math.min(intro > 0 ? 1 : 0, footerCloudDeparture(scroll, specs.length - 1, ATMOSPHERIC_HANDOFF && !reducedMotion))
      : 1
    const active = exit > 0 && progress > 0 && footerLast > 0
    if (!active) {
      for (const l of lights.current) if (l) l.intensity = 0
      return
    }
    if (!reducedMotion) time.current += Math.min(delta, 0.05)
    const tm = time.current
    // His radiance shines from behind him, among the clouds.
    lightWorld.set(light.x, light.y, -3.7)
    faceNdc.copy(face).project(camera)
    const h = history.current
    // Page 3's rising edge (viewport px) and where this canvas sits on screen.
    const edgeY = footer ? Infinity : pageTwoExit.visibleBottom
    const rect = edgeY < Infinity ? gl.domElement.getBoundingClientRect() : null
    specs.forEach((spec, i) => {
      const mesh = meshes[i]
      const u = (mesh.material as ShaderMaterial).uniforms
      // Front clouds condense after the back ones.
      let grown = footer
        // Condense in after the sunrise (one after another), morph out with the scroll.
        ? growth(intro, i, specs.length) * footerCloudDeparture(scroll, i, ATMOSPHERIC_HANDOFF && !reducedMotion)
        : growth(front ? progress : backCloudArrival(progress, ATMOSPHERIC_HANDOFF && !reducedMotion), front ? i + specs.length : i, front ? specs.length * 2 : specs.length) * exit
      let x: number
      let y = spec.pos[1] + Math.sin(tm * 0.35 + spec.seed * 2.0) * spec.bob
      let seed = spec.seed
      if (spec.pass) {
        // One way across, then a new cloud from the other side.
        const span = spec.pass * 2
        const travel = tm * spec.drift + (spec.pos[0] + spec.pass)
        const pass = Math.floor(travel / span)
        x = -spec.pass + (travel - pass * span)
        seed = spec.seed + pass * 3.17
        y += (Math.sin(pass * 12.9898 + spec.seed) * 0.5) * 0.25
        grown *= 1 - Math.min(1, Math.max(0, (Math.abs(x) - spec.pass * 0.55) / (spec.pass * 0.45)))
      } else {
        // A gentle, uneven wander rather than an even swing.
        const sway = spec.sway ?? 0.6
        x = spec.pos[0] + Math.sin(tm * spec.drift * 4.0 + spec.seed) * sway * 0.65
          + Math.sin(tm * spec.drift * 2.7 + spec.seed * 3.1) * sway * 0.4
      }
      u.uSeed.value = seed
      u.uCenter.value.set(x, y, spec.pos[2])
      if (rect) {
        // Morph out ahead of page 3's edge so it never cuts a solid cloud. The edge and
        // this page move up together, so the gap between them barely changes: any cloud
        // whose base the edge overlaps (or nearly reaches) must be fully gone by the time
        // the edge has risen a little way into view.
        // Its very lowest wisps (the whole box, plus its bob), not just its body.
        lowPoint.set(x, y - spec.half[1] * 1.05 - spec.bob, spec.pos[2]).project(camera)
        const baseY = rect.top + (1 - lowPoint.y) * 0.5 * rect.height
        const ahead = MathUtils.smoothstep(edgeY - baseY, 0, window.innerHeight * 0.2)
        const entering = MathUtils.smoothstep(window.innerHeight - edgeY, 0, window.innerHeight * 0.1)
        grown *= MathUtils.lerp(1, ahead, entering)
      }
      mesh.position.copy(u.uCenter.value)
      u.uTime.value = tm
      u.uGrowth.value = grown
      u.uFrame.value = h.frames % 64
      u.uLight.value.copy(lightWorld)
      u.uFace.value.set(faceNdc.x * 0.5 + 0.5, faceNdc.y * 0.5 + 0.5)
      // The cloud's own light, on its face nearest him.
      const l = lights.current[i]
      if (l && model) {
        toModel.copy(model).sub(u.uCenter.value)
        l.position.copy(u.uCenter.value).addScaledVector(toModel, 0.7)
        const dist = l.position.distanceTo(model)
        l.intensity = LIGHT_SCALE * cloudLightIntensity(grown, exit, dist) * (front ? 0.06 : 1)
        l.color.copy(COOL).lerp(WARM, Math.min(1, Math.max(0, (y + 1.5) / 3)))
      }
    })
    const [fresh, histA, histB] = targets
    const read = h.index === 0 ? histA : histB
    const write = h.index === 0 ? histB : histA
    const prev = gl.getRenderTarget()
    gl.getClearColor(clearColor)
    const prevAlpha = gl.getClearAlpha()
    gl.setClearColor(0x000000, 0)
    gl.setRenderTarget(fresh)
    gl.clear(true, false, false)
    gl.render(cloudScene, camera as Camera)
    blend.material.uniforms.uCur.value = fresh.texture
    blend.material.uniforms.uPrev.value = read.texture
    blend.material.uniforms.uMix.value = h.frames === 0 ? 1 : BLEND
    gl.setRenderTarget(write)
    gl.render(blend.scene, blend.camera)
    gl.setRenderTarget(prev)
    gl.setClearColor(clearColor, prevAlpha)
    composite.uniforms.uImage.value = write.texture
    h.index = 1 - h.index
    h.frames++
    if (!reducedMotion) invalidate()
  })

  return (
    <>
      <mesh renderOrder={front ? 10 : -10} frustumCulled={false} material={composite}>
        <planeGeometry args={[2, 2]} />
      </mesh>
      {model && specs.map((spec, i) => (
        <pointLight
          key={`${spec.seed}-${front}`}
          ref={(l) => { lights.current[i] = l }}
          intensity={0}
          distance={0}
          decay={2}
        />
      ))}
    </>
  )
}

/**
 * The clouds. `light` is his halo (x, y); `face` his face and `model` his centre, in
 * the scene.
 */
export function PageTwoClouds({ light, face, model }: { light: Vector2; face: Vector3; model: Vector3 }) {
  const { tier } = useQuality()
  const { width, height } = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const portrait = width < height
  const steps = tier === 'high' ? 32 : tier === 'low' ? 20 : 26
  const lightSteps = tier === 'low' ? 3 : 5
  // Full detail on capable screens; reduced on slower tiers for speed.
  // One cloud pixel per screen (CSS) pixel at most: 1.5× ran at 5 FPS.
  const resScale = tier === 'high' ? Math.min(dpr, 0.75) : tier === 'low' ? 0.45 : 0.6
    // Phones: small, dense screens — fewer cloud pixels look the same and keep 60 FPS.
    * (portrait ? 0.65 : 1)
  const noise = useMemo(() => makeNoiseTexture(), [])
  useEffect(() => () => noise.dispose(), [noise])
  const back = portrait ? BACK_PORTRAIT : BACK_LANDSCAPE
  const front = portrait ? FRONT_PORTRAIT : FRONT_LANDSCAPE
  const shared = { noise, steps, lightSteps, resScale, light, face, model }
  return (
    <>
      {/* The back clouds are distant and soft: a lower resolution costs no visible detail. */}
      <CloudLayer specs={tier === 'low' ? (portrait ? BACK_PORTRAIT_LOW : BACK_LANDSCAPE_LOW) : back} front={false} {...shared} resScale={resScale * 0.8} />
      <CloudLayer specs={front} front {...shared} />
    </>
  )
}
