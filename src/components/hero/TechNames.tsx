import TechText from '../TechText'

/**
 * The home-screen names drawn with React Bits TechText, in the site's current heading
 * font (Bodoni Moda, same weight, tracking and gold). It's a canvas, so the real names
 * stay in the <h1> for screen readers and search (visually hidden), and this is aria-hidden.
 * TechText draws one line in one font: the italic ampersand of the HTML heading becomes
 * a Bodoni "&". Effect only on hover (no automatic sweep).
 * Approved and locked by Rajesh on 22 Nov 2026.
 */
export function TechNames() {
  return (
    <div aria-hidden className="hero-tech-names">
      <TechText
        text="RAJESH & CHINMAYEE"
        fontFamily='"Bodoni Moda Variable", "Bodoni Moda", Didot, Georgia, serif'
        fontWeight={420}
        fontSize={78}
        letterSpacing={0.14}
        color="#efd398"
        accentColor="#f5c453"
        sweep={false}
        draggable={false}
        // Click jump: slow-fast-slow hop (ease-in-out), no wobble.
        hop={0.9}
      />
    </div>
  )
}
