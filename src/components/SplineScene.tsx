// Lazy-loaded so the ~1MB Spline runtime only downloads on pages that embed a scene.
import { lazy, Suspense } from 'react'

const Spline = lazy(() => import('@splinetool/react-spline'))

export function SplineScene({ scene, label }: { scene: string; label: string }) {
  return (
    <Suspense fallback={<div aria-hidden className="h-full w-full" />}>
      <div role="img" aria-label={label} className="h-full w-full">
        <Spline scene={scene} />
      </div>
    </Suspense>
  )
}
