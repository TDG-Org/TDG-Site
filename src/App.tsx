import { Nav } from './components/Nav'
import { Hero } from './components/Hero'
import { Story } from './components/Story'
import { Apps } from './components/Apps'
import { Tools } from './components/Tools'
import { Building } from './components/Building'
import { Faith } from './components/Faith'
import { Outro } from './components/Outro'
import { Footer } from './components/Footer'
import { Cursor } from './components/Cursor'
import { useOffscreenPause } from './hooks/useOffscreenPause'

export default function App() {
  useOffscreenPause()

  return (
    <div className="page">
      <Nav />
      <main>
        <Hero />
        <Story />
        <Apps />
        <Tools />
        <Building />
        <Faith />
        <Outro />
      </main>
      <Footer />
      <Cursor />
    </div>
  )
}
