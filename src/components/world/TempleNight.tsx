import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  AdditiveBlending,
  BackSide,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  OneMinusSrcAlphaFactor,
  SrcAlphaFactor,
  CatmullRomCurve3,
  CylinderGeometry,
  DoubleSide,
  Fog,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  MathUtils,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  Vector3,
  type DirectionalLight,
  type Group,
  type Mesh,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Model } from '../Model'
import { useQuality } from '../../lib/quality'
import { TEMPLE_MOVE, finaleScroll, templeAway, templeFx } from './templeFx'

/**
 * THE CLOSING SCENE — a Kalinga temple across a moonlit river, sky lanterns rising.
 *
 * After the portrait, the camera turns away from the violet sky and cranes down through
 * the night to the riverbank (templeFx.view, 0 → 1, governed: a fast scroll can't rush
 * it). There: a rekha-deula temple on its ghat (Meshy model, lit by its lamps and the
 * moon), mirrored in slow water with the moon's glitter path; little diyas float by on
 * the current; and once the camera has arrived, hundreds of paper lanterns rise from
 * both banks, drift on the breeze and fade high above. Tap the temple to ring its bell,
 * the moon to send shooting stars, anywhere in the sky to release a lantern of your own.
 *
 * Everything lives in its own local space (water at y = 0), placed far below and ahead
 * of the rest of the world (ORIGIN), so the camera's move is a real journey through 3D.
 */
export const ORIGIN = new Vector3(0, -200, -140)
const TEMPLE_H = 16
const BANK_Y = 0.35
const BANK_EDGE_Z = 3.5
const TEMPLE_Z = -3.5
/** The moon, in local space (far away, upper right — the names take the left). Rises as the
 *  scene settles. */
const MOON_FROM = new Vector3(165, 26, -330)
const MOON_TO = new Vector3(150, 92, -330)
/** Portrait screens are narrow: the moon sits just right of the spire, under the names. */
const MOON_FROM_P = new Vector3(60, 34, -330)
const MOON_TO_P = new Vector3(46, 86, -330)
const MOON_R = 13
const LANTERN_LIFE = 42

/* ------------------------------------------------------------------------------------ */
/* Camera                                                                                */
/* ------------------------------------------------------------------------------------ */

const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)
const lookQuat = (from: Vector3, to: Vector3, out: Quaternion) => {
  const m = new Matrix4().lookAt(from, to, new Vector3(0, 1, 0))
  return out.setFromRotationMatrix(m)
}
const P0 = new Vector3(0, 0, 6)
const Q0 = lookQuat(P0, new Vector3(0, 0, 0), new Quaternion())
const tmpV = new Vector3()
const tmpT = new Vector3()
const qMid = new Quaternion()
const qJoin = new Quaternion()
const qRoll = new Quaternion()
const pCtrl = new Vector3()
const Z_AXIS = new Vector3(0, 0, 1)

/**
 * Key shots of the tour around the temple (local space; x is relative to the temple's x).
 * pos, target, fov. The first is the establishing shot the sky-sweep lands on, the last is
 * the final frame the names share.
 */
type Key = { p: [number, number, number]; t: [number, number, number]; fov: number }
const TOUR: Key[] = [
  { p: [0, 4.6, 60], t: [0, 7.5, TEMPLE_Z], fov: 40 }, // establishing: across the river
  { p: [-17, 1.7, 24], t: [0, 9, TEMPLE_Z], fov: 42 }, // gliding low over the water, left
  { p: [-10.5, 1.15, 9.5], t: [0, 12.5, TEMPLE_Z], fov: 46 }, // close and low: up the spire
  { p: [11.5, 2, 10.5], t: [0, 9.5, TEMPLE_Z], fov: 44 }, // round the front, to the right
  { p: [7, 3.2, 30], t: [-0.5, 8.5, TEMPLE_Z], fov: 40 }, // easing back out
]
const END_L: Key = { p: [-5.7, 2.6, 40], t: [-1.6, 8, TEMPLE_Z], fov: 38 } // relative to tx = 3.2
const END_P: Key = { p: [0, 3.4, 54], t: [0, 12.5, TEMPLE_Z], fov: 44 }
const tours: Record<string, { pos: CatmullRomCurve3; tgt: CatmullRomCurve3; fov: number[] }> = {}
function tour(portrait: boolean) {
  const key = portrait ? 'p' : 'l'
  if (tours[key]) return tours[key]
  const tx = portrait ? 0 : 3.2
  const keys = [...TOUR, portrait ? END_P : END_L]
  const v = (a: [number, number, number]) => new Vector3(a[0] + tx, a[1], a[2]).add(ORIGIN)
  tours[key] = {
    pos: new CatmullRomCurve3(keys.map((k) => v(k.p)), false, 'centripetal'),
    tgt: new CatmullRomCurve3(keys.map((k) => v(k.t)), false, 'centripetal'),
    fov: keys.map((k) => k.fov),
  }
  return tours[key]
}

/**
 * The camera's journey (CameraRig applies it while templeFx.view > 0), one smooth curve:
 *  A  from the portrait's sky the gaze lifts into the stars, then sweeps down in a long
 *     descending arc to the establishing shot across the river;
 *  B  a cinematic tour of the temple: gliding low over the water, rising close beneath
 *     the spire, round its front, then easing back to the final frame — with a gentle
 *     roll through the turns.
 */
export function templeShot(view: number, portrait: boolean, out: { pos: Vector3; quat: Quaternion; fov: number }) {
  const T = tour(portrait)
  const s = easeInOutCubic(MathUtils.clamp(view, 0, 1))
  const SPLIT = 0.36
  if (s < SPLIT) {
    const a = s / SPLIT
    const e1 = T.pos.getPoint(0)
    const t1 = T.tgt.getPoint(0)
    // descending arc from the resting camera to the establishing shot
    pCtrl.set(26, -40, -40)
    const k = a * a * (3 - 2 * a)
    const w0 = (1 - k) * (1 - k)
    const w1 = 2 * (1 - k) * k
    const w2 = k * k
    out.pos.set(
      w0 * P0.x + w1 * pCtrl.x + w2 * e1.x,
      w0 * P0.y + w1 * pCtrl.y + w2 * e1.y,
      w0 * P0.z + w1 * pCtrl.z + w2 * e1.z,
    )
    // the gaze lifts at once (so nothing below is seen before the turn), then sweeps down
    tmpV.set(0.4, 0.8, -1).normalize().add(out.pos)
    lookQuat(out.pos, tmpV, qMid)
    lookQuat(out.pos, t1, qJoin)
    if (a < 0.28) out.quat.copy(Q0).slerp(qMid, 1 - (1 - a / 0.28) ** 3)
    else out.quat.copy(qMid).slerp(qJoin, easeInOutCubic((a - 0.28) / 0.72))
    out.fov = MathUtils.lerp(35, T.fov[0], k)
    return
  }
  const b = (s - SPLIT) / (1 - SPLIT)
  T.pos.getPoint(b, out.pos)
  T.tgt.getPoint(b, tmpT)
  lookQuat(out.pos, tmpT, out.quat)
  // a gentle roll through the turns
  qRoll.setFromAxisAngle(Z_AXIS, MathUtils.degToRad(4.5) * Math.sin(Math.PI * b) * Math.sin(Math.PI * b * 2))
  out.quat.multiply(qRoll)
  const f = b * (T.fov.length - 1)
  const i = Math.min(T.fov.length - 2, Math.floor(f))
  const u = f - i
  out.fov = MathUtils.lerp(T.fov[i], T.fov[i + 1], u * u * (3 - 2 * u))
}

/* ------------------------------------------------------------------------------------ */
/* Shared GLSL                                                                           */
/* ------------------------------------------------------------------------------------ */

const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  float hash3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.03 + 7.1; a *= 0.5; }
    return v;
  }
`

/* ------------------------------------------------------------------------------------ */
/* Sky dome: night gradient, warm lantern-lit horizon, stars, tree line                  */
/* ------------------------------------------------------------------------------------ */

const skyVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww; // always at the far plane
  }
`
const skyFrag = /* glsl */ `
  uniform float uAlpha;
  uniform float uTime;
  uniform float uWarm;
  uniform vec3 uMoonDir;
  uniform float uDip;
  uniform float uStars;
  varying vec3 vDir;
  ${NOISE}
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y + uDip; // a high camera sees the horizon below eye level
    vec3 zen = vec3(0.016, 0.009, 0.045);
    vec3 mid = vec3(0.05, 0.022, 0.11);
    vec3 hor = vec3(0.15, 0.06, 0.15);
    vec3 col = mix(hor, mid, smoothstep(-0.02, 0.2, h));
    col = mix(col, zen, smoothstep(0.18, 0.75, h));
    // warm glow low over the horizon from the lanterns and lamps
    col += vec3(0.62, 0.26, 0.12) * exp(-max(h, 0.0) * 16.0) * 0.3 * uWarm;
    // faint violet haze bands (continuity with the portrait's nebula)
    float az = atan(d.z, d.x);
    float neb = fbm(vec2(az * 2.2, h * 5.0) + uTime * 0.004);
    col += vec3(0.20, 0.09, 0.34) * smoothstep(0.45, 0.85, neb) * smoothstep(0.05, 0.4, h) * 0.45;
    // a faint milky band arching over
    float band = exp(-pow(dot(d, normalize(vec3(0.35, 0.25, 0.9))) / 0.16, 2.0));
    col += vec3(0.16, 0.10, 0.24) * band * (0.4 + 0.6 * fbm(vec2(az * 5.0, h * 9.0))) * smoothstep(0.02, 0.3, h) * 0.55;
    // moon halo
    float md = max(dot(d, uMoonDir), 0.0);
    col += vec3(0.55, 0.52, 0.75) * (pow(md, 40.0) * 0.35 + pow(md, 8.0) * 0.08);
    // stars: one candidate per cell of a fine grid on the sphere
    vec3 g = d * 260.0;
    vec3 cell = floor(g);
    float r = hash3(cell);
    if (r > 0.978 && h > 0.0) {
      vec3 c = cell + 0.5 + (vec3(hash3(cell + 1.3), hash3(cell + 2.7), hash3(cell + 4.1)) - 0.5) * 0.6;
      float dist = length(g - c);
      float tw = 0.65 + 0.35 * sin(uTime * (1.0 + r * 3.0) + r * 60.0);
      float b = (r - 0.978) / 0.022;
      col += vec3(1.0, 0.95, 0.88) * smoothstep(0.34, 0.0, dist) * (0.45 + 2.2 * b * b) * tw * smoothstep(0.0, 0.12, h) * uStars;
    }
    const vec3 HAZE = vec3(0.115, 0.047, 0.115);
    // tree line along the far bank (a dark, ragged silhouette)
    float tl = 0.006 + 0.016 * fbm(vec2(az * 9.0, 1.7)) + 0.012 * smoothstep(0.62, 0.9, vnoise(vec2(az * 40.0, 3.0)));
    col = mix(col, vec3(0.03, 0.014, 0.045), smoothstep(tl + 0.002, tl - 0.002, h) * step(-0.01, h));
    if (h < 0.0) col = mix(col, HAZE, smoothstep(0.0, -0.02, h));
    // dither
    col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
    gl_FragColor = vec4(col, uAlpha);
  }
`

function SkyDome({ moonDir }: { moonDir: Vector3 }) {
  const mesh = useRef<Mesh>(null)
  const camera = useThree((s) => s.camera)
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: skyVert,
        fragmentShader: skyFrag,
        side: BackSide,
        // Drawn with the opaque objects (right after the site's backdrop, before the
        // temple and moon), but alpha-blended so it can fade in over the backdrop.
        transparent: false,
        blending: CustomBlending,
        blendSrc: SrcAlphaFactor,
        blendDst: OneMinusSrcAlphaFactor,
        depthWrite: false,
        depthTest: false,
        uniforms: {
          uAlpha: { value: 0 },
          uTime: { value: 0 },
          uWarm: { value: 0 },
          uMoonDir: { value: new Vector3(0, 1, 0) },
          uDip: { value: 0 },
          uStars: { value: 0 },
        },
      }),
    [],
  )
  useFrame((_, dt) => {
    const m = mesh.current
    if (!m) return
    m.position.copy(camera.position) // a skybox: always around the camera
    mat.uniforms.uAlpha.value = MathUtils.smoothstep(templeFx.view, 0, 0.05)
    mat.uniforms.uStars.value = MathUtils.smoothstep(templeFx.view, 0.02, 0.25)
    mat.uniforms.uTime.value += Math.min(dt, 0.1)
    mat.uniforms.uWarm.value = MathUtils.clamp(templeFx.release / 12, 0, 1) * 0.7 + 0.3
    mat.uniforms.uMoonDir.value.copy(moonDir)
    const hgt = Math.max(0, camera.position.y - ORIGIN.y - 3)
    mat.uniforms.uDip.value = hgt / Math.hypot(hgt, 450) // the horizon sinks as the camera rises
    m.visible = templeFx.view > 0.001
  })
  return (
    <mesh ref={mesh} material={mat} renderOrder={-900} frustumCulled={false}>
      <sphereGeometry args={[900, 48, 24]} />
    </mesh>
  )
}

/* ------------------------------------------------------------------------------------ */
/* Moon                                                                                  */
/* ------------------------------------------------------------------------------------ */

const moonFrag = /* glsl */ `
  uniform float uPulse;
  uniform float uShow;
  varying vec3 vN;
  ${NOISE}
  void main() {
    vec3 n = normalize(vN);
    float maria = smoothstep(0.5, 0.62, fbm(n.xy * 2.6 + n.z * 1.3 + 4.0));
    float craters = smoothstep(0.62, 0.7, vnoise(n.xy * 14.0 + 9.0)) * 0.25;
    vec3 col = mix(vec3(1.0, 0.97, 0.9), vec3(0.74, 0.71, 0.7), maria * 0.7 + craters);
    float limb = pow(max(n.z, 0.0), 0.35);
    gl_FragColor = vec4(col * (0.95 + 0.7 * uPulse) * mix(0.72, 1.0, limb) * uShow, 1.0);
  }
`
const moonVert = /* glsl */ `
  varying vec3 vN;
  void main() {
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const glowVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // billboard: face the camera
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec2 s = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
    mv.xy += position.xy * s;
    gl_Position = projectionMatrix * mv;
  }
`
const glowFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha;
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float g = exp(-r * r * 5.0) * 0.6 + exp(-r * 9.0) * 0.4;
    g *= smoothstep(1.0, 0.7, r);
    gl_FragColor = vec4(uColor * g * uAlpha, 1.0);
  }
`
const makeGlow = (color: string) =>
  new ShaderMaterial({
    vertexShader: glowVert,
    fragmentShader: glowFrag,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uColor: { value: new Color(color) }, uAlpha: { value: 0 } },
  })

/* ------------------------------------------------------------------------------------ */
/* Water: dark, slow ripples, sky reflection, the moon's glitter path                    */
/* ------------------------------------------------------------------------------------ */

const waterVert = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`
const waterFrag = /* glsl */ `
  uniform vec3 uCam;
  uniform vec3 uMoonDir;
  uniform float uTime;
  uniform float uAlpha;
  uniform float uWarm;
  varying vec3 vWorld;
  varying vec3 vLocal;
  ${NOISE}
  void main() {
    vec3 V = normalize(vWorld - uCam);
    vec2 q = vLocal.xz;
    float t = uTime;
    // long, slow ripples stretched across the current, plus fine chop
    float n1 = fbm(vec2(q.x * 0.08 + t * 0.05, q.y * 0.45 - t * 0.04));
    float n2 = fbm(vec2(q.x * 0.11 - t * 0.03, q.y * 0.6 + t * 0.05) + 5.2);
    float n3 = vnoise(q * 1.6 + vec2(t * 0.4, -t * 0.3));
    vec3 N = normalize(vec3((n1 - 0.5) * 0.3 + (n3 - 0.5) * 0.2, 1.0, (n2 - 0.5) * 0.18 + (n3 - 0.5) * 0.12));
    vec3 R = reflect(V, N);
    float fres = 0.2 + 0.8 * pow(1.0 - clamp(-V.y, 0.0, 1.0), 5.0);
    vec3 sky = mix(vec3(0.15, 0.06, 0.15), vec3(0.035, 0.016, 0.08), smoothstep(0.0, 0.35, R.y));
    sky += vec3(0.62, 0.26, 0.12) * exp(-max(R.y, 0.0) * 14.0) * 0.25 * uWarm;
    // the moon's path: a shimmering column straight below it, broken up by the ripples
    float daz = atan(R.x, -R.z) - atan(uMoonDir.x, -uMoonDir.z);
    float column = exp(-daz * daz / 0.0016) * smoothstep(0.45, 0.0, abs(R.y - uMoonDir.y));
    float sparkle = smoothstep(0.58, 0.92, vnoise(q * vec2(1.6, 7.0) + vec2(t * 0.5, -t * 0.8)));
    float glitter = column * (0.06 + 1.1 * sparkle);
    vec3 col = vec3(0.008, 0.005, 0.02) + sky * fres * 0.6 + vec3(1.0, 0.96, 0.86) * glitter;
    // the water lets the mirrored temple and lanterns show through, less at grazing angles
    float a = mix(0.52, 0.93, fres);
    gl_FragColor = vec4(col, a * uAlpha);
  }
`

/* ------------------------------------------------------------------------------------ */
/* Lanterns (instanced paper lanterns + halos), also drawn mirrored in the river         */
/* ------------------------------------------------------------------------------------ */

const LANTERN_MOTION = /* glsl */ `
  attribute vec4 aA; // start x, start z, birth (s), loops (1) or once (0)
  attribute vec4 aB; // rise speed, size, phase, start y
  uniform float uRelease;
  uniform float uLife;
  uniform float uMirror;
  vec3 lanternPos(out float alpha, out float scale) {
    float age = uRelease - aA.z;
    if (aA.w > 0.5 && age > 0.0) age = mod(age, uLife);
    float vis = step(0.0, age) * step(age, uLife);
    float u = clamp(age / uLife, 0.0, 1.0);
    float sp = aB.x;
    float y = aB.w + sp * (age + 2.0 * (1.0 - exp(-age * 0.6)));
    vec3 p = vec3(
      aA.x + sin(age * 0.33 + aB.z) * 0.9 + age * 0.22,
      y,
      aA.y - age * sp * 0.75 + cos(age * 0.25 + aB.z * 1.7) * 0.7
    );
    alpha = vis * smoothstep(0.0, 1.6, age) * (1.0 - smoothstep(0.72, 1.0, u));
    scale = aB.y * vis * mix(0.55, 1.0, smoothstep(0.0, 1.4, age));
    if (uMirror > 0.5) p.y = -p.y;
    return p;
  }
`
const lanternVert = /* glsl */ `
  ${LANTERN_MOTION}
  uniform float uTime;
  varying float vH;
  varying float vA;
  varying float vFl;
  varying float vSide;
  void main() {
    float a, s;
    vec3 p0 = lanternPos(a, s);
    vec3 p = position * s;
    if (uMirror > 0.5) p.y = -p.y;
    vH = clamp(position.y / 0.46 + 0.5, 0.0, 1.0);
    vA = a;
    vFl = 0.82 + 0.18 * sin(uTime * 8.0 + aB.z * 9.0) * sin(uTime * 4.7 + aB.z * 3.0);
    vec4 mv = modelViewMatrix * vec4(p0 + p, 1.0);
    if (uMirror > 0.5) vA *= smoothstep(16.0, 32.0, -mv.z);
    vec3 nv = normalize(normalMatrix * vec3(normal.x, 0.0, normal.z));
    vSide = abs(nv.z); // brighter where the paper faces us (light through it)
    gl_Position = projectionMatrix * mv;
  }
`
const lanternFrag = /* glsl */ `
  uniform float uMirror;
  varying float vH;
  varying float vA;
  varying float vFl;
  varying float vSide;
  void main() {
    vec3 bot = vec3(1.0, 0.66, 0.26);
    vec3 top = vec3(0.86, 0.22, 0.05);
    vec3 c = mix(bot, top, smoothstep(0.05, 1.0, vH));
    float glow = (1.9 - 1.1 * vH) * vFl * (0.55 + 0.45 * vSide);
    float k = uMirror > 0.5 ? 0.4 : 1.0;
    gl_FragColor = vec4(c * glow * 1.6 * vA * k, 1.0);
  }
`
const haloVert = /* glsl */ `
  ${LANTERN_MOTION}
  uniform float uPx;
  uniform float uTime;
  varying float vA;
  void main() {
    float a, s;
    vec3 p0 = lanternPos(a, s);
    p0.y += (uMirror > 0.5 ? 0.1 : -0.1) * s;
    vec4 mv = modelViewMatrix * vec4(p0, 1.0);
    vA = a * (0.85 + 0.15 * sin(uTime * 6.0 + aB.z * 5.0));
    if (uMirror > 0.5) vA *= smoothstep(16.0, 32.0, -mv.z);
    gl_PointSize = min(200.0, 1.7 * s * uPx / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`
const haloFrag = /* glsl */ `
  uniform float uMirror;
  varying float vA;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float g = exp(-r * r * 4.0) * smoothstep(1.0, 0.6, r);
    float k = uMirror > 0.5 ? 0.35 : 1.0;
    gl_FragColor = vec4(vec3(1.0, 0.42, 0.1) * g * 0.5 * vA * k, 1.0);
  }
`

const TAP_LANTERNS = 24

function makeLanternAttrs(count: number) {
  const aA = new Float32Array(count * 4)
  const aB = new Float32Array(count * 4)
  for (let i = 0; i < count; i++) {
    const tap = i >= count - TAP_LANTERNS
    // Launch spots: along the near bank (around the viewer) and the far bank (around
    // the temple), spread wide; staggered births so they rise in a steady stream.
    const far = Math.random() < 0.45
    let x = (Math.random() - 0.5) * (far ? 90 : 70)
    const z = far ? BANK_EDGE_Z - 2 - Math.random() * 30 : 44 + Math.random() * 18
    // none launch close to the viewer (they'd fill the screen): near-bank ones go to the sides
    if (!far && Math.abs(x) < 14) x = Math.sign(x || 1) * (14 + Math.random() * 20)
    aA[i * 4] = x
    aA[i * 4 + 1] = z
    aA[i * 4 + 2] = tap ? 1e9 : Math.pow(Math.random(), 1.6) * LANTERN_LIFE // early ones first
    aA[i * 4 + 3] = tap ? 0 : 1
    aB[i * 4] = 0.55 + Math.random() * 0.45
    aB[i * 4 + 1] = 0.8 + Math.random() * 0.5
    aB[i * 4 + 2] = Math.random() * 6.283
    aB[i * 4 + 3] = far ? BANK_Y + 0.5 : BANK_Y + 0.8
  }
  return { aA, aB, version: 0 }
}

function Lanterns({ count, attrs, mirror }: { count: number; attrs: ReturnType<typeof makeLanternAttrs>; mirror: boolean }) {
  const size = useThree((s) => s.size)
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const seen = useRef(0)
  const { geo, haloGeo, mat, haloMat } = useMemo(() => {
    const base = new CylinderGeometry(0.26, 0.18, 0.46, 14, 1, true)
    const geo = new InstancedBufferGeometry()
    geo.index = base.index
    geo.setAttribute('position', base.getAttribute('position'))
    geo.setAttribute('normal', base.getAttribute('normal'))
    const iA = new InstancedBufferAttribute(attrs.aA, 4)
    const iB = new InstancedBufferAttribute(attrs.aB, 4)
    geo.setAttribute('aA', iA)
    geo.setAttribute('aB', iB)
    geo.instanceCount = count
    const haloGeo = new BufferGeometry()
    haloGeo.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3))
    haloGeo.setAttribute('aA', new BufferAttribute(attrs.aA, 4))
    haloGeo.setAttribute('aB', new BufferAttribute(attrs.aB, 4))
    const common = {
      uRelease: { value: 0 },
      uLife: { value: LANTERN_LIFE },
      uMirror: { value: mirror ? 1 : 0 },
      uTime: { value: 0 },
    }
    const mat = new ShaderMaterial({
      vertexShader: lanternVert,
      fragmentShader: lanternFrag,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      uniforms: { ...common },
    })
    const haloMat = new ShaderMaterial({
      vertexShader: haloVert,
      fragmentShader: haloFrag,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { ...common, uPx: { value: 1 } },
    })
    return { geo, haloGeo, mat, haloMat }
  }, [attrs, count, mirror])

  useFrame((s) => {
    const t = s.clock.elapsedTime
    for (const m of [mat, haloMat]) {
      m.uniforms.uRelease.value = templeFx.release
      m.uniforms.uTime.value = t
    }
    haloMat.uniforms.uPx.value = size.height / (2 * Math.tan(MathUtils.degToRad(camera.fov / 2))) * Math.min(2, window.devicePixelRatio || 1)
    if (seen.current !== attrs.version) {
      seen.current = attrs.version
      for (const g of [geo, haloGeo]) {
        g.getAttribute('aA').needsUpdate = true
        g.getAttribute('aB').needsUpdate = true
      }
    }
  })

  return (
    <>
      <mesh geometry={geo} material={mat} frustumCulled={false} renderOrder={mirror ? 1 : 6} />
      <points geometry={haloGeo} material={haloMat} frustumCulled={false} renderOrder={mirror ? 2 : 7} />
    </>
  )
}

/* ------------------------------------------------------------------------------------ */
/* Soft glow points: temple lamps, floating diyas, sparks, shooting stars, bell rings    */
/* ------------------------------------------------------------------------------------ */

const ptsVert = /* glsl */ `
  attribute float aSize;
  attribute vec4 aColor; // rgb, alpha
  uniform float uPx;
  varying vec4 vC;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vC = aColor;
    gl_PointSize = min(180.0, aSize * uPx / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`
const ptsFrag = /* glsl */ `
  varying vec4 vC;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float g = exp(-r * r * 5.0) * smoothstep(1.0, 0.5, r) + smoothstep(0.25, 0.0, r) * 0.6;
    gl_FragColor = vec4(vC.rgb * g * vC.a, 1.0);
  }
`
type Pt = { x: number; y: number; z: number; vx: number; vy: number; vz: number; size: number; r: number; g: number; b: number; a: number; life: number; decay: number; drag: number; grav: number }
const FX_MAX = 700

/* ------------------------------------------------------------------------------------ */
/* The temple: bounding box measured once on load                                        */
/* ------------------------------------------------------------------------------------ */

const templeBox = new Box3()
const templeInfo = { ready: false, scale: 1, cx: 0, cz: 0, minY: 0, w: 1, d: 1 }
function measureTemple(root: Object3D) {
  templeBox.setFromObject(root)
  const h = templeBox.max.y - templeBox.min.y
  templeInfo.scale = TEMPLE_H / Math.max(1e-6, h)
  templeInfo.cx = (templeBox.min.x + templeBox.max.x) / 2
  templeInfo.cz = (templeBox.min.z + templeBox.max.z) / 2
  templeInfo.minY = templeBox.min.y
  templeInfo.w = (templeBox.max.x - templeBox.min.x) * templeInfo.scale
  templeInfo.d = (templeBox.max.z - templeBox.min.z) * templeInfo.scale
  templeInfo.ready = true
  // Sandstone at night: rough, no metallic sheen.
  root.traverse((o) => {
    const m = (o as Mesh).material as { roughness?: number; metalness?: number; envMapIntensity?: number } | undefined
    if (m && 'roughness' in m) {
      m.roughness = Math.max(0.85, m.roughness ?? 1)
      m.metalness = 0
      m.envMapIntensity = 0.25
    }
  })
}

/* ------------------------------------------------------------------------------------ */
/* The scene                                                                             */
/* ------------------------------------------------------------------------------------ */

export function TempleNight({ reducedMotion }: { reducedMotion: boolean }) {
  const [near, setNear] = useState(false)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    const el = document.querySelector('.np-track')
    if (!el) return
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setNear(true), {
      rootMargin: '150% 0px',
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // The governed camera journey, driven by the scroll through the finale's second part.
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1)
    const f = finaleScroll()
    if (!f) return
    const vh = f.vh
    const target = reducedMotion ? (f.temple > 0.05 ? 1 : 0) : MathUtils.clamp(f.temple / TEMPLE_MOVE, 0, 1)
    const step = target - templeFx.view
    const cap = (step > 0 ? 0.105 : 1.2) * dt // ~9.5s for the whole journey; quick to rewind
    templeFx.view = reducedMotion ? target : templeFx.view + MathUtils.clamp(step, -cap, cap)
    templeFx.portrait = window.innerWidth / vh < 1.05
    if (import.meta.env.DEV) {
      const w = window as unknown as { __templeFx?: typeof templeFx; __templeView?: number }
      w.__templeFx = templeFx // QA hooks
      ;(window as unknown as { __templeInfo?: unknown }).__templeInfo = templeInfo
      ;(window as unknown as { __templeScene?: unknown }).__templeScene = scene
      if (w.__templeView != null) templeFx.view = w.__templeView
    }
    // Lanterns: released as the camera arrives; gone again if the visitor goes back up.
    if (templeFx.view > 0.42) templeFx.release = reducedMotion ? 18 : templeFx.release + dt
    else if (templeFx.view < 0.3) templeFx.release = 0
  }, -6)

  if (!near) return null
  return <TempleScene reducedMotion={reducedMotion} />
}

function TempleScene({ reducedMotion }: { reducedMotion: boolean }) {
  const { assetTier } = useQuality()
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)
  const scene = useThree((s) => s.scene)
  const root = useRef<Group>(null)
  const temple = useRef<Group>(null)
  const mirrorTemple = useRef<Group>(null)
  const moon = useRef<Mesh>(null)
  const moonGlow = useRef<Mesh>(null)
  const moonLight = useRef<DirectionalLight>(null)
  const moonDir = useMemo(() => new Vector3(0, 0.3, -1).normalize(), [])
  const count = { high: 420, mid: 260, low: 120 }[assetTier]
  const lanternAttrs = useMemo(() => makeLanternAttrs(count), [count])

  const moonMat = useMemo(
    () => new ShaderMaterial({ vertexShader: moonVert, fragmentShader: moonFrag, uniforms: { uPulse: { value: 0 }, uShow: { value: 0 } } }),
    [],
  )
  const moonGlowMat = useMemo(() => makeGlow('#cfc6ff'), [])
  const waterMat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: waterVert,
        fragmentShader: waterFrag,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uCam: { value: new Vector3() },
          uMoonDir: { value: new Vector3() },
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uWarm: { value: 0 },
        },
      }),
    [],
  )

  // Glow points: lamps around the temple's base, floating diyas, and the effect pool.
  const LAMPS = 18
  const DIYAS = { high: 60, mid: 40, low: 24 }[assetTier]
  const pts = useMemo(() => {
    const n = LAMPS + DIYAS * 2 + FX_MAX
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3))
    g.setAttribute('aSize', new BufferAttribute(new Float32Array(n), 1))
    g.setAttribute('aColor', new BufferAttribute(new Float32Array(n * 4), 4))
    const m = new ShaderMaterial({
      vertexShader: ptsVert,
      fragmentShader: ptsFrag,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uPx: { value: 1 } },
    })
    const diyas = Array.from({ length: DIYAS }, () => ({
      x: (Math.random() - 0.5) * 120,
      z: BANK_EDGE_Z + 3 + Math.random() * 34,
      ph: Math.random() * 6.283,
      sp: 0.25 + Math.random() * 0.35,
    }))
    return { g, m, n, diyas, fx: [] as Pt[] }
  }, [DIYAS])

  const lampLights = useRef<Group>(null)
  const bell = useRef(0)
  const moonPulse = useRef(0)
  const tapIndex = useRef(0)
  const proj = useMemo(() => new Vector3(), [])

  const spawn = (p: Partial<Pt> & { x: number; y: number; z: number }) => {
    if (pts.fx.length >= FX_MAX) pts.fx.shift()
    pts.fx.push({ vx: 0, vy: 0, vz: 0, size: 0.4, r: 1, g: 0.8, b: 0.5, a: 1, life: 1, decay: 0.8, drag: 0.98, grav: 0, ...p })
  }

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1)
    const g = root.current
    if (!g) return
    const away = templeAway()
    g.visible = templeFx.view > 0.001
    if (!g.visible) return
    g.position.copy(ORIGIN)
    const t = state.clock.elapsedTime

    // Temple placement (scaled to TEMPLE_H, base on the bank, turned to show porch and spire).
    const tx = templeFx.portrait ? 0 : 3.2
    if (templeInfo.ready) {
      for (const [ref, mirror] of [
        [temple, false],
        [mirrorTemple, true],
      ] as const) {
        const o = ref.current
        if (!o) continue
        o.scale.set(templeInfo.scale, templeInfo.scale * (mirror ? -1 : 1), templeInfo.scale)
        o.position.set(
          tx - templeInfo.cx * templeInfo.scale,
          (mirror ? -1 : 1) * (BANK_Y - templeInfo.minY * templeInfo.scale),
          TEMPLE_Z - templeInfo.cz * templeInfo.scale,
        )
      }
    }
    if (lampLights.current) lampLights.current.position.x = tx

    // Moon: rises as the camera settles, keeps climbing slowly after.
    const rise = MathUtils.smoothstep(templeFx.view, 0.35, 1) * 0.85 + Math.min(0.15, templeFx.release / 200)
    const mpos = templeFx.portrait
      ? tmpMoon.lerpVectors(MOON_FROM_P, MOON_TO_P, rise)
      : tmpMoon.lerpVectors(MOON_FROM, MOON_TO, rise)
    moonPulse.current *= Math.exp(-dt * 1.6)
    const moonK = templeFx.portrait ? 0.6 : 1 // smaller in the narrow phone frame
    if (moon.current) {
      moon.current.position.copy(mpos)
      moon.current.scale.setScalar(moonK)
      moonMat.uniforms.uPulse.value = moonPulse.current
      moonMat.uniforms.uShow.value = MathUtils.smoothstep(templeFx.view, 0.16, 0.34)
    }
    if (moonGlow.current) {
      moonGlow.current.position.copy(mpos)
      moonGlow.current.scale.setScalar(MOON_R * moonK * (4.2 + 3 * moonPulse.current))
      moonGlowMat.uniforms.uAlpha.value = MathUtils.smoothstep(templeFx.view, 0.16, 0.34) * (0.32 + 0.6 * moonPulse.current)
    }
    moonDir.copy(mpos).add(ORIGIN).sub(camera.position).normalize()
    if (moonLight.current) {
      moonLight.current.position.copy(mpos).multiplyScalar(0.2)
      moonLight.current.target.position.set(tx, 6, TEMPLE_Z)
      moonLight.current.target.updateMatrixWorld()
      moonLight.current.intensity = 1.35 * away // a soft rim, not white highlights
    }

    // Haze over the land, only while this scene shows (the rest of the site has no fog).
    if (away > 0.01) {
      if (scene.fog !== sceneFog) scene.fog = sceneFog
    } else if (scene.fog === sceneFog) scene.fog = null

    waterMat.uniforms.uCam.value.copy(camera.position)
    waterMat.uniforms.uMoonDir.value.copy(moonDir)
    waterMat.uniforms.uTime.value = reducedMotion ? 10 : t
    waterMat.uniforms.uAlpha.value = away
    waterMat.uniforms.uWarm.value = MathUtils.clamp(templeFx.release / 12, 0, 1) * 0.7 + 0.3

    // --- taps: temple → bell, moon → shooting stars, sky → a lantern of your own ---
    const taps = templeFx.taps.splice(0)
    if (templeFx.view > 0.9) {
      for (const tap of taps) {
        const nx = (tap.x / size.width) * 2 - 1
        const ny = -(tap.y / size.height) * 2 + 1
        // moon (screen-space disc)
        proj.copy(mpos).add(ORIGIN).project(camera)
        const mr = ((MOON_R * moonK) / camera.position.distanceTo(tmpW.copy(mpos).add(ORIGIN))) / Math.tan(MathUtils.degToRad(camera.fov / 2))
        if (Math.hypot((nx - proj.x) * (size.width / size.height), ny - proj.y) < mr * 2.2) {
          moonPulse.current = 1
          for (let k = 0; k < 7; k++) {
            const a = Math.PI * (0.05 + Math.random() * 0.4) * (Math.random() < 0.5 ? 1 : -1) - Math.PI / 2
            const sp = 60 + Math.random() * 50
            spawn({ x: mpos.x, y: mpos.y, z: mpos.z + 20, vx: Math.cos(a) * sp * 0.9 + 60, vy: Math.sin(a) * sp * 0.4 - 10, vz: 0, size: 3.2, r: 1, g: 0.97, b: 0.9, decay: 0.55, drag: 0.995, life: 1 })
          }
          continue
        }
        // temple (screen-space box around it)
        if (templeInfo.ready) {
          const top = tmpW.set(tx, BANK_Y + TEMPLE_H, TEMPLE_Z).add(ORIGIN).project(camera).clone()
          const bot = tmpW.set(tx, BANK_Y, TEMPLE_Z).add(ORIGIN).project(camera).clone()
          const halfW = Math.abs(tmpW.set(tx + templeInfo.w * 0.5, BANK_Y, TEMPLE_Z).add(ORIGIN).project(camera).x - bot.x)
          if (ny < top.y && ny > bot.y && Math.abs(nx - bot.x) < halfW) {
            bell.current = 1
            const sy = BANK_Y + TEMPLE_H * 0.97
            for (let ring = 0; ring < 3; ring++)
              for (let k = 0; k < 48; k++) {
                const a = (k / 48) * Math.PI * 2
                const sp = 7 + ring * 3.5
                spawn({ x: tx, y: sy, z: TEMPLE_Z + 1, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 0, size: 0.55, r: 1, g: 0.82, b: 0.5, decay: 0.7 + ring * 0.08, drag: 0.965, life: 1 })
              }
            continue
          }
        }
        // sky / anywhere else → a lantern rises from where you tapped
        const dir = tmpW.set(nx, ny, 0.5).unproject(camera).sub(camera.position).normalize()
        const at = tmpW2.copy(camera.position).addScaledVector(dir, 16).sub(ORIGIN)
        const i = count - TAP_LANTERNS + (tapIndex.current++ % TAP_LANTERNS)
        lanternAttrs.aA[i * 4] = at.x
        lanternAttrs.aA[i * 4 + 1] = at.z
        lanternAttrs.aA[i * 4 + 2] = templeFx.release
        lanternAttrs.aB[i * 4 + 3] = at.y
        lanternAttrs.version++
        for (let k = 0; k < 18; k++) {
          const a = Math.random() * Math.PI * 2
          spawn({ x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2 + 1, vz: 0, size: 0.18, r: 1, g: 0.72, b: 0.35, decay: 1.2, drag: 0.95, grav: -1, life: 1 })
        }
      }
    }

    // --- glow points ---
    bell.current *= Math.exp(-dt * 1.2)
    const pos = pts.g.getAttribute('position') as BufferAttribute
    const sz = pts.g.getAttribute('aSize') as BufferAttribute
    const col = pts.g.getAttribute('aColor') as BufferAttribute
    let n = 0
    const put = (x: number, y: number, z: number, s: number, r: number, gg: number, b: number, a: number) => {
      pos.setXYZ(n, x, y, z)
      sz.setX(n, s)
      col.setXYZW(n, r, gg, b, a)
      n++
    }
    // lamps around the plinth (they flare when the bell rings)
    if (templeInfo.ready) {
      for (let i = 0; i < LAMPS; i++) {
        const a = (i / LAMPS) * Math.PI * 2
        const fl = 0.8 + 0.2 * Math.sin(t * 7 + i * 3.1) * Math.sin(t * 3.3 + i)
        const rx = templeInfo.w * 0.56
        const rz = templeInfo.d * 0.56
        put(tx + Math.cos(a) * rx, BANK_Y + 0.25, TEMPLE_Z + Math.sin(a) * rz, 0.42 + 0.35 * bell.current, 1, 0.55, 0.18, away * fl * (0.62 + 0.7 * bell.current))
      }
    }
    // floating diyas on the current, and their reflections
    const diyaOn = MathUtils.smoothstep(templeFx.view, 0.5, 0.9)
    for (const d of pts.diyas) {
      const x = ((d.x + (reducedMotion ? 0 : t) * d.sp + 60) % 120 + 120) % 120 - 60
      const bob = Math.sin(t * 1.3 + d.ph) * 0.03
      const fl = 0.85 + 0.15 * Math.sin(t * 9 + d.ph * 5)
      put(x, 0.08 + bob, d.z, 0.32, 1, 0.66, 0.28, diyaOn * fl)
      put(x, -0.12 - bob, d.z, 0.42, 1, 0.5, 0.2, diyaOn * fl * 0.35)
    }
    // effects (sparks, bell rings, shooting stars)
    for (const f of pts.fx) {
      f.x += f.vx * dt
      f.y += f.vy * dt
      f.z += f.vz * dt
      const dr = Math.pow(f.drag, dt * 60)
      f.vx *= dr
      f.vy = f.vy * dr + f.grav * dt
      f.vz *= dr
      f.life -= f.decay * dt
      if (f.size > 2) {
        // shooting star: a short trail of fading points behind the head
        for (let k = 0; k < 10 && n < pts.n; k++) {
          const back = k * 0.022
          put(f.x - f.vx * back, f.y - f.vy * back, f.z, f.size * (1 - k / 10), f.r, f.g, f.b, Math.max(0, f.life) * (1 - k / 10))
        }
      } else if (n < pts.n) put(f.x, f.y, f.z, f.size, f.r, f.g, f.b, Math.max(0, f.life))
    }
    pts.fx = pts.fx.filter((f) => f.life > 0)
    for (let i = n; i < pts.n; i++) col.setW(i, 0)
    pos.needsUpdate = sz.needsUpdate = col.needsUpdate = true
    pts.g.setDrawRange(0, Math.max(n, 1))
    pts.m.uniforms.uPx.value = (size.height / (2 * Math.tan(MathUtils.degToRad(camera.fov / 2)))) * Math.min(2, window.devicePixelRatio || 1)

    // The banks and ghat steps are lit by the lamps; lamps swell with the bell.
    if (lampLights.current) for (const l of lampLights.current.children) (l as unknown as { intensity: number }).intensity = 40 * away * (1 + 1.2 * bell.current)
  })

  const ghat = useMemo(() => [0, 1, 2, 3], [])
  const shore = useMemo(() => makeShore(), [])

  return (
    <group ref={root} visible={false}>
      <SkyDome moonDir={moonDir} />

      {/* moon */}
      <mesh ref={moon} material={moonMat} renderOrder={-800}>
        <sphereGeometry args={[MOON_R, 48, 24]} />
      </mesh>
      <mesh ref={moonGlow} material={moonGlowMat} renderOrder={-790}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <directionalLight ref={moonLight} color="#9d8fe0" intensity={0} />

      {/* far bank, ghat steps down to the water, near bank */}
      <mesh position={[0, BANK_Y - 0.5, BANK_EDGE_Z - 25]} receiveShadow={false}>
        <boxGeometry args={[1400, 1, 50]} />
        <meshStandardMaterial color="#2a1d2c" roughness={1} metalness={0} envMapIntensity={0.05} />
      </mesh>
      {ghat.map((i) => (
        <mesh key={i} position={[0, BANK_Y - 0.12 - i * 0.22, BANK_EDGE_Z + 0.35 + i * 0.7]}>
          <boxGeometry args={[34 - i * 1.5, 0.22, 0.7]} />
          <meshStandardMaterial color="#2a1d1c" roughness={0.95} metalness={0} envMapIntensity={0.05} />
        </mesh>
      ))}
      <mesh position={[0, BANK_Y - 0.5, 44 + 60]}>
        <boxGeometry args={[800, 1, 120]} />
        <meshStandardMaterial color="#0b070e" roughness={1} metalness={0} envMapIntensity={0.05} />
      </mesh>

      {/* the far bank's palms and tree line, black against the haze (and mirrored) */}
      <mesh geometry={shore.geo} material={shore.mat} />
      <mesh geometry={shore.geo} material={shore.mat} scale={[1, -1, 1]} />

      {/* the temple, and its reflection under the water */}
      <group ref={temple}>
        <Suspense fallback={null}>
          <Model src="temple.glb" castShadow={false} receiveShadow={false} customize={measureTemple} />
        </Suspense>
      </group>
      <group ref={mirrorTemple}>
        <Suspense fallback={null}>
          <Model src="temple.glb" castShadow={false} receiveShadow={false} customize={measureTemple} />
        </Suspense>
      </group>
      <group ref={lampLights}>
        <pointLight position={[-7, 2.2, TEMPLE_Z + 7]} color="#ff9a3c" intensity={0} distance={40} decay={2} />
        <pointLight position={[7, 2.2, TEMPLE_Z + 7]} color="#ff9a3c" intensity={0} distance={40} decay={2} />
        <pointLight position={[0, 1.4, BANK_EDGE_Z + 2.5]} color="#ffb05a" intensity={0} distance={30} decay={2} />
      </group>

      {/* the river */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, (BANK_EDGE_Z + 44) / 2 + 1]} material={waterMat} renderOrder={4}>
        <planeGeometry args={[900, 44 - BANK_EDGE_Z + 2, 1, 1]} />
      </mesh>

      {/* sky lanterns, and their reflections */}
      <Lanterns count={count} attrs={lanternAttrs} mirror />
      <Lanterns count={count} attrs={lanternAttrs} mirror={false} />

      <points geometry={pts.g} material={pts.m} frustumCulled={false} renderOrder={8} />
    </group>
  )
}
// linear RGB: the same violet haze the sky has at the horizon, so the land melts into it
/** Palms and a ragged tree line along the far bank, as flat silhouettes (night: no detail
 *  shows, only the shapes against the haze). Aerial perspective comes from the fog. */
function makeShore() {
  // tree line: a long band with a noisy top, behind the temple
  const band = (z: number, base: number, amp: number, seed: number) => {
    const sh = new Shape()
    sh.moveTo(-420, -1)
    for (let x = -420; x <= 420; x += 3) {
      const n = Math.sin(x * 0.07 + seed) * 0.5 + Math.sin(x * 0.19 + seed * 2.3) * 0.3 + Math.sin(x * 0.53 + seed * 5.1) * 0.2
      sh.lineTo(x, base + amp * (0.5 + 0.5 * n))
    }
    sh.lineTo(420, -1)
    sh.closePath()
    return { sh, z }
  }
  // palms: a curved trunk and drooping fronds
  const palm = (x: number, h: number, lean: number) => {
    const out: Shape[] = []
    const trunk = new Shape()
    const N = 10
    const pts: [number, number][] = []
    for (let i = 0; i <= N; i++) {
      const t = i / N
      pts.push([x + lean * t * t * h, t * h])
    }
    trunk.moveTo(pts[0][0] - 0.22, 0)
    for (const [px, py] of pts) trunk.lineTo(px - 0.18 + 0.08 * (py / h), py)
    for (let i = pts.length - 1; i >= 0; i--) trunk.lineTo(pts[i][0] + 0.18 - 0.08 * (pts[i][1] / h), pts[i][1])
    trunk.closePath()
    out.push(trunk)
    const [cx, cy] = pts[N]
    const fronds = 14
    for (let k = 0; k < fronds; k++) {
      const a = Math.PI * (-0.04 + (1.08 * k) / (fronds - 1)) + (Math.sin(k * 12.9 + x) * 0.5) * 0.18
      const L = h * (0.3 + 0.12 * Math.abs(Math.sin(k * 7.1 + x)))
      const dx = Math.cos(a)
      const dy = Math.sin(a)
      const nx = -dy
      const ny = dx
      const w = L * 0.11 // a full, feathery frond rather than a wire
      const droop = L * (0.3 + 0.3 * Math.abs(dx))
      const tipX = cx + dx * L
      const tipY = cy + dy * L * 0.4 - droop
      const midX = cx + dx * L * 0.55
      const midY = cy + dy * L * 0.55 - droop * 0.2
      const leaf = new Shape()
      leaf.moveTo(cx, cy)
      leaf.quadraticCurveTo(midX + nx * w, midY + ny * w, tipX, tipY)
      leaf.quadraticCurveTo(midX - nx * w, midY - ny * w, cx, cy - 0.05)
      out.push(leaf)
    }
    return out
  }
  const geos: BufferGeometry[] = []
  const place = (list: Shape[], z: number) => {
    const g = new ShapeGeometry(list, 6)
    g.translate(0, BANK_Y - 0.05, z)
    geos.push(g)
  }
  for (const { sh, z } of [band(-46, 2.2, 3.2, 1.3), band(-90, 5, 6, 4.7)]) place([sh], z)
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 26; i++) {
    const side = i % 2 ? 1 : -1
    const x = side * (11 + rnd() * 70)
    const h = 7 + rnd() * 6
    place(palm(x, h, (rnd() - 0.5) * 0.25), -6 - rnd() * 30)
  }
  const merged = mergeGeometries(geos)
  const mat = new MeshBasicMaterial({ color: new Color().setRGB(0.012, 0.006, 0.016), side: DoubleSide, fog: true })
  return { geo: merged, mat }
}

const sceneFog = new Fog(new Color().setRGB(0.115, 0.047, 0.115), 22, 230)
const tmpMoon = new Vector3()
const tmpW = new Vector3()
const tmpW2 = new Vector3()
