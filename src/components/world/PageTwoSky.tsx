import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useReducedMotion } from '../../lib/useReducedMotion'
import { SceneCanvas } from '../three/SceneCanvas'
import { WorldBackdrop } from './WorldBackdrop'
import { GalaxyStars } from './GalaxyStars'

function SkyScene() {
  const reducedMotion = useReducedMotion()
  const stats = useRef({ frames: 0, elapsed: 0 })
  useFrame((_, delta) => {
    // Page 1 owns the HUD while visible; Page 2 takes over at its resting stop.
    const hero = document.getElementById('hero')
    if (!hero || hero.getBoundingClientRect().bottom > 0 || delta > .5) {
      stats.current = { frames: 0, elapsed: 0 }
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
  })
  return (
    <>
      <WorldBackdrop continuous sunless />
      <GalaxyStars reducedMotion={reducedMotion} continuous skipIntro />
    </>
  )
}

/** Same procedural sky as the hero, without the sun or wheel. No bloom composer
 * is needed for the sky-only chapter; the canvas pauses off-screen. */
export function PageTwoSky() {
  return (
    <div className="page-two-sky">
      <SceneCanvas
        label="Sunless night galaxy"
        camera={{ position: [0, 0, 6], fov: 35, near: 0.1, far: 50 }}
        effects={false}
      >
        <SkyScene />
      </SceneCanvas>
    </div>
  )
}
