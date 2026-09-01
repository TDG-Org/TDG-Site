import { useEffect, useRef, useState } from 'react'
import { onFrame } from '../lib/motion'
import { useTheme } from '../theme/ThemeProvider'
import { useAuth } from '../auth/AuthProvider'
import { useMyBadges } from '../badges/useBadges'
import { NAV_LINKS } from '../data/content'
import { useAccountStats } from '../account/useAccount'
import { fmtCount, fmtDay } from '../account/format'
import { useRoute, ABOUT_HASH, ACCOUNT_HASH, STORE_HASH, DEV_HASH, type Route } from '../lib/route'
import { setDevMode, useDevMode } from '../dev/devMode'
import './Nav.css'

/**
 * The Developer tab, appended to the nav for a signed-in TDG developer with
 * Developer Mode on, and for nobody else, ever.
 *
 * It is not in NAV_LINKS because that array is the site's public navigation and
 * is read by everything; this is one link with two conditions on it. Hiding it
 * is tidiness rather than security: `#/dev` renders the home page for anybody
 * who is not a developer, and the console's data all comes from Postgres
 * functions that refuse them. See src/dev/README.md.
 */
const DEV_LINK = { href: DEV_HASH, label: 'Developer' } as const

/**
 * What the mark says when you press it.
 *
 * Three words rather than one string because each one rolls out on its own
 * beat — the stagger is `--i` in Nav.css and it is read off the index, so a
 * fourth word would join the roll without a second number being written down.
 */
const BLESSING = ['Jesus', 'Loves', 'You'] as const

/**
 * How long the whole flourish lives, roll-out through roll-up, in ms.
 *
 * It must outlast the CSS timeline: `--bless-life` in Nav.css is 4.25s and the
 * last word starts 180ms late, so 4600 leaves the strip mounted for ~170ms
 * after the last frame of it is invisible. Unmounting early would snap the
 * words off mid-roll.
 *
 * The one `setTimeout` this drives is the narrow exemption AGENTS.md rule 9
 * describes, and it is worth saying why out loud: it is not animation — every
 * moving pixel is a CSS keyframe on the compositor and this clock ticks once,
 * not per frame; the shared frame loop would have to be held awake at 60Hz for
 * four seconds to do a thing that happens once; and it ends by itself and is
 * cleared on unmount and on a second press, so nothing outlives the strip.
 */
const BLESS_MS = 4600

/** The size the phrase wants, and must match `--bless-size` in Nav.css. */
const BLESS_SIZE = 17

/**
 * How small the phrase may be shrunk before shrinking is the wrong answer.
 *
 * Two floors because the two things it can run into are not the same thing. To
 * its right on a wide bar is the LINK ROW, which can be dimmed for four seconds
 * and lose nothing — every link keeps its hit area, its tab stop and its focus
 * ring — so below 13px the links stand down and the phrase stays full size. To
 * its right on a phone is the ACTIONS group: the burger, the theme switch and
 * Sign in, which are controls, and dimming a control somebody is reaching for
 * is not a flourish. That side never dims; the phrase shrinks instead, and 10px
 * is as small as it goes. Measured at 320px — the narrowest this site supports —
 * the room left is 106px against a 155px strip, which lands at 11.7px.
 */
const BLESS_MIN_BESIDE_LINKS = 13
const BLESS_MIN_BESIDE_ACTIONS = 10

/** What both the bar and the panel render, whichever list an entry came from. */
type NavLink = { href: string; label: string }

/**
 * Which side of the divider a link belongs on, read off the link itself.
 *
 * Seven items in one undifferentiated row is what "too many tabs" actually
 * feels like, and the count is not the problem: five of them scroll you down
 * THIS page and two of them replace it, which are two different promises being
 * made in one voice. The bar says so now, and the footer says the same thing
 * the same way.
 *
 * Derived from the shape of the href, never from a second list. `NAV_LINKS` in
 * src/data/content.ts is the single public navigation and belongs to the data
 * folder; a hardcoded copy of "which of these are pages" here would be exactly
 * the kind of list AGENTS.md rule 17 is about — it would not fail loudly when
 * it went stale, it would just quietly put a new link on the wrong side. This
 * cannot: every route on this site carries a leading slash (rule 8, and
 * `src/lib/route.ts` explains what that slash buys), so a bare `#` is an anchor
 * and `#/` is a page, and a link added tomorrow sorts itself.
 *
 * It is also what puts the Developer tab in the right group for free: `#/dev`
 * is a route, so it joins About and Store without being named here.
 */
const isRouteLink = (href: string) => href.startsWith('#/')

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button
      type="button"
      className="nav__toggle"
      aria-label="Toggle light and dark"
      aria-pressed={theme === 'light'}
      onClick={toggle}
    >
      <span className="nav__knob">
        <span className="nav__moon">
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            /* Both, and it matters more here than anywhere. These two icons
               live INSIDE the theme button, and an inline <svg> takes a tab
               stop of its own in IE and older Edge whatever aria says — so the
               stop lands between the nav links and the control they sit in,
               on an element that does nothing when you press it.

               Every other decorative svg on the site pairs the two, and that
               is now a count: 31 of 31 rendered svg carry `focusable="false"`.
               It was 9 of 31 while this sentence said the same thing, and the
               missing 22 included icons in buttons — the case this paragraph
               calls the worst one. `CrossGlyph.tsx` carries the sweep, the
               file list and the grep that produces 31 rather than 35. */
            focusable="false"
          >
            <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />
          </svg>
        </span>
        <span className="nav__sun">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="12" cy="12" r="4.1" />
            <path d="M12 2.4v2.2M12 19.4v2.2M2.4 12h2.2M19.4 12h2.2M5.2 5.2l1.5 1.5M17.3 17.3l1.5 1.5M18.8 5.2l-1.5 1.5M6.7 17.3l-1.5 1.5" />
          </svg>
        </span>
      </span>
    </button>
  )
}

/**
 * The signed-in account's badges, under their name, handle and email.
 *
 * ## Every arm is drawn, and "could not read" is not "none"
 *
 * `useMyBadges()` has four states and they are four different facts. `ok` with
 * an empty list is the ordinary answer for most accounts and gets a line that
 * says so plainly; `error` is the different fact that **we do not know**, and
 * drawing it as an empty shelf would tell somebody they have nothing when they
 * may have something. That is the rule `src/store/useOwnedPacks.ts` settled
 * first, for the same reason, and `src/badges/README.md` restates for these.
 *
 * ## No badge id is written down here
 *
 * The catalogue lives in `tdg_badge_catalog()` in Postgres, so the chip below
 * draws `label` and `blurb` as they arrive. A badge added by a migration
 * tomorrow renders here today, and a badge id this site has never heard of
 * renders too — there is no map of ids to names that could fail to contain it
 * (AGENTS.md rule 17, and src/badges/README.md).
 *
 * ## The menu does not resize as the answer lands
 *
 * `.nav__badges-body` carries a `min-height` for the same reason
 * `.store__action` does: a panel that grows under the pointer as a read
 * completes reads as a page still loading. The reservation holds a two-line
 * note and two rows of chips, which covers every state this can actually be in.
 */
function AccountBadges() {
  const state = useMyBadges()

  /*
   * Handled, not asserted away — but there is honestly nothing to draw.
   *
   * It cannot be reached from a menu that only exists for a signed-in account,
   * except for the single tick between pressing Sign out and this component
   * unmounting, and what a reader must not see in that tick is "no badges yet"
   * flashing at them on the way out. An account that is not signed in has no
   * badges to be missing, and a sign-in prompt inside the account menu would be
   * a nonsense, so the whole block goes rather than the block staying with an
   * empty body under a heading.
   */
  if (state.kind === 'signedOut') return null

  return (
    <div className="nav__badges">
      <div className="nav__badges-title">Badges</div>
      <div className="nav__badges-body">
        {state.kind === 'checking' && <p className="nav__badges-note">Checking your badges…</p>}

        {state.kind === 'error' && (
          /* Kept to one sentence on purpose: it has to fit the reserved 46px
             at the panel's narrowest, and what makes it not-"none" is that it
             says we could not READ them — plus the warm the Store uses for
             exactly this. A second reassuring line would push the menu the few
             pixels the reservation exists to prevent. */
          <p className="nav__badges-note nav__badges-note--warn">
            We couldn't read your badges just now.
          </p>
        )}

        {state.kind === 'ok' && state.badges.length === 0 && (
          <p className="nav__badges-note">No badges yet. We hand them out one at a time.</p>
        )}

        {state.kind === 'ok' && state.badges.length > 0 && (
          <div className="chips nav__badge-row">
            {state.badges.map((badge) => (
              /*
                The site's own `.chip`, with the tracking relaxed: 0.12em is
                designed for the shouted one-word tags the rest of the site
                uses, and a badge's label is a Title Case NAME (rule 7), which
                comes apart at that spacing.

                `blurb` is the one line the catalogue writes about the badge. It
                is the `title` for a pointer and `.sr-only` for a screen reader,
                because a tooltip alone is a fact only some readers get.
              */
              <span key={badge.id} className="chip nav__badge" title={badge.blurb}>
                {badge.label}
                <span className="sr-only"> — {badge.blurb}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Three figures and a date, above the door to the page that has the rest.
 *
 * ## Why the menu carries numbers at all
 *
 * A menu that only repeats the name you signed in with answers a question
 * nobody has. These are the three counts somebody actually opens an account
 * menu to check — how many friends, how long a run, how much they own — and
 * the day it all began. Everything else is a page away, and the button under
 * these is that page.
 *
 * ## Which three, and why not badges
 *
 * Deliberately NOT the badge count: the badges are drawn as chips directly
 * below, and a tile counting the thing sitting under it is the same fact said
 * twice in one 280px panel.
 *
 * A streak is per app, and this has room for one number, so it shows the
 * longest run currently going anywhere — which is what "am I still on a
 * streak" means to the person asking. The Account page breaks it out per app.
 * **Zero is a true answer here** and is drawn as one: this is the reader's own
 * account, so no streak row means no run kept, not a figure being withheld.
 *
 * ## Four states, and the box is one size in all of them
 *
 * Same floor as the badge shelf below it, for the same reason: a panel that
 * grows under the pointer as a read lands reads as a page still loading. The
 * reservation holds the tile row and the date line, which is the tallest this
 * can honestly be.
 */
function AccountGlance() {
  const state = useAccountStats()

  // Same reasoning as AccountBadges: unreachable except for the tick between
  // pressing Sign out and this unmounting, and what must not flash there is a
  // row of zeros on the way out.
  if (state.kind === 'signedOut') return null

  const packs =
    state.kind === 'ok'
      ? Object.values(state.stats.packs).reduce((sum, list) => sum + list.length, 0)
      : 0
  const streak =
    state.kind === 'ok'
      ? Object.values(state.stats.streaks).reduce((best, s) => Math.max(best, s.current), 0)
      : 0

  return (
    <div className="nav__glance">
      {state.kind === 'checking' && <p className="nav__glance-note">Counting…</p>}

      {state.kind === 'error' && (
        /* Not zeros. "We could not find out" is a different fact from "you
           have none", and drawing the second would tell somebody they have no
           friends because a request timed out. Same rule, same warm, as the
           badge shelf below — see src/badges/README.md. */
        <p className="nav__glance-note nav__glance-note--warn">
          We couldn't read your stats just now.
        </p>
      )}

      {state.kind === 'ok' && (
        <>
          <div className="nav__glance-row">
            <span className="nav__glance-tile">
              <span className="nav__glance-n">{fmtCount(state.stats.friends)}</span>
              <span className="nav__glance-label">Friends</span>
            </span>
            <span className="nav__glance-tile">
              <span className="nav__glance-n">{fmtCount(streak)}</span>
              <span className="nav__glance-label">Streak</span>
            </span>
            <span className="nav__glance-tile">
              <span className="nav__glance-n">{fmtCount(packs)}</span>
              <span className="nav__glance-label">Packs</span>
            </span>
          </div>
          <p className="nav__glance-since">Member since {fmtDay(state.stats.createdAt)}</p>
        </>
      )}
    </div>
  )
}

/**
 * Controlled by the Nav rather than by itself, because the burger panel and
 * this share one bar and are both open-able at once on a phone. One owner
 * means opening either closes the other, instead of the two overlapping.
 */
function AccountMenu({
  open,
  setOpen,
  onOpenAuth,
  onOpenFeedback,
  onAccountPage,
}: {
  open: boolean
  setOpen: (v: boolean) => void
  /** Reopens the auth modal, which is where an unfinished account is finished. */
  onOpenAuth: () => void
  onOpenFeedback: () => void
  /** True while `#/account` is already the page, so the door says so. */
  onAccountPage: boolean
}) {
  const { user, profile, setup, signOut, isAdmin } = useAuth()
  const devMode = useDevMode()
  const ref = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDocPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Rule 14: Escape returns focus to what opened it. The panel goes
      // `inert` the moment it closes, and an inert subtree cannot hold focus,
      // so without this the browser dropped it on `body` and the next Tab
      // started again from the top of the page.
      if (ref.current?.contains(document.activeElement)) triggerRef.current?.focus()
      setOpen(false)
    }
    document.addEventListener('pointerdown', onDocPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDocPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, setOpen])

  return (
    <div className="nav__account" ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        className="nav__auth-btn"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Account
      </button>
      {/* Same reason as the burger panel below: a closed menu that is only
          hidden still hands its buttons to the tab order. */}
      <div className="nav__account-panel" data-open={open} inert={!open}>
        <div className="nav__account-name">{profile?.display_name || profile?.username || 'Signed in'}</div>
        {profile?.username && <div className="nav__account-handle">@{profile.username}</div>}
        {user?.email && <div className="nav__account-email">{user.email}</div>}
        {/* The way back to a form that opens once and can be dismissed.
            Without it, an account that came back from Google without a
            username or a password has a gap it can neither see from here nor
            reopen — and the panel above is exactly where that gap SHOWS, as a
            missing handle under a name that says "Signed in". Rendered only
            while something is genuinely outstanding, so it is never a control
            that does nothing. */}
        {setup && (
          <button
            type="button"
            className="nav__account-finish"
            onClick={() => {
              setOpen(false)
              // Focus back to the trigger before the modal opens, for the
              // reason Send Feedback below gives: a closed panel is `inert`,
              // and an inert button is not a live element to return focus to.
              triggerRef.current?.focus()
              onOpenAuth()
            }}
          >
            <span className="nav__account-finish-label">Finish Setting Up</span>
            <span className="nav__account-finish-why">
              {setup.needsUsername && setup.needsPassword
                ? 'No username or password yet'
                : setup.needsUsername
                  ? 'No username yet'
                  : 'No password yet'}
            </span>
          </button>
        )}
        <AccountGlance />
        {/* The door to everything this panel cannot hold: the whole privacy
            list, every counter, the badges with their blurbs, and the account's
            own facts. An anchor and not a button, because it goes to a place —
            so it can be middle-clicked, copied and opened in a new tab like
            every other link on this site. Closing the menu is the click's own
            business; the hash change is the browser's. */}
        <a
          className="nav__account-open"
          href={ACCOUNT_HASH}
          aria-current={onAccountPage ? 'page' : undefined}
          onClick={() => setOpen(false)}
        >
          {/* It stays reachable while you are already there — a door that
              vanishes once you are through it leaves somebody who scrolled
              away with no way to see they are still on it. */}
          {onAccountPage ? 'Your Account Page' : 'Open Your Account Page'}
        </a>
        <AccountBadges />
        {/* Feedback needs the account (a reply has to reach its sender), so
            its door lives with the account things. See src/feedback/. */}
        <button
          type="button"
          className="nav__account-feedback"
          onClick={() => {
            setOpen(false)
            // Hand focus back to the trigger BEFORE the dialog opens. A closed
            // menu is `inert`, and an inert button cannot be focused — so this
            // is what leaves the dialog a live element to return focus to when
            // it closes (AGENTS.md rule 14, and src/lib/modal.ts).
            triggerRef.current?.focus()
            onOpenFeedback()
          }}
        >
          Send Feedback
        </button>
        {/* The only way back once the tab is hidden, so it lives here rather
            than on the console page itself. A switch you can only reach
            through the thing it hides is a switch you cannot un-flip. */}
        {isAdmin && (
          <button
            type="button"
            role="switch"
            aria-checked={devMode}
            className="nav__devmode"
            onClick={() => setDevMode(!devMode)}
          >
            <span className="nav__devmode-label">Developer Tab</span>
            <span className="nav__devmode-track" aria-hidden="true">
              <span className="nav__devmode-knob" />
            </span>
          </button>
        )}
        <button
          type="button"
          className="nav__account-signout"
          onClick={() => {
            setOpen(false)
            signOut()
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

/**
 * Only a ROUTE can be the current page; the rest are anchors on this one.
 * All three routes answer here — About, Store, and the Developer tab when it is
 * drawn — which is the same split `isRouteLink` above reads off the href.
 */
function isCurrent(href: string, route: Route): boolean {
  if (href === ABOUT_HASH) return route.kind === 'about'
  if (href === STORE_HASH) return route.kind === 'store'
  if (href === DEV_HASH) return route.kind === 'dev'
  return false
}

export function Nav({
  onOpenAuth,
  onOpenFeedback,
}: {
  onOpenAuth: () => void
  onOpenFeedback: () => void
}) {
  const { theme } = useTheme()
  const { status, isAdmin } = useAuth()
  const devMode = useDevMode()
  const route = useRoute()
  const [scrolled, setScrolled] = useState(false)
  // A press of the mark counts up rather than flipping a flag: the count is the
  // strip's `key`, so pressing it again mid-roll remounts the strip. The mark
  // is NOT remounted — it is the link, and a keyboard press must not lose its
  // focus — so its own animations are rewound by hand in the effect below.
  const [bless, setBless] = useState(0)
  const blessTimer = useRef<number | undefined>(undefined)
  // Whether the link row has to stand down for the words. Measured, never
  // guessed — see the effect below.
  const [blessQuiet, setBlessQuiet] = useState(false)
  // One at a time: the two panels hang off the same bar and would otherwise
  // overlap on a phone, where both are within a thumb's reach of each other.
  const [openPanel, setOpenPanel] = useState<'menu' | 'account' | null>(null)
  const menuOpen = openPanel === 'menu'
  const setMenuOpen = (v: boolean) => setOpenPanel(v ? 'menu' : null)
  const sentinel = useRef<HTMLDivElement | null>(null)
  const indicator = useRef<HTMLSpanElement | null>(null)
  const linkRow = useRef<HTMLDivElement | null>(null)
  const actions = useRef<HTMLDivElement | null>(null)
  const markwrap = useRef<HTMLDivElement | null>(null)
  const strip = useRef<HTMLSpanElement | null>(null)
  const progress = useRef<HTMLDivElement | null>(null)
  const panel = useRef<HTMLDivElement | null>(null)
  const burger = useRef<HTMLButtonElement | null>(null)

  useEffect(() => () => window.clearTimeout(blessTimer.current), [])

  /** Say it. Re-pressing restarts the roll rather than queueing a second one. */
  const sayBlessing = () => {
    window.clearTimeout(blessTimer.current)
    setBless((n) => n + 1)
    blessTimer.current = window.setTimeout(() => setBless(0), BLESS_MS)
  }

  /**
   * Rewind the sword, and work out how much bar the words have.
   *
   * REWIND FIRST, because this is the bug the flourish shipped with. The strip
   * is keyed on the press count and remounts, so its animations restart; the
   * mark cannot be remounted — it is the link home, and re-creating it under a
   * keyboard press would drop the focus — so `data-bless` merely stays true
   * across a second press, the mark's CSS animations never see a change, and
   * they carry on from wherever the first press left them. Press twice and the
   * words rolled out beside a cross that had already finished turning and had
   * no reason to turn again. Setting `currentTime` to 0 on everything under the
   * wrapper restarts the whole timeline together — the sword, the glint on its
   * pseudo-element, and the strip that was already at zero anyway.
   *
   * Then the room. Measured off the rendered boxes rather than gated on a
   * breakpoint, because the width the bar runs out of room at is not a number
   * anybody can write down: it moves with the seven links' own text, with the
   * Developer tab a developer adds to them, with the Sign in button becoming an
   * avatar, and with the browser's font.
   *
   * It measures from the POINT — where the blade will end, computed the same
   * way the stylesheet computes it, off an untransformed wrapper whose box is
   * the mark's own. Everything past that point scales with `--bless-size`: the
   * blade's reach, the air after it, the words. So one ratio sizes all of it,
   * and the variable goes on the wrapper because the sword reads it too — size
   * the phrase alone and the sword would still be aiming at where the words
   * used to start.
   *
   * Whichever box is to the right decides which answer is right; see the two
   * floors above. The phrase always plays, at every width, because a press that
   * does nothing on some monitors is worse than either answer.
   *
   * Under prefers-reduced-motion there is no blade, and the strip sits back at
   * the crossbar half a mark to the left of the point this measures from. The
   * arithmetic survives it: the fits-as-written test shifts by the same amount
   * on both sides and is exact, and the shrunk case comes out 4.5 * (s/17 - 1)
   * pixels short of what it predicted, which is never positive. It can only
   * ever be too careful there, never too tight.
   */
  useEffect(() => {
    const w = markwrap.current
    const s = strip.current
    if (!bless || !w || !s) {
      setBlessQuiet(false)
      return
    }
    w.getAnimations({ subtree: true }).forEach((a) => {
      a.currentTime = 0
    })

    // `offsetParent` is null while the row is display:none — under 821px there
    // are no links in the bar at all, and the actions are the neighbour.
    const row = linkRow.current
    const beside = row && row.offsetParent !== null ? row : actions.current
    w.style.removeProperty('--bless-size')
    setBlessQuiet(false)
    if (!beside) return

    // The stylesheet's own expression for the point, in JS: the mark's centre
    // across, plus the half height the quarter turn swings the stem's end out
    // to. The wrapper is never transformed, so its box is the mark's at rest.
    const box = w.getBoundingClientRect()
    const point = box.left + box.width / 2 + box.height / 2
    const wants = s.getBoundingClientRect().right - point
    const room = beside.getBoundingClientRect().left - point - 14
    if (room >= wants) return

    const size = (room / wants) * BLESS_SIZE
    if (beside === row && size < BLESS_MIN_BESIDE_LINKS) {
      setBlessQuiet(true)
      return
    }
    w.style.setProperty('--bless-size', `${Math.max(size, BLESS_MIN_BESIDE_ACTIONS).toFixed(1)}px`)
  }, [bless])

  // Nav state is driven by a sentinel at the very top of the page, not by a
  // scroll listener, so it stays correct whichever element owns the scroll.
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting), {
      threshold: 0,
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const bar = progress.current
    if (!bar) return
    let top: HTMLElement | null = null
    let painted = ''
    return onFrame(({ vh }) => {
      // Re-resolved when the cached node has left the document: switching to
      // the Store replaces the page, and a detached element reports a rect of
      // zeros for ever, which pins the bar at 0% with nothing to see.
      if (!top || !top.isConnected) top = document.getElementById('top')
      const max = document.documentElement.scrollHeight - vh || 1
      const travelled = top ? Math.max(0, -top.getBoundingClientRect().top) : 0
      // One decimal, not two. `width` is the one layout-affecting write the
      // frame loop makes, and at two decimals the string changed on every
      // frame of every scroll, so every frame carried a layout and the next
      // frame's first rect read paid to flush it. A tenth of a percent is
      // 1.4px on a 1440px bar and under half a pixel on a phone — below what
      // a 2px bar can show — so this is the same picture with a write only
      // when the bar would actually move.
      const next = `${Math.max(0, Math.min(100, (travelled / max) * 100)).toFixed(1)}%`
      if (next === painted) return
      painted = next
      return () => {
        bar.style.width = next
      }
    })
  }, [])

  // Height has to be measured to animate it; max-height:none will not tween.
  // The second measurement is the room actually left under a fixed bar: on a
  // short viewport the full list is taller than the screen, and a panel that
  // opens past the bottom edge cannot be scrolled to. Capped here, the panel
  // takes its own scroll instead (see .nav__panel[data-open] in Nav.css).
  useEffect(() => {
    const el = panel.current
    if (!el) return
    if (!menuOpen) {
      el.style.maxHeight = '0px'
      return
    }
    const room = window.innerHeight - el.getBoundingClientRect().top - 12
    el.style.maxHeight = `${Math.max(140, Math.min(el.scrollHeight + 40, room))}px`
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Same as the account menu: the panel goes `inert` on close, so focus
      // goes back to the burger first or it lands on `body`.
      if (panel.current?.contains(document.activeElement)) burger.current?.focus()
      setMenuOpen(false)
    }
    const onResize = () => {
      if (window.innerWidth > 820) {
        setOpenPanel((p) => (p === 'menu' ? null : p))
        return
      }
      // Rotating a phone, or dragging a window edge, changes the room under
      // the bar while the panel is open. Re-measure rather than leave a cap
      // computed against a viewport that no longer exists.
      const el = panel.current
      if (!el) return
      const room = window.innerHeight - el.getBoundingClientRect().top - 12
      el.style.maxHeight = `${Math.max(140, Math.min(el.scrollHeight + 40, room))}px`
    }
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [menuOpen])

  // The hero is a dark scene in dark mode; chrome sitting over it stays light.
  const overDark = !scrolled && theme === 'dark'

  // One list, so the desktop bar and the mobile panel can never disagree about
  // whether the Developer tab is there.
  const links: readonly NavLink[] = isAdmin && devMode ? [...NAV_LINKS, DEV_LINK] : NAV_LINKS

  // ...and ONE split of that list, for the same reason. The bar and the panel
  // both render these two arrays in this order, so they cannot end up
  // disagreeing about which side of the divider a link is on either. Partitioned
  // rather than sorted in place: an anchor added below a route in NAV_LINKS
  // still lands with the anchors, which is the whole point of deriving it.
  const anchors = links.filter((link) => !isRouteLink(link.href))
  const routes = links.filter((link) => isRouteLink(link.href))
  // Drawn only when there is something on both sides of it. A divider with
  // nothing after it is a hairline that means nothing.
  const split = anchors.length > 0 && routes.length > 0

  const lightIndicator = (event: React.PointerEvent<HTMLAnchorElement>) => {
    const bar = indicator.current
    if (!bar) return
    const link = event.currentTarget
    // offsetLeft is measured against .nav__links, which is the offsetParent
    // because it is the nearest positioned ancestor. The divider between the
    // two groups is deliberately UNpositioned for that reason: a `position:
    // relative` on it would not change its own look and would silently become
    // the offsetParent of every link after it, sliding the indicator to the
    // wrong half of the bar.
    bar.style.left = `${link.offsetLeft}px`
    bar.style.width = `${link.offsetWidth}px`
    bar.style.opacity = '1'
  }

  /** One renderer per surface, so the two groups cannot drift from each other. */
  const barLink = (link: NavLink) => (
    <a
      key={link.href}
      className="nav__link"
      data-dev={link.href === DEV_HASH || undefined}
      href={link.href}
      aria-current={isCurrent(link.href, route) ? 'page' : undefined}
      onPointerEnter={lightIndicator}
    >
      {link.label}
    </a>
  )

  const panelLink = (link: NavLink) => (
    <a
      key={link.href}
      className="nav__panel-link"
      data-dev={link.href === DEV_HASH || undefined}
      href={link.href}
      aria-current={isCurrent(link.href, route) ? 'page' : undefined}
      onClick={() => setMenuOpen(false)}
    >
      {link.label}
    </a>
  )

  return (
    <>
      <div ref={sentinel} className="nav__sentinel" aria-hidden="true" />
      <nav
        className="nav"
        data-scrolled={scrolled}
        data-over-dark={overDark}
        data-bless-quiet={blessQuiet || undefined}
      >
        <div className="nav__veil" aria-hidden="true" />

        {/* The mark keeps its own job — it is still the link home — and gains a
            second one: it says who the site is for, and turns a quarter turn
            into a sword to point at it while it does. The wrapper exists only
            to give the strip and the glint something to hang off, and it is
            `flex: none` around a 15x24 mark, so the bar's layout is the layout
            it always had — a rotation moves no other box.

            Where the words sit is derived from that quarter turn rather than
            typed; Nav.css carries the derivation and the two landmarks it can
            aim at. Nothing here places a word by hand, at any width or size. */}
        <div ref={markwrap} className="nav__markwrap" data-bless={bless > 0 || undefined}>
          <a href="#top" className="nav__mark" aria-label="TDG home" onClick={sayBlessing}>
            <span className="nav__mark-bar" />
            <span className="nav__mark-bar" />
          </a>

          {bless > 0 && (
            <span key={bless} ref={strip} className="nav__bless" aria-hidden="true">
              <span className="nav__bless-aura" />
              <span className="nav__bless-clip">
                {BLESSING.map((word, i) => (
                  <span
                    key={word}
                    className="nav__bless-word"
                    style={{ '--i': i } as React.CSSProperties}
                  >
                    {word}
                  </span>
                ))}
              </span>
            </span>
          )}
        </div>

        <div
          ref={linkRow}
          className="nav__links"
          onPointerLeave={() => indicator.current?.style.setProperty('opacity', '0')}
        >
          <span ref={indicator} className="nav__indicator" aria-hidden="true" />
          {anchors.map(barLink)}
          {/* Five places on this page, then two pages. Decorative and
              aria-hidden: the split is a reading aid, and a screen reader gets
              the same seven links in the same order it always did. */}
          {split && <span className="nav__split" aria-hidden="true" />}
          {routes.map(barLink)}
        </div>

        <div ref={actions} className="nav__actions">
          <button
            ref={burger}
            type="button"
            className="nav__burger"
            aria-label="Menu"
            aria-expanded={menuOpen}
            aria-controls="nav-panel"
            data-open={menuOpen}
            onClick={() => setOpenPanel(menuOpen ? null : 'menu')}
          >
            <span className="nav__burger-line" />
            <span className="nav__burger-line" />
            <span className="nav__burger-line" />
          </button>

          <ThemeToggle />

          {status === 'signedIn' ? (
            <AccountMenu
              open={openPanel === 'account'}
              setOpen={(v) => setOpenPanel(v ? 'account' : null)}
              onOpenAuth={onOpenAuth}
              onOpenFeedback={onOpenFeedback}
              onAccountPage={route.kind === 'account'}
            />
          ) : (
            <button type="button" className="nav__auth-btn" onClick={onOpenAuth}>
              Sign in
            </button>
          )}
        </div>

        {/* max-height:0 + opacity:0 + pointer-events:none hide the panel from
            sight but not from the tab order, and a closed menu left six invisible
            links between the toggle and the page. `inert` removes the subtree
            from focus and the a11y tree without touching the height animation. */}
        <div
          id="nav-panel"
          ref={panel}
          className="nav__panel"
          data-open={menuOpen}
          inert={!menuOpen}
        >
          <div className="nav__panel-inner">
            {anchors.map(panelLink)}
            {/* The same five-plus-two the bar draws, from the same two arrays,
                said in the panel's own idiom: a stacked list already has a rule
                under every link, so this is the air below the last anchor
                rather than a second line beside it. */}
            {split && <span className="nav__panel-split" aria-hidden="true" />}
            {routes.map(panelLink)}
          </div>
        </div>

        {/* The track is a sibling and not a ::before on the bar, because the bar
            is the element whose width the frame loop writes — a pseudo-element
            on it would be as short as the progress is. Nav.css has the rest. */}
        <div className="nav__progress-track" aria-hidden="true" />
        <div ref={progress} className="nav__progress" aria-hidden="true" />
      </nav>
    </>
  )
}
