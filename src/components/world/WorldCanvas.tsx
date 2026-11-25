import { Suspense } from 'react'
import { SceneCanvas } from '../three/SceneCanvas'
import { PageOneWorld } from './PageOneWorld'

/** The complete Page 1 WebGL artwork is a layer of its chapter panel.
 * The page moves as a single composition; the camera never translates or tilts.
 * SceneCanvas automatically suspends rendering once the panel is off-screen.
 */
export function WorldCanvas() {
  return (
    <div aria-hidden={false} className="pointer-events-none absolute inset-0 z-0">
      <SceneCanvas
        label="A golden Konark wheel glowing among the stars."
        camera={{ position: [0, 0, 6], fov: 35, near: 0.1, far: 50 }}
        effects={false}
      >
        <Suspense fallback={null}>
          <PageOneWorld />
        </Suspense>
      </SceneCanvas>
    </div>
  )
}
