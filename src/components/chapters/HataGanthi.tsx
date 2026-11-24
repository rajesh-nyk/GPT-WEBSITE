import { useEffect, useRef, useState } from 'react'
import { HATA_GANTHI } from '../../content/wedding'
import { useReducedMotion } from '../../lib/useReducedMotion'

/**
 * HATA GANTHI — the emotional peak: you bring their hands together and tie them.
 *
 *  - Two gold line drawings (bride from the left, palm down, with mehendi and bangles;
 *    groom from the right, palm open). A red-and-gold cord hangs from each wrist and
 *    sways.
 *  - Drag (mouse or finger, horizontally, either hand) or use the button: the hands slide
 *    together. Let go early and they ease apart again. Past the point of meeting, her
 *    palm settles onto his and the tying plays: the two cords wind three times around
 *    both hands (each loop passing behind and in front), close into a knot, two mango
 *    leaves unfold from it, and a warm glow blooms.
 *  - The three lines arrive in step: the first as the hands start to meet, the second as
 *    her palm settles, the third when the knot is tied.
 *  - Everything is one SVG (the drawings are <image>s in it), so hands, cords and knot
 *    scale together perfectly at any size. Reduced motion: shown already tied.
 *
 * Geometry is in the drawings' own pixels (1376×768); see the constants below.
 */
const IMG = { w: 1376, h: 768 }
const VB = { w: 1600, h: 640 }
/** Phones: frame the meeting point tightly so the hands fill the width. */
const VB_NARROW = { x: 330, y: 70, w: 960, h: 520 }
const SPREAD_NARROW = 300
const J = { x: 800, y: 300 } // where the hands meet
const SPREAD = 430 // how far apart each hand starts
// Bride: back-of-hand centre (620, 380) sits just above the joint; bangle bottom = cord anchor.
const BRIDE = { at: [620, 380], lift: -24, anchor: [330, 492] }
// Groom: palm centre (790, 392) just below the joint; bracelet bottom = cord anchor.
const GROOM = { at: [790, 392], drop: 16, anchor: [1022, 476] }
const LOOPS = [744, 790, 836] // x of the three wraps, over the stacked palms
const LOOP_CY = 284 // vertical centre of both hands together
const LOOP_RY = 134
const LOOP_RX = 30
const KNOT = { x: 790, y: 150 }

const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

export function HataGanthi() {
  const reducedMotion = useReducedMotion()
  const stage = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const state = useRef({ p: 0, target: 0, dragging: false, side: 1, startX: 0, startP: 0, w: 1, tie: 0, tying: false })
  const [joined, setJoined] = useState(false)
  const [tied, setTied] = useState(false)
  const [touched, setTouched] = useState(false)
  const [line, setLine] = useState(0) // how many of the three lines are showing
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 40rem)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 40rem)')
    const on = () => setNarrow(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const spreadRef = useRef(SPREAD)
  spreadRef.current = narrow ? SPREAD_NARROW : SPREAD

  // Reduced motion: already tied.
  useEffect(() => {
    if (!reducedMotion) return
    const s = state.current
    s.p = s.target = 1
    s.tie = 1
    setJoined(true)
    setTied(true)
    setLine(3)
  }, [reducedMotion])

  // Animation loop: positions, cords, tying. Writes SVG attributes directly (no renders).
  useEffect(() => {
    const root = svg.current
    if (!root) return
    const q = <T extends Element>(sel: string) => root.querySelector(sel) as T
    const bride = q<SVGGElement>('.hg-bride')
    const groom = q<SVGGElement>('.hg-groom')
    const cordB = [...root.querySelectorAll<SVGPathElement>('.hg-cord-b')]
    const cordG = [...root.querySelectorAll<SVGPathElement>('.hg-cord-g')]
    const loops = [...root.querySelectorAll<SVGPathElement>('.hg-loop')]
    const knot = q<SVGGElement>('.hg-knot')
    const glow = q<SVGCircleElement>('.hg-glow')
    let raf = 0
    let last = performance.now()
    let t = 0
    const s = state.current
    const tiedRef = { current: s.tie >= 1 }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      t += dt
      // Ease p toward target (drag sets target directly; release springs).
      const k = s.dragging ? 1 - Math.exp(-dt * 30) : 1 - Math.exp(-dt * 5)
      s.p += (s.target - s.p) * k
      if (Math.abs(s.target - s.p) < 1e-4) s.p = s.target
      const e = easeInOut(clamp01(s.p))
      const d = (1 - e) * spreadRef.current

      // Hands.
      const bx = J.x - BRIDE.at[0] - d
      const by = J.y - BRIDE.at[1] + BRIDE.lift * e - 18 * (1 - e)
      const gx = J.x - GROOM.at[0] + d
      const gy = J.y - GROOM.at[1] + GROOM.drop * e + 10 * (1 - e)
      bride.setAttribute('transform', `translate(${bx} ${by})`)
      groom.setAttribute('transform', `translate(${gx} ${gy})`)

      // Tying progress (plays once joined).
      if (s.tying && s.tie < 1) s.tie = Math.min(1, s.tie + dt / 2.6)
      const tie = s.tie

      // Hanging cords: anchored at each wrist, swaying; they draw up into the knot as it ties.
      const hang = 1 - clamp01(tie * 1.6)
      const sway = Math.sin(t * 1.3) * 14 + Math.sin(t * 2.1) * 5
      const ab = [BRIDE.anchor[0] + bx, BRIDE.anchor[1] + by]
      const ag = [GROOM.anchor[0] + gx, GROOM.anchor[1] + gy]
      const len = 150 * hang
      const cb = `M${ab[0]} ${ab[1]} C${ab[0] + 6} ${ab[1] + len * 0.45} ${ab[0] + sway * 0.6} ${ab[1] + len * 0.8} ${ab[0] + sway} ${ab[1] + len}`
      const cg = `M${ag[0]} ${ag[1]} C${ag[0] - 6} ${ag[1] + len * 0.45} ${ag[0] - sway * 0.6} ${ag[1] + len * 0.8} ${ag[0] - sway} ${ag[1] + len}`
      for (const c of cordB) c.setAttribute('d', cb)
      for (const c of cordG) c.setAttribute('d', cg)
      const cordOpacity = String(hang > 0.02 ? 1 : 0)
      for (const c of [...cordB, ...cordG]) c.style.opacity = cordOpacity

      // Loops wind on one after another, then the knot and leaves.
      loops.forEach((l, i) => {
        const li = clamp01((tie - 0.08 - (i % 3) * 0.16) / 0.3)
        if (l.classList.contains('hg-loop--twist')) {
          l.style.opacity = String(li * li) // the gold twist settles in as each wrap lands
        } else {
          l.style.strokeDashoffset = String(1 - li)
          l.style.opacity = li > 0 ? '1' : '0'
        }
      })
      const kn = clamp01((tie - 0.62) / 0.3)
      knot.style.opacity = String(kn)
      knot.setAttribute('transform', `translate(${KNOT.x} ${KNOT.y}) scale(${0.6 + 0.4 * easeInOut(kn)})`)
      glow.style.opacity = String(0.15 * e + 0.55 * clamp01((tie - 0.5) / 0.5))

      if (s.tying && tie >= 1 && !tiedRef.current) {
        tiedRef.current = true
        setTied(true)
        setLine(3)
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Milestones from p (lines 1 and 2; joining starts the tie).
  useEffect(() => {
    let raf = 0
    const watch = () => {
      raf = requestAnimationFrame(watch)
      const s = state.current
      if (s.p > 0.3) setLine((n) => Math.max(n, 1))
      if (s.p > 0.97 && !s.tying) {
        s.tying = true
        s.target = 1
        setJoined(true)
        setLine((n) => Math.max(n, 2))
      }
    }
    raf = requestAnimationFrame(watch)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Pointer: drag either hand toward the other (horizontal only; vertical swipes scroll).
  const onDown = (e: React.PointerEvent) => {
    const s = state.current
    if (s.tying) return
    const r = stage.current!.getBoundingClientRect()
    s.dragging = true
    s.w = r.width
    s.startX = e.clientX
    s.startP = s.p
    s.side = e.clientX < r.left + r.width / 2 ? 1 : -1
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    setTouched(true)
  }
  const onMove = (e: React.PointerEvent) => {
    const s = state.current
    if (!s.dragging) return
    const dx = (e.clientX - s.startX) * s.side
    s.target = clamp01(s.startP + dx / (s.w * 0.42))
  }
  const onUp = () => {
    const s = state.current
    if (!s.dragging) return
    s.dragging = false
    if (s.target > 0.82) s.target = 1 // close enough: they meet
    else s.target = 0 // ease apart again
  }
  const join = () => {
    const s = state.current
    setTouched(true)
    s.target = 1
    // The button goes away once they're joined: keep keyboard focus on the scene.
    stage.current?.focus({ preventScroll: true })
  }

  const base = import.meta.env.BASE_URL
  return (
    <div className="ganthi" role="group" aria-labelledby="ganthi-title">
      <p lang="or" className="ganthi-odia font-odia" data-reveal>
        {HATA_GANTHI.odia}
      </p>
      <h3 id="ganthi-title" className="ganthi-name font-inscription" data-reveal>
        {HATA_GANTHI.name}
      </h3>

      <div
        ref={stage}
        tabIndex={-1}
        style={{ aspectRatio: narrow ? `${VB_NARROW.w} / ${VB_NARROW.h}` : `${VB.w} / ${VB.h}` }}
        className="hg-stage"
        data-joined={joined}
        data-tied={tied}
        data-lenis-prevent-touch
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <svg
          ref={svg}
          viewBox={narrow ? `${VB_NARROW.x} ${VB_NARROW.y} ${VB_NARROW.w} ${VB_NARROW.h}` : `0 0 ${VB.w} ${VB.h}`}
          className="hg-svg"
          role="img"
          aria-label={
            tied
              ? "The bride's hand rests on the groom's hand, tied together with a sacred red and gold thread and mango leaves."
              : "The bride's and the groom's hands, apart, each with a sacred thread at the wrist."
          }
        >
          <defs>
            <radialGradient id="hgGlow">
              <stop offset="0" stopColor="#ffb347" stopOpacity="0.55" />
              <stop offset="1" stopColor="#ffb347" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="hgLeaf" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#3f8a2c" />
              <stop offset="1" stopColor="#0f4a1c" />
            </linearGradient>
          </defs>
          <circle className="hg-glow" cx={790} cy={LOOP_CY} r={narrow ? 205 : 265} fill="url(#hgGlow)" style={{ opacity: 0 }} />

          {/* back halves of the loops: behind both hands */}
          {LOOPS.map((x) => (
            <path key={`b${x}`} className="hg-loop hg-loop--back" pathLength={1} d={loopArc(x, false)} />
          ))}

          <g className="hg-groom">
            <image href={`${base}ganthi/groom-hand.webp`} width={IMG.w} height={IMG.h} />
          </g>
          <g className="hg-bride">
            <image href={`${base}ganthi/bride-fill.webp`} width={IMG.w} height={IMG.h} />
            <image href={`${base}ganthi/bride-hand.webp`} width={IMG.w} height={IMG.h} />
          </g>

          {/* hanging cords: sindoor red with a gold twist */}
          <path className="hg-cord hg-cord-b" />
          <path className="hg-cord hg-cord-twist hg-cord-b" />
          <path className="hg-cord hg-cord-g" />
          <path className="hg-cord hg-cord-twist hg-cord-g" />

          {/* front halves of the loops: over both hands */}
          {LOOPS.map((x) => (
            <path key={`f${x}`} className="hg-loop" pathLength={1} d={loopArc(x, true)} />
          ))}
          {LOOPS.map((x) => (
            <path key={`t${x}`} className="hg-loop hg-loop--twist" pathLength={1} d={loopArc(x, true)} />
          ))}

          <g className="hg-knot" style={{ opacity: 0 }}>
            <path className="hg-leaf" d="M0 0 C -40 -18 -92 -10 -128 -44 C -84 -58 -34 -44 0 0 Z" />
            <path className="hg-leaf-vein" d="M0 0 C -40 -24 -86 -30 -126 -44" />
            <path className="hg-leaf" d="M0 0 C 40 -18 92 -10 128 -44 C 84 -58 34 -44 0 0 Z" />
            <path className="hg-leaf-vein" d="M0 0 C 40 -24 86 -30 126 -44" />
            <path className="hg-tail" d="M-4 4 C -14 34 -6 64 -18 96" />
            <path className="hg-tail" d="M4 4 C 16 32 10 66 22 92" />
            <circle className="hg-knot-core" r="11" />
          </g>
        </svg>
      </div>

      <div className="hg-controls">
        {!touched && !tied && (
          <p className="hg-hint font-inscription" aria-hidden>
            <span className="hg-hint-touch">Slide the hands together</span>
            <span className="hg-hint-mouse">Drag the hands together</span>
          </p>
        )}
        {!joined && (
          <button type="button" className="hg-join font-inscription" onClick={join}>
            Join their hands
          </button>
        )}
      </div>

      <div className="hg-lines" aria-live="polite">
        {HATA_GANTHI.lines.map((l, i) => (
          <p key={l} className="ganthi-line" data-on={line > i}>
            {l}
          </p>
        ))}
      </div>
    </div>
  )
}

/** One wrap of the cord around both hands, seen side-on: a tall narrow ellipse. The front
 *  half passes over the hands, the back half behind them. */
function loopArc(x: number, front: boolean) {
  const top = LOOP_CY - LOOP_RY
  const bottom = LOOP_CY + LOOP_RY
  const s = front ? 1 : -1
  return `M${x} ${top} C ${x + s * LOOP_RX * 1.35} ${top + 30} ${x + s * LOOP_RX * 1.35} ${bottom - 30} ${x} ${bottom}`
}
