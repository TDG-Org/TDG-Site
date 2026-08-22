/**
 * What TDG sells, in one place.
 *
 * Every fact here is checkable against Stripe: the price is the `unit_amount`
 * on the live price, and the link is the live Payment Link with
 * `metadata.app=<app id>, kind=pack, pack=<pack id>` on it — which is what that
 * app's own `<app>-stripe-webhook` Edge Function reads to decide whose account
 * a payment lands on. Change a price in Stripe and change it here in the same
 * sitting: a page that advertises one number and charges another is the one
 * mistake a shop may not make.
 *
 * ## Where else an amount is written down
 *
 * A static page cannot ask Stripe what a price is — the Prices API needs a
 * secret key, and a public site may never hold one — so the literal below is
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
 * ## Ownership is never decided here
 *
 * It lives in `<app>_entitlements` on the TDG Core project, written only by
 * that app's Stripe webhook, and read back over RLS by `useOwnedPacks`. This
 * file only names the things ownership is about.
 */

export type StorePack = {
  /** Matches `metadata.pack` on the Stripe link AND the pack id the app gates on. */
  id: string
  /** Title Case — the pack's name everywhere it appears. */
  name: string
  /** USD cents, exactly as Stripe charges. Formatted for display, never typed twice. */
  priceCents: number
  /** Sentence case — one line on what it is. */
  tagline: string
  /** What buying it unlocks, in the words the app itself uses. */
  unlocks: string[]
  /** The live Stripe Payment Link. `client_reference_id` is appended at click time. */
  paymentLink: string
}

export type StoreApp = {
  id: string
  /** The app this section is for. */
  title: string
  /** Sentence case — what the app is, for somebody who has not seen it. */
  copy: string
  /** Where to get the app itself, when there is somewhere to send them. */
  appHref?: string
  /** UPPERCASE, short — a status TAG, the same shape every chip on the site is. */
  status: string
  /** Sentence case — the honest note about availability, which is a sentence and
   *  therefore never a chip: the site's chips are 9px mono tags, and a sentence
   *  wearing one reads as a code block bolted to the side of the shelf. */
  availability: string
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
 * The identity of one pack ON THE SHELF — never `pack.id` on its own.
 *
 * A pack id is only ever unique WITHIN its app: it is the string in that app's
 * `<app>_entitlements.owned_packs`, and `metadata.pack` on that app's own
 * Stripe link. DevFleet and TDG Veditor both sell one called `themes`, so a
 * shop keyed on the pack id alone would light DevFleet's card as Owned the
 * moment somebody bought Veditor's — and sell them nothing.
 */
export function packKey(appId: string, packId: string): string {
  return `${appId}:${packId}`
}

export const STORE_APPS: StoreApp[] = [
  {
    id: 'devfleet',
    title: 'DevFleet',
    entitlementsTable: 'devfleet_entitlements',
    copy: 'Every git repo on your machine as a live card, up to sixteen panes at once, each with its own terminal, diff review and notebook. DevFleet itself is free and every feature in it stays free. This one pack is only a change of scenery.',
    status: 'IN DEVELOPMENT',
    availability: 'A pack bought now sits on your account and unlocks the moment the first build lands.',
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
    title: 'TDG Veditor',
    entitlementsTable: 'veditor_entitlements',
    copy: 'A desktop video editor with a timeline, effects, colour and audio, plus an export and format-conversion pipeline you set up the way you want it. The editor itself is free, and importing anything is free. These two packs unlock the extras.',
    status: 'IN DEVELOPMENT',
    availability: 'Packs bought now sit on your account and unlock the moment the first build lands.',
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
        priceCents: 1499,
        tagline: 'Everything above 1080p, and one run that writes every shape.',
        unlocks: [
          'Every resolution above 1080p: QHD, 4K, DCI and vertical 4K',
          'Video bitrates above 12,000 kbps, target and spike ceiling alike',
          '“Also Export As”, one render writing the same edit at several shapes',
        ],
        paymentLink: 'https://buy.stripe.com/aFa14mfwO2U279g2KD4ZG0b',
      },
    ],
  },
]

/** `799` → `$7.99`. Whole dollars keep the cents, because a shop price does. */
export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/**
 * Is this pack's checkout a Stripe TEST-mode one?
 *
 * Stripe's test Payment Links are `buy.stripe.com/test_…` and its live ones are
 * `buy.stripe.com/…`, so the mode is readable straight off the URL with no key
 * and no request. Worth reading, because a test link is not broken — it is a
 * real checkout page that simply refuses every real card, and a customer who
 * meets one is told nothing about why. The card says it plainly instead.
 */
export function isTestLink(pack: StorePack): boolean {
  return new URL(pack.paymentLink).pathname.startsWith('/test_')
}

/**
 * The buy URL for one pack, aimed at one account.
 *
 * `client_reference_id` is how the webhook knows whose account to credit — it
 * is the FIRST thing it looks at, ahead of `metadata.user_id` and then falling
 * back to resolving the payer's email. Without it a payment is recorded and
 * granted to nobody, so this function is never called with an empty id: the
 * button says "Sign in to buy" until there is one.
 */
export function buyUrl(pack: StorePack, userId: string, email?: string | null): string {
  const url = new URL(pack.paymentLink)
  url.searchParams.set('client_reference_id', userId)
  if (email) url.searchParams.set('prefilled_email', email)
  return url.toString()
}
