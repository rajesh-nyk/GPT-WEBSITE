# Page 2 clouds that light Ganesha (design)

Date: 25 Nov 2026 · Site: `gpt wedding/` · Preview only behind `?clouds` until approved.

## Intent
Ganesha (3D model on a lotus) and the volumetric clouds behind him must look lit by one world. Today the clouds are too bright and he doesn't hold up against them. Rajesh wants the clouds to *give* light to Ganesha: where a bright cloud sits above or to the right, that part of him shines more. He also wants more clouds, some that float over the lotus and Ganesha, cloud texture that stays visible (no constant blur), and clouds that build up instead of simply appearing.

## Goals
- Clouds light Ganesha and the lotus. The side facing a nearby bright cloud brightens, and it changes as clouds drift.
- Balanced tone. The clouds come down a little from the last preview, and Ganesha's own flat glow eases so the cloud light reads.
- More clouds:
  - **Laptop:** about 7 behind and 2 in front.
  - **Phone:** about 4 behind and 1 in front.
- Front clouds float slowly across the lotus and lower body.
- Sharp detail: billow texture visible up close, with no all-the-time softening.
- Build-up: each cloud condenses from thin wisps into its full shape, staggered, as page 2 arrives, and thins away on exit. It follows scroll, so it reverses when scrolling back.

## Non-goals
- Wisps weaving between petals (needs a depth pass; possible later add-on).
- A full sky lighting map (too heavy for phones).

## Anti-goals (a failure even if it works)
- A cloud hiding his face, or making the mantra hard to read.
- Hazy, blurry clouds.
- A colour filter on him. He changes only through light falling on him.
- Stutter on iPhone.

## Approaches
1. **Clouds carry their own light** (chosen). One soft light per cloud lights the model. Front clouds are a second layer drawn in front of the lotus. Cheap, and works on phones.
2. Sky lighting map rendered from the clouds. Richest, but too heavy to update on phones.
3. Depth-aware weaving through the petals. Most natural, but costs an extra pass and more build time.

Rajesh picked 1.

## Design
- **Cloud lights:** one point light per cloud in the Ganesha scene. Its colour is the cloud's lit tone, warm gold to lavender. Each light sits on the cloud's face nearest him. Its intensity follows that cloud's build-up and the page fade, and is lower for distant clouds. Ganesha's fixed lights and glow drop so the cloud lights make the difference (my call: tune by eye until the side facing a cloud is clearly brighter but his face stays natural).
- **Front clouds:** a second volumetric layer drawn *after* the model, in front of the lotus (no overlap with the model's depth). Its density fades to a thin veil inside a circle around his face, so the face always reads. They drift slowly left↔right across the lotus.
- **Detail:**
  - Laptop: clouds render at full CSS resolution (high tier).
  - Frame blending: weight goes up (less smear), so the image settles fast and detail holds.
  - Noise: the detail scale is re-tuned for visible billows, kept above the "sand" size found earlier.
  - Phone tiers stay at reduced resolution for speed.
- **Build-up:** a per-cloud growth value from 0 to 1, staggered across clouds and driven by the page 2 arrival progress. Growth raises density from the densest cores outward (condensing), never a plain opacity fade. It runs in reverse on exit.
- **Tone:** clouds a little dimmer than v4. Shadows stay violet, not black.

## Constraints
- Keep the mantra clear (upper left on laptop; bottom on phone).
- Speed target: laptop pane at or near today's FPS (about 25 at 1280×800); phone 60 in the pane. Real Safari and iPhone check is owed.
- Everything stays behind `?clouds`. The normal page 2 is unchanged.

## Left to the builder
Exact cloud positions and sizes, light intensities, stagger timing, and the face-circle size. All are tuned by eye in the preview.
