import { Color, Matrix4, type Material, type WebGLProgramParametersWithUniforms } from 'three'

/**
 * The molten-gold seam that reveals the solid Ganesha (see fx.ts, "the consecration").
 *
 * Shared by the figure's materials (an onBeforeCompile patch) and the gold dust, so the
 * dust is absorbed exactly where the seam passes. Heights are in the model's own space
 * (the baked points' space); the front is rippled by 3D noise so it reads as a living
 * edge of molten metal, not a clipping plane.
 */
export const reveal = {
  uniforms: {
    uFront: { value: 10 }, // model-space height of the seam (everything below is solid)
    uSeam: { value: 0 }, // 0..1 seam heat
    uSeamColor: { value: new Color('#ffb547') },
    uSeamHot: { value: new Color('#fff3d6') },
    uToModel: { value: new Matrix4() }, // world → model space
  },
}

/** Rippled seam height offset at a model-space point; identical in every shader. */
export const SEAM_GLSL = /* glsl */ `
  float seamHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float seamNoise(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(seamHash(i), seamHash(i + vec3(1,0,0)), f.x), mix(seamHash(i + vec3(0,1,0)), seamHash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(seamHash(i + vec3(0,0,1)), seamHash(i + vec3(1,0,1)), f.x), mix(seamHash(i + vec3(0,1,1)), seamHash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  // Signed distance (model units) of a point above the seam: > 0 not yet revealed.
  float seamDist(vec3 p, float front) {
    float n = seamNoise(p * 7.0) * 0.6 + seamNoise(p * 19.0) * 0.4;
    return p.y + (n - 0.5) * 0.09 - front;
  }
`

const SEAM_WIDTH = '0.035'

/** Patch a lit material (Standard or Lambert) so the reveal clips it and lights the seam. */
export function applyReveal(material: Material) {
  if (material.userData.reveal) return
  material.userData.reveal = true
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, reveal.uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uToModel;\nvarying vec3 vModelPos;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvModelPos = (uToModel * modelMatrix * vec4(transformed, 1.0)).xyz;',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uFront; uniform float uSeam; uniform vec3 uSeamColor; uniform vec3 uSeamHot;
        varying vec3 vModelPos;
        ${SEAM_GLSL}`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        float seamD = seamDist(vModelPos, uFront);
        if (seamD > 0.0) discard;
        float seamK = uSeam * (1.0 - smoothstep(0.0, ${SEAM_WIDTH}, -seamD));`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        // Molten edge: white-hot at the front, cooling to gold leaf just behind it.
        float seamCore = 1.0 - smoothstep(0.0, ${SEAM_WIDTH} * 0.25, -seamD);
        totalEmissiveRadiance += (mix(uSeamColor * 2.2, uSeamHot * 4.0, seamCore)) * seamK;
        diffuseColor.rgb = mix(diffuseColor.rgb, uSeamColor, seamK * 0.6);`,
      )
  }
  material.customProgramCacheKey = () => 'ganesha-reveal'
  material.needsUpdate = true
}
