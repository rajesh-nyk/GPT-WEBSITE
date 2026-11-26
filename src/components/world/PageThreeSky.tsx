import { useReducedMotion } from '../../lib/useReducedMotion'
import { SceneCanvas } from '../three/SceneCanvas'
import { GalaxyStars } from './GalaxyStars'
import { WorldBackdrop } from './WorldBackdrop'

/** Default (Rajesh, 26 Nov 2026): page 3 draws the same night sky and stars as page 2. ?p3sky=0 shows the old CSS backdrop. */
export const PAGE_THREE_SKY =
  typeof window === 'undefined' || new URLSearchParams(window.location.search).get('p3sky') !== '0'

export function PageThreeSky() {
  const reducedMotion = useReducedMotion()
  return (
    <div className="p3-sky" aria-hidden="true">
      <SceneCanvas
        label="Night sky behind our story"
        camera={{ position: [0, 0, 6], fov: 35, near: 0.1, far: 50 }}
        effects={false}
        gl={{ antialias: false }}
      >
        <WorldBackdrop continuous sunless />
        <GalaxyStars reducedMotion={reducedMotion} continuous skipIntro />
      </SceneCanvas>
    </div>
  )
}
