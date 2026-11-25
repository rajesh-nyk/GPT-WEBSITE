import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react'
import { Clone, useGLTF } from '@react-three/drei'
import { useThree, type ThreeElements } from '@react-three/fiber'
import {
  MeshLambertMaterial,
  Texture,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
} from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { useQuality } from '../lib/quality'
import { resolveModelFile, variantIsUltra } from '../lib/models'

// Draco decoder is self-hosted in /public/draco (copied from three/examples) —
// no third-party CDN request, works offline, and is cached with the site.
const DRACO_PATH = `${import.meta.env.BASE_URL}draco/`

/** "robot.glb" → "/models/robot.glb". Absolute paths and URLs pass through. */
export function modelUrl(src: string) {
  if (/^(https?:)?\/\//.test(src) || src.startsWith('/')) return src
  return `${import.meta.env.BASE_URL}models/${src}`
}

type GroupProps = Omit<ThreeElements['group'], 'ref' | 'children'>

export type ModelProps = GroupProps & {
  /** File in /public/models (e.g. "robot.glb") or an absolute path/URL. */
  src: string
  /** Shown inside the canvas while the .glb downloads. Default: nothing. */
  fallback?: ReactNode
  /** Shown if the file is missing or fails to parse. Default: nothing. */
  errorFallback?: ReactNode
  /** Scene work that can start once this model has loaded. */
  children?: ReactNode
  castShadow?: boolean
  receiveShadow?: boolean
  /**
   * Adjust the loaded materials/meshes (e.g. re-tint, tweak roughness). Runs once per
   * loaded scene — and once more for the low-tier Lambert version — not per render.
   * Must be a stable function (define it at module level).
   */
  customize?: (root: Object3D) => void
}

/**
 * Loads any .glb with Suspense + an error boundary, and turns on shadows for every mesh.
 * Follows the quality tier: shadows off on low, and PBR materials swapped for Lambert.
 * On high-tier devices it loads the name@ultra.glb variant when one exists.
 * position / rotation / scale (and any other <group> prop) are forwarded.
 * Each instance is a clone, so the same model can appear several times in a scene.
 *
 * Shadows also need <Canvas shadows> and a light with castShadow.
 */
export function Model({
  src,
  fallback = null,
  errorFallback = null,
  children,
  castShadow = true,
  receiveShadow = true,
  customize,
  ...groupProps
}: ModelProps) {
  const { assetTier } = useQuality()
  const file = resolveModelFile(src, variantIsUltra(assetTier === 'high'))
  return (
    <ModelErrorBoundary key={src} src={src} fallback={errorFallback}>
      <Suspense fallback={fallback}>
        <GltfClone
          url={modelUrl(file)}
          customize={customize}
          castShadow={castShadow}
          receiveShadow={receiveShadow}
          {...groupProps}
        />
        {children}
      </Suspense>
    </ModelErrorBoundary>
  )
}

function GltfClone({
  url,
  customize,
  ...props
}: GroupProps & {
  url: string
  castShadow: boolean
  receiveShadow: boolean
  customize?: (root: Object3D) => void
}) {
  const { scene } = useGLTF(url, DRACO_PATH)
  const { basicMaterials, shadows, tier } = useQuality()
  const maxAnisotropy = useThree((s) => s.gl.capabilities.getMaxAnisotropy())
  const object = basicMaterials ? toBasicMaterials(scene) : scene
  if (!customized.has(object)) {
    sharpenTextures(object, Math.min(maxAnisotropy, tier === 'low' ? 4 : 16))
    customize?.(object)
    customized.add(object)
  }
  return (
    <Clone
      object={object}
      {...props}
      castShadow={props.castShadow && shadows}
      receiveShadow={props.receiveShadow && shadows}
    />
  )
}

const customized = new WeakSet<Object3D>()

/**
 * Anisotropic filtering: without it, textures blur as soon as a surface tilts away from
 * the camera (the GPU picks a low mip level). Near-free on modern GPUs, and essential
 * for fine carving on a model that rotates.
 */
function sharpenTextures(root: Object3D, anisotropy: number) {
  root.traverse((child) => {
    const mesh = child as Mesh
    if (!mesh.isMesh) return
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      for (const value of Object.values(material)) {
        if (value instanceof Texture && value.anisotropy !== anisotropy) {
          value.anisotropy = anisotropy
          value.needsUpdate = true
        }
      }
    }
  })
}

// ---- Low tier: PBR → Lambert --------------------------------------------------------
// One converted copy per source scene (shared by all instances), materials converted once.
const basicScenes = new WeakMap<Object3D, Object3D>()
const basicMats = new WeakMap<Material, Material>()
const originalMetalnessMaps = new WeakMap<Material, Texture>()

/** Custom shaders can use the original metal mask even after Lambert conversion. */
export function modelMetalnessMap(material: Material) {
  const standard = material as MeshStandardMaterial
  return standard.isMeshStandardMaterial ? standard.metalnessMap : originalMetalnessMaps.get(material) ?? null
}

function toBasicMaterials(scene: Object3D) {
  let basic = basicScenes.get(scene)
  if (!basic) {
    basic = cloneSkinned(scene) // skeleton-safe clone, so skinned/animated models still work
    basic.traverse((child) => {
      const mesh = child as Mesh
      if (!mesh.isMesh) return
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(toLambert)
        : toLambert(mesh.material)
    })
    basicScenes.set(scene, basic)
  }
  return basic
}

function toLambert(source: Material): Material {
  const cached = basicMats.get(source)
  if (cached) return cached
  const src = source as MeshStandardMaterial
  if (!src.isMeshStandardMaterial) return source // already cheap, or custom shader: leave it
  const lambert = new MeshLambertMaterial({
    name: src.name,
    color: src.color,
    map: src.map,
    emissive: src.emissive,
    emissiveMap: src.emissiveMap,
    emissiveIntensity: src.emissiveIntensity,
    alphaMap: src.alphaMap,
    aoMap: src.aoMap,
    transparent: src.transparent,
    opacity: src.opacity,
    alphaTest: src.alphaTest,
    side: src.side,
    vertexColors: src.vertexColors,
    flatShading: src.flatShading,
  })
  if (src.metalnessMap) originalMetalnessMaps.set(lambert, src.metalnessMap)
  basicMats.set(source, lambert)
  return lambert
}

/**
 * Suspends until `src` (the right variant for this device) has loaded — for code that
 * must run after a model exists, e.g. <Prewarm>. Shares the same cache as <Model>.
 */
export function useModelLoaded(src: string) {
  const { assetTier } = useQuality()
  useGLTF(modelUrl(resolveModelFile(src, variantIsUltra(assetTier === 'high'))), DRACO_PATH)
}

/** Start downloading a model before it mounts (e.g. from the loading screen). */
Model.preload = (src: string) => useGLTF.preload(modelUrl(src), DRACO_PATH)

class ModelErrorBoundary extends Component<
  { src: string; fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[Model] failed to load "${this.props.src}"`, error, info.componentStack)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
