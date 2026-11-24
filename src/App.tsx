import { Hero } from './components/hero/Hero'
import { WorldCanvas } from './components/world/WorldCanvas'
import { CloudPassage } from './components/world/CloudPassage'

export default function App() {
  return (
    <>
      <WorldCanvas />
      <main className="relative">
        <Hero nextId="page-2" />
        <section
          id="page-2"
          aria-label="Page 2"
          className="relative z-10 min-h-dvh w-full text-gold-light"
        />
      </main>
      <CloudPassage />
      <output id="scene-fps" className="scene-fps" aria-label="WebGL frames per second">-- FPS</output>
    </>
  )
}
