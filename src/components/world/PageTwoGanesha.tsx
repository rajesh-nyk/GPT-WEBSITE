import { Environment, Lightformer } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Group, MathUtils, Mesh, Points, ShaderMaterial, Vector2, Vector3, type MeshLambertMaterial, type MeshStandardMaterial, type Object3D } from 'three'
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
const petalBreath = new WeakMap<LotusMesh['material'], { value: Vector2 }>()
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
  // x: scroll-gated bloom strength; y: continuous breathing phase.
  const opening = { value: new Vector2(0, 0) }
  petalBreath.set(material, opening)
  material.customProgramCacheKey = () => AURA_ENABLED ? 'page-two-lotus-organic-bloom-aura' : 'page-two-lotus-organic-bloom'
  material.onBeforeCompile = (shader) => {
    applyCondense(shader)
    shader.uniforms.uPetalBreath = opening
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPetalPosition;\nvarying vec3 vPetalNormal;\nuniform vec2 uPetalBreath;')
      .replace('#include <begin_vertex>', /* glsl */ `
        #include <begin_vertex>
        vPetalPosition = position;
        vPetalNormal = normal;
        // Preserve every shared seat vertex; flex the free petals only.
        float radius = length(position.xz);
        float tip = smoothstep(0.129, 0.20, radius);
        if (tip > 0.0) {
          float angle = atan(position.z, position.x);
          // A small periodic phase offset makes adjacent flower regions open
          // in succession without a seam or independent floating movement.
          float stagger = 0.38 * sin(angle * 3.0) + 0.17 * cos(angle * 5.0);
          float cycle = 0.5 - 0.5 * cos(uPetalBreath.y + stagger);
          float bloom = smoothstep(0.0, 1.0, cycle) * uPetalBreath.x;
          float flex = tip * mix(0.75, 1.0, smoothstep(0.025, 0.09, position.y));
          transformed.xz += position.xz * (0.10 * flex * bloom);
          transformed.y -= 0.015 * flex * bloom;
        }
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

// Sample the real outer petal mesh so pollen begins on the moving flower.
function makePetalPollen(petals: LotusMesh) {
  const source = petals.geometry.getAttribute('position')
  const normals = petals.geometry.getAttribute('normal')
  const sectors = 24
  const tips: ({ x: number; y: number; z: number; nx: number; ny: number; nz: number; score: number } | undefined)[] = Array(sectors)
  for (let i = 0; i < source.count; i++) {
    const x = source.getX(i), y = source.getY(i), z = source.getZ(i)
    const radius = Math.hypot(x, z)
    if (radius < 0.145 || y < 0.018) continue
    const angle = Math.atan2(z, x)
    const bin = Math.min(sectors - 1, Math.floor((angle + Math.PI) / (2 * Math.PI) * sectors))
    const nx = normals?.getX(i) ?? 0, ny = normals?.getY(i) ?? 1, nz = normals?.getZ(i) ?? 0
    // Prefer exposed upper petal ridges instead of underside vertices.
    const score = radius + 0.64 * y + 0.018 * Math.max(0, ny)
    if (!tips[bin] || score > tips[bin]!.score) tips[bin] = { x, y, z, nx, ny, nz, score }
  }
  const roots: ({ x: number; y: number; z: number; score: number } | undefined)[] = Array(sectors)
  // Recover the root-to-tip pitch from the actual mesh in each angular sector.
  for (let i = 0; i < source.count; i++) {
    const x = source.getX(i), y = source.getY(i), z = source.getZ(i)
    const r = Math.hypot(x, z)
    if (r < 0.13 || r > 0.165 || y < 0.018) continue
    const bin = Math.min(sectors - 1, Math.floor((Math.atan2(z, x) + Math.PI) / (2 * Math.PI) * sectors))
    const tip = tips[bin]
    if (!tip) continue
    const tr = Math.hypot(tip.x, tip.z)
    if (r > tr - 0.02) continue
    const score = 0.65 * (x * tip.x + z * tip.z) / (r * tr) - Math.abs(r - tr + 0.045) + 0.22 * y
    if (!roots[bin] || score > roots[bin]!.score) roots[bin] = { x, y, z, score }
  }
  const positions: number[] = []
  const petalRoots: number[] = []
  const surfaceNormals: number[] = []
  const seeds: number[] = []
  for (let i = 0; i < sectors; i++) {
    const tip = tips[i]
    if (!tip) continue
    const root = roots[i] ?? { x: tip.x * 0.72, y: tip.y - 0.008, z: tip.z * 0.72 }
    for (let j = 0; j < 10; j++) {
      positions.push(tip.x, tip.y, tip.z)
      petalRoots.push(root.x, root.y, root.z)
      surfaceNormals.push(tip.nx, tip.ny, tip.nz)
      seeds.push(((i * 73 + j * 37 + 19) % 113) / 113, ((i * 41 + j * 59 + 7) % 101) / 101)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('aSeed', new BufferAttribute(new Float32Array(seeds), 2))
  geometry.setAttribute('aSurfaceNormal', new BufferAttribute(new Float32Array(surfaceNormals), 3))
  geometry.setAttribute('aPetalRoot', new BufferAttribute(new Float32Array(petalRoots), 3))
  const material = new ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true,
    blending: AdditiveBlending, toneMapped: false,
    uniforms: { uPhase: { value: 0 }, uBloom: { value: 0 }, uStrength: { value: 0 }, uDpr: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec2 aSeed;
      attribute vec3 aSurfaceNormal;
      attribute vec3 aPetalRoot;
      uniform float uPhase, uBloom, uStrength, uDpr;
      varying float vAlpha, vTint;
      void main() {
        float radius = length(position.xz);
        float angle = atan(position.z, position.x);
        float stagger = 0.38 * sin(angle * 3.0) + 0.17 * cos(angle * 5.0);
        // Release only on the opening half of the same 5.6-second bloom cycle.
        float birth = 0.55 + aSeed.x * 1.65 - stagger * 5.6 / 6.2831853;
        float life = 1.35 + aSeed.y * 1.05;
        // A short visible, surface-attached glow precedes the release.
        float age = mod(uPhase - birth + 0.24 + 5.6, 5.6) - 0.24;
        float t = clamp(age / life, 0.0, 1.0);
        float birthCycle = 0.5 - 0.5 * cos(birth * 6.2831853 / 5.6 + stagger);
        float currentCycle = 0.5 - 0.5 * cos(uPhase * 6.2831853 / 5.6 + stagger);
        float bloom = mix(smoothstep(0.0, 1.0, currentCycle), smoothstep(0.0, 1.0, birthCycle), smoothstep(0.0, 0.12, t)) * uBloom;
        float flex = smoothstep(0.129, 0.20, radius) * mix(0.75, 1.0, smoothstep(0.025, 0.09, position.y));
        vec3 origin = position;
        origin.xz *= 1.0 + 0.10 * flex * bloom;
        origin.y -= 0.015 * flex * bloom;
        vec2 radial = position.xz / max(radius, 0.0001);
        vec2 tangent = vec2(-radial.y, radial.x);
        // Launch along the bent petal's root-to-tip axis, not straight up.
        float rf = smoothstep(0.129, 0.20, length(aPetalRoot.xz)) * mix(0.75, 1.0, smoothstep(0.025, 0.09, aPetalRoot.y));
        vec3 root = aPetalRoot;
        root.xz *= 1.0 + 0.10 * rf * bloom;
        root.y -= 0.015 * rf * bloom;
        vec3 axis = normalize(origin - root);
        vec3 normal = normalize(vec3(aSurfaceNormal.x, max(0.35, aSurfaceNormal.y), aSurfaceNormal.z));
        float travel = (1.0 - pow(1.0 - t, 2.0)) * (0.065 + 0.095 * aSeed.y);
        vec3 p = origin + normal * 0.0025 + axis * travel;
        p.xz += tangent * (aSeed.x - 0.5) * 0.033 * t * t;
        p.xz += radial * 0.006 * t * t;
        p.y += (0.006 + 0.018 * aSeed.x) * t * t;
        vAlpha = smoothstep(-0.24, -0.035, age) * (1.0 - smoothstep(0.38, 1.0, t)) * uStrength;
        vTint = aSeed.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (5.5 + 5.5 * aSeed.x * aSeed.x) * min(uDpr, 2.0) * (1.0 - 0.42 * t);
      }`,
    fragmentShader: /* glsl */ `
      varying float vAlpha, vTint;
      void main() {
        float r = length(gl_PointCoord - vec2(0.5)) * 2.0;
        if (r >= 1.0 || vAlpha < 0.001) discard;
        float core = exp(-r * r * 22.0);
        float halo = exp(-r * r * 3.5) * (1.0 - smoothstep(0.60, 1.0, r));
        vec3 gold = vec3(1.0, 0.72, 0.36);
        vec3 lavender = vec3(0.72, 0.49, 1.0);
        vec3 color = mix(gold, lavender, smoothstep(0.45, 0.85, vTint));
        color = mix(color, vec3(1.0, 0.95, 0.85), core * 0.75);
        gl_FragColor = vec4(color * 1.25, min(1.0, 0.95 * core + 0.55 * halo) * vAlpha);
      }`,
  })
  const points = new Points(geometry, material)
  points.name = 'lotus-petal-pollen'
  points.frustumCulled = false
  points.renderOrder = 3
  petals.add(points)
  return points
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
  const pollen = useRef<Points<BufferGeometry, ShaderMaterial> | null>(null)
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
  const tickerReveal = useRef(0)
  const tickerArmed = useRef(false)
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

  useLayoutEffect(() => () => {
    const points = pollen.current
    if (points) {
      points.removeFromParent()
      points.geometry.dispose()
      points.material.dispose()
      pollen.current = null
    }
  }, [])

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
    // Gentle chest expansion, anchored above the seated mesh joins.
    const bodyWidth = 1 + inhale * 0.024
    ganeshaPose.uFigureTurn.value = turn
    ganeshaPose.uFigureSway.value = sway
    ganeshaPose.uFigureStretch.value.set(bodyWidth, 1 + inhale * 0.034)
    const opening = petalBreath.get(petals.material)
    // Bloom in place with Ganesha's breathing; fade the motion as page 2 exits.
    // No movement at the base or in reduced-motion mode.
    if (opening) opening.value.set(
      idle * (1 - MathUtils.smootherstep(departureProgress, 0.0, 0.65)),
      (idleTime.current * 2 * Math.PI / 5.6) % (2 * Math.PI),
    )
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
    // Keep the paced condensation during arrival, but finish it with scroll as
    // page 2 reaches center so the fully revealed figure and ticker stay synchronized.
    if (CLOUDS_ENABLED && !reducedMotion) {
      const target = MathUtils.smoothstep(progress, 0.08, 0.96) * MathUtils.smoothstep(exitFade, 0.0, 1.0)
      const step = (target > condense.value ? 0.22 : 0.8) * dt
      condense.value += MathUtils.clamp(target - condense.value, -step, step)
      // Catch up smoothly over the last part of the arrival, not on an independent timer.
      const centeredReveal = MathUtils.smootherstep(progress, 0.76, 0.995)
        * MathUtils.smoothstep(exitFade, 0, 1)
      condense.value = Math.max(condense.value, Math.min(target, centeredReveal))
      if (Math.abs(condense.value - target) > 0.0001) invalidate()
    } else condense.value = 1
    // Pollen follows the actual lotus transform and the same opening cycle.
    if (!reducedMotion && !pollen.current && opening) pollen.current = makePetalPollen(petals)
    if (pollen.current) {
      const uniforms = pollen.current.material.uniforms
      uniforms.uPhase.value = idleTime.current % 5.6
      uniforms.uBloom.value = opening?.value.x ?? 0
      uniforms.uStrength.value = reducedMotion ? 0 : (opening?.value.x ?? 0) * fade * condense.value
      uniforms.uDpr.value = viewport.dpr
    }
    if (invocation.current) {
      const el = invocation.current
      if (MANTRA_RISE) {
        const spreadFade = MathUtils.smoothstep(progress, 0.35, 0.96) * exitFade
        const key = spreadFade.toFixed(3)
        if (el.style.getPropertyValue('--mantra-spread') !== key) {
          el.style.opacity = '1'
          el.style.setProperty('--mantra-spread', key)
          ;[0, 1, 2].forEach((i) => {
            const k = MathUtils.smoothstep(spreadFade, i * 0.16, i * 0.16 + 0.6)
            el.style.setProperty(`--r${i}`, (1 - k).toFixed(3))
          })
          el.style.setProperty('--sw', (1 - MathUtils.smoothstep(spreadFade, 0.25, 1)).toFixed(3))
        }
      } else {
        // First entrance still begins at centered arrival. Once shown, the
        // same scroll envelope scrubs the exit and any reversal without a CSS timer.
        const envelope = MathUtils.smootherstep(progress, 0.88, 0.995)
          * (1 - MathUtils.smootherstep(departureProgress, 0, 0.13))
        if (progress >= 0.995 && departureProgress < 0.035) tickerArmed.current = true
        if (envelope <= 0.001) tickerArmed.current = false
        const target = reducedMotion ? 1 : tickerArmed.current ? envelope : 0
        const current = tickerReveal.current
        const damped = reducedMotion ? target : MathUtils.damp(current, target, target > current ? 6 : 24, dt)
        const next = Math.abs(damped - target) < 0.002 ? target : damped
        tickerReveal.current = next
        if (next !== target) invalidate()
        const key = next.toFixed(3)
        if (el.style.getPropertyValue('--mantra-ticker-reveal') !== key) {
          el.style.setProperty('--mantra-ticker-reveal', key)
        }
        // Keep the horizontal text moving throughout the exit; pause only offscreen.
        const visible = next > 0.001 ? 'true' : 'false'
        if (el.dataset.revealed !== visible) el.dataset.revealed = visible
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

function MantraTicker({ language, phrase }: { language: 'or' | 'en'; phrase: string }) {
  return (
    <div className={`mantra-ticker mantra-ticker--${language}`} lang={language}>
      <span className="sr-only">{phrase}</span>
      <div className="mantra-ticker__track" aria-hidden="true">
        {[0, 1].map(group => (
          <div className="mantra-ticker__group" key={group}>
            {[0, 1, 2, 3].map(i => (
              <span className="mantra-ticker__item" key={i}>
                {phrase}<span className="mantra-ticker__separator">✧</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
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
      {!MANTRA_RISE && (
        <section ref={invocation} className="mantra-ticker-stage" data-revealed="false" aria-label="Ganesha invocation">
          <style>{`
            .mantra-ticker-stage { position: absolute; inset: 0; z-index: 1; pointer-events: none; }
            .mantra-ticker {
              position: absolute; inset-inline: 0; overflow: hidden;
              display: flex; align-items: center;
              padding-block: clamp(6px, 1.1dvh, 12px);
              background: linear-gradient(90deg, transparent, rgb(35 15 58 / .22) 20%, rgb(35 15 58 / .22) 80%, transparent);
              opacity: var(--mantra-ticker-reveal, 0); visibility: hidden;
              -webkit-mask-image: linear-gradient(90deg, transparent, #000 7%, #000 93%, transparent);
              mask-image: linear-gradient(90deg, transparent, #000 7%, #000 93%, transparent);
            }
            .mantra-ticker--or { top: max(1.5dvh, env(safe-area-inset-top, 0px)); transform: translateY(calc(-110% * (1 - var(--mantra-ticker-reveal, 0)))); color: #fff1cc; font: 650 clamp(1.25rem, 2.65vw, 2.2rem)/1.35 var(--font-odia); }
            .mantra-ticker--en { bottom: max(1.5dvh, env(safe-area-inset-bottom, 0px)); transform: translateY(calc(110% * (1 - var(--mantra-ticker-reveal, 0)))); color: #ffe8bd; font: 650 clamp(.83rem, 1.25vw, 1.12rem)/1.45 var(--font-inscription); letter-spacing: .09em; text-transform: uppercase; }
            .mantra-ticker-stage[data-revealed="true"] .mantra-ticker { visibility: visible; }
            .mantra-ticker__track { display: flex; width: max-content; flex: none; animation: mantra-ticker-scroll 26s linear infinite; animation-play-state: paused; }
            .mantra-ticker-stage[data-revealed="true"] .mantra-ticker__track { animation-play-state: running; }
            .mantra-ticker__group { display: flex; align-items: center; justify-content: space-around; min-width: 100vw; flex: none; }
            .mantra-ticker__item { flex: none; white-space: nowrap; padding-inline: clamp(14px, 2.1vw, 42px); text-shadow: 0 0 2px rgb(255 218 145 / .72), 0 0 4px rgb(255 183 74 / .32); }
            .mantra-ticker__separator { margin-inline-start: clamp(20px, 3vw, 60px); color: #d8b8ff; opacity: .7; font-size: .7em; }
            @keyframes mantra-ticker-scroll { from { transform: translate3d(0,0,0); } to { transform: translate3d(-50%,0,0); } }
            @media (prefers-reduced-motion: reduce) {
              .mantra-ticker { transition: none; justify-content: center; mask-image: none; }
              .mantra-ticker__track { animation: none; width: auto; }
              .mantra-ticker__group { min-width: 0; }
              .mantra-ticker__group + .mantra-ticker__group, .mantra-ticker__item + .mantra-ticker__item, .mantra-ticker__separator { display: none; }
            }
          `}</style>
          <MantraTicker language="or" phrase="ଶ୍ରୀ ଗଣେଶାୟ ନମଃ" />
          <MantraTicker language="en" phrase="Sri Ganeshaya Namah" />
        </section>
      )}
    </div>
  )
}
