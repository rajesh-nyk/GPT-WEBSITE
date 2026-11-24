import { MathUtils } from 'three'

/**
 * Page 2 opens with the invocation alone: the mantra rolls on its cylinder over a softly
 * blurred world (blessing progress 0 → TEXT_SPAN). Only once it has cleared does the
 * consecration below begin — its "p" is the build progress, buildProgress(progress).
 */
export const TEXT_SPAN = 0.26
/**
 * Page 2 reveal (approved 22 Nov 2026): no gold build — he is already whole and a 3D
 * camera move reveals him (see CameraRig). The old gold consecration is kept only
 * behind ?build in the address, for comparison.
 */
export const CAM2 =
  typeof window === 'undefined' || !new URLSearchParams(window.location.search).has('build')
/**
 * Page 2 look (approved 22 Nov 2026): the Lotus Ganesha — the lotus and Ganesha slide in
 * together on a 3D curve under a top-down camera, which then descends round to face him
 * (world/lotus). The previous single-figure Ganesha stays behind ?oldganesha.
 */
export const LOTUS =
  typeof window === 'undefined' || !new URLSearchParams(window.location.search).has('oldganesha')
/**
 * Pages 1–2 cinematic pass, APPROVED and locked 23 Nov 2026: through-the-wheel exit, light
 * born behind the mantra, exposure reveal, shrink into the star, low-arc exit. On by
 * default; ?oldcine shows the previous version for comparison.
 */
export const CINE3 = typeof window === 'undefined' || !new URLSearchParams(window.location.search).has('oldcine')
/** Share of the build progress the lotus reveal takes (the rays rise as it ends). */
export const LOTUS_REVEAL_END = 0.78

/** Raw progress at which the camera has turned away to the sky (he is out of frame). */
export const CAM2_AWAY = 0.05

/** The finished figure — never dissolves in: he is simply there once the camera has
 * turned away to the sky, and the camera's move reveals him. */
export function deriveFormed(p: number) {
  const on = p >= CAM2_AWAY ? 1 : 0
  ganeshaFx.gather = 0
  ganeshaFx.particles = 0
  ganeshaFx.seam = 0
  ganeshaFx.reveal = on
  ganeshaFx.solid = on
  ganeshaFx.glow = on
  ganeshaFx.idle = on
  ganeshaFx.tour = 0
  // The final pull-back (build progress 0.66–0.78) reveals him whole: the rays rise in.
  ganeshaFx.rays = MathUtils.smoothstep(buildProgress(p), 0.64, 0.78)
}

export const buildProgress = (p: number) => MathUtils.clamp((p - TEXT_SPAN) / (1 - TEXT_SPAN), 0, 1)

/**
 * Ganesha choreography, written each frame by the JourneyDirector from the governed
 * journey timeline (world/journey.ts). Plain mutable values — no re-renders.
 *
 * THE CONSECRATION (build progress p, 0 → 1):
 *   0.00–0.24  gold dust gathers onto his form — fine powder settling from close by,
 *              a shimmering outline (never a screen-wide cloud)
 *   0.12–0.44  a seam of molten gold rises from below; behind it he is solid, painted,
 *              real; at the seam the dust is absorbed and sparks lift off
 *   0.40–0.50  the seam cools, the dust is gone
 *   0.44–0.53  hold — full darshan; on wide screens the mantra flanks him
 *   0.52–0.80  camera tour: elephant's face → Ganesha's face → dolly zoom → full frame
 * Then, on the journey timeline t (crossing into the next section):
 *   1.84–2.63  pushpa vrishti — a flower shower thickens until it fills the screen;
 *              under full cover (t ≈ 2.12–2.2) Ganesha is gone; the petals fall away
 */
export const ganeshaFx = {
  progress: 0,
  time: 0,
  /** 0..1 gold dust gathering onto the surface. */
  gather: 0,
  /** 0..1 the molten seam's height (0 = below the frame, 1 = above the crown). */
  reveal: 0,
  /** 0..1 how hot the seam is (cools once he's revealed). */
  seam: 0,
  /** 0..1 how formed he is (= reveal, eased) — lighting, bloom and the wheel follow it. */
  solid: 0,
  /** 0..1 the dust layer's visibility. */
  particles: 1,
  glow: 0,
  idle: 0,
  /** 0..1 camera tour (push-in → crane → dolly zoom). */
  tour: 0,
  /** 0..1 how far the flower shower has fallen (scroll-driven, reversible). */
  shower: 0,
  /** 0..1 the stage gathering in as the hero leaves (the mantra arrives with it). */
  presence: 0,
  /** 0..1 Ganesha removed — only ever while the screen is covered in petals. */
  leave: 0,
  /** 0..1 the ray column behind him (replaces the warm halo once he is fully revealed). */
  rays: 0,
  /** 0..1 eased hover over the formed figure. */
  hover: 0,
}

const easeInOutSine = (x: number) => -(Math.cos(Math.PI * x) - 1) / 2

export function deriveGanesha(p: number) {
  ganeshaFx.gather = easeInOutSine(MathUtils.clamp(p / 0.24, 0, 1))
  ganeshaFx.reveal = easeInOutSine(MathUtils.clamp((p - 0.12) / 0.32, 0, 1))
  ganeshaFx.seam = MathUtils.smoothstep(p, 0.1, 0.16) * (1 - MathUtils.smoothstep(p, 0.42, 0.5))
  ganeshaFx.solid = ganeshaFx.reveal
  ganeshaFx.particles = 1 - MathUtils.smoothstep(p, 0.4, 0.5)
  ganeshaFx.glow = MathUtils.smootherstep(p, 0.14, 0.46)
  ganeshaFx.idle = MathUtils.smootherstep(p, 0.46, 0.52)
  ganeshaFx.tour = MathUtils.clamp((p - 0.52) / 0.28, 0, 1)
}

/** Exit (journey t, Rajesh 22 Nov 2026): the camera orbits a quarter turn round him while
 * rising above his head to look down on his upper body (up → top; rays fade by raysOut).
 * Then, as page 3 scrolls in, he slides down out of the screen on a curve (slide) while
 * the world dims to black (dark) — black just before page 3 pins (t = 3; the governor lags the scroll a little), whose stage
 * stays hidden until then, so its title rises at once with no black wait. */
export const EXIT = {
  up: 1.86,
  raysOut: 1.92,
  top: 2.0,
  slide: [2.0, 2.85] as const,
  dark: [2.45, 2.85] as const,
}

/** Flower shower & removal, from the journey timeline t (spans into the next section). */
export function deriveShower(t: number) {
  ganeshaFx.shower = 0 // flower shower removed (22 Nov 2026)
  // He is removed only once the exit has faded the world to black.
  ganeshaFx.leave = MathUtils.smootherstep(t, EXIT.dark[1], EXIT.dark[1] + 0.02)
}

/** Mantra windows (progress p). */
export const MANTRA = {
  /** Wide screens: flanking inscriptions during the hold. */
  flanks: [0.44, 0.53] as const,
  /** Narrow screens: the invocation over the nebula, before he forms. */
  invocation: [0.0, 0.12] as const,
}
