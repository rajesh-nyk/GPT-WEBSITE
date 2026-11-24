import manifest from 'virtual:models'

/**
 * Model variants. `npm run models:optimize` writes, per source model:
 *   name.glb        standard (phones / mid / low tiers)
 *   name@ultra.glb  ultra detail (high tier only)
 * Components always ask for "name.glb"; this picks the file to actually load. The choice
 * uses the tier detected at startup (assetTier), never runtime downgrades, so a device
 * never downloads the same model twice in a session.
 */
const ULTRA = '@ultra'
const files = new Set(manifest.map((m) => m.file))

const isLocalName = (src: string) => !/^(https?:)?\/\//.test(src) && !src.startsWith('/')

/** QA override: ?model-variant=standard | ultra (otherwise chosen by device tier). */
const forcedVariant =
  typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('model-variant')
    : null
export const variantIsUltra = (tierIsHigh: boolean) =>
  forcedVariant === 'ultra' ? true : forcedVariant === 'standard' ? false : tierIsHigh

export function resolveModelFile(src: string, ultra: boolean) {
  if (!ultra || !isLocalName(src) || src.includes(ULTRA)) return src
  const candidate = src.replace(/\.(glb|gltf)$/i, `${ULTRA}.$1`)
  return files.has(candidate) ? candidate : src
}

/**
 * Models the loading screen waits for — only what's visible on first paint. Everything
 * else (below-the-fold sections) loads in the background after reveal, when its section
 * mounts, so first paint isn't held hostage by models the visitor hasn't scrolled to.
 */
const CRITICAL = new Set(['dharma-wheel'])

/** The manifest entries the loading screen should preload: one variant per critical model. */
export function modelsToPreload(ultra: boolean) {
  return manifest.filter(({ file }) => {
    const base = file.replace(/(@ultra)?\.(glb|gltf)$/i, '')
    if (!CRITICAL.has(base)) return false
    if (file.includes(ULTRA)) return ultra
    return resolveModelFile(file, ultra) === file
  })
}
