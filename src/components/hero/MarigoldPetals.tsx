import { useMemo } from 'react'
import {  } from '@react-three/fiber'
import {
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  ShaderMaterial,
  type Vector2,
} from 'three'
import { useMotionFrame } from '../../lib/useMotionFrame'
import { useRestViewport } from '../../lib/restViewport'

/**
 * Occasional marigold (genda phula) petals drifting down, tumbling in 3D.
 *
 * ONE draw call: an instanced quad whose petal shape — narrow base, broad ruffled tip,
 * a faint centre vein, deeper orange at the base — is drawn procedurally in the fragment
 * shader (no texture download). Fall, sway, tumble, fade and pointer parallax all run on
 * the GPU. Kept sparse on purpose: a few at a time reads as "occasional", not confetti.
 */
const vertex = /* glsl */ `
  attribute vec3 aOffset;
  attribute vec4 aRand;   // x: fall speed, y: phase, z: tumble speed, w: size
  attribute float aTint;
  uniform float uTime;
  uniform float uHeight;
  uniform vec2 uPointer;
  varying vec2 vUv;
  varying float vShade;
  varying float vAlpha;
  varying float vTint;

  mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }
  mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }
  mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0., -s, c, 0., 0., 0., 1.); }

  void main() {
    vUv = uv;
    vTint = aTint;
    float half_h = uHeight * 0.5;

    float y = mod(aOffset.y - uTime * aRand.x + half_h, uHeight) - half_h;
    float x = aOffset.x + sin(uTime * 0.22 + aRand.y * 6.2831) * 0.45
                        + sin(uTime * 0.61 + aRand.y * 17.0) * 0.08;
    vec3 center = vec3(x, y, aOffset.z);

    float depth = clamp((aOffset.z + 4.0) / 6.0, 0.0, 1.0);
    center.xy += uPointer * (0.06 + depth * 0.3);

    float s = uTime * aRand.z + aRand.y * 10.0;
    mat3 R = rotY(s * 0.8) * rotX(s) * rotZ(s * 0.35);
    vec3 local = R * (position * aRand.w);
    vShade = 0.5 + 0.5 * abs((R * vec3(0.0, 0.0, 1.0)).z);

    float fade = smoothstep(-half_h, -half_h * 0.55, y) * (1.0 - smoothstep(half_h * 0.55, half_h, y));
    vAlpha = fade;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(center + local, 1.0);
  }
`

const fragment = /* glsl */ `
  uniform vec3 uDeep;
  uniform vec3 uBright;
  uniform vec3 uYellow;
  varying vec2 vUv;
  varying float vShade;
  varying float vAlpha;
  varying float vTint;

  void main() {
    vec2 p = vUv * 2.0 - 1.0;           // -1..1, base at y = -1
    float t = p.y * 0.5 + 0.5;          // 0 base .. 1 tip
    float rx = 0.18 + 0.62 * sqrt(t);   // narrow base, broad tip
    float tip = 0.86 + 0.07 * sin(p.x * 14.0);  // ruffled edge
    float d = (p.x / rx) * (p.x / rx) + pow(max(p.y, 0.0) / tip, 2.0) + pow(min(p.y, 0.0), 2.0);
    float a = 1.0 - smoothstep(0.82, 1.0, d);
    if (a < 0.01) discard;

    vec3 tipCol = mix(uBright, uYellow, vTint);
    vec3 col = mix(uDeep, tipCol, smoothstep(0.0, 0.75, t));
    col *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.06, abs(p.x))) * (1.0 - t);  // vein
    col *= vShade;

    gl_FragColor = vec4(col, a * vAlpha * 0.92);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function MarigoldPetals({ count, pointer }: { count: number; pointer: Vector2 }) {
  const viewport = useRestViewport()
  const width = viewport.width * 1.3
  const height = viewport.height * 1.5

  const geometry = useMemo(() => {
    const base = new PlaneGeometry(1, 1.35)
    const g = new InstancedBufferGeometry()
    g.index = base.index
    g.setAttribute('position', base.getAttribute('position'))
    g.setAttribute('uv', base.getAttribute('uv'))
    const offset = new Float32Array(count * 3)
    const rand = new Float32Array(count * 4)
    const tint = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      offset[i * 3] = (Math.random() - 0.5) * width
      offset[i * 3 + 1] = (Math.random() - 0.5) * height
      offset[i * 3 + 2] = -3.5 + Math.random() * 5
      rand[i * 4] = 0.06 + Math.random() * 0.08 // unhurried fall
      rand[i * 4 + 1] = Math.random()
      rand[i * 4 + 2] = 0.3 + Math.random() * 0.6
      rand[i * 4 + 3] = 0.09 + Math.random() * 0.08
      tint[i] = Math.random()
    }
    g.setAttribute('aOffset', new InstancedBufferAttribute(offset, 3))
    g.setAttribute('aRand', new InstancedBufferAttribute(rand, 4))
    g.setAttribute('aTint', new InstancedBufferAttribute(tint, 1))
    g.instanceCount = count
    return g
  }, [count, width, height])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uHeight: { value: 1 },
          uPointer: { value: pointer },
          uDeep: { value: new Color('#c2410c') },
          uBright: { value: new Color('#f58a07') },
          uYellow: { value: new Color('#ffc21a') },
        },
      }),
    [pointer],
  )

  material.uniforms.uHeight.value = height

  useMotionFrame((_, dt) => {
    material.uniforms.uTime.value += Math.min(dt, 0.1)
  })

  return <mesh geometry={geometry} material={material} frustumCulled={false} />
}
