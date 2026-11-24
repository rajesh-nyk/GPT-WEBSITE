import { CatmullRomCurve3, MathUtils, Vector3 } from 'three'
import { buildProgress, CINE3, LOTUS_REVEAL_END, TEXT_SPAN } from '../../ganesha/fx'
import { LOTUS_CENTER, LOTUS_PIVOT, LOTUS_SCALE, LOTUS_WORLD_CENTER } from './layout'

/**
 * Page 1 → 2 as one continuous shot (design 2026-11-22, approved sketch
 * cinematic-sketch.html), from journey time t:
 *
 *   t < 0.55       hero, untouched (resting camera)
 *   0.55 → 1.0     the wheel swings out; the far star is uncovered straight ahead
 *   1.0 → 1.26     the mantra; the camera drifts forward into deep space
 *   dive           fast through the stars, then a slow curve from his right side round to
 *                  his front; he glows inside the light, which settles behind him
 *   → 1.86         front shot (darshan); the gold ring appears only here
 *   1.86 → 2.6     the light swells round him, the camera pulls back into space and the
 *                  light — now a star — shoots up; the world then fades to black (EXIT.dark)
 *
 * CameraRig places the world camera from this, and LotusStage draws the lotus layer from
 * the same values, so the two can never disagree. Positions are world units.
 */
export type LotusShot = {
  pos: Vector3
  target: Vector3
  roll: number
  fov: number
  /** The light: brightness, radius (world units) and centre (world). */
  orbK: number
  orbSize: number
  orbPos: Vector3
  /** The light over him (he is inside it), 0..1. */
  flashK: number
  /** 1 = lotus and Ganesha drawn, 0 = hidden — switching only while the light covers him. */
  figure: number
  /** Dive stars, 0..1 — they fade in behind the mantra, never over the wheel. */
  starsK: number
  /** Gold ring + dust, 0..1 — only when he faces the camera, up close. */
  frontK: number
  /** Depth of field on the stars, 0..1 — the close moments. */
  focusK: number
  /** Preview ?cine3: ray reach 0..1, his exposure (bright shape) 0..1, gold edge 0..1. */
  rays: number
  expose: number
  rim: number
  /** He shrinks into the light on exit, 1..0 (continuous, never a one-frame cut). */
  figScale: number
}

export function makeLotusShot(): LotusShot {
  return {
    pos: new Vector3(0, 0, 6),
    target: new Vector3(),
    roll: 0,
    fov: 35,
    orbK: 0,
    orbSize: 1.6,
    orbPos: new Vector3(),
    flashK: 0,
    figure: 0,
    starsK: 0,
    frontK: 0,
    focusK: 0,
    rays: 1,
    expose: 0,
    rim: 0,
    figScale: 1,
  }
}

const DEG84 = MathUtils.degToRad(84)
/** The front shot, relative to the light's centre: the site's resting distance, 6° above. */
export const LOTUS_FRONT_REL = new Vector3(0, 6 * Math.cos(DEG84), 6 * Math.sin(DEG84))

const C = LOTUS_WORLD_CENTER
/** Actual world-space centre of the Ganesha/lotus figure, not the stage origin at its base. */
const FIGURE_CENTER_Y = (LOTUS_CENTER.y - LOTUS_PIVOT.y) * LOTUS_SCALE
const REST_POS = new Vector3(0, 0, 6)
const REST_TARGET = new Vector3(0, 0, 0)
const REST_REL = REST_POS.clone().sub(C)
// Page 1 leaves with one restrained camera truck: right and only slightly forward.
// The wheel stays face-on in the world and therefore clears left without a showy orbit.
const PASS = new Vector3(3.8, 0, 4.8)
const MANTRA_START_REL = CINE3 ? PASS.clone().sub(C) : REST_REL
const MANTRA_END_REL = new Vector3(CINE3 ? PASS.x : 0, 0, CINE3 ? MANTRA_START_REL.z - 3 : 163)
/** A shallow, constant-speed truck. Arc-length sampling prevents a mid-shot surge. */
const LEAVE = new CatmullRomCurve3([
  REST_POS,
  new Vector3(.72, .12, 5.05),
  new Vector3(1.92, .24, 4.45),
  PASS,
])
LEAVE.arcLengthDivisions = 2000
LEAVE.updateArcLengths()
const FORWARD = new Vector3(0, 0, -10)
/** The wheel has swung clear of the screen centre by here; the light may start. */
const WHEEL_CLEAR = 0.72
const MANTRA_END = 1 + TEXT_SPAN
const EXIT_START = 1.86
/** Wheel clear → full Ganesha reveal. Kept short so the glow never becomes a waiting screen. */
const REVEAL_FRONT = 1.48
const EXIT_SPAN = 0.74
/** The camera keeps easing until the world is black (EXIT.dark ends at 2.85), then stops. */
const EXIT_CAMERA_SPAN = 0.99

/**
 * One deliberate S into darshan. The camera first bows to his left, crosses the centre
 * line, then returns to the front. EXIT_LOW is its opposite S, so together the two shots
 * read as a single figure eight instead of unrelated camera moves.
 */
const ENTRY = new CatmullRomCurve3([
  MANTRA_END_REL,
  new Vector3(10, 4, 124),
  new Vector3(14, 7, 92),
  new Vector3(5, 6, 65),
  new Vector3(-9, 2.8, 40),
  new Vector3(-8, 1.8, 25),
  new Vector3(-3, 0.9, 12),
  LOTUS_FRONT_REL,
], false, 'centripetal')
const EXIT_PATH = new CatmullRomCurve3([
  LOTUS_FRONT_REL,
  new Vector3(2.5, 2.5, 12),
  new Vector3(8, 10, 40),
  new Vector3(6, 26, 140),
])
/** The opposing S completes the figure eight as the camera leaves the reveal. */
const EXIT_LOW = new CatmullRomCurve3([
  LOTUS_FRONT_REL,
  new Vector3(3, -0.9, 12),
  new Vector3(8, -1.8, 25),
  new Vector3(9, -2.8, 40),
  new Vector3(-5, -6, 65),
  new Vector3(-14, -7, 92),
  new Vector3(-10, -10, 124),
  new Vector3(-MANTRA_END_REL.x, -15, MANTRA_END_REL.z),
], false, 'centripetal')

const clamp01 = (x: number) => MathUtils.clamp(x, 0, 1)
const sm = (x: number) => {
  const c = clamp01(x)
  return c * c * (3 - 2 * c)
}
const easeIn = (x: number) => clamp01(x) ** 3
const lerp = MathUtils.lerp
const tmp = new Vector3()

// Fine arc-length tables: the default 200 steps make the speed change in small jumps.
ENTRY.arcLengthDivisions = 4000
EXIT_PATH.arcLengthDivisions = 4000
EXIT_LOW.arcLengthDivisions = 4000
EXIT_LOW.updateArcLengths()
ENTRY.updateArcLengths()
EXIT_PATH.updateArcLengths()

/**
 * Fast dive for the first 35% (62% of the path), then a slow arc to his front — as a
 * monotone cubic Hermite, so the camera's SPEED is continuous too: it leaves the mantra at
 * the mantra drift's own speed, peaks mid-dive and settles to zero at his front.
 */
const ENTRY_LENGTH = ENTRY.getLength()
const DIVE_DS_DT = 1 / ((1 - TEXT_SPAN) * LOTUS_REVEAL_END) // s per unit of t
const MANTRA_END_SPEED = (2 * MANTRA_START_REL.distanceTo(MANTRA_END_REL)) / TEXT_SPAN // drift k² at k = 1
const DIVE_M0 = MANTRA_END_SPEED / (DIVE_DS_DT * ENTRY_LENGTH)
const DIVE_M1 = 1
function hermite(x: number, x0: number, x1: number, y0: number, y1: number, m0: number, m1: number) {
  const h = x1 - x0
  const t = (x - x0) / h
  const t2 = t * t
  const t3 = t2 * t
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m1
}
function diveProfile(s: number) {
  return s < 0.35 ? hermite(s, 0, 0.35, 0, 0.62, DIVE_M0, DIVE_M1) : hermite(s, 0.35, 1, 0.62, 1, DIVE_M1, 0)
}

/** Gold ring only as he faces us, close: off beyond 8° or 7.7 units. */
function frontness(rel: Vector3) {
  const angle = MathUtils.radToDeg(Math.atan2(Math.abs(rel.x), rel.z))
  return (1 - sm((angle - 1) / 7)) * (1 - sm((rel.length() - 6.5) / 1.2))
}

function setOrb(out: LotusShot, k: number, size: number, y: number, z: number) {
  out.orbK = k
  out.orbSize = size
  out.orbPos.set(C.x, C.y + y, C.z + z)
}

/**
 * Preview ?cine3: the light is born behind the mantra — a point first, then the rays reach
 * out, then the haze swells — instead of switching on as a finished glow (t 0.78 → 1.2).
 */
/** The white light's size behind the mantra (world units, seen from ~165 away). */
const ORB_MANTRA = 9

function lightBirth(out: LotusShot, t: number) {
  // The white light grows 0→100 before the mantra arrives (t 1.0) and stays; the dive then
  // starts from exactly this light.
  // Starts only once the wheel has fully passed the lens (≈ t 0.87): this light is drawn on
  // its own layer above the world, so it must never show while the wheel is in front.
  // (24 Nov 2026) Born while the camera is still leaving the wheel, and glides in from the
  // right of the frame to the centre by t 1 — one continuous move into page 2.
  const fill = sm((t - 0.74) / 0.26)
  setOrb(out, sm((t - 0.7) / 0.06), lerp(0.12, ORB_MANTRA, fill * fill), FIGURE_CENTER_Y, -0.3)
  // The light and figure share one subject anchor from their first visible frame.
  out.orbPos.x = C.x
  out.rays = sm((t - 0.8) / 0.2)
  out.flashK = 0.75 * sm((t - 0.72) / 0.08)
}

function frontShot(out: LotusShot) {
  out.pos.copy(C).add(LOTUS_FRONT_REL)
  out.target.copy(C)
  out.fov = 35
  out.roll = 0
}

export function lotusSequence(t: number, reduced: boolean, out: LotusShot): LotusShot {
  const timeline = t
  out.roll = 0
  out.fov = 35
  out.flashK = 0
  out.figure = 0
  out.starsK = 0
  out.frontK = 0
  out.rays = 1
  out.expose = 0
  out.rim = 0
  out.figScale = 1
  setOrb(out, 0, 1.6, 0.35, -0.3)

  if (reduced) {
    if (t < 1) {
      out.pos.copy(REST_POS)
      out.target.copy(REST_TARGET)
    } else {
      frontShot(out)
      setOrb(out, 0.3, 1.3, 0.35, -1.4)
      out.frontK = 1
      out.figure = 1
      out.starsK = 1
    }
  } else if (t < 1) {
    // Hero, then the wheel swings out (TravelingWheel) and uncovers the far star.
    out.pos.copy(REST_POS)
    out.target.copy(REST_TARGET)
    if (CINE3 && t > 0.55) {
      // One authored move: truck right, remain level and front-facing, and let the wheel
      // clear left. The journey governor already eases velocity, so do not ease it again.
      const x = clamp01((t - 0.55) / 0.45)
      const travel = MathUtils.smootherstep(x, 0, 1)
      LEAVE.getPointAt(travel, out.pos)
      out.target.copy(out.pos).add(FORWARD)
      // Hold the near carving in frame briefly as the lens arcs past it.
    }
    // The light arrives first. Ganesha stays completely hidden until the covering light
    // is established, so no isolated lotus or body part can appear from its centre.
    if (CINE3) {
      lightBirth(out, t)
      // Keep the incoming light on the lens centre while the camera trucks right.
      // Its world X follows the camera one-for-one, so its projected screen X cannot
      // pause and then jump right as the wheel clears.
      out.orbPos.x = out.pos.x
      // The next shot aims directly at the light. Blend that vertical aim before the
      // boundary instead of changing it in one frame (the old 372 → 375 px jump).
      const targetDepth = out.pos.z - out.target.z
      const orbDepth = out.pos.z - out.orbPos.z
      const aimedY = out.pos.y + ((out.orbPos.y - out.pos.y) * targetDepth) / orbDepth
      out.target.y = lerp(out.target.y, aimedY, sm((t - 0.86) / 0.14))
      out.figure = 0
    } else {
      const k = sm((t - WHEEL_CLEAR) / 0.2)
      setOrb(out, k, 1.6, 0.35, -0.3)
      out.flashK = 0.75 * k
      out.figure = k * out.flashK >= 0.3 ? 1 : 0
    }
  } else if (t < MANTRA_END) {
    // The mantra: drifting forward into deep space, the star ahead.
    const k = (t - 1) / TEXT_SPAN
    out.pos.copy(C).add(tmp.lerpVectors(MANTRA_START_REL, MANTRA_END_REL, k * k))
    out.target.copy(C)
    if (CINE3) {
      // After the hero is fully gone, quietly restore the camera to Ganesha's centre line.
      const centre = sm((k - 0.65) / 0.35)
      out.target.x = lerp(PASS.x, C.x, centre)
      lightBirth(out, t)
      out.orbPos.x = out.target.x
    }
    else {
      setOrb(out, 1, 1.6, 0.35, -0.3)
      out.flashK = 0.75
    }
    out.figure = CINE3 ? 0 : out.orbK * out.flashK >= 0.3 ? 1 : 0
    out.starsK = sm(k)
  } else if (t <= EXIT_START) {
    // The dive and the reveal, then the front shot.
    const s = clamp01(buildProgress(t - 1) / LOTUS_REVEAL_END)
    const u = diveProfile(s)
    ENTRY.getPointAt(u, tmp)
    out.pos.copy(C).add(tmp)
    out.target.copy(C)
    out.figure = 1
    out.starsK = 1
    out.roll = 0.22 * Math.sin(Math.PI * Math.min(1, u * 1.1)) * (1 - u)
    out.fov = 35 + 12 * Math.sin(Math.PI * Math.min(1, u / 0.7))
    out.flashK = 0.75 * (1 - sm((u - 0.9) / 0.06))
    if (CINE3) {
      // He comes out of the light like an eye adjusting: bright shape → gold edge → colour.
      out.flashK = 0.75 * (1 - sm((u - 0.8) / 0.17))
      out.expose = 0.6 * sm((u - 0.62) / 0.15) * (1 - sm((u - 0.83) / 0.13))
      out.rim = 0.9 * sm((u - 0.82) / 0.07) * (1 - sm((u - 0.91) / 0.08))
    }
    const settle = sm((u - 0.9) / 0.09)
    setOrb(out, lerp(1, 0.3, settle), lerp(lerp(1.6, 2.6, sm((u - 0.6) / 0.3)), 1.3, settle), CINE3 ? lerp(0.02, 0.35, settle) : 0.35, lerp(CINE3 ? 0 : -0.3, -1.4, settle))
    out.frontK = frontness(tmp)
    if (CINE3) {
      // The light comes back up continuously as we dive towards it; he is only drawn once
      // it covers him.
      // Continues from the mantra's light: its size eases from the mantra size to the dive's
      // as we fly in, so the light never jumps.
      out.orbSize = Math.max(out.orbSize, (ORB_MANTRA * tmp.length()) / MANTRA_END_REL.length())
      out.figure = u > 0.04 ? 1 : 0
    }
  } else {
    // Exit: back into the light, pull away into space, the light rises as a star.
    const k = clamp01((t - EXIT_START) / EXIT_SPAN)
    const kc = clamp01((t - EXIT_START) / EXIT_CAMERA_SPAN)
    ;(CINE3 ? EXIT_LOW : EXIT_PATH).getPointAt(sm(kc), tmp)   // by distance along the path: no speed jumps between segments
    out.pos.copy(C).add(tmp)
    out.target.set(C.x, C.y + lerp(0, 4, sm(kc)), C.z)
    out.roll = -0.15 * Math.sin(Math.PI * kc) * kc
    out.fov = lerp(35, 50, sm(kc))
    out.flashK = 0.7 * sm(k / 0.2) * (1 - sm((k - 0.35) / 0.25))
    if (CINE3) {
      // Softer light (no blow-out); he turns to a pale glowing shape with a gold edge, and
      // only then is taken into the light. The camera then watches the star rise.
      out.flashK = 0.4 * sm(k / 0.22) * (1 - sm((k - 0.35) / 0.25))
      out.expose = 0.6 * sm((k - 0.06) / 0.2)
      out.rim = 0.8 * sm(k / 0.12)
      out.roll = 0.1 * Math.sin(Math.PI * kc) * kc
    }
    // He goes back into the light at its brightest (k 0.28), never while it is thin.
    out.figure = k < 0.28 ? 1 : 0
    out.starsK = 1
    out.frontK = (1 - sm(k / 0.1)) * frontness(tmp)
    const orbK = lerp(0.3, 1.0, sm(k / 0.25)) * (1 - sm((k - 0.88) / 0.12))
    const size = lerp(lerp(1.3, 1.9, sm(k / 0.2)), 0.35, sm((k - 0.3) / 0.3))
    setOrb(out, orbK, size, lerp(FIGURE_CENTER_Y, 70, easeIn((k - 0.55) / 0.45)), lerp(-1.4, -0.3, sm(k / 0.2)))
    if (CINE3) {
      // The light grows BEHIND him (clean gold edge, no wash), and only swallows him at the
      // last moment before he is taken into it.
      out.orbPos.z = C.z + lerp(-1.4, -0.3, sm((k - 0.18) / 0.1))
      out.flashK = 0.4 * sm((k - 0.12) / 0.14) * (1 - sm((k - 0.35) / 0.25))
      // He is drawn into the light: brighter and smaller, continuously, into the star.
      const into = sm((k - 0.18) / 0.3)
      out.expose = 0.35 * sm((k - 0.1) / 0.16) + 0.55 * into
      out.figScale = 1 - into
      out.figure = out.figScale > 0.004 ? 1 : 0
    }
    if (CINE3) out.target.set(C.x, lerp(C.y, out.orbPos.y, 0.5 * sm((k - 0.45) / 0.45)), C.z)
  }
  if (CINE3 && !reduced && timeline >= 1 && timeline <= EXIT_START) {
    // Linear progress starts moving on the first frame. The journey governor already
    // supplies acceleration, so a second ease here caused a visible 3–4 frame pause.
    const p = clamp01((timeline - 1) / (REVEAL_FRONT - 1))
    const progress = hermite(p, 0, 1, 0, 1, .03, 0)
    const startDistance = MANTRA_START_REL.length()
    const endDistance = LOTUS_FRONT_REL.length()
    const distance = Math.exp(lerp(Math.log(startDistance), Math.log(endDistance), progress))
    // Sample the authored curve by logarithmic distance, giving a visible approach
    // at every depth instead of spending most of the shot on a distant point.
    let low = 0
    let high = 1
    for (let i = 0; i < 16; i++) {
      const middle = (low + high) / 2
      ENTRY.getPointAt(middle, tmp)
      tmp.z += 3 * (1 - middle)
      if (tmp.length() > distance) low = middle
      else high = middle
    }
    const u = progress === 0 ? 0 : progress === 1 ? 1 : (low + high) / 2
    ENTRY.getPointAt(u, tmp)
    tmp.z += 3 * (1 - u)
    out.pos.copy(C).add(tmp)
    // Aim at the light itself, not the lower stage origin. That removes the horizontal
    // parallax drift while the camera travels laterally through the S-curve.
    out.target.set(C.x, C.y + FIGURE_CENTER_Y, C.z)
    out.roll = 0
    out.fov = 35
    const settle = sm((u - .86) / .14)
    const orbSize = ORB_MANTRA * Math.pow(tmp.length() / startDistance, .58)
    // Keep the light larger than the complete lotus/Ganesha silhouette while the camera
    // is moving. It may settle behind him only near the finished front shot.
    const coverSize = lerp(7.4, 2.2, sm((timeline - REVEAL_FRONT) / .14))
    setOrb(out, lerp(1, .3, settle), Math.max(coverSize, orbSize),
      FIGURE_CENTER_Y, lerp(-.3, -1.4, settle))
    out.flashK = .9 * (1 - sm((u - .3) / .46))
    out.figure = u > .08 ? 1 : 0
    out.expose = .3 * sm((u - .16) / .2) * (1 - sm((u - .5) / .2))
    out.rim = .5 * sm((u - .3) / .14) * (1 - sm((u - .64) / .18))
    out.frontK = frontness(tmp)
  }
  if (CINE3 && !reduced) {
    const framing = sm((timeline - 1.62) / .1) * (1 - sm((timeline - EXIT_START) / .15))
    const aspect = typeof window === 'undefined' ? 1.6 : window.innerWidth / window.innerHeight
    if (aspect >= 1) out.target.x += 0.82 * Math.min(aspect, 2.2) * framing
    else out.target.y -= .62 * framing
  }
  out.focusK = 1 - sm((out.pos.distanceTo(C) - 12) / 18)
  return out
}
