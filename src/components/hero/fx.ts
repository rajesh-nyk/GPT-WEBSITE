/**
 * Shared, per-frame hero "mood" values, written by the JourneyDirector (world/journey.ts)
 * and read by the wheel, lights, bloom and background. Plain mutable object: no React
 * re-renders at 60fps.
 */
export const heroFx = {
  /** Seconds of animation time (frozen under reduced motion). */
  time: 0,
  /** 0..1, slow sine — the red glow and bloom "breathe" on this (9s period). */
  breath: 0.5,
  /** 0..1, eased — how hovered the wheel is. */
  hover: 0,
  /** 0..1 — the sunrise on arrival (the sun climbs behind the wheel, the sky warms). */
  rise: 0,
  /** 0..1 — how far the journey has left the hero (governed, never jumps). */
  exit: 0,
}
