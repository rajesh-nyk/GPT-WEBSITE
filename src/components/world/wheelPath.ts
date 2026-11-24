import { MathUtils } from 'three'

/**
 * THE WHEEL'S JOURNEY — a three-act choreography on the governed timeline t.
 *
 *  Act I · Hero (t = 0)
 *    Centred above the names, turning, sun behind it.
 *
 *  Act II · Becoming the prabhavali (t 0 → 1, held through 2)
 *    It never leaves the central axis — symmetry is the temple's language. As the names
 *    scroll away it rises a little and recedes in depth to sit exactly behind where
 *    Ganesha's head will form, at the size of a halo framing head and canopy. The world
 *    changes around a constant: red deepens, the nebula gathers *in front of* the wheel,
 *    and Ganesha materialises against it. Dimmed so the painted figure always reads first;
 *    it brightens a touch as the figure solidifies (lit from behind).
 *
 *  Act III · The watermark (t 2 → 3)
 *    Ganesha dissolves in place while the halo holds, steady, behind where he stood. Then
 *    the wheel itself travels — fully visible, a solid object moving through space, never
 *    faded out and back in: it glides along a soft curve to the left, receding a touch
 *    and growing into an oversized, edge-cropped ornament deep in the background — the
 *    recurring motif behind every later section.
 *
 * Every pose is described in the screen plane (X, Y, apparent diameter D at z = 0) from
 * the real layouts, then converted to world space for its depth — so it lands precisely
 * on any screen size or shape.
 */
export type WheelLayout = {
  vw: number
  vh: number
  heroY: number
  heroD: number
  haloY: number
  haloD: number
  /** Halo depth: just behind the figure's back. */
  haloZ: number
}

type Pose = { X: number; Y: number; D: number; z: number; o: number; glow: number }

const CAMERA_Z = 6

const easeInOutSine = (x: number) => -(Math.cos(Math.PI * x) - 1) / 2
const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)

function lerpPose(a: Pose, b: Pose, u: number): Pose {
  return {
    X: MathUtils.lerp(a.X, b.X, u),
    Y: MathUtils.lerp(a.Y, b.Y, u),
    D: MathUtils.lerp(a.D, b.D, u),
    z: MathUtils.lerp(a.z, b.z, u),
    o: MathUtils.lerp(a.o, b.o, u),
    glow: MathUtils.lerp(a.glow, b.glow, u),
  }
}

/** Returns the world-space pose: position, uniform scale factor (× hero scale), opacity, glow. */
export function wheelPose(t: number, L: WheelLayout) {
  const hero: Pose = { X: 0, Y: L.heroY, D: L.heroD, z: 0, o: 1, glow: 1 }
  const halo: Pose = { X: 0, Y: L.haloY, D: L.haloD, z: L.haloZ, o: 0.34, glow: 0.3 }
  // Oversized but proportionate: on narrow phones it's capped by width so it stays an
  // edge ornament (about a third of the screen) instead of sitting under the text.
  const watermarkD = Math.min(1.05 * L.vh, 0.95 * L.vw)
  // In FRONT of nearly all the floating motes (they span z −4 … 2): a dimmed object with
  // motes drifting across it reads as see-through. Screen size is depth-compensated.
  // Portrait screens are too narrow for a half-wheel at the side: there it rests as a
  // quarter-wheel tucked into the bottom-left corner (text slips behind it, see
  // chapters/useMarkMask.ts).
  const portrait = L.vw / L.vh < 0.8
  const mark: Pose = portrait
    ? { X: -L.vw * 0.5, Y: -L.vh * 0.5, D: Math.min(0.62 * L.vw, 0.34 * L.vh), z: 1.2, o: 0.11, glow: 0.22 }
    : { X: -L.vw * 0.5, Y: -L.vh * 0.04, D: watermarkD, z: 1.2, o: 0.11, glow: 0.22 }

  let p: Pose
  if (t <= 1) {
    p = lerpPose(hero, halo, easeInOutSine(MathUtils.clamp(t, 0, 1)))
  } else if (t <= 2) {
    p = halo
  } else {
    // Holds while Ganesha dissolves (t 2.05 → 2.6), then glides from t 2.3: X and Y use
    // different easings, which bends the straight line into a soft, natural curve.
    const u = MathUtils.clamp((t - 2.3) / 0.7, 0, 1)
    const ux = easeInOutCubic(u)
    const uy = easeInOutSine(u)
    p = {
      X: MathUtils.lerp(halo.X, mark.X, ux),
      Y: MathUtils.lerp(halo.Y, mark.Y, uy),
      D: MathUtils.lerp(halo.D, mark.D, ux),
      z: MathUtils.lerp(halo.z, mark.z, ux),
      o: MathUtils.lerp(halo.o, mark.o, ux),
      glow: MathUtils.lerp(halo.glow, mark.glow, ux),
    }
  }

  // Screen-plane → world at depth z (perspective camera at z = CAMERA_Z).
  const k = (CAMERA_Z - p.z) / CAMERA_Z
  return {
    x: p.X * k,
    y: p.Y * k,
    z: p.z,
    s: (p.D / L.heroD) * k, // relative to the hero scale
    o: p.o,
    glow: p.glow,
  }
}

/**
 * Page 1's exit with the Lotus Ganesha (Rajesh, 22 Nov 2026 — option C): the wheel turns
 * in 3D and sweeps past the camera, out of frame to the right, uncovering the far star
 * that page 2 dives into. Offsets are added to the hero pose (world units / radians);
 * after t = 1 the wheel is gone — it never appears in page 2.
 */
/**
 * Preview ?cine3: the camera flies THROUGH the wheel. The wheel comes straight at the
 * camera (camera rests at z 6), offset so the line of sight threads between the spokes at
 * ~0.55 R, tilting a little; it passes the lens just before t = 1. `flare` peaks as the
 * rim crosses the lens.
 */
export function wheelThrough(t: number, R: number, baseY: number, baseZ: number) {
  const x = MathUtils.clamp((t - 0.55) / 0.4, 0, 1)
  const e = x * x * (3 - 2 * x) * 0.35 + x ** 3 * 0.65 // slow start, gathers speed into the lens
  const dz = (7.2 - baseZ) * e
  return {
    // No vertical move: the wheel only comes forward. It slides sideways just enough that
    // the lens meets the gap between spokes (~0.55 R from the hub) at its own height.
    dx: Math.sqrt(Math.max(0, (0.55 * R) ** 2 - baseY ** 2)) * MathUtils.smoothstep(x, 0, 0.6),
    dy: 0,
    dz,
    rotY: MathUtils.degToRad(-16) * e,
    roll: MathUtils.degToRad(9) * e + 0,
    flare: Math.exp(-(((baseZ + dz - 6) / 0.9) ** 2)),
    visible: baseZ + dz < 6.9,
  }
}

export function wheelSwing(t: number) {
  const e = easeInOutCubic(MathUtils.clamp((t - 0.55) / 0.45, 0, 1))
  return {
    dx: 4.5 * e,
    dy: 0.4 * e,
    dz: 3.5 * e,
    rotY: MathUtils.degToRad(70) * e,
    roll: -MathUtils.degToRad(12) * e + 0, // + 0: never -0 at rest
    visible: t <= 1,
  }
}
