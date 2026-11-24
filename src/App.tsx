import { Hero } from './components/hero/Hero'
import { WorldCanvas } from './components/world/WorldCanvas'

export default function App() {
  return (
    <>
      <WorldCanvas />
      <main className="relative">
        <Hero nextId="page-2" />
        <section
          id="page-2"
          aria-label="Page 2"
          className="relative z-10 min-h-svh w-full bg-white text-ink"
        />
      </main>
    </>
  )
}
