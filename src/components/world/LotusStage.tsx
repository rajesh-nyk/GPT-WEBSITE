import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3, type PerspectiveCamera } from 'three'
import { useQuality } from '../../lib/quality'
import { resolveModelFile, variantIsUltra } from '../../lib/models'
import { modelUrl } from '../Model'
import { EXIT, ganeshaFx } from '../ganesha/fx'
import { journey } from './journey'
import { stageLayout } from './GaneshaStage'
import { glowCenters, projectCircle, screenShapes, toUv } from './screenShapes'
import { LotusScene } from './lotus/LotusScene'
import { LOTUS_CENTER, LOTUS_H, LOTUS_PIVOT, LOTUS_R, LOTUS_SCALE, lotusToWorld } from './lotus/layout'
import { lotusSequence, makeLotusShot } from './lotus/sequence'
import { useRestViewport } from '../../lib/restViewport'

/**
 * Page 2's Lotus Ganesha (approved 22 Nov 2026) in the shared world. The figure draws on
 * its own transparent canvas between the world canvas and the exit's black layer (see
 * lotus/LotusScene for why), rendered here from the world camera in the same frame, right
 * after CameraRig has placed it — so the two never drift apart.
 *
 * It is drawn only while page 2 is on screen: from the moment the camera has turned up
 * away from the hero until the exit has faded the world to black.
 */
const center = new Vector3()
const shot = makeLotusShot()
const velocity = new Vector3()
const lastPos = new Vector3()

// The exit (CameraRig) and the wheel read the stage's layout; it is fixed for this figure.
function publishLayout() {
  stageLayout.ready = true
  stageLayout.scale = LOTUS_SCALE
  stageLayout.center = [0, LOTUS_PIVOT.y, 0]
  stageLayout.centerY = 0
  stageLayout.figureHeight = LOTUS_H * LOTUS_SCALE
  stageLayout.depthHalf = LOTUS_R * LOTUS_SCALE
}

export function LotusStage({ reducedMotion }: { reducedMotion: boolean }) {
  const { ready, assetTier, postprocessing } = useQuality()
  // Same pixel density as the world canvas, including the frame guard's runtime step-downs.
  const worldDpr = useThree((s) => s.viewport.dpr)
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)
  const viewport = useRestViewport()
  const stage = useRef<LotusScene | null>(null)
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const shown = useRef(false)
  const sized = useRef('')

  useEffect(() => {
    publishLayout()
  }, [])

  // The figure's half-width on screen, so page text can keep clear of him.
  const halfWidthPx = Math.round(LOTUS_R * LOTUS_SCALE * (size.height / viewport.height))
  useEffect(() => {
    document.documentElement.style.setProperty('--ganesha-half-w', `${halfWidthPx}px`)
  }, [halfWidthPx])

  // Build once the device tier is known (it picks the model variant), never again after.
  useEffect(() => {
    if (!ready) return
    const dark = document.getElementById('world-dark')
    if (!dark?.parentElement) return
    const el = document.createElement('canvas')
    el.setAttribute('aria-hidden', 'true')
    el.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;visibility:hidden'
    dark.parentElement.insertBefore(el, dark)
    let scene: LotusScene
    try {
      scene = new LotusScene(el, assetTier)
    } catch (err) {
      console.error('[lotus] WebGL unavailable', err)
      el.remove()
      return
    }
    stage.current = scene
    canvas.current = el
    sized.current = ''
    const url = modelUrl(resolveModelFile('lotus-ganesha.glb', variantIsUltra(assetTier === 'high')))
    scene.load(url, `${import.meta.env.BASE_URL}draco/`).catch((err) => console.error('[lotus] could not load', err))
    return () => {
      stage.current = null
      canvas.current = null
      shown.current = false
      screenShapes.ganesha = null
      scene.dispose()
      el.remove()
    }
    // assetTier is fixed for the session once `ready` (runtime downgrades only change dpr).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  useFrame((_, delta) => {
    const s = stage.current
    const el = canvas.current
    if (!s || !el) return
    const t = journey.t
    // From the moment the wheel starts to swing away (the far star is uncovered) until the
    // exit has faded the world to black.
    lotusSequence(t, reducedMotion, shot)
    // Perf (24 Nov 2026): this layer is a second full-screen canvas with its own glow
    // passes. Stay off (hidden, not drawn) until it actually has something to show — on
    // the page 1 exit it used to run from t 0.55 with an empty frame.
    const empty = shot.orbK <= 0 && shot.figure < 0.5 && shot.starsK <= 0
    const active = s.loaded && !empty && t >= (reducedMotion ? 1 : 0.55) && t <= EXIT.dark[1] && ganeshaFx.leave < 0.5
    if (!active) {
      if (shown.current) {
        s.clear()
        el.style.visibility = 'hidden'
        shown.current = false
        screenShapes.ganesha = null
      }
      lastPos.copy(camera.position)
      return
    }
    if (!shown.current) {
      el.style.visibility = 'visible'
      shown.current = true
      lastPos.copy(camera.position)
    }
    // This is a second full-screen WebGL canvas. Once the frame guard has selected
    // reduced post-processing, cap only this layer's DPR and skip its extra bloom render;
    // the orb shader still supplies the reveal glow without three additional full-screen passes.
    const lotusDpr = Math.min(worldDpr, postprocessing === 'full' ? 1.35 : 1.15)
    const key = `${size.width}x${size.height}@${lotusDpr}`
    if (sized.current !== key) {
      sized.current = key
      s.setSize(size.width, size.height, lotusDpr)
    }

    // Real camera velocity (zero when the scroll stops), for the stars' motion streaks.
    if (delta > 0 && !reducedMotion) velocity.copy(camera.position).sub(lastPos).divideScalar(delta)
    else velocity.set(0, 0, 0)
    lastPos.copy(camera.position)
    // One authored light is enough. The additional lotus bloom required three full-screen
    // passes and caused the camera hitch; the subject orb remains active in the base pass.
    s.setGlow(false)
    s.render(camera, { shot, time: ganeshaFx.time, hover: ganeshaFx.hover, still: reducedMotion, velocity })

    // The warm sky glow follows the light; the hover circle is his, in the front shot only.
    toUv(shot.orbPos, camera, glowCenters.ganesha)
    lotusToWorld(center.copy(LOTUS_CENTER))
    screenShapes.ganesha =
      shot.frontK >= 1 && ganeshaFx.leave < 0.4
        ? projectCircle(center, LOTUS_H * LOTUS_SCALE * 0.42, camera, size.width, size.height)
        : null
  }, -1)

  return null
}
