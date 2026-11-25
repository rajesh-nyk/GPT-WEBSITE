import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Group,
  HalfFloatType,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MathUtils,
  NeutralToneMapping,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  Points,
  Scene,
  ShaderMaterial,
  SpotLight,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
  type Material,
  type MeshStandardMaterial,
  type Object3D,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { LOTUS_H, LOTUS_PIVOT, LOTUS_SCALE, LOTUS_WORLD_CENTER, worldToLotus } from './layout'
import { lotusGrade } from './appearance'
import { splitByPart } from './parts'
import { LightOrb } from './LightOrb'
import { DiveStars } from './DiveStars'
import { makeGrainPass } from './grainPass'
import type { LotusShot } from './sequence'
import { CINE3 } from '../../ganesha/fx'
import { wheelState } from '../TravelingWheel'
import { orbMotionDebug, stepProjectedOrbRadius } from './orbMotion'

/**
 * Page 2's Lotus Ganesha, approved by Rajesh on 22 Nov 2026 from the preview
 * (awwwards-site/lotus-ganesha-preview.html). Everything here is tuned in model units.
 *
 * It draws on its own transparent canvas, layered over the world canvas (stars, rays)
 * and under the exit's black. Reasons: it needs its own colour handling (neutral tone
 * mapping keeps the lotus pink and his skin true — the world's ACES turned both
 * orange-brown) and a glow on the lotus only (the world's bloom hazed over him).
 * The world camera drives it, so it moves exactly with everything else.
 *
 * One mesh, two materials: every vertex carries _PART (1 = Ganesha, 0 = lotus) and
 * _SPARK (where the sparkles go), baked by scripts/bake-lotus-ganesha.mjs.
 */
export type LotusTier = 'high' | 'mid' | 'low'

export type LotusFrame = {
  /** The shot (lotus/sequence) — the same values that placed the world camera. */
  shot: LotusShot
  /** Seconds, for the living motion. */
  time: number
  /** 0..1 eased hover over him. */
  hover: number
  /** Reduced motion: no living motion, no blink. */
  still: boolean
  /** World camera velocity (world units / s), for the stars' motion streaks. */
  velocity: Vector3
}

const SPARKS: Record<LotusTier, [number, number]> = { high: [1200, 2200], mid: [900, 1300], low: [600, 700] }
/** Dive stars and the light's motes per tier. */
const STARS: Record<LotusTier, number> = { high: 3500, mid: 2400, low: 1000 }
const MOTES: Record<LotusTier, number> = { high: 900, mid: 600, low: 300 }

const smooth = (x: number) => x * x * (3 - 2 * x)

export class LotusScene {
  readonly renderer: WebGLRenderer
  private scene = new Scene()
  private camera = new PerspectiveCamera(35, 1, 0.01, 50)
  private tier: LotusTier
  private composer: EffectComposer | null = null
  private bloomDirty = true
  private bloomComposer: EffectComposer | null = null
  private envTex: Texture
  private disposables: { dispose(): void }[] = []

  private uTime = { value: 0 }
  private uMove = { value: 1 }
  private uGlow = { value: 1 }
  /** Preview ?cine3: he shows as a bright shape inside the light, then a gold edge. */
  private uExpose = { value: 0 }
  /** Preview ?cine3: 0 while the wheel is still in front, easing to 1 once it has gone. */
  private wheelGate = 1
  private lastPlace = 0
  private uRim = { value: 0 }
  private eyes = {
    uBlink: { value: 0 },
    uEyeL: { value: new Vector3(-0.0119, 0.2271, -0.0163) },
    uNL: { value: new Vector3(-0.6, -0.1, 0.78).normalize() },
    uLidL: { value: new Vector2(0.608, 0.2563) },
    uEyeR: { value: new Vector3(0.0205, 0.2271, -0.0147) },
    uNR: { value: new Vector3(0.52, -0.1, 0.85).normalize() },
    uLidR: { value: new Vector2(0.0659, 0.2388) },
    uEyeSize: { value: new Vector2(0.0068, 0.0037) },
  }

  private key = new SpotLight(0xffe4c4, 0, 3, 0.5, 0.8, 1.2) // warm golden key (front-right, high)
  private rim = new DirectionalLight(0xffb060, 0) // amber edge light, left
  private rim2 = new DirectionalLight(0xffc27a, 0) // amber edge light, right
  private fill = new PointLight(0xffa45c, 0, 1.2, 1.5) // low diya bounce
  private hemi = new HemisphereLight(0xfff0d8, 0x4a3038, 0.3)
  private top = new DirectionalLight(0xffeedd, 0) // soft light from above
  /** The light's warmth on him: from behind and around once it settles (model units). */
  private orbLight = new PointLight(0xffd9a8, 0, 3, 1.5)
  /** World-unit content (the light, the dive stars), mapped into model units. */
  private worldRoot = new Group()
  private backOrb: LightOrb
  private frontOrb: LightOrb
  private stars: DiveStars
  private grain: ShaderPass | null = null
  private orbModel = new Vector3()
  private orbWorld = new Vector3()
  private displayedOrbSize = 0.12
  private displayedOrbRadiusPx = 0
  private displayedOrbK = 0
  private displayedRays = 0
  /** Off when the frame guard has dropped the site to its lowest tier (no glow pass there). */
  private glowOn = true

  private lotus: Mesh | null = null
  private gan: Mesh | null = null
  private ganLit: Material | null = null
  private ganDark: Material | null = null
  private sparkles: Points<BufferGeometry, ShaderMaterial> | null = null
  private sparkOp = 1
  private halo: Mesh<PlaneGeometry, ShaderMaterial>
  private dust: Points<BufferGeometry, ShaderMaterial>
  private pxUniforms: { value: number }[] = []
  private nextBlink = 2.5
  private blinkStart = -1
  private black = new Color(0x000000)



  constructor(canvas: HTMLCanvasElement, tier: LotusTier) {
    this.tier = tier
    const r = new WebGLRenderer({ canvas, antialias: tier !== 'low', alpha: true, powerPreference: 'high-performance' })
    r.setClearColor(0x000000, 0)
    r.toneMapping = NeutralToneMapping
    r.toneMappingExposure = 1
    r.outputColorSpace = SRGBColorSpace
    this.renderer = r

    const pmrem = new PMREMGenerator(r)
    const room = new RoomEnvironment()
    this.envTex = pmrem.fromScene(room, 0.04).texture
    room.dispose()
    pmrem.dispose()
    this.scene.environment = this.envTex
    this.scene.environmentIntensity = 0.35

    this.key.position.set(0.25, 0.9, 0.7)
    this.rim.position.set(-0.6, 0.6, -0.8)
    this.rim2.position.set(0.7, 0.5, -0.7)
    this.fill.position.set(-0.25, 0.08, 0.35)
    this.top.position.set(0.35, 1.2, 0.5)
    this.scene.add(this.key, this.key.target, this.rim, this.rim2, this.fill, this.hemi, this.top, this.orbLight)
    // Front-shot lighting (approved), held; the living light adds its own warmth (orbLight).
    this.top.intensity = 0.5
    this.rim.intensity = 3.2
    this.rim2.intensity = 2.6
    this.fill.intensity = 0.8
    this.hemi.intensity = 0.16
    this.scene.environmentIntensity = 0.3
    this.key.target.position.set(0, LOTUS_H * 0.6, 0)

    // World units → model units: w ↦ (w − centre)/scale + pivot.
    this.worldRoot.scale.setScalar(1 / LOTUS_SCALE)
    this.worldRoot.position.copy(LOTUS_PIVOT).sub(LOTUS_WORLD_CENTER.clone().divideScalar(LOTUS_SCALE))
    const px = { value: 1 }
    this.pxUniforms.push(px)
    this.backOrb = new LightOrb({ motes: MOTES[tier], time: this.uTime, px, depthScale: LOTUS_SCALE })
    this.frontOrb = new LightOrb({ motes: MOTES[tier], time: this.uTime, px, depthScale: LOTUS_SCALE, overlay: true })
    this.stars = new DiveStars(STARS[tier], LOTUS_SCALE)
    this.stars.mesh.position.copy(LOTUS_WORLD_CENTER)
    this.worldRoot.add(this.stars.mesh, this.backOrb.group, this.frontOrb.group)
    this.scene.add(this.worldRoot)

    this.halo = this.makeHalo()
    this.dust = this.makeDust()
    this.scene.add(this.halo, this.dust)

    // Glow on the lotus only: a bloom render of the lotus alone (Ganesha drawn black, so he
    // still hides what's behind him) is added on top. None on the low tier.
    if (tier !== 'low') {
      const renderPass = new RenderPass(this.scene, this.camera)
      const bloomComposer = new EffectComposer(r, new WebGLRenderTarget(1, 1, { type: HalfFloatType }))
      bloomComposer.renderToScreen = false
      bloomComposer.addPass(renderPass)
      bloomComposer.addPass(new UnrealBloomPass(new Vector2(256, 256), 0.4, 0.3, 1.0))
      const mix = new ShaderPass(
        new ShaderMaterial({
          uniforms: { baseTexture: { value: null }, bloomTexture: { value: bloomComposer.renderTarget2.texture } },
          vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
          // Transparent canvas: the glow also raises alpha, so it shows over the world below.
          fragmentShader: `uniform sampler2D baseTexture, bloomTexture; varying vec2 vUv;
            void main(){
              vec4 base = texture2D(baseTexture, vUv);
              vec3 glow = vec3(1.0, 0.8, 0.88) * texture2D(bloomTexture, vUv).rgb;
              gl_FragColor = vec4(base.rgb + glow, max(base.a, clamp(max(glow.r, max(glow.g, glow.b)), 0.0, 1.0)));
            }`,
        }),
        'baseTexture',
      )
      mix.needsSwap = true
      const composer = new EffectComposer(r, new WebGLRenderTarget(1, 1, { type: HalfFloatType }))
      composer.addPass(renderPass)
      composer.addPass(mix)
      composer.addPass(new OutputPass())
      this.grain = makeGrainPass()
      composer.addPass(this.grain)
      this.composer = composer
      this.bloomComposer = bloomComposer
    }
  }

  /** Load the model (url already resolved to the tier's variant). */
  async load(url: string, dracoPath: string) {
    const draco = new DRACOLoader().setDecoderPath(dracoPath)
    const gltf = await new GLTFLoader().setDRACOLoader(draco).loadAsync(url)
    draco.dispose()
    let mesh: Mesh | null = null
    gltf.scene.updateMatrixWorld(true)
    gltf.scene.traverse((o: Object3D) => {
      if ((o as Mesh).isMesh && !mesh) mesh = o as Mesh
    })
    if (!mesh) throw new Error('lotus-ganesha: no mesh')
    const src = mesh as Mesh
    const geo = src.geometry.clone().applyMatrix4(src.matrixWorld) // rest pose baked in: local = model units
    geo.computeBoundingBox()
    const box = geo.boundingBox!
    geo.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2)
    // Rename the baked tags to shader-friendly names.
    geo.setAttribute('aPart', geo.getAttribute('_part'))
    geo.deleteAttribute('_part')
    const spark = geo.getAttribute('_spark') as BufferAttribute | undefined
    geo.deleteAttribute('_spark')

    // One mesh, two materials: the lotus (soft satin petals) and Ganesha (keeps some gold shine).
    const lotusMat = src.material as MeshStandardMaterial
    const ganMat = lotusMat.clone()
    lotusMat.metalness = 0.12 // the model came in fully metallic, which made the petals look copper
    lotusMat.roughness = 0.8
    ganMat.metalness = 0.45
    ganMat.roughness = 0.9
    this.patch(lotusMat, 0)
    this.patch(ganMat, 1)
    const ganDark = new MeshBasicMaterial({ color: 0x000000 })
    this.patch(ganDark, 2)
    // Split the triangles once (every triangle lies in one texture piece, so one part): each
    // mesh then draws only its own half — no per-pixel discards, half the vertex work.
    const [lotusGeo, ganGeo] = splitByPart(geo, geo.getAttribute('aPart') as BufferAttribute)
    this.lotus = new Mesh(lotusGeo, lotusMat)
    this.gan = new Mesh(ganGeo, ganMat)
    this.ganLit = ganMat
    this.ganDark = ganDark
    this.lotus.visible = this.gan.visible = false
    this.scene.add(this.lotus, this.gan)
    this.sparkles = this.makeSparkles(geo, spark)
    this.gan.add(this.sparkles) // rides with Ganesha, so it follows every move
    this.disposables.push(geo, lotusGeo, ganGeo, lotusMat, ganMat, ganDark, this.sparkles.geometry, this.sparkles.material)
    for (const tex of [lotusMat.map, lotusMat.normalMap, lotusMat.metalnessMap, lotusMat.roughnessMap])
      if (tex) this.disposables.push(tex)
    // Compile the shaders and upload the textures now, off the reveal's critical frames.
    this.lotus.visible = this.gan.visible = true
    await this.renderer.compileAsync(this.scene, this.camera)
    this.lotus.visible = this.gan.visible = false
    for (const tex of [lotusMat.map, lotusMat.normalMap, lotusMat.metalnessMap]) if (tex) this.renderer.initTexture(tex)
  }

  get loaded() {
    return this.lotus !== null
  }

  setSize(width: number, height: number, dpr: number) {
    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(width, height, false)
    this.composer?.setPixelRatio(dpr)
    this.composer?.setSize(width, height)
    // Full resolution on high: at half resolution each blur step reaches twice as far and the
    // glow hazed the whole frame (worst in portrait). Mid trades that for speed; any device the
    // frame guard drops to the lowest tier loses the glow pass entirely (setGlow).
    this.bloomComposer?.setPixelRatio(this.tier === 'high' ? dpr : dpr * 0.5)
    this.bloomComposer?.setSize(width, height)
    for (const u of this.pxUniforms) u.value = dpr
    this.stars.setSize(width, height, dpr)
  }

  /** The site's runtime tier may drop mid-visit (frame guard): the glow pass follows it. */
  setGlow(on: boolean) {
    this.glowOn = on
  }

  /** Clear to transparent (when the stage leaves the screen). */
  clear() {
    this.renderer.setRenderTarget(null)
    this.renderer.clear()
  }

  /** Draw one frame from the world camera. */
  render(world: PerspectiveCamera, f: LotusFrame) {
    if (!this.lotus || !this.gan || !this.sparkles) return
    // World camera → model units.
    const cam = this.camera
    worldToLotus(cam.position.copy(world.position))
    cam.quaternion.copy(world.quaternion)
    cam.fov = world.fov
    cam.aspect = world.aspect
    cam.near = world.near / LOTUS_SCALE
    cam.far = world.far / LOTUS_SCALE
    cam.updateProjectionMatrix()
    cam.updateMatrixWorld()

    this.uTime.value = f.still ? 0 : f.time
    this.uMove.value = f.still ? 0 : 1
    this.place(f)
    if (!f.still) this.blink(f.time)
    if (this.grain) this.grain.uniforms.uTime.value = f.time

    // Perf (24 Nov 2026): the glow pass only ever shows him (orbs, halo, stars and
    // reveal light are kept out of it), so while he isn't drawn it renders an empty frame.
    // Skip it then; clear its result once so no old glow lingers.
    const glowNeeded = this.gan.visible || this.lotus.visible
    if (this.bloomComposer && this.composer && this.glowOn && !glowNeeded) {
      if (this.bloomDirty) {
        const r = this.renderer
        const prev = r.getRenderTarget()
        for (const rt of [this.bloomComposer.renderTarget1, this.bloomComposer.renderTarget2]) {
          r.setRenderTarget(rt)
          r.clear()
        }
        r.setRenderTarget(prev)
        this.bloomDirty = false
      }
      this.composer.render()
    } else if (this.bloomComposer && this.composer && this.glowOn) {
      this.bloomDirty = true
      this.gan.material = this.ganDark!
      this.halo.visible = this.dust.visible = this.stars.mesh.visible = false
      // The light glows on its own (bright heart, corona); bloomed again it hazes over him.
      const backOn = this.backOrb.group.visible
      const frontOn = this.frontOrb.group.visible
      this.backOrb.group.visible = this.frontOrb.group.visible = false
      // Sparkles add only a little to the glow, so it doesn't haze over him.
      this.sparkles.material.uniforms.uOp.value = 0.6 * this.sparkOp
      this.scene.background = this.black
      // His reveal brightening (bright shape / gold edge) stays out of the glow: bloomed, it
      // spreads into a visible disc.
      const ex = this.uExpose.value, rim = this.uRim.value
      this.uExpose.value = this.uRim.value = 0
      this.bloomComposer.render()
      this.uExpose.value = ex
      this.uRim.value = rim
      this.scene.background = null
      this.sparkles.material.uniforms.uOp.value = this.sparkOp
      this.gan.material = this.ganLit!
      this.halo.visible = this.dust.visible = this.stars.mesh.visible = true
      this.backOrb.group.visible = backOn
      this.frontOrb.group.visible = frontOn
      this.composer.render()
    } else {
      this.renderer.render(this.scene, cam)
    }
  }

  dispose() {
    for (const d of this.disposables) d.dispose()
    this.halo.geometry.dispose()
    this.halo.material.dispose()
    this.dust.geometry.dispose()
    this.dust.material.dispose()
    this.envTex.dispose()
    this.backOrb.dispose()
    this.frontOrb.dispose()
    this.stars.dispose()
    this.composer?.dispose()
    this.bloomComposer?.dispose()
    this.renderer.dispose()
  }

  // ---- per frame ------------------------------------------------------------------------

  private place({ shot, time, hover, still, velocity }: LotusFrame) {
    const lotus = this.lotus!
    const gan = this.gan!
    // The subject stays rigidly inside its light while travelling. Living motion begins
    // only after the camera has settled into the front darshan.
    const float = still ? 0 : shot.frontK
    // At rest on the lotus, floating softly; hidden only while the light covers him.
    lotus.position.set(0, Math.sin(time * 0.7) * 0.003 * float, 0)
    lotus.rotation.set(0, Math.sin(time * 0.33) * 0.035 * float, Math.sin(time * 0.5) * 0.006 * float)
    gan.position.copy(lotus.position)
    gan.rotation.copy(lotus.rotation)
    lotus.visible = gan.visible = shot.figure > 0.5
    if (shot.figScale < 1) {
      // Shrink toward the light's centre (lotus space), so he is drawn into it.
      worldToLotus(this.orbModel.copy(shot.orbPos))
      lotus.position.lerp(this.orbModel, 1 - shot.figScale)
      gan.position.copy(lotus.position)
    }
    lotus.scale.setScalar(shot.figScale)
    gan.scale.setScalar(shot.figScale)
    this.key.intensity = 11 * (1 + 0.25 * hover)

    // Gold ring + dust: only in the front shot.
    this.halo.position.set(0, 0.215 + lotus.position.y, -0.1)
    this.halo.quaternion.copy(this.camera.quaternion)
    this.halo.scale.setScalar(0.34)
    this.halo.material.uniforms.uOp.value = shot.frontK
    this.dust.material.uniforms.uOp.value = shot.frontK
    this.sparkOp = 0.8
    this.sparkles!.material.uniforms.uKeep.value = 0.2

    // The living light (world units) and its warmth on him.
    const orbWorld = this.orbWorld.copy(shot.orbPos)
    orbWorld.y += lotus.position.y * LOTUS_SCALE
    for (const orb of [this.backOrb, this.frontOrb]) {
      orb.group.position.copy(orbWorld)
      orb.faceCamera(this.camera.quaternion)
    }
    const dt = Math.min(0.1, Math.max(0, time - this.lastPlace))
    this.lastPlace = time
    this.wheelGate += ((CINE3 && wheelState.ahead ? 0 : 1) - this.wheelGate) * (1 - Math.exp(-dt / 0.25))
    const orbK = shot.orbK * this.wheelGate
    const singleGlowTarget = orbK * Math.max(.24, shot.flashK)
    if (orbK <= 0.001) {
      this.displayedOrbSize = 0
      this.displayedOrbRadiusPx = 0
      this.displayedOrbK = 0
      this.displayedRays = 0
      orbMotionDebug.radiusPx = orbMotionDebug.targetRadiusPx = orbMotionDebug.intensity = 0
    } else {
      const governed = stepProjectedOrbRadius(
        this.displayedOrbRadiusPx,
        shot.orbSize,
        shot.pos.distanceTo(orbWorld),
        shot.fov,
        this.renderer.domElement.clientHeight,
      )
      this.displayedOrbSize = governed.size
      this.displayedOrbRadiusPx = governed.radiusPx
      this.displayedOrbK += MathUtils.clamp(singleGlowTarget - this.displayedOrbK, -.025, .025)
      this.displayedRays += MathUtils.clamp(shot.rays - this.displayedRays, -.025, .025)
      orbMotionDebug.radiusPx = governed.radiusPx
      orbMotionDebug.targetRadiusPx = governed.targetRadiusPx
      orbMotionDebug.intensity = this.displayedOrbK
    }
    // One continuous light only. The old front→rear handoff looked like one glow fading
    // and another appearing. Keep the covering orb alive and dim it smoothly in place.
    this.backOrb.set(0, this.displayedOrbSize, shot.rays)
    this.frontOrb.set(this.displayedOrbK, this.displayedOrbSize, this.displayedRays)
    this.uExpose.value = shot.expose
    this.uRim.value = shot.rim
    worldToLotus(this.orbModel.copy(orbWorld))
    this.orbLight.position.copy(this.orbModel)
    this.orbLight.intensity = 3 * orbK
    this.stars.update(velocity, shot.focusK, time, shot.starsK)
  }

  /** Slow, soft blink every 3.5–7 s: 0.22 s closing, 0.12 s rest, 0.38 s opening. */
  private blink(t: number) {
    if (t > this.nextBlink && this.blinkStart < 0) this.blinkStart = t
    let b = 0
    if (this.blinkStart >= 0) {
      const k = t - this.blinkStart
      b = k < 0.22 ? smooth(k / 0.22) : k < 0.34 ? 1 : Math.max(0, 1 - smooth(Math.min(1, (k - 0.34) / 0.38)))
      if (k > 0.72) {
        this.blinkStart = -1
        this.nextBlink = t + 3.5 + Math.random() * 3.5
      }
    }
    this.eyes.uBlink.value = b
  }

  // ---- materials ------------------------------------------------------------------------

  /** pass 0 = lotus, 1 = Ganesha, 2 = Ganesha as a black stand-in for the glow render. */
  private patch(mat: Material, pass: 0 | 1 | 2) {
    mat.customProgramCacheKey = () => 'lotus-ganesha-' + pass
    mat.onBeforeCompile = (sh: WebGLProgramParametersWithUniforms) => {
      Object.assign(sh.uniforms, { uTime: this.uTime, uMove: this.uMove, uGlow: this.uGlow, uExpose: this.uExpose, uRim: this.uRim }, this.eyes)
      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uTime, uMove; varying vec3 vL;
          // turn point p around pivot c, about axis ax, by angle a (Rodrigues)
          vec3 turn(vec3 p, vec3 c, vec3 ax, float a) {
            vec3 v = p - c; float cs = cos(a), sn = sin(a);
            return c + v * cs + cross(ax, v) * sn + ax * dot(ax, v) * (1.0 - cs);
          }
          // 1 inside radius r0, fading to 0 by r1
          float near(vec3 p, vec3 c, float r0, float r1) { return 1.0 - smoothstep(r0, r1, distance(p, c)); }
          float segW(vec3 p, vec3 a, vec3 b, float r, out float along) {
            vec3 ab = b - a; along = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
            return 1.0 - smoothstep(r * 0.6, r, distance(p, a + ab * along));
          }`,
        )
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n vL = position;\n ${pass === 0 ? PETAL_MOTION : GANESHA_MOTION}`)
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\n${FRAGMENT_COMMON}\nuniform float uExpose, uRim;`)
        .replace(
          '#include <map_fragment>',
          pass === 2 ? '#include <map_fragment>' : `#include <map_fragment>\n${pass === 0 ? LOTUS_COLOUR : GANESHA_COLOUR}`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          float fres = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.5);
          float tipG = smoothstep(0.1, 0.2, length(vL.xz));
          totalEmissiveRadiance += isPetal * uGlow * (diffuseColor.rgb * 0.12 + vec3(1.0, 0.62, 0.78) * (fres * 0.9 + tipG * 0.15));
          ${pass === 2 ? '' : `diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.95, 0.88), uExpose * 0.6);
          totalEmissiveRadiance += uExpose * vec3(1.0, 0.94, 0.86) * 0.55 + uRim * pow(fres, 0.8) * vec3(1.0, 0.82, 0.52) * 1.6;`}`,
        )
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.8, isPetal);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = mix(metalnessFactor, 0.1, isPetal);')
    }
  }

  // ---- extras ---------------------------------------------------------------------------

  /** Fine prabhavali ring of light + faint rays, behind his head (front shot only). */
  private makeHalo() {
    const halo = new Mesh(
      new PlaneGeometry(1, 1),
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
        uniforms: { uTime: this.uTime, uOp: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform float uTime, uOp; varying vec2 vUv;
          void main(){
            vec2 c = (vUv - 0.5) * 2.0; float r = length(c), a = atan(c.y, c.x);
            float core  = exp(-r * r * 5.0) * 0.07;
            float ring  = exp(-pow((r - 0.70) / 0.010, 2.0)) * (0.55 + 0.3 * sin(a * 2.0 - uTime * 0.5));
            float ring2 = exp(-pow((r - 0.76) / 0.004, 2.0)) * 0.22;
            float rays  = pow(max(0.0, sin(a * 48.0 + uTime * 0.08)), 14.0) * (1.0 - smoothstep(0.25, 0.69, r)) * smoothstep(0.08, 0.3, r) * 0.05;
            float k = (core + ring + ring2 + rays) * uOp;
            gl_FragColor = vec4(vec3(1.0, 0.8, 0.5) * k, k);
          }`,
      }),
    )
    halo.renderOrder = -1
    return halo
  }

  /** Gold dust drifting up around him (front shot only). */
  private makeDust() {
    const N = 140
    const pos = new Float32Array(N * 3)
    const seed = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      pos.set([(Math.random() - 0.5) * 0.5, Math.random() * 0.4, (Math.random() - 0.5) * 0.35], i * 3)
      seed[i] = Math.random()
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('seed', new BufferAttribute(seed, 1))
    const uPx = { value: 1 }
    this.pxUniforms.push(uPx)
    return new Points(
      g,
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
        uniforms: { uTime: this.uTime, uOp: { value: 0 }, uPx },
        vertexShader: `uniform float uTime, uPx; attribute float seed; varying float vTw;
          void main(){
            vec3 p = position;
            p.y = mod(p.y + uTime * (0.006 + seed * 0.01), 0.42);
            p.x += sin(uTime * 0.3 + seed * 40.0) * 0.015;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            vTw = (0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * (1.0 + seed * 2.0) + seed * 60.0), 3.0)) * smoothstep(0.0, 0.05, p.y) * (1.0 - smoothstep(0.32, 0.42, p.y));
            gl_PointSize = (1.2 + seed * 2.2) * uPx * (0.6 / -mv.z);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `uniform float uOp; varying float vTw;
          void main(){ float d = length(gl_PointCoord - 0.5); float k = (1.0 - smoothstep(0.0, 0.5, d)) * vTw * uOp * 0.9;
            gl_FragColor = vec4(vec3(1.0, 0.82, 0.55) * k, k); }`,
      }),
    )
  }

  /** Shiny 3D sparkles on the join with the lotus and his lower sides (baked _SPARK spots). */
  private makeSparkles(geo: BufferGeometry, spark: BufferAttribute | undefined) {
    const P = geo.getAttribute('position') as BufferAttribute
    const N = geo.getAttribute('normal') as BufferAttribute
    const seam: number[] = []
    const sides: number[] = []
    if (spark)
      for (let i = 0; i < spark.count; i++) {
        const s = spark.getX(i)
        if (s > 0.75) seam.push(i)
        else if (s > 0.25) sides.push(i)
      }
    const pick = (arr: number[], k: number) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
      }
      return arr.slice(0, k)
    }
    const [nSeam, nSides] = SPARKS[this.tier]
    const chosen = [...pick(seam, nSeam), ...pick(sides, nSides)]
    const pos = new Float32Array(chosen.length * 3)
    const seed = new Float32Array(chosen.length)
    chosen.forEach((v, k) => {
      // just off the surface
      pos[k * 3] = P.getX(v) + N.getX(v) * 0.003
      pos[k * 3 + 1] = P.getY(v) + N.getY(v) * 0.003
      pos[k * 3 + 2] = P.getZ(v) + N.getZ(v) * 0.003
      seed[k] = Math.random()
    })
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('seed', new BufferAttribute(seed, 1))
    const uPx = { value: 1 }
    this.pxUniforms.push(uPx)
    const pts = new Points(
      g,
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
        uniforms: { uTime: this.uTime, uPx, uOp: { value: 1 }, uKeep: { value: 1 } },
        vertexShader: `uniform float uTime, uPx, uKeep; attribute float seed; varying float vTw; varying float vSeed;
          void main(){
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            float tw = 0.5 + 0.5 * sin(uTime * (0.9 + seed * 2.2) + seed * 80.0);
            vTw = 0.3 + 0.7 * pow(tw, 4.0); vSeed = seed;   // never fully off, so the sides stay covered
            gl_PointSize = (12.0 + seed * 22.0) * (0.5 + 0.5 * vTw) * uPx * (0.8 / -mv.z);
            if (fract(seed * 97.13) > uKeep) gl_PointSize = 0.0;   // in the front shot only a light sprinkle stays
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `uniform float uOp; varying float vTw; varying float vSeed;
          void main(){
            vec2 c = gl_PointCoord - 0.5;
            float a = vSeed * 6.283;
            vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * c;
            float core = exp(-dot(c, c) * 90.0);
            float rays = exp(-abs(q.y) * 38.0) * (1.0 - smoothstep(0.0, 0.5, abs(q.x)))
                       + exp(-abs(q.x) * 38.0) * (1.0 - smoothstep(0.0, 0.5, abs(q.y)));
            float k = (core * 2.2 + rays * 1.0) * vTw * uOp;
            vec3 col = mix(vec3(1.0, 0.86, 0.55), vec3(1.0, 0.95, 0.9), step(0.7, vSeed));
            gl_FragColor = vec4(col * k, k);
          }`,
      }),
    )
    pts.renderOrder = 3
    return pts
  }
}

// ---- shader pieces (model units) ---------------------------------------------------------

/** Petals breathe: a slow wave round the flower plus a light flutter at the tips; zero where
 *  they meet Ganesha, so nothing tears. */
const PETAL_MOTION = /* glsl */ `
  float pr = length(position.xz);
  float pw = smoothstep(0.125, 0.2, pr) * clamp(position.y / 0.11, 0.0, 1.2);
  float pa = atan(position.z, position.x);
  float sway = (sin(uTime * 0.8 + pa * 2.0) * 0.6 + sin(uTime * 0.5 - pa * 3.0) * 0.4) * 0.009 * pw;
  float flutter = sin(uTime * 1.7 + pa * 9.0 + pr * 40.0) * 0.0025 * pw * pw;
  transformed.xz += normalize(position.xz + 1e-5) * (sway + flutter) * uMove;
  transformed.y += (sway * 0.5 + flutter) * uMove;`

/** Ganesha lives: arms turn as solid pieces (the axe never bends), the flower nods, the
 *  palm tilts, the trunk and ears sway, the body sways from the hips and breathes.
 *  Regions are picked on the rest pose (q) so they never drift. */
const GANESHA_MOTION = /* glsl */ `
  vec3 p = position, q = position; float w, al;
  w = (1.0 - smoothstep(-0.064, -0.056, q.x)) * smoothstep(0.138, 0.15, q.y) * smoothstep(-0.052, -0.044, q.z) * (1.0 - smoothstep(0.004, 0.012, q.z));
  p = mix(p, turn(p, vec3(-0.06, 0.165, -0.025), vec3(0.0, 0.0, 1.0), 0.045 * sin(uTime * 0.6)), w);
  w = smoothstep(0.056, 0.064, q.x) * smoothstep(0.138, 0.15, q.y) * smoothstep(-0.052, -0.044, q.z) * (1.0 - smoothstep(-0.006, 0.002, q.z));
  p = mix(p, turn(p, vec3(0.062, 0.165, -0.028), vec3(0.0, 0.0, 1.0), 0.05 * sin(uTime * 0.55 + 1.3)), w);
  w = smoothstep(0.066, 0.072, q.x) * smoothstep(0.194, 0.2, q.y) * smoothstep(-0.052, -0.044, q.z) * (1.0 - smoothstep(-0.006, 0.002, q.z));
  p = mix(p, turn(p, vec3(0.094, 0.19, -0.029), vec3(0.0, 0.0, 1.0), 0.12 * sin(uTime * 0.9 + 0.4)), w);
  w = smoothstep(-0.068, -0.062, q.x) * (1.0 - smoothstep(-0.034, -0.028, q.x)) * smoothstep(0.168, 0.176, q.y) * smoothstep(0.008, 0.016, q.z);
  p = mix(p, turn(p, vec3(-0.048, 0.166, 0.031), vec3(1.0, 0.0, 0.0), 0.07 * sin(uTime * 0.5 + 2.0)), w);
  w = near(p, vec3(0.065, 0.158, 0.035), 0.016, 0.03);
  p.y += w * 0.0025 * sin(uTime * 0.9 + 0.7);
  w = segW(p, vec3(0.005, 0.214, 0.012), vec3(0.022, 0.178, 0.022), 0.017, al);
  p = mix(p, turn(p, vec3(0.005, 0.214, 0.012), normalize(vec3(0.2, 0.0, 1.0)), 0.13 * sin(uTime * 0.65)), w * al * al);
  w = near(p, vec3(-0.058, 0.214, -0.058), 0.018, 0.032);
  p = mix(p, turn(p, vec3(-0.032, 0.214, -0.04), vec3(0.0, 1.0, 0.0), -0.14 * (0.5 + 0.5 * sin(uTime * 1.1))), w);
  w = near(p, vec3(0.066, 0.214, -0.058), 0.018, 0.032);
  p = mix(p, turn(p, vec3(0.04, 0.214, -0.04), vec3(0.0, 1.0, 0.0), 0.14 * (0.5 + 0.5 * sin(uTime * 1.1 + 0.3))), w);
  w = smoothstep(0.1, 0.2, position.y) * (1.0 - smoothstep(0.12, 0.14, length(position.xz)));
  p = mix(p, turn(p, vec3(0.0, 0.1, 0.0), vec3(0.0, 0.0, 1.0), 0.014 * sin(uTime * 0.45)), w);
  p = mix(p, turn(p, vec3(0.0, 0.1, 0.0), vec3(1.0, 0.0, 0.0), 0.008 * sin(uTime * 0.37 + 1.0)), w);
  float bf = exp(-pow((position.y - 0.15) / 0.045, 2.0)) * (1.0 - smoothstep(0.03, 0.13, length(position.xz)));
  p.xz += position.xz * 0.02 * bf * (0.5 + 0.5 * sin(uTime * 1.25));
  transformed = mix(position, p, uMove);`

const FRAGMENT_COMMON = /* glsl */ `
  varying vec3 vL; uniform float uGlow, uTime;
  uniform float uBlink; uniform vec3 uEyeL, uEyeR, uNL, uNR; uniform vec2 uLidL, uLidR, uEyeSize;
  ${lotusGrade}
  // one eye's (inside, lid cover, lash line): skin from just above slides down over it
  vec3 lid(vec3 c, vec3 n) {
    vec3 d = vL - c;
    vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), n)), up = cross(n, rt);
    float u = dot(d, rt) / uEyeSize.x, v = dot(d, up) / uEyeSize.y, dep = abs(dot(d, n));
    float inside = (1.0 - smoothstep(0.72, 1.0, u * u + v * v)) * step(dep, 0.007);
    float b = uBlink;
    float upper = 1.15 - 1.55 * b - 0.22 * (1.0 - u * u) * b;
    float lower = -1.25 + 0.85 * b;
    float cover = inside * max(smoothstep(upper - 0.06, upper + 0.06, v), 1.0 - smoothstep(lower - 0.06, lower + 0.06, v)) * step(0.01, b);
    float lash = inside * (1.0 - smoothstep(0.0, 0.16, abs(v - upper))) * smoothstep(0.05, 0.4, b);
    return vec3(inside, cover, lash);
  }`

const LOTUS_COLOUR = /* glsl */ `
  diffuseColor.rgb = lotusGrade(diffuseColor.rgb, vL); float isPetal = 1.0;`

const GANESHA_COLOUR = /* glsl */ `
  float isPetal = 0.0;
  vec3 eL = lid(uEyeL, uNL), eR = lid(uEyeR, uNR);
  diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(map, uLidL).rgb * 0.92, eL.y);
  diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(map, uLidR).rgb * 0.92, eR.y);
  diffuseColor.rgb *= 1.0 - 0.75 * max(eL.z, eR.z);`
