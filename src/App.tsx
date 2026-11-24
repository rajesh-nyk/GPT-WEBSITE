import { Hero } from './components/hero/Hero'
import { WorldCanvas } from './components/world/WorldCanvas'

export default function App() {
  return (
    <>
      <WorldCanvas />
      <main className="relative">
        <Hero />
      </main>
    </>
  )
}
