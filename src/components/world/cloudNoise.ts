/**
 * Tileable 3D noise for the page 2 volumetric clouds, built once in the browser.
 *   R: Perlin–Worley (billowy base shape)
 *   G: Worley fbm (fine erosion detail, sampled at a higher frequency)
 * Both channels tile, so the shader can sample at any scale with no seams.
 */
function mulberry(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Inverted Worley (1 near feature points), tiling with `cells` cells per side. */
function worley(size: number, cells: number, rand: () => number) {
  const pts = new Float32Array(cells * cells * cells * 3)
  for (let i = 0; i < pts.length; i++) pts[i] = rand()
  const out = new Float32Array(size * size * size)
  const cs = size / cells
  let o = 0
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const fx = x / cs, fy = y / cs, fz = z / cs
        const cx = Math.floor(fx), cy = Math.floor(fy), cz = Math.floor(fz)
        let best = 9
        for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const ix = cx + dx, iy = cy + dy, iz = cz + dz
          const wx = ((ix % cells) + cells) % cells, wy = ((iy % cells) + cells) % cells, wz = ((iz % cells) + cells) % cells
          const k = ((wz * cells + wy) * cells + wx) * 3
          const px = ix + pts[k] - fx, py = iy + pts[k + 1] - fy, pz = iz + pts[k + 2] - fz
          const d = px * px + py * py + pz * pz
          if (d < best) best = d
        }
        out[o++] = 1 - Math.min(1, Math.sqrt(best))
      }
    }
  }
  return out
}

/** Tileable gradient (Perlin) noise fbm, roughly 0..1. */
function perlinFbm(size: number, period: number, octaves: number, rand: () => number) {
  const out = new Float32Array(size * size * size)
  for (let oct = 0; oct < octaves; oct++) {
    const p = period << oct
    const amp = Math.pow(0.5, oct)
    const g = new Float32Array(p * p * p * 3)
    for (let i = 0; i < p * p * p; i++) {
      const th = rand() * Math.PI * 2, u = rand() * 2 - 1, s = Math.sqrt(1 - u * u)
      g[i * 3] = s * Math.cos(th); g[i * 3 + 1] = s * Math.sin(th); g[i * 3 + 2] = u
    }
    const cs = size / p
    const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
    let o = 0
    for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const fx = x / cs, fy = y / cs, fz = z / cs
      const x0 = Math.floor(fx), y0 = Math.floor(fy), z0 = Math.floor(fz)
      const tx = fx - x0, ty = fy - y0, tz = fz - z0
      let v = 0
      for (let c = 0; c < 8; c++) {
        const ox = c & 1, oy = (c >> 1) & 1, oz = (c >> 2) & 1
        const ix = (x0 + ox) % p, iy = (y0 + oy) % p, iz = (z0 + oz) % p
        const k = ((iz * p + iy) * p + ix) * 3
        const dot = g[k] * (tx - ox) + g[k + 1] * (ty - oy) + g[k + 2] * (tz - oz)
        const w = (ox ? fade(tx) : 1 - fade(tx)) * (oy ? fade(ty) : 1 - fade(ty)) * (oz ? fade(tz) : 1 - fade(tz))
        v += w * dot
      }
      out[o++] += v * amp
    }
  }
  for (let i = 0; i < out.length; i++) out[i] = Math.min(1, Math.max(0, out[i] * 0.9 + 0.5))
  return out
}

const remap = (v: number, a: number, b: number, c: number, d: number) => c + ((v - a) / (b - a)) * (d - c)

export function buildCloudNoise(size = 64): Uint8Array {
  const rand = mulberry(1509)
  const perlin = perlinFbm(size, 4, 4, rand)
  const w1 = worley(size, 4, rand), w2 = worley(size, 8, rand), w3 = worley(size, 16, rand)
  const d1 = worley(size, 6, rand), d2 = worley(size, 12, rand), d3 = worley(size, 24, rand)
  const data = new Uint8Array(size * size * size * 2)
  for (let i = 0; i < size * size * size; i++) {
    const wfbm = w1[i] * 0.625 + w2[i] * 0.25 + w3[i] * 0.125
    // Perlin–Worley: Perlin, pushed up where the Worley cells are (billows).
    const pw = Math.min(1, Math.max(0, remap(perlin[i], wfbm - 1, 1, 0, 1)))
    const detail = d1[i] * 0.625 + d2[i] * 0.25 + d3[i] * 0.125
    data[i * 2] = Math.round(pw * 255)
    data[i * 2 + 1] = Math.round(detail * 255)
  }
  return data
}
