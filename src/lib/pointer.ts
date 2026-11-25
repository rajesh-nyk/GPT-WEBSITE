import { useRef } from 'react'
import { Vector2 } from 'three'
import { useMotionFrame } from './useMotionFrame'

/**
 * One passive window listener shared by everything that follows the pointer (3D
 * parallax, wheel hover, the custom cursor). Works even when HTML overlays sit on top of
 * the canvas, and with touch (pointermove fires while a finger drags).
 */
export const pointer = {
  /** Client (CSS px) coordinates. */
  clientX: -1,
  clientY: -1,
  /** Has the pointer moved over the page yet? (false until first move, or after leaving) */
  active: false,
  type: '',
  /** Normalised -1..1, x right, y up. */
  ndc: new Vector2(),
}

if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointermove',
    (e) => {
      pointer.clientX = e.clientX
      pointer.clientY = e.clientY
      pointer.active = true
      pointer.type = e.pointerType
      pointer.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1))
    },
    { passive: true },
  )
  document.documentElement.addEventListener('pointerleave', () => (pointer.active = false))
}

/**
 * A Vector2 that eases toward the pointer every frame (frame-rate independent).
 * Feed it straight into a shader uniform for parallax. Frozen under reduced motion.
 */
export function useSmoothedPointer(smoothing = 2.5) {
  const value = useRef(new Vector2()).current
  useMotionFrame((_, dt) => {
    value.lerp(pointer.ndc, 1 - Math.exp(-smoothing * Math.min(dt, 0.1)))
  })
  return value
}
