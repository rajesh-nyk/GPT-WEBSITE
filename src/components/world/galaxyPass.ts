import {
  AdditiveBlending, Camera, Color, GLSL3, HalfFloatType, InstancedBufferGeometry,
  Mesh, PlaneGeometry, Scene, ShaderMaterial, Vector4, WebGLRenderTarget,
  type WebGLRenderer,
} from 'three'
import { GALAXY_CELL_GLSL } from '../Galaxy'

// The original galaxy tests four grids of nine candidate stars at every pixel.
// Accumulate the same star contributions in small quads, then apply the original
// nonlinear color and opacity to the sum once. Each star keeps its original grid,
// seed, falloff, twinkle, mouse repulsion, and warp.
const vertex = /* glsl */ `
  uniform vec2 uResolution, uFocal, uMouse, uRotation;
  uniform float uTime, uSpeed, uDepth, uDensity, uGloss, uSquash;
  uniform float uRotationAngle, uRepulsionStrength, uMouseActiveFactor, uTwinkleIntensity;
  uniform vec3 uColors[4];
  uniform int uGridWidth;
  flat out vec2 cell;
  flat out float reach, flare;
  flat out vec3 energy;
  out vec2 local, gridPosition, fromFocal;
  ${GALAXY_CELL_GLSL}

  void main() {
    int cells = uGridWidth * uGridWidth;
    int index = gl_InstanceID % cells;
    float layer = float(gl_InstanceID / cells) * 0.25;
    float depth = fract(layer + uDepth);
    float scale = mix(20.0 * uDensity, 0.5 * uDensity, depth);
    float fade = depth * smoothstep(1.0, 0.9, depth);
    vec2 offset = vec2(layer * 453.32);
    cell = floor(offset) + vec2(index % uGridWidth, index / uGridWidth) - float(uGridWidth / 2);
    float seed = Hash21(cell);
    vec2 pad = vec2(tris(seed * 34.0 + uTime * uSpeed / 10.0), tris(seed * 38.0 + uTime * uSpeed / 30.0)) - 0.5;
    vec2 center = cell + 0.5 + pad;
    float s = sin(uRotationAngle), c = cos(uRotationAngle);
    mat2 turn = mat2(uRotation.x, -uRotation.y, uRotation.y, uRotation.x) * mat2(c, -s, s, c);
    float strength = max(uRepulsionStrength, 0.0);
    float push = strength * 0.05 * uMouseActiveFactor * scale;
    reach = 1.0;
    if (push != 0.0) {
      vec2 repelAt = turn * ((uMouse - uFocal) * uResolution / uResolution.y) * scale + offset;
      vec2 away = center - repelAt;
      float dist = length(away);
      float q = dist / (scale * (0.16 + 0.04 * strength));
      float cellsMoved = push * exp(-q * q);
      float moved = cellsMoved * inversesqrt(1.0 + cellsMoved * cellsMoved * 2.78);
      center += away * (moved / max(dist, 0.0001));
      reach -= moved;
    }
    float size = fract(seed * 345.32);
    flare = size > 0.9 ? smoothstep(0.9, 1.0, size) * tri(uGloss / (3.0 * seed + 1.0)) : 0.0;
    float twinkle = mix(1.0, trisn(uTime * uSpeed + seed * 6.2831) * 0.5 + 1.0, uTwinkleIntensity);
    int colorIndex = int(min(floor(Hash21(cell + 7.0) * 4.0), 3.0));
    energy = uColors[colorIndex] * (twinkle * size * fade);

    // The original shader visits only the surrounding 3x3 cells. Intersect that
    // region with the largest possible radius of the warped star.
    float radius = reach * inversesqrt(max(1.0 - uSquash, 0.0001)) + 0.0001;
    gridPosition = mix(max(cell - 1.0, center - radius), min(cell + 2.0, center + radius), uv);
    local = gridPosition - center;
    fromFocal = (gridPosition - offset) / scale;
    vec2 screen = (transpose(turn) * fromFocal) * uResolution.y / uResolution + uFocal;
    gl_Position = vec4(screen * 2.0 - 1.0, 0.0, 1.0);
  }
`

const fragment = /* glsl */ `
  uniform float uStarGlow, uFlareGain, uSquash, uWarp;
  flat in vec2 cell;
  flat in float reach, flare;
  flat in vec3 energy;
  in vec2 local, gridPosition, fromFocal;
  out vec4 outColor;
  const mat2 diagonal = mat2(0.7071, -0.7071, 0.7071, 0.7071);
  void main() {
    if (any(greaterThan(abs(floor(gridPosition) - cell), vec2(1.0)))) discard;
    float d2 = dot(local, local);
    if (uSquash > 0.0) {
      vec2 radial = length(fromFocal) > 0.0001 ? normalize(fromFocal) : vec2(1.0, 0.0);
      float along = dot(local, radial);
      d2 = max(d2 - uSquash * along * along, 0.0);
    }
    if (d2 >= reach * reach) discard;
    float distance = sqrt(d2);
    float light = uStarGlow / distance;
    if (flare > 0.0) {
      vec2 rotated = local * diagonal;
      float rays = smoothstep(0.0, 1.0, 1.0 - abs(local.x * local.y * 1000.0));
      rays += 0.3 * smoothstep(0.0, 1.0, 1.0 - abs(rotated.x * rotated.y * 1000.0));
      light += rays * flare * uFlareGain;
    }
    light *= smoothstep(1.0, 0.2, distance / reach);
    if (uWarp > 0.0) light *= mix(1.0, smoothstep(1.0, 0.55, length(local * diagonal) / reach), min(uWarp * 4.0, 1.0));
    outColor = vec4(energy * light, 0.0);
  }
`

export const galaxyResolve = /* glsl */ `
  uniform sampler2D uStars;
  uniform float uReveal, uOpacity;
  void main() {
    vec3 color = texelFetch(uStars, ivec2(gl_FragCoord.xy), 0).rgb * uReveal;
    float alpha = smoothstep(0.0, 0.3, length(color)) * uOpacity;
    gl_FragColor = vec4(pow(min(color * alpha, vec3(0.8)), vec3(2.2)), alpha);
    #include <colorspace_fragment>
  }
`

export function createGalaxyPass(uniforms: ShaderMaterial['uniforms']) {
  const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false })
  const quad = new PlaneGeometry(2, 2)
  const geometry = new InstancedBufferGeometry()
  geometry.setIndex(quad.index)
  geometry.setAttribute('position', quad.attributes.position)
  geometry.setAttribute('uv', quad.attributes.uv)
  const width = { value: 1 }
  const material = new ShaderMaterial({
    glslVersion: GLSL3, vertexShader: vertex, fragmentShader: fragment,
    uniforms: { ...uniforms, uGridWidth: width },
    transparent: true, depthWrite: false, depthTest: false,
    blending: AdditiveBlending, premultipliedAlpha: true,
  })
  const mesh = new Mesh(geometry, material)
  mesh.frustumCulled = false
  const scene = new Scene().add(mesh)
  const camera = new Camera()
  const scissor = new Vector4()
  const clear = new Color()

  return {
    texture: target.texture,
    compile(renderer: WebGLRenderer) {
      return renderer.compileAsync(scene, camera)
    },
    render(renderer: WebGLRenderer, pixelWidth: number, pixelHeight: number, visibleRows = pixelHeight) {
      if (target.width !== pixelWidth || target.height !== pixelHeight) target.setSize(pixelWidth, pixelHeight)
      const aspect = pixelWidth / pixelHeight
      const focal = uniforms.uFocal.value
      const maxX = Math.max(focal.x, 1 - focal.x) * aspect
      const maxY = Math.max(focal.y, 1 - focal.y)
      const radius = Math.ceil(Math.hypot(maxX, maxY) * 20 * uniforms.uDensity.value) + 2
      width.value = 2 * radius + 1
      geometry.instanceCount = width.value ** 2 * 4

      const previous = renderer.getRenderTarget()
      const alpha = renderer.getClearAlpha()
      const autoClear = renderer.autoClear
      renderer.getClearColor(clear)
      target.scissorTest = renderer.getScissorTest() || visibleRows < pixelHeight
      if (renderer.getScissorTest()) {
        target.scissor.copy(renderer.getScissor(scissor).multiplyScalar(renderer.getPixelRatio())).floor()
      } else target.scissor.set(0, 0, pixelWidth, visibleRows)
      renderer.setRenderTarget(target)
      renderer.setClearColor(0, 0)
      renderer.autoClear = false
      renderer.clear(true, false, false)
      renderer.render(scene, camera)
      renderer.autoClear = autoClear
      renderer.setClearColor(clear, alpha)
      renderer.setRenderTarget(previous)
    },
    dispose() {
      target.dispose()
      geometry.dispose()
      material.dispose()
    },
  }
}
