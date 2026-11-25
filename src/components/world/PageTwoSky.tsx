import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MathUtils } from 'three'
import { gsap } from '../../lib/gsap'
import { useQuality } from '../../lib/quality'
import { useReducedMotion } from '../../lib/useReducedMotion'
import { heroFx } from '../hero/fx'
import { Prewarm } from '../three/Prewarm'
import { SceneCanvas } from '../three/SceneCanvas'
import { WorldBackdrop } from './WorldBackdrop'
import { GalaxyStars } from './GalaxyStars'
import { FOOTER_CLOUDS, PageOneFooterClouds } from './PageOneFooterClouds'

export { pageTwoExit } from './pageTwoExit'

function SharedGalaxy() {
  const reducedMotion = useReducedMotion()
  const { tier } = useQuality()
  const stats = useRef({ frames: 0, elapsed: 0 })
  useFrame(({ size }, delta) => {
    const sample = stats.current
    if (window.scrollY < size.height || delta > 0.5) {
      sample.frames = sample.elapsed = 0
      return
    }
    sample.frames++
    sample.elapsed += delta
    if (sample.elapsed < 0.5) return
    const fps = sample.frames / sample.elapsed
    const hud = document.getElementById('scene-fps')
    if (hud) {
      hud.textContent = `${Math.round(fps)} FPS`
      hud.removeAttribute('title')
      hud.dataset.rate = fps >= 58 ? 'good' : fps >= 45 ? 'fair' : 'low'
    }
    document.documentElement.dataset.pageFps = fps.toFixed(1)
    sample.frames = sample.elapsed = 0
  })
  return (
    <>
      <WorldBackdrop continuous sunless />
      <GalaxyStars reducedMotion={reducedMotion} continuous constellation={tier !== 'low'} />
      <Prewarm models={[]} />
      {FOOTER_CLOUDS && <PageOneFooterClouds />}
    </>
  )
}

/** One viewport-sized sky behind the wheel and the blessing. */
export function BlessingSky() {
  const reducedMotion = useReducedMotion()
  useEffect(() => {
    const mist = document.querySelector<HTMLElement>('.blessing-journey-mist')
    if (!mist || new URLSearchParams(window.location.search).get('mist') === '0') return
    let elapsed = 0
    let last = ''
    const tick = (_time: number, delta: number) => {
      if (heroFx.rise < 1) elapsed = 0
      else elapsed = reducedMotion ? 720 : Math.min(720, elapsed + Math.min(delta, 50))
      const opacity = MathUtils.smoothstep(elapsed, 0, 720).toFixed(3)
      if (opacity !== last) mist.style.setProperty('--mist-visible', opacity)
      last = opacity
    }
    tick(0, 0)
    gsap.ticker.add(tick)
    return () => {
      gsap.ticker.remove(tick)
      mist.style.removeProperty('--mist-visible')
    }
  }, [reducedMotion])
  return (
    <div className="blessing-journey-sky" aria-hidden="true">
      <div className="blessing-journey-sky__viewport">
        <SceneCanvas
          label="Night sky shared by the wedding invitation and the blessing"
          camera={{ position: [0, 0, 6], fov: 35, near: 0.1, far: 50 }}
          effects={false}
          gl={{ antialias: false }}
        >
          <SharedGalaxy />
        </SceneCanvas>
      </div>
    </div>
  )
}
