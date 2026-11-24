import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, ShaderMaterial } from 'three'

/**
 * Connect actual procedural galaxy stars, using the same hash, cell positions,
 * drift, rotation, layer depth and repulsion as GALAXY_FRAGMENT. A small batch of
 * GPU quads around the pointer replaces a second fullscreen shader/canvas.
 */
const vertex = /* glsl */ `
  attribute vec4 cell;
  attribute vec2 corner;
  uniform vec2 uResolution, uFocal, uRotation, uMouse;
  uniform float uTime, uDepth, uDensity, uSpeed, uRotationAngle;
  uniform float uMouseActiveFactor, uRepulsionStrength, uReveal, uWarp, uCssHeight;
  uniform int uLayers;
  varying float vAlpha;
  varying float vSide;

  float Hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float tris(float x) {
    float t = fract(x);
    return 1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0));
  }
  vec2 starAt(vec2 id, vec2 repelAt, float scale) {
    float seed = Hash21(id);
    vec2 pad = vec2(tris(seed * 34.0 + uTime * uSpeed / 10.0),
                    tris(seed * 38.0 + uTime * uSpeed / 30.0)) - 0.5;
    vec2 p = id + 0.5 + pad;
    vec2 away = p - repelAt;
    float d = length(away);
    float q = d / (scale * (0.16 + 0.04 * uRepulsionStrength));
    float cells = uRepulsionStrength * 0.05 * uMouseActiveFactor * scale * exp(-q * q);
    float moved = cells * inversesqrt(1.0 + cells * cells * 2.78);
    return p + away * (moved / max(d, 0.0001));
  }

  void main() {
    vAlpha = 0.0;
    vSide = corner.y;
    gl_Position = vec4(2.0, 2.0, 0.9998, 1.0);
    if (uMouseActiveFactor < 0.003 || cell.z >= float(uLayers)) return;
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 aspectVec = vec2(aspect, 1.0);
    float angle = uRotationAngle;
    mat2 rotation = mat2(uRotation.x, -uRotation.y, uRotation.y, uRotation.x)
                  * mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
    mat2 inverseRotation = mat2(rotation[0].x, rotation[1].x, rotation[0].y, rotation[1].y);
    vec2 mouse = rotation * ((uMouse - uFocal) * aspectVec);
    float i = cell.z / float(uLayers);
    float depth = fract(i + uDepth);
    float scale = mix(20.0 * uDensity, 0.5 * uDensity, depth);
    float fade = depth * (1.0 - smoothstep(0.9, 1.0, depth));
    vec2 offset = vec2(i * 453.32);
    vec2 repelAt = mouse * scale + offset;
    vec2 id = floor(repelAt) + cell.xy;
    vec2 stepTo = cell.w < 0.5 ? vec2(1.0, 0.0)
      : cell.w < 1.5 ? vec2(0.0, 1.0)
      : cell.w < 2.5 ? vec2(1.0, 1.0) : vec2(-1.0, 1.0);
    vec2 a = (starAt(id, repelAt, scale) - offset) / scale;
    vec2 b = (starAt(id + stepTo, repelAt, scale) - offset) / scale;
    float distanceToMouse = max(length(a - mouse), length(b - mouse));
    float edge = length(b - a);
    float proximity = 1.0 - smoothstep(0.13, 0.27, distanceToMouse);
    float reach = 1.0 - smoothstep(0.13, 0.23, edge);
    float sizeA = fract(Hash21(id) * 345.32);
    float sizeB = fract(Hash21(id + stepTo) * 345.32);
    float visibleStars = smoothstep(0.05, 0.32, min(sizeA, sizeB));
    vAlpha = 0.8 * proximity * reach * visibleStars * sqrt(fade)
      * uMouseActiveFactor * uReveal * exp(-uWarp * 4.0);
    if (vAlpha < 0.003 || edge < 0.0001) { vAlpha = 0.0; return; }

    vec2 p = inverseRotation * mix(a, b, corner.x);
    vec2 direction = normalize(inverseRotation * (b - a));
    vec2 normal = vec2(-direction.y, direction.x);
    // A smooth ~1.4 CSS-pixel stroke regardless of ultra DPR.
    p += normal * corner.y * 0.7 / max(uCssHeight, 1.0);
    vec2 uv = p / aspectVec + uFocal;
    gl_Position = vec4(uv * 2.0 - 1.0, 0.9998, 1.0);
  }
`
const fragment = /* glsl */ `
  varying float vAlpha;
  varying float vSide;
  void main() {
    float alpha = vAlpha * (1.0 - smoothstep(0.15, 1.0, abs(vSide)));
    gl_FragColor = vec4(0.88, 0.60, 0.28, alpha);
    #include <colorspace_fragment>
  }
`

function createGeometry() {
  const cells: number[] = []
  const corners: number[] = []
  const triangle = [[0, -1], [1, -1], [1, 1], [0, -1], [1, 1], [0, 1]]
  for (let layer = 0; layer < 4; layer++) {
    for (let y = -2; y <= 2; y++) {
      for (let x = -2; x <= 2; x++) {
        for (let direction = 0; direction < 4; direction++) {
          for (const [t, side] of triangle) {
            cells.push(x, y, layer, direction)
            corners.push(t, side)
          }
        }
      }
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(corners.length / 2 * 3), 3))
  geometry.setAttribute('cell', new Float32BufferAttribute(cells, 4))
  geometry.setAttribute('corner', new Float32BufferAttribute(corners, 2))
  return geometry
}

export function LivingConstellation({ galaxy }: { galaxy: ShaderMaterial }) {
  const geometry = useMemo(createGeometry, [])
  const material = useMemo(() => new ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: { ...galaxy.uniforms, uCssHeight: { value: 1 } },
    transparent: true,
    blending: AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  }), [galaxy])

  useFrame(({ size }) => {
    material.uniforms.uCssHeight.value = size.height
    material.visible = galaxy.uniforms.uMouseActiveFactor.value > 0.003
      && document.documentElement.hasAttribute('data-site-ready')
  })

  useEffect(() => () => { geometry.dispose(); material.dispose() }, [geometry, material])

  return <mesh renderOrder={-998} frustumCulled={false} geometry={geometry} material={material} />
}
