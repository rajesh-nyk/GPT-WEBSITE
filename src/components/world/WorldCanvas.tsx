import { Suspense, useEffect, useState } from 'react'
import { SceneCanvas } from '../three/SceneCanvas'
import { PageOneWorld } from './PageOneWorld'

/**
 * The one WebGL canvas for the whole site, fixed behind all content. Sections are
 * transparent HTML layers (text, links) that report their scroll progress to the
 * journey timeline; everything 3D — the travelling wheel, Ganesha, particles, glows —
 * lives here. One canvas means one GPU context, one composer, and no seams between
 * sections.
 */
export function WorldCanvas() {
  const [active, setActive] = useState(true)
  useEffect(() => {
    const hero = document.getElementById('hero')
    if (!hero) return
    const observer = new IntersectionObserver(([entry]) => {
      setActive(entry.isIntersecting && entry.intersectionRatio > 0)
    }, { threshold: [0, 0.001] })
    observer.observe(hero)
    return () => observer.disconnect()
  }, [])

  return (
    <div aria-hidden={false} className="pointer-events-none fixed inset-0 z-0">
      <SceneCanvas
        label="A golden Konark wheel glowing among the stars."
        camera={{ position: [0, 0, 6], fov: 35, near: 0.1, far: 50 }}
        effects={false}
        active={active}
      >
        <Suspense fallback={null}>
          <PageOneWorld />
        </Suspense>
      </SceneCanvas>
    </div>
  )
}
