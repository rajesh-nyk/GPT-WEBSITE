/**
 * Page 3 photo change, "burn reveal" (from Rajesh's reference recording; made the default
 * on 26 Nov 2026, replacing the black ink morph).
 *
 * One ragged blob grows from the middle of the photo. Its edge is torn and detailed, lit by
 * a glowing white rim, and the new photo just behind the rim is washed silver before it
 * settles into its real colours, like light catching burning paper. The old photo fades to
 * black at once, so the new one burns in from black. Everything stays inside the new photo's
 * real area.
 *
 * WebGL (one full-stage quad, one fragment shader). If WebGL is not available the photo
 * simply switches.
 */
type Rect = { x: number; y: number; w: number; h: number }
type Painted = { box: Rect; pic: Rect; fade: boolean }

/** Where the image is actually painted inside its <img> box (object-fit + object-position). */
function paintedRect(img: HTMLImageElement, host: DOMRect, dpr: number): Painted {
  const b = img.getBoundingClientRect()
  const box = { x: (b.left - host.left) * dpr, y: (b.top - host.top) * dpr, w: b.width * dpr, h: b.height * dpr }
  const cs = getComputedStyle(img)
  const ia = img.naturalWidth / img.naturalHeight
  const fit = cs.objectFit
  let w = box.w
  let h = box.w / ia
  if (fit === 'cover' ? h < box.h : h > box.h) {
    h = box.h
    w = box.h * ia
  }
  const [px, py] = cs.objectPosition.split(' ').map((v) => (v.endsWith('%') ? parseFloat(v) / 100 : 0.5))
  // Portrait photos on desktop fade out at their sides (CSS mask); copy that on the canvas.
  const mask = cs.maskImage || cs.webkitMaskImage
  return { box, pic: { x: box.x + (box.w - w) * px, y: box.y + (box.h - h) * (py ?? 0.5), w, h }, fade: !!mask && mask !== 'none' }
}

export type BurnRevealOptions = {
  canvas: HTMLCanvasElement
  from: HTMLImageElement
  to: HTMLImageElement
  onDone: () => void
}

const DURATION = 1700

const VERT = `
attribute vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }
`

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uP;          // progress 0..1
uniform float uTime;
uniform vec2 uCenter;      // px, top-left origin
uniform float uReach;      // px from centre to the farthest corner of the area
uniform float uSeed;
uniform sampler2D uOld, uNew;
uniform vec4 uOldPic, uOldBox, uNewPic, uNewBox; // x, y, w, h in px
uniform float uOldFade, uNewFade, uOldSpill;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm3(vec2 p) {
  return 0.5 * noise(p) + 0.25 * noise(p * 2.03 + 17.1) + 0.125 * noise(p * 4.12 + 31.7);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int k = 0; k < 5; k++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
// Photo colour at pixel p, with its box and soft sides; alpha 0 outside the photo.
vec4 photo(sampler2D t, vec4 pic, vec4 box, float fade, vec2 p, float zoom) {
  vec2 c = pic.xy + pic.zw * 0.5;
  vec2 uv = (p - c) / (pic.zw * zoom) + 0.5;
  float inBox = step(box.x, p.x) * step(p.x, box.x + box.z) * step(box.y, p.y) * step(p.y, box.y + box.w);
  float u = (p.x - box.x) / box.z;
  float side = mix(1.0, smoothstep(0.0, 0.16, u) * smoothstep(1.0, 0.84, u), fade);
  return vec4(texture2D(t, clamp(uv, 0.0, 1.0)).rgb, inBox * side);
}
void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float m = min(uRes.x, uRes.y);

  // Ragged burn front: distance from the centre, pushed around by large and fine noise.
  vec2 q = p / m;
  float big = fbm(q * 2.2 + uSeed);
  float fine = fbm3(q * 14.0 - uSeed) * 1.14;
  float field = length(p - uCenter) / uReach - (big - 0.5) * 0.55 - (fine - 0.5) * 0.2;
  float T = uP * 1.45 - 0.08;               // the front, moving outward
  float e = T - field;                      // > 0 inside the burnt-through area

  float inside = smoothstep(0.0, 0.006, e);
  // White rim: a thin bright core with a softer glow, strongest while the reveal is moving.
  float energy = 1.0 - smoothstep(0.75, 1.0, uP);
  // Patchy, flaky highlights along the rim (like the reference), not one even line.
  float flake = smoothstep(0.3, 0.65, fbm3(q * 26.0 + uSeed * 2.0));
  float rim = (exp(-abs(e) * 160.0) * (0.5 + 1.1 * flake) + exp(-abs(e) * 38.0) * 0.35 * (0.4 + flake)) * energy;
  // Silver wash just behind the rim, fading as the photo settles.
  float wash = exp(-max(e, 0.0) * 22.0) * 0.45 * energy; // a light touch, close to the rim only
  // Soft shadow just outside the rim, on the old photo.
  float shadow = (1.0 - smoothstep(0.0, 0.09, -e)) * 0.75 * energy;

  // The old photo is gone almost at once (a quick fade to black, Rajesh 26 Nov 2026);
  // the new one burns in from black. No zoom on either, so nothing looks stretched.
  vec4 oldC = photo(uOld, uOldPic, uOldBox, uOldFade, p, 1.0);
  oldC.a *= 1.0 - smoothstep(0.0, 0.06, uP);
  vec4 newC = photo(uNew, uNewPic, uNewBox, uNewFade, p, 1.0);

  // Black wash (was silver): the new photo comes up out of black just behind the rim.
  vec3 revealed = mix(newC.rgb, vec3(0.0), wash);
  vec3 outside = oldC.rgb * (1.0 - shadow * newC.a);

  float show = inside * newC.a;             // the new photo, only inside its own area
  vec3 col = mix(outside, revealed, show);
  float alpha = max(oldC.a * (1.0 - show), show);
  // The rim glows only where the new photo will be.
  float glow = rim * newC.a;
  col = mix(col, vec3(0.0), clamp(glow, 0.0, 1.0)); // black rim (was white)
  alpha = max(alpha, clamp(glow, 0.0, 1.0));
  gl_FragColor = vec4(col * alpha, alpha);
}
`

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)
  if (!s) return null
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.warn('burnReveal shader:', gl.getShaderInfoLog(s))
    return null
  }
  return s
}

type Kit = { gl: WebGLRenderingContext; prog: WebGLProgram; tex: Map<HTMLImageElement, WebGLTexture>; u: Record<string, WebGLUniformLocation | null> }
const kits = new WeakMap<HTMLCanvasElement, Kit>()

function setup(canvas: HTMLCanvasElement): Kit | null {
  const cached = kits.get(canvas)
  if (cached && !cached.gl.isContextLost()) return cached
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false })
  if (!gl) return null
  const vs = compile(gl, gl.VERTEX_SHADER, VERT)
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
  const prog = gl.createProgram()
  if (!vs || !fs || !prog) return null
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null
  gl.useProgram(prog)
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const a = gl.getAttribLocation(prog, 'a')
  gl.enableVertexAttribArray(a)
  gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0)
  const tex = new Map<HTMLImageElement, WebGLTexture>()
  const names = ['uRes', 'uP', 'uTime', 'uCenter', 'uReach', 'uSeed', 'uOld', 'uNew', 'uOldPic', 'uOldBox', 'uNewPic', 'uNewBox', 'uOldFade', 'uNewFade', 'uOldSpill']
  const u = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(prog, n)]))
  const kit = { gl, prog, tex, u }
  kits.set(canvas, kit)
  return kit
}

/** Each photo is uploaded to the GPU once, then reused (re-uploading stalled the first frame). */
function textureFor(kit: Kit, img: HTMLImageElement) {
  const { gl, tex } = kit
  let t = tex.get(img)
  if (t) return t
  t = gl.createTexture() as WebGLTexture
  gl.bindTexture(gl.TEXTURE_2D, t)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
  tex.set(img, t)
  return t
}

/** Size the canvas to its box; only touches the buffer when the size really changed. */
function fit(canvas: HTMLCanvasElement) {
  const host = (canvas.parentElement ?? canvas).getBoundingClientRect()
  // Lighter resolution keeps every frame on time (the edge is soft enough not to need more).
  const dpr = Math.min(window.devicePixelRatio || 1, 1.25)
  const w = Math.round(host.width * dpr)
  const h = Math.round(host.height * dpr)
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h
  return { host, dpr }
}

/**
 * Warm up ahead of time (shader compiled, loaded photos uploaded, one blank draw), so the
 * first hover starts on time. Call when the stage mounts.
 */
export function prepareBurnReveal(canvas: HTMLCanvasElement, imgs: (HTMLImageElement | null)[]) {
  const kit = setup(canvas)
  if (!kit) return
  fit(canvas)
  for (const img of imgs) if (img?.complete && img.naturalWidth) textureFor(kit, img)
  kit.gl.viewport(0, 0, canvas.width, canvas.height)
  kit.gl.clearColor(0, 0, 0, 0)
  kit.gl.clear(kit.gl.COLOR_BUFFER_BIT)
  kit.gl.drawArrays(kit.gl.TRIANGLE_STRIP, 0, 4)
}

const v4 = (r: { x: number; y: number; w: number; h: number }) => [r.x, r.y, r.w, r.h] as const

/** Starts the burn reveal; returns a function that stops it early. */
export function playBurnReveal({ canvas, from, to, onDone }: BurnRevealOptions): () => void {
  const { host, dpr } = fit(canvas)
  const kit = setup(canvas)
  if (!kit) {
    onDone()
    return () => {}
  }
  const { gl, u } = kit
  gl.viewport(0, 0, canvas.width, canvas.height)
  const old: Painted = paintedRect(from, host, dpr)
  const next: Painted = paintedRect(to, host, dpr)
  const a = next.box
  const center = [a.x + a.w / 2, a.y + a.h / 2]
  const reach = Math.max(...[[a.x, a.y], [a.x + a.w, a.y], [a.x, a.y + a.h], [a.x + a.w, a.y + a.h]].map(([x, y]) => Math.hypot(x - center[0], y - center[1])))
  const spill = old.box.x < a.x - 1 || old.box.y < a.y - 1 || old.box.x + old.box.w > a.x + a.w + 1 || old.box.y + old.box.h > a.y + a.h + 1

  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, textureFor(kit, from))
  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_2D, textureFor(kit, to))
  gl.uniform1i(u.uOld, 0)
  gl.uniform1i(u.uNew, 1)
  gl.uniform2f(u.uRes, canvas.width, canvas.height)
  gl.uniform2f(u.uCenter, center[0], center[1])
  gl.uniform1f(u.uReach, reach)
  gl.uniform1f(u.uSeed, Math.random() * 50)
  gl.uniform4f(u.uOldPic, ...v4(old.pic))
  gl.uniform4f(u.uOldBox, ...v4(old.box))
  gl.uniform4f(u.uNewPic, ...v4(next.pic))
  gl.uniform4f(u.uNewBox, ...v4(next.box))
  gl.uniform1f(u.uOldFade, old.fade ? 1 : 0)
  gl.uniform1f(u.uNewFade, next.fade ? 1 : 0)
  gl.uniform1f(u.uOldSpill, spill ? 1 : 0)

  // Gentle start and a long, soft landing: no sudden rush in the middle.
  const ease = (t: number) => 1 - Math.pow(1 - (t * t * (3 - 2 * t)), 1.6)
  const t0 = performance.now()
  let raf = 0
  const frame = (now: number) => {
    const t = Math.min(1, (now - t0) / DURATION)
    gl.uniform1f(u.uP, ease(t))
    gl.uniform1f(u.uTime, (now - t0) / 1000)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    if (t < 1) raf = requestAnimationFrame(frame)
    else onDone()
  }
  frame(t0) // paint the first frame now, so the stage never flashes black
  return () => cancelAnimationFrame(raf)
}
