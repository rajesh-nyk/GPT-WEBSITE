import { useEffect, useRef } from "react";
import { MathUtils } from "three";
import { CINE3, ganeshaFx, TEXT_SPAN } from "./fx";
import { journey } from "../world/journey";

/**
 * The invocation: lines of the mantra roll around an invisible 3D cylinder as the
 * consecration begins (blessing progress p), each repeat in its own wedding colour.
 * While it plays the world behind it is softly blurred (eased in and out), so the flat
 * letters read as the one focus; Ganesha only begins forming once the text has cleared.
 *
 * Driven from the governed progress in one rAF loop (transform + opacity only, no React
 * re-render), so it stays in step with the figure and reverses cleanly on scroll-up.
 * Reduced motion: a flat, static pair of lines instead of the rolling cylinder.
 */
const ODIA = "ଶ୍ରୀ ଗଣେଶାୟ ନମଃ";
const LATIN = "Shri Ganeshaya Namah";

// Wedding colours: gold, ivory, saffron, marigold, honey gold, champagne.
const PALETTE: ReadonlyArray<readonly [string, string, string]> = [
  ["#fff3cf", "#f2c75c", "#b9862b"],
  ["#ffffff", "#f7efdc", "#cfc3a5"],
  ["#ffe0a0", "#ff9f2e", "#c25e0a"],
  ["#ffe88a", "#ffb300", "#b87400"],
  ["#fff0c2", "#e8b04a", "#a0701e"],
  ["#fffaf0", "#f3dca0", "#c9a45c"],
];
const LINES = [ODIA, LATIN, LATIN, LATIN, LATIN, LATIN];

const STEP = 27; // degrees between lines on the cylinder
const ROLL_END = TEXT_SPAN - 0.04; // progress at which the last line is centred
const FADE_OUT: readonly [number, number] = [TEXT_SPAN - 0.07, TEXT_SPAN];
/** Seconds the blur takes to settle (exponential ease-out, independent of frame rate). */
const BLUR_EASE = 0.45;
/** The text waits until page 2 has settled in place (not while it is still sliding up). */
const ARRIVE: readonly [number, number] = [0.004, 0.03];
/** The first line rises from the bottom of the screen to the middle… */
const RISE: readonly [number, number] = [0.004, 0.065];
/** …and only then do the other lines roll in. */
const ROLL_START = RISE[1];
/** Seconds the roll takes to catch up with the scroll — glides instead of jumping. */
const ROLL_EASE = 0.35;
/** Seconds the text takes to come into focus / fade (same ease-out as the blur). */
const TEXT_EASE = 0.3;
const TEXT_FOCUS_PX = 8;

export function CylinderMantra({ reducedMotion }: { reducedMotion: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const veil = useRef<HTMLDivElement>(null);
  const cyl = useRef<HTMLDivElement>(null);
  const lines = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    if (reducedMotion) return;
    const stage = root.current;
    const wheel = cyl.current;
    const blur = veil.current;
    if (!stage || !wheel || !blur) return;
    let veilK = 0;
    let textK = 0;
    let rollK = 0;
    let riseK = 0;
    let lastText = -1;
    let lastBlur = -1;
    let last = performance.now();
    let raf = 0;
    let fs = 0;
    const measure = () => {
      fs =
        parseFloat(getComputedStyle(lines.current[1] ?? wheel).fontSize) || 32;
      const radius = fs * 2.5;
      stage.style.perspective = `${fs * 7}px`;
      wheel.style.transform = `translateZ(${-radius}px)`;
    };
    measure();
    window.addEventListener("resize", measure);

    const tick = () => {
      const p = ganeshaFx.progress;
      const radius = fs * 2.5;
      const arrive = MathUtils.smoothstep(p, ARRIVE[0], ARRIVE[1]);
      const depart = 1 - MathUtils.smoothstep(p, FADE_OUT[0], FADE_OUT[1]);
      const target = ganeshaFx.leave < 0.01 ? arrive * depart : 0;
      // Text and blur both glide toward the scroll's target in time (ease-out), so a
      // jerky scroll never makes them stutter.
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      textK += (target - textK) * (1 - Math.exp(-dt / TEXT_EASE));
      if (Math.abs(textK - target) < 0.002) textK = target;
      // Preview ?cine3: the glow (the blurred light) fills 0→100 BEFORE the mantra arrives
      // and empties 100→0 as it leaves.
      const jt = journey.t;
      const veilTarget = CINE3 && ganeshaFx.leave < 0.01
        ? MathUtils.smoothstep(jt, 0.88, 1.0) * (1 - MathUtils.smoothstep(jt, 1.19, 1.26))
        : target;
      veilK += (veilTarget - veilK) * (1 - Math.exp(-dt / BLUR_EASE));
      if (Math.abs(veilK - veilTarget) < 0.002) veilK = veilTarget;
      const shown = textK;
      if (textK !== lastText) {
        lastText = textK;
        stage.style.opacity = textK.toFixed(3);
        stage.style.visibility = textK > 0.002 ? "visible" : "hidden";
        // Comes into focus as it arrives, softens again as it goes.
        const soft = (1 - textK) * TEXT_FOCUS_PX;
        stage.style.filter =
          soft > 0.05 ? `blur(${soft.toFixed(2)}px)` : "none";
      }
      // The world behind softens with it (fixed-strength blur; only its opacity moves).
      if (veilK !== lastBlur) {
        lastBlur = veilK;
        blur.style.opacity = veilK.toFixed(3);
        blur.style.visibility = veilK > 0.002 ? "visible" : "hidden";
      }
      // Rise: from the bottom of the screen to the middle, easing out as it lands.
      riseK +=
        (MathUtils.smoothstep(p, RISE[0], RISE[1]) - riseK) *
        (1 - Math.exp(-dt / ROLL_EASE));
      const lift = (1 - riseK) ** 2 * window.innerHeight * 0.42;
      stage.style.transform =
        lift > 0.5 ? `translateY(${lift.toFixed(1)}px)` : "";
      if (shown <= 0.002) {
        rollK =
          MathUtils.smootherstep(p, ROLL_START, ROLL_END) * (LINES.length - 1);
        riseK = MathUtils.smoothstep(p, RISE[0], RISE[1]);
      }
      if (shown > 0.002) {
        const rollTarget =
          MathUtils.smootherstep(p, ROLL_START, ROLL_END) * (LINES.length - 1);
        rollK += (rollTarget - rollK) * (1 - Math.exp(-dt / ROLL_EASE));
        const roll = rollK;
        lines.current.forEach((el, i) => {
          if (!el) return;
          const a = (i - roll) * STEP;
          const vis = Math.max(0, Math.cos((a * Math.PI) / 180));
          el.style.transform = `rotateX(${-a}deg) translateZ(${radius}px)`;
          // Only the centre line is clear; its neighbours are faint, the rest hidden,
          // so the lines never bunch into a stack.
          el.style.opacity = MathUtils.smoothstep(vis, 0.8, 1).toFixed(3);
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, [reducedMotion]);

  const gradient = (i: number) => {
    const [a, b, c] = PALETTE[i % PALETTE.length];
    return `linear-gradient(180deg, ${a} 0%, ${b} 45%, ${c} 100%)`;
  };

  if (reducedMotion) {
    return (
      <div className="cyl-flat" aria-hidden>
        <span
          className="cyl-line cyl-line--odia font-odia"
          style={{ backgroundImage: gradient(0) }}
        >
          {ODIA}
        </span>
        <span
          className="cyl-line font-inscription"
          style={{ backgroundImage: gradient(1) }}
        >
          {LATIN}
        </span>
      </div>
    );
  }

  return (
    <>
      {/* Its own layer, outside the faded stage: an ancestor's opacity would stop the blur
        from reaching the 3D world behind. */}
      <div
        ref={veil}
        className="cyl-veil"
        aria-hidden
        style={{ visibility: "hidden" }}
      />
      <div
        ref={root}
        className="cyl-stage"
        aria-hidden
        style={{ visibility: "hidden", opacity: 0 }}
      >
        <div ref={cyl} className="cyl-wheel">
          {LINES.map((text, i) => (
            <span
              key={i}
              ref={(el) => {
                lines.current[i] = el;
              }}
              className={`cyl-line ${i === 0 ? "cyl-line--odia font-odia" : "font-inscription"}`}
              style={{ backgroundImage: gradient(i) }}
            >
              {text}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
