import { useSiteContent } from '../content/store'
import { resolvedApps } from '../content/resolve'
import { DOWN_WORDING, useLiveAccess } from '../live/useLive'
import type { StoreApp } from '../data/store'

/**
 * Whether an app's packs may be BOUGHT, which is a question about the APP.
 *
 * ## Why the shop asks this at all
 *
 * A pack is a key. Selling a key to a door nobody can open yet is money taken
 * against a date we cannot promise, and this shop sold on exactly that promise
 * for four releases: *"A pack bought now sits on your account and unlocks the
 * moment the first build lands."* Two apps carried it and neither had shipped.
 *
 * So the Store's Buy buttons are gated on the same answer the app's own card
 * gives — is there a way in? — and there is only ever one answer, because both
 * surfaces read it through here. A shelf that said `Coming soon` at the top and
 * offered `Buy · $7.99` underneath was the site disagreeing with itself in one
 * scroll.
 *
 * ## Where the answer comes from, in order
 *
 * 1. **A hand-written access wins outright.** A card carrying a `download` —
 *    Makullveny's, or one the Developer console's Content tab has given it —
 *    is a human saying the app is out, and this never argues with one. It is
 *    also the lever that opens a shop the day before a deploy: change the
 *    card's access button at `#/dev` and the packs go on sale with nothing here
 *    republished. Same rule `src/live/` keeps for the card itself.
 * 2. **`released` in the catalogue**, the written floor. See `data/store.ts`
 *    for the whole argument: it may only ever raise, never lower, so a GitHub
 *    rate-limit cannot shut a launched app's shop.
 * 3. **`src/live/`** — the repo's Website field, or a real GitHub Pages deploy,
 *    or the probe's memory saying a deploy that WAS answering has stopped.
 *
 * ## And the fourth answer is `soon`, which covers two different facts
 *
 * `useLiveAccess` returns null for "never shipped" and for "could not ask"
 * alike, deliberately: for a status caption both render as the hand-written
 * status quo. For a Buy button they also agree, and in the safe direction —
 * neither is a confirmed way in, so neither may open a checkout. What must NOT
 * happen is the reverse, and rule 2 above is what stops it.
 *
 * `down` is kept apart from `soon` for the reason `src/live/` keeps them apart:
 * telling somebody who used the app yesterday that it has not launched is a lie
 * by omission, and the shop has no more licence to tell it than the card does.
 */
export type SaleState = 'open' | 'soon' | 'down'

/**
 * Is this app's shop open, and if not, why not?
 *
 * A hook, because the answer arrives from two asynchronous places — the content
 * overlay and GitHub — and both of them only ever UPGRADE what is on screen.
 * Until they answer, an unreleased app reads `soon`, which is the state that
 * sells nothing: the shop opens when something confirms it may, never while
 * nothing has said anything.
 */
export function useSaleState(app: StoreApp): SaleState {
  const doc = useSiteContent()
  /*
   * The RESOLVED card, so the Content tab's overrides count — the same read
   * `liveRepoForPage()` makes for a product page, and for the same reason: the
   * shop and the card must not answer from two different copies of one card.
   * Matched on `page`, which is the slug both catalogues already agree on.
   */
  const card = resolvedApps(doc).find((entry) => entry.page === app.page)
  const handWritten = card?.download != null

  // `undefined` is the caller saying "a human already decided this": nothing is
  // fetched and nothing is probed. See `useLiveAccess`.
  const live = useLiveAccess(handWritten || app.released ? undefined : card?.repo, app.title)

  if (handWritten || app.released) return 'open'
  if (live?.kind === 'live') return 'open'
  if (live?.kind === 'down') return 'down'
  return 'soon'
}

/**
 * What a shut shop says, in one place.
 *
 * Mechanism copy kept with the mechanism, the way `auth/wording.ts` keeps
 * refusals and `useLive.ts` keeps `DOWN_WORDING`: this is about a STATE any
 * product can be in, not about any one product, and the index card, the app
 * page and the pack card all print it, so they are given one string to print.
 *
 * Sentence case under a Title Case name, per rule 7. The name is what a chip
 * and a heading say; the line is the sentence under it.
 */
export function saleWording(
  state: Exclude<SaleState, 'open'>,
  appTitle: string,
): { name: string; line: string; short: string } {
  return state === 'down'
    ? {
        name: DOWN_WORDING,
        line: `${appTitle} has stopped answering, so its packs are off sale until it is back. Nothing is wrong with your account, and anything you already own is untouched.`,
        short: `Off sale until ${appTitle} is answering again. Anything you already own is untouched.`,
      }
    : {
        name: 'Not On Sale Yet',
        line: `${appTitle} is not out yet, so there is nothing here a pack could unlock. These go on sale the day it does.`,
        /*
         * The card's own version, because the reason is stated in full at the
         * head of the page above it and a shelf that printed the same three
         * lines under every pack would be asking somebody to read the same
         * sentence once per card to find out it had not changed.
         */
        short: `It goes on sale the day ${appTitle} does.`,
      }
}
