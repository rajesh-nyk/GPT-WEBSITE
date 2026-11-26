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

/**
 * Phone first paint (jury: LCP ~9.8 s on slow 4G). The first thing a visitor sees is the
 * loading screen, which needs only the stylesheet and the Odia font. By default the HTML also
 * modulepreloads ~1.5 MB of three/r3f/motion, which share the slow link with the stylesheet.
 * So in the built HTML: stylesheet first, the Odia font preloaded, and the heavy library
 * preloads removed (the entry script still imports them, so they download right after).
 */
function firstPaintFirst(): Plugin {
  let base = '/' // '/GPT-WEBSITE/' on GitHub Pages (deploy.yml passes --base)
  return {
    name: 'first-paint-first',
    apply: 'build',
    configResolved(config) {
      base = config.base
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (ctx.path !== '/index.html') return html // the 404 page has no scripts to reorder
        // Both subsets: the Odia glyphs, plus the latin one that holds the space between
        // the two words (without it the caption widens when it lands and counts as a new paint).
        const fonts = Object.keys(ctx.bundle ?? {}).filter((f) => /noto-serif-oriya-(oriya|latin)-wght-normal.*\.woff2$/.test(f))
        let out = html.replace(/\s*<link rel="modulepreload" crossorigin href="[^"]*\/assets\/(three|r3f|motion)-[^"]+">/g, '')
        const css = out.match(/\s*<link rel="stylesheet"[^>]*>/)?.[0]
        if (css) out = out.replace(css, '')
        const head = [
          css?.trim(),
          ...fonts.map((f) => `<link rel="preload" as="font" type="font/woff2" crossorigin href="${base}${f}">`),
        ].filter(Boolean).join('\n    ')
        return out.replace('<script type="module"', `${head}\n    <script type="module"`)
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), modelManifest(), firstPaintFirst()],
  resolve: { alias: { '@': resolve(import.meta.dirname, 'src') } },
  build: {
    rolldownOptions: {
      // 404.html: the themed "page not found" page GitHub Pages serves for unknown addresses.
      input: { main: resolve(import.meta.dirname, 'index.html'), notfound: resolve(import.meta.dirname, '404.html') },
      output: {
        // Split the big libraries into their own files: they download in parallel and stay
        // cached between site updates (only the small app file changes on each deploy).
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\\/]three[\\/]/ },
            { name: 'r3f', test: /node_modules[\\/](@react-three|three-stdlib|postprocessing|@monogrid|maath|camera-controls|troika)/ },
            { name: 'motion', test: /node_modules[\\/](gsap|@gsap|framer-motion|motion-dom|motion-utils|lenis)[\\/]/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
})
