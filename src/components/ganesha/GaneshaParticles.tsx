import { useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, ShaderMaterial, type Points } from 'three'
import { useMotionFrame } from '../../lib/useMotionFrame'
import { ganeshaFx } from './fx'
import { useSurfacePoints } from './points'
import { reveal, SEAM_GLSL } from './reveal'

/**
 * GOLD DUST — the first half of the consecration (see fx.ts).
 *
 *  Gather: each grain has a home on Ganesha's surface (baked samples) and starts a short
 *  way above and around it. Grains settle in like gold powder — decelerating onto the
 *  surface, staggered, base first — so his outline appears as a shimmer of gold leaf.
 *  Nothing crosses the screen; the wheel behind stays clear.
 *
 *  Seam: where the molten seam (reveal.ts) passes a grain, the grain flares and is
 *  absorbed into the metal; about one in nine becomes a spark that lifts off, drifts and
 *  cools. Grains just above the seam warm up before it arrives.
 *
 *  Glitter: a fraction of grains are facets that catch the light in brief, sharp glints.
 *
 * One draw call; all motion in the vertex shader from a handful of uniforms.
 */
const vertex = /* glsl */ `
  attribute vec3 aFrom;           // start offset from the home position
  attribute vec4 aRand;           // x: delay, y: size, z: kind/phase, w: twinkle speed
  uniform float uGather;
  uniform float uFront;
  uniform float uSeam;
  uniform float uTime;
  uniform float uScale;           // pixels per world unit at distance 1
  uniform float uWorldPerLocal;   // group scale, so sizes are in world units
  varying float vAlpha;
  varying float vHeat;
  ${SEAM_GLSL}

  void main() {
    float lg = clamp((uGather - aRand.x * 0.55) / 0.45, 0.0, 1.0);
    float e = 1.0 - pow(1.0 - lg, 3.0);             // settles: fast, then softly onto the surface
    vec3 drift = vec3(sin(uTime * 0.5 + aRand.z * 40.0), cos(uTime * 0.37 + aRand.z * 23.0), 0.0) * 0.012;
    vec3 p = position + aFrom * (1.0 - e) + drift * (1.0 - e);

    float twinkle = 0.62 + 0.38 * sin(uTime * aRand.w + aRand.z * 60.0);
    float glint = aRand.z > 0.78 ? pow(max(sin(uTime * aRand.w * 0.9 + aRand.z * 97.0), 0.0), 18.0) : 0.0;
    float alpha = (0.03 + 0.22 * e) * twinkle + glint * 1.2 * e;
    float size = aRand.y * (1.0 + glint * 1.6);
    float heat = 0.0;

    float d = seamDist(position, uFront);
    if (d <= 0.0) {
      if (aRand.z < 0.11) {
        // Spark: lifts off the seam, curls and cools.
        float age = clamp(-d / 0.32, 0.0, 1.0);
        p += vec3(sin(aRand.z * 90.0 + age * 5.0) * 0.05 * age, age * 0.26, cos(aRand.z * 70.0 + age * 4.0) * 0.03 * age);
        heat = 1.0 - age;
        alpha = uSeam * (1.0 - age) * (1.0 - age) * 1.1;
        size = aRand.y * (1.3 - 0.6 * age);
      } else {
        // Absorbed into the metal with a flare.
        float age = clamp(-d / 0.03, 0.0, 1.0);
        heat = 1.0;
        alpha = uSeam * (1.0 - age) * 0.6;
        size = aRand.y * 1.2;
      }
    } else {
      // Warming ahead of the seam.
      float warm = uSeam * (1.0 - smoothstep(0.0, 0.07, d));
      heat = warm;
      alpha += warm * 0.35;
      size *= 1.0 + warm * 0.3;
    }

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = alpha > 0.002 ? clamp(size * uWorldPerLocal * uScale / -mv.z, 1.0, 24.0) : 0.0;
    vAlpha = alpha;
    vHeat = heat;
  }
`

const fragment = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uHot;
  uniform float uOpacity;
  varying float vAlpha;
  varying float vHeat;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float glow = smoothstep(0.5, 0.0, d);
    glow *= glow;
    float core = smoothstep(0.16, 0.0, d);
    vec3 col = mix(uColor, uHot, vHeat) * (glow * 0.7 + core * 1.3);
    gl_FragColor = vec4(col * vAlpha * uOpacity, 1.0);
    #include <colorspace_fragment>
  }
`

type Props = {
  count: number
  /** World units per model unit (the group's scale), for sizes. */
  modelScale: number
}

export function GaneshaParticles({ count, modelScale }: Props) {
  const { positions, box } = useSurfacePoints('ganesha')
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const camera = useThree((s) => s.camera)

  const n = Math.min(count, positions.length / 3)

  const geometry = useMemo(() => {
    const target = positions.subarray(0, n * 3)
    const from = new Float32Array(n * 3)
    const rand = new Float32Array(n * 4)
    const minY = box.min.y
    const spanY = box.max.y - box.min.y
    for (let i = 0; i < n; i++) {
      // Start a short way off the surface, mostly from above — powder settling, not flying.
      let x = Math.random() * 2 - 1
      let y = Math.random() * 2 - 1 + 1.1
      let z = Math.random() * 2 - 1
      const len = Math.hypot(x, y, z) || 1
      const r = 0.08 + 0.32 * Math.random() ** 1.6
      x = (x / len) * r
      y = (y / len) * r
      z = (z / len) * r
      from[i * 3] = x
      from[i * 3 + 1] = y
      from[i * 3 + 2] = z
      const h = (target[i * 3 + 1] - minY) / spanY
      rand[i * 4] = 0.75 * h + 0.25 * Math.random() // base first, crown last
      rand[i * 4 + 1] = 0.004 + Math.random() ** 3 * 0.01 // fine powder, a few larger flakes
      rand[i * 4 + 2] = Math.random()
      rand[i * 4 + 3] = 0.8 + Math.random() * 2.6
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(target, 3))
    g.setAttribute('aFrom', new BufferAttribute(from, 3))
    g.setAttribute('aRand', new BufferAttribute(rand, 4))
    return g
  }, [positions, box, n])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uGather: { value: 0 },
          uFront: reveal.uniforms.uFront, // shared with the figure: same seam
          uSeam: reveal.uniforms.uSeam,
          uTime: { value: 0 },
          uScale: { value: 1 },
          uWorldPerLocal: { value: 1 },
          uOpacity: { value: 1 },
          uColor: { value: new Color('#e9b25a') },
          uHot: { value: new Color('#ffd98a').multiplyScalar(1.5) },
        },
      }),
    [],
  )

  const fov = 'fov' in camera ? (camera.fov as number) : 35
  material.uniforms.uScale.value = (size.height * dpr) / (2 * Math.tan((fov * Math.PI) / 360))
  material.uniforms.uWorldPerLocal.value = modelScale

  const points = useRef<Points>(null)
  useMotionFrame(() => {
    material.uniforms.uGather.value = ganeshaFx.gather
    material.uniforms.uTime.value = ganeshaFx.time
    const o = ganeshaFx.particles * ganeshaFx.presence
    material.uniforms.uOpacity.value = o
    if (points.current) points.current.visible = o > 0.002 && ganeshaFx.gather > 0
  })

  return <points ref={points} geometry={geometry} material={material} frustumCulled={false} />
}
