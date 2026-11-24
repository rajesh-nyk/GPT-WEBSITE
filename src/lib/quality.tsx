import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { getGPUTier, type TierResult } from 'detect-gpu'
import { useFrameBudgetGuard } from './frameGuard'
import { useReducedMotion } from './useReducedMotion'

/**
 * Adaptive quality.
 *
 * 1. At startup, detect-gpu benchmarks the GPU model (from a self-hosted table in
 *    /public/benchmarks, so there's no third-party request) → initial tier.
 * 2. While running, one page-wide frame-budget guard (lib/frameGuard.ts) steps the tier
 *    DOWN if the device can't sustain ~60fps. It never steps back up, so quality can't
 *    flip-flop mid-scroll.
 *
 * Override for testing: ?quality=low | mid | high | ultra
 */

export type Tier = 'low' | 'mid' | 'high'
const ORDER: Tier[] = ['low', 'mid', 'high']

export type QualitySettings = {
  tier: Tier
  /** Canvas devicePixelRatio range [min, max]. The biggest single perf lever on phones. */
  dpr: [number, number]
  shadows: boolean
  /** Use for light.shadow.mapSize. */
  shadowMapSize: number
  /** 'full' = bloom (mipmap blur) + vignette + MSAA, 'reduced' = cheap half-res bloom, 'none' = no composer. */
  postprocessing: 'full' | 'reduced' | 'none'
  /** Composer MSAA samples (0 = off). */
  multisampling: number
  /** Swap PBR materials for MeshLambertMaterial (no specular/roughness/metal maths). */
  basicMaterials: boolean
  /** Budget for particle systems — scale your counts by this. */
  particles: number
}

export const PRESETS: Record<Tier, QualitySettings> = {
  high: {
    tier: 'high',
    // 1.5× is already visually dense on the target laptops. 2× plus MSAA multiplied
    // transition fill-rate by ~3.5 and dropped the wheel-to-Ganesha shot into the 20s.
    dpr: [1, 1.5],
    shadows: true,
    shadowMapSize: 2048,
    postprocessing: 'full',
    multisampling: 0,
    basicMaterials: false,
    particles: 6000,
  },
  mid: {
    tier: 'mid',
    dpr: [1, 1.5],
    shadows: true,
    shadowMapSize: 1024,
    postprocessing: 'reduced',
    multisampling: 0,
    basicMaterials: false,
    particles: 2000,
  },
  low: {
    tier: 'low',
    dpr: [1, 1],
    shadows: false,
    shadowMapSize: 512,
    postprocessing: 'none',
    multisampling: 0,
    basicMaterials: true,
    particles: 400,
  },
}

/** Explicit opt-in for presentation captures and powerful desktop GPUs. */
const ULTRA_PRESET: QualitySettings = {
  tier: 'high',
  dpr: [2, 2.5],
  shadows: true,
  shadowMapSize: 4096,
  postprocessing: 'full',
  // At 2× DPR, canvas antialiasing already resolves the wheel's edges. Composer MSAA
  // shades the full frame again and was the largest avoidable cost during hover.
  multisampling: 0,
  basicMaterials: false,
  particles: 9000,
}

/** Map a detect-gpu result (+ a few cheap device hints) to our 3 tiers. */
export function tierFromGPU(gpu: TierResult): Tier {
  // detect-gpu: 0 = no WebGL / blocklisted, 1 = <15fps, 2 = <30fps (mid), 3 = 60fps+ class.
  let tier: Tier = gpu.tier >= 3 ? 'high' : gpu.tier === 2 ? 'mid' : 'low'

  // Phones: even a "tier 3" GPU drives a 3x-DPR screen on a thermally limited chip.
  // Start mid; only flagships whose benchmark is well above 60fps start high.
  if (gpu.isMobile && tier === 'high' && (gpu.fps ?? 0) < 90) tier = 'mid'

  // Very little RAM (Chrome-only hint) → don't risk big textures/render targets.
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  if (memory !== undefined && memory <= 2) tier = 'low'

  return tier
}

function overrideFromURL(): Tier | null {
  const q = new URLSearchParams(window.location.search).get('quality')
  if (q === 'ultra') return 'high'
  return q && (ORDER as string[]).includes(q) ? (q as Tier) : null
}

const ultraFromURL = () => new URLSearchParams(window.location.search).get('quality') === 'ultra'

type QualityContextValue = QualitySettings & {
  /** false until detection finishes (the preloader waits on this). */
  ready: boolean
  /** Tier detected at startup. Fixed for the session — picks which model files load. */
  assetTier: Tier
  /** Raw detect-gpu result, for debugging. */
  gpu: TierResult | null
  /** Step one tier down (called by the frame-budget guard on sustained low FPS). */
  downgrade: (reason?: string) => void
}

const QualityContext = createContext<QualityContextValue | null>(null)

export function useQuality() {
  const ctx = useContext(QualityContext)
  if (!ctx) throw new Error('useQuality must be used inside <QualityProvider>')
  return ctx
}

export function QualityProvider({ children }: { children: ReactNode }) {
  const [tier, setTier] = useState<Tier>('mid')
  const [assetTier, setAssetTier] = useState<Tier>('mid')
  const [gpu, setGpu] = useState<TierResult | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    const forced = overrideFromURL()

    getGPUTier({ benchmarksURL: `${import.meta.env.BASE_URL}benchmarks` })
      .then((result) => {
        if (cancelled) return
        setGpu(result)
        const detected = forced ?? tierFromGPU(result)
        setTier(detected)
        setAssetTier(detected)
      })
      .catch((err) => {
        // Detection failing must never block the site: fall back to a safe middle.
        console.warn('[quality] GPU detection failed, using "mid"', err)
        if (!cancelled) {
          setTier(forced ?? 'mid')
          setAssetTier(forced ?? 'mid')
        }
      })
      .finally(() => !cancelled && setReady(true))

    return () => {
      cancelled = true
    }
  }, [])

  const downgrade = useCallback((reason?: string) => {
    // A quality forced from the URL (?quality=high, for testing) stays put.
    if (overrideFromURL()) return
    setTier((current) => {
      const next = ORDER[Math.max(0, ORDER.indexOf(current) - 1)]
      if (next !== current && import.meta.env.DEV) {
        console.info(`[quality] ${current} → ${next}${reason ? ` (${reason})` : ''}`)
      }
      return next
    })
  }, [])

  // Reduced motion: scenes render a still frame, so there's no frame rate to judge.
  const reducedMotion = useReducedMotion()
  useFrameBudgetGuard(downgrade, ready && !reducedMotion)

  const value = useMemo<QualityContextValue>(
    () => ({ ...(ultraFromURL() ? ULTRA_PRESET : PRESETS[tier]), ready, assetTier, gpu, downgrade }),
    [tier, ready, assetTier, gpu, downgrade],
  )

  return <QualityContext.Provider value={value}>{children}</QualityContext.Provider>
}
