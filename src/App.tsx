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
import { ErrorBoundary } from './components/ErrorBoundary'
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
 * The eleven pages are a lot of prose, and a visitor who reads the landing page
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
  /**
   * Which app a `#/feedback/<app>` arrival is about, held for as long as the
   * dialog is open.
   *
   * Kept here rather than read from the route at submit time, because the hash
   * is put back to home the moment the dialog opens — see the effect below —
   * so by the time somebody presses Send there is nothing left in it to read,
   * and the report would file itself under this site.
   */
  const [feedbackApp, setFeedbackApp] = useState<string | undefined>(undefined)
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
  /*
   * Keyed on WHETHER setup is outstanding, not on the object. `readSetup`
   * builds a fresh object on every auth event — each profile save, each
   * hourly token refresh — so keyed on the object this reopened the form over
   * a half-built account every time it saved a field on #/account, and once
   * an hour on any page. The boolean only changes when the answer does.
   */
  const needsSetup = setup !== null
  useEffect(() => {
    if (oauthError || recovery || needsSetup) setAuthOpen(true)
  }, [oauthError, recovery, needsSetup])

  /*
   * `#/feedback` and `#/feedback/<app>`: the address our OTHER apps point at.
   *
   * Several of ours have no sign-in of their own — MARANATHA, N8-Tools,
   * VidHelper, Say2Quill, the Socials tracker — so they cannot carry a feedback
   * form: a report needs an account for the reply to have anywhere to go. Their
   * Send Feedback opens this instead, and the segment is what files the report
   * against the app the reader was actually using.
   *
   * It opens the dialog over HOME rather than being a page of its own, because
   * feedback is a dialog everywhere else on this site and a second, page-shaped
   * one would be a different thing wearing the same name.
   *
   * **The hash is replaced immediately, and that is not tidiness.** Left in
   * place it would reopen the form on every refresh and on every Back that
   * lands here — including the Back somebody presses right after sending — and
   * `replaceState` rather than a push keeps that Back going where the reader
   * expects rather than into a dialog they have already dealt with. The app id
   * moves into state in the same breath, which is why `feedbackApp` exists.
   */
  useEffect(() => {
    if (route.kind !== 'feedback') return
    setFeedbackApp(route.app)
    setFeedbackOpen(true)
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    /*
     * And then SAY the hash changed, because `replaceState` does not.
     *
     * Without this the router's state stays on `feedback` while the address bar
     * says home, and `same()` in lib/route.ts then swallows the next arrival:
     * two feedback routes are the same route unless they name different apps,
     * so a second press of the same Send Feedback link — closing the dialog and
     * opening it again, which is one press in another app of ours — produced a
     * hashchange that changed nothing, and the form did not reopen. Found by
     * driving `#/feedback` and then `#/feedback/<bad id>` in one page load:
     * the second one left the hash sitting in the address bar and no dialog.
     *
     * Telling the router to re-read settles it on `home`, which is what the
     * address now says, so the next `#/feedback` is a real change again. The
     * listener reads `window.location.hash` rather than the event, so a bare
     * Event carries everything it needs.
     */
    window.dispatchEvent(new Event('hashchange'))
  }, [route])

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

    // Returning to the exact place a card was clicked from beats everything
    // else, on a page and on home alike: the reader asked for Back, not for a
    // section.
    if (back !== null) {
      window.scrollTo({ top: back, behavior: 'instant' })
      return
    }

    const routedPage =
      route.kind === 'store' ||
      route.kind === 'app' ||
      route.kind === 'about' ||
      route.kind === 'account' ||
      route.kind === 'profile' ||
      showDev

    /*
     * A page opened AT a section is simply THERE, so `instant` — the document's
     * own `scroll-behavior: smooth` would otherwise slide the whole page up
     * under the reader, which is what opening a page must not look like.
     *
     * `sectionIdFromHash` answers for both shapes: a bare `#origin` on the home
     * page (resolving the one legacy alias, `#story`), and a ROUTE naming a
     * place on the page it opens — `#/store?to=cloud-plans`, which is what the
     * other TDG apps link their Cloud buttons at. `scrollToAnchor` decides the
     * landing. **The hash itself is deliberately NOT rewritten**: rule 8 of
     * AGENTS.md is that an unrecognised route renders home with the hash
     * untouched, and the same instinct holds one level down — silently editing
     * the address bar of somebody who followed their own bookmark is its own
     * kind of surprise, and it would quietly rewrite the link they are about to
     * copy back out.
     *
     * Not one scroll but a landing that survives the page finishing loading —
     * see `landOnAnchor`. It hands back a cleanup because a reader who routes
     * away mid-load must not be pulled back to a section they have left, and
     * NULL when the page has no such section: a `to` naming nothing costs a
     * routed page nothing but its own top, which is where it was going anyway.
     */
    const id = sectionIdFromHash(hash)
    const landed = id ? landOnAnchor(id) : null
    if (landed) return landed

    if (routedPage) {
      // INSTANT, not the document's own `scroll-behavior: smooth`: this is a page
      // change, and `auto` resolves to smooth here, so arriving at the Store
      // from halfway down the home page slid the new page up under you instead
      // of simply being at its top, which is what opening a page looks like.
      window.scrollTo({ top: 0, behavior: 'instant' })
    }
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
      <Nav onOpenAuth={() => setAuthOpen(true)} onOpenFeedback={() => { setFeedbackApp(undefined); setFeedbackOpen(true) }} />
      {/* Every page renders inside an ErrorBoundary, keyed on the route, so a
          lazy chunk that is no longer on the server after a deploy — or a page
          that throws while drawing — gets a face and a Reload button instead
          of taking the root down with it. See components/ErrorBoundary.tsx.
          The fallback `div` only stops the footer flying up to meet the nav
          for the frame or two before a chunk lands; base.css has its floor. */}
      {showDev ? (
        <main>
          <ErrorBoundary key="dev">
            <Suspense fallback={<div className="page-fallback" />}>
              <DevConsole />
            </Suspense>
          </ErrorBoundary>
        </main>
      ) : route.kind === 'store' ? (
        <main>
          {/* `app` is the index or one app's own packs, and the router has
              already dropped an id the catalogue does not claim. */}
          <ErrorBoundary key={`store:${route.app ?? ''}`}>
            <Store onOpenAuth={() => setAuthOpen(true)} app={route.app} />
          </ErrorBoundary>
        </main>
      ) : route.kind === 'about' ? (
        <main>
          <ErrorBoundary key="about">
            <Suspense fallback={<div className="page-fallback" />}>
              <About />
            </Suspense>
          </ErrorBoundary>
        </main>
      ) : route.kind === 'account' ? (
        <main>
          <ErrorBoundary key="account">
            <Suspense fallback={<div className="page-fallback" />}>
              <AccountPage
                onOpenAuth={() => setAuthOpen(true)}
                onOpenFeedback={() => { setFeedbackApp(undefined); setFeedbackOpen(true) }}
              />
            </Suspense>
          </ErrorBoundary>
        </main>
      ) : route.kind === 'profile' ? (
        <main>
          <ErrorBoundary key={`user:${route.username}`}>
            <Suspense fallback={<div className="page-fallback" />}>
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
          </ErrorBoundary>
        </main>
      ) : route.kind === 'app' ? (
        <main>
          <ErrorBoundary key={`app:${route.slug}`}>
            <Suspense fallback={<div className="page-fallback" />}>
              <AppPage slug={route.slug} />
            </Suspense>
          </ErrorBoundary>
        </main>
      ) : (
        <main>
          <ErrorBoundary key="home">
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
          </ErrorBoundary>
        </main>
      )}
      <Footer />
      <Cursor />
      <AuthModal open={authOpen} initialTab="login" onClose={() => setAuthOpen(false)} />
      <FeedbackDialog
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        onOpenAuth={() => setAuthOpen(true)}
        app={feedbackApp}
      />
      {/* Renders nothing until a developer's reply is actually waiting. */}
      <ReplyInbox />
    </div>
  )
}
