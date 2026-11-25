import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { MathUtils, Vector3, type Group, type Vector2 } from 'three'
import { Model } from '../Model'
import { SolidFade } from '../three/SolidFade'
import { gild } from '../hero/gild'
import { heroFx } from '../hero/fx'
import { HERO_DIAMETER_UNITS, useHeroLayout } from '../hero/layout'
import { journey } from './journey'
import { glowCenters, projectCircle, screenShapes, toUv } from './screenShapes'
import { CINE3, EXIT, ganeshaFx, LOTUS } from '../ganesha/fx'
import { stageLayout } from './GaneshaStage'
import { wheelPose, wheelSwing } from './wheelPath'
import { WheelGlitter, rimLight } from './WheelGlitter'

const swingOffset = new Vector3()
import { templeFx } from './templeFx'
import { useRestViewport } from '../../lib/restViewport'

const SECONDS_PER_TURN = 24
/** Once it travels (halo, watermark), the wheel turns on its own axle — very slowly. */
const SECONDS_PER_ROLL = 150
const HOVER_SLOWDOWN = 0.35
const FLOAT_PX = 10
const FLOAT_SECONDS = 7
const MAX_TILT = (2.5 * Math.PI) / 180
const ENTRANCE_SECONDS = 1.8
/** The halo sits behind Ganesha's head: centred at this fraction of the figure's height… */
const HALO_AT = 0.71
/** …with a diameter of this fraction of the figure's height (frames head and canopy). */
const HALO_SIZE = 0.74

/**
 * The Dharma Wheel, travelling through the whole site on the governed journey timeline
 * (choreography in wheelPath.ts): hero centrepiece → recedes on the central axis to
 * become Ganesha's prabhavali (halo) → arcs left into an oversized background watermark
 * for later sections. Position, depth, scale, opacity and glow all ease together.
 *
 * In the hero: 24s turn (slows on hover), ±10px float, ≤2.5° pointer tilt, entrance fade.
 * Travelling: no 3D flip, float or tilt — it settles face-on, follows the path and turns
 * very slowly on its own axle (one turn in SECONDS_PER_ROLL) so it always has some life.
 * Reduced motion: none of the motion — it sits face-on in the hero and scrolls away
 * with the page like any other content (anchored, see `anchorY`).
 */
export function TravelingWheel({
  pointer,
  reducedMotion,
  anchorY,
  pageTransition = false,
}: {
  pointer: Vector2
  pageTransition?: boolean
  reducedMotion: boolean
  /** Reduced motion: world-space Y offset of the hero (it scrolls with the page). */
  anchorY: { current: number }
}) {
  const travel = useRef<Group>(null)
  const spin = useRef<Group>(null)
  const roll = useRef<Group>(null)
  const angle = useRef(0)
  /** Face-on resting angle, latched when the wheel leaves the hero. */
  const rest = useRef<number | null>(null)
  const lastHaloPx = useRef(-1)
  const entrance = useRef(reducedMotion ? 1 : 0)
  const fade = useRef<SolidFade | null>(null)
  const center = useRef(new Vector3()).current
  const viewport = useRestViewport()
  const size = useThree((s) => s.size)
  const camera = useThree((s) => s.camera)
  const { scale, y: heroY } = useHeroLayout()

  useFrame((_, delta) => {
    const g = travel.current
    const s = spin.current
    if (!g || !s) return
    const dt = Math.min(delta, 0.1)
    const t = journey.t
    const pxToWorld = viewport.height / size.height

    if (pageTransition) {
      // The entire page panel (including the canvas) slides in document space.
      // Keep the wheel anchored within its own canvas; scroll only rotates Y.
      const scrollY = window.scrollY
      const span = document.getElementById('hero')?.offsetHeight || size.height
      const p = MathUtils.clamp(scrollY / Math.max(1, span), 0, 1)
      // A constant angular displacement per pixel: 360 degrees per hero height.
      // No separate easing, delay, or time-driven rotation on this axis.
      const turn = p
      const idle = 1 - MathUtils.smootherstep(p, 0, 0.12)
      g.position.set(0, heroY, 0)
      g.scale.setScalar(scale)
      g.rotation.set(reducedMotion ? 0 : -pointer.y * MAX_TILT * idle, 0, 0)
      s.rotation.y = reducedMotion ? 0 : turn * Math.PI * 2
      // Face-on chariot rotation at rest, with the scroll-linked Y turn intact.
      // Preserve accumulated axle angle as scrolling begins so there is no snap.
      const ready = document.documentElement.hasAttribute('data-site-ready')
      if (roll.current) {
        if (reducedMotion) roll.current.rotation.z = 0
        else if (ready) roll.current.rotation.z -= dt * Math.PI * 2 / 42 * idle * (1 - HOVER_SLOWDOWN * heroFx.hover)
      }
      entrance.current = reducedMotion ? 1 : Math.min(1, entrance.current + dt / ENTRANCE_SECONDS)
      const alpha = reducedMotion ? 1 : 1 - (1 - entrance.current) ** 3
      g.visible = p < 0.999 && alpha > 0.004
      const livingGlow = reducedMotion ? 1 : 1 + .055 * Math.sin(heroFx.time * Math.PI * 2 / 7) * idle
      wheelState.glow = g.visible ? alpha * livingGlow : 0
      wheelState.ahead = false
      fade.current ??= SolidFade.from(s, { occludes: true })
      fade.current?.set(alpha)
      if (g.visible) {
        g.getWorldPosition(center)
        // Preserve the original sun and backdrop in screen space throughout.
        const circle = projectCircle(center, HERO_DIAMETER_UNITS * g.scale.x / 2, camera, size.width, size.height)
        if (p < 0.001) {
          toUv(center, camera, glowCenters.hero)
          toUv(center, camera, glowCenters.sun)
          glowCenters.sunRadius = circle.r / size.height
        }
        // Projection is canvas-local, while hover regions are client-space.
        screenShapes.wheel = { ...circle, y: circle.y - scrollY, sx: Math.max(Math.abs(Math.cos(s.rotation.y)), 0.2) }
      } else screenShapes.wheel = null
      return
    }

    let opacity = 1
    let k = 1

    if (reducedMotion) {
      g.position.set(0, heroY + anchorY.current, 0)
      g.scale.setScalar(scale)
      if (LOTUS) opacity = 1 - MathUtils.smoothstep(t, 0.55, 1)
    } else {
      // Real layouts → precise poses: hero wheel, and the halo behind Ganesha's head.
      const vh = viewport.height
      const figH = stageLayout.ready ? stageLayout.figureHeight : vh * 0.58
      const figY = stageLayout.ready ? stageLayout.centerY : vh * 0.07
      const haloY = figY + (HALO_AT - 0.5) * figH
      const p = wheelPose(LOTUS ? Math.min(t, 0.55) : t, {
        vw: viewport.width,
        vh,
        heroY,
        heroD: HERO_DIAMETER_UNITS * scale,
        haloY,
        // Frames head and canopy — but never cropped by the top of the frame or the sides.
        haloD: Math.min(HALO_SIZE * figH, viewport.width * 0.82, 2 * (vh * 0.475 - haloY)),
        haloZ: -((stageLayout.ready ? stageLayout.depthHalf : 0.8) + 0.45),
      })
      // Publish the halo's on-screen radius so the flanking inscriptions clear it too.
      const haloRadiusPx = Math.round(
        (Math.min(HALO_SIZE * figH, viewport.width * 0.82, 2 * (vh * 0.475 - haloY)) / 2) *
          (size.height / vh),
      )
      if (haloRadiusPx !== lastHaloPx.current) {
        lastHaloPx.current = haloRadiusPx
        document.documentElement.style.setProperty('--halo-r', `${haloRadiusPx}px`)
      }
      const settle = 1 - MathUtils.smootherstep(t, 0, 0.45)
      // The float belongs to the hero; while travelling the wheel only follows its path.
      const float = Math.sin((heroFx.time / FLOAT_SECONDS) * Math.PI * 2) * FLOAT_PX * pxToWorld * settle
      g.position.set(p.x, p.y + float, p.z)
      g.scale.setScalar(scale * p.s)
      // With the Lotus Ganesha the wheel leaves page 1 by swinging out past the camera
      // (wheelSwing) instead of travelling to Ganesha's halo; it is gone after t = 1.
      let swing: ReturnType<typeof wheelSwing> | null = LOTUS ? wheelSwing(t) : null
      const flare = 0
      if (LOTUS && CINE3) {
        // The wheel stays face-on and keeps rolling while the camera trucks right. Once it
        // is safely outside frame, stop drawing it so the handoff stays light on the GPU.
        swing = { dx: 0, dy: 0, dz: 0, rotY: 0, roll: 0, visible: t < 0.96 }
      } else if (swing) g.position.add(swingOffset.set(swing.dx, swing.dy, swing.dz))
      // As the halo, it's lit from behind while Ganesha solidifies — and dims as he ascends.
      const blessing = ganeshaFx.solid * ganeshaFx.presence * (1 - ganeshaFx.leave)
      opacity = p.o + 0.08 * blessing
      k = p.glow + 0.2 * blessing + 0.5 * flare
      // No wheel after page 2 (Rajesh, 22 Nov 2026): it fades with the world into the
      // exit's black.
      opacity *= 1 - MathUtils.smoothstep(t, EXIT.dark[0], EXIT.dark[1])

      // Spin only while it's the hero centrepiece. As it starts travelling, the turn
      // eases out and the wheel settles face-on (nearest half-turn — both faces are
      // carved), then simply glides along its path. Scrolling back resumes the spin.
      const spinning = 1 - MathUtils.smootherstep(t, 0.02, 0.25)
      const hover = heroFx.hover
      angle.current += dt * ((Math.PI * 2) / SECONDS_PER_TURN) * (1 - HOVER_SLOWDOWN * hover) * spinning
      if (spinning >= 1) rest.current = null
      else rest.current ??= Math.round(angle.current / Math.PI) * Math.PI
      s.rotation.y =
        rest.current === null ? angle.current : rest.current + (angle.current - rest.current) * spinning
      // Face-on, it turns slowly on its own axle, like a chariot wheel, so it never sits
      // dead still; this eases in as the hero spin eases out. (A turn about the axle keeps
      // its outline, so the text masks and occlusion that follow it are unaffected.)
      if (roll.current) {
        const scrollBoost = MathUtils.smoothstep(Math.abs(journey.velocity), 0, 0.1)
        const rate = LOTUS && CINE3
          ? (1 + 0.05 * scrollBoost) / SECONDS_PER_TURN
          : (1 - spinning) / SECONDS_PER_ROLL
        roll.current.rotation.z -= dt * Math.PI * 2 * rate
      }
      g.rotation.x = -pointer.y * MAX_TILT * settle
      g.rotation.z = -pointer.x * MAX_TILT * 0.6 * settle + (swing ? swing.roll : 0)
      g.rotation.y = swing ? swing.rotY : 0
      if (LOTUS && CINE3) {
        g.position.set(0, heroY, 0)
        g.scale.setScalar(scale)
        g.rotation.set(0, 0, 0)
        s.rotation.y = 0
      }
      g.visible = swing ? swing.visible : true
      wheelState.ahead = LOTUS && CINE3 ? false : !!swing && swing.visible && t > 0.55

      entrance.current = Math.min(1, entrance.current + dt / ENTRANCE_SECONDS)
      opacity *= 1 - (1 - entrance.current) ** 3
    }
    wheelState.glow = k * (1 + (LOTUS && CINE3 && !reducedMotion ? .85 * rimLight(t) : 0))

    // The wheel is an object: dimmed as halo / watermark, but never see-through (stars
    // and motes behind it stay hidden).
    fade.current ??= SolidFade.from(s, { occludes: true })
    // the camera turns away from it (it leaves the frame like the sky); dropped once out of view
    fade.current?.set(opacity * (1 - MathUtils.smoothstep(templeFx.view, 0.24, 0.32)))

    // Screen circle for hover; red glow follows the wheel only while it's the hero
    // centrepiece (under reduced motion: as the hero scrolls away).
    g.getWorldPosition(center)
    // The red glow and the sun stay where the wheel sits in the hero: once it starts to
    // travel, it rises out of the sun, which fades in place (under reduced motion the
    // whole hero — wheel, glow and sun — simply scrolls together).
    const inHero = reducedMotion || t < 0.05
    if (inHero) {
      toUv(center, camera, glowCenters.hero)
      toUv(center, camera, glowCenters.sun)
    }
    const circle = projectCircle(
      center,
      (HERO_DIAMETER_UNITS / 2) * g.scale.x,
      camera,
      size.width,
      size.height,
    )
    // Thickness/diameter ≈ 0.2: edge-on it still covers a sliver.
    const sx = Math.max(Math.abs(Math.cos(s.rotation.y)), 0.2)
    screenShapes.wheel = { ...circle, sx }
    if (import.meta.env.DEV)
      (window as unknown as { __wheelFacing?: number }).__wheelFacing = Math.cos(s.rotation.y) // QA hook
    if (inHero) glowCenters.sunRadius = circle.r / size.height
  })

  return (
    <group ref={travel}>
      {!pageTransition && LOTUS && CINE3 && !reducedMotion && <WheelGlitter />}
      <group ref={spin}>
        <group ref={roll}>
          <Model src="dharma-wheel.glb" castShadow={false} receiveShadow={false} customize={gild} />
        </group>
      </group>
    </group>
  )
}

/** Current wheel brightness factor along its path (read by lights/bloom). */
/** ahead: the wheel is still in front of the camera (preview ?cine3: no light may show yet). */
export const wheelState = { glow: 1, ahead: false }
