import { useFrame, type RenderCallback } from '@react-three/fiber'
import { useReducedMotion } from './useReducedMotion'

/**
 * useFrame for anything that MOVES (rotation, drift, camera sway, animation mixers).
 * With prefers-reduced-motion it never runs, so the object stays in its authored pose.
 * SceneCanvas also switches to frameloop="demand" then, so the scene renders as a still.
 *
 * Use plain useFrame only for non-motion work (e.g. updating a uniform on resize).
 */
export function useMotionFrame(callback: RenderCallback, priority?: number) {
  const reducedMotion = useReducedMotion()
  useFrame((state, delta, frame) => {
    if (!reducedMotion) callback(state, delta, frame)
  }, priority)
}
