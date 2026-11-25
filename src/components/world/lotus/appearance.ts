import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial, Vector2 } from 'three'

export const lotusGrade = /* glsl */ `
  vec3 lotusGrade(vec3 color, vec3 modelPosition) {
    float lightness = dot(color, vec3(0.299, 0.587, 0.114));
    float tip = smoothstep(0.07, 0.19, length(modelPosition.xz)) * 0.6 + smoothstep(0.03, 0.13, modelPosition.y) * 0.4;
    vec3 tint = mix(vec3(1.0, 0.86, 0.85), vec3(0.95, 0.5, 0.66), tip);
    return mix(color, tint * (0.5 + lightness), 0.78);
  }`

export const ganeshaPose = {
  uFigureTurn: { value: 0 },
  uFigureSway: { value: 0 },
  uFigureStretch: { value: new Vector2(1, 1) },
}

// The scanned figure and petals share vertices up to y = 0.142 in both variants.
// The upper body moves while the seated part and every join vertex stay fixed.
export const ganeshaPoseGLSL = /* glsl */ `
  uniform float uFigureTurn, uFigureSway;
  uniform vec2 uFigureStretch;
  const float poseBase = 0.145;

  vec3 ganeshaTwist(vec3 direction, float weight) {
    float roll = uFigureSway * weight;
    float yaw = uFigureTurn * weight;
    direction.xy = mat2(cos(roll), sin(roll), -sin(roll), cos(roll)) * direction.xy;
    direction.xz = mat2(cos(yaw), -sin(yaw), sin(yaw), cos(yaw)) * direction.xz;
    return direction;
  }

  vec3 ganeshaPosePoint(vec3 point) {
    if (point.y <= poseBase) return point;
    float weight = smoothstep(poseBase, 0.205, point.y);
    vec3 pivot = vec3(0.0, poseBase, 0.0);
    vec3 stretch = mix(vec3(1.0), uFigureStretch.xyx, weight);
    return pivot + ganeshaTwist((point - pivot) * stretch, weight);
  }

  vec3 ganeshaPoseNormal(vec3 normal, vec3 point) {
    if (point.y <= poseBase) return normal;
    float weight = smoothstep(poseBase, 0.205, point.y);
    vec3 stretch = mix(vec3(1.0), uFigureStretch.xyx, weight);
    return ganeshaTwist(normal / stretch, weight);
  }`

export const ornamentSweep = { value: new Vector2(0, 0) }

export const ornamentSweepGLSL = /* glsl */ `
  uniform vec2 uOrnamentSweep;
  float arrivalGlint(float height) {
    float center = mix(0.286, 0.145, uOrnamentSweep.x);
    float offset = (height - center) / 0.032;
    return exp(-offset * offset) * uOrnamentSweep.y;
  }
`

/** Highlights on the metalwork, with larger catches on a few visible landmarks. */
export function makeOrnamentGlints(geometry: BufferGeometry, spark: BufferAttribute) {
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  const anchors: number[] = []
  for (let i = 0; i < spark.count; i++) {
    const wrist = Math.abs(position.getX(i)) > 0.077 && position.getY(i) > 0.142 && position.getY(i) < 0.177
    if (wrist && spark.getX(i) > 0.25 && normal.getZ(i) > 0.08) anchors.push(i)
  }
  const step = Math.max(1, Math.ceil(anchors.length / 29))
  const positions: number[] = []
  const sizes: number[] = []
  const add = (vertex: number, size: number) => {
    positions.push(
      position.getX(vertex) + normal.getX(vertex) * 0.0018,
      position.getY(vertex) + normal.getY(vertex) * 0.0018,
      position.getZ(vertex) + Math.max(normal.getZ(vertex), 0.24) * 0.0034,
    )
    sizes.push(size)
  }
  for (let i = 0; i < anchors.length; i += step) {
    add(anchors[i], 0.12 + 0.19 * ((i * 0.61803398875) % 1))
  }
  // Local x/y coordinates of crown filigree, the axe edge, the bowl rim and jewelry.
  const landmarks = [
    [-0.026, 0.254, 0.78], [0.001, 0.281, 0.93], [0.026, 0.253, 0.62],
    [-0.091, 0.232, 0.88], [-0.083, 0.211, 0.46], [0.054, 0.158, 0.73, 0.0035],
    [0.072, 0.158, 0.50, 0.0035], [-0.012, 0.160, 0.65, 0.004], [0.005, 0.149, 0.81, 0.004],
  ]
  for (const [x, y, size, radius = 0.009] of landmarks) {
    let best = -1
    let bestScore = -Infinity
    for (let i = 0; i < position.count; i++) {
      const distance = (position.getX(i) - x) ** 2 + (position.getY(i) - y) ** 2
      if (distance > radius ** 2 || normal.getZ(i) < -0.12) continue
      const score = position.getZ(i) - 380 * distance
      if (score > bestScore) {
        best = i
        bestScore = score
      }
    }
    if (best !== -1) add(best, size)
  }
  const points = new BufferGeometry()
  points.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  points.setAttribute('aSize', new BufferAttribute(new Float32Array(sizes), 1))
  points.setAttribute('aPhase', new BufferAttribute(Float32Array.from(sizes, (_, i) => (i * 0.61803398875) % 1), 1))
  return new Points(points, new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: { ...ganeshaPose, uGlow: { value: 0 }, uDpr: { value: 1 }, uTime: { value: 0 }, uOrnamentSweep: ornamentSweep },
    vertexShader: /* glsl */ `
      attribute float aSize, aPhase;
      uniform float uDpr;
      varying float vSize, vPhase, vHeight;
      ${ganeshaPoseGLSL}
      void main() {
        vSize = aSize;
        vPhase = aPhase;
        vHeight = position.y;
        gl_PointSize = (3.5 + aSize * 18.0) * uDpr;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(ganeshaPosePoint(position), 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uGlow, uTime;
      varying float vSize, vPhase, vHeight;
      ${ornamentSweepGLSL}
      void main() {
        vec2 p = abs(gl_PointCoord - 0.5);
        float core = exp(-dot(p, p) * 92.0);
        float rays = (exp(-p.x * 46.0) + exp(-p.y * 46.0)) * (1.0 - smoothstep(0.02, 0.47, max(p.x, p.y)));
        float flash = pow(0.5 + 0.5 * cos(uTime * 1.55 + vPhase * 6.283185), 8.0);
        float sweep = arrivalGlint(vHeight);
        float radiance = core * (0.58 + 0.31 * flash + 1.32 * sweep)
          + rays * vSize * (0.19 + 0.24 * flash + 0.82 * sweep);
        gl_FragColor = vec4(1.0, 0.91, 0.69, min(1.0, radiance) * uGlow);
      }`,
  }))
}
