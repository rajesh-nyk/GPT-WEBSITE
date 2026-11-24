import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  MathUtils,
  MeshBasicMaterial,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  type Mesh,
} from 'three'
import { ganeshaFx } from '../ganesha/fx'
import { pointer } from '../../lib/pointer'
import { glowCenters } from './screenShapes'
import { useRestViewport } from '../../lib/restViewport'

/**
 * PUSHPA VRISHTI — the shower of flowers that closes the blessing.
 *
 * Marigold (frilly, saffron→yellow) and rose (rounded, deep crimson) petals fall between
 * the camera and Ganesha. The fall is driven by scroll (ganeshaFx.shower 0 → 1), so it's
 * paced by the journey's velocity governor and reverses when scrolling back up; only the
 * tumble and sway use time.
 *
 * Coverage curve: petals start at staggered heights above the frame, sparse at the
 * leading edge, so the shower begins with a few petals and thickens —
 *   shower 0.00–0.25  the first petals, then more and more
 *   shower 0.25–0.75  the screen is full of flowers (Ganesha is removed under this cover)
 *   shower 0.75–1.00  the last petals fall away, revealing the empty stage
 * Each petal's height is scaled by its depth so the curtain spans the screen at any z.
 *
 * Veil: at the peak, a deep crimson-black veil fades in BEHIND the petals (in front of
 * Ganesha and the wheel), so the gaps between petals read as depth rather than as a
 * glimpse of the figure being removed. It lifts again as the petals thin out.
 *
 * Performance: ONE draw call for the petals (+1 full-screen quad for the veil); opaque petals with alpha-test + depth write (no sorting,
 * early-z rejects hidden petals), all motion in the vertex shader. Fewer, larger petals
 * on lower tiers keep the same coverage.
 */
const CAMERA_Z = 6
const SPAN = 3.2 // curtain length in screen heights (full cover while it passes)
const VEIL_Z = 1.6 // between Ganesha's front (≈0.7) and the nearest petals (1.9)

const vertex = /* glsl */ `
  attribute vec3 aStart;   // x (screen-plane units), offset above the frame (screen heights), z
  attribute vec4 aRand;    // x: phase, y: tumble speed, z: size, w: kind (0 marigold, 1 rose)
  attribute float aTint;
  uniform float uFall;     // shower progress × total fall (screen heights)
  uniform float uTime;
  uniform float uVH;       // viewport height at z = 0 (world)
  uniform float uSizeScale;
  uniform vec2 uHalfView;  // half the visible size at z = 0 (world)
  uniform vec2 uPointer;   // ndc, eased
  uniform float uPointerOn;
  uniform vec2 uHalo;      // ndc of the halo light behind the shower
  uniform float uHaloOn;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying float vKind;
  varying float vTint;
  varying float vHalo;
  varying float vNear;

  mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }
  mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }
  mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0., -s, c, 0., 0., 0., 1.); }

  void main() {
    vUv = uv;
    vKind = aRand.w;
    vTint = aTint;
    float k = (${CAMERA_Z.toFixed(1)} - aStart.z) / ${CAMERA_Z.toFixed(1)}; // curtain stays screen-sized at any depth
    // Each petal falls at its own pace (up to 18% faster), so both edges of the curtain
    // fray and drift apart instead of travelling as straight lines.
    float pace = 1.0 + 0.18 * fract(aTint * 7.31);
    float rel = aStart.y - uFall * pace;       // 0 = top edge of the frame, -1 = bottom
    float y = (0.5 + rel) * uVH;
    float sway = sin(uTime * 0.6 + aRand.x * 6.283) * 0.12 + sin(uTime * 1.3 + aRand.x * 17.0) * 0.03;
    // Work in screen space (ndc): at any depth, x·k projects to the same spot.
    vec2 ndc = vec2((aStart.x + sway) / uHalfView.x, y / uHalfView.y);
    // Your hand stirs the shower: petals near the cursor / finger swirl and spin.
    float aspect = uHalfView.x / uHalfView.y;
    vec2 dv = (ndc - uPointer) * vec2(aspect, 1.0);
    float pr = length(dv);
    float push = exp(-pr * pr / 0.03) * uPointerOn;
    // A gentle swirl around the hand, not a hole: petals are nudged sideways and spun.
    vec2 swirl = vec2(-dv.y, dv.x) / max(pr, 1e-3);
    ndc += (dv / max(pr, 1e-3) * 0.025 + swirl * 0.035) * push / vec2(aspect, 1.0);
    vec3 center = vec3(ndc * uHalfView * k, aStart.z);
    // Light from the halo behind falls on petals in front of it; the nearest petals are
    // out of focus and darker, as in a real lens.
    vec2 hd = (ndc - uHalo) * vec2(aspect, 1.0);
    vHalo = exp(-dot(hd, hd) * 1.8) * uHaloOn;
    vNear = smoothstep(3.7, 4.2, aStart.z);

    // Cupped petal: the flat card is bent across its width and curls at the tip, with a
    // matching analytic normal so light rolls across it.
    vec3 pos = position;
    float curl = aRand.w > 0.5 ? 0.34 : 0.22;
    float tipCurl = 0.18;
    float ty = pos.y / 1.3 + 0.5;               // 0 base .. 1 tip
    // Ruffle: a soft wave along the outer edge, as real petals have (and chips don't).
    float rf = sin(pos.x * 13.0 + aRand.x * 20.0) * 0.045 * ty * ty;
    pos.z = curl * pos.x * pos.x * 2.2 - tipCurl * ty * ty + rf;
    vec3 n = normalize(vec3(-curl * 4.4 * pos.x - cos(pos.x * 13.0 + aRand.x * 20.0) * 0.58 * ty * ty, tipCurl * 2.0 * ty / 1.3, 1.0));

    float s = uTime * aRand.y + aRand.x * 10.0 + push * 4.0;
    mat3 R = rotY(s * 0.9) * rotX(s * 1.1) * rotZ(s * 0.4);
    vec3 local = R * (pos * aRand.z * uSizeScale);
    vNormal = normalize(normalMatrix * (R * n));

    gl_Position = projectionMatrix * modelViewMatrix * vec4(center + local, 1.0);
  }
`

const fragment = /* glsl */ `
  uniform vec3 uMarigoldDeep;
  uniform vec3 uMarigold;
  uniform vec3 uMarigoldTip;
  uniform vec3 uRoseDeep;
  uniform vec3 uRose;
  uniform vec3 uRoseTip;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying float vKind;
  varying float vTint;
  varying float vHalo;
  varying float vNear;

  void main() {
    vec2 p = vUv * 2.0 - 1.0;            // -1..1, base at y = -1
    float t = p.y * 0.5 + 0.5;           // 0 base .. 1 tip
    float d;
    vec3 col;
    vec3 glowCol;
    if (vKind < 0.5) {
      // Marigold (genda) ray petal: a fan from a narrow claw, its top edge scalloped
      // into soft lobes; deep saffron, burning to rust at the base, and only the faintest
      // veins (stripes are what made it read as a crisp, not a flower).
      float rx = 0.16 + 0.66 * pow(t, 0.7);
      float lobes = 0.8 + 0.1 * abs(sin(p.x * 7.0 + vTint * 3.0)) + 0.025 * sin(p.x * 31.0);
      d = (p.x / rx) * (p.x / rx) + pow(max(p.y, 0.0) / lobes, 2.0) + pow(min(p.y, 0.0), 2.0);
      col = mix(uMarigoldDeep, mix(uMarigold, uMarigoldTip, vTint * 0.7), smoothstep(0.0, 0.55, t));
      col *= 0.97 + 0.03 * sin(p.x * 38.0);
      glowCol = uMarigoldTip;
    } else {
      // Rose: rounded, gently heart-notched; velvety — light in the centre, darker at
      // the rim and the base.
      float rx = 0.6 + 0.32 * sqrt(t);
      float notch = 0.07 * (1.0 - smoothstep(0.0, 0.3, abs(p.x)));
      d = (p.x / rx) * (p.x / rx) + pow(max(p.y + notch, 0.0) / 0.92, 2.0) + pow(min(p.y, 0.0) / 0.88, 2.0);
      col = mix(uRoseDeep, mix(uRose, uRoseTip, vTint * 0.5), smoothstep(0.0, 0.6, t));
      col *= 1.0 - 0.3 * smoothstep(0.6, 1.0, d);   // darker rim
      glowCol = uRoseTip;
    }
    if (d > 1.0) discard;

    // Light: warm key from above-front, plus backlit translucency (real petals glow
    // when light comes through them).
    vec3 n = normalize(vNormal);
    if (!gl_FrontFacing) n = -n;
    vec3 L = normalize(vec3(0.25, 0.65, 0.7));
    float ndl = dot(n, L);
    float diff = max((ndl + 0.45) / 1.45, 0.0);      // wrapped: soft, thin-petal light
    float back = max(-ndl, 0.0);
    col = col * (0.38 + 0.62 * diff) + glowCol * back * 0.35;
    // Velvet: petals brighten at grazing angles (a sheen, never a hard specular).
    float graze = pow(1.0 - abs(n.z), 2.0);
    col += glowCol * graze * (vKind > 0.5 ? 0.22 : 0.12);
    // Halo light: warm, strongest through the petal (translucency) and on its rim.
    // (Multiplied into the petal's own colour, so it glows richer, never washes out.)
    col *= 1.0 + vHalo * (back * 0.9 + graze * 0.5 + 0.12) * vec3(1.0, 0.8, 0.6);
    // Foreground petals: out of focus — darker, a touch less saturated, softer rim.
    col = mix(col, vec3(dot(col, vec3(0.3, 0.5, 0.2))), vNear * 0.08) * (1.0 - 0.22 * vNear);
    col *= 1.0 - (0.12 + 0.25 * vNear) * smoothstep(0.8 - 0.25 * vNear, 1.0, d);   // soft edge falloff
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function PushpaVrishti({ count, sizeScale }: { count: number; sizeScale: number }) {
  const viewport = useRestViewport()
  const mesh = useRef<Mesh>(null)
  const veil = useRef<Mesh>(null)
  const veilMaterial = useMemo(
    () => new MeshBasicMaterial({ color: '#1b0407', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    [],
  )
  const time = useRef(0)
  const halfW = viewport.width * 0.5 * 1.15

  const geometry = useMemo(() => {
    const base = new PlaneGeometry(1, 1.3, 4, 6) // subdivided so it can cup and curl
    const g = new InstancedBufferGeometry()
    g.index = base.index
    g.setAttribute('position', base.getAttribute('position'))
    g.setAttribute('uv', base.getAttribute('uv'))
    const start = new Float32Array(count * 3)
    const rand = new Float32Array(count * 4)
    const tint = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      start[i * 3] = (Math.random() * 2 - 1) * halfW
      // Trapezoid density along the curtain: sparse at the leading edge, thickening into
      // a full body, then thinning again — so the shower ends with stragglers, not a line.
      start[i * 3 + 1] = SPAN * (Math.random() * 0.7 + Math.random() * 0.3) + 0.05
      // In front of Ganesha, weighted to mid-depth (dense cover, no giant blobs at the lens).
      start[i * 3 + 2] = 1.9 + 2.3 * Math.random() ** 1.15
      rand[i * 4] = Math.random()
      rand[i * 4 + 1] = 0.4 + Math.random() * 0.9
      rand[i * 4 + 2] = 0.06 + Math.random() * 0.055
      rand[i * 4 + 3] = Math.random() < 0.4 ? 1 : 0 // 2/5 rose, the rest marigold
      tint[i] = Math.random()
    }
    g.setAttribute('aStart', new InstancedBufferAttribute(start, 3))
    g.setAttribute('aRand', new InstancedBufferAttribute(rand, 4))
    g.setAttribute('aTint', new InstancedBufferAttribute(tint, 1))
    g.instanceCount = count
    return g
  }, [count, halfW])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        side: DoubleSide,
        uniforms: {
          uFall: { value: 0 },
          uTime: { value: 0 },
          uVH: { value: 1 },
          uSizeScale: { value: 1 },
          uHalfView: { value: new Vector2(1, 1) },
          uPointer: { value: new Vector2(0, -3) },
          uPointerOn: { value: 0 },
          uHalo: { value: new Vector2(0, 0.2) },
          uHaloOn: { value: 0 },
          uMarigoldDeep: { value: new Color('#8f2a04') },
          uMarigold: { value: new Color('#ee6a02') },
          uMarigoldTip: { value: new Color('#ff9412') },
          uRoseDeep: { value: new Color('#4a0510') },
          uRose: { value: new Color('#9c0f26') },
          uRoseTip: { value: new Color('#c7243d') },
        },
      }),
    [],
  )
  material.uniforms.uVH.value = viewport.height
  material.uniforms.uHalfView.value.set(viewport.width / 2, viewport.height / 2)
  // Portrait screens are narrow: the same petals would look oversized there. Smaller
  // petals over the narrower field keep both the scale and the cover.
  material.uniforms.uSizeScale.value = sizeScale * MathUtils.clamp(viewport.aspect / 1.6, 0.55, 1)

  useFrame((_, dt) => {
    const q = ganeshaFx.shower
    const m = mesh.current
    const v = veil.current
    if (!m || !v) return
    // Veil: up as the petals thicken, fully down only well after Ganesha is gone.
    const cover = MathUtils.smoothstep(q, 0.2, 0.36) * (1 - MathUtils.smoothstep(q, 0.55, 0.72))
    veilMaterial.opacity = cover
    v.visible = cover > 0.002
    m.visible = q > 0 && q < 1
    if (!m.visible) return
    time.current += Math.min(dt, 0.1)
    material.uniforms.uTime.value = time.current
    const e = 1 - Math.exp(-Math.min(dt, 0.1) * 7)
    const u = material.uniforms
    u.uPointer.value.lerp(pointer.ndc, pointer.active ? e : 0)
    u.uPointerOn.value += ((pointer.active ? 1 : 0) - u.uPointerOn.value) * e
    u.uHalo.value.set(glowCenters.ganesha[0] * 2 - 1, glowCenters.ganesha[1] * 2 - 1)
    u.uHaloOn.value = 0.35 + 0.65 * ganeshaFx.glow * (1 - ganeshaFx.leave)
    material.uniforms.uFall.value = q * (SPAN + 1.15)
  })

  return (
    <>
      <mesh ref={veil} material={veilMaterial} position={[0, 0, VEIL_Z]} renderOrder={9} frustumCulled={false}>
        <planeGeometry args={[40, 40]} />
      </mesh>
      <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} renderOrder={10} />
    </>
  )
}
