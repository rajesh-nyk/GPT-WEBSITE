import { Hero } from './components/hero/Hero'
import { WorldCanvas } from './components/world/WorldCanvas'
import { CloudTransition } from './components/world/CloudTransition'

export default function App() {
  return (
    <>
      <WorldCanvas />
      <main className="relative">
        <Hero nextId="page-2" />
        <section
          id="page-2"
          aria-label="Page 2"
          className="relative z-10 min-h-dvh w-full bg-white text-ink"
        />
      </main>
      <CloudTransition />
    </>
  )
}
