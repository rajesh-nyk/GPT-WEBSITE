import { Environment, Lightformer } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { Group, MathUtils, Mesh, Vector2, Vector3, type BufferAttribute, type BufferGeometry, type MeshLambertMaterial, type MeshStandardMaterial, type Object3D, type Points, type ShaderMaterial } from 'three'
import { ScrollTrigger } from '../../lib/gsap'
import { useReducedMotion } from '../../lib/useReducedMotion'
import { Model, modelMetalnessMap } from '../Model'
import { Prewarm } from '../three/Prewarm'
import { SceneCanvas } from '../three/SceneCanvas'
import { ganeshaPose, ganeshaPoseGLSL, lotusGrade, makeOrnamentGlints, ornamentSweep, ornamentSweepGLSL } from './lotus/appearance'
import { LOTUS_H, LOTUS_PIVOT, LOTUS_R } from './lotus/layout'
import { splitByPart } from './lotus/parts'
import { CLOUDS_ENABLED, PageTwoClouds, cloudFade } from './PageTwoClouds'

type LotusMesh = Mesh<BufferGeometry, MeshStandardMaterial | MeshLambertMaterial>
const PETALS = 'lotus-petals'
const GANESHA = 'ganesha-figure'
const SEAT = 'ganesha-seat'
const GLINTS = 'ganesha-ornament-glints'
const ENTRY_ANGLE = MathUtils.degToRad(-12)
const EXIT_ANGLE = MathUtils.degToRad(28)
const EXIT_ROTATION_RESPONSE = 16
const FIGURE_GLOW = 0.31
const PETAL_GLOW = 0.30
// With the clouds (default; off with ?clouds=0): a gentler glow and light on him, so he sits in the same tonal range
// as the clouds behind him instead of glaring against them.
const CLOUD_TONE = CLOUDS_ENABLED ? 0.6 : 1
// Approved aura is now the default. Use aura=0 for the original scene.
const AURA_ENABLED = typeof window === 'undefined' ||
  new URLSearchParams(window.location.search).get('aura') !== '0'
// Preview ?mantra-rise: the invocation is drawn huge (edge to edge), with a faint glow,
// and rises up from below the bottom edge instead of a 12px nudge.
const MANTRA_RISE = typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('mantra-rise')
// Preview ?mantra-rise: each mantra line sits on a frosted-glass plate.
const GLASS = MANTRA_RISE ? {
  width: '100%',
  padding: '3dvh 0',
  borderRadius: 0,
  background: 'linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01))',
  borderBlock: '0.25px solid rgba(255, 255, 255, 0.2)',
  WebkitBackdropFilter: 'blur(6px)',
  backdropFilter: 'blur(6px)',
} as const : {}
// Preview ?mantra-rise: letters filled with see-through glass (a faint white sheen,
// brighter at the top, plus a thin light edge) instead of solid colour.
const GLASS_TEXT = MANTRA_RISE ? {
  color: 'transparent',
  backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.14) 55%, rgba(255,255,255,0.08) 100%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  WebkitTextStroke: '1px rgba(255,255,255,0.55)',
  textShadow: 'none',
} as const : {}
const AURA_SETTINGS = { aura: 0.22, rays: 0.36, lotus: 0.21 } as const
// Optional comparison: shine=0 removes the warm highlight within the shafts.
const RAY_SHINE = typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('shine') !== '0' ? 1 : 0
// Approved flowing mist is enabled by default; use ?mist=0 to compare.
const MIST_ENABLED = typeof window === 'undefined' ||
  new URLSearchParams(window.location.search).get('mist') !== '0'
// Approved default: #AB6EFA tint at 26% intensity. URL preview controls
// remain available for reversible comparisons without changing the main design.
const mistQuery = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
const mistHex = (mistQuery?.get('mistColor') ?? 'AB6EFA').replace(/^#/, '')
const customMistColor = /^[0-9a-f]{6}$/i.test(mistHex)
const mistColorNumber = customMistColor ? Number.parseInt(mistHex, 16) : 0xab6efa
const mistTint = new Vector3(
  ((mistColorNumber >> 16) & 255) / 255,
  ((mistColorNumber >> 8) & 255) / 255,
  (mistColorNumber & 255) / 255,
)
const mistLevel = mistQuery?.get('mistIntensity')
const mistPercent = mistLevel == null || mistLevel.trim() === '' ? 26 : Number(mistLevel)
const MIST_STRENGTH = (Number.isFinite(mistPercent) ? MathUtils.clamp(mistPercent, 0, 100) : 26) / 65
const lotusAuraGlow = { value: 0 }
const mistWrap = { value: 0 }
const arrivalLighting = { value: new Vector2(0, 0) }

const AURA_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying float vScreenTop;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vScreenTop = 0.5 - 0.5 * gl_Position.y / gl_Position.w;
  }
`

// One bounded billboard: soft golden backlight and scattered shafts.
// Normal alpha blending is intentional: this canvas is composited over a
// separate galaxy canvas, so the stars remain visible through the light.
const AURA_FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  varying float vScreenTop;
  uniform float uTime, uFade, uAura, uRays, uLotus, uShine;
  float cloud(vec2 p) {
    return 0.5 + 0.5 * sin(p.x * 5.7 + sin(p.y * 4.4))
                       * cos(p.y * 6.1 - sin(p.x * 3.3));
  }
  float scatteredShaft(vec2 p, vec2 direction, float width, float reach) {
    float along = dot(p, direction);
    float across = dot(p, vec2(-direction.y, direction.x));
    float spread = across / (width + max(along, 0.0) * 0.17);
    return exp(-spread * spread) * smoothstep(-0.024, 0.03, along)
      * (1.0 - smoothstep(0.048, reach, along));
  }

  void main() {
    // Local coordinates in the same units as the original scanned model.
    vec2 p = (vUv - 0.5) * vec2(0.90, 0.55);
    vec2 head = p - vec2(0.0, 0.085);
    float breathe = 0.94 + 0.06 * sin(uTime * 0.85);
    float halo = uAura * breathe * (
      0.62 * exp(-dot(head, head) / 0.0036) +
      0.34 * exp(-dot(head, head) / 0.021)
    );
    vec2 q = head * 8.0;
    float mist = 0.55 * cloud(q + vec2(uTime * 0.045, 0.0))
               + 0.45 * cloud(q * 1.8 + vec2(0.0, -uTime * 0.035));
    // Broad shafts start at different points behind the crown and fade through the haze.
    float shafts = 0.64 * scatteredShaft(head - vec2(-0.021, 0.005), vec2(-0.76, 0.65), 0.015, 0.268)
                 + 0.46 * scatteredShaft(head - vec2(0.003, 0.016), vec2(-0.17, 0.985), 0.011, 0.205)
                 + 0.54 * scatteredShaft(head - vec2(0.029, -0.012), vec2(0.935, 0.355), 0.018, 0.285);
    float scattering = mix(0.26, 1.0, smoothstep(0.14, 0.77, mist));
    float rays = uRays * shafts * scattering * breathe;
    float shine = uShine * rays * 0.32 * exp(-dot(head, head) / 0.014);
    // A broad, soft pink-gold reflection under the petal roots.
    vec2 lower = (p - vec2(0.0, -0.105)) / vec2(0.19, 0.075);
    float lotus = uLotus * 0.66 * exp(-dot(lower, lower)) * breathe;
    float edge = (1.0 - smoothstep(0.32, 0.50, abs(vUv.x - 0.5)))
               * (1.0 - smoothstep(0.32, 0.50, abs(vUv.y - 0.5)));
    float energy = halo + rays + lotus + shine;
    vec3 light = halo * vec3(1.0, 0.66, 0.30)
               + rays * vec3(1.0, 0.77, 0.42)
               + shine * vec3(1.0, 0.94, 0.76)
               + lotus * vec3(1.0, 0.58, 0.53);
    vec3 color = light / max(energy, 0.0001);
    float alpha = (1.0 - exp(-energy * 1.45)) * edge * uFade;
    // The rear atmosphere must taper into the sky that overlaps the previous chapter.
    gl_FragColor = vec4(color, alpha * smoothstep(0.0, 0.18, vScreenTop));
  }
`

// A shallow layer in front of the lotus ties the rear atmosphere to the figure.
const FOREGROUND_MIST_FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  uniform float uFade, uMistTime, uMistStrength;
  uniform vec3 uMistTint;

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float t = uMistTime * 0.16;
    float low = (p.y + 0.16 + sin(p.x * 4.5 - t) * 0.22) / 0.25;
    float high = (p.y - 0.14 + sin(p.x * 5.5 + t * 0.68 + 1.9) * 0.17) / 0.19;
    float bank = 0.68 * exp(-low * low) + 0.32 * exp(-high * high);
    float drift = 0.61 + 0.25 * sin(p.x * 7.0 + p.y * 3.1 - t * 1.4)
      + 0.14 * sin(p.x * 15.0 - p.y * 4.0 + t);
    float edge = (1.0 - smoothstep(0.55, 1.0, abs(p.x)))
      * (1.0 - smoothstep(0.52, 1.0, abs(p.y)));
    float sides = mix(0.52, 1.0, smoothstep(0.06, 0.62, abs(p.x)));
    float alpha = clamp(bank * drift * edge * sides * uMistStrength * uFade * 0.94, 0.0, 0.24);
    vec3 color = mix(vec3(0.56, 0.43, 0.74), uMistTint, 0.55);
    gl_FragColor = vec4(color, alpha);
  }
`
const SWAY_ANGLE = MathUtils.degToRad(1.2)
const SEAT_HEIGHT = 0.08
const FRAMING_ASPECT_LIMIT = 1.16
const FULL_LENS = 2 * Math.tan(MathUtils.degToRad(35 / 2))
const petalBreath = new WeakMap<LotusMesh['material'], { value: number }>()
export const ganeshaPosition = { sample: null as (() => Vector3 | null) | null }

/**
 * With the clouds (default; off with ?clouds=0): Ganesha and the lotus condense into being like the clouds do — they
 * form out of cloud-like wisps from his heart outward, with a soft gold edge where they
 * are still forming. Shape only: his rotation and pose are untouched. 1 = whole (the
 * effect is skipped entirely), 0 = not yet formed.
 */
// Starts unformed under ?clouds, so he never begins whole and dissolves first.
const condense = { value: CLOUDS_ENABLED ? 0 : 1 }
const CONDENSE_GLSL = /* glsl */ `
  uniform float uCondense;
  varying vec3 vCondensePos;
  float condenseHash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float condenseNoise(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(condenseHash(i), condenseHash(i + vec3(1, 0, 0)), f.x),
                   mix(condenseHash(i + vec3(0, 1, 0)), condenseHash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(condenseHash(i + vec3(0, 0, 1)), condenseHash(i + vec3(1, 0, 1)), f.x),
                   mix(condenseHash(i + vec3(0, 1, 1)), condenseHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  // How far this point is from being formed: >0 still wisp, <0 formed.
  float condenseEdge() {
    vec3 p = vCondensePos;
    float n = 0.5 * condenseNoise(p * 60.0) + 0.3 * condenseNoise(p * 140.0) + 0.2 * condenseNoise(p * 320.0);
    float reach = length((p - vec3(0.0, 0.15, 0.0)) * vec3(1.0, 1.25, 1.0)) / 0.26;
    return uCondense * 1.5 - (reach + (n - 0.5) * 0.7);
  }
`
function applyCondense(shader: { uniforms: Record<string, { value: unknown }>; vertexShader: string; fragmentShader: string }) {
  shader.uniforms.uCondense = condense
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vCondensePos;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCondensePos = position;')
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${CONDENSE_GLSL}`)
    .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      float condenseLeft = 1.0;
      if (uCondense < 0.999) {
        condenseLeft = condenseEdge();
        if (condenseLeft < 0.0) discard;
      }`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      // The forming edge glows faintly, in the clouds' lavender-gold.
      totalEmissiveRadiance += vec3(0.62, 0.48, 0.55) * 0.3 * (1.0 - smoothstep(0.0, 0.05, condenseLeft)) * step(uCondense, 0.999);`)
}

function gradePetals(material: LotusMesh['material']) {
  const opening = { value: 0 }
  petalBreath.set(material, opening)
  material.customProgramCacheKey = () => AURA_ENABLED ? 'page-two-lotus-blush-breath-aura' : 'page-two-lotus-blush-breath'
  material.onBeforeCompile = (shader) => {
    applyCondense(shader)
    shader.uniforms.uPetalBreath = opening
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPetalPosition;\nvarying vec3 vPetalNormal;\nuniform float uPetalBreath;')
      .replace('#include <begin_vertex>', /* glsl */ `
        #include <begin_vertex>
        vPetalPosition = position;
        vPetalNormal = normal;
        // The outermost join vertex is at radius 0.126. Flex only past the join.
        float tip = smoothstep(0.129, 0.20, length(position.xz)) * smoothstep(0.025, 0.09, position.y);
        transformed.xz += position.xz * (0.052 * tip * uPetalBreath);
        transformed.y -= 0.009 * tip * uPetalBreath;
      `)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vPetalPosition;\nvarying vec3 vPetalNormal;\n${lotusGrade}`)
      .replace('#include <map_fragment>', /* glsl */ `
        #include <map_fragment>
        float radius = length(vPetalPosition.xz);
        float exposure = radius * 0.78 + max(vPetalPosition.y, 0.0) * 0.48;
        float openPetal = smoothstep(0.048, 0.158, exposure);
        vec3 petalShade = mix(vec3(0.69, 0.54, 0.62), vec3(0.97, 0.92, 0.94), openPetal);
        // Shade the inward-facing folds under the exposed petal tips.
        vec2 radial = vPetalPosition.xz / max(radius, 0.0001);
        float inward = max(0.0, -dot(normalize(vPetalNormal).xz, radial));
        float folds = smoothstep(0.08, 0.7, inward) * (1.0 - smoothstep(0.105, 0.184, radius));
        // The seated figure meets the inner bowl above the petal roots.
        float seatRadius = length((vPetalPosition.xz - vec2(0.0, 0.012)) / vec2(0.118, 0.089));
        float seatShadow = (1.0 - smoothstep(0.46, 1.25, seatRadius))
          * smoothstep(0.034, 0.072, vPetalPosition.y);
        float petalContact = clamp(max(folds * 0.64, seatShadow), 0.0, 1.0);
        petalShade *= mix(vec3(1.0), vec3(0.60, 0.46, 0.52), petalContact);
        // Curved radial veins run from the bowl toward the tips. Fade the fine
        // lines when they are smaller than a pixel to keep them stable in motion.
        float angle = atan(vPetalPosition.z, vPetalPosition.x + 0.000001);
        float veinPhase = angle * 112.0 + 1.25 * sin(angle * 9.0 + exposure * 31.0);
        float veinWave = cos(veinPhase);
        float veinDetail = 1.0 - smoothstep(0.45, 1.7, fwidth(veinPhase));
        float veins = smoothstep(0.60, 0.96, veinWave) * veinDetail;
        float ridges = smoothstep(0.38, 0.93, -veinWave) * veinDetail;
        float grain = sin(angle * 19.0 + exposure * 53.0);
        float textureFade = smoothstep(0.048, 0.094, exposure)
          * (1.0 - 0.78 * smoothstep(0.155, 0.21, exposure));
        vec3 variation = vec3(0.065, 0.086, 0.073) * ridges
          - vec3(0.13, 0.18, 0.15) * veins + vec3(0.019, 0.037, 0.024) * grain;
        petalShade *= 1.0 + variation * textureFade;
        float frontPetal = smoothstep(0.102, 0.147, vPetalPosition.z)
          * (1.0 - smoothstep(0.020, 0.054, abs(vPetalPosition.x)))
          * smoothstep(0.030, 0.055, vPetalPosition.y);
        petalShade *= 1.0 - 0.16 * frontPetal;
        diffuseColor.rgb = lotusGrade(diffuseColor.rgb, vPetalPosition) * petalShade;
      `)
      .replace('#include <emissivemap_fragment>', /* glsl */ `
        #include <emissivemap_fragment>
        totalEmissiveRadiance *= 1.0 - 0.62 * petalContact;
        totalEmissiveRadiance *= 1.0 - 0.18 * frontPetal;
      `)
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

function animateFigure(material: LotusMesh['material'], metalMask = modelMetalnessMap(material)) {
  material.customProgramCacheKey = () => 'page-two-ganesha-pose'
  material.onBeforeCompile = (shader) => {
    applyCondense(shader)
    Object.assign(shader.uniforms, ganeshaPose)
    shader.uniforms.uMistWrap = mistWrap
    shader.uniforms.uPortraitMistTint = { value: mistTint }
    shader.uniforms.uOrnamentMask = { value: metalMask }
    shader.uniforms.uArrivalLight = arrivalLighting
    shader.uniforms.uOrnamentSweep = ornamentSweep
    const portraitVaryings = /* glsl */ `
      varying float vSeatShade, vPortraitLight, vPortraitSheen, vOrnament, vGarment, vBowl, vSweets;
      varying vec3 vPortraitNormal;
      varying float vFigureHeight;
    `
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${portraitVaryings}\n${ganeshaPoseGLSL}`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = ganeshaPoseNormal(objectNormal, position);')
      .replace('#include <begin_vertex>', /* glsl */ `
        #include <begin_vertex>
        transformed = ganeshaPosePoint(position);
        vFigureHeight = position.y;
        vSeatShade = 1.0 - smoothstep(0.08, 0.148, position.y);
        vGarment = 1.0 - smoothstep(0.135, 0.153, position.y);
        // Keep the broad portrait key anchored to the view during the figure's turn.
        vec3 portraitNormal = normalize(normalMatrix * objectNormal);
        vec3 keyDirection = normalize(vec3(-0.57, 0.38, 0.73));
        float facingKey = dot(portraitNormal, keyDirection);
        float keyLight = smoothstep(0.08, 0.95, facingKey);
        vPortraitLight = keyLight * mix(0.70, 1.0, smoothstep(0.124, 0.214, position.y));
        // Light from the halo catches the upper contours as well as the front of the crown.
        float grazing = 1.0 - abs(portraitNormal.z);
        float rim = smoothstep(0.30, 0.84, grazing) * smoothstep(-0.07, 0.62, facingKey);
        float crown = smoothstep(0.180, 0.272, position.y);
        vPortraitSheen = (rim * 0.82 + smoothstep(0.58, 0.97, facingKey) * 0.42)
          * mix(0.08, 1.0, crown);
        vPortraitNormal = portraitNormal;
        float crownMetal = smoothstep(0.229, 0.254, position.y) * (1.0 - smoothstep(0.037, 0.061, abs(position.x)));
        float axeMetal = smoothstep(0.064, 0.086, -position.x) * smoothstep(0.194, 0.221, position.y);
        float bowlX = smoothstep(0.047, 0.054, position.x) * (1.0 - smoothstep(0.073, 0.081, position.x));
        vBowl = bowlX * smoothstep(0.149, 0.155, position.y) * (1.0 - smoothstep(0.159, 0.162, position.y));
        vSweets = bowlX * smoothstep(0.160, 0.163, position.y) * (1.0 - smoothstep(0.172, 0.177, position.y));
        float jewelry = (1.0 - smoothstep(0.043, 0.065, abs(position.x)))
          * smoothstep(0.120, 0.139, position.y) * (1.0 - smoothstep(0.158, 0.181, position.y));
        float wrist = smoothstep(0.077, 0.091, abs(position.x)) * smoothstep(0.142, 0.156, position.y)
          * (1.0 - smoothstep(0.169, 0.183, position.y));
        vOrnament = max(max(crownMetal, axeMetal), max(jewelry, wrist));
      `)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */ `
        #include <common>
        ${portraitVaryings}
        ${ornamentSweepGLSL}
        uniform float uMistWrap;
        uniform vec3 uPortraitMistTint;
        uniform sampler2D uOrnamentMask;
        uniform vec2 uArrivalLight;
      `)
      .replace('#include <map_fragment>', /* glsl */ `
        #include <map_fragment>
        vec3 pigment = diffuseColor.rgb;
        float luminance = dot(pigment, vec3(0.2126, 0.7152, 0.0722));
        // Mute high-chroma orange and gold while holding the reds in the painted details.
        float orange = smoothstep(0.10, 0.49, pigment.r - pigment.b)
          * smoothstep(0.035, 0.23, pigment.g - pigment.b);
        float bakedMetal = 0.0;
        #ifdef USE_MAP
          bakedMetal = texture2D(uOrnamentMask, vMapUv).b;
        #endif
        float ornamentMetal = vOrnament * smoothstep(0.59, 0.73, bakedMetal);
        float bowlMetal = vBowl * smoothstep(0.54, 0.63, bakedMetal);
        float metal = max(ornamentMetal, bowlMetal) * (1.0 - vSweets);
        pigment = mix(vec3(luminance), pigment, mix(0.96, 0.62, orange));
        // Select the original ochre and red fabric pigments below the waist.
        // The texture luminance carries the folds through to the new colors.
        vec3 originalCloth = diffuseColor.rgb;
        float dhoti = vGarment * (1.0 - smoothstep(0.034, 0.105,
          distance(originalCloth, vec3(0.241, 0.127, 0.054))));
        float sash = vGarment * smoothstep(0.10, 0.21, originalCloth.r)
          * (1.0 - smoothstep(0.046, 0.11, originalCloth.g));
        vec3 saffron = vec3(0.84, 0.55, 0.045) * clamp(luminance / 0.152, 0.42, 1.25);
        vec3 crimson = vec3(0.58, 0.022, 0.039) * clamp(originalCloth.r / 0.27, 0.40, 1.25);
        pigment = mix(mix(pigment, saffron, dhoti), crimson, sash * 0.82);
        vec3 portraitShade = mix(vec3(0.63, 0.59, 0.65), vec3(1.06, 1.035, 1.0), vPortraitLight);
        float upperFigure = smoothstep(0.147, 0.210, vFigureHeight);
        float revealLight = mix(uArrivalLight.y, uArrivalLight.x, upperFigure);
        diffuseColor.rgb = pigment * portraitShade * (1.0 - 0.28 * vSeatShade) * mix(0.46, 1.0, revealLight);
      `)
      .replace('#include <roughnessmap_fragment>', /* glsl */ `
        #include <roughnessmap_fragment>
        roughnessFactor = mix(0.72 - 0.20 * vPortraitSheen, 0.98, roughnessFactor);
        roughnessFactor = mix(roughnessFactor, 0.25, metal * 0.90);
        roughnessFactor = mix(roughnessFactor, 0.96, vSweets);
      `)
      .replace('#include <metalnessmap_fragment>', /* glsl */ `
        #include <metalnessmap_fragment>
        metalnessFactor = mix(metalnessFactor * 0.26, 0.78, metal * 0.88);
      `)
      .replace('#include <emissivemap_fragment>', /* glsl */ `
        #include <emissivemap_fragment>
        totalEmissiveRadiance *= mix(0.67, 1.02, vPortraitLight) * (1.0 - 0.42 * vSeatShade);
        totalEmissiveRadiance += emissive * (0.82 * vPortraitSheen);
        // Two small reflections also give the Lambert tier a sharp metallic highlight.
        vec3 reflectionNormal = normalize(vPortraitNormal);
        float keyReflection = pow(max(0.0, dot(reflectionNormal, normalize(vec3(-0.26, 0.33, 0.91)))), 20.0);
        float sideReflection = pow(max(0.0, dot(reflectionNormal, normalize(vec3(0.43, 0.21, 0.88)))), 34.0);
        float lightSweep = 1.0 + 0.60 * arrivalGlint(vFigureHeight);
        totalEmissiveRadiance += emissive * metal * (2.7 * keyReflection + 1.6 * sideReflection) * lightSweep;
        totalEmissiveRadiance *= 1.0 - 0.55 * vSweets;
        float silhouette = smoothstep(0.30, 0.82, 1.0 - abs(reflectionNormal.z));
        float mistSide = smoothstep(0.07, 0.79, reflectionNormal.x);
        totalEmissiveRadiance += uPortraitMistTint * (0.26 * uMistWrap * silhouette * mistSide);
      `)
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
  figure.material.emissive.set('#f1dec8')
  figure.material.emissiveMap = figure.material.map
  figure.material.emissiveIntensity = 0
  if ('metalness' in figure.material) figure.material.metalness = 0.38
  animateFigure(figure.material, modelMetalnessMap(petals.material))
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
  const foregroundMist = useRef<ShaderMaterial>(null)
  const auraUniforms = useMemo(() => ({
    uTime: { value: 0 }, uFade: { value: 0 },
    uAura: { value: AURA_SETTINGS.aura }, uRays: { value: AURA_SETTINGS.rays },
    uLotus: { value: AURA_SETTINGS.lotus },
    uShine: { value: RAY_SHINE },
  }), [])
  const foregroundUniforms = useMemo(() => ({
    uFade: { value: 0 }, uMistTime: { value: 0 },
    uMistStrength: { value: MIST_STRENGTH }, uMistTint: { value: mistTint },
  }), [])
  const entry = useRef<ScrollTrigger | null>(null)
  const exit = useRef<ScrollTrigger | null>(null)
  const idleTime = useRef(0)
  const mistTime = useRef(0)
  const painted = useRef(false)
  const haloPoint = useRef(new Vector2()).current
  const facePoint = useRef(new Vector3()).current
  const modelPoint = useRef(new Vector3()).current
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

  useFrame(({ viewport }, delta) => {
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
    const inhale = (0.5 - 0.5 * Math.cos(idleTime.current * 2 * Math.PI / 5.6)) * idle
    const sway = Math.sin(idleTime.current * 2 * Math.PI / 9) * SWAY_ANGLE * idle
    const bodyWidth = 1 + inhale * 0.008
    ganeshaPose.uFigureTurn.value = turn
    ganeshaPose.uFigureSway.value = sway
    ganeshaPose.uFigureStretch.value.set(bodyWidth, 1 + inhale * 0.024)
    const opening = petalBreath.get(petals.material)
    // Hover removed (his request, 25 Nov 2026): the petals stay at rest.
    if (opening) opening.value = 0
    // Stagger the portrait, the metal catchlights, and the invocation on the paced scroll.
    const faceLight = MathUtils.smootherstep(progress, 0.31, 0.55)
    const bodyLight = MathUtils.smootherstep(progress, 0.46, 0.82)
    arrivalLighting.value.set(faceLight, bodyLight)
    const glintTravel = MathUtils.smoothstep(progress, 0.54, 0.78)
    const arrivalShine = MathUtils.smoothstep(progress, 0.51, 0.57)
      * (1 - MathUtils.smoothstep(progress, 0.75, 0.81))
    ornamentSweep.value.set(glintTravel, arrivalShine)
    const exitFade = 1 - MathUtils.smoothstep(departureProgress, 0, 0.90)
    const fade = MathUtils.smoothstep(progress, 0.27, 0.85) * exitFade
    cloudFade.value = fade
    cloudFade.progress = progress
    cloudFade.exit = exitFade
    // He condenses as page 2 arrives and thins away on exit.
    // Slow (his ask): spread over most of the arrival, and never faster than about 4.5 s to
    // form however fast the scroll moves (reversing may be quicker).
    if (CLOUDS_ENABLED && !reducedMotion) {
      const target = MathUtils.smoothstep(progress, 0.08, 0.96) * MathUtils.smoothstep(exitFade, 0.0, 1.0)
      const step = (target > condense.value ? 0.22 : 0.8) * dt
      condense.value += MathUtils.clamp(target - condense.value, -step, step)
      if (condense.value !== target) invalidate()
    } else condense.value = 1
    if (invocation.current) {
      const spreadFade = MathUtils.smoothstep(progress, 0.35, 0.96) * exitFade
      const titleFade = MathUtils.smoothstep(progress, 0.59, 0.73) * exitFade
      const opacity = (MANTRA_RISE ? spreadFade : titleFade).toFixed(3)
      const frameMorphEnabled = MANTRA_BORDER && !MANTRA_RISE
      const footerOpacity = MANTRA_RISE || frameMorphEnabled ? '1' : opacity
      if (frameMorphEnabled) {
        const el = invocation.current
        if (el.style.getPropertyValue('--mantra-text-opacity') !== opacity) {
          el.style.setProperty('--mantra-text-opacity', opacity)
        }
        const reveal = MathUtils.smootherstep(progress, 0.58, 0.94)
          * (1 - MathUtils.smootherstep(departureProgress, 0.03, 0.88))
        const morph = reducedMotion ? (titleFade > 0.5 ? 1 : 0) : reveal
        const key = morph.toFixed(3)
        if (el.style.getPropertyValue('--mantra-frame-morph') !== key) {
          el.style.setProperty('--mantra-frame-morph', key)
          el.style.setProperty('--mantra-frame-visibility', morph > 0.002 ? 'visible' : 'hidden')
          el.style.setProperty('--mantra-flow-play', morph > 0.25 && !reducedMotion ? 'running' : 'paused')
          el.style.setProperty('--mantra-flow-opacity', MathUtils.smoothstep(morph, 0.25, 0.7).toFixed(3))
          const shape = mantraFramePath(morph)
          el.querySelectorAll<SVGPathElement>('[data-mantra-frame-shape]').forEach(node => node.setAttribute('d', shape))
          el.querySelector<SVGGElement>('[data-mantra-frame-ornaments]')?.setAttribute('transform',
            `translate(170 60) scale(${0.08 + 0.92 * morph} ${0.03 + 0.97 * morph}) translate(-170 -60)`)
        }
      }
      if (invocation.current.style.opacity !== footerOpacity || (MANTRA_RISE && invocation.current.style.getPropertyValue('--mantra-spread') !== opacity)) {
        if (MANTRA_RISE) invocation.current.style.setProperty('--mantra-spread', opacity)
        invocation.current.style.opacity = footerOpacity
        if (MANTRA_RISE) {
          // Each word rises out of its own line in turn; a light sweep crosses the letters.
          const el = invocation.current
          ;[0, 1, 2].forEach((i) => {
            const k = MathUtils.smoothstep(spreadFade, i * 0.16, i * 0.16 + 0.6)
            el.style.setProperty(`--r${i}`, (1 - k).toFixed(3))
          })
          el.style.setProperty('--sw', (1 - MathUtils.smoothstep(spreadFade, 0.25, 1)).toFixed(3))
        }
      }
      if (!MANTRA_RISE && !reducedMotion) {
        const fragments = MathUtils.smootherstep(progress, 0.63, 0.81).toFixed(3)
        const fill = MathUtils.smootherstep(progress, 0.76, 0.91).toFixed(3)
        const romanization = MathUtils.smootherstep(progress, 0.84, 0.95).toFixed(3)
        const style = invocation.current.style
        if (style.getPropertyValue('--mantra-fragments') !== fragments) {
          style.setProperty('--mantra-fragments', fragments)
        }
        if (style.getPropertyValue('--mantra-fill') !== fill) style.setProperty('--mantra-fill', fill)
        if (style.getPropertyValue('--mantra-romanization') !== romanization) {
          style.setProperty('--mantra-romanization', romanization)
        }
      }
    }
    if (AURA_ENABLED && auraMaterial.current) {
      auraMaterial.current.uniforms.uFade.value = fade
      auraMaterial.current.uniforms.uAura.value = AURA_SETTINGS.aura * (1 + 0.24 * arrivalShine)
      auraMaterial.current.uniforms.uTime.value = reducedMotion ? 0 : idleTime.current
      if (MIST_ENABLED) {
        if (!reducedMotion && fade > 0) {
          mistTime.current += dt
          invalidate()
        }
        if (foregroundMist.current) {
          foregroundMist.current.uniforms.uFade.value = fade
          foregroundMist.current.uniforms.uMistTime.value = reducedMotion ? 0 : mistTime.current
        }
        mistWrap.value = MIST_STRENGTH * fade
      }
      lotusAuraGlow.value = AURA_SETTINGS.lotus * fade * (0.96 + 0.04 * inhale)
    }
    petals.material.emissiveIntensity = bodyLight * PETAL_GLOW * CLOUD_TONE
    figure.material.emissiveIntensity = MathUtils.lerp(faceLight, bodyLight, 0.62) * FIGURE_GLOW * CLOUD_TONE
    const glints = figure.getObjectByName(GLINTS) as Points<BufferGeometry, ShaderMaterial> | undefined
    if (glints) {
      glints.material.uniforms.uGlow.value = MathUtils.smoothstep(progress, 0.49, 0.63) * condense.value
      glints.material.uniforms.uDpr.value = viewport.dpr
      glints.material.uniforms.uTime.value = reducedMotion ? 0 : idleTime.current
      glints.material.uniforms.uOrnamentSweep.value.copy(ornamentSweep.value)
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
  const mistDepth = 0.225 * scale
  const mistPerspective = (6 - mistDepth) / 6

  return (
    <>
      {CLOUDS_ENABLED && <PageTwoClouds
        light={haloPoint.set(0, (0.235 - LOTUS_PIVOT.y) * scale)}
        face={facePoint.set(0, (0.205 - LOTUS_PIVOT.y) * scale, 0.06 * scale)}
        model={modelPoint.set(0, (0.15 - LOTUS_PIVOT.y) * scale, 0)}
      />}
      {AURA_ENABLED && (
        <mesh
          position={[0, (0.15 - LOTUS_PIVOT.y) * scale * auraPerspective, -auraDepth]}
          renderOrder={-1}
        >
          <planeGeometry args={[0.90 * scale * auraPerspective, 0.55 * scale * auraPerspective]} />
          <shaderMaterial
            ref={auraMaterial}
            uniforms={auraUniforms}
            vertexShader={AURA_VERTEX}
            fragmentShader={AURA_FRAGMENT}
            transparent
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}
      {AURA_ENABLED && MIST_ENABLED && MIST_STRENGTH > 0 && (
        <mesh
          position={[0, (0.052 - LOTUS_PIVOT.y) * scale * mistPerspective, mistDepth]}
          renderOrder={2}
        >
          <planeGeometry args={[0.66 * scale * mistPerspective, 0.129 * scale * mistPerspective]} />
          <shaderMaterial
            ref={foregroundMist}
            uniforms={foregroundUniforms}
            vertexShader={AURA_VERTEX}
            fragmentShader={FOREGROUND_MIST_FRAGMENT}
            transparent
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}
      <Environment frames={1} resolution={64} environmentIntensity={0.55 * CLOUD_TONE}>
        <Lightformer position={[-3, 3, 4]} target={[0, 0, 0]} scale={[4, 3, 1]} intensity={2} color="#ffe7cb" />
        <Lightformer position={[3, 2, -4]} target={[0, 0, 0]} scale={[2, 4, 1]} intensity={1.5} color="#c7b6ff" />
      </Environment>
      <hemisphereLight args={['#fff0d8', '#503042', 1.1 * CLOUD_TONE]} />
      <directionalLight position={[-3, 4, 5]} intensity={2.1 * CLOUD_TONE} color="#ffe6cc" />
      <directionalLight position={[3, 2, -3]} intensity={1.4} color="#ffbc80" />
      <group ref={model} scale={scale} position={[0, -LOTUS_PIVOT.y * scale, 0]}>
        <Model src="lotus-ganesha.glb" customize={prepareLotus} castShadow={false} receiveShadow={false}>
          <Prewarm models={[]} />
        </Model>
      </group>
    </>
  )
}

const MANTRA_BORDER = typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('mantra-border') !== '0'
const MANTRA_GLOW = typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('mantra-glow') !== '0'
const mantraGlowStyle = {
  textShadow: 'none',
  filter: 'drop-shadow(0 0 2px rgb(255 218 145 / .72)) drop-shadow(0 0 4px rgb(255 183 74 / .32))',
} as const

// Morph the actual contour from a compact rounded ribbon into the finished frame.
function mantraFramePath(t: number) {
  const sx = 0.08 + 0.92 * t
  const sy = 0.03 + 0.97 * t
  const pt = (x: number, y: number) => `${(170 + (x - 170) * sx).toFixed(3)} ${(60 + (y - 60) * sy).toFixed(3)}`
  return `M${pt(7,60)}C${pt(7,22)} ${pt(31,13)} ${pt(64,13)}L${pt(135,13)}Q${pt(157,13)} ${pt(170,13-9*t)}Q${pt(183,13)} ${pt(205,13)}L${pt(276,13)}C${pt(309,13)} ${pt(333,22)} ${pt(333,60)}C${pt(333,98)} ${pt(309,107)} ${pt(276,107)}L${pt(205,107)}Q${pt(183,107)} ${pt(170,107+9*t)}Q${pt(157,107)} ${pt(135,107)}L${pt(64,107)}C${pt(31,107)} ${pt(7,98)} ${pt(7,60)}Z`
}

function MantraRoyalFrame() {
  return (
    <svg aria-hidden="true" viewBox="0 0 340 120" preserveAspectRatio="none"
      style={{
        position: 'absolute',
        inset: '-31px clamp(-38px, -5vw, -20px)',
        width: 'calc(100% + clamp(40px, 10vw, 76px))',
        height: 'calc(100% + 62px)',
        overflow: 'visible',
        pointerEvents: 'none',
        zIndex: 0,
        visibility: 'var(--mantra-frame-visibility, hidden)' as 'hidden',
      }}>
      <style>{`
        @keyframes mantra-edge-flow {
          from { stroke-dashoffset: var(--flow-start, 0); }
          to { stroke-dashoffset: var(--flow-end, -100); }
        }
        .mantra-flow-streak {
          animation: mantra-edge-flow 5.5s linear infinite;
          animation-play-state: var(--mantra-flow-play, paused);
        }
        .mantra-flow-mid { --flow-start: -5; --flow-end: -105; }
        .mantra-flow-core { --flow-start: -9; --flow-end: -109; }
        @media (prefers-reduced-motion: reduce) {
          .mantra-flow-streak { animation: none; visibility: hidden; }
        }
      `}</style>
      <defs>
        <linearGradient id="mantra-dream-edge" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#AB6EFA" stopOpacity="0.85" />
          <stop offset="28%" stopColor="#E9D5FF" stopOpacity="1" />
          <stop offset="52%" stopColor="#D7B4FF" stopOpacity="0.9" />
          <stop offset="78%" stopColor="#F4E9FF" stopOpacity="1" />
          <stop offset="100%" stopColor="#AB6EFA" stopOpacity="0.85" />
        </linearGradient>
        <linearGradient id="mantra-clear-glass" x1="12%" y1="0%" x2="88%" y2="100%">
          <stop offset="0%" stopColor="#F8F3FF" stopOpacity=".17" />
          <stop offset="25%" stopColor="#EFE4FF" stopOpacity=".045" />
          <stop offset="55%" stopColor="#FFFFFF" stopOpacity=".018" />
          <stop offset="82%" stopColor="#D4BAFF" stopOpacity=".045" />
          <stop offset="100%" stopColor="#F8F3FF" stopOpacity=".12" />
        </linearGradient>
      </defs>
      <path data-mantra-frame-shape="" d={mantraFramePath(0)} fill="url(#mantra-clear-glass)" />
      <g style={{ filter: 'drop-shadow(0 0 2px rgb(244 233 255 / 1)) drop-shadow(0 0 4px rgb(205 161 255 / .85)) drop-shadow(0 0 7px rgb(171 110 250 / .55))' }}>
        <path data-mantra-frame-shape="" d={mantraFramePath(0)} fill="none" stroke="url(#mantra-dream-edge)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <g fill="none" strokeLinecap="round" style={{ opacity: 'var(--mantra-flow-opacity, 0)' }}>
          <path data-mantra-frame-shape="" className="mantra-flow-streak" d={mantraFramePath(0)} pathLength={100}
            stroke="#AB6EFA" strokeOpacity={0.56} strokeWidth={3.2} strokeDasharray="24 76" vectorEffect="non-scaling-stroke" />
          <path data-mantra-frame-shape="" className="mantra-flow-streak mantra-flow-mid" d={mantraFramePath(0)} pathLength={100}
            stroke="#D7B4FF" strokeOpacity={0.9} strokeWidth={2.3} strokeDasharray="14 86" vectorEffect="non-scaling-stroke" />
          <path data-mantra-frame-shape="" className="mantra-flow-streak mantra-flow-core" d={mantraFramePath(0)} pathLength={100}
            stroke="#FFF5FF" strokeWidth={1.8} strokeDasharray="6 94" vectorEffect="non-scaling-stroke" />
        </g>
        <g data-mantra-frame-ornaments="" transform="translate(170 60) scale(.08 .03) translate(-170 -60)">
      <g fill="none" stroke="url(#mantra-dream-edge)" strokeLinecap="round" strokeLinejoin="round">
        <path vectorEffect="non-scaling-stroke" strokeWidth="0.8" opacity="0.72" d="M3 42C12 18 34 8 76 8M264 8C306 8 328 18 337 42M337 78C328 102 306 112 264 112M76 112C34 112 12 102 3 78" />
      </g>
      <g fill="#F4E9FF" opacity="0.95">
        <path d="M170 0Q171 3 175 4Q171 5 170 8Q169 5 165 4Q169 3 170 0Z" />
        <path d="M170 112Q171 115 175 116Q171 117 170 120Q169 117 165 116Q169 115 170 112Z" />
        <path d="M7 54Q8 59 13 60Q8 61 7 66Q6 61 1 60Q6 59 7 54Z" />
        <path d="M333 54Q334 59 339 60Q334 61 333 66Q332 61 327 60Q332 59 333 54Z" />
      </g>
        </g>
      </g>
    </svg>
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
        style={MANTRA_RISE ? { position: 'relative', zIndex: 1 } : undefined}
      >
        <LotusFigure frame={frame} invocation={invocation} />
      </SceneCanvas>
      {MANTRA_RISE && (
        <footer ref={invocation} aria-label="Ganesha invocation" className="mw-stage">
          <div className="mw mw-shri"><span className="mw-in mw-r0">
            <span className="mw-en">Shri</span><span lang="or" className="mw-or">ଶ୍ରୀ</span>
          </span></div>
          <div className="mw mw-gan"><span className="mw-in mw-r1">
            <span className="mw-en">Ganeshaya</span><span lang="or" className="mw-or">ଗଣେଶାୟ</span>
          </span></div>
          <div className="mw mw-nam"><span className="mw-in mw-r2">
            <span className="mw-en">Namah</span><span lang="or" className="mw-or">ନମଃ</span>
          </span></div>
        </footer>
      )}
      {!MANTRA_RISE && <footer
        ref={invocation}
        className="page-two-invocation"
        style={MANTRA_GLOW && !MANTRA_BORDER ? mantraGlowStyle : undefined}
        aria-label="Ganesha invocation"
      >
        <div style={MANTRA_BORDER ? { position: 'relative', display: 'inline-block' } : undefined}>
          {MANTRA_BORDER && <MantraRoyalFrame />}
          <div style={MANTRA_BORDER ? { ...GLASS, ...(MANTRA_GLOW ? mantraGlowStyle : {}), position: 'relative', zIndex: 1, opacity: 'var(--mantra-text-opacity, 0)' } : GLASS}>
          <h2 lang="or" className="page-two-invocation__title" style={GLASS_TEXT}>
            ଶ୍ରୀ ଗଣେଶାୟ ନମଃ
          </h2>
          <p lang="en" className="page-two-invocation__romanization" style={{ ...GLASS_TEXT, textAlign: 'center', marginTop: '0.2em' }}>
            Sri Ganeshaya Namah
          </p>
          </div>
        </div>
      </footer>}
    </div>
  )
}
