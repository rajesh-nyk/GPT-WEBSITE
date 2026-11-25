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

const STEP = 27; // degrees between lines on the cylinder
const ROLL_END = TEXT_SPAN - 0.04; // progress at which the last line is centred
const FADE_OUT: readonly [number, number] = [TEXT_SPAN - 0.07, TEXT_SPAN];
/** Seconds the blur takes to settle (exponential ease-out, independent of frame rate). */
const BLUR_EASE = 0.45;
/** The text waits until page 2 has settled in place (not while it is still sliding up). */
const ARRIVE: readonly [number, number] = [0.004, 0.03];
/** The first line rises from the bottom of the screen to the middle… */
/** Preview ?mantra-rise: it starts below the bottom edge and travels up more slowly. */
const MANTRA_RISE =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("mantra-rise");
const RISE: readonly [number, number] = MANTRA_RISE ? [0.004, 0.02] : [0.004, 0.065];
/** Preview: one word per line, so the letters can be huge and still span the screen. */
const LINES = MANTRA_RISE
  ? [...ODIA.split(" "), ...LATIN.split(" ")]
  : [ODIA, LATIN, LATIN, LATIN, LATIN, LATIN];
const isOdia = (i: number) => (MANTRA_RISE ? i < 3 : i === 0);
/** Preview: how many times bigger than 'edge to edge' the words are drawn. */
const MANTRA_SCALE = 2;
const RISE_FROM = MANTRA_RISE ? 0.62 : 0.42;
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
    const sizes: number[] = [];
    const measure = () => {
      if (MANTRA_RISE) {
        // Poster style: every word is scaled so it spans the screen edge to edge
        // (~1% margin each side), as tall as that makes it (capped at 80% of the height).
        const target = window.innerWidth * 0.98;
        const cap = window.innerHeight * 0.8 * MANTRA_SCALE;
        let biggest = 0;
        lines.current.forEach((el, i) => {
          if (!el) return;
          el.style.fontSize = "100px";
          el.style.width = "max-content";
          const w = el.getBoundingClientRect().width || 1;
          el.style.width = "";
          const size = Math.min((100 * target * MANTRA_SCALE) / w, cap);
          el.style.fontSize = `${size.toFixed(1)}px`;
          sizes[i] = size;
          biggest = Math.max(biggest, size);
        });
        fs = biggest || 32;
        wheel.style.transform = "none";
        return;
      }
      fs =
        parseFloat(getComputedStyle(lines.current[1] ?? wheel).fontSize) || 32;
      const radius = fs * 2.5;
      stage.style.perspective = `${fs * 7}px`;
      wheel.style.transform = MANTRA_RISE ? "none" : `translateZ(${-radius}px)`;
    };
    measure();
    window.addEventListener("resize", measure);
    document.fonts?.ready.then(measure);

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
      const lift = (1 - riseK) ** 2 * window.innerHeight * RISE_FROM;
      stage.style.transform =
        !MANTRA_RISE && lift > 0.5 ? `translateY(${lift.toFixed(1)}px)` : "";
      if (shown <= 0.002 && MANTRA_RISE) {
        rollK = MathUtils.smootherstep(p, RISE[0], ROLL_END);
      } else if (shown <= 0.002) {
        rollK =
          MathUtils.smootherstep(p, ROLL_START, ROLL_END) * (LINES.length - 1);
        riseK = MathUtils.smoothstep(p, RISE[0], RISE[1]);
      }
      if (MANTRA_RISE) {
        // Credits-style: every line travels from below the bottom edge to above the top.
        const H = window.innerHeight;
        const hs = LINES.map((_, i) => (sizes[i] || fs) * 1.05);
        const centres: number[] = [];
        let acc = 0;
        hs.forEach((h) => {
          centres.push(acc + h / 2);
          acc += h;
        });
        const first = centres[0];
        const range = centres[centres.length - 1] - first + H + (hs[0] + hs[hs.length - 1]) / 2;
        const q = MathUtils.smootherstep(p, RISE[0], ROLL_END);
        rollK += (q - rollK) * (1 - Math.exp(-dt / ROLL_EASE));
        lines.current.forEach((el, i) => {
          if (!el) return;
          const y = centres[i] - first + H / 2 + hs[0] / 2 - rollK * range;
          el.style.transform = `translateY(${y.toFixed(1)}px)`;
          el.style.opacity = "1";
        });
      } else if (shown > 0.002) {
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

  // Preview ?mantra-rise: bigger letters (still ~6% margin each side) and a faint glow.
  const previewStyle = MANTRA_RISE
    ? {
        filter: "drop-shadow(0 0 6px rgb(255 190 70 / 0.1))",
      }
    : {};
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
        style={{ visibility: "hidden", opacity: 0, ...(MANTRA_RISE ? { overflow: "hidden" } : {}) }}
      >
        <div ref={cyl} className="cyl-wheel">
          {LINES.map((text, i) => (
            <span
              key={i}
              ref={(el) => {
                lines.current[i] = el;
              }}
              className={`cyl-line ${isOdia(i) ? "cyl-line--odia font-odia" : "font-inscription"}`}
              style={{ backgroundImage: gradient(i), ...previewStyle }}
            >
              {text}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
