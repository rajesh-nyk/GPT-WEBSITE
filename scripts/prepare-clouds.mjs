// Fetch licensed transparent source artwork at build time, then optimize locally.
// The deployed website serves self-hosted WebP files, not third-party image URLs.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import sharp from 'sharp'

const dir = 'public/clouds'
await mkdir(dir, { recursive: true })
const photo = 'https://purepng.com/public/uploads/large/purepng.com-cloudcloudskycloudyclearskynature-221519326518lfbqg.png'
const fog = 'https://purepng.com/public/uploads/large/purepng.com-fog-cloudscloudskycloudyclearskynature-2215193265817arks.png'
const commons = 'https://upload.wikimedia.org/wikipedia/commons/0/0d/Clouds_%28transparent%29.png'
const cc0 = 'https://opengameart.org/sites/default/files/oga-textures/136561/fx_cloudalpha02.png'
const sources = [
  ['hd-bank.webp', [photo, commons, cc0]],
  ['hd-far.webp', [commons, photo, cc0]],
  ['hd-near.webp', [photo, fog, commons, cc0]],
]
const cache = new Map()
for (const [file, urls] of sources) {
  const out = dir + '/' + file
  if (existsSync(out)) continue
  for (const url of urls) {
    try {
      let bytes = cache.get(url)
      if (!bytes) {
        const response = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'WeddingWebsiteAssetBuild/1.0 (static image optimization)' } })
        if (!response.ok) throw new Error('HTTP ' + response.status)
        bytes = Buffer.from(await response.arrayBuffer())
        cache.set(url, bytes)
      }
      const m = await sharp(bytes).metadata()
      if (!m.hasAlpha || m.width < 900) throw new Error('Not a high-resolution transparent image')
      const processed = await sharp(bytes).resize({ width: 1600, height: 1150, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 90, alphaQuality: 100, effort: 5 }).toBuffer()
      await writeFile(out, processed)
      console.log(file + ': ' + m.width + 'x' + m.height + ' source; ' + processed.length + ' bytes; ' + url)
      break
    } catch (error) {
      console.warn('Cloud artwork unavailable:', url, String(error))
    }
  }
  if (!existsSync(out)) {
    // Never fall back to the old 192x77 crop. A failed art fetch must not
    // prevent the wedding site from building: the passage still has soft mist.
    const alternate = dir + '/hd-bank.webp'
    if (file !== 'hd-bank.webp' && existsSync(alternate)) await writeFile(out, await readFile(alternate))
    else console.warn('No usable artwork for ' + file + '; cloud layer will be hidden.')
  }
}
