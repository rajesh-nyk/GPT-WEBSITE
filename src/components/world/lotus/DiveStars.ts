import {
  AdditiveBlending,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three'

/**
 * 3D stars for the dive into the light (approved sketch): a loose tube of near stars round
 * the flight path plus a wide field, positioned relative to the light's centre (world units).
 *
 * Motion blur: each star is a camera-facing quad stretched along its own on-screen motion,
 * worked out from the camera's REAL velocity (passed in each frame) — so a dive that stops
 * mid-scroll shows sharp stars, not streaks. Energy is spread along the streak.
 * Depth of field: in the close moments (focusK) stars far from the camera grow into soft,
 * dimmer discs so he stays the sharp centre.
 */
export class DiveStars {
  readonly mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>
  private u = {
    uVel: { value: new Vector3() },
    uFocus: { value: 0 },
    uTime: { value: 0 },
    uPx: { value: 1 },
    uRes: { value: new Vector2(1, 1) },
    uDepth: { value: 1 },
    uOp: { value: 1 },
  }

  /** depthScale: world units per unit of the camera's view space (LOTUS_SCALE in the lotus layer). */
  constructor(count: number, depthScale = 1) {
    this.u.uDepth.value = depthScale
    const base = new PlaneGeometry(1, 1)
    const g = new InstancedBufferGeometry()
    g.index = base.index
    g.setAttribute('position', base.getAttribute('position'))
    const pos = new Float32Array(count * 3)
    const seed = new Float32Array(count)
    const tube = Math.round(count * 0.45)
    for (let i = 0; i < count; i++) {
      if (i < tube) {
        const a = Math.random() * Math.PI * 2
        const r = 4 + Math.random() * 30
        const z = -40 + Math.random() * 230
        pos.set([Math.cos(a) * r - 12 * Math.min(1, z / 120), Math.sin(a) * r + 4, z], i * 3)
      } else {
        pos.set([(Math.random() - 0.5) * 420, (Math.random() - 0.5) * 300, -320 + Math.random() * 520], i * 3)
      }
      seed[i] = Math.random()
    }
    g.setAttribute('aPos', new InstancedBufferAttribute(pos, 3))
    g.setAttribute('aSeed', new InstancedBufferAttribute(seed, 1))
    g.instanceCount = count

    this.mesh = new Mesh(
      g,
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: this.u,
        vertexShader: /* glsl */ `
          uniform vec3 uVel; uniform float uFocus, uTime, uPx, uDepth; uniform vec2 uRes;
          attribute vec3 aPos; attribute float aSeed;
          varying vec2 vUv; varying float vA; varying float vSoft; varying float vS;
          void main(){
            vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
            if (mv.z > -0.05) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
            float depth = -mv.z * uDepth;                                   // world units from the camera
            vec4 clip = projectionMatrix * mv;
            // where this star appeared 1/30 s ago (the camera was behind by velocity * dt)
            vec4 mvPrev = modelViewMatrix * vec4(aPos + uVel * 0.033, 1.0);
            vec4 clipPrev = projectionMatrix * mvPrev;
            vec2 halfRes = uRes * 0.5;
            vec2 p0 = clip.xy / clip.w * halfRes;
            vec2 p1 = clipPrev.xy / max(clipPrev.w, 0.05) * halfRes;
            vec2 d = p0 - p1; float L = min(length(d), 140.0);
            vec2 dir = L > 0.01 ? normalize(d) : vec2(1.0, 0.0); vec2 perp = vec2(-dir.y, dir.x);
            float far = smoothstep(25.0, 60.0, depth) * uFocus;             // depth of field
            float size = (1.2 + aSeed * 2.6) * uPx * clamp(40.0 / depth, 0.7, 5.0) * (1.0 + 2.0 * far);
            float along = L + size;
            vec2 corner = p0 - dir * L * 0.5 + dir * position.x * along + perp * position.y * size;
            gl_Position = vec4(corner / halfRes * clip.w, clip.z, clip.w);
            float tw = 0.75 + 0.25 * sin(uTime * (1.0 + aSeed * 3.0) + aSeed * 40.0);
            vA = (0.5 + 0.9 * aSeed) * tw * sqrt(size / along) * (1.0 - 0.6 * far);   // streaks keep most of their light
            vSoft = far; vS = aSeed;
            vUv = position.xy + 0.5;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uOp; varying vec2 vUv; varying float vA; varying float vSoft; varying float vS;
          void main(){
            float across = abs(vUv.y - 0.5) * 2.0;
            float ends = smoothstep(0.0, 0.3, vUv.x) * (1.0 - smoothstep(0.7, 1.0, vUv.x));
            float core = exp(-across * across * mix(2.6, 1.4, vSoft));
            float k = core * mix(ends, 1.0 - smoothstep(0.3, 1.0, length(vUv - 0.5) * 2.0), vSoft) * vA * uOp;
            vec3 c = mix(vec3(1.0, 0.93, 0.85), vec3(1.0, 0.82, 0.88), step(0.8, vS));
            gl_FragColor = vec4(c * k, k);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    )
    this.mesh.frustumCulled = false
  }

  setSize(width: number, height: number, px: number) {
    this.u.uRes.value.set(width * px, height * px)
    this.u.uPx.value = px
  }

  /** velocity: camera velocity in the stars' units (world units per second); opacity 0..1. */
  update(velocity: Vector3, focusK: number, time: number, opacity = 1) {
    this.u.uOp.value = opacity
    this.mesh.visible = opacity > 0.001
    this.u.uVel.value.copy(velocity)
    this.u.uFocus.value = focusK
    this.u.uTime.value = time
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
  }
}
