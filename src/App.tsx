import { Suspense, lazy, useEffect, useState } from 'react'
import { Nav } from './components/Nav'
import { Hero } from './components/Hero'
import { Walk } from './components/Walk'
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
import { arriveAt, useRoute } from './lib/route'

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

/**
 * The account page, in its own chunk.
 *
 * Same reasoning as the two above and one more besides: the privacy list, the
 * counters and their stylesheet are only ever wanted by somebody who has
 * pressed Account, and a visitor who reads the landing page and leaves should
 * not download a line of it. The route is recognised without this file, so the
 * request is made when the page is actually opened. See src/account/README.md.
 */
const AccountPage = lazy(() => import('./account/AccountPage'))

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
    const hash = window.location.hash
    /*
     * Coming back to the exact place a card was clicked from — the home page,
     * and now the Store's index too, which is a page a reader leaves from a
     * card and returns to. Asked on EVERY route change rather than only on the
     * arms that can use the answer, because that call is also what lets the
     * memory die at the right moment: a reader who walks off mid-journey has
     * not returned to anything, and a memory that outlived its journey would
     * put the wrong name on the next page's Back control. See src/lib/route.ts.
     */
    const back = arriveAt(hash)

    if (
      route.kind === 'store' ||
      route.kind === 'app' ||
      route.kind === 'about' ||
      route.kind === 'account' ||
      showDev
    ) {
      if (back !== null) {
        window.scrollTo({ top: back, behavior: 'instant' })
        return
      }
      // INSTANT, not the document's own `scroll-behavior: smooth`: this is a page
      // change, and `auto` resolves to smooth here, so arriving at the Store
      // from halfway down the home page slid the new page up under you instead
      // of simply being at its top, which is what opening a page looks like.
      window.scrollTo({ top: 0, behavior: 'instant' })
      return
    }
    if (back !== null) {
      window.scrollTo({ top: back, behavior: 'instant' })
      return
    }
    const id = hash.replace(/^#/, '')
    if (!id || id.startsWith('/')) return
    /*
     * ONE legacy alias, and this is it.
     *
     * The Origin section was `#story` until the rename in 1.5.0 (August 2026).
     * Bookmarks, shared links and anything linking in from off this site still
     * carry the old fragment, and without this line they land at the top of the
     * hero with a hash in the address bar that means nothing — the worst answer
     * to "is there something here?", because it looks like the page simply
     * failed to move.
     *
     * **The hash is deliberately NOT rewritten.** Rule 8 of AGENTS.md is that
     * an unrecognised route renders home with the hash untouched, and the same
     * instinct holds one level down: silently editing the address bar of
     * somebody who followed their own bookmark is its own kind of surprise, and
     * it would also quietly rewrite the link they are about to copy back out.
     *
     * Not a table. `story` is the only id this site has ever renamed, and a
     * lookup map for one entry invites the next person to add a second without
     * asking whether the old link was ever real. If a second id is ever
     * renamed, write it here beside this one and say when.
     *
     * What it does NOT cover, deliberately: a hash edited to `#story` while
     * this tab is ALREADY showing home. That is a hashchange and not a route
     * change, so `same()` in lib/route.ts keeps the route object and nothing
     * re-runs this — the same reason clicking `#apps` from `#origin` is the
     * browser's scroll and not ours. Every way an old link actually arrives —
     * a bookmark, a shared URL, an external link, a `#story` reached from the
     * Store or an app page — is a document load or a real route change, and
     * all of those come through here. Closing the last case would mean a
     * hashchange listener of our own for one alias, which is more machinery
     * than the alias is worth.
     */
    const target = id === 'story' ? 'origin' : id
    document.getElementById(target)?.scrollIntoView()
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
          {/* `app` is the index or one app's own packs, and the router has
              already dropped an id the catalogue does not claim. */}
          <Store onOpenAuth={() => setAuthOpen(true)} app={route.app} />
        </main>
      ) : route.kind === 'about' ? (
        <main>
          <Suspense fallback={<div style={{ minHeight: '100vh' }} />}>
            <About />
          </Suspense>
        </main>
      ) : route.kind === 'account' ? (
        <main>
          {/* The chunk is local and small; the placeholder only stops the
              footer flying up to meet the nav for one frame. */}
          <Suspense fallback={<div style={{ minHeight: '100vh' }} />}>
            <AccountPage
              onOpenAuth={() => setAuthOpen(true)}
              onOpenFeedback={() => setFeedbackOpen(true)}
            />
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
          {/* Three sections, ONE backdrop. `Walk` is a wrapper rather than a
              section of its own: it owns the sticky 3D stage that has to paint
              behind all three, and the `margin-top: -100svh` that pulls this
              half of the page up onto the pinned hero. Both of those used to
              be `#origin`'s, and a `Stage` cannot outlive the section it is
              declared in — see Walk.tsx and CONTRACT W in
              internal/checklists/cabin-interior-spec.md.

              The three children keep their own ids, their own copy and their
              own place in the nav. Nothing about `#origin`'s document position
              changed, so `arriveAt` and the section anchors are untouched. */}
          <Walk>
            <Origin />
            <Apps />
            <Tools />
          </Walk>
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
