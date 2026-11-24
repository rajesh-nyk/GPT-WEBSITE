import type { CSSProperties } from 'react'
import { useRestViewport } from '../../lib/restViewport'

/** Model's bounding diameter in its own units (from gltf-transform inspect: ~1.9). */
export const HERO_DIAMETER_UNITS = 1.9

/**
 * Single source of truth for where the wheel sits — used by the 3D scene (world units)
 * AND by the HTML text below it (CSS container-query units via heroLayoutVars), so the
 * names always hug the bottom of the wheel at any screen shape.
 *
 *   cy  wheel centre, as a fraction of hero height from the top
 *   d   wheel diameter as a fraction of hero height …
 *   dw  … but never more than this fraction of hero width
 */
export const HERO_LAYOUT = {
  landscape: { cy: 0.365, d: 0.44, dw: 0.78 },
  portrait: { cy: 0.34, d: 0.39, dw: 0.86 }, // aspect < 4:5 (phones, tall windows)
} as const
export const PORTRAIT_ASPECT = 0.8

export function useHeroLayout() {
  const viewport = useRestViewport()
  const l = viewport.aspect < PORTRAIT_ASPECT ? HERO_LAYOUT.portrait : HERO_LAYOUT.landscape

  const diameter = Math.min(viewport.height * l.d, viewport.width * l.dw)
  const scale = diameter / HERO_DIAMETER_UNITS
  const y = viewport.height * (0.5 - l.cy)
  const screenCenter: [number, number] = [0.5, 1 - l.cy]

  return { scale, y, screenCenter }
}

/** CSS custom properties consumed by .hero-copy in index.css. */
export const heroLayoutVars = {
  '--l-cy': HERO_LAYOUT.landscape.cy,
  '--l-d': HERO_LAYOUT.landscape.d,
  '--l-dw': HERO_LAYOUT.landscape.dw,
  '--p-cy': HERO_LAYOUT.portrait.cy,
  '--p-d': HERO_LAYOUT.portrait.d,
  '--p-dw': HERO_LAYOUT.portrait.dw,
} as CSSProperties
