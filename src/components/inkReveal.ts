/**
 * Page 3 arrival, "ink reveal" (Rajesh, 26 Nov 2026).
 *
 * Black ink bleeds out from the middle with a torn, random edge (domain-warped noise plus
 * vertical drips running up and down), and the photo appears inside the ink a little behind
 * its front. The photo itself is never tinted, washed or lit: it is either shown as it is or
 * not shown. Progress follows an ease-in-out curve.
 *
 * WebGL (one full-stage quad). Without WebGL the caller just shows the photo.
 */
const VERT = `
attribute vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }
`

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uP;      // eased progress 0..1
uniform float uTime;
uniform float uSeed;
uniform sampler2D uTex;
uniform vec4 uPic, uBox; // painted picture rect and its box, px (top-left origin)
uniform vec2 uTilt; // cosine and sine of the photo's X rotation
uniform float uFade;     // 1 = portrait photo with soft sides

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int k = 0; k < 5; k++) { v += a * noise(p); p = p * 2.07 + 13.3; a *= 0.5; }
  return v;
}
void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 c = uRes * 0.5;
  float m = length(uRes) * 0.5;               // centre to corner
  vec2 q = (p - c) / m;

  // Warp the space so the front wanders: big lobes, then smaller bites.
  float t = uTime * 0.12;
  vec2 w = vec2(fbm(q * 2.3 + uSeed + t), fbm(q * 2.3 - uSeed - t)) - 0.5;
  vec2 qw = q + w * 0.55;
  float d = length(qw * vec2(1.0, 1.12));
  // Drips: noise stretched tall, so the edge runs up and down in fingers.
  float drip = fbm(vec2(qw.x * 9.0 + uSeed, qw.y * 1.4 - t * 2.0)) - 0.5;
  float bite = fbm(qw * 11.0 - uSeed) - 0.5;
  float field = d - drip * 0.42 - bite * 0.16;

  float T = mix(-0.235, 1.95, uP);            // ink front starts just outside visible photo
  float e = T - field;                        // > 0 inside

  // Spatter: speckled ink just ahead of the main body.
  float speck = smoothstep(0.62, 0.72, fbm(q * 34.0 + uSeed * 3.0));
  float ink = max(smoothstep(-0.008, 0.004, e + 0.07), speck * smoothstep(-0.12, 0.0, e + 0.07));
  // The photo, a step behind the ink, with a crisp torn edge of its own.
  float pe = e - 0.11 - (fbm(q * 24.0 + uSeed) - 0.5) * 0.05;
  float shown = smoothstep(0.0, 0.006, pe);

  vec2 boxCenter = uBox.xy + uBox.zw * 0.5;
  vec2 offset = p - boxCenter;
  float cameraDistance = 1.65 * uBox.w;
  float projection = uTilt.x + offset.y * uTilt.y / cameraDistance;
  vec2 photoPoint = boxCenter + vec2(offset.x * uTilt.x, offset.y) / projection;
  vec2 pc = uPic.xy + uPic.zw * 0.5;
  vec2 uv = (photoPoint - pc) / uPic.zw + 0.5;
  vec2 inset = min(photoPoint - uBox.xy, uBox.xy + uBox.zw - photoPoint);
  float inBox = step(0.0, min(inset.x, inset.y));
  float u = (photoPoint.x - uBox.x) / uBox.z;
  float side = mix(1.0, smoothstep(0.0, 0.16, u) * smoothstep(1.0, 0.84, u), uFade);
  vec3 photo = texture2D(uTex, clamp(uv, 0.0, 1.0)).rgb;
  float remaining = 1.0;
  float closingWash = 0.0;
  float inkCover = 1.0 - uP;
  if (inkCover > 0.0) {
    // Keep the rectangular border under ink until the photo is fully open.
    float shortSide = min(uBox.z, uBox.w);
    float border = min(inset.x, inset.y) / shortSide;
    float rimStrength = smoothstep(0.0, 0.06, inkCover);
    float rim = 0.004 + 0.36 * inkCover + drip * min(0.16, 0.5 * inkCover);
    float inkEdge = max(0.5 / shortSide, rim * rimStrength);
    remaining = smoothstep(inkEdge, inkEdge + 0.0015, border);
    closingWash = (1.0 - smoothstep(inkEdge + 0.002, inkEdge + 0.016, border)) * rimStrength;
  }
  float pa = shown * inBox * side * remaining;

  float wet = 1.0 - smoothstep(0.82, 1.0, uP);
  float inkA = ink * wet * remaining;
  // Uneven ink fingers trail onto the photo, then clear behind the advancing edge.
  float trail = 0.045 + 0.19 * smoothstep(-0.18, 0.30, drip + bite * 0.35);
  float wash = max(closingWash, (1.0 - smoothstep(0.002, trail, pe)) * wet);
  float exposedInk = inkA * (1.0 - pa);
  float a = max(pa, inkA);
  vec3 color = photo * pa * (1.0 - wash) + vec3(0.035, 0.031, 0.028) * exposedInk;
  gl_FragColor = vec4(color, a);
}
`

type Kit = { gl: WebGLRenderingContext; u: Record<string, WebGLUniformLocation | null>; tex: WebGLTexture }
const kits = new WeakMap<HTMLCanvasElement, Kit>()

function setup(canvas: HTMLCanvasElement): Kit | null {
  const cached = kits.get(canvas)
  if (cached && !cached.gl.isContextLost()) return cached
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false })
  if (!gl) return null
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('inkReveal shader:', gl.getShaderInfoLog(s))
      return null
    }
    return s
  }
  const vs = sh(gl.VERTEX_SHADER, VERT)
  const fs = sh(gl.FRAGMENT_SHADER, FRAG)
  const prog = gl.createProgram()
  if (!vs || !fs || !prog) return null
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null
  gl.useProgram(prog)
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, 'a')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
  const tex = gl.createTexture() as WebGLTexture
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  const names = ['uRes', 'uP', 'uTime', 'uSeed', 'uTex', 'uPic', 'uBox', 'uTilt', 'uFade']
  const u = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(prog, n)]))
  gl.uniform1f(u.uSeed, Math.random() * 40)
  const kit = { gl, u, tex }
  kits.set(canvas, kit)
  return kit
}

/** Where the image is really painted inside its <img> box (object-fit / object-position). */
function painted(img: HTMLImageElement, host: DOMRect, dpr: number) {
  const b = img.getBoundingClientRect()
  const box = { x: (b.left - host.left) * dpr, y: (b.top - host.top) * dpr, w: b.width * dpr, h: b.height * dpr }
  const cs = getComputedStyle(img)
  const ia = img.naturalWidth / img.naturalHeight
  let w = box.w
  let h = box.w / ia
  if (cs.objectFit === 'cover' ? h < box.h : h > box.h) {
    h = box.h
    w = box.h * ia
  }
  const [px, py] = cs.objectPosition.split(' ').map((v) => (v.endsWith('%') ? parseFloat(v) / 100 : 0.5))
  const mask = cs.maskImage || cs.webkitMaskImage
  // The photo window may carry the side-fade mask instead of the img itself.
  const winMask = img.closest<HTMLElement>('.p3-photo-window, .p3-print')
  const wm = winMask ? getComputedStyle(winMask).maskImage || getComputedStyle(winMask).webkitMaskImage : 'none'
  const fade = (!!mask && mask !== 'none') || (!!wm && wm !== 'none')
  return { box, pic: { x: box.x + (box.w - w) * px, y: box.y + (box.h - h) * (py ?? 0.5), w, h }, fade }
}

/** A sine ease-in-out keeps the middle of the reveal from rushing. */
const easeInOut = (t: number) => (1 - Math.cos(Math.PI * t)) / 2
const finishProgress = 0.92

/** Prepare one image for either a timed or scroll-controlled ink reveal. */
export function prepareInkReveal(canvas: HTMLCanvasElement, img: HTMLImageElement) {
  const host = (canvas.parentElement ?? canvas).getBoundingClientRect()
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
  canvas.width = Math.round(host.width * dpr)
  canvas.height = Math.round(host.height * dpr)
  const kit = img.naturalWidth ? setup(canvas) : null
  if (!kit) return null
  const { gl, u, tex } = kit
  const r = painted(img, host, dpr)
  gl.viewport(0, 0, canvas.width, canvas.height)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
  gl.uniform1i(u.uTex, 0)
  gl.uniform2f(u.uRes, canvas.width, canvas.height)
  gl.uniform4f(u.uPic, r.pic.x, r.pic.y, r.pic.w, r.pic.h)
  gl.uniform4f(u.uBox, r.box.x, r.box.y, r.box.w, r.box.h)
  gl.uniform1f(u.uFade, r.fade ? 1 : 0)
  return (progress: number, elapsedMs: number) => {
    const tilt = (Math.PI / 6) * (1 - easeInOut(Math.min(1, progress / finishProgress)))
    gl.uniform1f(u.uP, easeInOut(progress))
    gl.uniform2f(u.uTilt, Math.cos(tilt), Math.sin(tilt))
    gl.uniform1f(u.uTime, elapsedMs / 1000)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }
}
