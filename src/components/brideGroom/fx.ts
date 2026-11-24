import { MathUtils } from 'three'

/**
 * Page 3's slide (petals pan + selfie slide-in) under Rajesh's CONTROLLED VELOCITY rule:
 * major animations play at a consistent pace however fast the visitor scrolls. Same
 * governor as the journey (journey.ts): critically-damped spring + speed cap + accel limit
 * going forward; scrolling back follows the scroll closely.
 *
 * `target` is raw scroll progress through page 3's timeline (0→UNITS); `pan` is the
 * governed value the page draws from: 0→1 the petals pan + first photo slides in, then
 * each unit hands over to the next photo. scrollHold.ts reads `bgLimit()` so the page
 * can't scroll past a beat while it's still playing.
 */
/**
 * Intro beats before the photos (his design, 22 Nov 2026): 0→1 the cut-out "Bride & Groom"
 * fades in over black (tree showing through the letters), 1→2 it grows until the whole
 * tree is visible.
 */
export const INTRO = 2
/**
 * Where the next beat (petals pan + first photo) starts: as soon as the black cover begins
 * to fade (grow 55%), not after the reveal has fully finished — that left the full tree
 * sitting still for ~1 s (his ask: one continuous flow, 22 Nov 2026).
 */
export const HANDOFF = 1.55
/** Timeline units: intro + the first slide + one hand-over per remaining photo (6 photos). */
export const UNITS = INTRO + 6
/** Share of the pinned scroll the timeline uses (the rest is a short rest at the end). */
export const SLIDE_SHARE = 800 / 840
export const bgFx = {
  target: 0,
  pan: 0,
  velocity: 0,
  reverse: 0,
  /** Scroll position (px) of the section top and the scroll span of the slide. */
  top: 0,
  span: 0,
  mounted: false,
}

// First slide: ≈ 1.1 s, the same steady pace as the photo row (his screen recording,
// 22 Nov 2026: 0.5 s "coming so fast, not feeling smooth"; earlier 4/2.5/1.5 s felt slow).
const LIMIT = 0.9 // units per second for the first slide
// Each photo hand-over (slide left behind the blossoms + next one in): ≈ 1.1 s.
const HANDOVER_LIMIT = 0.9
const ACCEL = 2 // gentle start: reaches full pace in ≈ 0.5 s (5 felt like a jolt)
const STIFFNESS = 150 // tight landing: at 60 the last 15% crept in over ~0.6 s
const REVERSE_LIMIT = 8
const REVERSE_STIFFNESS = 260
// Slide units the scroll may lead by. Must leave the spring enough gap to reach LIMIT:
// steady speed ≈ √STIFFNESS · LEAD / 2 (≈ 6.1 · LEAD at STIFFNESS 150).
const LEAD = 0.8

// Intro pace: the title rises to the middle in ≈ 0.8 s (0.5 s felt too fast with the
// ease-out — his ask; 1 s+ felt like a long black wait), grows to the full tree ≈ 2 s.
// Capped by the governor: a fast scroll can never make it quicker than this.
const TEXT_IN_LIMIT = 1.25
const GROW_LIMIT = 0.5
/** Forward speed cap along the timeline, blended smoothly between beats. */
function speedAt(t: number) {
  const k = (a: number) => MathUtils.smoothstep(t, a - 0.1, a + 0.1)
  let v = MathUtils.lerp(TEXT_IN_LIMIT, GROW_LIMIT, k(1))
  v = MathUtils.lerp(v, LIMIT, k(HANDOFF))
  return MathUtils.lerp(v, HANDOVER_LIMIT, k(HANDOFF + 1))
}

export function stepBgFx(dt: number, reduced: boolean) {
  const f = bgFx
  if (reduced) {
    f.pan = f.target
    f.velocity = 0
    return
  }
  const goingBack = f.target < f.pan - 0.002 ? 1 : 0
  f.reverse += (goingBack - f.reverse) * (1 - Math.exp(-dt * 18))
  const r = f.reverse
  const fwd = speedAt(f.pan)
  const limit = MathUtils.lerp(fwd, REVERSE_LIMIT, r)
  const k = MathUtils.lerp(STIFFNESS, REVERSE_STIFFNESS, r)
  const accel = k * (f.target - f.pan) - 2 * Math.sqrt(k) * f.velocity
  const braking = accel * f.velocity < 0
  const maxDv = MathUtils.lerp((braking ? 5 : ACCEL) * limit, 1e3, r) * dt
  f.velocity = MathUtils.clamp(f.velocity + MathUtils.clamp(accel * dt, -maxDv, maxDv), -limit, limit)
  f.pan = MathUtils.clamp(f.pan + f.velocity * dt, 0, UNITS)
  if (Math.abs(f.target - f.pan) < 1e-4 && Math.abs(f.velocity) < 1e-3) {
    f.pan = f.target
    f.velocity = 0
  }
}

/** Furthest scroll (px) page 3 allows while its slide is still playing. */
export function bgLimit() {
  const f = bgFx
  if (!f.mounted || f.pan >= UNITS - 0.005) return Infinity
  return f.top + (Math.min(UNITS, f.pan + LEAD) / UNITS) * f.span
}

/**
 * What part of the tree canvas actually needs drawing during the cut-out title (screen
 * css px). 'none' while the solid gold word covers every hole, 'rect' (the word's box)
 * while the black cover is still opaque, 'full' otherwise. MoonlitPetals reads it each
 * frame — the tree redraw was the main cost behind his "choppy frames" (22 Nov 2026).
 */
export const introClip = { mode: 'full' as 'full' | 'none' | 'rect', x0: 0, y0: 0, x1: 0, y1: 0 }
