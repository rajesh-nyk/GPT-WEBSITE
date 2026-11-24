/** First Tab stop on the page: jumps keyboard and screen-reader users past the hero. */
export function SkipLink({ href = '#content' }: { href?: string }) {
  return (
    <a
      href={href}
      className="fixed top-3 left-3 z-[60] -translate-y-[200%] rounded-full bg-white px-5 py-3 text-sm font-medium text-black focus-visible:translate-y-0"
    >
      Skip to content
    </a>
  )
}
