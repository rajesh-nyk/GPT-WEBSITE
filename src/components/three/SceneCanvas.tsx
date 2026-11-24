import { useEffect, useRef, useState } from 'react'
import { Canvas, type CanvasProps } from '@react-three/fiber'
import { useQuality } from '../../lib/quality'
import { useReducedMotion } from '../../lib/useReducedMotion'
import { QualityEffects, type QualityEffectsProps } from './QualityEffects'

type Props = Omit<CanvasProps, 'dpr' | 'shadows' | 'frameloop'> & {
  /** Describes the scene for screen readers (the canvas itself is just pixels). */
  label: string
  /** Tier-aware postprocessing: true = defaults, object = tuned, false = none. */
  effects?: boolean | QualityEffectsProps
  /** false = stop rendering (keeps the last frame), e.g. once a scene has faded to dark. */
  active?: boolean
}

/**
 * Use this instead of <Canvas>. It:
 * - applies the current quality tier (DPR, shadows, postprocessing),
 * - stops rendering entirely while the canvas is scrolled out of view,
 * - with prefers-reduced-motion renders on demand only (a still frame).
 */
export function SceneCanvas({ label, effects = true, active = true, children, gl, style, ...props }: Props) {
  const quality = useQuality()
  const reducedMotion = useReducedMotion()
  const host = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const el = host.current
    if (!el) return
    // Only render with real pixels on screen. isIntersecting alone is true when the canvas
    // merely touches the viewport edge (0px visible) — e.g. a section right below the hero
    // would render a full scene nobody can see. The tiny second threshold makes the
    // observer fire again as soon as the first pixel row actually scrolls in.
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting && entry.intersectionRatio > 0),
      { rootMargin: '0px', threshold: [0, 0.001] },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const frameloop = !visible || !active ? 'never' : reducedMotion ? 'demand' : 'always'

  return (
    <div ref={host} style={{ width: '100%', height: '100%', ...style }}>
      <Canvas
        role="img"
        aria-label={label}
        dpr={quality.dpr}
        shadows={quality.shadows ? 'percentage' : false}
        frameloop={frameloop}
        gl={{ antialias: true, powerPreference: 'high-performance', stencil: false, ...gl }}
        {...props}
      >
        {children}
        {effects && <QualityEffects {...(effects === true ? {} : effects)} />}
      </Canvas>
    </div>
  )
}
