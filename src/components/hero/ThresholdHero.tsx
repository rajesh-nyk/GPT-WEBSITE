import { useRef } from 'react'
import { CEREMONIES } from '../../content/wedding'
import { useJourneySegment } from '../world/journey'
import './threshold.css'

export function ThresholdHero(){
  const section=useRef<HTMLElement>(null)
  useJourneySegment(section,0)
  return <section id="hero" ref={section} className="threshold-hero">
    <nav aria-label="Wedding invitation"><a href="#story">Story</a><a href="#ceremonies">Ceremonies</a><a href="#venues">Venue</a></nav>
    <div className="threshold-copy">
      <span lang="or">ଶୁଭ ବିବାହ</span>
      <h1>Rajesh Nayak &amp;<br/>Chinmayee Patel</h1>
      <p>An Odia Wedding</p>
      <ul id="ceremonies">{Object.values(CEREMONIES).map((c,i)=><li key={c.id}><time dateTime={c.iso}>{c.dayMonth} 2027</time><span id={i===0?'venues':undefined}>{c.place.split(',')[0]}</span><small className="sr-only">{c.name}</small></li>)}</ul>
      <a className="threshold-enter" href="#blessing">Enter the mandap <span aria-hidden="true">→</span></a>
    </div>
    <a href="#story" className="threshold-story">Our Story <span aria-hidden="true">⌄</span></a>
  </section>
}
