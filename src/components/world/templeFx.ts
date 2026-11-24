/**
 * Shared state for the closing scene (TempleNight): a Kalinga temple across a moonlit
 * river, sky lanterns rising. Written by TempleNight (from the .tn-track scroll), read
 * by the camera, lights and the other world layers that make way for it.
 */
export const templeFx = {
  /** The camera's journey from the violet sky down to the temple, 0 → 1 (governed pace). */
  view: 0,
  /** Seconds since the lanterns were released (0 = none yet). */
  release: 0,
  /** Taps on the scene (client px), handled by TempleNight on its next frame. */
  taps: [] as { x: number; y: number }[],
  /** Portrait layout: temple centred and lower, text above it. */
  portrait: false,
}

/** How far the earlier world has handed over to the temple scene (0 → 1). The camera has
 *  turned away from the earlier world by then (view 0.22–0.32), so its lights and motes are
 *  let go out of sight — nothing dissolves on screen. */
export const templeAway = () => {
  const x = Math.min(1, Math.max(0, (templeFx.view - 0.22) / 0.1))
  return x * x * (3 - 2 * x)
}

/**
 * The finale's one pinned track (.np-track): the first PORTRAIT_SVH of scroll belong to
 * the portrait (light, rift, names), the rest to the closing scene's camera journey.
 * Both NightPortrait and TempleNight read their progress from here, and the scroll hold
 * uses the same numbers in reverse.
 */
export const PORTRAIT_SVH = 1.6
export function finaleScroll() {
  const track = document.querySelector<HTMLElement>('.np-track')
  if (!track) return null
  const vh = window.innerHeight
  const r = track.getBoundingClientRect()
  const top = r.top + window.scrollY
  const scrolled = -r.top
  const portraitSpan = PORTRAIT_SVH * vh
  const templeSpan = Math.max(1, r.height - vh - portraitSpan)
  return {
    top,
    vh,
    rect: r,
    portraitSpan,
    templeSpan,
    /** 0 → 1 through the portrait part */
    portrait: Math.min(1, Math.max(0, scrolled / portraitSpan)),
    /** 0 → 1 through the closing scene part */
    temple: Math.min(1, Math.max(0, (scrolled - portraitSpan) / templeSpan)),
  }
}
/** Share of the closing part the camera journey takes (the rest holds the final frame). */
export const TEMPLE_MOVE = 0.82
