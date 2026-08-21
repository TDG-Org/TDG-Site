import { useEffect, useState } from 'react'
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
import { Store } from './components/Store'
import { AuthModal } from './components/AuthModal'
import { useAuth } from './auth/AuthProvider'
import { useOffscreenPause } from './hooks/useOffscreenPause'
import { useRoute } from './lib/route'

export default function App() {
  useOffscreenPause()
  const { oauthError, recovery } = useAuth()
  const [authOpen, setAuthOpen] = useState(false)
  const route = useRoute()

  // A provider redirect (e.g. GitHub/Google) or a clicked password-reset
  // link can land back here with the modal unmounted — reopen it so
  // AuthModal has a chance to show the error or the reset-password form.
  useEffect(() => {
    if (oauthError || recovery) setAuthOpen(true)
  }, [oauthError, recovery])

  // Leaving or entering the Store swaps the whole page, and the browser has
  // already done whatever it was going to do with the hash by the time React
  // renders the new one — so a section anchor clicked FROM the Store points at
  // an element that did not exist when it was clicked. Effects run after the
  // commit, so by here it does.
  useEffect(() => {
    if (route === 'store') {
      // INSTANT, not the document's own `scroll-behavior: smooth`: this is a page
      // change, and `auto` resolves to smooth here — so arriving at the Store
      // from halfway down the home page slid the new page up under you instead
      // of simply being at its top, which is what opening a page looks like.
      window.scrollTo({ top: 0, behavior: 'instant' })
      return
    }
    const id = window.location.hash.replace(/^#/, '')
    if (!id || id.startsWith('/')) return
    document.getElementById(id)?.scrollIntoView()
  }, [route])

  return (
    <div className="page">
      <Nav onOpenAuth={() => setAuthOpen(true)} />
      {route === 'store' ? (
        <main>
          <Store onOpenAuth={() => setAuthOpen(true)} />
        </main>
      ) : (
        <main>
          <Hero />
          <Story />
          <Apps />
          <Tools />
          <Building />
          <Faith />
          <Outro />
        </main>
      )}
      <Footer />
      <Cursor />
      <AuthModal open={authOpen} initialTab="login" onClose={() => setAuthOpen(false)} />
    </div>
  )
}
