import { Suspense, lazy, useEffect, useState } from 'react'
import { Nav } from './components/Nav'
import { Hero } from './components/Hero'
import { Origin } from './components/Origin'
import { Apps } from './components/Apps'
import { Tools } from './components/Tools'
import { Building } from './components/Building'
import { Faith } from './components/Faith'
import { Outro } from './components/Outro'
import { Footer } from './components/Footer'
import { Cursor } from './components/Cursor'
import { Store } from './components/Store'
import { AuthModal } from './components/AuthModal'
import { FeedbackDialog } from './feedback/FeedbackDialog'
import { ReplyInbox } from './feedback/ReplyInbox'
import { useAuth } from './auth/AuthProvider'
import { useOffscreenPause } from './hooks/useOffscreenPause'
import { storeShelfId, takeOrigin, useRoute } from './lib/route'

/**
 * The Developer console, in its own chunk.
 *
 * A static `import` would put every panel, label and table name of it into the
 * bundle every visitor downloads. This way the request is only ever made by a
 * browser that has already been told, by the shared `profiles` table, that it
 * is signed in as a TDG developer.
 *
 * That is tidiness, not a lock. The lock is that every read and write the
 * console makes goes through a Postgres function that refuses a non-admin.
 * See src/dev/README.md.
 */
const DevConsole = lazy(() => import('./dev/DevConsole'))

/**
 * An app's own page, in its own chunk.
 *
 * The ten pages are a lot of prose, and a visitor who reads the landing page
 * and leaves should not download a word of it. The router recognises the
 * routes without this file, from the cards themselves, so the request is only
 * made once somebody actually opens a card. See src/lib/route.ts.
 */
const AppPage = lazy(() => import('./components/AppPage'))

/** About, in its own chunk for the same reason: prose nobody has asked for. */
const About = lazy(() => import('./components/About'))

export default function App() {
  useOffscreenPause()
  const { oauthError, recovery, isAdmin } = useAuth()
  const [authOpen, setAuthOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const route = useRoute()

  /*
   * `#/dev` for anybody else behaves EXACTLY like `#/banana`: it renders the
   * home page and leaves the hash alone. Not a "restricted" notice, and not a
   * redirect. Both of those answer the question "is there something here?",
   * and the answer a stranger should get is the one an unknown anchor gets.
   */
  const showDev = route.kind === 'dev' && isAdmin

  // A provider redirect (e.g. GitHub/Google) or a clicked password-reset
  // link can land back here with the modal unmounted, so reopen it and give
  // AuthModal a chance to show the error or the reset-password form.
  useEffect(() => {
    if (oauthError || recovery) setAuthOpen(true)
  }, [oauthError, recovery])

  // Leaving or entering a page swaps the whole document, and the browser has
  // already done whatever it was going to do with the hash by the time React
  // renders the new one, so a section anchor clicked FROM the Store points at
  // an element that did not exist when it was clicked. Effects run after the
  // commit, so by here it does.
  useEffect(() => {
    if (route.kind === 'store' || route.kind === 'app' || route.kind === 'about' || showDev) {
      // A page can be opened AT something rather than at its top. `#/store/veditor`
      // is a link that already named the shelf, and landing its reader at the
      // top of a shop with somebody else's shelf on it makes them do the
      // finding twice. `scroll-margin-top` on the target is what keeps it clear
      // of the fixed nav; see Store.css.
      const at = route.kind === 'store' && route.app ? storeShelfId(route.app) : null
      const target = at ? document.getElementById(at) : null
      if (target) {
        target.scrollIntoView({ behavior: 'instant', block: 'start' })
        return
      }
      // INSTANT, not the document's own `scroll-behavior: smooth`: this is a page
      // change, and `auto` resolves to smooth here, so arriving at the Store
      // from halfway down the home page slid the new page up under you instead
      // of simply being at its top, which is what opening a page looks like.
      window.scrollTo({ top: 0, behavior: 'instant' })
      return
    }
    const hash = window.location.hash
    // Coming back from an app page, to the exact place the card was clicked
    // from. Only when the hash is the one that was left: somebody who leaves an
    // app page by clicking Origin in the nav is not returning to the list, and
    // this must not land on top of their anchor. See src/lib/route.ts.
    const y = takeOrigin(hash)
    if (y !== null) {
      window.scrollTo({ top: y, behavior: 'instant' })
      return
    }
    const id = hash.replace(/^#/, '')
    if (!id || id.startsWith('/')) return
    document.getElementById(id)?.scrollIntoView()
  }, [route, showDev])

  return (
    <div className="page">
      <Nav onOpenAuth={() => setAuthOpen(true)} onOpenFeedback={() => setFeedbackOpen(true)} />
      {showDev ? (
        <main>
          {/* The chunk is local and small; the placeholder only stops the
              footer flying up to meet the nav for one frame. */}
          <Suspense fallback={<div style={{ minHeight: '100vh' }} />}>
            <DevConsole />
          </Suspense>
        </main>
      ) : route.kind === 'store' ? (
        <main>
          <Store onOpenAuth={() => setAuthOpen(true)} />
        </main>
      ) : route.kind === 'about' ? (
        <main>
          <Suspense fallback={<div style={{ minHeight: '100vh' }} />}>
            <About />
          </Suspense>
        </main>
      ) : route.kind === 'app' ? (
        <main>
          {/* The chunk is local and small; the placeholder only stops the
              footer flying up to meet the nav for one frame. */}
          <Suspense fallback={<div style={{ minHeight: '100vh' }} />}>
            <AppPage slug={route.slug} />
          </Suspense>
        </main>
      ) : (
        <main>
          <Hero />
          <Origin />
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
      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      {/* Renders nothing until a developer's reply is actually waiting. */}
      <ReplyInbox />
    </div>
  )
}
