import { useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, ShaderMaterial, Vector3, type Vector2 } from 'three'
import { useMotionFrame } from '../../lib/useMotionFrame'
import { useRestViewport } from '../../lib/restViewport'

/**
 * Golden light motes drifting upward with a slight sway, like embers off a diya.
 * Two instances are used: many tiny "motes" and a handful of larger, softer "orbs".
 *
 * Performance: ONE draw call, and the CPU never touches particle data after creation —
 * rise, sway, twinkle, wrap-around and mouse parallax are all computed in the vertex
 * shader from a time uniform. Additive blending, no depth writes, small point sprites
 * (fill rate is the real cost on mobile GPUs).
 */
const vertex = /* glsl */ `
  attribute vec4 aRand;           // x: rise speed, y: phase, z: size, w: twinkle speed
  uniform float uTime;
  uniform float uHeight;
  uniform float uScale;           // pixels per world unit at distance 1
  uniform float uSway;
  uniform float uParallax;
  uniform vec2 uPointer;
  uniform vec3 uRepel;            // xy: world point to drift away from, z: strength 0..1
  varying float vAlpha;

  void main() {
    vec3 p = position;
    float half_h = uHeight * 0.5;
    float y = mod(p.y + uTime * aRand.x + half_h, uHeight) - half_h;
    p.y = y;
    p.x += sin(uTime * 0.3 + aRand.y * 6.2831) * uSway;

    // Mild parallax: nearer particles (higher z) shift a little more with the pointer.
    float depth = clamp((p.z + 4.0) / 6.0, 0.0, 1.0);
    p.xy += uPointer * uParallax * (0.25 + depth);

    // Gentle reaction: motes near uRepel.xy drift softly away (strength uRepel.z).
    vec2 away = p.xy - uRepel.xy;
    float d2 = dot(away, away);
    p.xy += normalize(away + 1e-5) * uRepel.z * 0.35 * exp(-d2 * 2.5);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = min(aRand.z * uScale / -mv.z, 96.0);

    float fade = smoothstep(-half_h, -half_h * 0.6, y) * (1.0 - smoothstep(half_h * 0.4, half_h, y));
    float twinkle = 0.6 + 0.4 * sin(uTime * aRand.w + aRand.y * 40.0);
    vAlpha = fade * twinkle;
  }
`

const fragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uCore;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float glow = smoothstep(0.5, 0.0, d);
    glow *= glow;
    float core = smoothstep(0.18, 0.0, d);
    vec3 col = uColor * (glow * 0.9 + core * uCore);
    gl_FragColor = vec4(col * vAlpha * uOpacity, 1.0);
    #include <colorspace_fragment>
  }
`

type Props = {
  count: number
  pointer: Vector2
  /** World-unit diameter range of each particle. */
  size?: [number, number]
  /** Rise speed range, world units / second. */
  speed?: [number, number]
  /** Bright pin-point centre (0 = pure soft orb). */
  core?: number
  opacity?: number
  sway?: number
  parallax?: number
  color?: string
  /** Optional: a {x, y, strength} object read every frame — motes drift away from it. */
  repel?: { x: number; y: number; strength: number }
}

export function GoldenMotes({
  count,
  pointer,
  size = [0.015, 0.05],
  speed = [0.04, 0.12],
  core = 1.6,
  opacity = 1,
  sway = 0.12,
  parallax = 0.12,
  color = '#ffc861',
  repel,
}: Props) {
  const viewport = useRestViewport()
  const canvasSize = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const camera = useThree((s) => s.camera)

  const width = viewport.width * 1.4
  const height = viewport.height * 1.3

  const geometry = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const rand = new Float32Array(count * 4)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * width
      pos[i * 3 + 1] = (Math.random() - 0.5) * height
      pos[i * 3 + 2] = -4 + Math.random() * 6 // -4 (far) .. 2 (near)
      rand[i * 4] = speed[0] + Math.random() * (speed[1] - speed[0])
      rand[i * 4 + 1] = Math.random()
      rand[i * 4 + 2] = size[0] + Math.random() ** 3 * (size[1] - size[0]) // mostly small
      rand[i * 4 + 3] = 0.6 + Math.random() * 1.6
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('aRand', new BufferAttribute(rand, 4))
    return g
    // size/speed are literal tuples from the caller; their values are the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, width, height, size[0], size[1], speed[0], speed[1]])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uHeight: { value: 1 },
          uScale: { value: 1 },
          uSway: { value: sway },
          uParallax: { value: parallax },
          uPointer: { value: pointer },
          uRepel: { value: new Vector3() },
          uCore: { value: core },
          uOpacity: { value: opacity },
          uColor: { value: new Color(color).multiplyScalar(1.4) },
        },
      }),
    [pointer, sway, parallax, core, opacity, color],
  )

  const fov = 'fov' in camera ? (camera.fov as number) : 35
  material.uniforms.uHeight.value = height
  material.uniforms.uScale.value = (canvasSize.height * dpr) / (2 * Math.tan((fov * Math.PI) / 360))

  useMotionFrame((_, dt) => {
    material.uniforms.uTime.value += Math.min(dt, 0.1)
    material.uniforms.uOpacity.value = opacity
    if (repel) material.uniforms.uRepel.value.set(repel.x, repel.y, repel.strength)
  })

  return <points geometry={geometry} material={material} frustumCulled={false} />
}
