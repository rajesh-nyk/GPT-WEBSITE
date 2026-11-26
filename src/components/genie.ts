/**
 * macOS "genie" minimize, following the published breakdown of Apple's effect
 * (Harshil Shah, "Recreating the macOS Genie Effect", 2021), turned sideways so the
 * "dock" is on the RIGHT (page 3's big photo frame). Rajesh, 27 Nov 2026.
 *
 * How the Mac does it (dock at the bottom; here x and y are swapped):
 *  - The window's two side edges are curves. The far end of each curve stays pinned to the
 *    window's far corners; the near end (by the dock) narrows to the icon's size. Between
 *    them the edge follows a quadratic ease-in-out, which gives the S-shaped funnel.
 *  - Phase 1, SHEAR (0 → 50% of the time): only the near end narrows to the icon.
 *  - Phase 2, TRANSLATE (40% → 100%): the whole picture slides along those curved rails
 *    into the icon; the leading edge stops at the icon's far side, so the picture packs into it.
 *  - Both phases run on a linear clock (0.55 s; Apple's 0.7 s felt slow to him); only the edge curve is eased.
 *  - The picture is drawn as thin slices across the direction of travel, each one stretched
 *    between the two curves at its position (Apple's mesh warp).
 */
type Rect = { left: number; top: number; right: number; bottom: number }

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const quadInOut = (x: number) => {
  const t = clamp01(x)
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

const SHEAR_END = 0.5
const TRANSLATE_START = 0.4

export function playGenie({ canvas, img, focus, target, duration = 550, onProgress }: {
  canvas: HTMLCanvasElement
  img: HTMLImageElement
  /** CSS object-position of the full-screen photo, e.g. "50% 28%". */
  focus: string
  /** The "dock icon" the window minimizes into (to the right of the window). */
  target: Rect
  duration?: number
  onProgress?: (t: number) => void
}): Promise<void> {
  return new Promise((resolve) => {
    const ctx = canvas.getContext('2d')
    const vw = window.innerWidth
    const vh = window.innerHeight
    if (!ctx || !img.naturalWidth) { resolve(); return }
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(vw * dpr)
    canvas.height = Math.round(vh * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.imageSmoothingQuality = 'high'

    // The part of the image shown full screen (object-fit: cover at the photo's focus point).
    const [fx, fy] = focus.split(/\s+/).map((v) => (parseFloat(v) || 50) / 100)
    const scale = Math.max(vw / img.naturalWidth, vh / img.naturalHeight)
    const sw = vw / scale
    const sh = vh / scale
    const sx = (img.naturalWidth - sw) * fx
    const sy = (img.naturalHeight - sh) * fy

    // Speed: shrink the visible part of the photo to screen size ONCE, then every frame copies
    // slices from that ready-made picture (copying from the full-size photo each frame was ~12 fps).
    const W = canvas.width
    const H = canvas.height
    const prepared = document.createElement('canvas')
    prepared.width = W
    prepared.height = H
    const pctx = prepared.getContext('2d')
    if (!pctx) { resolve(); return }
    pctx.imageSmoothingQuality = 'high'
    pctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'low' // slices are copied ~1:1, so the cheap filter looks the same

    const win: Rect = { left: 0, top: 0, right: vw, bottom: vh }
    // Curve runs from the window's far side (left) to the icon's far side (its left edge).
    const far = win.left
    const near = target.left
    const slices = Math.min(360, Math.max(120, Math.round(vw / 4)))

    // QA hook (dev only): window.__genieMs slows it down for frame checks.
    if (import.meta.env.DEV) duration = (window as unknown as { __genieMs?: number }).__genieMs ?? duration
    let start = -1

    const frame = (now: number) => {
      if (start < 0) start = now
      const t = clamp01((now - start) / duration)
      const shear = clamp01(t / SHEAR_END)
      const move = clamp01((t - TRANSLATE_START) / (1 - TRANSLATE_START))

      // Near (dock-side) ends of the top and bottom edges narrow to the icon's height.
      const nearTop = lerp(win.top, target.top, shear)
      const nearBottom = lerp(win.bottom, target.bottom, shear)
      const edge = (x: number, farY: number, nearY: number) => {
        if (x >= near) return nearY
        if (x <= far) return farY
        const u = (x - near) / (far - near) // 0 at the dock end, 1 at the far end
        return nearY + quadInOut(u) * (farY - nearY)
      }

      // The picture slides along the rails: its far edge travels to the icon's far edge,
      // its leading edge stops at the icon's near edge.
      const shift = move * (target.left - win.left)
      const left = win.left + shift
      const right = Math.min(win.right + shift, target.right)

      ctx.clearRect(0, 0, vw, vh)
      for (let i = 0; i < slices; i++) {
        const u0 = i / slices
        const u1 = (i + 1) / slices
        const x0 = lerp(left, right, u0)
        const x1 = lerp(left, right, u1)
        if (x1 - x0 <= 0) continue
        const xm = (x0 + x1) / 2
        const top = edge(xm, win.top, nearTop)
        const bottom = edge(xm, win.bottom, nearBottom)
        if (bottom - top < 0.5) continue
        // +0.6px overlap hides hairline seams between slices.
        ctx.drawImage(prepared, u0 * W, 0, (u1 - u0) * W, H, x0, top, x1 - x0 + 0.6, bottom - top)
      }
      onProgress?.(t)
      if (t < 1) requestAnimationFrame(frame)
      else resolve()
    }
    requestAnimationFrame(frame)
  })
}
