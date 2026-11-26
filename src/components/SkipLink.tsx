/** First Tab stop on the page: jumps keyboard and screen-reader users past the hero to page 2. */
export function SkipLink({ href = '#content' }: { href?: string }) {
  return (
    <a
      href={href}
      className="fixed top-3 left-3 z-[60] -translate-y-[200%] rounded-full bg-ink px-5 py-3 text-sm font-medium text-gold-light ring-1 ring-gold/60 focus-visible:translate-y-0"
    >
      Skip to content
    </a>
  )
}
