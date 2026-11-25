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

/** Sparse highlights anchored to the baked ornament and seam tags. */
export function makeOrnamentGlints(geometry: BufferGeometry, spark: BufferAttribute) {
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  const anchors: number[] = []
  for (let i = 0; i < spark.count; i++) {
    if (spark.getX(i) > 0.25) anchors.push(i)
  }
  const step = Math.max(1, Math.floor(anchors.length / 110))
  const positions: number[] = []
  const sizes: number[] = []
  for (let i = 0; i < anchors.length; i += step) {
    const vertex = anchors[i]
    positions.push(
      position.getX(vertex) + normal.getX(vertex) * 0.0018,
      position.getY(vertex) + normal.getY(vertex) * 0.0018,
      position.getZ(vertex) + normal.getZ(vertex) * 0.0018,
    )
    sizes.push(((i * 0.61803398875) % 1) ** 2)
  }
  const points = new BufferGeometry()
  points.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  points.setAttribute('aSize', new BufferAttribute(new Float32Array(sizes), 1))
  return new Points(points, new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: { ...ganeshaPose, uGlow: { value: 0 }, uDpr: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aSize;
      uniform float uDpr;
      varying float vSize;
      ${ganeshaPoseGLSL}
      void main() {
        vSize = aSize;
        gl_PointSize = (3.5 + aSize * 10.0) * uDpr;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(ganeshaPosePoint(position), 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uGlow;
      varying float vSize;
      void main() {
        vec2 p = abs(gl_PointCoord - 0.5);
        float core = exp(-dot(p, p) * 86.0);
        float rays = (exp(-p.x * 45.0) + exp(-p.y * 45.0)) * (1.0 - smoothstep(0.0, 0.45, max(p.x, p.y)));
        gl_FragColor = vec4(1.0, 0.85, 0.58, min(1.0, core * 1.65 + rays * vSize * 0.55) * uGlow);
      }`,
  }))
}
