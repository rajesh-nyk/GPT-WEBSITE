import { useEffect, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { MathUtils } from 'three'
import { ScrollTrigger } from '../../lib/gsap'
import { isInRegion } from '../../lib/hoverRegions'
import { pointer } from '../../lib/pointer'
import { heroFx } from '../hero/fx'
import { SHOW_LOCKED_PAGES } from '../../content/wedding'
import { buildProgress, CAM2, deriveFormed, deriveGanesha, deriveShower, ganeshaFx } from '../ganesha/fx'

/**
 * THE JOURNEY — one timeline for the whole page, in "section units":
 *
 *   t = 0 → 1   leaving the hero        (wheel lifts away, red glow deepens)
 *   t = 1 → 2   the Ganesha blessing    (particles assemble → solid → mantra)
 *   t = 2 → 3   arriving at what's next (Ganesha ascends away, wheel settles low-left)
 *
 * Each section reports its own scroll progress (a ScrollTrigger via useJourneySegment);
 * their sum is the *target*. The visible timeline `t` then travels toward the target
 * through a VELOCITY GOVERNOR:
 *   - a critically-damped spring (no overshoot, eased start and stop), and
 *   - a hard speed cap per stage (section units per second).
 * So a fast flick of the trackpad can't rush or skip anything (see PACE for the minimum
 * time of every beat). Slow scrolling simply follows the scroll.
 *
 * Reduced motion: no governor — t follows scroll position directly (see World), and
 * objects are anchored to their sections instead of travelling.
 */
// With pages 1–2 hidden, the journey starts past them (t = 3): no hero wheel, no
// Ganesha — just the starry world behind page 3.
const START = SHOW_LOCKED_PAGES ? 0 : 3
export const journey = {
  segments: SHOW_LOCKED_PAGES ? [0, 0, 0] : [1, 1, 1],
  /** Raw target from scroll. */
  target: START,
  /** Governed timeline everything animates from. */
  t: START,
  velocity: 0,
  /** 0 = forward (governed), 1 = reversing (follows the scroll closely). Eased. */
  reverse: 0,
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __journey?: typeof journey }).__journey = journey // QA hook
}

/**
 * PACING — the minimum time each beat takes, however fast the visitor scrolls. The cap
 * is a speed (timeline units per second) defined at keyframes along t and interpolated
 * between them, so the world never brakes or lurches between beats:
 *
 *   t 0.00–1.00  hero exit, camera leaves the wheel         ≈ 4.4 s
 *   t 1.00–1.26  the mantra alone, world blurred behind it   ≈ 2.9 s
 *   t 1.26–1.59  Ganesha is consecrated in gold              ≈ 3.4 s
 *   t 1.59–1.64  hold, full darshan                          ≈ 0.7 s
 *   t 1.64–1.85  camera tour (elephant → face → dolly zoom)  ≈ 3.8 s
 *   t 1.86–2.00  exit: orbit + rise above him, fade to black ≈ 3 s
 *   t 2.00–3.00  he slides down out on a curve, dims to black ≈ 2 s
 *
 * Velocity also has an acceleration limit, so motion always eases in and out.
 */
const PACE: ReadonlyArray<readonly [number, number]> = [
  [0.0, 0.7],
  // (0 → 0.55: the hero's own pace, unchanged — the old line ran 0.7 → 0.65 over 0 → 0.9)
  [0.55, 0.6694],
  // Page 1 exit (24 Nov 2026, his velocity rule): the camera leaves the wheel slowly ≈ 3.5 s,
  // and the pace blends into the mantra's instead of braking at t 1 (was 0.3 → 0.09 in one step).
  [0.62, 0.12],
  [0.9, 0.12],
  // Once the wheel has cleared, bring Ganesha directly to screen. The old 0.075 cap
  // made the glow linger for roughly eleven seconds and forced repeated scrolling.
  [1.0, 0.2],
  [1.08, 0.34],
  [1.48, 0.34],
  [1.62, 0.16],
  [1.845, 0.12],
  // the exit into space ≈ 7.4 s, then the fade to black and page 3 as before.
  [1.86, 0.1],
  [2.6, 0.1],
  [2.65, 0.5],
  [3.0, 0.5],
]
const ACCEL = 0.9 // max change of velocity, in multiples of the local speed cap per second
const STIFFNESS = 26 // spring toward target; critical damping below
/**
 * Scrolling BACK up is different: the key moments have already been seen, and the
 * page (names, text) arrives at once — if the 3D lagged behind it, the wheel would
 * "drop" into place on its own after the visitor stopped. So in reverse the world
 * follows the scroll closely: a much higher speed cap and a stiffer spring. The two
 * modes cross-fade (`reverse` eases 0↔1) so changing direction is never a jolt.
 */
const REVERSE_LIMIT = 5
const REVERSE_STIFFNESS = 260

/** Speed cap at t (piecewise-linear between PACE keyframes). */
function speedLimitAt(t: number) {
  if (t <= PACE[0][0]) return PACE[0][1]
  for (let i = 1; i < PACE.length; i++) {
    const [t1, v1] = PACE[i]
    if (t <= t1) {
      const [t0, v0] = PACE[i - 1]
      return MathUtils.lerp(v0, v1, (t - t0) / (t1 - t0))
    }
  }
  return PACE[PACE.length - 1][1]
}

/**
 * Report a section's scroll progress as journey segment `index` (0, 1, 2).
 * start/end are ScrollTrigger positions.
 */
export function useJourneySegment(
  ref: RefObject<HTMLElement | null>,
  index: number,
  start = 'top top',
  end = 'bottom top',
) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const st = ScrollTrigger.create({
      trigger: el,
      start,
      end,
      onUpdate: (self) => setSegment(index, self.progress),
      onRefresh: (self) => setSegment(index, self.progress),
    })
    return () => st.kill()
  }, [ref, index, start, end])
}

/**
 * A deliberate jump (the chapter menu): put the world exactly where the page now is,
 * with no paced travel — the menu covers the screen while it happens, so the change is
 * never seen as a pop.
 */
export function snapJourney() {
  ScrollTrigger.update()
  journey.t = journey.target
  journey.velocity = 0
  journey.reverse = 0
}

function setSegment(index: number, progress: number) {
  journey.segments[index] = progress
  journey.target = journey.segments.reduce((a, b) => a + b, 0)
}

const BREATH_SECONDS = 9

/**
 * Advances the governed timeline and derives every shared value the world reads.
 * Mount FIRST inside the world canvas so it runs before all readers each frame.
 */
export function JourneyDirector({ reducedMotion, directScroll = false }: { reducedMotion: boolean; directScroll?: boolean }) {
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1)

    if (reducedMotion || directScroll) {
      journey.t = journey.target
      journey.velocity = 0
    } else {
      const goingBack = journey.target < journey.t - 0.002 ? 1 : 0
      journey.reverse += (goingBack - journey.reverse) * (1 - Math.exp(-dt * 18))
      const r = journey.reverse
      const limit = MathUtils.lerp(speedLimitAt(journey.t), REVERSE_LIMIT, r)
      const k = MathUtils.lerp(STIFFNESS, REVERSE_STIFFNESS, r)
      const accel = k * (journey.target - journey.t) - 2 * Math.sqrt(k) * journey.velocity
      // Forward: acceleration is limited too, so a flick never makes the world jump off
      // the mark — it eases up to pace. (Reverse stays responsive.)
      // Braking is allowed to be firmer than speeding up, so it never overshoots.
      const braking = accel * journey.velocity < 0
      const maxDv = MathUtils.lerp((braking ? 5 : ACCEL) * limit, 1e3, r) * dt
      const dv = MathUtils.clamp(accel * dt, -maxDv, maxDv)
      journey.velocity = MathUtils.clamp(journey.velocity + dv, -limit, limit)
      journey.t += journey.velocity * dt
      // Settle exactly (avoid endless micro-motion).
      if (Math.abs(journey.target - journey.t) < 1e-4 && Math.abs(journey.velocity) < 1e-3) {
        journey.t = journey.target
        journey.velocity = 0
      }
    }

    const t = journey.t

    // Hero values.
    if (!reducedMotion) {
      heroFx.time += dt
      heroFx.breath = 0.5 + 0.5 * Math.sin((heroFx.time / BREATH_SECONDS) * Math.PI * 2)
    }
    heroFx.exit = MathUtils.clamp(t, 0, 1)
    // Arrival: the sun rises as the loading screen lifts (it takes ~0.9s to clear).
    heroFx.rise = reducedMotion ? 1 : MathUtils.smootherstep(heroFx.time, 0.5, 3.6)
    const overWheel = pointer.active && isInRegion('wheel', pointer.clientX, pointer.clientY)
    heroFx.hover += ((overWheel ? 1 : 0) - heroFx.hover) * (1 - Math.exp(-dt * 5))

    // Ganesha values.
    if (!reducedMotion) ganeshaFx.time += dt
    ganeshaFx.progress = MathUtils.clamp(t - 1, 0, 1)
    if (CAM2 && !reducedMotion) deriveFormed(ganeshaFx.progress)
    else deriveGanesha(reducedMotion ? 1 : buildProgress(ganeshaFx.progress))
    // The nebula gathers as the hero leaves; the figure ascends away as t passes 2.
    // Reduced motion: the figure is anchored to its section and simply scrolls in/out.
    ganeshaFx.presence = reducedMotion ? 1 : MathUtils.smootherstep(t, 0.8, 1.04)
    if (reducedMotion) {
      ganeshaFx.shower = 0
      ganeshaFx.leave = 0
    } else deriveShower(t)
    const overGanesha = pointer.active && isInRegion('ganesha', pointer.clientX, pointer.clientY)
    ganeshaFx.hover += ((overGanesha ? 1 : 0) - ganeshaFx.hover) * (1 - Math.exp(-dt * 4))
  }, -10)
  return null
}
