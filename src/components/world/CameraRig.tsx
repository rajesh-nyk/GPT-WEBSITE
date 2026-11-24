import { useFrame, useThree } from '@react-three/fiber'
import { MathUtils, PerspectiveCamera, Quaternion, Vector3 } from 'three'
import { buildProgress, CAM2, CAM2_AWAY, EXIT, ganeshaFx, LOTUS, TEXT_SPAN } from '../ganesha/fx'
import { journey } from './journey'
import { modelToWorld, stageLayout } from './GaneshaStage'
import { templeFx } from './templeFx'
import { templeShot } from './TempleNight'
import { lotusSequence, makeLotusShot } from './lotus/sequence'

/**
 * The scroll-driven camera tour of the formed Ganesha (ganeshaFx.tour, 0 → 1):
 *
 *   S0  full frame (the site's resting camera)
 *    ↓  push in — slow, eased
 *   S1  the elephant's face and gold headdress (nettipattam): eyes, tusks, ornament work
 *    ↓  crane up
 *   S2  Ganesha's face: tilak, crown, the raised blessing hand
 *    ↓  DOLLY ZOOM — the camera pulls back while the lens narrows, so Ganesha's face
 *       holds its size on screen while the halo and the space behind him compress and
 *       swell (the "vertigo" shot); the prabhavali seems to grow around him
 *   S3  same framing of the face, from far away on a long lens
 *    ↓  open back out
 *   S0  full frame
 *
 * Points on the model come from its baked surface (front of the headdress ≈ 40% of the
 * height, Ganesha's face ≈ 77%), so the shots land on the right features at any size.
 * At tour 0 and 1 the camera is exactly the resting camera (nothing else is affected).
 */
const REST = { pos: new Vector3(0, 0, 6), target: new Vector3(0, 0, 0), fov: 35 }
const CLOSE_FOV = 28

// Model-local feature points (model bbox y: −0.953 … 0.962).
const ELEPHANT_HEAD: [number, number, number] = [0, -0.17, 0.55]
const GANESHA_FACE: [number, number, number] = [0, 0.5, 0.18]

const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)
const seg = (u: number, a: number, b: number) => easeInOutCubic(MathUtils.clamp((u - a) / (b - a), 0, 1))

type Shot = { pos: Vector3; target: Vector3; fov: number }
const tmpA = { pos: new Vector3(), target: new Vector3(), fov: 35 }
const tmpB = { pos: new Vector3(), target: new Vector3(), fov: 35 }

function closeShot(out: Shot, local: [number, number, number], heightFrac: number, above: number) {
  const figH = stageLayout.figureHeight
  const t = modelToWorld(local)
  const d = (heightFrac * figH) / (2 * Math.tan(MathUtils.degToRad(CLOSE_FOV / 2)))
  out.target.set(t[0], t[1], t[2])
  out.pos.set(t[0], t[1] + above * figH, t[2] + d)
  out.fov = CLOSE_FOV
  return out
}

function lerpShot(out: Shot, a: Shot, b: Shot, k: number) {
  out.pos.lerpVectors(a.pos, b.pos, k)
  out.target.lerpVectors(a.target, b.target, k)
  out.fov = MathUtils.lerp(a.fov, b.fov, k)
}

/**
 * Page 2's 3D camera reveal (the default; ?build shows the old consecration) — no dissolve.
 * Raw blessing progress p; b = buildProgress(p) (0 when the text has gone).
 *   p 0 → CAM2_AWAY   while the mantra arrives, the camera swings round to one side and
 *                     tilts up to the stars (he is out of frame, so he is simply there)
 *   p … TEXT_SPAN     holds on the stars, drifting slowly, behind the mantra
 *   b 0.00–0.20  tilts down: the elephant, seen from the side
 *   b 0.20–0.46  orbits round to the front while craning up to Ganesha's face
 *   b 0.46–0.52  hold on the face
 *   b 0.52–0.66  dolly zoom
 *   b 0.66–0.78  open back out: the whole Ganesha
 */
type Orbit = { y: number; z: number; hf: number; above: number; yaw: number; look: number }
const SKY: Orbit = { y: ELEPHANT_HEAD[1], z: ELEPHANT_HEAD[2], hf: 0.55, above: 0.04, yaw: 72, look: 1.5 }
const SKY_DRIFT = 6 // degrees the camera drifts round while it waits on the stars
const SIDE: Orbit = { y: ELEPHANT_HEAD[1], z: ELEPHANT_HEAD[2], hf: 0.42, above: 0.04, yaw: 58, look: 0 }
const FRONT: Orbit = { y: GANESHA_FACE[1], z: GANESHA_FACE[2], hf: 0.26, above: 0.01, yaw: 0, look: 0 }
const orb: Orbit = { ...SKY }

function lerpOrbit(a: Orbit, b: Orbit, k: number) {
  orb.y = MathUtils.lerp(a.y, b.y, k)
  orb.z = MathUtils.lerp(a.z, b.z, k)
  orb.hf = MathUtils.lerp(a.hf, b.hf, k)
  orb.above = MathUtils.lerp(a.above, b.above, k)
  orb.yaw = MathUtils.lerp(a.yaw, b.yaw, k)
  orb.look = MathUtils.lerp(a.look, b.look, k)
  return orb
}

/** A shot on a circle round the figure's own vertical axis (yaw 0 = closeShot). */
function orbitShot(out: Shot, o: Orbit) {
  const figH = stageLayout.figureHeight
  const f = modelToWorld([0, o.y, o.z])
  const c = modelToWorld([0, o.y, 0])
  const d = (o.hf * figH) / (2 * Math.tan(MathUtils.degToRad(CLOSE_FOV / 2)))
  const r = f[2] - c[2] + d
  const yaw = MathUtils.degToRad(o.yaw)
  out.pos.set(c[0] + Math.sin(yaw) * r, f[1] + o.above * figH, c[2] + Math.cos(yaw) * r)
  out.target.set(f[0], f[1] + o.look * figH, f[2])
  out.fov = CLOSE_FOV
  return out
}

function cam2Shot(out: Shot, p: number) {
  const b = buildProgress(p)
  if (p < CAM2_AWAY) {
    orbitShot(tmpA, SKY)
    lerpShot(out, REST, tmpA, seg(p, 0, CAM2_AWAY))
  } else if (b <= 0) {
    const drift = seg(p, CAM2_AWAY, TEXT_SPAN)
    orbitShot(out, { ...SKY, yaw: SKY.yaw - SKY_DRIFT * drift })
  } else if (b < 0.2) {
    orbitShot(out, lerpOrbit({ ...SKY, yaw: SKY.yaw - SKY_DRIFT }, SIDE, seg(b, 0, 0.2)))
  } else if (b < 0.46) {
    orbitShot(out, lerpOrbit(SIDE, FRONT, seg(b, 0.2, 0.46)))
  } else if (b < 0.52) {
    lerpShot(out, s2, s2, 0)
  } else if (b < 0.66) {
    const k = seg(b, 0.52, 0.66)
    const d2 = s2.pos.z - s2.target.z
    const d = d2 * MathUtils.lerp(1, 3.2, k)
    out.target.copy(s2.target)
    out.pos.set(s2.pos.x, s2.pos.y, s2.target.z + d)
    out.fov = MathUtils.radToDeg(2 * Math.atan((d2 * Math.tan(MathUtils.degToRad(CLOSE_FOV / 2))) / d))
  } else {
    const d2 = s2.pos.z - s2.target.z
    const d3 = d2 * 3.2
    tmpA.target.copy(s2.target)
    tmpA.pos.set(s2.pos.x, s2.pos.y, s2.target.z + d3)
    tmpA.fov = MathUtils.radToDeg(2 * Math.atan((d2 * Math.tan(MathUtils.degToRad(CLOSE_FOV / 2))) / d3))
    tmpB.pos.copy(REST.pos)
    tmpB.target.copy(REST.target)
    tmpB.fov = REST.fov
    lerpShot(out, tmpA, tmpB, seg(b, 0.66, 0.78))
  }
}

/** Page 1 → 2 with the Lotus Ganesha: one continuous shot from lotus/sequence. */
const lotusCam = makeLotusShot()

/**
 * Exit (Rajesh, 22 Nov 2026): from the resting full frame the camera orbits a quarter
 * turn round him while rising above his head, ending close above, looking down on his
 * upper body (aimed at his chest and closer, so the elephant's legs stay out of frame).
 * Then it moves along a curve in its own screen plane, so he slides DOWN out of the
 * screen and swings to the side (a quarter-circle path), while the world dims to black.
 */
const EXIT_YAW = 90 // degrees round him
const EXIT_ELEV = 48 // degrees above the horizon at the end
const EXIT_DIST = 0.78 // end distance, as a share of the start distance
const EXIT_AIM: [number, number, number] = [0, 0.38, 0.12] // his chest (model-local)
const exitC = new Vector3()
const exitRel = new Vector3()
const fwd = new Vector3()
const right = new Vector3()
const upV = new Vector3()
const WORLD_UP = new Vector3(0, 1, 0)

function exitShot(out: Shot, t: number) {
  const k = seg(t, EXIT.up, EXIT.top)
  const start = REST
  const c = modelToWorld(EXIT_AIM)
  exitC.set(c[0], c[1], c[2])
  exitRel.subVectors(start.pos, exitC)
  const r0 = exitRel.length()
  const yaw0 = Math.atan2(exitRel.x, exitRel.z)
  const elev0 = Math.asin(MathUtils.clamp(exitRel.y / r0, -1, 1))
  const yaw = yaw0 + MathUtils.degToRad(EXIT_YAW) * k
  const elev = MathUtils.lerp(elev0, MathUtils.degToRad(EXIT_ELEV), k)
  const r = r0 * MathUtils.lerp(1, EXIT_DIST, k)
  out.pos.set(
    exitC.x + Math.sin(yaw) * Math.cos(elev) * r,
    exitC.y + Math.sin(elev) * r,
    exitC.z + Math.cos(yaw) * Math.cos(elev) * r,
  )
  out.target.lerpVectors(start.target, exitC, k)
  out.fov = start.fov

  // Slide out: camera moves up + sideways on its screen plane → he goes down and curves.
  const s = seg(t, EXIT.slide[0], EXIT.slide[1])
  if (s > 0) {
    fwd.subVectors(out.target, out.pos).normalize()
    right.crossVectors(fwd, WORLD_UP).normalize()
    upV.crossVectors(right, fwd)
    const h = r * Math.tan(MathUtils.degToRad(out.fov / 2)) // half the view height there
    const th = (Math.PI / 2) * s
    const dUp = 2.6 * h * Math.sin(th)
    const dSide = 1.3 * h * (1 - Math.cos(th))
    out.pos.addScaledVector(upV, dUp).addScaledVector(right, dSide)
    out.target.addScaledVector(upV, dUp).addScaledVector(right, dSide)
  }
}

/** The exit's fade to black: a black layer over the world canvas (see WorldCanvas). */
let darkEl: HTMLElement | null = null
let darkLast = -1
function setDark(v: number) {
  darkEl ??= document.getElementById('world-dark')
  if (!darkEl || Math.abs(v - darkLast) < 0.002) return
  darkLast = v
  darkEl.style.opacity = v.toFixed(3)
}

const templeCam = { pos: new Vector3(), quat: new Quaternion(), fov: 35 }
const cur: Shot = { pos: new Vector3(), target: new Vector3(), fov: 35 }
const s1: Shot = { pos: new Vector3(), target: new Vector3(), fov: CLOSE_FOV }
const s2: Shot = { pos: new Vector3(), target: new Vector3(), fov: CLOSE_FOV }

export function CameraRig({ reducedMotion = false }: { reducedMotion?: boolean }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera

  useFrame(() => {
    // The closing scene: the camera leaves for the temple (see TempleNight.templeShot).
    // The far plane opens up only then, so the rest of the site keeps its depth precision.
    // The dive travels ~160 units down the line of sight; open the far plane only then.
    const far = templeFx.view > 0 ? 1600 : LOTUS && journey.t > 0.5 && journey.t < 3 ? 400 : 50
    if (camera.far !== far) {
      camera.far = far
      camera.updateProjectionMatrix()
    }
    if (templeFx.view > 0) {
      templeShot(templeFx.view, templeFx.portrait, templeCam)
      camera.position.copy(templeCam.pos)
      camera.quaternion.copy(templeCam.quat)
      if (Math.abs(camera.fov - templeCam.fov) > 1e-4) {
        camera.fov = templeCam.fov
        camera.updateProjectionMatrix()
      }
      return
    }
    if (CAM2) {
      const p = ganeshaFx.progress
      const t = journey.t
      setDark(MathUtils.smoothstep(t, EXIT.dark[0], EXIT.dark[1]))
      if (LOTUS) {
        lotusSequence(t, reducedMotion, lotusCam)
        camera.position.copy(lotusCam.pos)
        camera.lookAt(lotusCam.target)
        if (lotusCam.roll !== 0) camera.rotateZ(lotusCam.roll)
        if (Math.abs(camera.fov - lotusCam.fov) > 1e-4) {
          camera.fov = lotusCam.fov
          camera.updateProjectionMatrix()
        }
        return
      }
      if (t > EXIT.up) {
        exitShot(cur, t)
        apply(camera, cur)
        return
      }
      if (!stageLayout.ready || p <= 0 || buildProgress(p) >= 0.78 || ganeshaFx.leave > 0) {
        apply(camera, REST)
        return
      }
      closeShot(s1, ELEPHANT_HEAD, 0.3, 0.04)
      closeShot(s2, GANESHA_FACE, 0.26, 0.01)
      cam2Shot(cur, p)
      apply(camera, cur)
      return
    }
    const u = ganeshaFx.tour
    if (!stageLayout.ready || u <= 0 || u >= 1) {
      apply(camera, REST)
      return
    }

    closeShot(s1, ELEPHANT_HEAD, 0.3, 0.04)
    closeShot(s2, GANESHA_FACE, 0.26, 0.01)

    if (u < 0.28) {
      lerpShot(cur, REST, s1, seg(u, 0, 0.28))
    } else if (u < 0.36) {
      lerpShot(cur, s1, s1, 0) // hold on the elephant
    } else if (u < 0.58) {
      lerpShot(cur, s1, s2, seg(u, 0.36, 0.58))
    } else if (u < 0.82) {
      // Dolly zoom: distance grows 3.2×, lens narrows so the face keeps its size.
      const k = seg(u, 0.58, 0.82)
      const d2 = s2.pos.z - s2.target.z
      const d = d2 * MathUtils.lerp(1, 3.2, k)
      cur.target.copy(s2.target)
      cur.pos.set(s2.pos.x, s2.pos.y, s2.target.z + d)
      cur.fov = MathUtils.radToDeg(2 * Math.atan((d2 * Math.tan(MathUtils.degToRad(CLOSE_FOV / 2))) / d))
    } else {
      const d2 = s2.pos.z - s2.target.z
      const d3 = d2 * 3.2
      tmpA.target.copy(s2.target)
      tmpA.pos.set(s2.pos.x, s2.pos.y, s2.target.z + d3)
      tmpA.fov = MathUtils.radToDeg(2 * Math.atan((d2 * Math.tan(MathUtils.degToRad(CLOSE_FOV / 2))) / d3))
      tmpB.pos.copy(REST.pos)
      tmpB.target.copy(REST.target)
      tmpB.fov = REST.fov
      lerpShot(cur, tmpA, tmpB, seg(u, 0.82, 1))
    }
    apply(camera, cur)
  }, -5)

  return null
}

function apply(camera: PerspectiveCamera, s: Shot) {
  camera.position.copy(s.pos)
  camera.lookAt(s.target)
  if (Math.abs(camera.fov - s.fov) > 1e-4) {
    camera.fov = s.fov
    camera.updateProjectionMatrix()
  }
}
