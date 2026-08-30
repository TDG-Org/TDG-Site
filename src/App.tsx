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
import { landOnAnchor, scrollToAnchor, sectionIdFromHash } from './lib/anchors'

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

/**
 * Somebody else's account, in its own chunk.
 *
 * Same reasoning again, and one more besides: this page is opened from a
 * search result or from a link somebody sent, and a visitor who never opens
 * one should not download the profile's read, its hook or its stylesheet. The
 * route is recognised without this file — a handle is not in any catalogue, so
 * `route.ts` needs nothing from here to parse it. See src/people/README.md.
 */
const ProfilePage = lazy(() => import('./people/ProfilePage'))

export default function App() {
  useOffscreenPause()
  const { oauthError, recovery, setup, isAdmin } = useAuth()
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

  /*
   * A provider redirect (e.g. GitHub/Google) or a clicked password-reset
   * link can land back here with the modal unmounted, so reopen it and give
   * AuthModal a chance to show the error or the reset-password form.
   *
   * `setup` joins them because it is the same kind of event: a redirect that
   * came back and left something unfinished. It is the ONLY thing that tells
   * somebody a Google sign-up did not collect a username or a password — the
   * redirect itself looks exactly like a completed sign-up — so it opens the
   * form rather than waiting to be found.
   *
   * It fires when `setup` goes null → non-null, which is the moment the answer
   * arrives, so it opens once per load and a dismissal sticks for that visit.
   * The account menu keeps a Finish Setting Up door for afterwards, and the
   * Account page shows the same gap in its own words; a form that reopened on
   * every render would be a wall, not a prompt.
   */
  useEffect(() => {
    if (oauthError || recovery || setup) setAuthOpen(true)
  }, [oauthError, recovery, setup])

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
      route.kind === 'profile' ||
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
    /*
     * A page opened AT a section is simply THERE, so `instant` — the document's
     * own `scroll-behavior: smooth` would otherwise slide the whole page up
     * under the reader, which is what opening a page must not look like.
     *
     * `sectionIdFromHash` resolves the one legacy alias this site has, `#story`
     * → `#origin`, and `scrollToAnchor` decides the landing. **The hash itself
     * is deliberately NOT rewritten**: rule 8 of AGENTS.md is that an
     * unrecognised route renders home with the hash untouched, and the same
     * instinct holds one level down — silently editing the address bar of
     * somebody who followed their own bookmark is its own kind of surprise, and
     * it would quietly rewrite the link they are about to copy back out.
     */
    const id = sectionIdFromHash(hash)
    if (!id) return
    // Not one scroll but a landing that survives the page finishing loading —
    // see `landOnAnchor`. It hands back a cleanup because a reader who routes
    // away mid-load must not be pulled back to a section they have left.
    return landOnAnchor(id) ?? undefined
  }, [route, showDev])

  /*
   * The same landing, for an anchor followed WITHOUT a route change.
   *
   * Clicking `#apps` in the nav while already reading the home page is a
   * hashchange and not a route change — `same()` in lib/route.ts keeps the
   * route object on purpose, so the effect above does not re-run and the scroll
   * was the browser's own. That is exactly the scroll this change exists to
   * replace: it lands the section's BOX top, which on the cabin walk is up to
   * 452px of camera padding above the heading somebody clicked for.
   *
   * `smooth`, unlike the arrival above: the reader is already on this page and
   * a jump would lose them the sense of where they went. Not a scroll listener
   * — rule 9 forbids those, and this fires once per anchor followed.
   *
   * It also closes the one case the alias note above used to exclude: a hash
   * edited to `#story` while the tab is already showing home now resolves like
   * every other way of arriving at it, because the listener that was "more
   * machinery than the alias is worth" is here anyway for the headings.
   */
  useEffect(() => {
    const onHash = () => {
      const id = sectionIdFromHash(window.location.hash)
      if (id) scrollToAnchor(id, 'smooth')
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

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
      ) : route.kind === 'profile' ? (
        <main>
          {/* The chunk is local and small; the placeholder only stops the
              footer flying up to meet the nav for one frame. */}
          <Suspense fallback={<div style={{ minHeight: '100vh' }} />}>
            {/* Keyed on the handle so following one profile to another
                REMOUNTS rather than re-running effects inside a page still
                holding the previous person's read. Two profiles are two
                pages; `same()` in lib/route.ts already keeps them apart at
                the route level, and this keeps them apart at the component. */}
            <ProfilePage
              key={route.username}
              username={route.username}
              onOpenAuth={() => setAuthOpen(true)}
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
