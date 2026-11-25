# Page 2 Cloud Light Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Volumetric clouds on page 2 that light Ganesha, with more clouds, some floating in front of the lotus, sharp detail, and a condensing build-up, all behind `?clouds`.

**Architecture:** Pure timing/lighting maths lives in `cloudMath.ts` (unit-tested). `PageTwoClouds.tsx` renders two volumetric layers (back: behind everything; front: drawn after the model) and owns one `PointLight` per cloud inside the Ganesha scene. `PageTwoGanesha.tsx` feeds page progress and the face position, and eases its own lights under `?clouds`.

**Tech Stack:** React Three Fiber, three.js ShaderMaterial raymarching (WebGL2, `sampler3D`), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-25-page2-cloud-light-design.md`

## Global Constraints

- Everything stays behind `?clouds`; without it page 2 renders exactly as today.
- His face never hidden; the mantra stays readable (upper left on laptop, bottom on phone).
- He changes only through light; no colour filter on him.
- Laptop pane about 25 FPS or better at 1280×800 with `?quality=high`; phone preset 60 FPS.
- Not a git repo: there are no commit steps. Each task ends with `npm test` + `npx tsc --noEmit -p tsconfig.app.json` clean.

## Review Focus

- Scrolling back up mid build-up: clouds must un-condense smoothly, not pop (pinned by `growth` reversibility test, Task 1).
- Fast scroll past page 2: no cloud light lingers on him once fade is 0 (pinned by `cloudLightIntensity(…, fade 0) === 0`, Task 1).
- Front cloud drifting across his face: density at the face centre ≤ 15% (pinned by `faceVeil` test, Task 1).
- Resize laptop ↔ portrait: layouts swap and frame history resets (no smeared old frame), checked in Task 4.
- Low tier device: front layer and lights still work with fewer clouds, checked in Task 4.

---

### Task 1: Cloud maths

**Files:**
- Create: `src/components/world/cloudMath.ts`
- Test: `src/components/world/cloudMath.test.ts`

**Interfaces:**
- Produces:
  - `growth(progress: number, index: number, count: number): number`: 0..1 build-up for cloud `index`, staggered over arrival progress 0.25–0.95, each cloud taking 0.35 of that span.
  - `cloudLightIntensity(growth: number, fade: number, distance: number): number`: `peak * growth * fade / (1 + distance² * 0.08)`, with `peak = 2.4`.
  - `faceVeil(dx: number, dy: number, radius: number): number`: multiplier on front-cloud density, 0.15 at the centre, rising smoothly to 1 at `radius` (screen-space units).

- [ ] **Step 1: Write the failing tests** `cloudMath.test.ts`:
  - `growth(0, 0, 5) === 0` and `growth(1, 4, 5) === 1`.
  - Monotonic in progress, and `growth(p, i, n)` at the same `p` gives the same value going up or down (pure function).
  - Staggered: `growth(0.5, 0, 5) > growth(0.5, 4, 5)`.
  - `cloudLightIntensity(1, 0, 1) === 0`, `cloudLightIntensity(0, 1, 1) === 0`, and closer gives brighter: `cloudLightIntensity(1, 1, 2) > cloudLightIntensity(1, 1, 6)`.
  - `faceVeil(0, 0, 1)` ≈ 0.15, `faceVeil(1.2, 0, 1) === 1`.
- [ ] **Step 2:** Run `npx vitest run src/components/world/cloudMath.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement the three functions with `MathUtils.smoothstep` / clamps.
- [ ] **Step 4:** Run the same command. Expected: PASS.

### Task 2: Build-up, sharper detail, more clouds, toned down

**Files:**
- Modify: `src/components/world/PageTwoClouds.tsx`
- Modify: `src/components/world/PageTwoGanesha.tsx` (pass arrival `progress`)

**Interfaces:**
- Consumes: `growth` from Task 1.
- Produces: `cloudFade` gains `progress: number` (page 2 arrival 0..1, set next to `value`); the shader gets `uniform float uGrowth`.

- [ ] **Step 1:** Add `uGrowth`. In `density()`, condense from the cores: `d = remap(d, (1.0 - uGrowth) * 0.85, 1.0, 0.0, 1.0)` before the final scale, so low growth leaves only the densest wisps. Set it per cloud from `growth(cloudFade.progress, i, specs.length) * exit`, where `exit` = `cloudFade.value`'s exit part (keep fade for the composite).
- [ ] **Step 2:** Sharpness:
  - `resScale` high = `Math.min(dpr, 1.5)`, mid 0.75, low 0.5.
  - Blend weight `uMix` 0.18 → 0.45.
  - Add a third detail octave at `duvw * 4.3` weight 0.15; keep the base cell ≥ 4 px at 1280 wide.
- [ ] **Step 3:**
  - Back layouts: laptop 7 clouds (keep the 5 from v4, add one far-left high behind the mantra's row but below it at y −0.2/z −8, and one small low-right near).
  - Phone: 4 clouds.
  - Tone: `gold` ×1.6, `moon` ×0.45, `skyTop` (0.26,0.2,0.4), `skyBottom` (0.09,0.065,0.15).
- [ ] **Step 4:** Run `npm test` and tsc. Expected: clean. Then in the preview (1280×800, `?clouds&quality=high`), scroll into page 2 slowly and check:
  - Clouds visibly condense one after another, and un-condense on scroll up.
  - The close-up zoom shows billow texture.
  - FPS ≥ 22.

### Task 3: Clouds light Ganesha

**Files:**
- Modify: `src/components/world/PageTwoClouds.tsx`
- Modify: `src/components/world/PageTwoGanesha.tsx:CLOUD_TONE` and its light lines

**Interfaces:**
- Consumes: `cloudLightIntensity` (Task 1); the back/front cloud specs.
- Produces: the `PageTwoClouds` prop `face: Vector3`, his face world point, which Task 4 uses.

- [ ] **Step 1:** In `PageTwoClouds`, render one `<pointLight>` per cloud (back and front) in the Ganesha scene.
  - **Position:** the cloud centre moved 70% of the way toward the model along the line to it, so it sits on the cloud's near face.
  - **Colour:** mix #ffc27a and #b9a6ff by the cloud's height (higher = warmer).
  - **Intensity:** `cloudLightIntensity(growth, fade, distanceToModel)`.
  - **Falloff:** `distance` 0 (physical decay 2).
- [ ] **Step 2:** In `PageTwoGanesha`, under `CLOUDS_ENABLED`:
  - hemisphere ×0.6
  - first directional ×0.6
  - environment ×0.6
  - glow (`CLOUD_TONE`) 0.6
- [ ] **Step 3:** Preview check:
  - Compare a shot with the right-hand clouds grown against the same shot with `growth` forced to 0 (temporary `?cloudlight=0` flag, removed after). His right side must be visibly brighter.
  - His face must stay natural.
  - The mantra must be unaffected.

### Task 4: Front clouds over the lotus

**Files:**
- Modify: `src/components/world/PageTwoClouds.tsx`

**Interfaces:**
- Consumes: `faceVeil` (Task 1); `face` prop (Task 3).

- [ ] **Step 1:** Factor the render-to-target + frame-blend + composite into a `CloudLayer` helper used twice:
  - **back:** composite `renderOrder -10`, opaque pass, as today.
  - **front:** composite `transparent: true`, `renderOrder 10`, drawn after the model.
- [ ] **Step 2:** Front specs:
  - Laptop: 2 thin clouds (half-height ≤ 0.45) at z ≈ +1.6, y in the lower body/lotus band, drifting ±1.2 units across over about 40 s.
  - Phone: 1 cloud.
  - In the shader, multiply density by `faceVeil` using the projected face point (`uFace` in screen UV, `uFaceR` ≈ 0.11 of screen height).
- [ ] **Step 3:** Preview check:
  - Laptop: front clouds pass over the lotus, his face stays clear, and the mantra stays clear.
  - Phone: the same, plus 60 FPS.
  - Rotate between laptop and phone sizes: no smear.

### Task 5: Final check and hand-over

- [ ] Run `npm test`, tsc and `npx vite build`. Expected: all clean.
- [ ] Save laptop, phone and close-up previews to `~/mywedding/previews/page2-clouds-v5-*`, send them, and update the memory note.
