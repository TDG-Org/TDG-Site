import { useEffect, useState } from 'react'
import { APPS, MARANATHA, TOOLS } from '../data/content'
import { STORE_APPS } from '../data/store'

/**
 * The pages this site can be showing.
 *
 * A hash route rather than a path: the site is served from GitHub Pages, where
 * a real path needs a 404.html rewrite to survive a refresh or a shared link,
 * and every existing nav item is already a hash anchor. **Every route carries a
 * leading slash**, so it can never collide with a section id. The rule was
 * learned from one near miss: the home section used to be `#story`, one letter
 * from `#store`, and a route that ate a section anchor would break the one-page
 * scroll. That section is `#origin` now, so that particular pair cannot clash
 * any more — the rule stays exactly as it was, because what it actually buys is
 * that no section anchor added in future can collide with a route added today.
 * `#/app/<slug>` also puts the slug behind a segment, so no future app name can
 * collide with a section either.
 *
 * `#story` is not a route and never was, so it falls through to home here like
 * any other unknown fragment. Old links to it still work all the same: the hash
 * effect in App.tsx resolves that one fragment to `#origin`, without touching
 * the hash. That alias is written down at the line that does it — this is only
 * a signpost, so somebody who greps for `story` and lands here does not
 * conclude the old anchor died in the rename.
 *
 * `#/store/<app>` is that app's OWN shop page, and it used to be something
 * else: the one long Store, scrolled to that app's shelf. The shelves are gone
 * — the Store is an index of app cards now and each card opens a page of packs
 * — so the route that used to name a place on a page names a page. Nothing
 * about the hash changed, which is the point: every link written to it, here
 * and in `appPages.ts`, still lands on the same app's packs.
 *
 * `dev` is the Developer console, and it is not a secret because of this file:
 * anything the router can recognise has to be named here. What keeps it out of
 * everyone's way is that App renders HOME for it unless the signed-in account
 * is a TDG developer, the same thing `#/banana` does, and that every byte of
 * data behind it comes from `tdg_admin_*` functions that refuse a non-admin.
 * See src/dev/README.md.
 */
export type Route =
  | { kind: 'home' }
  | { kind: 'about' }
  /**
   * The signed-in account's own page: what it is, what it counts, and who may
   * see each part of it.
   *
   * **Not gated the way `dev` is, and that is the difference between the two.**
   * `#/dev` renders home for anybody who is not a developer, because a console
   * nobody should know about must answer the same thing an unknown hash does.
   * This is the opposite kind of page: it is linked from the nav on every page
   * of the site, so a signed-out reader who opens it — or who follows the link
   * somebody sent them — is told to sign in, in words, on the page they asked
   * for. Rendering home there would answer "is there something here?" with a
   * silence that is simply wrong.
   */
  | { kind: 'account' }
  /**
   * Somebody ELSE'S account, by the handle they are known as.
   *
   * The variable part is a username rather than an id, because this is the one
   * route on the site a person types, says out loud and pastes to a friend —
   * and because a uuid in the address bar tells a reader nothing about where
   * they are. It is behind a segment for rule 8's reason: a handle is chosen
   * by whoever holds it, so `#/luke` would let the next username collide with
   * a section anchor or a route added tomorrow.
   *
   * Ungated, exactly like `#/account` and for the same reason: it is linked
   * from every friend card and every search result, and shared between people.
   * A signed-out reader is told to sign in, in words, on the page they asked
   * for. What they may then SEE is the server's decision, never this file's.
   */
  | { kind: 'profile'; username: string }
  /**
   * The Store: its index of app cards, or one app's own page of packs. A link
   * that says "Veditor packs are in the Store" has named an app, and it opens
   * that app's packs rather than a page with somebody else's on it too.
   */
  | { kind: 'store'; app?: string }
  /**
   * Send Feedback, opened by its own address rather than from the account menu.
   *
   * **This route exists for the OTHER apps.** Several of ours have no sign-in
   * at all — MARANATHA, N8-Tools, VidHelper, Say2Quill, the Socials tracker —
   * so they cannot carry the feedback form themselves: a report needs an
   * account for the reply to have anywhere to go. Their Send Feedback opens
   * this address in a browser instead, and `#/feedback/<app>` files the report
   * against the app the reader was actually using rather than against the site
   * they landed on. Without the segment, every report from every app would
   * arrive in the console labelled `tdg-site`, which is the one thing the
   * console's per-app view exists to prevent.
   *
   * The segment PICKS the form's About field rather than pinning it: the form
   * has a picker of its own now, so a reader who arrived from one app and meant
   * to talk about another is not sent looking for a second door. See
   * `src/feedback/README.md`.
   *
   * It renders HOME with the dialog over it, because feedback is a dialog and
   * not a page. Closing it puts the hash back to home, so a refresh does not
   * reopen a form somebody already dealt with.
   *
   * The app id is validated against the server's own shape, not against a list
   * of today's apps: `tdg_feedback.app` is `^[a-z0-9][a-z0-9-]{1,31}$` and
   * deliberately open, so an app that starts reporting tomorrow needs no edit
   * here. An id that does not fit the shape is dropped and the report is filed
   * under the site, which is where the reader is.
   */
  | { kind: 'feedback'; app?: string }
  | { kind: 'dev' }
  | { kind: 'app'; slug: string }

export const ABOUT_HASH = '#/about'
export const STORE_HASH = '#/store'
export const ACCOUNT_HASH = '#/account'
export const DEV_HASH = '#/dev'
export const FEEDBACK_HASH = '#/feedback'

/**
 * The shape `tdg_feedback.app` accepts, said again here.
 *
 * A copy of a server CHECK is normally the thing this project refuses to
 * write. This one earns it: the alternative is passing an id straight through
 * to `tdg_feedback_submit` and letting Postgres refuse it, which turns a
 * mistyped link into an error message on a form somebody has already filled
 * in. Validating the ROUTE means a bad id costs nothing — the report is simply
 * filed under the site. It is the shape and not a list on purpose: see the
 * `feedback` arm of `Route`.
 */
const APP_ID = /^[a-z0-9][a-z0-9-]{1,31}$/

/**
 * The address another TDG app points its Send Feedback at, filed under that
 * app. Exported so nothing has to concatenate the string, the way `appHash`
 * and `storeAppHash` exist — and so the one place that builds it is the one
 * place to read when an app asks what its link should be.
 */
export const feedbackHash = (appId?: string) =>
  appId && APP_ID.test(appId) ? `${FEEDBACK_HASH}/${appId}` : FEEDBACK_HASH

/** The hash that opens one app's own page. */
export const appHash = (slug: string) => `#/app/${slug}`

/**
 * The hash that opens one person's profile.
 *
 * A handle is `[a-z0-9_]` by the rule `src/auth/wording.ts` states and the
 * unique index keeps, so there is nothing here that needs escaping — but it is
 * encoded anyway, because the one thing this function must never do is build a
 * hash out of a stored value it has not checked. A profile with no username has
 * no address, and callers draw it as a card without a link rather than as a
 * link to `#/user/`.
 */
export const userHash = (username: string) => `#/user/${encodeURIComponent(username)}`

/**
 * The hash that opens one app's own page of packs, the way `appHash` opens one
 * app's own page. Both exist so a component builds the route from an id rather
 * than concatenating the string itself; the two literals in `appPages.ts` stay
 * literals, because a data file writes an href the same way it writes any
 * other one.
 */
export const storeAppHash = (appId: string) => `#/store/${appId}`

/**
 * A route, plus the place on it the reader asked for: `#/store?to=cloud-plans`.
 *
 * ## Why a query and not a segment
 *
 * Rule 8 puts a route's variable part behind a segment, and `#/store/<app>`
 * already spends that segment — on a PAGE, which is the distinction the
 * `store` arm above exists to record: that route used to name a place on one
 * long Store and now names one app's own page of packs. Teaching the same
 * segment to mean "a place on this page" again would put back the confusion
 * that separation removed, and it would make every future app id race the
 * anchor names.
 *
 * ## Why not `#/store#cloud-plans`
 *
 * There is only one fragment. The browser would hand the whole of
 * `/store#cloud-plans` to this file, so it would have to be split here
 * anyway — and it reads, in an address bar somebody is about to copy, like a
 * link that broke.
 *
 * So: a query INSIDE the fragment. It cannot collide with a route or with a
 * section id, `routeFromHash` drops it before parsing, and one hash carries
 * both halves of "open this page, at this part of it". The scrolling is
 * `sectionIdFromHash` / `landOnAnchor` in lib/anchors.ts, which is the same
 * landing a bare `#apps` gets; a `to` naming nothing on the page costs the
 * reader nothing but the top of it.
 */
export const anchoredHash = (routeHash: string, sectionId: string) =>
  `${routeHash}?to=${encodeURIComponent(sectionId)}`

/**
 * The id on the Store's TDG Cloud panel, and the address that opens the Store
 * standing at it.
 *
 * **This is the address the other TDG apps link their Cloud buttons to**, and
 * it is exported so no repo has to concatenate it — the same reason
 * `feedbackHash` exists. Bible Educator funnels every Cloud link through one
 * constant (`TDG_CLOUD_URL` in its `src/core/links.ts`) so that adopting this
 * is a one-line change; TDG Veditor, Makullveny and DevFleet each hold their
 * own copy of the site address and will want the same.
 *
 * The id is deliberately NOT in the `store-sec-*` namespace: that prefix
 * belongs to the Store's FAQ folds, one of which is already `store-sec-cloud`,
 * and an anchor that shares a prefix with a generated set is an anchor waiting
 * to be taken. It carries no leading slash, so rule 8 keeps it clear of every
 * route.
 */
export const CLOUD_ANCHOR = 'cloud-plans'
export const CLOUD_HASH = anchoredHash(STORE_HASH, CLOUD_ANCHOR)

/**
 * The slugs the router will accept, taken from the CARDS rather than from the
 * pages themselves. The page content is a large file and only a visitor who
 * opens one should pay to download it, so this file must not import it: see
 * the lazy import in App.tsx. Every card names its page, so the two lists
 * cannot drift without a card losing its link, which is visible immediately.
 */
const APP_SLUGS: string[] = [
  ...APPS.map((app) => app.page),
  ...TOOLS.map((tool) => tool.page),
  MARANATHA.page,
]

const HOME: Route = { kind: 'home' }

/**
 * `decodeURIComponent` THROWS on a lone `%` — `#/user/%` is a hash a reader can
 * type and a link rot can produce, and an exception here would take the whole
 * render down rather than landing on a page. A hash that cannot be decoded is
 * a hash naming nobody, which is what the raw text already is.
 */
function safeDecode(part: string): string {
  try {
    return decodeURIComponent(part)
  } catch {
    return part
  }
}

export function routeFromHash(hash: string): Route {
  const key = hash
    .replace(/^#/, '')
    /*
     * A route may carry `?to=<section id>` — see `anchoredHash` below and
     * `sectionIdFromHash` in lib/anchors.ts. It names a place ON the page the
     * route opens, so it can never change WHICH page that is, and it is
     * dropped here before a single segment is read. Without this line
     * `#/store?to=cloud-plans` matched no route and rendered home, which is
     * what `#/banana` does and exactly the wrong answer for a link that
     * plainly asked for the shop.
     */
    .replace(/\?.*$/, '')
    .replace(/^\/+/, '')
    /*
     * A trailing slash is a stray, not a different address. `#/about/` and
     * `#/app/veditor/` used to fall through to home and `#/store/veditor/` to
     * the Store's index with the app dropped — while `#/store/` and
     * `#/feedback/` happened to work, because those two match on a prefix.
     * Chat clients and paste add the character; the same link should open
     * the same page with or without it.
     */
    .replace(/\/+$/, '')
    .toLowerCase()
  if (key === 'about') return { kind: 'about' }
  if (key === 'store') return { kind: 'store' }
  if (key.startsWith('store/')) {
    const app = key.slice(6)
    // An app we do not sell for still lands on the Store rather than on the
    // home page, because `#/store/banana` is unmistakably a request for the
    // shop. Only the part naming the app is dropped.
    return STORE_APPS.some((a) => a.id === app) ? { kind: 'store', app } : { kind: 'store' }
  }
  if (key === 'account') return { kind: 'account' }
  if (key === 'feedback') return { kind: 'feedback' }
  if (key.startsWith('feedback/')) {
    // A shape, not a catalogue, and an id that misses it is dropped rather
    // than refused: the reader still gets the form, filed under the site.
    const app = key.slice(9)
    return APP_ID.test(app) ? { kind: 'feedback', app } : { kind: 'feedback' }
  }
  if (key === 'dev') return { kind: 'dev' }
  if (key.startsWith('user/')) {
    // Lower-cased with the rest of the hash above, which is right: handles are
    // compared case-insensitively everywhere on this project, so `#/user/Rose`
    // and `#/user/rose` are one page rather than two. A bare `#/user/` has
    // named nobody and falls through to home, the way `#/banana` does.
    const username = safeDecode(key.slice(5)).replace(/^@/, '').trim()
    return username ? { kind: 'profile', username } : HOME
  }
  if (key.startsWith('app/')) {
    const slug = key.slice(4)
    // An app we do not have a page for behaves like `#/banana`: the home page,
    // hash untouched. A typo'd link must not render an empty shell.
    return APP_SLUGS.includes(slug) ? { kind: 'app', slug } : HOME
  }
  return HOME
}

const same = (a: Route, b: Route) => {
  if (a.kind !== b.kind) return false
  if (a.kind === 'app' && b.kind === 'app') return a.slug === b.slug
  // Two Store routes naming different apps are two different pages, and
  // treating them as one would leave a reader who clicked the second link
  // looking at the first app's packs.
  if (a.kind === 'store' && b.kind === 'store') return a.app === b.app
  // Two feedback routes naming different apps file under different apps, so a
  // reader who followed the second link must not get the first one's form.
  if (a.kind === 'feedback' && b.kind === 'feedback') return a.app === b.app
  // Two profiles are two people. Following a friend-of-a-friend from one
  // profile to the next is a hashchange within one route kind, and treating
  // them as the same route would leave the second reader looking at the first
  // person's page.
  if (a.kind === 'profile' && b.kind === 'profile') return a.username === b.username
  return true
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => routeFromHash(window.location.hash))

  useEffect(() => {
    const onHash = () => {
      const next = routeFromHash(window.location.hash)
      // Keep the previous object when nothing actually changed. Clicking a
      // section anchor from the home page is a hashchange but not a route
      // change, and a fresh object would re-run every effect keyed on it.
      setRoute((prev) => (same(prev, next) ? prev : next))
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return route
}

/* ── coming back ────────────────────────────────────────────────────────────
 *
 * Opening an app page from a card is a push, so the browser's own Back button
 * already returns to the home page, but it returns to the TOP of it unless
 * something puts the reader back where they were standing. That is what this
 * remembers, and the page's own Back control simply calls `history.back()`, so
 * both routes through are one code path and cannot land in different places.
 *
 * ## One journey, exactly one hop long
 *
 * This used to be consumed in ONE place — the home page's arrival — because
 * home was the only page a journey ever returned to. It is not any more: the
 * Store's index is a page you leave from a card and come back to, and an app
 * page can send you to that app's packs and be come back to in turn. A memory
 * consumed only at home outlives its journey on every one of those, and a
 * stale one is not harmless: `BackButton` reads its LABEL, so an app page
 * reached back from the Store would offer "Back to TDG Veditor" while standing
 * on TDG Veditor.
 *
 * So `arriveAt` is called on EVERY route change and the memory lives exactly
 * one hop. The first arrival after `rememberOrigin` records where the journey
 * went; arriving back at where it started restores the scroll and forgets it;
 * arriving anywhere ELSE forgets it too, because the reader has left the
 * journey rather than finished it. That last arm is what the old
 * consume-on-mismatch was buying, kept.
 */
type Origin = {
  hash: string
  scrollY: number
  label: string
  /** Where the journey went, learned on its first arrival. Null until then. */
  to: string | null
}

let origin: Origin | null = null

/**
 * Called as a card link is followed, before the hash changes.
 *
 * `from` is what the reader would call the place they are leaving, and it is
 * what the page they land on puts on its Back control. Without it the Store's
 * own cards would open an app page whose button said "Back to Apps" while
 * actually returning to the Store, which is a small lie told at the exact
 * moment somebody is trying to get back.
 */
export function rememberOrigin(from: string) {
  origin = { hash: window.location.hash, scrollY: window.scrollY, label: from, to: null }
}

/** True while there is a place on this site to go back to. */
export function hasOrigin() {
  return origin !== null
}

/** What to call that place, or null when there is no journey to name. */
export function originLabel(): string | null {
  return origin?.label ?? null
}

/**
 * Tell the memory a route change has landed on `hash`, and get back the scroll
 * position to restore — or null, which is every case but one.
 *
 * Called once per route change, from App.tsx, before anything decides where to
 * scroll. The three answers it can give are the whole of the contract above:
 * this is the journey's destination (keep it, so the page's Back control can
 * name where it came from), this is the journey's start (restore, forget), or
 * this is neither (forget).
 */
export function arriveAt(hash: string): number | null {
  const from = origin
  if (!from) return null
  if (from.hash === hash) {
    origin = null
    return from.scrollY
  }
  // The first arrival after the click is the journey's destination, and the
  // page standing there is the one that reads the label.
  if (from.to === null) {
    from.to = hash
    return null
  }
  // Somewhere else entirely. The journey is over and nobody finished it.
  origin = null
  return null
}
