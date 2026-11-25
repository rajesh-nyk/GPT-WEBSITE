import { useEffect, useRef } from 'react'
import { gsap, ScrollTrigger } from '../../lib/gsap'
import { useReducedMotion } from '../../lib/useReducedMotion'

// Bake individual cloud banks once. Runtime animation uses only compositor
// transforms: no new WebGL context, per-frame noise, filters or pixel readback.
function bakeCloud(seed: number) {
  const canvas = document.createElement('canvas')
  const w = 896, h = 448
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const image = ctx.createImageData(w, h)
  const hash = (x: number, y: number) => {
    let n = Math.imul(x + seed * 31, 374761393) + Math.imul(y + seed * 17, 668265263)
    n = Math.imul(n ^ (n >>> 13), 1274126177)
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295
  }
  const smooth = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t) }
  const noise = (x: number, y: number) => {
    const ix = Math.floor(x), iy = Math.floor(y)
    const fx = smooth(x - ix), fy = smooth(y - iy)
    const a = hash(ix, iy), b = hash(ix + 1, iy)
    const c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1)
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy
  }
  const field = (x: number, y: number) => {
    let sum = 0, amp = .52, freq = 1
    for (let i = 0; i < 5; i++) { sum += noise(x * freq, y * freq) * amp; freq *= 2.04; amp *= .49 }
    return sum
  }
  // Uneven overlapping billows, with small-scale turbulence along their edges.
  const lobes = Array.from({ length: 9 }, (_, i) => ({
    x: .11 + i * .095, y: .49 + (hash(i, 99) - .5) * .29,
    rx: .13 + hash(i, 12) * .14, ry: .19 + hash(i, 23) * .22,
  }))
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / w, v = y / h
    let shape = 0
    for (const l of lobes) {
      const dx = (u - l.x) / l.rx, dy = (v - l.y) / l.ry
      shape = Math.max(shape, 1 - dx * dx - dy * dy)
    }
    const n = field(u * 9 + seed * 4, v * 6)
    const edge = shape + (n - .48) * 1.25
    const alpha = smooth(edge * 1.8) * smooth(u * 12) * smooth((1 - u) * 12) * smooth(v * 10) * smooth((1 - v) * 10)
    if (alpha < .003) continue
    const lit = field(u * 9 + seed * 4 - .08, v * 6 - .12)
    const light = smooth(.38 + (n - lit) * 4 + (.52 - v) * .65 + n * .34)
    const silver = Math.pow(light, 2.2)
    const i = (y * w + x) * 4
    image.data[i] = 25 + light * 62 + silver * 57
    image.data[i + 1] = 31 + light * 65 + silver * 57
    image.data[i + 2] = 52 + light * 92 + silver * 51
    image.data[i + 3] = Math.round(alpha * 231)
  }
  ctx.putImageData(image, 0, 0)
  return canvas.toDataURL('image/png')
}

const banks = [
  { x: -.48, y: .82, w: 1.25, depth: .32, opacity: .60, seed: 3 },
  { x: .27, y: .86, w: 1.19, depth: .38, opacity: .66, seed: 7 },
  { x: -.36, y: 1.11, w: 1.44, depth: .58, opacity: .88, seed: 13 },
  { x: .18, y: 1.36, w: 1.55, depth: .72, opacity: .96, seed: 3 },
  { x: -.49, y: 1.66, w: 1.43, depth: .88, opacity: .93, seed: 7 },
  { x: .28, y: 1.85, w: 1.38, depth: 1, opacity: .96, seed: 13 },
] as const

/** One atmospheric layer spans both chapters and crosses the glass seam.
 * The actual document scroll drives depth, so reversing scroll reverses flight.
 * It sits above the chapter backgrounds but remains pointer-transparent. */
export function CloudJourney() {
  const host = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()
  useEffect(() => {
    const el = host.current
    const hero = document.getElementById('hero')
    if (!el || !hero) return
    const nodes = Array.from(el.querySelectorAll<HTMLImageElement>('img'))
    const textures = new Map<number, string>()
    let cancelled = false
    let initialized = false
    let height = hero.offsetHeight
    let width = el.clientWidth
    let lastY = -1
    let lastTime = -1
    const start = performance.now()
    const measure = () => { height = hero.offsetHeight; width = el.clientWidth; lastY = -1 }
    const observer = new ResizeObserver(measure)
    observer.observe(hero)
    observer.observe(el)
    ScrollTrigger.addEventListener('refresh', measure)
    // Yield between texture bakes so the approved preloader can continue.
    let index = 0
    const seeds = [...new Set(banks.map(b => b.seed))]
    let timeout = 0
    const bakeNext = () => {
      if (cancelled) return
      const seed = seeds[index++]
      textures.set(seed, bakeCloud(seed))
      if (index < seeds.length) { timeout = window.setTimeout(bakeNext, 0); return }
      nodes.forEach((node, i) => { node.src = textures.get(banks[i].seed) ?? '' })
      initialized = true
      lastY = -1
      tick()
    }
    const tick = () => {
      if (!initialized || document.hidden || height <= 0 || width <= 0) return
      const scroll = window.scrollY
      const time = reducedMotion ? 0 : (performance.now() - start) / 1000
      if (scroll === lastY && time === lastTime) return
      lastY = scroll; lastTime = time
      const p = Math.max(0, Math.min(1, scroll / height))
      const smooth = p * p * (3 - 2 * p)
      const base = Math.max(width, height * .95)
      nodes.forEach((node, i) => {
        const b = banks[i]
        const scale = reducedMotion ? 1 : 1 + smooth * b.depth * .37
        const drift = reducedMotion ? 0 : Math.sin(time * .075 + i * 1.6) * width * .024
        const cloudW = base * b.w
        const cloudH = cloudW * .5
        const x = width * b.x + drift - (scale - 1) * cloudW * .5
        const y = height * b.y - scroll - (reducedMotion ? 0 : smooth * height * b.depth * .13)
        node.style.width = cloudW + 'px'
        node.style.height = cloudH + 'px'
        node.style.transform = 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0) scale(' + scale.toFixed(4) + ')'
        node.style.opacity = String(b.opacity * (i < 2 ? .57 + smooth * .43 : .9))
      })
      el.style.opacity = '1'
    }
    gsap.ticker.add(tick)
    timeout = window.setTimeout(bakeNext, 0)
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
      gsap.ticker.remove(tick)
      observer.disconnect()
      ScrollTrigger.removeEventListener('refresh', measure)
    }
  }, [reducedMotion])
  return (
    <div className="cloud-journey" ref={host} aria-hidden="true">
      {banks.map((b, i) => <img key={i} alt="" draggable={false} className="cloud-journey__bank" data-depth={b.depth} />)}
    </div>
  )
}
