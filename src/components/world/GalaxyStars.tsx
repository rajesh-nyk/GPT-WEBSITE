import { useEffect, useMemo } from 'react'
import { gsap } from '../../lib/gsap'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, MathUtils, ShaderMaterial, Vector2, Vector3 } from 'three'
import { CINE3, LOTUS } from '../ganesha/fx'
import { journey } from './journey'
import { GALAXY_FRAGMENT } from '../Galaxy'
import { LivingConstellation } from './LivingConstellation'

/**
 * React Bits Galaxy starfield, drawn INSIDE the 3D world (not as a separate layer) so the
 * wheel, Ganesha and every other model hide the stars behind them like real objects:
 * the stars are a full-screen quad just in front of the painted backdrop, depth-tested
 * against the models. Page content (text, the couple's photos) is HTML above the canvas,
 * so the stars never cover photos either.
 *
 * Approved and locked by Rajesh on 21 Nov 2026 for every section, until he asks to remove it.
 * Settings are Rajesh's own (pasted from the React Bits playground, 21 Nov 2026). Star
 * colours are his palette: gold, white, very light pink, very light blue.
 * Opening: the stars fly in (intro). Click: a short warp jump. Mouse: stars near the
 * pointer are pushed aside. Reduced motion: stars hold still, no intro or warp.
 */
const STAR = {
  density: 0.8,
  hueShift: 140,
  saturation: 0.9,
  speed: 1,
  starSpeed: 0.5,
  glowIntensity: 0.45,
  flareIntensity: 2, // his 3, made a little smaller on request
  starSize: 0.55,
  twinkleIntensity: 0.7,
  rotationSpeed: 0.1,
  repulsionStrength: 2,
  layers: 4,
  opacity: 0.8, // a little dimmer on request
  clickWarp: true,
  intro: true,
  // Galaxy's starColors (max 4), as raw 0–1 rgb like the original component.
  starColors: ['#f3c867', '#ffffff', '#ffdbe6', '#dbeaff'],
}
const hex = (h: string) =>
  new Vector3(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255)
const INTRO_SECONDS = 2.2

const vertex = /* glsl */ `
  void main() {
    // Just in front of the backdrop (0.9999), behind every model.
    gl_Position = vec4(position.xy, 0.9998, 1.0);
  }
`

// Galaxy's own shader, adapted to three.js (which adds the version/precision header).
const fragment =
  '#define REPEL\n#define WARP\n#define PALETTE\n' +
  GALAXY_FRAGMENT.replace('#version 300 es\n', '')
    .replace('precision highp float;\nprecision highp int;\n', '')
    .replace('out vec4 outColor;\n', '')
    .replaceAll('outColor =', 'gl_FragColor =')
    // Same look on every quality tier. Galaxy's colours are display (sRGB) values: turn
    // them into linear light, then let three.js encode for the output. Drawn straight to
    // the screen (low tier) that round-trips exactly; into the post-processing buffer
    // (mid/high) it stays linear and the final pass encodes it, so the stars' faint haze
    // is no longer lifted into big halos. Also kept under the bloom threshold (0.86).
    .replace(
      'gl_FragColor = vec4(col * alpha, alpha);',
      'gl_FragColor = vec4(pow(min(col * alpha, vec3(0.8)), vec3(2.2)), alpha);\n    #include <colorspace_fragment>',
    )

/** How far the stars slide left during the page 1 exit, in screen widths. */
const STAR_DRIFT = 0.25

export function GalaxyStars({ reducedMotion, constellation = false, continuous = false }: { reducedMotion: boolean; constellation?: boolean; continuous?: boolean }) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        transparent: true,
        premultipliedAlpha: true,
        // Stars only ADD light: they never darken the sky behind them (no black dots
        // over the sun rays / glow).
        blending: AdditiveBlending,
        depthWrite: false,
        depthTest: true,
        toneMapped: false,
        uniforms: {
          uTime: { value: 0 },
          uResolution: { value: new Vector2(1, 1) },
          uFocal: { value: new Vector2(0.5, 0.5) },
          uRotation: { value: new Vector2(1, 0) },
          uGloss: { value: 0 },
          uDepth: { value: 0 },
          uDensity: { value: STAR.density },
          uHueShift: { value: STAR.hueShift },
          uSpeed: { value: STAR.speed },
          uMouse: { value: new Vector2(0.5, 0.5) },
          uStarGlow: { value: 0.05 * STAR.glowIntensity * STAR.starSize },
          uFlareGain: { value: STAR.glowIntensity * STAR.flareIntensity },
          uSquash: { value: 0 },
          uSaturation: { value: STAR.saturation },
          uMouseRepulsion: { value: 1 },
          uTwinkleIntensity: { value: STAR.twinkleIntensity },
          uRotationAngle: { value: 0 },
          uRepulsionStrength: { value: STAR.repulsionStrength },
          uMouseActiveFactor: { value: 0 },
          uAutoCenterRepulsion: { value: 0 },
          uLayers: { value: STAR.layers },
          uColors: { value: STAR.starColors.map(hex) },
          uColorCount: { value: STAR.starColors.length },
          uWarp: { value: 0 },
          uReveal: { value: 0 },
          uMode: { value: 1 }, // transparent: stars only, premultiplied alpha
          uBackground: { value: [0, 0, 0] },
          uOpacity: { value: STAR.opacity },
        },
      }),
    [],
  )

  // Warp boost (click / intro) and intro progress, as in Galaxy.
  const fx = useMemo(() => ({ boost: 0, depth: 0, reveal: STAR.intro && !reducedMotion ? 0 : 1 }), [reducedMotion])
  useEffect(() => {
    const mouse = material.uniforms.uMouse.value as Vector2
    const active = material.uniforms.uMouseActiveFactor
    // Same fast GSAP easing as the royal cursor; both the stars and their
    // constellation lines read these identical uniforms, not a second filter.
    const xTo = gsap.quickTo(mouse, 'x', { duration: 0.075, ease: 'power3.out' })
    const yTo = gsap.quickTo(mouse, 'y', { duration: 0.075, ease: 'power3.out' })
    const activeTo = gsap.quickTo(active, 'value', { duration: 0.16, ease: 'power2.out' })
    let inside = false
    active.value = 0
    const leave = () => {
      if (!inside) return
      inside = false
      activeTo(0)
    }
    const move = (e: PointerEvent) => {
      if (reducedMotion || e.pointerType !== 'mouse') { leave(); return }
      const x = e.clientX / Math.max(1, window.innerWidth)
      const y = 1 - e.clientY / Math.max(1, window.innerHeight)
      if (!inside) {
        inside = true
        xTo(x, x)
        yTo(y, y)
        mouse.set(x, y)
        activeTo(1)
      } else {
        xTo(x)
        yTo(y)
      }
    }
    const down = (e: PointerEvent) => {
      if (!STAR.clickWarp || reducedMotion || e.pointerType !== 'mouse') return
      fx.boost = Math.min(1.6, fx.boost + 1)
    }
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerdown', down, { passive: true })
    window.addEventListener('blur', leave)
    document.documentElement.addEventListener('pointerleave', leave)
    return () => {
      xTo.tween.kill()
      yTo.tween.kill()
      activeTo.tween.kill()
      active.value = 0
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('blur', leave)
      document.documentElement.removeEventListener('pointerleave', leave)
    }
  }, [material, fx, reducedMotion])

  const buffer = useMemo(() => new Vector2(), [])
  useFrame((state, delta) => {
    const u = material.uniforms
    const dt = Math.min(Math.max(delta, 0.0005), 0.05)
    const motion = reducedMotion ? 0 : 1
    if (fx.reveal < 1) {
      fx.reveal = Math.min(1, fx.reveal + dt / INTRO_SECONDS)
      fx.boost = Math.max(fx.boost, Math.pow(1 - fx.reveal, 2) * 1.4)
    }
    const flight = STAR.starSpeed / 10
    u.uTime.value += dt * motion
    u.uGloss.value += dt * flight * motion
    fx.depth += dt * flight * STAR.speed * motion * (1 + fx.boost * 14)
    const travel = continuous && !reducedMotion ? MathUtils.smootherstep(journey.t, .16, .94) : 0
    // Scrubbed depth offset gives real radial star parallax without a second canvas.
    u.uDepth.value = fx.depth + travel * .055
    u.uRotationAngle.value += dt * STAR.rotationSpeed * motion
    fx.boost *= Math.exp(-dt * 1.3)
    if (fx.boost < 0.001) fx.boost = 0
    const p = MathUtils.clamp(journey.t, 0, 1)
    const flightPulse = continuous && !reducedMotion ? MathUtils.smoothstep(p, .20, .42) * (1 - MathUtils.smoothstep(p, .62, .94)) : 0
    const warp = Math.max(fx.boost, .035 * flightPulse)
    const stretch = 1 + warp * 5
    u.uStarGlow.value = (0.05 * STAR.glowIntensity * STAR.starSize) / Math.pow(stretch, 0.6)
    u.uSquash.value = 1 - 1 / (stretch * stretch)
    u.uWarp.value = warp
    const fade = Math.min(1, fx.reveal / 0.35)
    u.uReveal.value = fade * fade * (3 - 2 * fade)
    // Reference camera descent: background parallax travels upward, less than the
    // foreground wheel. Keep the same procedural stars and palette.
    if (continuous && !reducedMotion) {
      ;(u.uFocal.value as Vector2).set(0.5, 0.5 + .16 * travel)
    } else if (!continuous && LOTUS && CINE3 && !reducedMotion) {
      ;(u.uFocal.value as Vector2).x = 0.5 - STAR_DRIFT * MathUtils.smootherstep(journey.t, 0.55, 1)
    }
    state.gl.getDrawingBufferSize(buffer)
    u.uResolution.value.copy(buffer)

  })

  return (
    <>
      <mesh renderOrder={-999} frustumCulled={false} material={material}>
        <planeGeometry args={[2, 2]} />
      </mesh>
      {constellation && !reducedMotion && <LivingConstellation galaxy={material} />}
    </>
  )
}
