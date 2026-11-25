import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector2 } from 'three'
import { gsap, ScrollTrigger } from '../../lib/gsap'
import { useReducedMotion } from '../../lib/useReducedMotion'
import { SceneCanvas } from '../three/SceneCanvas'
import { WorldBackdrop } from './WorldBackdrop'
import { GalaxyStars } from './GalaxyStars'

// CSS wipe publishes its exact local geometry; no layout read is needed per frame.
export const skyWipe = { shift: 0, lead: 0 }
const skyClipTop = new Vector2(1, 1)

function SkyScene() {
  const reducedMotion = useReducedMotion()
  const stats = useRef({ frames: 0, elapsed: 0 })
  const gl = useThree((s) => s.gl)
  const geometry = useRef<{ top: number; height: number; heroBottom: number } | null>(null)
  useEffect(() => {
    const canvas = gl.domElement
    const hero = document.getElementById('hero')
    const measure = () => {
      const rect = canvas.getBoundingClientRect()
      const y = window.scrollY
      geometry.current = { top: rect.top + y, height: rect.height, heroBottom: hero ? hero.getBoundingClientRect().bottom + y : Infinity }
    }
    const observer = new ResizeObserver(measure)
    observer.observe(canvas)
    if (hero) observer.observe(hero)
    window.addEventListener('resize', measure)
    ScrollTrigger.addEventListener('refresh', measure)
    measure()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
      ScrollTrigger.removeEventListener('refresh', measure)
      gl.setScissorTest(false)
    }
  }, [gl])
  useFrame(({ size }, delta) => {
    // Keep full-size projection and pixel density, but shade only rows inside
    // the viewport. The canvas is opaque and has no postprocessing, so pixels
    // outside this rectangle cannot contribute to the visible image.
    // The CSS diagonal clip remains authoritative (scissor is conservative).
    const measured = geometry.current
    const y = window.scrollY
    if (!reducedMotion && measured && measured.height > 0 && size.height > 0) {
      // The top two vertices follow the CSS clip, with a conservative 6px guard.
      // UV and fragment coordinates stay anchored to the original full-size canvas.
      const overhang = measured.heroBottom - measured.top
      const left = Math.max(0, Math.min(measured.height, overhang + skyWipe.shift - 6))
      const right = Math.max(0, Math.min(measured.height, overhang + skyWipe.shift - skyWipe.lead - 6))
      if (Number.isFinite(overhang)) skyClipTop.set(1 - 2 * left / measured.height, 1 - 2 * right / measured.height)
      else skyClipTop.set(1, 1)
      const ratio = size.height / measured.height
      const rectTop = measured.top - y
      const top = Math.max(0, Math.floor(-rectTop * ratio) - 2)
      const bottom = Math.min(size.height, Math.ceil((window.innerHeight - rectTop) * ratio) + 2)
      const height = Math.max(0, bottom - top)
      if (height > 0) {
        gl.setScissor(0, size.height - bottom, size.width, height)
        gl.setScissorTest(true)
      } else gl.setScissorTest(false)
    } else {
      gl.setScissorTest(false)
      skyClipTop.set(1, 1)
    }
    // The section begins after the hero, and the canvas includes its overhang.
    // Read the hero only when needed for the HUD; do not change its ownership.
    if (!measured || measured.heroBottom > y || delta > .5) {
      stats.current.frames = stats.current.elapsed = 0
      return
    }
    const s = stats.current
    s.frames++
    s.elapsed += delta
    if (s.elapsed < .5) return
    const fps = s.frames / s.elapsed
    const hud = document.getElementById('scene-fps')
    if (hud) {
      hud.textContent = Math.round(fps) + ' FPS'
      hud.removeAttribute('title')
      hud.dataset.rate = fps >= 58 ? 'good' : fps >= 45 ? 'fair' : 'low'
    }
    document.documentElement.dataset.pageFps = fps.toFixed(1)
    s.frames = s.elapsed = 0
  }, -2)
  return (
    <>
      <WorldBackdrop continuous sunless clipTop={skyClipTop} />
      <GalaxyStars reducedMotion={reducedMotion} continuous skipIntro clipTop={skyClipTop} />
    </>
  )
}

/** Same procedural sky as the hero, without the sun or wheel. No bloom composer
 * is needed for the sky-only chapter; the canvas pauses off-screen. */
export function PageTwoSky() {
  const [active, setActive] = useState(false)
  useEffect(() => {
    let previous = false
    const tick = () => {
      // The diagonal starts exactly outside the viewport; wake before the
      // first visible pixels, and stop when returned to the hero.
      const next = !document.hidden && window.scrollY > 0
      if (next !== previous) {
        previous = next
        setActive(next)
      }
    }
    tick()
    gsap.ticker.add(tick)
    document.addEventListener('visibilitychange', tick)
    return () => {
      gsap.ticker.remove(tick)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])
  return (
    <div className="page-two-sky">
      <SceneCanvas
        label="Sunless night galaxy"
        camera={{ position: [0, 0, 6], fov: 35, near: 0.1, far: 50 }}
        effects={false}
        active={active}
        gl={{ antialias: false }}
      >
        <SkyScene />
      </SceneCanvas>
    </div>
  )
}
