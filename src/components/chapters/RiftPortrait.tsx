import { useEffect, useRef } from 'react'
import { nightFx } from '../world/NightPortrait'

/**
 * THE FINALE PORTRAIT — their photo revealed through a rift of light, drawn in ONE 2D
 * canvas (photo, soft edges and light together), so every browser — Safari included —
 * shows exactly the same thing; and in plain 2D, so the photo's colours are never
 * touched by the 3D scene's colour grade.
 *
 * The rift's edges are two PARALLEL diagonal lines with a slight, natural unevenness
 * and a slow drift. The right one runs inside the photo all the way (its light sits on
 * the photo); the left one has to pass beyond the photo's left side below Chinmayee's
 * face (her face is close to that side) — the photo's side dissolves softly there, so
 * its box edge never shows. Inside the rift the violet glows in from each line and eases
 * to zero toward the middle.
 *
 * Timeline (nightFx.reveal, paced in world/NightPortrait.tsx):
 *   0.00–0.30  a small light falls along the rift's centre line
 *   0.28–0.48  it flares — a bloom with four-point rays — and a line of light grows
 *   0.48–0.88  the line splits into the two edges and they open; the photo appears
 *
 * Geometry: frame-height units from the frame centre, y down. The canvas is larger
 * than the frame so the light can glow past the photo.
 */
const S = 0.5 // slant: X decreases by S per unit Y downward
const DL = -0.5 // left edge offset (X + S·Y = DL) — clear of Chinmayee's face
const DR = 0.27 // right edge — clear of Rajesh's face, inside the photo top to bottom
const Y0 = -0.56
const Y1 = 0.56
/** Gentle, natural unevenness along a line (u: 0..1 along it), slowly drifting. */
const wobble = (u: number, seed: number, t: number) =>
  0.006 * Math.sin(u * 9 + seed + t * 0.5) + 0.004 * Math.sin(u * 23 + seed * 2 - t * 0.8) + 0.003 * Math.sin(u * 37 + seed * 5 + t * 0.3)
const PAD_X = 0.25 // canvas margin around the frame (× frame width)
const PAD_Y = 0.12 // (× frame height)
const SAMPLES = 48

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)

export function RiftPortrait({ src, alt }: { src: string; alt: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const img = new Image()
    img.decoding = 'async'
    img.src = src
    const layer = document.createElement('canvas') // the photo's own layer
    const shade = document.createElement('canvas') // the eased violet inside the rift
    // soft round glow sprites (gaussian-like falloff, no visible rim) for the shooting star
    const sprite = (r: number, g: number, b: number) => {
      const sp = document.createElement('canvas')
      sp.width = sp.height = 128
      const sc = sp.getContext('2d')!
      const gr = sc.createRadialGradient(64, 64, 0, 64, 64, 64)
      const fall = [1, 0.82, 0.52, 0.27, 0.12, 0.045, 0.012, 0]
      fall.forEach((v, i) => gr.addColorStop(i / (fall.length - 1), `rgba(${r},${g},${b},${v})`))
      sc.fillStyle = gr
      sc.fillRect(0, 0, 128, 128)
      return sp
    }
    const dotWhite = sprite(255, 255, 255)
    const dotLav = sprite(200, 172, 255)
    const dotViolet = sprite(132, 88, 245)
    let raf = 0
    let t = 0
    let last = performance.now()

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const q: number = import.meta.env.DEV && (window as unknown as { __riftQ?: number }).__riftQ != null ? (window as unknown as { __riftQ: number }).__riftQ : nightFx.reveal
      if (q <= 0.001 && nightFx.fade <= 0.001) {
        if (c.width) ctx.clearRect(0, 0, c.width, c.height)
        return
      }
      if (!img.complete || !img.naturalWidth) return
      t += dt

      // Canvas size (HiDPI) from its CSS box.
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const cw = c.clientWidth
      const ch = c.clientHeight
      if (c.width !== Math.round(cw * dpr) || c.height !== Math.round(ch * dpr)) {
        c.width = Math.round(cw * dpr)
        c.height = Math.round(ch * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, cw, ch)
      const W = cw / (1 + 2 * PAD_X) // the frame (photo) size inside the canvas
      const H = ch / (1 + 2 * PAD_Y)
      const cx = cw / 2
      const cy = ch / 2
      const px = (X: number, Y: number) => [cx + X * H, cy + Y * H] as const

      // Stages.
      const fall = clamp01(q / 0.3)
      const flare = clamp01((q - 0.28) / 0.2)
      const fl = 1 - (1 - flare) ** 3
      const e = easeInOut(clamp01((q - 0.48) / 0.4))

      // Edges: both start on the centre line (closed) and slide apart to their parallel
      // positions (open), each slightly uneven, breathing a little once open.
      const mid = (DL + DR) / 2
      const breath = e * (0.008 * Math.sin(t * 0.8) + 0.004 * Math.sin(t * 1.9 + 1.3))
      const pts = (d: number, k: number) =>
        Array.from({ length: SAMPLES + 1 }, (_, i) => {
          const u = i / SAMPLES
          const Y = Y0 + (Y1 - Y0) * u
          const off = mid + (d - mid) * e + (k === 0 ? -breath : breath)
          const X = off - S * Y + wobble(u, k * 3.7 + 1, t) * (0.35 + 0.65 * e)
          return [X, Y] as const
        })
      const left = pts(DL, 0)
      const right = pts(DR, 1)
      const centre = left.map(([, Y], i) => [(left[i][0] + right[i][0]) / 2, Y] as const)
      // a point at fraction u along a line, interpolated (no stepping between samples)
      const pointOn = (line: readonly (readonly [number, number])[], u: number): [number, number] => {
        const f = clamp01(u) * (line.length - 1)
        const i = Math.min(line.length - 2, Math.floor(f))
        const k = f - i
        return [line[i][0] + (line[i + 1][0] - line[i][0]) * k, line[i][1] + (line[i + 1][1] - line[i][1]) * k]
      }

      // 1. Inside the rift: the violet glows in from each line of light and eases smoothly
      //    to zero toward the middle (no flat fill) — clipped to the opening, fading out at
      //    the rift's tips. The photo goes on top; its soft edges glow into this.
      if (e > 0.002) {
        shade.width = c.width
        shade.height = c.height
        const sx = shade.getContext('2d')!
        sx.setTransform(dpr, 0, 0, dpr, 0, 0)
        sx.lineJoin = 'round'
        sx.lineCap = 'round'
        const reach = H * 0.1
        const steps = 12
        for (let k = steps; k >= 1; k--) {
          // wide, faint strokes first, then narrower ones: summed, an eased ramp that is
          // strongest at the line and reaches zero at `reach`
          sx.lineWidth = (reach * 2 * k) / steps
          sx.strokeStyle = 'rgba(132,92,240,0.055)'
          for (const edge of [left, right]) {
            sx.beginPath()
            edge.forEach(([X, Y], i) => (i ? sx.lineTo(...px(X, Y)) : sx.moveTo(...px(X, Y))))
            sx.stroke()
          }
        }
        // keep it to the inside of the opening
        sx.globalCompositeOperation = 'destination-in'
        sx.beginPath()
        left.forEach(([X, Y], i) => (i ? sx.lineTo(...px(X, Y)) : sx.moveTo(...px(X, Y))))
        for (let i = right.length - 1; i >= 0; i--) sx.lineTo(...px(right[i][0], right[i][1]))
        sx.closePath()
        sx.fillStyle = '#000'
        sx.fill()
        // and ease out toward the rift's tips
        const vg = sx.createLinearGradient(0, cy + Y0 * H, 0, cy + Y1 * H)
        vg.addColorStop(0, 'rgba(0,0,0,0)')
        vg.addColorStop(0.25, '#000')
        vg.addColorStop(0.75, '#000')
        vg.addColorStop(1, 'rgba(0,0,0,0)')
        sx.fillStyle = vg
        sx.fillRect(0, 0, cw, ch)
        ctx.globalCompositeOperation = 'source-over'
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.globalAlpha = clamp01(e * 1.5)
        ctx.drawImage(shade, 0, 0)
        ctx.globalAlpha = 1
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      }

      // 2. The photo, on its own layer: cut to the band, edges feathered, its own sides
      //    and its top/bottom faded — then laid onto the light.
      if (e > 0.002) {
        layer.width = c.width
        layer.height = c.height
        const lx = layer.getContext('2d')!
        lx.setTransform(dpr, 0, 0, dpr, 0, 0)
        lx.drawImage(img, cx - W / 2, cy - H / 2, W, H)
        lx.globalCompositeOperation = 'destination-in'
        lx.beginPath()
        left.forEach(([X, Y], i) => (i ? lx.lineTo(...px(X, Y)) : lx.moveTo(...px(X, Y))))
        for (let i = right.length - 1; i >= 0; i--) lx.lineTo(...px(right[i][0], right[i][1]))
        lx.closePath()
        lx.fillStyle = '#000'
        lx.fill()
        // feather each edge with layered strokes (no blur filter: identical in every browser)
        lx.globalCompositeOperation = 'destination-out'
        const feather = H * 0.045
        lx.lineJoin = 'round'
        lx.lineCap = 'round'
        for (let k = 6; k >= 1; k--) {
          lx.lineWidth = (feather * 2 * k) / 6
          lx.strokeStyle = 'rgba(0,0,0,0.36)'
          for (const edge of [left, right]) {
            lx.beginPath()
            edge.forEach(([X, Y], i) => (i ? lx.lineTo(...px(X, Y)) : lx.moveTo(...px(X, Y))))
            lx.stroke()
          }
        }
        lx.globalCompositeOperation = 'destination-in'
        // the photo's own left/right sides dissolve (so its box edge never shows)
        const sg = lx.createLinearGradient(cx - W / 2, 0, cx + W / 2, 0)
        sg.addColorStop(0, 'rgba(0,0,0,0)')
        sg.addColorStop(0.09, '#000')
        sg.addColorStop(0.95, '#000')
        sg.addColorStop(1, 'rgba(0,0,0,0)')
        lx.fillStyle = sg
        lx.fillRect(0, 0, cw, ch)
        // top and bottom melt into the night
        const g = lx.createLinearGradient(0, cy - H / 2, 0, cy + H / 2)
        g.addColorStop(0, 'rgba(0,0,0,0)')
        g.addColorStop(0.1, 'rgba(0,0,0,0.6)')
        g.addColorStop(0.22, '#000')
        g.addColorStop(0.68, '#000')
        g.addColorStop(1, 'rgba(0,0,0,0)')
        lx.fillStyle = g
        lx.fillRect(0, 0, cw, ch)
        ctx.globalCompositeOperation = 'source-over'
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.globalAlpha = clamp01(e * 1.8) // the photo appears as the rift opens
        ctx.drawImage(layer, 0, 0)
        ctx.globalAlpha = 1
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      }

      // 2. Light (added on top, never masked).
      ctx.globalCompositeOperation = 'lighter'
      const glowLine = (line: readonly (readonly [number, number])[], strength: number, from = 0, to = 1) => {
        const n = line.length - 1
        const i0 = Math.floor(from * n)
        const i1 = Math.ceil(to * n)
        const passes = [
          [H * 0.07, 'rgba(120,70,255,0.07)'],
          [H * 0.03, 'rgba(185,145,255,0.16)'],
          [H * 0.011, 'rgba(235,215,255,0.45)'],
          [H * 0.0035, 'rgba(255,246,228,0.95)'],
        ] as const
        for (const [w, col] of passes) {
          ctx.lineWidth = w
          ctx.lineCap = 'butt' // segments meet edge to edge: no overlapping caps, no beads
          for (let i = i0; i < i1; i++) {
            const u = (i + 0.5) / n
            const taper = Math.sin(Math.PI * clamp01((u - from) / Math.max(0.001, to - from))) ** 0.7
            ctx.globalAlpha = strength * taper
            ctx.strokeStyle = col
            ctx.beginPath()
            ctx.moveTo(...px(line[i][0], line[i][1]))
            ctx.lineTo(...px(line[i + 1][0], line[i + 1][1]))
            ctx.stroke()
          }
        }
        ctx.globalAlpha = 1
      }
      if (e > 0.002) {
        // the two edges, with a soft pulse of light travelling up each every few seconds
        for (const [k, edge] of [left, right].entries()) {
          glowLine(edge, 0.85)
          const ph = ((t / 5.5 + k * 0.5) % 1) // 0..1 along the edge, bottom → top
          const at = 1 - ph
          glowLine(edge, 0.9 * Math.sin(Math.PI * ph), Math.max(0, at - 0.07), Math.min(1, at + 0.07))
        }
      } else if (fl > 0) {
        // the line of light growing out of the flare, both ways along the centre line
        glowLine(centre, 1, 0.5 - 0.5 * fl, 0.5 + 0.5 * fl)
      }

      // 3. The falling light — a shooting star: a bright head with a star-burst sparkle and a
      //    long, gently curved tail that tapers to nothing, white at the head through lavender
      //    to violet. Then the flare at the point of impact.
      // a soft, tapered light spike (a thin diamond fading out to both tips)
      const spike = (cx: number, cy: number, ang: number, len: number, w: number, alpha: number) => {
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(ang)
        const sg = ctx.createLinearGradient(-len, 0, len, 0)
        sg.addColorStop(0, 'rgba(255,250,240,0)')
        sg.addColorStop(0.5, `rgba(255,250,240,${alpha})`)
        sg.addColorStop(1, 'rgba(255,250,240,0)')
        ctx.fillStyle = sg
        ctx.beginPath()
        ctx.moveTo(-len, 0)
        ctx.lineTo(0, -w)
        ctx.lineTo(len, 0)
        ctx.lineTo(0, w)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }
      if (fall > 0 && flare < 1) {
        const u = 0.5 * fall * fall // from the top of the centre line down to its middle
        const [hx, hy] = px(...pointOn(centre, u))
        const [tx, ty] = px(...centre[0])
        let dx = tx - hx
        let dy = ty - hy
        const dl = Math.hypot(dx, dy) || 1
        dx /= dl
        dy /= dl
        const nx = -dy
        const ny = dx
        const a = (1 - flare) * clamp01(fall * 6) // fades in at the start, out on impact
        const L = H * (0.1 + 0.34 * Math.min(1, fall * 1.4)) // the tail grows as it falls
        const curve = 0.12 // a gentle bow, like a real meteor trail
        // each layer: soft glow dots laid densely along the bowed path, shrinking and fading
        // toward the end — no polygon, so no hard edge or rim anywhere
        const tail = (img: HTMLCanvasElement, w: number, peak: number, fadePow: number) => {
          let sj = 0
          while (sj < 1) {
            const r = w * (1 - sj) ** 1.3 + 0.6
            const x = hx + dx * L * sj + nx * curve * L * sj * sj
            const y = hy + dy * L * sj + ny * curve * L * sj * sj
            const step = Math.max(0.6, r * 0.3)
            ctx.globalAlpha = Math.min(1, peak * (1 - sj) ** fadePow * (step / r) * 1.0)
            ctx.drawImage(img, x - r, y - r, r * 2, r * 2)
            sj += step / L
          }
          ctx.globalAlpha = 1
        }
        // wide violet haze (lasts longest), lavender body, white-hot core (fades first)
        tail(dotViolet, H * 0.05, 0.7 * a, 0.9)
        tail(dotLav, H * 0.024, 0.95 * a, 1.2)
        tail(dotWhite, H * 0.009, 1.0 * a, 1.8)
        // the head: a soft halo, a hot core, and a twinkling star-burst
        const halo = H * 0.075
        const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, halo)
        hg.addColorStop(0, `rgba(255,255,255,${a})`)
        hg.addColorStop(0.07, `rgba(250,245,255,${0.7 * a})`)
        hg.addColorStop(0.18, `rgba(215,190,255,${0.4 * a})`)
        hg.addColorStop(0.35, `rgba(170,130,255,${0.16 * a})`)
        hg.addColorStop(0.6, `rgba(140,100,255,${0.035 * a})`)
        hg.addColorStop(0.8, `rgba(130,90,255,${0.01 * a})`)
        hg.addColorStop(1, 'rgba(130,90,255,0)')
        ctx.fillStyle = hg
        ctx.beginPath()
        ctx.arc(hx, hy, halo, 0, Math.PI * 2)
        ctx.fill()
        const tw = 0.85 + 0.15 * Math.sin(t * 11) * Math.sin(t * 7.3)
        const tilt = 0.12
        spike(hx, hy, tilt, H * 0.075 * tw, 1.3, 0.95 * a)
        spike(hx, hy, tilt + Math.PI / 2, H * 0.06 * tw, 1.2, 0.9 * a)
        spike(hx, hy, tilt + Math.PI / 4, H * 0.028 * tw, 0.9, 0.6 * a)
        spike(hx, hy, tilt - Math.PI / 4, H * 0.028 * tw, 0.9, 0.6 * a)
        ctx.fillStyle = `rgba(255,255,255,${a})`
        ctx.beginPath()
        ctx.arc(hx, hy, Math.max(1.2, H * 0.004), 0, Math.PI * 2)
        ctx.fill()
      }
      if (flare > 0) {
        const fade = Math.max(0, 1 - e * 1.6) // gone once the rift is open
        if (fade > 0) {
          const [X, Y] = centre[SAMPLES / 2]
          const [hx, hy] = px(X, Y)
          const bloom = H * (0.1 + 0.32 * Math.sin(Math.PI * Math.min(1, flare * 1.2)) ** 0.8)
          const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, bloom)
          g.addColorStop(0, `rgba(255,255,255,${0.95 * fade})`)
          g.addColorStop(0.15, `rgba(255,238,215,${0.7 * fade})`)
          g.addColorStop(0.32, `rgba(190,150,255,${0.3 * fade})`)
          g.addColorStop(0.5, `rgba(160,115,255,${0.12 * fade})`)
          g.addColorStop(0.7, `rgba(135,90,255,${0.035 * fade})`)
          g.addColorStop(0.86, `rgba(120,70,255,${0.008 * fade})`)
          g.addColorStop(1, 'rgba(120,70,255,0)')
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.arc(hx, hy, bloom, 0, Math.PI * 2)
          ctx.fill()
          // four-point rays, aligned to the rift
          const [ax, ay] = px(centre[SAMPLES / 2 - 4][0], centre[SAMPLES / 2 - 4][1])
          const ang = Math.atan2(ay - hy, ax - hx)
          const len = H * 0.55 * fl
          // the ray along the rift is the light itself: it hands over to the two edges and is
          // gone the moment they part, so nothing stays between them
          const along = fade * (1 - clamp01(e * 6)) ** 2
          if (along > 0) spike(hx, hy, ang, len, 1.4, 0.9 * along)
          spike(hx, hy, ang + Math.PI / 2, len * 0.8, 1.4, 0.9 * fade)
          // a round, soft core where the rays meet (fine rays only, so no square at the centre)
          const core = H * 0.06
          ctx.globalAlpha = fade
          ctx.drawImage(dotWhite, hx - core, hy - core, core * 2, core * 2)
          ctx.globalAlpha = 1
        }
      }
      ctx.globalCompositeOperation = 'source-over'
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [src])

  return <canvas ref={canvas} className="np-canvas" role="img" aria-label={alt} />
}
