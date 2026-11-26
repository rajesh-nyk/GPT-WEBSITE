# Page 3 — ASA-style photo stage (short design)

**Intent:** Rajesh wants page 3 of the GPT wedding site to work like asapiece.com: one full-screen picture at a time, changed by scrolling, with a filmstrip along the bottom. He picked the six couple photos `story/m1`–`m6`.

**Approach:** one sensible way. Build a React stage inside page 3's existing diagonal wipe, so it arrives with the page 2 → 3 edge. Copying ASA's code wasn't an option: their logo, videos and copy are theirs. Only the layout and behaviour are copied.

**Design**
- A full-bleed photo with `object-fit: cover` and a focus point for each photo. No filter on the faces, and a slow drift only.
- Top-left: an R&C round mark and a two-line blurb. Top-right: nav links (Arrival, Blessing, Our Story).
- Bottom-left: a big uppercase title ("R&C × THE MATCHMAKER") and a small bracketed subtitle.
- Bottom: a filmstrip of 6 thumbnails, with the active one outlined. Clicking a thumbnail jumps to that photo.
- Changing photos: the wheel steps once page 3 has fully arrived, with a 0.9 s cooldown (controlled pace). Phones swipe sideways. Arrow keys work too. Scrolling up on photo 1 hands the scroll back to the page.
- Type: a system Helvetica/Arial stack, with no new font download.

**Preview gate:** shown only with `?asa`. The normal page 3 stays the plain purple panel until he approves.

**Non-goals:** ASA's video, logo and copy; any new pages.
