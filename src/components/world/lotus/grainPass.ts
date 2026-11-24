import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'

/**
 * Fine film grain over the lotus layer, matching page 1's grain, so the dive reads as
 * filmed rather than drawn. Keeps alpha (the layer is transparent over the world).
 */
export function makeGrainPass() {
  return new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse; uniform float uTime; varying vec2 vUv;
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        float n = fract(sin(dot(gl_FragCoord.xy + fract(uTime * 7.31) * 113.0, vec2(12.9898, 78.233))) * 43758.5453);
        c.rgb += (n - 0.5) * 0.035 * c.a;   // only where the layer is drawn (the world has its own grain)
        gl_FragColor = c;
      }`,
  })
}
