import { useEffect, useRef, type RefObject } from 'react'
import { CEREMONIES, FINALE, RITUALS, STORY, STORY_CLOSING, type Ceremony } from '../../content/wedding'
import { useReveal } from './useReveal'
import { HataGanthi } from './HataGanthi'
import { RiftPortrait } from './RiftPortrait'
import { nightFx } from '../world/NightPortrait'
import { templeFx } from '../world/templeFx'
import { useMarkMask } from './useMarkMask'
import { useReducedMotion } from '../../lib/useReducedMotion'

/**
 * Chapters 3–8, after the blessing. The 3D world has settled (the wheel rests as the
 * watermark), so these are HTML over the dark stage. All copy is the couple's own (see
 * content/wedding.ts). Layout: a content column that always keeps clear of the
 * watermark wheel (.chapter → --mark-clear in index.css).
 */
export function Chapters({ storyRef }: { storyRef: RefObject<HTMLElement | null> }) {
  useMarkMask(useReducedMotion())
  return (
    <>
      <Story sectionRef={storyRef} />
      <CeremonyChapter c={CEREMONIES.nirbandha} chapter="04" />
      <CeremonyChapter c={CEREMONIES.bahaghara} chapter="05">
        <HataGanthi />
      </CeremonyChapter>
      <Kaudi />
      <CeremonyChapter c={CEREMONIES.reception} chapter="07" />
      <Night />
    </>
  )
}

function Kicker({ children }: { children: React.ReactNode }) {
  return <p className="ch-kicker font-inscription">{children}</p>
}

function Story({ sectionRef }: { sectionRef: RefObject<HTMLElement | null> }) {
  useReveal(sectionRef)
  return (
    <section ref={sectionRef} id="story" tabIndex={-1} aria-labelledby="story-title" className="chapter">
      <header className="ch-head" data-reveal>
        <Kicker>Chapter 03</Kicker>
        <h2 id="story-title" className="ch-title font-inscription">
          Our Story
        </h2>
        <p className="ch-sub">
          Bhubaneswar <span aria-hidden className="ch-dot" /> Sambalpur
        </p>
      </header>

      <ol className="story">
        {STORY.map((s, i) => (
          <li key={s.photo} className="story-beat" data-side={i % 2 ? 'r' : 'l'}>
            <figure className="story-photo" data-reveal>
              <img
                src={`${import.meta.env.BASE_URL}${s.photo}`}
                alt={s.alt}
                width={s.w}
                height={s.h}
                loading="lazy"
                decoding="async"
              />
            </figure>
            <div className="story-text" data-reveal>
              <p className="story-kicker font-inscription">
                {String(i + 1).padStart(2, '0')} · {s.kicker}
              </p>
              <p className="story-line">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="story-closing">
        {STORY_CLOSING.map((p) => (
          <figure key={p.photo} className="story-photo" data-reveal>
            <img
              src={`${import.meta.env.BASE_URL}${p.photo}`}
              alt={p.alt}
              width={p.w}
              height={p.h}
              style={{ aspectRatio: `${p.w} / ${p.h}` }}
              loading="lazy"
              decoding="async"
            />
          </figure>
        ))}
      </div>
    </section>
  )
}

function CeremonyChapter({
  c,
  chapter,
  children,
}: {
  c: Ceremony
  chapter: string
  children?: React.ReactNode
}) {
  const ref = useRef<HTMLElement>(null)
  useReveal(ref)
  return (
    <section ref={ref} id={c.id} tabIndex={-1} aria-labelledby={`${c.id}-title`} className="chapter ceremony">
      <div className="ceremony-card">
        <Kicker>
          <span data-reveal>
            Chapter {chapter} · Ceremony {c.n}
          </span>
        </Kicker>
        {c.odia ? (
          <>
            <p lang="or" className="ceremony-odia font-odia" data-reveal>
              {c.odia}
            </p>
            <h2 id={`${c.id}-title`} className="ceremony-name font-inscription" data-reveal>
              {c.name} <span className="ceremony-en">— {c.en}</span>
            </h2>
          </>
        ) : (
          <>
            <h2 id={`${c.id}-title`} className="ceremony-title font-inscription" data-reveal>
              {c.name}
            </h2>
            <p className="ceremony-en-line" data-reveal>
              {c.en}
            </p>
          </>
        )}
        <p className="ceremony-desc" data-reveal>
          {c.desc}
        </p>
        <dl className="ceremony-facts" data-reveal>
          <div>
            <dt className="font-inscription">Date</dt>
            <dd>{c.date}</dd>
          </div>
          <div>
            <dt className="font-inscription">Time</dt>
            <dd>To be announced</dd>
          </div>
          <div>
            <dt className="font-inscription">Place</dt>
            <dd>{c.place}</dd>
          </div>
        </dl>
      </div>
      {children}
    </section>
  )
}

function Kaudi() {
  const ref = useRef<HTMLElement>(null)
  useReveal(ref)
  return (
    <section ref={ref} id="kaudi" tabIndex={-1} aria-labelledby="kaudi-title" className="chapter">
      <header className="ch-head" data-reveal>
        <Kicker>Chapter 06</Kicker>
        <p lang="or" className="ch-odia font-odia">
          ବାହାଘର
        </p>
        <h2 id="kaudi-title" className="ch-title font-inscription">
          The Bahaghara rituals
        </h2>
        <p className="ch-sub-line">A short guide for our guests to the moments of an Odia wedding.</p>
      </header>
      <ol className="rituals">
        {RITUALS.map((r, i) => (
          <li key={r.name} className="ritual" data-reveal style={{ transitionDelay: `${(i % 3) * 90}ms` }}>
            <p className="ritual-step font-inscription">
              {String(i + 1).padStart(2, '0')} · {r.step}
            </p>
            <h3 className="ritual-name font-inscription">{r.name}</h3>
            <p lang="or" className="ritual-odia font-odia">
              {r.odia}
            </p>
            <p className="ritual-text">{r.text}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** One name beside the rift: English letters written out from the light, a gold hairline,
 *  and the name in Odia. Decorative copy — the heading above carries the names for AT. */
function NpName({ side, en, odia }: { side: 'c' | 'r'; en: string; odia: string }) {
  const n = en.length
  return (
    <div aria-hidden className={`np-name np-name--${side}`}>
      <div className="np-name__mark">
        <p className="np-name__en font-inscription">
          {[...en].map((ch, i) => (
            // letters nearest the rift come first: Chinmayee is left of it, Rajesh right
            <span key={i} className="np-ch" style={{ ['--i' as string]: side === 'c' ? n - 1 - i : i }}>
              {ch}
            </span>
          ))}
          <span className="np-name__foil">{en}</span>
        </p>
        {/* starts exactly under the letter nearest the rift: Chinmayee's last E, Rajesh's R */}
        <span className="np-name__rule" />
        <p lang="or" className="np-name__odia font-odia">
          {odia}
        </p>
      </div>
    </div>
  )
}

/** Marks the stage once the photo has opened (and un-marks it if scrolled well back), so
 *  the names are written out on their own time, never scrubbed by the scroll. */
function useNamesReveal(stage: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    let raf = 0
    let on = false
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const q = nightFx.reveal
      const next = on ? q > 0.4 : q > 0.86
      if (next !== on && stage.current) {
        on = next
        stage.current.dataset.names = on ? 'in' : 'out'
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [stage])
}

/** Marks the closing stage once the camera has arrived at the temple (and un-marks it if
 *  the visitor goes back up), so the names and dates appear on their own time. */
function useTempleEnd(stage: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    let raf = 0
    let on = false
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const v = templeFx.view
      const next = on ? v > 0.6 : v > 0.97
      if (next !== on && stage.current) {
        on = next
        stage.current.dataset.end = on ? 'in' : 'out'
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [stage])
}

const onSceneTap = (e: React.MouseEvent) => {
  if ((e.target as HTMLElement).closest('a, button')) return
  templeFx.taps.push({ x: e.clientX, y: e.clientY })
}

function Night() {
  const ref = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const endStage = useRef<HTMLDivElement>(null)
  useReveal(ref)
  useNamesReveal(stage)
  useTempleEnd(endStage)
  return (
    <section ref={ref} id="night" tabIndex={-1} aria-labelledby="night-title" className="chapter night">
      <div className="night-lines">
        {FINALE.lines.map((l) => (
          <p key={l} className="night-line" data-reveal>
            {l}
          </p>
        ))}
      </div>

      {/* The portrait forms from the night sky (drawn by the 3D world over .np-frame). */}
      <div className="np-track">
        <div ref={stage} className="np-stage">
          <h2 id="night-title" className="sr-only">
            Rajesh &amp; Chinmayee
          </h2>
          {/* Each name sits beside its person, on either side of the rift of light, and is
              written out from the light once the photo has opened (see useNamesReveal). */}
          <div className="np-compose">
            <NpName side="c" en="Chinmayee" odia={FINALE.chinmayeeOdia} />
            {/* The photo is a plain image (exact original colours — the 3D scene's colour
                grade never touches it); the night sky around it is drawn by the 3D world. */}
            <div className="np-frame">
              <RiftPortrait
                src={`${import.meta.env.BASE_URL}night/photo.webp`}
                alt="Rajesh and Chinmayee, smiling together"
              />
            </div>
            <NpName side="r" en="Rajesh" odia={FINALE.rajeshOdia} />
          </div>
          {/* THE CLOSING SCENE, on the same pinned stage: as the visitor scrolls on, the
              camera turns up out of the portrait's sky (the photo and names sail away with
              it), sweeps down to a temple across a moonlit river and circles it as lanterns
              rise (world/TempleNight.tsx). The names and dates arrive once it settles. */}
          <div ref={endStage} className="tn-stage" onClick={onSceneTap}>
            <div className="night-card">
              {/* Shubha Bibaha closes the page, once — not under the photo */}
              <p className="night-blessing">
                <span lang="or" className="font-odia">
                  {FINALE.odia}
                </span>
                <span aria-hidden className="np-dot" />
                <span className="font-inscription np-sub-en">{FINALE.title}</span>
              </p>
              <p className="night-names font-inscription">{FINALE.names}</p>
              <p lang="or" className="night-names-odia font-odia">
                {FINALE.namesOdia}
              </p>
              <ul className="night-dates">
                {Object.values(CEREMONIES).map((c) => (
                  <li key={c.id}>
                    <span className="night-date font-inscription">{c.dateShort}</span>
                    <span className="night-date-name">{c.name}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="tn-hint" aria-hidden>
              Tap the sky to send a lantern · the temple to ring its bell · the moon for a wish
            </p>
          </div>
        </div>
      </div>

      <footer className="site-foot">
        <p className="foot-made">{FINALE.madeIn}</p>
        <p className="foot-links">
          <a href={`mailto:${FINALE.email}`}>{FINALE.email}</a>
          <a href={FINALE.instagram.url} target="_blank" rel="noreferrer">
            {FINALE.instagram.handle}
          </a>
        </p>
      </footer>
    </section>
  )
}
