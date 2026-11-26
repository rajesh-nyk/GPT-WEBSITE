import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { useReducedMotion } from '../lib/useReducedMotion'
import { gsap } from '../lib/gsap'
import { StoryFooterClouds } from './world/StoryFooterClouds'
import { prepareInkReveal } from './inkReveal'
import { PhotoViewer } from './PhotoViewer'
import './PageThreeStage.css'

const TITLE_END = 0.52
const INK_TIME = 2100
const CONTROLS_PROGRESS = Math.acos(-0.9) / Math.PI
const ARRIVAL_TITLE = 'Lights Camera Incoming'

/** On by default (Rajesh, 26 Nov 2026). ?asa=0 shows the old empty page 3. */
export const SHOW_PAGE_THREE_STAGE =
  typeof window === 'undefined' || new URLSearchParams(window.location.search).get('asa') !== '0'

type Slide = { photo: string; land?: string; title: string; note: string; alt: string; focus: string }

/** The couple's six photos (chosen by Rajesh, 26 Nov 2026). Focus keeps faces in the phone crop. */
const SLIDES: Slide[] = [
  { photo: 'story/m1.webp', land: 'story/m1_landscape.webp', title: 'The Matchmaker', note: 'It began with a little matchmaking', alt: 'Rajesh and Chinmayee in festive clothes, smiling at the camera', focus: '50% 28%' },
  { photo: 'story/m2.webp', land: 'story/m2_landscape.webp', title: 'Between the Messages', note: 'He fell for the matchmaker instead', alt: 'Rajesh and Chinmayee at night in front of a lit golden temple', focus: '50% 30%' },
  { photo: 'story/m3.webp', land: 'story/m3_landscape.webp', title: 'The Moment', note: 'He just knew — she was the one', alt: 'A close selfie of Rajesh and Chinmayee at night', focus: '50% 35%' },
  { photo: 'story/m4.webp', land: 'story/m4_landscape.webp', title: 'Written Long Before', note: 'Our families said yes without a question', alt: 'Chinmayee taking a selfie with Rajesh beside a pool', focus: '50% 30%' },
  { photo: 'story/m5.webp', title: 'Side by Side', note: 'Standing together, Odisha', alt: 'Rajesh and Chinmayee standing together in a courtyard', focus: '50% 35%' },
  { photo: 'story/m6.webp', land: 'story/m6_landscape.webp', title: 'Same Time', note: 'Matching watches, one time', alt: 'Their hands together, wearing matching watches', focus: '50% 50%' },
]

/** Two ribbons of pollen. Fixed positions keep the path identical when scrolling back. */
function pollenRibbon(count: number, near: boolean) {
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1)
    const jitter = Math.sin(i * 73.1) * Math.cos(i * 17.2)
    return {
      left: `${44 + t * 32 + Math.sin(t * Math.PI * 2) * (near ? 17 : 21) + jitter * 8}%`,
      top: `${2 + t * 79 + Math.sin(i * 9.7) * 4}%`,
      '--grain': `${(near ? 1.6 : 0.8) + Math.abs(jitter) * 1.8}px`,
      opacity: 0.27 + Math.abs(jitter) * 0.7,
    } as CSSProperties
  })
}

const RIBBONS = [pollenRibbon(42, false), pollenRibbon(24, true)]

/** fill: each photo covers the whole screen (now page 5). fill={false}: the framed photo beside the caption (now page 3).
 * from: the page before it; its arrival (title + ink) plays while that page scrolls away. */
export function PageThreeStage({ fill = true, from = 'page-2' }: { fill?: boolean; from?: string }) {
  const [active, setActive] = useState(0)
  const [preview, setPreview] = useState<number | null>(null)
  // Full-screen viewer (framed page only): opened by clicking the big photo (Rajesh, 27 Nov 2026).
  const [viewer, setViewer] = useState<number | null>(null)
  const [phase, setPhase] = useState<'idle' | 'title' | 'morph' | 'done'>('idle')
  const phaseRef = useRef<typeof phase>('idle')
  const root = useRef<HTMLDivElement>(null)
  const arrivalTitle = useRef<HTMLDivElement>(null)
  const inkCanvas = useRef<HTMLCanvasElement>(null)
  const cloudScroll = useRef({ coverage: 0, visit: 0 })
  const strip = useRef<HTMLElement>(null)
  const thumbs = useRef<(HTMLButtonElement | null)[]>([])
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const reduced = useReducedMotion()
  const shown = preview ?? active
  const slide = SLIDES[shown]
  const title = slide.title.split(' ')
  const lastWord = title.pop()
  const base = import.meta.env.BASE_URL

  const go = (next: typeof phase) => { phaseRef.current = next; setPhase(next) }

  useLayoutEffect(() => {
    const stage = root.current
    const title = arrivalTitle.current
    const canvas = inkCanvas.current
    const outgoing = document.getElementById(from)
    if (!fill || reduced || !stage || !title || !canvas || !outgoing) return
    const main = title.querySelector('.p3-arrival-main')
    const top = title.querySelector('.p3-arrival-echo--top')
    const bottom = title.querySelector('.p3-arrival-echo--bottom')
    if (!main || !top || !bottom) return

    const photo = { progress: 0 }
    let lastProgress = 0
    let closing = false
    let preparedImage: HTMLImageElement | null = null
    let preparedSource = ''
    let paint: ReturnType<typeof prepareInkReveal> = null

    const sync = ({ progress }: { progress: number }) => {
      if (progress !== lastProgress) closing = progress < lastProgress
      lastProgress = progress
      const next = progress >= 0.999 ? 'done' : progress >= TITLE_END ? 'morph' : progress > 0 ? 'title' : 'idle'
      const masking = next === 'morph'
      const inkProgress = Math.min(1, photo.progress / 0.75)

      if (masking) {
        const img = stage.querySelector<HTMLImageElement>('.p3-print[data-selected] img')
        if (img?.complete && img.naturalWidth) {
          if (preparedImage !== img || preparedSource !== img.currentSrc) {
            preparedImage = img
            preparedSource = img.currentSrc
            paint = prepareInkReveal(canvas, img)
          }
          const frame = closing ? Math.min(0.999, inkProgress) : inkProgress
          paint?.(frame, frame * INK_TIME)
        }
      }
      stage.toggleAttribute('data-ink-closing', masking && closing)
      stage.toggleAttribute('data-ink-controls', masking && !closing && !!paint && inkProgress >= CONTROLS_PROGRESS)
      if (phaseRef.current !== next) go(next)
    }

    const context = gsap.context(() => {
      const timeline = gsap.timeline({
        scrollTrigger: {
          id: 'page-three-title',
          trigger: outgoing,
          start: 'center top',
          end: 'bottom top',
          scrub: true,
          onUpdate: sync,
          onRefresh: trigger => {
            preparedImage = null
            sync(trigger)
          },
        },
      })
      timeline
        .fromTo(main, { xPercent: -130, opacity: 1 },
          { xPercent: 0, duration: 0.42 * TITLE_END, ease: 'power3.out' }, 0.06 * TITLE_END)
        .to(main, { y: '-.62em', opacity: 0, duration: 0.21 * TITLE_END, ease: 'power1.in' }, 0.79 * TITLE_END)
      for (const [echo, direction] of [[top, 1], [bottom, -1]] as const) {
        timeline
          .fromTo(echo, { xPercent: 130 * direction, y: `${-0.63 * direction}em`, opacity: 1 },
            { xPercent: 0, duration: 0.45 * TITLE_END, ease: 'power3.out' }, 0)
          .to(echo, { y: 0, opacity: 0, duration: 0.29 * TITLE_END, ease: 'sine.inOut' }, 0.45 * TITLE_END)
      }
      timeline.to(photo, { progress: 1, duration: 1 - TITLE_END, ease: 'none' }, TITLE_END)
      if (timeline.scrollTrigger) sync(timeline.scrollTrigger)
    }, title)

    const onImageLoad = (event: Event) => {
      if (phaseRef.current === 'morph' && event.target instanceof HTMLImageElement
        && event.target.matches('.p3-print[data-selected] img')) sync({ progress: lastProgress })
    }
    stage.addEventListener('load', onImageLoad, true)
    return () => {
      context.revert()
      stage.removeEventListener('load', onImageLoad, true)
      stage.removeAttribute('data-ink-controls')
      stage.removeAttribute('data-ink-closing')
    }
  }, [fill, from, reduced])

  useLayoutEffect(() => {
    const stage = root.current
    if (!stage || reduced) return
    const update = () => {
      const { top, height } = stage.getBoundingClientRect()
      const p = Math.max(0, Math.min(1, 1 - top / Math.max(1, height)))
      const coverage = Math.abs(top) <= 2 ? 1 : Math.max(0, 1 - Math.abs(top) / Math.max(1, height))
      if (coverage > 0 && cloudScroll.current.coverage === 0) cloudScroll.current.visit++
      cloudScroll.current.coverage = coverage
      if (fill) stage.style.setProperty('--title-lift', `${-Math.max(0, top) / 2}px`)
      stage.style.setProperty('--arrival', String(p * p * (3 - 2 * p)))
      // Quint ease in-out for page 3's frame height (Rajesh, 27 Nov 2026; tried sine first).
      stage.style.setProperty('--arrival-frame', String(p < 0.5 ? 16 * p ** 5 : 1 - (-2 * p + 2) ** 5 / 2))
      // Page 3's clouds wait until the page has fully arrived (Rajesh, 27 Nov 2026).
      if (!fill) stage.toggleAttribute('data-arrived', p >= 0.995)
      stage.style.setProperty('--veil', String(Math.min(1, p * 5)))
      const reveal = Math.max(0, (p - .3) / .7)
      stage.style.setProperty('--story-reveal', String(reveal * reveal * (3 - 2 * reveal)))
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      stage.style.removeProperty('--arrival')
      stage.style.removeProperty('--title-lift')
      stage.style.removeProperty('--veil')
      stage.style.removeProperty('--story-reveal')
      stage.style.removeProperty('--arrival-frame')
      stage.removeAttribute('data-arrived')
    }
  }, [reduced, fill])

  useLayoutEffect(() => {
    const rail = strip.current
    const group = rail?.firstElementChild
    if (!rail || !group) return
    let span = 0
    const measure = () => {
      const width = parseFloat(getComputedStyle(group).width)
      if (span === width) return
      const phase = span ? (rail.scrollLeft % span) / span : 0
      span = width
      rail.scrollLeft = span * (1 + phase)
    }
    // Recenter on the same thumbnail before the native scroll reaches either end.
    const loopPosition = (x: number) => span && (x < span * .5 || x >= span * 2)
      ? span + ((x % span) + span) % span
      : x
    const wrap = () => {
      const x = rail.scrollLeft
      const next = loopPosition(x)
      if (next !== x) rail.scrollLeft = next
    }
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || !span) return
      event.preventDefault()
      event.stopPropagation()
      const d = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rail.clientWidth : 1
      rail.scrollLeft = loopPosition(rail.scrollLeft + d * unit)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(group)
    rail.addEventListener('wheel', wheel, { passive: false })
    rail.addEventListener('scroll', wrap, { passive: true })
    return () => {
      observer.disconnect()
      rail.removeEventListener('wheel', wheel)
      rail.removeEventListener('scroll', wrap)
    }
  }, [])

  useLayoutEffect(() => {
    const rail = strip.current
    if (!rail || reduced) return

    let frame = 0
    let previous = 0
    let remainder = 0
    let hovered = false
    let touching = false
    let resumeAt = 0
    function glide(time: number) {
      if (!rail) return
      const elapsed = previous ? Math.min(64, time - previous) : 0
      previous = time
      if (!hovered && !touching && time >= resumeAt && !rail.matches(':has(:focus-visible), :focus-visible')) {
        // Retain fractional travel on browsers that round scrollLeft to whole pixels.
        remainder += elapsed * 0.028
        const pixels = Math.floor(remainder)
        if (pixels) {
          rail.scrollLeft += pixels
          remainder -= pixels
        }
      }
      frame = requestAnimationFrame(glide)
    }
    const visibility = new IntersectionObserver(([entry]) => {
      cancelAnimationFrame(frame)
      previous = 0
      if (entry.isIntersecting) frame = requestAnimationFrame(glide)
    })
    const enter = (event: PointerEvent) => { hovered = event.pointerType === 'mouse' }
    const leave = () => { hovered = false }
    const touch = () => { touching = true }
    const release = (event: TouchEvent) => {
      touching = event.touches.length > 0
      resumeAt = performance.now() + 1200
    }
    visibility.observe(rail)
    rail.addEventListener('pointerenter', enter)
    rail.addEventListener('pointerleave', leave)
    rail.addEventListener('touchstart', touch, { passive: true })
    rail.addEventListener('touchend', release, { passive: true })
    rail.addEventListener('touchcancel', release, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      visibility.disconnect()
      rail.removeEventListener('pointerenter', enter)
      rail.removeEventListener('pointerleave', leave)
      rail.removeEventListener('touchstart', touch)
      rail.removeEventListener('touchend', release)
      rail.removeEventListener('touchcancel', release)
    }
  }, [reduced])

  function nextIndex(direction: number) {
    return (active + SLIDES.length + direction) % SLIDES.length
  }

  function onKey(event: KeyboardEvent) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    setPreview(null)
    const next = nextIndex(event.key === 'ArrowRight' ? 1 : -1)
    setActive(next)
    const button = thumbs.current[next]
    const rail = strip.current
    if (rail && button) {
      const right = button.offsetLeft + button.offsetWidth
      if (button.offsetLeft < rail.scrollLeft) rail.scrollLeft = button.offsetLeft
      else if (right > rail.scrollLeft + rail.clientWidth) rail.scrollLeft = right - rail.clientWidth
      button.focus({ preventScroll: true })
    }
  }

  return (
    <div ref={root} className="p3-stage" data-reduced={reduced || undefined} data-fill={fill || undefined} data-phase={fill ? (reduced ? 'done' : phase) : undefined}
      role="region" aria-label={fill ? 'Our story in six photographs' : 'Our story, framed photographs'} aria-roledescription="carousel"
      onKeyDown={onKey}>
      <div className="p3-atmosphere" aria-hidden="true" />
      {fill && !reduced && (
        <div className="p3-arrival-title" ref={arrivalTitle}>
          <span className="p3-arrival-echo p3-arrival-echo--top" aria-hidden="true">{ARRIVAL_TITLE}</span>
          <h2 className="p3-arrival-main">{ARRIVAL_TITLE}</h2>
          <span className="p3-arrival-echo p3-arrival-echo--bottom" aria-hidden="true">{ARRIVAL_TITLE}</span>
        </div>
      )}
      {!fill && <StoryFooterClouds scroll={cloudScroll} />}
      <div className="p3-handoff" aria-hidden="true">
        {RIBBONS.map((grains, layer) => (
          <div className="p3-pollen" key={layer}>
            {grains.map((style, i) => <i key={i} style={style} />)}
          </div>
        ))}
      </div>
      <div className="p3-layout">
        <div className="p3-caption" aria-live="polite" aria-atomic="true">
          <div className="p3-ornament" aria-hidden="true"><i /></div>
          <div key={slide.photo} className="p3-lettering">
            <h2>{title.join(' ')} <em>{lastWord}</em></h2>
            <p>{slide.note}</p>
          </div>
        </div>
        {fill && !reduced && <canvas ref={inkCanvas} className="p3-ink" aria-hidden="true" />}
        <div className="p3-gallery"
          onClick={fill ? undefined : (e) => {
            if ((e.target as Element).closest('.p3-print[data-selected]')) setViewer(shown)
          }}
          onPointerMove={fill || reduced ? undefined : (e) => {
            if (e.pointerType !== 'mouse') return
            const gallery = e.currentTarget
            const bounds = gallery.getBoundingClientRect()
            const x = (e.clientX - bounds.left) / bounds.width - .5
            const y = (e.clientY - bounds.top) / bounds.height - .5
            gallery.style.setProperty('--portrait-yaw', `${x * 5}deg`)
            gallery.style.setProperty('--portrait-pitch', `${-y * 4}deg`)
            gallery.style.setProperty('--gold-angle', `${135 + x * 100 + y * 30}deg`)
          }}
          onPointerLeave={fill || reduced ? undefined : (e) => {
            for (const name of ['--portrait-yaw', '--portrait-pitch', '--gold-angle'])
              e.currentTarget.style.removeProperty(name)
          }}
          onTouchStart={(e) => {
            touchStart.current = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null
          }}
          onTouchCancel={() => { touchStart.current = null }}
          onTouchEnd={(e) => {
            const start = touchStart.current
            touchStart.current = null
            if (!start) return
            const dx = e.changedTouches[0].clientX - start.x
            const dy = e.changedTouches[0].clientY - start.y
            if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) setActive(nextIndex(dx < 0 ? 1 : -1))
          }}>
          {SLIDES.map((s, i) => (
            <div key={s.photo} className="p3-print" data-wide={i === 4 || undefined} data-land={s.land || undefined}
              data-selected={i === shown || undefined} aria-hidden={i !== shown}
              role={!fill && i === shown ? 'button' : undefined} tabIndex={!fill && i === shown ? 0 : undefined}
              aria-label={!fill && i === shown ? `Open ${s.title} full screen` : undefined}
              onKeyDown={!fill && i === shown ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setViewer(i) }
              } : undefined}>
              <div className="p3-photo-window">
                {/* Wide screens (desktop, tablet held sideways) get the landscape picture; tall screens
                    (phones) get the portrait one. Only the matching file is downloaded. */}
                <picture>
                  {s.land && <source media="(min-aspect-ratio: 1/1)" srcSet={base + s.land} />}
                  <img src={base + s.photo} alt={s.alt} decoding="async" draggable={false} style={{ transformOrigin: s.focus, objectPosition: s.focus }} />
                </picture>
              </div>
              {i === 5 && shown === i && <i className="p3-glint" aria-hidden="true" />}
            </div>
          ))}
        </div>
        <nav ref={strip} className="p3-thumbs" data-lenis-prevent-horizontal tabIndex={-1} aria-label="Choose a memory"
          onPointerLeave={() => setPreview(null)}>
          {[0, 1, 2].map(copy => (
            <div className="p3-thumb-set" key={copy} aria-hidden={copy !== 1 || undefined}>
              {SLIDES.map((s, i) => (
                <button key={s.photo} type="button" tabIndex={copy === 1 ? 0 : -1}
                  ref={copy === 1 ? el => { thumbs.current[i] = el } : undefined}
                  onMouseDown={copy !== 1 ? e => e.preventDefault() : undefined}
                  aria-label={`Photo ${i + 1} of ${SLIDES.length}: ${s.title}`}
                  aria-current={i === active || undefined}
                  onPointerEnter={(e) => {
                    if (e.pointerType === 'mouse') setPreview(i)
                  }}
                  onClick={() => {
                    setActive(i)
                    if (copy !== 1) strip.current?.focus({ preventScroll: true })
                  }}>
                  <img src={base + s.photo} alt="" style={{ objectPosition: s.focus }} draggable={false} />
                </button>
              ))}
            </div>
          ))}
        </nav>
      </div>
      {viewer !== null && (
        <PhotoViewer slides={SLIDES} index={viewer} base={base}
          onIndex={(i) => { setViewer(i); setActive(i); setPreview(null) }}
          onClose={() => setViewer(null)}
          target={() => root.current?.querySelector<HTMLElement>('.p3-print[data-selected]') ?? null} />
      )}
    </div>
  )
}
