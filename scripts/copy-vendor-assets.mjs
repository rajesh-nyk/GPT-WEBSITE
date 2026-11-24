// Runs on `npm install` (postinstall). Copies runtime assets that libraries would
// otherwise fetch from third-party CDNs into /public, so they're self-hosted and stay
// in sync with the installed package versions.
//   - Draco decoder (for Draco-compressed .glb)  → public/draco
//   - detect-gpu benchmark tables                 → public/benchmarks
import { cpSync, existsSync } from 'node:fs'

const copies = [
  ['node_modules/three/examples/jsm/libs/draco/gltf', 'public/draco'],
  ['node_modules/detect-gpu/dist/benchmarks', 'public/benchmarks'],
]

for (const [from, to] of copies) {
  if (!existsSync(from)) {
    console.warn(`[copy-vendor-assets] missing ${from}, skipped`)
    continue
  }
  cpSync(from, to, { recursive: true })
  console.log(`[copy-vendor-assets] ${from} → ${to}`)
}
