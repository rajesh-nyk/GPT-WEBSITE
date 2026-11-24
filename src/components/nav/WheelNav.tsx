import { useEffect, useRef, useState } from 'react'
import { VISIBLE_CHAPTERS as CHAPTERS, type ChapterId } from '../../content/wedding'
import { useLenis } from '../../lib/LenisProvider'
import { useReducedMotion } from '../../lib/useReducedMotion'
import { snapJourney } from '../world/journey'
import { scrollHold } from '../world/scrollHold'

/**
 * THE WHEEL AS NAVIGATION.
 *
 * Compact (top-right, after the hero): a small Konark wheel. Its eight spokes are the
 * eight chapters — the current one is lit in gold — and a fine arc around the rim fills
 * with your progress through the site, like the sundial's shadow.
 *
 * Open: the wheel fills the screen beside the chapter list. Hovering / focusing a chapter
 * turns the wheel so that chapter's spoke points at it. Choosing one: the menu goes
 * fully dark, the page and the 3D world jump there together (so no half-played animation
 * is ever seen), then the menu lifts.
 *
 * Accessibility: a real button + dialog; Esc closes; focus moves into the list and back
 * to the button; the current chapter is marked aria-current.
 */
const SPOKES = 8
const spokeAngle = (i: number) => (i / SPOKES) * 360 - 90 // spoke 0 points up

function Wheel({ size, active, progress, turn = 0 }: { size: number; active: number; progress?: number; turn?: number }) {
  const c = 50
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden className="wnav-wheel">
      {progress !== undefined && (
        <>
          <circle cx={c} cy={c} r="48" className="wnav-track" />
          <circle
            cx={c}
            cy={c}
            r="48"
            pathLength={1}
            transform="rotate(-90 50 50)"
            className="wnav-progress"
            style={{ strokeDashoffset: 1 - progress }}
          />
        </>
      )}
      <g style={{ transform: `rotate(${turn}deg)`, transformOrigin: '50% 50%' }} className="wnav-turn">
        <circle cx={c} cy={c} r="42" className="wnav-rim" />
        <circle cx={c} cy={c} r="34" className="wnav-rim wnav-rim--in" />
        <circle cx={c} cy={c} r="7" className="wnav-hub" />
        {Array.from({ length: SPOKES }, (_, i) => {
          const a = (spokeAngle(i) * Math.PI) / 180
          return (
            <line
              key={i}
              x1={c + Math.cos(a) * 7}
              y1={c + Math.sin(a) * 7}
              x2={c + Math.cos(a) * 34}
              y2={c + Math.sin(a) * 34}
              className={i === active ? 'wnav-spoke is-active' : 'wnav-spoke'}
            />
          )
        })}
      </g>
    </svg>
  )
}

export function WheelNav() {
  const lenis = useLenis()
  const reducedMotion = useReducedMotion()
  const [visible, setVisible] = useState(false)
  const [current, setCurrent] = useState(0)
  const [progress, setProgress] = useState(0)
  const [open, setOpen] = useState(false)
  const [focusIdx, setFocusIdx] = useState<number | null>(null)
  const [phase, setPhase] = useState<'idle' | 'jumping'>('idle')
  const toggle = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLOListElement>(null)

  // Where are we? (one rAF-throttled scroll listener)
  useEffect(() => {
    let raf = 0
    const measure = () => {
      raf = 0
      const y = window.scrollY
      const vh = window.innerHeight
      const max = document.documentElement.scrollHeight - vh
      const hero = document.getElementById('hero')
      setVisible(!!hero && y > hero.offsetHeight * 0.85)
      setProgress(max > 0 ? Math.min(1, Math.max(0, y / max)) : 0)
      let idx = 0
      CHAPTERS.forEach((c, i) => {
        const el = document.getElementById(c.id)
        if (el && el.getBoundingClientRect().top <= vh * 0.45) idx = i
      })
      setCurrent(idx)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])

  // Open / close: lock the page, move focus, Esc to close, keep Tab inside.
  useEffect(() => {
    if (!open) return
    lenis?.stop()
    document.documentElement.style.overflow = 'hidden'
    const first = list.current?.querySelectorAll<HTMLButtonElement>('button')[current]
    first?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
      if (e.key === 'Tab') {
        const f = [...document.querySelectorAll<HTMLElement>('#chapter-menu button')]
        const i = f.indexOf(document.activeElement as HTMLElement)
        if (e.shiftKey && i <= 0) {
          e.preventDefault()
          f[f.length - 1]?.focus()
        } else if (!e.shiftKey && i === f.length - 1) {
          e.preventDefault()
          f[0]?.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.documentElement.style.overflow = ''
      lenis?.start()
    }
  }, [open, lenis, current])

  const close = (returnFocus = true) => {
    setOpen(false)
    setFocusIdx(null)
    if (returnFocus) requestAnimationFrame(() => toggle.current?.focus({ preventScroll: true }))
  }

  const go = (id: ChapterId) => {
    const el = document.getElementById(id)
    if (!el) return
    setPhase('jumping') // the menu turns fully dark first
    window.setTimeout(
      () => {
        scrollHold.bypass = true
        if (lenis) lenis.scrollTo(el, { immediate: true, force: true })
        else window.scrollTo(0, el.offsetTop)
        requestAnimationFrame(() => {
          snapJourney()
          history.replaceState(null, '', `#${id}`)
          setPhase('idle')
          close(false)
          el.focus({ preventScroll: true })
        })
      },
      reducedMotion ? 0 : 280,
    )
  }

  const shown = focusIdx ?? current
  const turn = -(spokeAngle(shown) - 0) // the chosen spoke points right, at the list

  return (
    <>
      <button
        ref={toggle}
        type="button"
        className="wnav-toggle"
        data-visible={visible || open}
        aria-expanded={open}
        aria-controls="chapter-menu"
        aria-label={`Chapters. Now: ${CHAPTERS[current].label}, ${current + 1} of ${CHAPTERS.length}`}
        onClick={() => (open ? close() : setOpen(true))}
        tabIndex={visible || open ? 0 : -1}
      >
        <span className="wnav-label" aria-hidden>
          <span className="wnav-num font-inscription">{String(current + 1).padStart(2, '0')}</span>
          <span className="wnav-name font-inscription">{CHAPTERS[current].label}</span>
        </span>
        <Wheel size={52} active={current} progress={progress} />
      </button>

      <div
        id="chapter-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Chapters"
        className="wnav-menu"
        data-open={open}
        data-phase={phase}
        inert={!open}
      >
        <div className="wnav-menu-inner">
          <div className="wnav-big" aria-hidden>
            <Wheel size={520} active={shown} turn={turn} />
          </div>
          <nav aria-label="Chapters">
            <ol ref={list} className="wnav-list">
              {CHAPTERS.map((c, i) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="wnav-item"
                    aria-current={i === current ? 'step' : undefined}
                    onMouseEnter={() => setFocusIdx(i)}
                    onFocus={() => setFocusIdx(i)}
                    onClick={() => go(c.id)}
                  >
                    <span className="wnav-item-num font-inscription">{String(i + 1).padStart(2, '0')}</span>
                    <span className="wnav-item-label font-inscription">{c.label}</span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        </div>
        <button type="button" className="wnav-close font-inscription" onClick={() => close()}>
          Close
        </button>
      </div>
    </>
  )
}
