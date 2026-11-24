import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { Texture, type Material, type Mesh } from 'three'
import { useModelLoaded } from '../Model'

const idle = () =>
  new Promise<void>((resolve) =>
    'requestIdleCallback' in window
      ? requestIdleCallback(() => resolve(), { timeout: 500 })
      : setTimeout(resolve, 16),
  )

/**
 * Prepares a below-the-fold scene in the background so its first visible frame doesn't
 * hitch: without this, scrolling a section into view compiles every shader and uploads
 * every texture in one blocking frame (100ms+).
 *
 *  - gl.compileAsync: builds all shader programs, without blocking the main thread where
 *    the browser supports KHR_parallel_shader_compile (Chrome, Edge, Safari 17+).
 *  - gl.initTexture: uploads textures to the GPU one per idle moment, so the work is
 *    spread out instead of landing in a single frame.
 *
 * Pass the models the scene uses: it suspends until they've loaded (Model has its own
 * inner Suspense, so being a sibling isn't enough), then warms everything in the scene.
 */
export function Prewarm({ models }: { models: string[] }) {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- fixed-length list per call site
  for (const m of models) useModelLoaded(m)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await idle()
      if (cancelled) return
      try {
        await gl.compileAsync(scene, camera)
      } catch {
        /* older three/browsers: first render will compile instead */
      }
      const textures = new Set<Texture>()
      scene.traverse((o) => {
        const materials = (o as Mesh).material
        if (!materials) return
        for (const m of (Array.isArray(materials) ? materials : [materials]) as Material[]) {
          for (const v of Object.values(m)) if (v instanceof Texture) textures.add(v)
        }
      })
      for (const t of textures) {
        await idle()
        if (cancelled) return
        gl.initTexture(t)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [gl, scene, camera])

  return null
}
