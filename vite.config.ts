import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

const MODELS_DIR = resolve(import.meta.dirname, 'public/models')

/**
 * `import models from 'virtual:models'` → [{ file: 'robot.glb', bytes: 1234567 }, ...]
 * Every .glb/.gltf dropped into public/models is preloaded automatically by the loading
 * screen — no list to maintain. Byte sizes let the progress bar weight big files correctly.
 * In dev, adding/removing a model reloads the page with the new list.
 */
function modelManifest(): Plugin {
  const id = 'virtual:models'
  const resolved = '\0' + id
  const list = () => {
    try {
      return readdirSync(MODELS_DIR)
        .filter((f) => /\.(glb|gltf)$/i.test(f))
        .sort()
        .map((file) => ({ file, bytes: statSync(join(MODELS_DIR, file)).size }))
    } catch {
      return []
    }
  }
  return {
    name: 'model-manifest',
    resolveId: (source) => (source === id ? resolved : undefined),
    load: (loadId) => (loadId === resolved ? `export default ${JSON.stringify(list())}` : undefined),
    configureServer(server) {
      server.watcher.add(MODELS_DIR)
      const onChange = (path: string) => {
        if (!path.startsWith(MODELS_DIR)) return
        const mod = server.moduleGraph.getModuleById(resolved)
        if (mod) server.moduleGraph.invalidateModule(mod)
        server.ws.send({ type: 'full-reload' })
      }
      server.watcher.on('add', onChange)
      server.watcher.on('unlink', onChange)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), modelManifest()],
  resolve: { alias: { '@': resolve(import.meta.dirname, 'src') } },
})
