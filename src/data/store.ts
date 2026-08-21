/**
 * What TDG sells, in one place.
 *
 * Every fact here is checkable against Stripe: the price is the `unit_amount`
 * on the live price, and the link is the live Payment Link with
 * `metadata.app=veditor, kind=pack, pack=<id>` on it — which is what the
 * `veditor-stripe-webhook` Edge Function reads to decide whose account a
 * payment lands on. Change a price in Stripe and change it here in the same
 * sitting: a page that advertises one number and charges another is the one
 * mistake a shop may not make.
 *
 * Ownership is NEVER decided here. It lives in `veditor_entitlements` on the
 * TDG Core project, written only by that webhook, and read back over RLS by
 * `useOwnedPacks`. This file only names the things ownership is about.
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
  packs: StorePack[]
}

export const STORE_APPS: StoreApp[] = [
  {
    id: 'veditor',
    title: 'TDG Veditor',
    copy: 'A desktop video editor — timeline, effects, colour and audio, with a fully customizable export and format-conversion pipeline. The editor itself is free, and importing anything is free. These two packs unlock the extras.',
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
          'Both schemes of every one — the app keeps the look when you switch',
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
          'Every resolution above 1080p — QHD, 4K, DCI and vertical 4K',
          'Video bitrates above 12,000 kbps, target and spike ceiling alike',
          '“Also Export As” — one render writing the same edit at several shapes',
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
 * The buy URL for one pack, aimed at one account.
 *
 * `client_reference_id` is how the webhook knows whose account to credit — it
 * is the FIRST thing it looks at, ahead of falling back to resolving the
 * payer's email. Without it a payment is recorded and granted to nobody, so
 * this function is never called with an empty id: the button says "Sign in to
 * buy" until there is one.
 */
export function buyUrl(pack: StorePack, userId: string, email?: string | null): string {
  const url = new URL(pack.paymentLink)
  url.searchParams.set('client_reference_id', userId)
  if (email) url.searchParams.set('prefilled_email', email)
  return url.toString()
}
