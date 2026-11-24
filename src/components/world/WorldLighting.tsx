import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import { MathUtils, type DirectionalLight } from 'three'
import { heroFx } from '../hero/fx'
import { ganeshaFx } from '../ganesha/fx'
import { wheelState } from './TravelingWheel'
import { templeAway } from './templeFx'

/**
 * One lighting rig for the whole world.
 * - Environment generated once on the GPU from warm light cards (no HDRI download):
 *   the gleam on gold comes from these reflections.
 * - Wheel rim lights (behind-left/right): pulse with the hero's breath, warm on hover,
 *   and dim as the wheel recedes along its path (wheelState.glow).
 * - Ganesha rim lights (behind both shoulders): build up as the figure forms, and
 *   intensify — the golden aura — when it's hovered.
 */
export function WorldLighting() {
  const scene = useThree((s) => s.scene)
  const wheelLeft = useRef<DirectionalLight>(null)
  const wheelRight = useRef<DirectionalLight>(null)
  const ganLeft = useRef<DirectionalLight>(null)
  const ganRight = useRef<DirectionalLight>(null)
  const key = useRef<DirectionalLight>(null)

  useFrame(() => {
    // In the closing scene the temple is lit by its lamps and the moon, not the studio rig.
    const keep = 1 - 0.9 * templeAway()
    const pulse = 0.9 + 0.2 * heroFx.breath
    // The wheel "catches the light" as the sun rises behind it on arrival.
    const dawn = MathUtils.lerp(0.15, 1, heroFx.rise)
    const wheel = pulse * (1 + 0.6 * heroFx.hover) * wheelState.glow * dawn
    if (wheelLeft.current) wheelLeft.current.intensity = 2.4 * wheel * keep
    if (wheelRight.current) wheelRight.current.intensity = 2 * wheel * keep

    const form = (0.25 + 0.75 * ganeshaFx.solid) * ganeshaFx.presence * (1 - ganeshaFx.leave)
    const aura = 1 + 0.85 * ganeshaFx.hover
    if (ganLeft.current) ganLeft.current.intensity = 2.6 * form * aura
    if (ganRight.current) ganRight.current.intensity = 2.2 * form * aura

    scene.environmentIntensity =
      (1 + 0.22 * heroFx.hover + 0.2 * ganeshaFx.hover) * MathUtils.lerp(0.3, 1, heroFx.rise) * keep
    if (key.current) key.current.intensity = 1.15 * MathUtils.lerp(0.35, 1, heroFx.rise) * keep
  })

  return (
    <>
      <Environment frames={1} resolution={512} environmentIntensity={1}>
        <color attach="background" args={['#120304']} />
        <Lightformer form="rect" intensity={2.2} color="#fff1d6" position={[0, 4, 4]} scale={[6, 2, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={4} color="#ffc76b" position={[-4.5, 0.5, -3]} scale={[1, 7, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={4} color="#ffb347" position={[4.5, -0.5, -3]} scale={[1, 7, 1]} target={[0, 0, 0]} />
        <Lightformer form="ring" intensity={3} color="#ffcf7a" position={[0, 0, -5]} scale={4} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={0.5} color="#ff9a5a" position={[0, -3, 5]} scale={[8, 2, 1]} target={[0, 0, 0]} />
      </Environment>

      <ambientLight intensity={0.18} color="#ffdcae" />
      <directionalLight ref={key} position={[2, 3, 4]} intensity={1.15} color="#fff0d0" />
      <directionalLight ref={wheelLeft} position={[-4, 1.5, -3]} intensity={2.4} color="#ffb84d" />
      <directionalLight ref={wheelRight} position={[4, -1, -3]} intensity={2} color="#ff9e3d" />
      <directionalLight ref={ganLeft} position={[-4, 2, -3]} intensity={0} color="#ffbf5a" />
      <directionalLight ref={ganRight} position={[4, 1, -3]} intensity={0} color="#ffa84a" />
    </>
  )
}
