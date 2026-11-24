import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MathUtils, Plane, Raycaster, Vector3, type PointLight } from 'three'
import { pointer } from '../../lib/pointer'
import { HERO_DIAMETER_UNITS, useHeroLayout } from '../hero/layout'
import { heroFx } from '../hero/fx'
import { screenShapes } from './screenShapes'

/**
 * Divine Light: a real, shadowless warm light follows the native mouse over the
 * wheel's face. Its metallic material reflects the light; no cursor overlay,
 * postprocessing pass, extra canvas, or per-frame raycast against the mesh.
 * Page one uses a fixed camera facing the wheel's z=0 plane.
 */
export function DivineLight() {
  const light = useRef<PointLight>(null)
  const mouse = useRef(false)
  const { scale } = useHeroLayout()
  const radius = (HERO_DIAMETER_UNITS / 2) * scale
  const { ray, plane, target } = useMemo(() => ({
    ray: new Raycaster(),
    plane: new Plane(new Vector3(0, 0, 1), 0),
    target: new Vector3(),
  }), [])

  useEffect(() => {
    const fine = window.matchMedia('(any-hover: hover) and (any-pointer: fine)')
    const move = (e: PointerEvent) => {
      mouse.current = fine.matches && (e.pointerType === 'mouse' || e.pointerType === 'pen')
    }
    const leave = () => { mouse.current = false }
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('blur', leave)
    document.documentElement.addEventListener('pointerleave', leave)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('blur', leave)
      document.documentElement.removeEventListener('pointerleave', leave)
    }
  }, [])

  useFrame(({ camera }, delta) => {
    const lamp = light.current
    if (!lamp) return
    const dt = Math.min(delta, 0.1)
    const wheel = screenShapes.wheel
    let desired = 0

    if (mouse.current && pointer.active && wheel && wheel.r > 0 && radius > 0 &&
        document.documentElement.hasAttribute('data-site-ready')) {
      // Match the projected ellipse, including the wheel's changing face angle.
      const x = (pointer.clientX - wheel.x) / (wheel.r * Math.max(wheel.sx, 0.2))
      const y = (pointer.clientY - wheel.y) / wheel.r
      const edge = 1 - MathUtils.smoothstep(Math.hypot(x, y), 0.8, 1.16)
      if (edge > 0) {
        ray.setFromCamera(pointer.ndc, camera)
        if (ray.ray.intersectPlane(plane, target)) {
          // Hold the light just in front of the carving. Scaling intensity and
          // falloff with the wheel keeps the highlight consistent across screens.
          target.z += radius * 0.65
          if (lamp.intensity < 0.005) lamp.position.copy(target)
          else lamp.position.lerp(target, 1 - Math.exp(-dt * 18))
          desired = 2.6 * radius * radius * edge * heroFx.rise * (1 - heroFx.exit)
        }
      }
    }

    lamp.distance = radius * 2.4
    lamp.intensity = MathUtils.damp(lamp.intensity, desired, desired > lamp.intensity ? 12 : 8, dt)
    if (desired === 0 && lamp.intensity < 0.005) lamp.intensity = 0
  })

  return <pointLight ref={light} color="#ffe5b0" intensity={0} decay={2} castShadow={false} />
}
