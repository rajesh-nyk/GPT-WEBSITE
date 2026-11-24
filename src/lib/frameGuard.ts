import { useEffect } from 'react'

const WARM_UP_MS = 3000 // ignore load-time work (shader compiles, texture uploads)
const WINDOW_MS = 2000
const SLOW_FRAME_MS = 25 // a frame that missed the 60fps deadline by >50%
const SLOW_SHARE = 0.2 // >20% slow frames in a window = struggling
const BAD_WINDOWS = 2 // …for two windows in a row (4s) before acting
const STALL_MS = 250 // single huge gaps (GC, tab switch) aren't "slowness": skip
const COOLDOWN_MS = 6000 // a tier switch itself costs a frame or two; let it settle

/**
 * Runtime half of adaptive quality — ONE page-wide guard (not one per canvas, which
 * would double-count the same slow moment and drop two tiers at once).
 *
 * It judges sustained smoothness, not averages: a device is only downgraded when more
 * than 20% of its frames miss the deadline for 4 seconds straight. Isolated hitches —
 * a model finishing upload, a section mounting — never demote a capable device.
 * Paused while the tab is hidden, during warm-up, and for a cooldown after each change.
 */
export function useFrameBudgetGuard(onStruggling: (reason: string) => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    let raf = 0
    let last = 0
    let armedAt = performance.now() + WARM_UP_MS
    let windowStart = 0
    let frames = 0
    let slow = 0
    let badWindows = 0

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (document.visibilityState !== 'visible') {
        last = 0
        return
      }
      const dt = last ? now - last : 0
      last = now
      if (now < armedAt || dt === 0) {
        windowStart = now
        frames = slow = 0
        return
      }
      if (dt > STALL_MS) return
      frames++
      if (dt > SLOW_FRAME_MS) slow++

      if (now - windowStart >= WINDOW_MS) {
        const share = slow / Math.max(frames, 1)
        badWindows = share > SLOW_SHARE ? badWindows + 1 : 0
        if (badWindows >= BAD_WINDOWS) {
          onStruggling(`${Math.round(share * 100)}% slow frames`)
          badWindows = 0
          armedAt = now + COOLDOWN_MS
        }
        windowStart = now
        frames = slow = 0
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') armedAt = performance.now() + 1500
    }

    raf = requestAnimationFrame(loop)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled, onStruggling])
}
