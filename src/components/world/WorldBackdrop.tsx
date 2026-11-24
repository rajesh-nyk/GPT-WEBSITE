import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Color, MathUtils, ShaderMaterial } from 'three'
import { heroFx } from '../hero/fx'
import { CINE3, EXIT, ganeshaFx, LOTUS } from '../ganesha/fx'
import { journey } from './journey'
import { pointer } from '../../lib/pointer'
import { glowCenters } from './screenShapes'

/**
 * One full-screen background for the whole journey (fixed canvas → no seams, ever).
 * Every term is a smooth function of the *governed* timeline t, so colour changes ease
 * at a controlled speed no matter how fast the page is scrolled:
 *
 *   hero (t≈0)        DAWN AT KONARK: a night-to-ember sky over a low horizon, slow
 *                     drifting haze (texture, not a flat gradient), the last stars fading.
 *                     On arrival the sun RISES from the horizon to sit behind the wheel
 *                     (uRise 0 → 1, ~3s) — the sky warms as it climbs.
 *                     Red glow behind the wheel, breathing (9s),
 *                     and a SUN FLARE right behind the wheel (Konark is the Sun Temple):
 *                     brilliant core seen through the spokes, gold corona past the rim,
 *                     two faint counter-rotating ray sets, a soft horizontal streak.
 *                     It stays put; the wheel rises out of it and it fades in place.
 *   leaving (0→1)     the red recedes into a broad, calmer deep-wine tone
 *   Ganesha (1→2)     a warm amber halo rises behind the figure as it solidifies;
 *                     brightens gently on hover
 *   beyond (2→3)      everything settles back into the dark base
 * Dithered so the dark gradients never band on 8-bit phone screens.
 */
/** Behind the Lotus Ganesha: champagne — deep plum-black sky, antique gold glow (Rajesh, 22 Nov 2026). */
const PAL = { warm: '#1c1018', core: '#b08a5c', rayBase: '#C9A46A', rayAccent: '#EBD3A8', rayHigh: '#FFF6E6' }

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.9999, 1.0);
  }
`

const fragment = /* glsl */ `
  uniform float uAspect;
  uniform float uT;
  uniform float uBreath;
  uniform float uGanesha;      // amber halo strength (glow × presence × not-leaving)
  uniform float uGaneshaHover;
  uniform float uTime;
  uniform vec2 uHeroCenter;
  uniform vec2 uGaneshaCenter;
  uniform vec2 uSunCenter;
  uniform float uSunRadius;     // wheel radius in uv-height units
  uniform float uSun;           // flare strength (fades as the wheel leaves)
  uniform float uSunCoreFade;   // the bright core goes first, before the wheel uncovers it
  uniform float uHeroTime;
  uniform float uHeroHover;
  uniform float uRise;          // 0..1 the sunrise on arrival
  uniform vec3 uZenith;
  uniform vec3 uEmber;
  uniform vec3 uSunCore;
  uniform vec3 uSunGold;
  uniform vec3 uBase;
  uniform vec3 uRed;
  uniform vec3 uRedGlow;
  uniform vec3 uGold;
  uniform vec3 uDeep;
  uniform vec3 uWarm;
  uniform vec3 uCore;
  uniform float uRays;         // ray column strength (Ganesha fully revealed)
  uniform vec3 uRayBase;
  uniform vec3 uRayAccent;
  uniform vec3 uRayHigh;
  uniform vec2 uRayMouse;      // pointer, uv (0..1, y up)
  uniform float uRayHover;     // eased pointer presence × hover strength (preset 62%)
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + 7.1; a *= 0.5; }
    return v;
  }

  // Ray Column (Originkit, his preset: base #FFAB00, density 73, contrast 150, sweep 85,
  // falloff 150): soft shafts rising from a source below the frame, centred on Ganesha.
  // Hover: the shafts pointing at the pointer glow 5% stronger in their own colour —
  // no sharpening, no dimming either side, no colour shift. Returns display-space colour to add.
  const float RAY_PEAK = 0.7;
  const float HOVER_GAIN = 0.05; // hover: the same colour, just 5% stronger (Rajesh)
  const float HOVER_REACH = 0.10; // …and those rays reach 10% further (Rajesh)
  float rcHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 34.56); return fract(p.x * p.y); }
  float rcNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(rcHash(i), rcHash(i + vec2(1.0, 0.0)), f.x), mix(rcHash(i + vec2(0.0, 1.0)), rcHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float rcFbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { s += a * rcNoise(p); p = p * 2.07 + vec2(4.1, 2.3); a *= 0.5; } return s; }
  float rcPw(float x, float e) { return pow(max(x, 1e-5), e); }
  vec3 rayColumn(vec2 uv, float centerX) {
    const float RAYS = 7.3, CONTRAST = 1.5, SWEEP = 0.85, FALL = 1.5, APER = 0.05;
    const float PI = 3.14159265, TAU = 6.28318531;
    vec2 p = (uv - vec2(centerX, 0.5)) * vec2(uAspect, 1.0);
    float t = uTime * 0.07;
    vec2 d = p - vec2(0.0, -0.78);
    float r = max(length(d), 1e-3);
    float th = atan(d.x, d.y);

    vec2 mp = (uRayMouse - vec2(centerX, 0.5)) * vec2(uAspect, 1.0);
    vec2 md = mp - vec2(0.0, -0.78);
    float mth = atan(md.x, md.y);
    float ang = abs(mod(th - mth + PI, TAU) - PI);
    float hv = clamp(uRayHover, 0.0, 1.0);
    float open = hv * exp(-rcPw(ang / APER, 2.0));

    float v = rcFbm(vec2(th * RAYS, r * 0.9 - t * 2.4));
    v += 0.50 * rcNoise(vec2(th * RAYS * 2.4 + 3.0, r * 1.8 - t * 3.6));
    v = rcPw(clamp(v * 1.10 - 0.31, 0.0, 1.0), CONTRAST);
    float fall = FALL / (1.0 + HOVER_REACH * open);
    float env = exp(-rcPw(max(r - 0.30, 0.0) * fall, 1.5));
    float aen = exp(-rcPw(abs(th) / SWEEP, 2.0));
    float body = v * env * aen * (1.0 + HOVER_GAIN * open);
    float bloom = exp(-rcPw(max(r - 0.18, 0.0) * fall * 1.30, 1.7)) * aen * (1.0 + HOVER_GAIN * open);
    vec3 c = uRayBase * bloom * 0.90;
    c += mix(uRayBase, uRayAccent, clamp(body * 1.6, 0.0, 1.0)) * body * 2.4;
    c += uRayHigh * rcPw(clamp(body - 0.38, 0.0, 1.0), 2.0) * 1.10;
    return c;
  }

  void main() {
    vec2 ph = (vUv - uHeroCenter) * vec2(uAspect, 1.0);
    float rh = length(ph);
    vec2 pg = (vUv - uGaneshaCenter) * vec2(uAspect, 0.8);
    float rg = length(pg);

    float heroW = 1.0 - smoothstep(0.08, 1.0, uT);
    float deepW = smoothstep(0.15, 0.9, uT) * (1.0 - smoothstep(1.6, 2.5, uT));

    vec3 col = uBase;
    // Hero sky: night at the zenith, warming to ember at a low horizon as the sun rises.
    float rise = uRise;
    vec2 sunC = vec2(uSunCenter.x, mix(-0.12, uSunCenter.y, rise));
    float horizon = 0.07;
    float above = vUv.y - horizon;
    vec3 sky = mix(uEmber, uRed, smoothstep(0.0, 0.32, above));
    sky = mix(sky, uZenith, smoothstep(0.28, 1.0, above));
    sky *= mix(0.35, 1.0, rise);
    // Haze: slow, layered, lit warmer toward the sun.
    vec2 hp = vec2(vUv.x * uAspect, vUv.y) * 2.2 + vec2(uHeroTime * 0.012, uHeroTime * 0.004);
    float haze = fbm(hp) * fbm(hp * 1.7 + 3.0);
    float nearSun = exp(-length((vUv - sunC) * vec2(uAspect, 1.0)) * 2.4);
    sky += haze * mix(uRed * 0.9, uEmber * 1.6, nearSun) * (0.25 + 0.75 * rise) * 0.55;
    // Ground below the horizon: dark, barely warm.
    sky = mix(sky, uBase * 1.2 + uEmber * 0.06 * rise, smoothstep(0.02, -0.08, above));
    // The last stars, fading as the sun climbs.
    vec2 sg = floor(vUv * vec2(uAspect, 1.0) * 220.0);
    float star = step(0.9965, hash(sg)) * smoothstep(0.35, 0.9, vUv.y) * (1.0 - rise * 0.85);
    sky += vec3(0.9, 0.8, 0.65) * star * 0.18 * (0.6 + 0.4 * sin(uHeroTime * 1.3 + hash(sg + 1.0) * 30.0));
    col = mix(col, sky, heroW);
    col += uRedGlow * exp(-rh * rh * 5.5) * mix(0.45, 1.0, uBreath) * heroW * rise;
    col += uGold * exp(-rh * rh * 26.0) * mix(0.025, 0.05, uBreath) * heroW * rise;
    // Sun flare behind the wheel.
    if (uSun > 0.001) {
      vec2 ps = (vUv - sunC) * vec2(uAspect, 1.0) / uSunRadius; // 1.0 = wheel rim
      float rs = length(ps);
      float pulse = (0.9 + 0.1 * uBreath) * (1.0 + 0.25 * uHeroHover);
      float a = atan(ps.y, ps.x);
      float rot = uHeroTime * 0.03;
      float rays = pow(abs(sin(a * 9.0 + rot)), 18.0) * 0.6
                 + pow(abs(sin(a * 14.0 - rot * 1.4 + 0.7)), 26.0) * 0.4;
      vec3 sun = vec3(0.0);
      sun += uSunCore * exp(-rs * rs * 12.0) * 1.25 * uSunCoreFade;    // brilliant core (blooms)
      sun += uSunGold * exp(-rs * rs * 1.4) * 0.17;                  // corona, past the rim
      sun += uSunGold * rays * exp(-rs * 0.9) * smoothstep(0.15, 0.6, rs) * 0.15; // rays
      sun += uSunGold * exp(-abs(ps.y) * 22.0) * exp(-abs(ps.x) * 0.6) * 0.12;    // streak
      col += sun * pulse * uSun * smoothstep(0.0, 0.35, rise);
    }

    // The calmer, deeper tone the red settles into between the two.
    col += uDeep * exp(-rg * rg * 2.0) * deepW;
    // Ganesha: warm halo behind the figure, breathing very slowly.
    float b = 0.92 + 0.08 * sin(uTime * 0.7);
    float h = 1.0 + 0.45 * uGaneshaHover;
    // Once he is fully revealed the warm (reddish) halo gives way to the ray column.
    float halo = uGanesha * (1.0 - uRays);
    col += uWarm * exp(-rg * rg * 4.5) * halo * b * h;
    col += uCore * exp(-rg * rg * 18.0) * halo * b * 0.35 * (1.0 + 0.6 * uGaneshaHover);
    if (uRays > 0.001) {
      vec3 rays = rayColumn(vUv, uGaneshaCenter.x);
      // Stay behind: keep the rays under the bloom threshold (0.86) so their glow never
      // spills over the wheel and Ganesha — scale down (hue kept) above RAY_PEAK.
      float peak = max(max(rays.r, rays.g), rays.b);
      rays *= min(1.0, RAY_PEAK / max(peak, 1e-4));
      col += pow(clamp(rays, 0.0, 1.0), vec3(2.2)) * uRays;
    }

    vec3 g = pow(max(col, 0.0), vec3(1.0 / 2.2));
    g += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
    col = pow(max(g, 0.0), vec3(2.2));

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/** Hover is fully on when the pointer is there; the 5% itself is HOVER_GAIN in the shader. */
const RAY_HOVER = 1

export function WorldBackdrop({ continuous = false }: { continuous?: boolean } = {}) {
  const size = useThree((s) => s.size)
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        depthWrite: false,
        depthTest: false,
        uniforms: {
          uAspect: { value: 1 },
          uT: { value: 0 },
          uBreath: { value: 0.75 },
          uGanesha: { value: 0 },
          uGaneshaHover: { value: 0 },
          uTime: { value: 0 },
          uHeroCenter: { value: [0.5, 0.5] },
          uGaneshaCenter: { value: [0.5, 0.5] },
          uSunCenter: { value: [0.5, 0.6] },
          uSunRadius: { value: 0.2 },
          uSun: { value: 1 },
          uSunCoreFade: { value: 1 },
          uHeroTime: { value: 0 },
          uHeroHover: { value: 0 },
          uRise: { value: 1 },
          uZenith: { value: new Color('#07060d') },
          // No red on the landing page (Rajesh, 21 Nov 2026): the sky stays night-dark so the
          // galaxy stars carry it; the gold sun flare behind the wheel is kept.
          // Earlier red tones: ember #7a1f08, red #2a070b, redGlow #6e0d16, deep #1e070b.
          uEmber: { value: new Color('#0a0a0c') },
          uSunCore: { value: new Color('#fff1cf') },
          uSunGold: { value: new Color('#ffad3d') },
          uBase: { value: new Color('#0a0a0c') },
          uRed: { value: new Color('#0a0a0c') },
          uRedGlow: { value: new Color('#000000') },
          uGold: { value: new Color('#e0a84a') },
          uDeep: { value: new Color('#000000') },
          // With the Lotus Ganesha (Rajesh, 22 Nov 2026: "match and complement the lotus and its
          // glow"): a deep rose halo and blush rays instead of the red-brown and orange gold.
          uWarm: { value: new Color(LOTUS ? PAL.warm : '#4a1a08') },
          uCore: { value: new Color(LOTUS ? PAL.core : '#c47a22') },
          uRays: { value: 0 },
          uRayBase: { value: new Color(LOTUS ? PAL.rayBase : '#FFAB00') },
          uRayAccent: { value: new Color(LOTUS ? PAL.rayAccent : '#FFC14D') }, // no blue (Rajesh): warm, not the default #6EABF5
          uRayHigh: { value: new Color(LOTUS ? PAL.rayHigh : '#FFF1CF') }, // warm white, not the default #CFE4FF
          uRayMouse: { value: [0.5, 0.5] },
          uRayHover: { value: 0 },
        },
      }),
    [],
  )
  material.uniforms.uAspect.value = size.width / size.height

  const rayPtr = useRef({ x: 0.5, y: 0.5, on: 0 })

  useFrame((_, delta) => {
    const u = material.uniforms
    // Ray column aperture: follows the pointer with the component's own easing.
    const rp = rayPtr.current
    const k = 1 - Math.exp(-6 * Math.min(delta, 0.05))
    const on = pointer.active ? 1 : 0
    rp.on += (on - rp.on) * k
    rp.x += ((on ? pointer.clientX / size.width : 0.5) - rp.x) * k
    rp.y += ((on ? 1 - pointer.clientY / size.height : 0.5) - rp.y) * k
    u.uRayMouse.value = [rp.x, rp.y]
    u.uRayHover.value = Math.min(1, rp.on) * RAY_HOVER
    u.uT.value = continuous ? 0 : journey.t
    u.uBreath.value = heroFx.breath
    u.uGanesha.value = continuous || CINE3
      ? 0
      : ganeshaFx.glow * ganeshaFx.presence * (1 - ganeshaFx.leave)
    // The rays are screen-space, so they fade as the camera lifts above him.
    const away = MathUtils.smoothstep(journey.t, EXIT.up, EXIT.raysOut)
    // The living light replaces the Ray Column with the Lotus Ganesha (design 2026-11-22).
    u.uRays.value = continuous || LOTUS ? 0 : ganeshaFx.rays * ganeshaFx.presence * (1 - ganeshaFx.leave) * (1 - away)
    u.uGaneshaHover.value = ganeshaFx.hover
    u.uTime.value = ganeshaFx.time
    u.uHeroCenter.value = glowCenters.hero
    u.uGaneshaCenter.value = glowCenters.ganesha
    u.uSunCenter.value = glowCenters.sun
    u.uSunRadius.value = Math.max(glowCenters.sunRadius, 0.01)
    u.uSun.value = continuous ? 1 : 1 - MathUtils.smootherstep(journey.t, 0.05, 0.6)
    u.uSunCoreFade.value = continuous ? 1 : 1 - MathUtils.smootherstep(journey.t, 0.02, 0.22)
    u.uHeroTime.value = heroFx.time
    u.uHeroHover.value = heroFx.hover
    u.uRise.value = heroFx.rise
  })

  return (
    <mesh renderOrder={-1000} frustumCulled={false} material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  )
}
