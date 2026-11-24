import type { Ref } from 'react'
import { useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, Noise, ToneMapping, Vignette } from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode, type BloomEffect } from 'postprocessing'
import { useQuality } from '../../lib/quality'

export type QualityEffectsProps = {
  bloomIntensity?: number
  bloomThreshold?: number
  /** 0 disables the vignette (high tier only). */
  vignette?: number
  /** Access the BloomEffect to animate its intensity per frame (e.g. a slow pulse). */
  bloomRef?: Ref<BloomEffect>
  /** Override the tier's MSAA samples (e.g. 0 for particle-heavy scenes that don't need it). */
  multisampling?: number
}

/**
 * Postprocessing that scales with the quality tier:
 * - high:    full-res mipmap bloom + vignette; DPR supplies edge quality without MSAA
 * - mid:     no MSAA, half-res bloom with fewer mip levels, no vignette
 * - low:     nothing — no EffectComposer at all (saves a full-screen render target + passes)
 *
 * EffectComposer switches the renderer's tone mapping off and renders in linear HDR, so
 * ACES tone mapping is re-applied as the last effect. Without it, mid/high would look
 * different from low (which uses the renderer's ACES directly).
 */
export function QualityEffects({
  bloomIntensity = 1,
  bloomThreshold = 0.6,
  vignette = 0.6,
  bloomRef,
  multisampling: msaa,
}: QualityEffectsProps) {
  const quality = useQuality()
  const { postprocessing } = quality
  // On dense (≥1.75×) screens the pixels are already finer than the eye resolves at a
  // glance; 4× MSAA on top quadruples the cost of every pixel for almost no visible
  // gain. 2× there keeps edges clean at a fraction of the cost.
  const dpr = useThree((s) => s.viewport.dpr)
  const multisampling = msaa ?? (dpr >= 1.75 ? Math.min(quality.multisampling, 2) : quality.multisampling)

  if (postprocessing === 'none') return null

  if (postprocessing === 'reduced') {
    return (
      <EffectComposer multisampling={0} stencilBuffer={false}>
        <Bloom
          ref={bloomRef}
          mipmapBlur
          levels={4}
          resolutionScale={0.5}
          intensity={bloomIntensity * 0.8}
          luminanceThreshold={bloomThreshold}
        />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.2} />
      </EffectComposer>
    )
  }

  return (
    <EffectComposer multisampling={multisampling} stencilBuffer={false}>
      <Bloom ref={bloomRef} mipmapBlur intensity={bloomIntensity} luminanceThreshold={bloomThreshold} />
      {vignette > 0 && <Vignette offset={0.3} darkness={vignette} />}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      {/* Film grain, after tone mapping: the image reads as photographed, not rendered,
          and gradients never band. Soft-light + premultiplied, so blacks stay black. */}
      <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.22} />
    </EffectComposer>
  )
}
