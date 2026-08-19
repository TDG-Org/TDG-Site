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
import { AuthModal } from './components/AuthModal'
import { useAuth } from './auth/AuthProvider'
import { useOffscreenPause } from './hooks/useOffscreenPause'

export default function App() {
  useOffscreenPause()
  const { oauthError, recovery } = useAuth()
  const [authOpen, setAuthOpen] = useState(false)

  // A provider redirect (e.g. GitHub/Google) or a clicked password-reset
  // link can land back here with the modal unmounted — reopen it so
  // AuthModal has a chance to show the error or the reset-password form.
  useEffect(() => {
    if (oauthError || recovery) setAuthOpen(true)
  }, [oauthError, recovery])

  return (
    <div className="page">
      <Nav onOpenAuth={() => setAuthOpen(true)} />
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
      <AuthModal open={authOpen} initialTab="login" onClose={() => setAuthOpen(false)} />
    </div>
  )
}
