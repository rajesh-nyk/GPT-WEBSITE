import { useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { MathUtils } from 'three'
import { STORY, STORY_CLOSING } from '../../content/wedding'
import { bgFx, HANDOFF, introClip, SLIDE_SHARE, stepBgFx, UNITS } from './fx'
import { useQuality } from '../../lib/quality'
import { gsap } from '../../lib/gsap'
import MoonlitPetals, { type MoonlitPetalsProps } from './MoonlitPetals'

/** His Originkit preset for Moonlit Petals (22 Nov 2026). */
const MOONLIT_PRESET: MoonlitPetalsProps = {
  blossomColor: '#FFEEA0', // his pick (tried soft gold #EBCB8F, peach-rose #F2B8A2; was lilac #D9A0FF)
  speed: 13,
  petals: 97,
  wind: 100,
  scale: 102,
  glow: 19,
  hover: 12,
  advanced: {
    seed: 7,
    flowers: 11000,
    flowerSize: 6,
    clumpSize: 11,
    twigs: 30,
    crownReach: 100,
    branchColor: '#3E3539',
    highlight: 100,
    dofBlur: 0, // no focus blur — every flower sharp (his ask)
    petalColor: '#FFEEA0',
    petalSize: 54,
    fallSpeed: 100,
    nearShare: 16,
    drift: -5,
    wobble: 100,
    swayAmp: 8,
    swayPeriod: 3000,
    bokehFirst: 2330,
    bokehEvery: 6000,
    bokehSize: 8,
    bokehOpacity: 85,
    haloSize: 100,
    hazeColor: '#2F2A2C',
    hazeOpacity: 40,
    grain: 6,
    vignette: 35,
  },
}

/**
 * Page 3 (22 Nov 2026): "Bride & Groom" over his Originkit Moonlit Petals background (trial).
 * It keeps the id "story" because the journey's segment 2 (Ganesha's exit) is measured
 * against this section.
 *
 * Tried and removed at his request: the stacked photo carousel, then the infinite photo
 * grid (tap to zoom + blur) with the glitter-cascade background. Their components are
 * kept in this folder (StackedCarousel3D, InfiniteGrid, GlitterCascade) in case they return.
 */
/**
 * Page 3 photo row (Rajesh, 22 Nov 2026): all six photos in one row, small gaps. The
 * row arrives from the bottom-right with the petals pan; then scrolling slides it LEFT
 * continuously — each photo passing its resting place slips behind the blossoms
 * (between the sky and tree canvases) and dissolves.
 * Timeline T (0→UNITS) is governed in fx.ts — his controlled-velocity rule.
 */
const PHOTOS = [...STORY, ...STORY_CLOSING]
/** Two points per rounded corner, clockwise from top-left (see .bg-ghost-pt in CSS). */
const GHOST_CORNERS = ['tl1', 'tl2', 'tr1', 'tr2', 'br1', 'br2', 'bl1', 'bl2'] as const
const smooth = (a: number, b: number, x: number) => {
  const t = MathUtils.clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
type Hover = { tx: number; ty: number; amt: number; cx: number; cy: number; ca: number; on: boolean }

export function BrideGroom({ sectionRef }: { sectionRef: RefObject<HTMLElement | null> }) {
  const local = useRef<HTMLElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const introRef = useRef<HTMLCanvasElement | null>(null)
  const panRef = useRef<HTMLDivElement | null>(null)
  // The petals are driven from our tick (after we've written this frame's styles) and are
  // handed their layer's screen rect, so they never force a mid-frame layout read.
  const petalsDrive = useRef<((nowMs: number) => void) | null>(null)
  const petalsRect = useRef({ left: 0, top: 0, width: 0, height: 0 })
  const figs = useRef<(HTMLElement | null)[]>([])
  const hover = useRef<Hover[]>(PHOTOS.map(() => ({ tx: 0, ty: 0, amt: 0, cx: 0, cy: 0, ca: 0, on: false })))
  // Sharp (2×) when the device keeps up; the site's frame guard steps this down (1.5×, 1×)
  // only after sustained dropped frames.
  const quality = useQuality()

  // Hover "life": the photo under the pointer tilts a few degrees toward it and lifts
  // slightly (smoothed in the tick below). Only the photo in front reacts.
  const onPhotoMove = (i: number) => (e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const el = e.currentTarget
    if (el.dataset.hoverable === 'false') return
    const r = el.getBoundingClientRect()
    const h = hover.current[i]
    h.tx = MathUtils.clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1)
    h.ty = MathUtils.clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1)
    h.on = true
    el.dataset.hover = 'true'
  }
  const onPhotoLeave = (i: number) => (e: ReactPointerEvent<HTMLElement>) => {
    hover.current[i].on = false
    delete e.currentTarget.dataset.hover
  }

  useEffect(() => {
    const el = local.current
    const stage = stageRef.current
    if (!el || !stage) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let lastPan = ''
    let covered = false
    // Hidden until pinned: while page 3 scrolls in, Ganesha's exit plays behind it and the
    // world reaches black exactly as it pins, so the title starts at once (Rajesh).
    let stageShown = '' // opacity, not visibility: the intro canvas sets its own visibility
    const setCovered = (v: boolean) => {
      if (v === covered) return
      covered = v
      window.dispatchEvent(new CustomEvent('galaxy:pause', { detail: v }))
    }
    // CUT-OUT TITLE (his design, 22 Nov 2026), drawn on ONE 2D canvas (the SVG mask was
    // rebuilt by Safari every frame — lag + blur; his "not smooth at all"). Per frame, only
    // when the scroll moved it: black cover → cut the word out (destination-out) so the
    // tree shows through → solid gold letters while rising → gold outline. Canvas text is
    // drawn as vectors at any zoom, so it stays sharp.
    const FONT_FAMILY = '"Bodoni Moda Variable", "Bodoni Moda", Didot, Georgia, serif'
    const WORD = 'Bride & Groom'
    let introKey = ''
    let baseScale = 1
    let wordW = 0
    let wordH = 0
    let measuredFor = ''
    let cw = 0
    let ch = 0
    let introVis = ''
    let lastDpr = 0
    let prevBox: [number, number, number, number] | null = null // last drawn word box (canvas px)
    const updateIntro = (t: number, W: number, H: number) => {
      const cv = introRef.current
      if (!cv) return
      const fadeIn = MathUtils.clamp(t, 0, 1)
      const grow = MathUtils.clamp(t - 1, 0, 1)
      const done = grow >= 1
      const vis = done ? 'hidden' : 'visible'
      if (vis !== introVis) {
        introVis = vis
        cv.style.visibility = vis
      }
      if (done) {
        introClip.mode = 'full'
        return
      }
      const ctx = cv.getContext('2d')
      if (!ctx) return
      // Fit the word to ~60% of the screen width (measured at 100px, once per size).
      if (measuredFor !== `${W}x${H}`) {
        ctx.font = `900 100px ${FONT_FAMILY}`
        const m = ctx.measureText(WORD)
        wordW = m.width
        wordH = (m.actualBoundingBoxAscent || 70) + (m.actualBoundingBoxDescent || 2)
        if (wordW > 0) {
          baseScale = Math.min((0.6 * W) / wordW, (0.36 * H) / wordH)
          measuredFor = `${W}x${H}`
        }
      }
      // Rise: slides up from just under the bottom edge with a cubic ease-out, then the
      // zoom starts at once (×1 → ×56, exponential = a steady-feeling zoom).
      const shown = smooth(0, 0.08, fadeIn)
      const rise = (1 - fadeIn) ** 3 * (0.5 * H + 0.3 * wordH * baseScale)
      const zoom = Math.exp(grow * Math.log(56))
      const coverA = 1 - smooth(0.55, 1, grow)
      const goldA = shown * (1 - smooth(0, 0.18, grow))
      const lineA = shown * (1 - smooth(0, 0.28, grow)) // gone before huge zoom (strokes broke into dashes)
      const k = baseScale * zoom
      const cxS = W / 2
      const cyS = H / 2 + rise
      const hw = (wordW * k) / 2 + 30
      const hh = ((m0Asc + m0Desc) * k) / 2 + 30
      // Tell the tree what it must draw: nothing while solid gold fills every hole, only
      // the word's box while the black cover is opaque, everything once it fades.
      if (coverA < 0.995) introClip.mode = 'full'
      else if (goldA > 0.995 || shown < 0.005) introClip.mode = 'none'
      else {
        introClip.mode = 'rect'
        introClip.x0 = cxS - hw
        introClip.x1 = cxS + hw
        introClip.y0 = cyS - hh
        introClip.y1 = cyS + hh
      }
      // 2× while the letters fit on screen; 1× once they're larger than it (the edges are
      // then so big that 1× is indistinguishable, and it's a quarter of the pixels).
      const big = hw * 2 > W * 1.5
      const dpr = big ? 1 : Math.min(2, window.devicePixelRatio || 1)
      if (dpr !== lastDpr || cw !== Math.round(W * dpr) || ch !== Math.round(H * dpr)) {
        lastDpr = dpr
        cw = Math.round(W * dpr)
        ch = Math.round(H * dpr)
        cv.width = cw
        cv.height = ch
        introKey = ''
        prevBox = null
      }
      const key = `${cw}|${ch}|${k.toFixed(4)}|${rise.toFixed(1)}|${shown.toFixed(3)}|${coverA.toFixed(3)}|${goldA.toFixed(3)}|${lineA.toFixed(3)}`
      if (key === introKey) return
      const fullRedraw = introKey === '' || coverA < 0.999 || prevBox === null
      introKey = key

      // Text is drawn at 100px in a scaled space centred on (cxS, cyS); the visual middle of
      // the letters sits on cyS.
      const midY = (m0Asc - m0Desc) / 2
      // Only the area the word covered last frame or covers now changes while the cover is
      // solid black — clear + refill just that (was 2 full-screen passes every frame).
      const box: [number, number, number, number] = [
        Math.max(0, Math.floor((cxS - hw) * dpr)),
        Math.max(0, Math.floor((cyS - hh) * dpr)),
        Math.min(cw, Math.ceil((cxS + hw) * dpr)),
        Math.min(ch, Math.ceil((cyS + hh) * dpr)),
      ]
      let rx0 = 0
      let ry0 = 0
      let rx1 = cw
      let ry1 = ch
      if (!fullRedraw && prevBox) {
        rx0 = Math.min(prevBox[0], box[0])
        ry0 = Math.min(prevBox[1], box[1])
        rx1 = Math.max(prevBox[2], box[2])
        ry1 = Math.max(prevBox[3], box[3])
      }
      prevBox = box
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.save()
      ctx.beginPath()
      ctx.rect(rx0, ry0, rx1 - rx0, ry1 - ry0)
      ctx.clip()
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
      ctx.clearRect(rx0, ry0, rx1 - rx0, ry1 - ry0)
      ctx.fillStyle = '#000'
      ctx.globalAlpha = coverA
      ctx.fillRect(rx0, ry0, rx1 - rx0, ry1 - ry0)
      ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * cxS, dpr * cyS)
      ctx.font = `900 100px ${FONT_FAMILY}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      // Cut the word out of the cover → the tree shows through the letters.
      ctx.globalCompositeOperation = 'destination-out'
      ctx.globalAlpha = shown
      ctx.fillText(WORD, 0, midY)
      ctx.globalCompositeOperation = 'source-over'
      // Solid gold while rising; dissolves once the zoom starts.
      if (goldA > 0.002) {
        const gr = ctx.createLinearGradient(0, midY - m0Asc, 0, midY + m0Desc)
        gr.addColorStop(0, '#fff3c4')
        gr.addColorStop(0.5, '#e9c46a')
        gr.addColorStop(1, '#b8862f')
        ctx.globalAlpha = goldA
        ctx.fillStyle = gr
        ctx.fillText(WORD, 0, midY)
      }
      // Gold outline (blossom colour) + a soft wide glow stroke under it.
      if (lineA > 0.002) {
        ctx.strokeStyle = '#ffeea0'
        ctx.lineJoin = 'round'
        ctx.globalAlpha = lineA * 0.18
        ctx.lineWidth = 7 / k
        ctx.strokeText(WORD, 0, midY)
        ctx.globalAlpha = lineA
        ctx.lineWidth = 1.3 / k
        ctx.strokeText(WORD, 0, midY)
      }
      ctx.restore()
      ctx.globalAlpha = 1
    }
    let m0Asc = 70
    let m0Desc = 2
    const measureGlyphs = () => {
      const c = introRef.current?.getContext('2d')
      if (!c) return
      c.font = `900 100px ${FONT_FAMILY}`
      const m = c.measureText(WORD)
      m0Asc = m.actualBoundingBoxAscent || 70
      m0Desc = m.actualBoundingBoxDescent || 2
      measuredFor = ''
      introKey = ''
    }
    measureGlyphs()
    // Re-measure once the Bodoni font has loaded (the fallback font is a different width).
    document.fonts?.load(`900 100px ${FONT_FAMILY}`).then(measureGlyphs, () => {})
    document.fonts?.ready.then(measureGlyphs)

    let prev = -1
    let lastRowKey = ''
    const written = PHOTOS.map(() => ({ vis: '', layer: '', z: '', hov: '', op: '', tf: '' }))
    bgFx.mounted = true
    const tick = (now: number) => {
      const dt = prev < 0 ? 0 : Math.min((now - prev) / 1000, 0.1)
      prev = now
      // ALL geometry reads first (before any style write this frame) — no forced layout.
      const r = el.getBoundingClientRect()
      const sr = stage.getBoundingClientRect()
      const W = stage.clientWidth
      const H = stage.clientHeight
      // The opaque petals fill the screen while the stage is pinned: pause the galaxy behind.
      setCovered(r.top <= 0 && r.bottom >= window.innerHeight)
      const show = reduced || r.top <= 0.5 ? '1' : '0'
      if (show !== stageShown) {
        stageShown = show
        stage.style.opacity = show
      }
      const pinSpan = Math.max(1, r.height - window.innerHeight)
      const slideSpan = pinSpan * SLIDE_SHARE
      bgFx.top = el.offsetTop
      bgFx.span = slideSpan
      bgFx.target = UNITS * MathUtils.clamp(-r.top / slideSpan, 0, 1)
      stepBgFx(dt, reduced)
      const Tall = bgFx.pan
      // Intro: the cut-out title (see updateIntro). The next beat starts at HANDOFF — while
      // the cover is still fading — so the reveal flows straight into the pan, no rest.
      updateIntro(Tall, W, H)
      const T = Math.max(0, Tall - HANDOFF)
      const pan = Math.min(1, T)
      // The pan, in WHOLE device pixels (was a % in CSS, which landed between pixels and
      // left everything inside — the photos too — slightly soft; his "blur when I scroll").
      const dprP = window.devicePixelRatio || 1
      const cx = Math.round(pan * 0.3 * W * dprP) / dprP
      const cy = Math.round(pan * 0.3 * H * dprP) / dprP
      const pk = `${cx}|${cy}`
      if (pk !== lastPan && panRef.current) {
        lastPan = pk
        // Directly on the panning layer (an inherited CSS variable on the section made the
        // whole subtree restyle every frame).
        panRef.current.style.transform = `translate3d(${-cx}px, ${-cy}px, 0)`
      }
      // The petals' layer rect on screen (= stage − pan; the layer is 130% of the stage),
      // handed to them so they don't measure it after our writes.
      const pr = petalsRect.current
      pr.left = sr.left - cx
      pr.top = sr.top - cy
      pr.width = W * 1.3
      pr.height = H * 1.3
      // Photos live inside the panning layer (between sky and tree), so they carry the
      // opposite of the pan (cx, cy) to stay put on screen.
      const kH = 1 - Math.exp(-dt * 8)

      // ONE ROW of photos (Rajesh, 22 Nov 2026): each next photo waits just right of the
      // current one (small gap — his red mark), and the whole row slides LEFT continuously
      // as you scroll. A photo that slides past its resting place goes behind the blossoms
      // and dissolves. No 3D turn. The row arrives with the first slide (bottom-right).
      const gap = MathUtils.clamp(0.022 * W, 18, 40)
      // Linear in T, exactly like the petals pan: the governor already eases the start and
      // stop, so easing again here made the middle of the slide rush.
      const e0 = MathUtils.clamp(T, 0, 1)
      const S = MathUtils.clamp(T - 1, 0, PHOTOS.length - 1) // row position, in photos
      const f0 = figs.current[0]
      if (!f0) {
        petalsDrive.current?.(now)
        return
      }
      // Photos: nothing to redo when the timeline, pan and screen are unchanged and no
      // photo is hovered or settling from a hover.
      const anyHover = hover.current.some((h) => h.on || h.ca > 0)
      const rowKey = `${T.toFixed(5)}|${cx}|${cy}|${W}|${H}`
      if (rowKey === lastRowKey && !anyHover) {
        petalsDrive.current?.(now)
        return
      }
      lastRowKey = rowKey
      // Layout in JS, in WHOLE device pixels (CSS %/vw positions landed between pixels and
      // looked soft while scrolling). Same sizes/places the CSS used to give:
      //   landscape screen: right edge 9vw from the right, top under the title;
      //   portrait screen: centred.  Width = min(62vh·ar, 60vw·ar, 44vw) | min(74vw, 46vh·ar).
      const vwPx = window.innerWidth / 100
      const vhPx = window.innerHeight / 100
      const portrait = window.innerWidth <= window.innerHeight
      const snap = (v: number) => Math.round(v * dprP) / dprP
      const ws: number[] = []
      const hs: number[] = []
      for (let i = 0; i < PHOTOS.length; i++) {
        const ar = PHOTOS[i].w / PHOTOS[i].h
        const w = snap(
          portrait ? Math.min(74 * vwPx, 46 * vhPx * ar) : Math.min(62 * vhPx * ar, 60 * vwPx * ar, 44 * vwPx),
        )
        const h = snap(w / ar)
        ws.push(w)
        hs.push(h)
        const f = figs.current[i]
        if (f && f.dataset.size !== `${w}x${h}`) {
          f.dataset.size = `${w}x${h}`
          f.style.width = `${w}px`
          f.style.height = `${h}px`
        }
      }
      const topPx =
        MathUtils.clamp(11 * vhPx, 72, 112) + MathUtils.clamp(5.4 * vwPx, 35.2, 70.4) + 40
      const x0 = portrait ? (W - ws[0]) / 2 : W - 9 * vwPx - ws[0]
      const H0 = hs[0]
      // Cumulative left offsets of each photo in the row, and the row's shift for S.
      let acc = 0
      let shift = 0
      const off: number[] = []
      for (let i = 0; i < PHOTOS.length; i++) {
        const w = ws[i]
        off.push(acc)
        if (S > i) shift += Math.min(1, S - i) * (w + gap)
        acc += w + gap
      }
      // Arrival path flows straight into the row's leftward slide — no rest at the top
      // (his ask, 22 Nov 2026). Horizontal: A·u + B·u² so that at arrival (u = 0) it is
      // already moving left at exactly the row's speed (one photo + gap per unit).
      // Vertical: u² — the upward travel eases out instead of stopping dead.
      const u = 1 - e0
      const A = ws[0] + gap
      const enterX = A * u + (0.45 * W - A) * u * u
      const enterY = 0.8 * H * u * u
      for (let i = 0; i < PHOTOS.length; i++) {
        const f = figs.current[i]
        if (!f) continue
        const w = ws[i]
        // How far this photo has slid past its resting place (0 → 1 = one photo + gap).
        const past = (shift - off[i]) / (w + gap)
        const shown = e0 > 0.001 && past < 1.799
        const lw = written[i]
        const put = (k: keyof typeof lw, v: string, apply: (v: string) => void) => {
          if (lw[k] !== v) {
            lw[k] = v
            apply(v)
          }
        }
        put('vis', shown ? 'visible' : 'hidden', (v) => (f.style.visibility = v))
        if (!shown) continue
        const dx = x0 + off[i] - shift + enterX
        const dy = topPx + (H0 - hs[i]) / 2 + enterY
        const front = past <= 0.001
        put('layer', front ? 'front' : 'behind', (v) => (f.dataset.layer = v))
        put('z', front ? '4' : '1', (v) => (f.style.zIndex = v))
        // Hover (tilt, lift, ghost glow) works on every photo still on screen, including the
        // ones leaving behind the tree (his ask) — off only once it has almost dissolved.
        const hoverable = past < 1.65
        put('hov', hoverable ? 'true' : 'false', (v) => (f.dataset.hoverable = v))
        // Fade only once it's well behind the blossoms (his ask): from ~1 to 1.8 photos past.
        put('op', (1 - smooth(0.9, 1.8, past)).toFixed(3), (v) => (f.style.opacity = v))
        if (!hoverable && f.dataset.hover) {
          hover.current[i].on = false
          delete f.dataset.hover
        }
        const h = hover.current[i]
        const on = h.on && hoverable && !reduced
        h.cx += ((on ? h.tx : 0) - h.cx) * kH
        h.cy += ((on ? h.ty : 0) - h.cy) * kH
        h.ca += ((on ? 1 : 0) - h.ca) * kH
        if (!on && h.ca < 0.002) h.ca = h.cx = h.cy = 0 // settle fully → back to plain 2D
        const tiltX = -h.cy * 6 * h.ca
        const tiltY = h.cx * 6 * h.ca
        const lift = 1 + 0.03 * h.ca
        // Behind the tree: turn away in 3D while it dissolves (his ask, 22 Nov 2026).
        const turn = smooth(0.9, 1.8, past) // starts halfway (0.15 was too early), with the fade
        const exitRy = turn * -70 // turns the other way (his ask; +70 was the first try)
        const exitScale = 1 - 0.15 * turn
        // Crisp while moving (his ask: photos blurred in motion): snap to whole device
        // pixels, and use 3D (perspective/rotate/scale) only while actually tilting or
        // turning — Safari resamples 3D layers as soft textures.
        const X = snap(cx + dx)
        const Y = snap(cy + dy)
        const ryAll = tiltY + exitRy
        const sc = lift * exitScale
        const flat = Math.abs(ryAll) < 0.01 && Math.abs(tiltX) < 0.01 && Math.abs(sc - 1) < 0.0005
        const tfv = flat
          ? `translate3d(${X}px, ${Y}px, 0)`
          : `translate3d(${X}px, ${Y}px, 0) perspective(1200px) rotateY(${ryAll.toFixed(2)}deg) ` +
            `rotateX(${tiltX.toFixed(2)}deg) scale(${sc.toFixed(4)})`
        put('tf', tfv, (v) => (f.style.transform = v))
      }
      petalsDrive.current?.(now)
    }
    // On GSAP's ticker, which runs Lenis FIRST (prioritised in LenisProvider), so every
    // frame reads the scroll Lenis just set — no frame-to-frame judder.
    const onTick = (time: number) => tick(time * 1000)
    gsap.ticker.add(onTick)
    return () => {
      gsap.ticker.remove(onTick)
      setCovered(false)
      bgFx.mounted = false
    }
  }, [])

  return (
    <section
      ref={(node) => {
        local.current = node
        sectionRef.current = node
      }}
      id="story"
      tabIndex={-1}
      aria-labelledby="bg-title"
      className="bride-groom"
      // No gold ghost glow on page 3 except on the photos (data-ghost-soft, reduced).
      data-no-ghost-zone
    >
      <div className="bg-stage" ref={stageRef}>
        <div className="bg-pan" ref={panRef}>
          {/* treeShift: tree + flowers sit a little further left, more room for the photos
              (his ask, 22 Nov 2026). */}
          <MoonlitPetals {...MOONLIT_PRESET} maxDpr={quality.dpr[1]}
            treeShift={0.09}
            viewClip={introClip}
            driveRef={petalsDrive}
            rectRef={petalsRect}
          >
            {PHOTOS.map((p, i) => (
              // data-ghost-soft: the gold cursor glow shows on the photo, reduced.
              // The photos themselves: natural colours, no filter.
              <figure
                key={p.photo}
                ref={(n) => {
                  figs.current[i] = n
                }}
                className="bg-photo"
                // The photo is the figure's own background (see CSS: Safari 3D fix).
                style={
                  {
                    '--ar': p.w / p.h,
                    visibility: 'hidden',
                    backgroundImage: `url(${import.meta.env.BASE_URL}${p.photo})`,
                  } as CSSProperties
                }
                role="img"
                aria-label={p.alt}
                onContextMenu={(e) => e.preventDefault()}
                data-ghost-soft
                data-layer="front"
                onPointerMove={onPhotoMove(i)}
                onPointerLeave={onPhotoLeave(i)}
              >
                {/* Outline markers for the ghost glow's clip (GoldGhost), clockwise. */}
                {GHOST_CORNERS.map((c) => (
                  <span key={c} className={`bg-ghost-pt bg-ghost-pt--${c}`} data-ghost-corner aria-hidden />
                ))}
              </figure>
            ))}
          </MoonlitPetals>
        </div>
        {/* The cut-out title over the tree (intro), drawn on a canvas — see updateIntro. */}
        <canvas ref={introRef} className="bg-intro" aria-hidden />
        {/* No visible title after the reveal (his pick); kept for screen readers. */}
        <h2 id="bg-title" className="bg-title-sr">
          Bride &amp; Groom
        </h2>
      </div>
    </section>
  )
}
