import { DiagonalWipe } from './DiagonalWipe'
import { PageTwoGanesha } from './world/PageTwoGanesha'
import { PageTwoSky, skyWipe } from './world/PageTwoSky'

export function SlicedPageTwo() {
  return (
    <section id="page-2" data-scroll-scene="" aria-label="Page 2" className="chapter-panel chapter-panel--sliced z-10 h-dvh w-full text-gold-light">
      <div className="page-two-stage relative h-full">
        <DiagonalWipe from="hero" geometry={skyWipe}>
          <PageTwoSky />
          <div className="page-glass" />
        </DiagonalWipe>
        <PageTwoGanesha />
      </div>
    </section>
  )
}
