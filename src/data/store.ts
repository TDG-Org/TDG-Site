/**
 * What TDG sells, in one place.
 *
 * Every fact here is checkable against Stripe: the price is the `unit_amount`
 * on the live price, and the link is the live Payment Link with
 * `metadata.app=<app id>, kind=pack, pack=<pack id>` on it, which is what that
 * app's own `<app>-stripe-webhook` Edge Function reads to decide whose account
 * a payment lands on. Change a price in Stripe and change it here in the same
 * sitting: a page that advertises one number and charges another is the one
 * mistake a shop may not make.
 *
 * ## Where else an amount is written down
 *
 * A static page cannot ask Stripe what a price is. The Prices API needs a
 * secret key and a public site may never hold one, so the literal below is
 * the only option this page has, and this is where the rest of the chain is
 * written down. DevFleet's Theme Pack states its amount in three more places,
 * and DevFleet's own `verify:store-catalog` only holds the first two against
 * each other. It cannot see this file, so a change to that price means all
 * four, plus Stripe:
 *
 *   - `priceLabel` in DevFleet's `src/shared/storeCatalog.ts`  (`$7.99`)
 *   - `unitAmountCents` in DevFleet's `scripts/store-links.mjs` (`799`)
 *   - the Stripe price itself, which that script provisions
 *   - `priceCents` here
 *
 * TDG Veditor's two packs work the same way against its own repo.
 *
 * The Store page's own prose is `storeAnswers.ts`, and it is deliberately not
 * on that list: it explains the money side without ever naming an amount, so
 * changing a price here can never leave a sentence there saying the old one.
 *
 * ## Ownership is never decided here
 *
 * It lives in `<app>_entitlements` on the TDG Core project, written only by
 * that app's Stripe webhook, and read back over RLS by `useOwnedPacks`. This
 * file only names the things ownership is about.
 */

/**
 * One way to buy one pack.
 *
 * A pack used to be a single price and a single link, which was true while
 * everything on this shelf was bought outright. TDG Veditor's Pro Export Pack
 * is a subscription now — monthly, yearly, or once — so the shelf has to be
 * able to SAY which, and "ONE-TIME / YOURS FOR GOOD" printed over a monthly
 * plan is the one mistake a shop may not make.
 */
export type StorePlan = {
  id: 'monthly' | 'annual' | 'lifetime' | 'one-time'
  /** Title Case: the plan's name on its button. */
  label: string
  /** USD cents, exactly as Stripe charges. */
  priceCents: number
  /** Sentence case, appended after the amount: `/mo`, `/yr`, or empty. */
  cadence: string
  /** The live Stripe Payment Link for THIS plan. */
  paymentLink: string
}

export type StorePack = {
  /** Matches `metadata.pack` on the Stripe link AND the pack id the app gates on. */
  id: string
  /** Title Case: the pack's name everywhere it appears. */
  name: string
  /** USD cents, exactly as Stripe charges. Formatted for display, never typed twice. */
  priceCents: number
  /**
   * Every way this pack can be bought, when there is more than one.
   *
   * Absent for a pack sold a single way, so every pack that has not changed
   * reads exactly as it did. When present, the FIRST entry is the one the card
   * leads with and must match `priceCents` and `paymentLink` above — those two
   * stay the primary plan rather than becoming a fourth place to state it.
   */
  plans?: StorePlan[]
  /** Sentence case: one line on what it is. */
  tagline: string
  /** What buying it unlocks, in the words the app itself uses. */
  unlocks: string[]
  /** The live Stripe Payment Link. `client_reference_id` is appended at click time. */
  paymentLink: string
}

export type StoreApp = {
  id: string
  /**
   * The slug of this app's own page, in `src/data/appPages.ts`. Its card on the
   * Store's index and the head of its own shop page both link there, so
   * somebody deciding whether to buy can read what the app actually is first.
   * Named rather than assumed from `id`: the two happen to match today, and a
   * shop that guessed a route would break silently the first time they did not.
   */
  page: string
  /** The app this shop page is for. */
  title: string
  /** Sentence case: what the app is, for somebody who has not seen it. */
  copy: string
  /** UPPERCASE, short: a status TAG, the same shape every chip on the site is. */
  status: string
  /**
   * Sentence case: the note that stands once the shop is OPEN — one line about
   * what having a pack for this app is like. Never a chip: the site's chips are
   * 9px mono tags, and a sentence wearing one reads as a code block bolted to
   * the side of the shelf.
   *
   * **It does not say whether the packs are on sale**, and it used to. That
   * sentence is DERIVED now — `saleWording()` in `src/store/sale.ts` — because
   * a hand-written "not out yet" beside a shelf the runtime had just opened is
   * the shop contradicting itself, and it would have gone stale in exactly the
   * direction nobody checks: on launch day, when nobody is reading this file.
   */
  availability: string
  /**
   * Is the APP out — the written answer, and only a FLOOR.
   *
   * Nothing on this shelf may be bought while the app it unlocks does not
   * exist. That is not a policy the Store invented: a pack is a key, and
   * selling a key to a door nobody can reach is money taken for nothing, on a
   * date we cannot promise. So `src/store/sale.ts` gates every Buy button on
   * whether the app is available, reading the SAME answer the app's own card
   * reads — a hand-written access, the Developer console's override, or
   * `src/live/` finding a real deploy — so launch day opens the shop with
   * nothing here to edit.
   *
   * This field is what that runtime answer cannot be trusted to say on its
   * own, in ONE direction. `src/live/` is allowed to fail: GitHub rate-limits
   * at 60 unauthenticated requests an hour, and it answers `null` for "never
   * shipped" and for "could not ask" alike. Read as the whole truth, a hiccup
   * would quietly shut a launched app's shop, which is a revenue bug that
   * fails silently and looks exactly like working software.
   *
   * So the runtime may only ever RAISE this. `true` says the app is out and
   * its packs sell whatever GitHub manages to answer; `false` leaves the
   * decision to the live read, which can open the shop and can never close one
   * this file has already opened. Set it in the same sitting the app ships —
   * and if it is forgotten, the live read has already opened the shop anyway,
   * which is the safe way round for a field to go stale.
   *
   * An app that will never ship simply stays `false` for ever and never
   * becomes live, so nothing here has to encode "never" as a third value: the
   * shelf stays a catalogue, `availability` is where that is SAID, and the
   * people who already own packs keep their cards and their Cancel buttons.
   */
  released: boolean
  /**
   * The table this app's ownership lives in, on the shared TDG Core project.
   *
   * Every app gets its OWN table rather than one shared one, deliberately: two
   * products behind one ownership table means a schema change made for one can
   * break the other's purchases, and a purchase that breaks is money that
   * arrived and a customer who did not get what they paid for. Each grants the
   * owner `select` on their own row and carries no client write policy at all.
   */
  entitlementsTable: string
  packs: StorePack[]
}

/**
 * The identity of one pack ON THE SHELF. Never `pack.id` on its own.
 *
 * A pack id is only ever unique WITHIN its app: it is the string in that app's
 * `<app>_entitlements.owned_packs`, and `metadata.pack` on that app's own
 * Stripe link. DevFleet and TDG Veditor both sell one called `themes`, so a
 * shop keyed on the pack id alone would light DevFleet's card as Owned the
 * moment somebody bought Veditor's, and sell them nothing.
 */
export function packKey(appId: string, packId: string): string {
  return `${appId}:${packId}`
}

export const STORE_APPS: StoreApp[] = [
  {
    id: 'devfleet',
    page: 'devfleet',
    title: 'DevFleet',
    entitlementsTable: 'devfleet_entitlements',
    copy: 'Every git repo on your machine as a live card, up to sixteen panes at once, each with its own terminal, diff review and notebook. DevFleet itself is free and every feature in it stays free. This one pack is only a change of scenery.',
    status: 'IN DEVELOPMENT',
    // This used to read "A pack bought now sits on your account and unlocks the
    // moment the first build lands", and the shop sold on that promise while
    // DevFleet did not exist. It is not a promise we can keep on a date, so the
    // shelf is a catalogue until the app is out (`released` above) and the
    // sentence that says so is derived. This is the line for once it IS out.
    availability: 'The pack sits on your TDG Account rather than on a machine, so it is there on every computer you install DevFleet on.',
    released: false,
    packs: [
      {
        id: 'themes',
        name: 'Theme Pack',
        priceCents: 799,
        tagline: 'Five more palettes for the whole app, each in a full light and a full dark.',
        unlocks: [
          'Cozy Cabin, Neon City, Cherry Blossom, Nebula and Cotton Candy',
          'A full light and a full dark of every one, so the palette holds when you switch',
          'Every card, pane, dialog and control, not just the background',
        ],
        paymentLink: 'https://buy.stripe.com/00w7sK98q1PYctA70T4ZG0d',
      },
    ],
  },
  {
    id: 'veditor',
    page: 'veditor',
    title: 'TDG Veditor',
    entitlementsTable: 'veditor_entitlements',
    copy: 'A desktop video editor with a timeline, effects, colour and audio, plus an export and format-conversion pipeline you set up the way you want it. The editor itself is free, and importing anything is free. These two packs unlock the extras.',
    status: 'IN DEVELOPMENT',
    availability: 'Both packs sit on your TDG Account rather than on a machine, so they are there on every computer you install the editor on.',
    released: false,
    packs: [
      {
        id: 'themes',
        name: 'Theme Pack',
        priceCents: 799,
        tagline: 'Five more looks for the whole editor, each in light and dark.',
        unlocks: [
          'Cozy Cabin, Neon City, Cherry Blossom, Nebula and Cotton Candy',
          'Both schemes of every one, so the app keeps the look when you switch',
          'Every panel, dialog and control, not just the background',
        ],
        paymentLink: 'https://buy.stripe.com/5kQeVc98q7ai79getl4ZG0a',
      },
      {
        id: 'pro-export',
        name: 'Pro Export Pack',
        // The MONTHLY plan is the primary one, so these two fields and
        // `plans[0]` are the same price and the same link rather than a second
        // place to state them. The old $14.99 one-time link this pack used to
        // carry is deactivated in Stripe: it undercut both the subscription
        // and Lifetime for anybody who still had the URL.
        priceCents: 599,
        tagline: 'Export up to the editor’s full 16,384 × 16,384 and 400,000 kbps limits, write several shapes at once, and work with multiple Timelines.',
        unlocks: [
          'Project and export frames above 1080p, up to 16,384 × 16,384: QHD, 4K, DCI, vertical 4K and custom sizes',
          'Target video bitrates from 12,001 to 400,000 kbps, with manual spike ceilings up to 800,000 kbps',
          '“Also Export As”, one render writing the same edit at several shapes',
          'More than one Timeline in a project, side by side in the tab strip',
          'Exporting several Timelines in one run, queued one after another',
        ],
        paymentLink: 'https://buy.stripe.com/bJe9ASfwOcuCeBI1Gz4ZG0h',
        plans: [
          {
            id: 'monthly',
            label: 'Monthly',
            priceCents: 599,
            cadence: '/mo',
            paymentLink: 'https://buy.stripe.com/bJe9ASfwOcuCeBI1Gz4ZG0h',
          },
          {
            id: 'annual',
            label: 'Yearly',
            priceCents: 4900,
            cadence: '/yr',
            paymentLink: 'https://buy.stripe.com/aFadR81FYeCK51884X4ZG0i',
          },
          {
            id: 'lifetime',
            label: 'Lifetime',
            priceCents: 12900,
            cadence: '',
            paymentLink: 'https://buy.stripe.com/7sYbJ070i9iqfFMgBt4ZG0j',
          },
        ],
      },
    ],
  },
]

/** `799` → `$7.99`. Whole dollars keep the cents, because a shop price does. */
export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/**
 * The lowest amount that gets somebody into ANY of one app's packs, in cents.
 *
 * The Store's index card prints it as `From $5.99`, and it is derived rather
 * than written down for the reason `annualSavingCents` is: a "from" price typed
 * beside a catalogue is a claim that goes quietly wrong the first time a
 * cheaper pack is added or a price moves, and the mistake it makes is the one
 * this file's header says a shop may not make. A pack's own `priceCents` is its
 * cheapest way in by definition — `plans[0]` must match it — so this is a
 * minimum over the packs and nothing more.
 *
 * `null` for an app with no packs, which is not a shape the catalogue has
 * today and is still the honest answer if it ever does: there is no price to
 * state, so the card states none.
 */
export function cheapestPlan(app: StoreApp): number | null {
  const amounts = app.packs.map((pack) => pack.priceCents)
  return amounts.length > 0 ? Math.min(...amounts) : null
}

/**
 * Is this pack RENTED rather than bought?
 *
 * Asked of the plans rather than of the pack id, so the answer stays true if
 * another pack ever gains a subscription. A pack with no plans is one-time,
 * which is what every pack on this shelf was until the Pro Export Pack moved.
 */
export function isSubscription(pack: StorePack): boolean {
  return (pack.plans ?? []).some((plan) => plan.id === 'monthly' || plan.id === 'annual')
}

/**
 * What a yearly plan saves against paying monthly for the same year, in cents.
 *
 * DERIVED, never written down, so it can never disagree with the two amounts
 * it is about: change either price above and this moves with it. A saving is
 * the one claim a shop makes that is arithmetic rather than opinion, and the
 * only way to get it wrong is to state it twice.
 *
 * `null` when there is nothing honest to say — no monthly plan to measure
 * against, or a yearly price that saves nothing.
 */
export function annualSavingCents(plans: readonly StorePlan[]): number | null {
  const monthly = plans.find((plan) => plan.id === 'monthly')
  const annual = plans.find((plan) => plan.id === 'annual')
  if (!monthly || !annual) return null
  const saved = monthly.priceCents * 12 - annual.priceCents
  return saved > 0 ? saved : null
}

/**
 * Is this pack's checkout a Stripe TEST-mode one?
 *
 * Stripe's test Payment Links are `buy.stripe.com/test_…` and its live ones are
 * `buy.stripe.com/…`, so the mode is readable straight off the URL with no key
 * and no request. Worth reading, because a test link is not broken. It is a
 * real checkout page that simply refuses every real card, and a customer who
 * meets one is told nothing about why. The card says it plainly instead.
 */
export function isTestLink(pack: StorePack): boolean {
  return new URL(pack.paymentLink).pathname.startsWith('/test_')
}

/**
 * The buy URL for one pack, aimed at one account.
 *
 * `client_reference_id` is how the webhook knows whose account to credit. It
 * is the FIRST thing it looks at, ahead of `metadata.user_id` and then falling
 * back to resolving the payer's email. Without it a payment is recorded and
 * granted to nobody, so this function is never called with an empty id: the
 * button says "Sign in to buy" until there is one.
 */
export function buyUrl(
  pack: StorePack,
  userId: string,
  email?: string | null,
  plan?: StorePlan,
): string {
  const url = new URL(plan?.paymentLink ?? pack.paymentLink)
  url.searchParams.set('client_reference_id', userId)
  if (email) url.searchParams.set('prefilled_email', email)
  return url.toString()
}
