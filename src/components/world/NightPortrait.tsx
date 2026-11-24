import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  MathUtils,
  ShaderMaterial,
  Vector3,
  type Group,
} from 'three'
import { finaleScroll, templeFx } from './templeFx'
import { useRestViewport } from '../../lib/restViewport'

const tmpP = new Vector3()
const tmpE = new Vector3()

/**
 * THE FINALE — the night sky around Rajesh & Chinmayee's photo.
 *
 * The violet night sky and stars around the finale portrait, and the entrance timeline
 * (nightFx.reveal: fall → flare → open, paced so a fast scroll can't rush it). The rift
 * itself — photo, soft edges and light — is drawn by chapters/RiftPortrait.tsx.
 *
 * The plane is laid over the HTML frame (.np-frame), SPILL times larger, every frame.
 * Reduced motion: fully revealed and still.
 */
const SPILL = 2.6
const RIFT = { s: 0.5, dl: -0.5, dr: 0.45 }

const vert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const frag = /* glsl */ `
  uniform float uTime;
  uniform float uGather;
  uniform float uFade;
  uniform float uAspect;   // plane width / height
  uniform vec3 uRift;      // slant s, left edge dl, right edge dr (frame-height units)
  uniform float uFlare;    // 0..1 how far the line of light has grown
  uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform vec3 uTeal;
  varying vec2 vUv;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
  float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<6;i++){ v+=a*noise(p); p=p*2.02+11.3; a*=0.5; } return v; }
  void main() {
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);         // centred, aspect-correct
    float r = length(p * vec2(1.0, 1.06));
    float t = uTime;
    // Slow swirl around the portrait, gathering inward as the finale arrives.
    float ang = atan(p.y, p.x) + (1.0 - uGather) * 1.2 + t * 0.01;
    vec2 sp = vec2(cos(ang), sin(ang)) * r;
    vec2 q = vec2(fbm(sp * 2.2 + t * 0.02), fbm(sp * 2.2 + 5.7 - t * 0.018));
    float gas = fbm(sp * 3.0 + q * 2.2);
    float fine = fbm(sp * 8.0 - q * 3.0 + t * 0.03);
    float lanes = smoothstep(0.35, 0.75, fbm(sp * 4.5 + 19.0 + q));   // dark dust lanes

    // Where the gas lives: a broad halo just outside the photo's oval (~0.19 of the plane
    // height) out to the stage edges — thickest close around them, thinning outward.
    // The rift: distance (frame-height units) to each edge line X + s·Y = d (Y down).
    vec2 F = (vUv - 0.5) * vec2(uAspect, 1.0) * ${SPILL.toFixed(2)};
    float v = F.x - uRift.x * F.y;
    float nrm = inversesqrt(1.0 + uRift.x * uRift.x);
    float eL = (v - uRift.y) * nrm;
    float eR = (v - uRift.z) * nrm;
    float edge = min(abs(eL), abs(eR));
    // Only DEEP inside the rift is the gas kept back (where the photo is fully opaque);
    // near the edges it stays bright, so the photo's soft edge fades into glowing gas,
    // never onto a dark strip.
    float inside = smoothstep(0.05, 0.12, eL) * smoothstep(0.05, 0.12, -eR);
    // Gas streams along the edges (stretched along the line), and fills the sky around.
    vec2 along = vec2(F.x * nrm + F.y * uRift.x * nrm, v * nrm);
    float stream = fbm(vec2(along.x * 1.2 + t * 0.05, along.y * 6.0)) ;
    // Centred on each edge line, and only along the photo's height — it fades out before
    // the names above and Shubha Bibaha below.
    float span = smoothstep(0.52 * uFlare + 0.02, 0.32 * uFlare, abs(F.y)) * uFlare;
    // A fine, bright seam of light with a modest halo — not a fat band.
    float edgeGas = (exp(-edge * edge / 0.0012) * 0.9 + exp(-edge * edge / 0.012) * 0.28) * (0.55 + 0.8 * stream) * uGather * span;
    float reach = 1.0 - smoothstep(0.32, 0.62, r);
    // The violet gas fills the sky around the portrait (richest close in, thinning out).
    float d = (gas * gas * 1.5 + fine * 0.3) * reach * (1.0 - 0.55 * lanes) * (0.55 + 0.8 * exp(-max(r - 0.16, 0.0) / 0.22))
      // calm where the photo opens, so no bright block of cloud sits there before it
      * mix(0.45, 1.0, smoothstep(0.06, 0.26, r));
    d = d * mix(0.35, 1.0, uGather);
    d *= 1.0 - 0.92 * inside * uGather;               // the photo shows through the rift
    d += edgeGas * 0.85;                              // the edges glow on both sides equally
    float rim = 0.0;

    float teal = smoothstep(0.55, 0.85, fbm(sp * 2.0 + 31.0 + q));
    vec3 col = mix(uC0, uC1, smoothstep(0.08, 0.4, d));
    col = mix(col, uTeal, teal * 0.45 * (1.0 - smoothstep(0.4, 0.7, d)));
    col = mix(col, uC2, smoothstep(0.38, 0.75, d));
    col = mix(col, uC3, smoothstep(0.75, 1.1, d + fine * 0.2) * smoothstep(0.1, 0.3, r));
    vec3 outc = col * d * 1.15 + uC2 * rim * 0.1 * uGather;
    gl_FragColor = vec4(outc * uFade, 1.0);
    #include <colorspace_fragment>
  }
`

const starVert = /* glsl */ `
  attribute vec4 aStar;     // x, y (plane uv), size, brightness
  attribute vec3 aFrom;     // scattered start offset, phase
  uniform float uGather;
  uniform float uTime;
  uniform float uPx;        // pixels per plane-height
  varying float vB;
  varying float vBig;
  void main() {
    float g = clamp((uGather - aFrom.z * 0.3) / 0.7, 0.0, 1.0);
    g = 1.0 - pow(1.0 - g, 3.0);
    vec2 uv = mix(aStar.xy + aFrom.xy, aStar.xy, g);
    uv += vec2(sin(uTime * 0.2 + aFrom.z * 30.0), cos(uTime * 0.17 + aFrom.z * 17.0)) * 0.002;
    vec3 pos = vec3(uv.x - 0.5, 0.5 - uv.y, 0.01);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    float tw = 0.55 + 0.45 * sin(uTime * (0.8 + aFrom.z * 2.2) + aFrom.z * 40.0);
    vB = aStar.w * tw * (0.3 + 0.7 * g);
    vBig = step(2.0, aStar.z);
    gl_PointSize = aStar.z * uPx * 0.0016;
  }
`
const starFrag = /* glsl */ `
  uniform float uFade;
  uniform vec3 uStar;
  varying float vB;
  varying float vBig;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d); a *= a;
    float core = smoothstep(0.14, 0.0, d);
    // The largest stars get a faint four-point glint.
    float glint = vBig * (exp(-abs(c.x) * 40.0) * exp(-abs(c.y) * 6.0) + exp(-abs(c.y) * 40.0) * exp(-abs(c.x) * 6.0));
    gl_FragColor = vec4(uStar * (a * 0.6 + core + glint * 0.8) * vB * uFade, 1.0);
    #include <colorspace_fragment>
  }
`

export const nightFx = { gather: 0, fade: 0, reveal: 0 }

export function NightPortrait({ reducedMotion }: { reducedMotion: boolean }) {
  const viewport = useRestViewport()
  const size = useThree((s) => s.size)
  const group = useRef<Group>(null)
  const [near, setNear] = useState(false)

  // Only build anything once the finale is within ~1.5 screens.
  useEffect(() => {
    const el = document.querySelector('.np-frame')
    if (!el) return
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setNear(true), {
      rootMargin: '150% 0px',
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const mat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uGather: { value: 0 },
          uFade: { value: 0 },
          uAspect: { value: 1 },
          uRift: { value: [RIFT.s, 0, 0] },
          uFlare: { value: 0 },
          // The violet night sky (approved), with teal and soft gold in the brightest gas.
          uC0: { value: new Color('#140a2e') }, // deep night violet
          uC1: { value: new Color('#4b2273') }, // plum-violet
          uC2: { value: new Color('#8c5bc4') }, // luminous violet
          uC3: { value: new Color('#f2dcb0') }, // soft gold light
          uTeal: { value: new Color('#1d6a78') }, // cool pockets of gas
        },
      }),
    [],
  )

  const starGeo = useMemo(() => {
    if (!near) return null
    const n = 2600
    const aStar = new Float32Array(n * 4)
    const aFrom = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      // Around the photo (the frame is the middle 1/SPILL of the plane), denser close in.
      let x = 0
      let y = 0
      for (;;) {
        x = Math.random()
        y = Math.random()
        const r = Math.hypot((x - 0.5) * 1.06, y - 0.5)
        const inner = 0.5 / SPILL // the photo's oval
        if (r < inner * 1.05 || r > 0.5) continue
        if (Math.random() < Math.pow(1 - (r - inner) / (0.5 - inner), 0.6)) break
      }
      aStar[i * 4] = x
      aStar[i * 4 + 1] = y
      aStar[i * 4 + 2] = 0.8 + Math.random() ** 4 * 2.4
      aStar[i * 4 + 3] = 0.3 + Math.random() * 0.6
      const a = Math.random() * Math.PI * 2
      const rr = 0.05 + Math.random() * 0.2
      aFrom[i * 3] = Math.cos(a) * rr
      aFrom[i * 3 + 1] = Math.sin(a) * rr
      aFrom[i * 3 + 2] = Math.random()
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3))
    g.setAttribute('aStar', new BufferAttribute(aStar, 4))
    g.setAttribute('aFrom', new BufferAttribute(aFrom, 3))
    return g
  }, [near])

  const starMat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: starVert,
        fragmentShader: starFrag,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: AdditiveBlending,
        uniforms: {
          uGather: { value: 0 },
          uTime: { value: 0 },
          uPx: { value: 1 },
          uFade: { value: 0 },
          uStar: { value: new Color('#fff4e2') },
        },
      }),
    [],
  )

  const time = useRef(0)
  const frozen = useRef<DOMRect | null>(null)
  const camera = useThree((s) => s.camera)
  useFrame((_, dt) => {
    const g = group.current
    const el = document.querySelector<HTMLElement>('.np-frame')
    const track = document.querySelector<HTMLElement>('.np-track')
    if (!g || !el || !track || !near) {
      if (g) g.visible = false
      return
    }
    // Once the closing scene's camera move starts, the sky stays where it was in the world
    // (frozen placement) and the camera turns away from it; the HTML photo and names are
    // moved to follow its on-screen position, so they leave with the sky (no dissolve).
    const moving = templeFx.view > 0
    if (!moving) {
      // back at rest: the photo and names sit in the page again (before any early return)
      const cmp = document.querySelector<HTMLElement>('.np-compose')
      if (cmp && cmp.style.transform) {
        cmp.style.transform = ''
        cmp.style.visibility = ''
      }
    }
    if (!moving || !frozen.current) frozen.current = el.getBoundingClientRect()
    const r = moving ? frozen.current : el.getBoundingClientRect()
    if (!moving) frozen.current = r
    const vh = size.height
    const onScreen = r.bottom > -vh * 0.6 && r.top < vh * 1.6
    g.visible = onScreen
    if (!onScreen) return

    // Progress through the pinned finale: the sky gathers, then the photo emerges.
    const p = finaleScroll()?.portrait ?? 0
    const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 2.4)
    const tg = reducedMotion ? 1 : Math.min(1, Math.max(0, (p + 0.1) / 0.45))
    const tf = reducedMotion ? 1 : Math.min(1, Math.max(0, (vh - r.top) / (vh * 0.7)))
    nightFx.gather += (tg - nightFx.gather) * k
    nightFx.fade += (tf - nightFx.fade) * k

    // THE ENTRANCE, one timeline q (0 → 1), never faster than its own pace (a fast scroll
    // can't rush or skip it; scrolling back rewinds it quickly):
    //   0.00–0.30  a small light FALLS along the rift's angle, accelerating
    //   0.28–0.48  it FLARES: a bloom with sharp four-point rays, and a line of light
    //              shooting out diagonally both ways
    //   0.48–0.88  the line SPLITS and OPENS both ways — the photo is revealed
    const target = reducedMotion ? 1 : Math.min(1, Math.max(0, (p - 0.04) / 0.5))
    const step = target - nightFx.reveal
    const cap = (step > 0 ? 0.38 : 2.5) * dt
    nightFx.reveal = reducedMotion ? 1 : nightFx.reveal + Math.max(-cap, Math.min(cap, step))

    // The rift itself (photo, edges, light) is drawn by chapters/RiftPortrait.tsx from
    // nightFx.reveal; the sky here just gathers around it.
    mat.uniforms.uRift.value = [RIFT.s, 10, 10]
    mat.uniforms.uFlare.value = 0
    if (!reducedMotion) time.current += Math.min(dt, 0.1)

    const px = viewport.width / size.width // world units per CSS px
    const h = r.height * px * SPILL
    const w = h * Math.max(1.6, (size.width * px) / h) // as wide as the screen, at least 1.6:1
    g.position.set((r.left + r.width / 2 - size.width / 2) * px, -(r.top + r.height / 2 - size.height / 2) * px, 0)
    g.scale.set(w, h, 1)
    mat.uniforms.uTime.value = time.current
    mat.uniforms.uGather.value = nightFx.gather
    // well out of view by the time it goes (the camera has turned away from it)
    const stay = 1 - MathUtils.smoothstep(templeFx.view, 0.2, 0.34)
    mat.uniforms.uFade.value = nightFx.fade * stay
    mat.uniforms.uAspect.value = w / h
    starMat.uniforms.uTime.value = time.current
    starMat.uniforms.uGather.value = nightFx.gather
    starMat.uniforms.uFade.value = nightFx.fade * stay
    starMat.uniforms.uPx.value = r.height * SPILL * viewport.dpr

    // The HTML (photo + names) follows the frozen sky's on-screen position and size.
    const compose = document.querySelector<HTMLElement>('.np-compose')
    if (compose) {
      if (!moving) {
        if (compose.style.transform) compose.style.transform = ''
        compose.style.visibility = ''
      } else {
        const c = tmpP.copy(g.position).project(camera)
        const e = tmpE.set(g.position.x, g.position.y + h / 2, g.position.z).project(camera)
        if (c.z > 1 || e.z > 1) compose.style.visibility = 'hidden'
        else {
          compose.style.visibility = ''
          const cx = (c.x * 0.5 + 0.5) * size.width
          const cy = (-c.y * 0.5 + 0.5) * size.height
          const half = Math.abs((e.y - c.y) * 0.5 * size.height)
          const restHalf = (r.height * SPILL) / 2
          const sc = half / Math.max(1, restHalf)
          const dx = cx - (r.left + r.width / 2)
          const dy = cy - (r.top + r.height / 2)
          compose.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0) scale(${sc.toFixed(4)})`
        }
      }
    }
  })

  return (
    <group ref={group} visible={false}>
      <mesh material={mat} renderOrder={20} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      {starGeo && <points geometry={starGeo} material={starMat} renderOrder={21} frustumCulled={false} />}
    </group>
  )
}
