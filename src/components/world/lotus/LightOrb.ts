import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  SphereGeometry,
  type Quaternion,
} from 'three'

/**
 * The living light Ganesha is revealed in (approved sketch, cinematic-sketch.html,
 * 22 Nov 2026): a swirling plasma shell, a white-hot breathing heart, a corona with slow
 * rays, a thin lens streak, and gold motes on tilted orbits. Authored in world units
 * (radius 1 at size 1). Two instances are used: one behind/around him (depth-tested) and
 * an overlay one drawn over him while he is inside the light.
 */
export const NOISE_GLSL = /* glsl */ `
  vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;} vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);} vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
  float snoise(vec3 v){ const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
    vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx); vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g;
    vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy); vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy; i=mod289(i);
    vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
    float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx; vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
    vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y); vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
    vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0)); vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
    vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3))); p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
    vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
    return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3))); }
  float fbm(vec3 p){ float s=0.0,a=0.5; for(int i=0;i<4;i++){ s+=a*snoise(p); p*=2.03; a*=0.5; } return s*0.5+0.5; }`

const BILLBOARD_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }'
const SPHERE_VERT = `varying vec3 vN; varying vec3 vV; varying vec3 vP;
  void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`

export type LightOrbOptions = {
  motes: number
  time: { value: number }
  /** Device pixel ratio for the motes' size. */
  px: { value: number }
  /** World units per unit of the camera's view space (1 in world space; LOTUS_SCALE in the lotus layer). */
  depthScale?: number
  /** Drawn over everything (he is inside the light): no depth test, late render order. */
  overlay?: boolean
}

export class LightOrb {
  readonly group = new Group()
  private uI = { value: 1 }
  /** How far the rays reach, 0..1 (1 = full corona). */
  private uR = { value: 1 }
  private billboards: Mesh[] = []
  private materials: ShaderMaterial[] = []
  private geometries: BufferGeometry[] = []
  private time: { value: number }

  constructor(o: LightOrbOptions) {
    this.time = o.time
    const uT = o.time
    const uI = this.uI
    const uDepth = { value: o.depthScale ?? 1 }
    const base = { transparent: true, depthWrite: false, blending: AdditiveBlending, depthTest: !o.overlay }
    const mat = (m: ShaderMaterial) => (this.materials.push(m), m)
    const geo = <G extends BufferGeometry>(g: G) => (this.geometries.push(g), g)

    // plasma shell: brighter towards its heart, swirling slowly, a blush rim where the light thins
    const shell = new Mesh(
      geo(new SphereGeometry(1, o.overlay ? 32 : 48, o.overlay ? 20 : 32)),
      mat(
        new ShaderMaterial({
          ...base,
          uniforms: { uT, uI },
          vertexShader: SPHERE_VERT,
          fragmentShader: o.overlay
            ? `uniform float uT, uI; varying vec3 vN; varying vec3 vV; varying vec3 vP;
            void main(){ float heart = pow(abs(dot(vN, vV)), 1.35);
              float a = heart * uI * 0.62;
              vec3 col = mix(vec3(1.0, 0.78, 0.48), vec3(1.0, 0.98, 0.92), heart);
              gl_FragColor = vec4(col * a, a);
              #include <tonemapping_fragment>
              #include <colorspace_fragment>
            }`
            : NOISE_GLSL +
            `uniform float uT, uI; varying vec3 vN; varying vec3 vV; varying vec3 vP;
            void main(){ float f = 1.0 - abs(dot(vN, vV));
              float n = fbm(vP * 1.8 + vec3(0.0, uT * 0.22, uT * 0.12));
              float swirl = fbm(vP * 3.6 + n * 1.8 - vec3(uT * 0.3));
              float heart = pow(1.0 - f, 1.8);
              vec3 ivory = vec3(1.0, 0.96, 0.88), gold = vec3(1.0, 0.74, 0.40), blush = vec3(1.0, 0.62, 0.72);
              vec3 col = mix(gold, ivory, heart) * (0.9 + 1.6 * heart) + blush * pow(f, 2.5) * 0.7;
              col *= 0.65 + 0.7 * swirl;
              // Fades to nothing at its outline: a soft body of light, never a disc with a rim.
              float a = (0.18 + 0.82 * heart) * uI * 0.42 * (1.0 - smoothstep(0.35, 0.97, f));
              gl_FragColor = vec4(col * a, a);
              #include <tonemapping_fragment>
              #include <colorspace_fragment>
            }`,
        }),
      ),
    )
    // white-hot heart (blooms)
    const heart = new Mesh(
      geo(new SphereGeometry(o.overlay ? 0.92 : 0.32, o.overlay ? 24 : 24, o.overlay ? 16 : 16)),
      mat(
        new ShaderMaterial({
          ...base,
          uniforms: { uT, uI },
          vertexShader: SPHERE_VERT,
          fragmentShader: `uniform float uT, uI; varying vec3 vN; varying vec3 vV; varying vec3 vP;
            void main(){ float c = pow(abs(dot(vN, vV)), 1.5); float pulse = 0.9 + 0.1 * sin(uT * 2.1);
              vec3 col = vec3(1.0, 0.97, 0.92) * 1.6 * c * pulse; gl_FragColor = vec4(col * uI, c * uI);
              #include <tonemapping_fragment>
              #include <colorspace_fragment>
            }`,
        }),
      ),
    )
    // corona + soft rays, always facing the camera
    const corona = new Mesh(
      geo(new PlaneGeometry(1, 1)),
      mat(
        new ShaderMaterial({
          ...base,
          uniforms: { uT, uI, uR: this.uR },
          vertexShader: BILLBOARD_VERT,
          fragmentShader: o.overlay
            ? `uniform float uT, uI, uR; varying vec2 vUv;
            void main(){ vec2 c=(vUv-.5)*2.0; float r=length(c);
              float halo=exp(-r*r*3.2); float rays=exp(-r*2.8)*(1.0-smoothstep(.45,1.0,r));
              float k=(halo*.62+rays*.18)*uI;
              gl_FragColor=vec4(vec3(1.0,.92,.78)*k,k);
              #include <tonemapping_fragment>
              #include <colorspace_fragment>
            }`
            : NOISE_GLSL +
            `uniform float uT, uI, uR; varying vec2 vUv;
            void main(){ vec2 c = (vUv - 0.5) * 2.0; float r = length(c); float a = atan(c.y, c.x);
              float n = fbm(vec3(cos(a) * 1.7, sin(a) * 1.7, uT * 0.12) + vec3(r * 2.4));
              float halo = exp(-pow(max(r - 0.12, 0.0) * 4.2, 1.25));
              float rays = pow(fbm(vec3(cos(a) * 3.2, sin(a) * 3.2, uT * 0.07)), 4.0) * 3.2 * exp(-r * 2.6) * smoothstep(0.1, 0.22, r) * (1.0 - smoothstep(uR * 0.35, uR, r));
              // Every ray has its own length, and all fade with a long soft tail — no ring.
              float len = 0.25 + 0.6 * fbm(vec3(cos(a) * 5.0, sin(a) * 5.0, 3.7 + uT * 0.03));
              rays *= exp(-pow(r / len, 2.0) * 2.2);
              vec3 ivory = vec3(1.0, 0.95, 0.86), gold = vec3(1.0, 0.77, 0.44), blush = vec3(1.0, 0.62, 0.72);
              vec3 col = mix(ivory, gold, smoothstep(0.08, 0.4, r)); col = mix(col, blush, smoothstep(0.35, 0.9, r) * 0.55);
              float k = (halo * (0.35 + 0.9 * n) * 0.5 + rays * 0.7 * exp(-r * r * 3.0)) * uI * (1.0 - smoothstep(0.4, 0.98, r));
              gl_FragColor = vec4(col * k, k);
              #include <tonemapping_fragment>
              #include <colorspace_fragment>
            }`,
        }),
      ),
    )
    corona.scale.setScalar(7)
    // thin cinematic lens streak through the heart
    const streak = new Mesh(
      geo(new PlaneGeometry(1, 1)),
      mat(
        new ShaderMaterial({
          ...base,
          uniforms: { uT, uI },
          vertexShader: BILLBOARD_VERT,
          fragmentShader: `uniform float uT, uI; varying vec2 vUv;
            void main(){ vec2 c = (vUv - 0.5) * 2.0; float k = exp(-abs(c.y) * 9.0) * exp(-abs(c.x) * 2.6) * (1.0 - smoothstep(0.35, 0.95, abs(c.x))) * (1.0 - smoothstep(0.3, 0.95, abs(c.y))) * (0.85 + 0.15 * sin(uT * 2.7)) * 0.45 * uI;
              gl_FragColor = vec4(vec3(1.0, 0.86, 0.66) * k, k);
              #include <tonemapping_fragment>
              #include <colorspace_fragment>
            }`,
        }),
      ),
    )
    streak.scale.set(14, 0.35, 1)
    // gold motes on tilted orbits round the light: they show its depth as the camera flies past
    const ring = new Float32Array(o.motes * 4)
    for (let i = 0; i < o.motes; i++) {
      const band = i % 5
      ring.set(
        [1.3 + band * 0.42 + Math.random() * 0.3, Math.random() * Math.PI * 2, (band - 2) * 0.42 + (Math.random() - 0.5) * 0.18, Math.random()],
        i * 4,
      )
    }
    const mg = geo(new BufferGeometry())
    mg.setAttribute('position', new BufferAttribute(new Float32Array(o.motes * 3), 3))
    mg.setAttribute('ring', new BufferAttribute(ring, 4))
    const motes = new Points(
      mg,
      mat(
        new ShaderMaterial({
          ...base,
          uniforms: { uT, uI, uPx: o.px, uDepth },
          vertexShader: `uniform float uT, uPx, uDepth; attribute vec4 ring; varying float vTw; varying float vS;
            void main(){ float r = ring.x, sd = ring.w; float an = ring.y + uT * (0.25 + 0.35 * sd) / r;
              vec3 p = vec3(cos(an) * r, sin(an * 3.0 + sd * 10.0) * 0.05 * r, sin(an) * r);
              float t1 = ring.z, t2 = sd * 2.4; float c1 = cos(t1), s1 = sin(t1), c2 = cos(t2), s2 = sin(t2);
              p = vec3(p.x, c1 * p.y - s1 * p.z, s1 * p.y + c1 * p.z); p = vec3(c2 * p.x - s2 * p.z, p.y, s2 * p.x + c2 * p.z);
              vec4 mv = modelViewMatrix * vec4(p, 1.0);
              vTw = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uT * (1.4 + sd * 3.0) + sd * 50.0), 3.0); vS = sd;
              gl_PointSize = (2.0 + sd * 3.5) * uPx * clamp(14.0 / (-mv.z * uDepth), 0.5, 7.0);
              gl_Position = projectionMatrix * mv; }`,
          fragmentShader: `uniform float uI; varying float vTw; varying float vS;
            void main(){ float d = length(gl_PointCoord - 0.5); float k = exp(-d * d * 28.0) * vTw * uI;
              vec3 col = mix(vec3(1.0, 0.82, 0.5), vec3(1.0, 0.95, 0.88), step(0.65, vS)); gl_FragColor = vec4(col * k * 2.2, k);
              #include <tonemapping_fragment>
              #include <colorspace_fragment>
            }`,
        }),
      ),
    )
    motes.frustumCulled = false

    for (const m of [shell, heart, corona, streak, motes]) {
      if (o.overlay) m.renderOrder = 10
      this.group.add(m)
    }
    this.billboards = [corona, streak]
  }

  /** Brightness 0..1 (hidden at 0) and radius in world units; breathes gently. */
  set(intensity: number, size: number, rays = 1) {
    this.uI.value = intensity
    this.uR.value = rays
    this.group.visible = intensity > 0.001
    this.group.scale.setScalar(size * (1 + 0.035 * Math.sin(this.time.value * 1.3)))
  }

  /** Corona and streak face the camera (pass the camera's world quaternion). */
  faceCamera(q: Quaternion) {
    for (const b of this.billboards) b.quaternion.copy(q)
  }

  dispose() {
    for (const m of this.materials) m.dispose()
    for (const g of this.geometries) g.dispose()
  }
}
