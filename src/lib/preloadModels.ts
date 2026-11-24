import { Cache } from 'three'
import { useProgress } from '@react-three/drei'
import { modelsToPreload } from './models'
import { Model, modelUrl } from '../components/Model'

/**
 * Preloads every model in /public/models (list generated at build time by the
 * `virtual:models` Vite plugin) — one variant per model, standard or @ultra by device
 * tier — and reports real progress, 0 → 1.
 *
 * How it avoids downloading twice:
 *   1. fetch() each file ourselves, streaming, so progress is in BYTES (accurate even
 *      with one big file — loader counts would sit at 0% then jump to 100%).
 *   2. Hand the bytes to three.js through THREE.Cache, keyed exactly like FileLoader.
 *   3. Model.preload() → GLTFLoader finds the bytes in the cache and just parses
 *      (+ Draco decode). No second network request.
 *   4. Wait until parsing finishes, then empty the cache so the raw buffers can be freed.
 *
 * Download = first 90% of the bar, parse/decode = last 10%.
 * A model that fails is logged and skipped; it never blocks the site.
 */
export async function preloadModels(
  ultra: boolean,
  onProgress: (p: number) => void,
): Promise<void> {
  const models = modelsToPreload(ultra)
  if (models.length === 0) {
    onProgress(1)
    return
  }

  const totalBytes = models.reduce((sum, m) => sum + m.bytes, 0) || 1
  let loadedBytes = 0
  const report = () => onProgress(Math.min(loadedBytes / totalBytes, 1) * 0.9)

  const results = await Promise.all(
    models.map(async ({ file }) => {
      const url = modelUrl(file)
      try {
        const buffer = await fetchWithProgress(url, (n) => {
          loadedBytes += n
          report()
        })
        return { file, url, buffer }
      } catch (err) {
        console.error(`[preload] could not download ${url}`, err)
        return null
      }
    }),
  )

  const ok = results.filter((r) => r !== null)
  Cache.enabled = true
  for (const { url, buffer } of ok) Cache.add(`file:${url}`, buffer)
  for (const { file } of ok) Model.preload(file)

  await waitForLoaders((parsed) => onProgress(0.9 + parsed * 0.1))

  Cache.clear()
  Cache.enabled = false
  onProgress(1)
}

async function fetchWithProgress(url: string, onBytes: (n: number) => void) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  // The dev/preview server answers unknown paths with index.html instead of a 404.
  if (res.headers.get('content-type')?.includes('text/html')) throw new Error('not found')

  if (!res.body) {
    const buf = await res.arrayBuffer()
    onBytes(buf.byteLength)
    return buf
  }

  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    length += value.length
    onBytes(value.length)
  }
  const out = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out.buffer
}

/** Resolves once three's DefaultLoadingManager has no items in flight (glTF parse included). */
function waitForLoaders(onParsed: (fraction: number) => void) {
  return new Promise<void>((resolve) => {
    let frames = 0
    const check = () => {
      const { active, loaded, total } = useProgress.getState()
      if (total > 0) onParsed(loaded / total)
      // A couple of frames' grace so loads started this tick have registered.
      if (++frames > 2 && !active) return resolve()
      requestAnimationFrame(check)
    }
    requestAnimationFrame(check)
  })
}
