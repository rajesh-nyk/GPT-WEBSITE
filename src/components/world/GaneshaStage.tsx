import { Suspense, useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { MathUtils, Vector3, type Group } from 'three'
import { useQuality } from '../../lib/quality'
import { pointer } from '../../lib/pointer'
import { Prewarm } from '../three/Prewarm'
import { GaneshaFigure } from '../ganesha/GaneshaFigure'
import { GaneshaParticles } from '../ganesha/GaneshaParticles'
import { ganeshaFx } from '../ganesha/fx'
import { useSurfacePoints } from '../ganesha/points'
import { glowCenters, projectCircle, screenShapes, toUv } from './screenShapes'
import { useRestViewport } from '../../lib/restViewport'

/** Particle-build counts per startup tier (fill-rate bound; the shape needs density). */
const BUILD_POINTS = { high: 48000, mid: 20000, low: 8000 } as const
const HOVER_PULSE = 0.012 // ±1.2% "breath" while hovered — felt more than seen

/** Shared with the motes so nearby particles can react to the hovered figure. */
export const ganeshaRepel = { x: 0, y: 0, strength: 0 }

/**
 * Where the figure stands (world units, z = 0 plane) — the travelling wheel reads this
 * to settle precisely behind Ganesha as his prabhavali (halo). `ready` is false until the
 * point cloud (which carries the figure's bounds) has loaded; the wheel falls back to a
 * proportional estimate until then.
 */
export const stageLayout = {
  ready: false,
  centerY: 0,
  figureHeight: 0,
  depthHalf: 0.8,
  /** Model → world: world = (local − center) × scale + (0, centerY, 0). */
  scale: 1,
  center: [0, 0, 0] as [number, number, number],
}

/** A point on the model (model-local units) in world space, at rest. */
export function modelToWorld(local: [number, number, number]): [number, number, number] {
  const { scale, center, centerY } = stageLayout
  return [
    (local[0] - center[0]) * scale,
    (local[1] - center[1]) * scale + centerY,
    (local[2] - center[2]) * scale,
  ]
}

/**
 * Ganesha in the shared world, filling the frame (framing rules below).
 *  - Entrance, "the consecration": gold dust settles onto his form → a seam of molten
 *    gold rises from below, leaving him solid behind it, sparks lifting off → rim light
 *    and the amber halo build → mantra → idle float. (ganesha/fx.ts, reveal.ts)
 *  - Hover (once formed): aura/rim light and halo intensify, a barely-there scale
 *    breath, and nearby motes drift softly away from the pointer. No dragging.
 *  - Leaving (next section): removed only under the full cover of the flower shower.
 * Reduced motion: no build — the finished figure is anchored to its section and simply
 * scrolls with the page (anchorY).
 */
export function GaneshaStage({
  reducedMotion,
  anchorY,
}: {
  reducedMotion: boolean
  anchorY: { current: number }
}) {
  const { assetTier } = useQuality()
  const viewport = useRestViewport()
  const size = useThree((s) => s.size)
  const camera = useThree((s) => s.camera)
  const { box } = useSurfacePoints('ganesha')
  const stage = useRef<Group>(null)
  const pulse = useRef<Group>(null)
  const center = useRef(new Vector3()).current

  // Framing — a medium close-up, like a darshan: the umbrella just below the top of the
  // frame and the frame's bottom edge cutting the elephant at mid-trunk, so the figure
  // is never a cut-out floating with its feet in space. Anchored from the top; the lower
  // body simply runs off the bottom of the screen. On phones the ear tips crop at the sides (a full-bleed darshan close-up)
  // the sides so the height can still fill. (Wide-screen breakpoint matches the CSS.)
  const h = box.max.y - box.min.y
  const wx = box.max.x - box.min.x
  const wide = viewport.aspect >= 1.25
  const vh = viewport.height
  const cx = (box.min.x + box.max.x) / 2
  const cy = (box.min.y + box.max.y) / 2
  const cz = (box.min.z + box.max.z) / 2
  // Solved through the real perspective (the elephant's head is far nearer the lens
  // than the umbrella, so it projects larger and lower than a flat estimate):
  // umbrella top just below the top edge, mid-trunk exactly on the bottom edge.
  const { scale, lift } = frameFigure({ cy, cz, aspect: viewport.aspect, wide })
  const figH = h * scale
  stageLayout.ready = true
  stageLayout.centerY = lift
  stageLayout.figureHeight = figH
  stageLayout.depthHalf = ((box.max.z - box.min.z) / 2) * scale
  stageLayout.scale = scale
  stageLayout.center = [cx, cy, cz]

  // Publish the figure's real on-screen footprint for the HTML inscriptions.
  const pxPerUnit = size.height / vh
  const halfWidthPx = Math.round((wx * scale * pxPerUnit) / 2)
  useEffect(() => {
    const root = document.documentElement.style
    root.setProperty('--ganesha-half-w', `${halfWidthPx}px`)
  }, [halfWidthPx])

  useFrame(() => {
    const g = stage.current
    const p = pulse.current
    if (!g || !p) return
    // Leaving: he dissolves in place, receding a little into the dark (no lift-off).
    const leave = reducedMotion ? 0 : MathUtils.smootherstep(ganeshaFx.leave, 0, 1)
    g.position.y = lift + (reducedMotion ? anchorY.current : 0)
    g.position.z = -leave * 0.9
    g.visible = reducedMotion || ganeshaFx.presence > 0.001

    const hover = ganeshaFx.hover
    p.scale.setScalar((1 + HOVER_PULSE * hover * Math.sin(ganeshaFx.time * 2.2)) * (1 - 0.05 * leave))

    g.getWorldPosition(center)
    toUv(center, camera, glowCenters.ganesha)

    // Hover region: only once the figure is essentially formed and present.
    const formed = ganeshaFx.solid > 0.85 && ganeshaFx.leave < 0.4
    screenShapes.ganesha = formed
      ? projectCircle(center, h * scale * 0.42, camera, size.width, size.height)
      : null

    // Nearby motes react to the pointer while Ganesha is hovered.
    ganeshaRepel.x = (pointer.ndc.x * viewport.width) / 2
    ganeshaRepel.y = (pointer.ndc.y * viewport.height) / 2
    ganeshaRepel.strength = hover
  })

  return (
    <group ref={stage} position={[0, lift, 0]}>
      <group ref={pulse} scale={1}>
        <group scale={scale}>
          <group position={[-cx, -cy, -cz]}>
            <Suspense fallback={null}>
              <GaneshaFigure />
              {/* Compile shaders + upload textures in the background once loaded, so
                  the first visible frame of the figure never hitches. */}
              <Prewarm models={['ganesha.glb']} />
            </Suspense>
            {!reducedMotion && <GaneshaParticles count={BUILD_POINTS[assetTier]} modelScale={scale} />}
          </group>
        </group>
      </group>
    </group>
  )
}

// ---- Framing solver ---------------------------------------------------------------------
const CAMERA_Z = 6
const TAN_HALF_FOV = Math.tan((35 / 2) * (Math.PI / 180))
/** Model-local reference points (from the baked surface profile). */
const UMBRELLA_TOP = { y: 0.962, z: 0.17 }
const MID_TRUNK = { y: -0.6, z: 0.62 }
const EAR_EDGE = { x: 0.42, z: 0.6 }
const TOP_MARGIN_NDC = 0.05

function ndcY(yLocal: number, zLocal: number, cy: number, cz: number, s: number, lift: number) {
  const Y = (yLocal - cy) * s + lift
  const Z = (zLocal - cz) * s
  return Y / ((CAMERA_Z - Z) * TAN_HALF_FOV)
}

/**
 * Find the scale (and lift) where the umbrella top sits TOP_MARGIN below the top edge and
 * mid-trunk lands on the bottom edge. Monotonic in scale → bisection. Phones let the ear
 * tips crop at the sides rather than ever showing the feet.
 */
function frameFigure({ cy, cz, aspect, wide }: { cy: number; cz: number; aspect: number; wide: boolean }) {
  const liftFor = (s: number) => {
    const Zt = (UMBRELLA_TOP.z - cz) * s
    return (1 - TOP_MARGIN_NDC) * (CAMERA_Z - Zt) * TAN_HALF_FOV - (UMBRELLA_TOP.y - cy) * s
  }
  let lo = 0.2
  let hi = 6
  for (let i = 0; i < 40; i++) {
    const s = (lo + hi) / 2
    const bottom = ndcY(MID_TRUNK.y, MID_TRUNK.z, cy, cz, s, liftFor(s))
    if (bottom > -1) lo = s // mid-trunk still above the bottom edge → bigger
    else hi = s
  }
  let scale = (lo + hi) / 2
  // Width: ears at most this fraction of the half-width from centre.
  const maxEar = wide ? 0.6 : 1.3
  const earNdc = (s: number) => ((EAR_EDGE.x * s) / ((CAMERA_Z - (EAR_EDGE.z - cz) * s) * TAN_HALF_FOV)) / aspect
  while (earNdc(scale) > maxEar && scale > 0.2) scale *= 0.98
  return { scale, lift: liftFor(scale) }
}
