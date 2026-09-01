import { useEffect, useRef, useState } from 'react'
import { mergeRefs } from '../lib/mergeRefs'
import { useParallax } from '../hooks/useParallax'
import { useReveal } from '../hooks/useReveal'
import { useTilt } from '../hooks/useTilt'
import { useAuth } from '../auth/AuthProvider'
import { useOwnedPacks, type OwnedState, type Revocation } from '../store/useOwnedPacks'
import {
  formatDay,
  standingOfGrant,
  standingTone,
  type PackGrant,
  type PackStanding,
} from '../store/grant'
import { billingMessage, openBilling, setRenewal, type BillingError } from '../store/billing'
import { saleWording, useSaleState, type SaleState } from '../store/sale'
import { SectionsProvider } from '../lib/sections'
import { appHash, rememberOrigin, storeAppHash, STORE_HASH } from '../lib/route'
import { AppIcon } from './AppIcon'
import { iconFor } from '../content/resolve'
import { useSiteContent } from '../content/store'
import { PlanPanel, PlanRow, planNote } from './PlanChooser'
import { CloudShelf } from '../cloud/CloudShelf'
import { BackButton, Fold, FoldControls, OnwardButton, PageNav } from './Folded'
import { STORE_ANSWERS, STORE_BILLING_LINK_NOTICE } from '../data/storeAnswers'
import {
  STORE_APPS,
  annualSavingCents,
  buyUrl,
  cheapestPlan,
  formatUsd,
  isTestLink,
  isSubscription,
  type StorePlan,
  packKey,
  type StoreApp,
  type StorePack,
} from '../data/store'
import './Store.css'

/**
 * The shop, in two views over one set of state.
 *
 * ## Why it is two views and not one long page
 *
 * It used to be a single scroll: a head, then every app's shelf one after
 * another, then the money folds. That put a reader who came for one pack past
 * every other app's cards to reach it, and it grew by a whole screen each time
 * an app started selling something — a page whose length is the size of the
 * catalogue is a page that gets worse every time the shop does well.
 *
 * So the Store is now an INDEX of app cards, and each card opens that app's own
 * shop page at `#/store/<app>` where its packs, its prices and its buy buttons
 * live. `#/store/<app>` used to be the same page scrolled to a shelf; it is a
 * page of its own now, and `src/lib/route.ts` says so at the route.
 *
 * ## What both views carry, and why it is the same components
 *
 * The account strip, the `Before You Pay` block and the money folds are drawn
 * by `AccountStrip`, `BeforeYouPay` and `MoneyAnswers` on BOTH views rather
 * than on the index alone. Rule 10 of AGENTS.md is that the refund policy is
 * readable before somebody presses Buy, and Buy now lives on the app's page —
 * a policy one click behind the button is a policy found the day it is wanted.
 * One component each, so the two views cannot drift into two answers.
 *
 * ## Why the state lives here and not in either view
 *
 * `pending` is the pack whose Stripe tab is open, and the watch that polls for
 * it has a five-minute deadline. Both sit in `Store`, which is the parent of
 * both views, so walking back to the index while a payment is in flight does
 * not throw the wait away.
 */

/** How long to keep asking after a buy before giving the button back. */
const WAIT_MS = 5 * 60 * 1000
const POLL_MS = 4000

type CardState =
  | { kind: 'checking' }
  | { kind: 'signedOut' }
  | { kind: 'error' }
  | { kind: 'owned'; justLanded: boolean }
  | { kind: 'waiting' }
  /**
   * Out of reach: this account may not have this pack and may not buy it.
   *
   * A SEVENTH state and not a variant of `buy`, because the two say opposite
   * things with the same absence. A pack that lapsed is unowned and the shop
   * should sell it again; a revoked one is unowned and must never be offered,
   * and a card that answered "Buy" would be taking money for something the
   * database will refuse to record.
   *
   * It carries the block rather than a flag, because the reason and the date
   * are the whole point — a card that says only "you cannot have this" is worse
   * than one that does not mention it, and this is the one place the person it
   * is about will ever read it.
   */
  | { kind: 'revoked'; block: Revocation }
  /**
   * The shop is shut for this app, because the app itself is not available.
   *
   * An EIGHTH state and not a quiet `buy` with the button removed. A pack
   * nobody can buy has to say why, or the card is a price list with a hole
   * where its action was — which reads as a page that failed to load, and
   * gives a reader nothing to come back for. It is also not `revoked`: that is
   * about this account and carries a reason we wrote for them, and this is
   * about the app and is true for everybody.
   *
   * It replaces `buy` and `signedOut` and nothing else. Owning, waiting,
   * checking and the failed read all keep their faces — a shut shop is no
   * reason to stop telling somebody what they already own, and every Manage or
   * Cancel Plan on this page goes on working while it is shut.
   */
  | { kind: 'closed'; why: Exclude<SaleState, 'open'> }
  | { kind: 'buy' }

/**
 * The two states that OFFER to sell, replaced when the shop is shut.
 *
 * A wrapper rather than a branch inside `cardState`, so the precedence that
 * file argues for is untouched: `revoked` still outranks ownership, a failed
 * read still says the read failed rather than being overwritten by a fact about
 * the app, and `checking` still says it is checking. Only the two answers that
 * end in a Buy button are the shop's to withdraw.
 */
function withSale(state: CardState, sale: SaleState): CardState {
  if (sale === 'open') return state
  if (state.kind === 'buy' || state.kind === 'signedOut') return { kind: 'closed', why: sale }
  return state
}

function Tick() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

/** The chevron on a button that opens something. Points at where it opens. */
function Caret() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m6 15 6-6 6 6" />
    </svg>
  )
}

function Cross() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

/*
 * `PlanPanel`, `PlanRow` and `planNote` used to be defined here and moved to
 * `PlanChooser.tsx` when the Cloud shelf arrived — rule 11 is kept by every
 * chooser on this site BEING that one component, so a third shop could not be
 * allowed to grow a lookalike. Nothing about them changed in the move.
 */

/**
 * Where the subscription panel is, once it is open.
 *
 * A state machine rather than four booleans, because two of these are mutually
 * exclusive in a way booleans do not enforce: a panel that is both `busy` and
 * showing its menu would take a second press while the first is still in
 * flight, and cancelling twice is a support email.
 */
type ManageStep =
  | { at: 'menu' }
  /** A question, because both of these move money and neither should be one press. */
  | { at: 'confirm'; what: 'cancel' | 'outright' }
  | { at: 'busy'; doing: string }
  | { at: 'error'; error: BillingError }

function PackCard({
  pack,
  appId,
  appTitle,
  index,
  state,
  sale,
  grant,
  onBuy,
  onSignIn,
  onCheck,
}: {
  pack: StorePack
  /** The app this pack belongs to, which is half of the pack's real identity. */
  appId: string
  /** The app this pack is for, so a card never names the wrong one. */
  appTitle: string
  index: number
  state: CardState
  /**
   * Whether the shop is open for this app, handed down beside `state` rather
   * than folded into it: `withSale` only replaces the two states that END in a
   * Buy button, so an owner's card is `owned` whatever the shop is doing — and
   * the Manage panel inside it still sells one thing, Buy It Outright, which
   * has to know.
   */
  sale: SaleState
  /** How this account holds it, when the app records that. Null when it does not. */
  grant: PackGrant | null
  onBuy: (plan?: StorePlan) => void
  onSignIn: () => void
  onCheck: () => void
}) {
  const reveal = useReveal<HTMLElement>('card3d', index % 3)
  const tilt = useTilt<HTMLElement>()
  const owned = state.kind === 'owned'
  const saleOpen = sale === 'open'
  /** What a shut shop says here, or null while it is open. One read of the
   *  wording, so the name and the line cannot come from two calls. */
  const shut = state.kind === 'closed' ? saleWording(state.why, appTitle) : null
  const testMode = isTestLink(pack)
  const subscription = isSubscription(pack)
  const plans = pack.plans ?? []
  const primaryPlan = plans[0] ?? null
  const multiPlan = plans.length > 1
  const saving = multiPlan ? annualSavingCents(plans) : null
  const lifetimePlan = plans.find((plan) => plan.id === 'lifetime') ?? null

  /**
   * What this account's own grant says about this pack, in the card's words.
   *
   * The catalogue decides whether a pack can recur. An old or malformed grant
   * must never turn a one-time Theme Pack into a subscription merely because
   * its stored object says `kind: subscription`.
   */
  const standing = standingOfGrant(subscription ? grant : null)

  /**
   * Is a chooser open over this card, and which one?
   *
   * Per CARD, never per page: two cards on a shelf are two independent shops
   * as far as this is concerned, and a single shared flag would open the wrong
   * one the first time a second pack gained plans. One flag for both choosers
   * rather than two, because the card can only ever be in one of Buy and Owned,
   * so two of them could never be open at once and a second flag would only be
   * a second thing to remember to close.
   */
  const [choosing, setChoosing] = useState(false)
  const [step, setStep] = useState<ManageStep>({ at: 'menu' })
  /**
   * What was true the instant Stripe answered, before the webhook has written
   * the grant and the next read has fetched it.
   *
   * That round trip is seconds, and for those seconds the card would otherwise
   * still say "Renews on…" to somebody who has just pressed Cancel and watched
   * nothing happen. This is only ever the SAME fact arriving sooner: the grant
   * replaces it the moment it lands, and a reload forgets it entirely.
   */
  const [justChanged, setJustChanged] = useState<PackStanding | null>(null)
  const buyRef = useRef<HTMLButtonElement>(null)

  const closeChooser = (refocus = true) => {
    setChoosing(false)
    setStep({ at: 'menu' })
    if (refocus) buyRef.current?.focus()
  }

  const shown = justChanged ?? standing

  /**
   * Every current subscription standing gets the same management entrance.
   *
   * This used to fall back to Developer Mode when `subscriptionId` was absent,
   * which made the button appear and disappear when an ordinary account was
   * promoted. Visibility is about what the account holds, never its permission.
   * `manageable` still says whether Stripe actions have a real id to act on;
   * the panel names a missing link instead of hiding the whole cancellation
   * surface. The catalogue check keeps one-time packs out even if stale data
   * gives one an impossible subscription-shaped grant.
   */
  const canManage =
    subscription &&
    (shown.kind === 'active' ||
      shown.kind === 'ending' ||
      shown.kind === 'trial' ||
      shown.kind === 'dunning')
  const billingLinkMissing = canManage && !shown.manageable

  // A chooser belongs to the state that opened it and to nothing else. A card
  // that flips to Waiting mid-choice must not leave one hanging over the wait,
  // and a card whose wait times out must not find one still open underneath.
  //
  // `canManage` is in here for the same reason one level down: a re-read that
  // lands a lapsed standing takes the subscription button away, and a panel
  // left open with nothing behind it would be a dialog the reader cannot get
  // back to and cannot act in.
  useEffect(() => {
    if ((state.kind !== 'buy' && state.kind !== 'owned') || (state.kind === 'owned' && !canManage)) {
      setChoosing(false)
      setStep({ at: 'menu' })
    }
  }, [state.kind, canManage])

  // A fresh answer from the server replaces the optimistic one. Keyed on the
  // grant's own fields rather than on a timer: the point is to stop guessing
  // the moment there is something better to say.
  useEffect(() => {
    setJustChanged(null)
  }, [grant?.cancelAtPeriodEnd, grant?.currentPeriodEnd, grant?.status])

  /** Stop the renewals, or put them back. Both are the same one call. */
  const changeRenewal = async (renew: boolean) => {
    setStep({ at: 'busy', doing: renew ? 'Starting the renewals again…' : 'Stopping the renewals…' })
    const result = await setRenewal({ app: appId, pack: pack.id, renew })
    if (!result.ok) {
      setStep({ at: 'error', error: result.error })
      return
    }
    // Say the new thing NOW, from what Stripe just confirmed, and ask the
    // server to catch up in the background.
    setJustChanged(
      standingOfGrant({
        ...grant,
        kind: 'subscription',
        status: grant?.status ?? 'active',
        cancelAtPeriodEnd: !renew,
        currentPeriodEnd: result.value.currentPeriodEnd ?? grant?.currentPeriodEnd ?? null,
      }),
    )
    closeChooser()
    onCheck()
  }

  /** Off to Stripe's own page, in a new tab so the shop is still here after. */
  const goToStripe = async (intent: 'update' | 'billing') => {
    setStep({ at: 'busy', doing: 'Opening your billing page…' })
    const result = await openBilling({ app: appId, pack: pack.id, intent })
    if (!result.ok) {
      setStep({ at: 'error', error: result.error })
      return
    }
    window.open(result.value, '_blank', 'noopener,noreferrer')
    closeChooser()
  }

  /**
   * Buy it outright while subscribed: stop the renewals FIRST, then check out.
   *
   * Order matters and it is the safe way round. Paying first and cancelling
   * after leaves a window in which somebody owns the pack for ever AND is still
   * being billed monthly for it, and the perpetual grant that lands overwrites
   * the subscription id, so nothing on this page could find the subscription to
   * stop afterwards. Cancelling first cannot lose anything: the days already
   * paid for are kept either way, and somebody who then abandons the checkout
   * is left in a state the card SAYS out loud, with Resume Subscription on it.
   *
   * The row says all of that before it is pressed, and the confirm says it
   * again. A shop may surprise nobody about money.
   */
  const buyOutright = async () => {
    // The row is not drawn while the shop is shut, and this refuses on its
    // own account as well: the cancel below is a money action, and it must
    // never be taken on the strength of a checkout that `onBuy` is then going
    // to refuse to open. That happened — the renewals stopped, the panel
    // closed on "Ends Soon", and no Stripe tab came — before the shop's
    // state reached this card.
    if (!lifetimePlan || !saleOpen) return
    setStep({ at: 'busy', doing: 'Stopping the renewals…' })
    const result = await setRenewal({ app: appId, pack: pack.id, renew: false })
    if (!result.ok) {
      setStep({ at: 'error', error: result.error })
      return
    }
    setJustChanged(
      standingOfGrant({
        ...grant,
        kind: 'subscription',
        status: grant?.status ?? 'active',
        cancelAtPeriodEnd: true,
        currentPeriodEnd: result.value.currentPeriodEnd ?? grant?.currentPeriodEnd ?? null,
      }),
    )
    closeChooser()
    onBuy(lifetimePlan)
  }

  return (
    <article ref={mergeRefs(reveal, tilt)} className="card store__pack" data-owned={owned || undefined}>
      <span className="card__spot" aria-hidden="true" />
      <span className="card__edge" aria-hidden="true" />

      {/*
        The chips and the amount have to agree with the PLAN. Printing
        "ONE-TIME / YOURS FOR GOOD" over a monthly subscription is a shop
        telling somebody the wrong thing about their own money, which is the
        one mistake this file's header says a shop may not make.
      */}
      <div className="store__pack-head">
        <div className="chips">
          {subscription ? (
            <>
              <span className="chip">SUBSCRIPTION</span>
              <span className="chip">CANCEL ANY TIME</span>
            </>
          ) : (
            <>
              <span className="chip">ONE-TIME</span>
              <span className="chip">YOURS FOR GOOD</span>
            </>
          )}
        </div>
        <div className="store__price">
          {formatUsd(pack.priceCents)}
          {primaryPlan?.cadence ? <span className="store__cadence">{primaryPlan.cadence}</span> : null}
        </div>
      </div>

      {/* An `h3` because the page's own title is the `h2` above it. On the old
          single-scroll Store this was an `h4` under a shelf head that was an
          `h3`; that head is the app card on the index now, so a pack name that
          stayed an `h4` would skip a level in the outline. */}
      <h3 className="store__pack-name">{pack.name}</h3>
      <p className="store__pack-tagline">{pack.tagline}</p>

      <ul className="store__unlocks">
        {pack.unlocks.map((line) => (
          <li key={line}>
            <span className="store__unlock-tick" aria-hidden="true">
              <Tick />
            </span>
            {line}
          </li>
        ))}
      </ul>

      <div className="store__action">
        {/*
          Said first, and said in full. This is the only surface the person it
          is about will ever see it on, so it carries the three things that make
          it answerable rather than merely final: what happened, why (in the
          words a developer wrote FOR them, not a status code), and when. A
          block with no reason recorded says that too — "no reason was given" is
          a fact somebody can act on and a silence is not.
        */}
        {state.kind === 'revoked' && (
          <>
            <p className="store__revoked">
              <span className="store__revoked-mark" aria-hidden="true">
                <Cross />
              </span>
              <span>
                <strong>
                  {state.block.pack === '*'
                    ? `${appTitle} is not available on this account`
                    : `${pack.name} is not available on this account`}
                </strong>
                <span className="store__revoked-why">
                  {state.block.reason
                    ? state.block.reason
                    : 'No reason was recorded with it.'}
                </span>
              </span>
            </p>
            <p className="store__note store__note--warn">
              We removed it on {formatDay(state.block.created_at) ?? 'an earlier date'}, and it
              cannot be bought again from here. If you think this is wrong, send us feedback from
              the account menu and we will look at it.
            </p>
          </>
        )}

        {state.kind === 'checking' && <p className="store__note store__note--quiet">Checking your account…</p>}

        {/*
          A shut shop, said where the Buy button would have been, because that
          is where a reader is looking for it. The whole list of what the pack
          unlocks stays above it: a catalogue is still worth reading, and
          somebody deciding whether to wait for the app wants to know what
          waiting gets them.
        */}
        {shut && (
          <p className="store__soon">
            <span className="store__soon-name">{shut.name}</span>
            <span className="store__soon-line">{shut.short}</span>
          </p>
        )}

        {state.kind === 'signedOut' && (
          <>
            <button type="button" className="store__buy" onClick={onSignIn}>
              Sign in to buy
            </button>
            <p className="store__note">
              A pack is added to your TDG Account, so it follows you to every machine.
            </p>
          </>
        )}

        {state.kind === 'error' && (
          <>
            <p className="store__note store__note--warn">
              We couldn't check your purchases just now. Nothing is wrong with your account.
            </p>
            <button type="button" className="store__ghost" onClick={onCheck}>
              Try again
            </button>
          </>
        )}

        {state.kind === 'owned' && (
          <>
            {/*
              Owned is the headline and stays the headline, because it is what
              a reader came to check. HOW it is held sits beside it, and only
              when there is something to say: a pack bought outright has no
              second state and a tag on it would be a word to read every time
              that never changes, which is how the tag on the one that DOES
              change gets skipped.
            */}
            <p className="store__owned" data-tone={standingTone(shown)}>
              <span className="store__owned-tick" aria-hidden="true">
                <Tick />
              </span>
              Owned
              {shown.kind !== 'perpetual' && (
                <span className="store__owned-standing">{shown.label}</span>
              )}
            </p>
            <p className="store__note">
              {shown.kind === 'perpetual'
                ? state.justLanded
                  ? `Payment received. It is on your account now, so open ${appTitle} and it is there.`
                  : `On your TDG Account. Sign in inside ${appTitle} and it unlocks.`
                : state.justLanded
                  ? `Payment received. ${shown.note}`
                  : shown.note}
            </p>

            {/*
              ONE button, in the same place and at the same size as the Buy
              button the card carries in its other state, per rule 11. A
              subscription somebody cannot change from the page that sold it to
              them is a subscription they have to email us about, and "email us
              to cancel" is a dark pattern however politely it is worded.

              Drawn for every current subscription standing, regardless of the
              account's Developer permission. A missing Stripe link is named
              inside the panel; it never hides the cancellation entrance.
            */}
            {canManage && (
              <button
                ref={buyRef}
                type="button"
                className="store__buy store__buy--quiet"
                aria-haspopup="dialog"
                aria-expanded={choosing}
                onClick={() => (choosing ? closeChooser() : setChoosing(true))}
              >
                Manage or Cancel Plan
                <span className="store__buy-caret">
                  <Caret />
                </span>
              </button>
            )}

            {choosing && canManage && (
              <PlanPanel
                label={`Manage or cancel your ${pack.name} subscription`}
                title="Manage Subscription"
                step={step.at === 'confirm' ? `confirm-${step.what}` : step.at}
                onClose={() => closeChooser()}
              >
                {/* Said before the rows rather than after them, because it
                    changes what every row below means. This is an entitlement
                    integrity warning for the account holder, not a developer
                    preview and never permission-gated. */}
                {billingLinkMissing && (
                  <p className="store__billing-note">
                    <strong>{STORE_BILLING_LINK_NOTICE.name}.</strong>{' '}
                    {STORE_BILLING_LINK_NOTICE.text}
                  </p>
                )}
                {step.at === 'menu' && (
                  /* `data-menu` reserves a two-line note in every row, so four
                     controls of four different lengths are still four rows of
                     one height. See `Store.css`; the buy chooser deliberately
                     does not carry it. */
                  <ul className="store__plan-list" data-menu>
                    <PlanRow
                      label="Change Plan"
                      note="Move between plans on Stripe's page. You pay the difference."
                      onClick={() => void goToStripe('update')}
                    />
                    {/* Only while it is still renewing. Offering to stop the
                        renewals of something already stopping is a row that
                        does nothing, and a row that does nothing on a panel
                        about money reads as a page that has lost track. */}
                    {/* And only while the shop is OPEN: a shut shop sells no
                        keys, outright ones included (rule 5's `closed`), and
                        the row is replaced by the reason rather than left to
                        press a cancel it cannot follow with a checkout. */}
                    {lifetimePlan && !shown.ending && !saleOpen && (
                      <li className="store__plan-notice">
                        Buying it outright is off for now. {saleWording(sale, appTitle).short}
                      </li>
                    )}
                    {lifetimePlan && !shown.ending && saleOpen && (
                      <PlanRow
                        label="Buy It Outright"
                        note={
                          shown.endsAt
                            ? `Pay once and keep it. Renewals stop on ${formatDay(shown.endsAt.toISOString())}.`
                            : 'Pay once and keep it. Renewals stop at the end of this period.'
                        }
                        money={
                          <span className="store__plan-price">
                            {formatUsd(lifetimePlan.priceCents)}
                          </span>
                        }
                        onClick={() => setStep({ at: 'confirm', what: 'outright' })}
                      />
                    )}
                    {shown.ending ? (
                      <PlanRow
                        label="Resume Subscription"
                        note="Renewals start again, on the same plan. Nothing is charged today."
                        onClick={() => void changeRenewal(true)}
                      />
                    ) : (
                      <PlanRow
                        label="Cancel Subscription"
                        note={
                          shown.endsAt
                            ? `Renewals stop. Yours until ${formatDay(shown.endsAt.toISOString())}.`
                            : 'Renewals stop. Yours to the end of the period you have paid for.'
                        }
                        tone="leave"
                        onClick={() => setStep({ at: 'confirm', what: 'cancel' })}
                      />
                    )}
                    <PlanRow
                      label="Payment & Receipts"
                      note="Change the card, or read past charges, on Stripe's page."
                      onClick={() => void goToStripe('billing')}
                    />
                  </ul>
                )}

                {step.at === 'confirm' && (
                  <div className="store__ask">
                    <p className="store__ask-q">
                      {step.what === 'cancel' ? 'Cancel this subscription?' : 'Buy it outright?'}
                    </p>
                    <p className="store__ask-what">
                      {step.what === 'cancel'
                        ? shown.endsAt
                          ? `Nothing more is charged, and nothing is taken away today. Every part of ${pack.name} keeps working until ${formatDay(shown.endsAt.toISOString())}, and you can start the renewals again before then.`
                          : `Nothing more is charged, and nothing is taken away today. ${pack.name} keeps working to the end of the period you have paid for.`
                        : shown.endsAt
                          ? `We stop the renewals first, so you are never charged for both. ${pack.name} stays yours until ${formatDay(shown.endsAt.toISOString())} either way, and Stripe opens in a new tab for the one-off payment.`
                          : `We stop the renewals first, so you are never charged for both. Stripe opens in a new tab for the one-off payment.`}
                    </p>
                    <div className="store__ask-row">
                      <button
                        type="button"
                        className="store__ghost"
                        onClick={() => setStep({ at: 'menu' })}
                      >
                        {step.what === 'cancel' ? 'Keep My Plan' : 'Not Now'}
                      </button>
                      {/* Warm for the one that stops a payment, the site's own
                          inverted button for the one that makes one. The press
                          that ends a subscription may never wear the colour
                          this site uses to mean "yes, buy". */}
                      <button
                        type="button"
                        className={
                          step.what === 'cancel' ? 'store__buy store__buy--leave' : 'store__buy'
                        }
                        onClick={() =>
                          step.what === 'cancel' ? void changeRenewal(false) : void buyOutright()
                        }
                      >
                        {step.what === 'cancel' ? 'Yes, Stop Renewals' : 'Yes, Continue'}
                      </button>
                    </div>
                  </div>
                )}

                {/* `role="status"`: the confirm button that was pressed has just
                    unmounted under the reader's focus, so this line is the only
                    thing that says the press was taken — and a screen reader
                    only hears it if it is announced. Same on the refusal and
                    the card's own wait below. */}
                {step.at === 'busy' && (
                  <p className="store__waiting store__waiting--panel" role="status">
                    <span className="store__waiting-dot" aria-hidden="true" />
                    {step.doing}
                  </p>
                )}

                {/* A refusal says what happened, says that nothing changed, and
                    ends in something to do. `billingMessage` is the one place
                    that wording lives, matched on codes and never on message
                    text — see `src/auth/wording.ts` for why. */}
                {step.at === 'error' && (
                  <div className="store__ask">
                    <p className="store__note store__note--warn" role="alert">
                      {billingMessage(step.error)}
                    </p>
                    <div className="store__ask-row">
                      <button
                        type="button"
                        className="store__ghost"
                        onClick={() => setStep({ at: 'menu' })}
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        className="store__ghost"
                        onClick={() => closeChooser()}
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )}
              </PlanPanel>
            )}
          </>
        )}

        {state.kind === 'waiting' && (
          <>
            <p className="store__waiting" role="status">
              <span className="store__waiting-dot" aria-hidden="true" />
              Waiting for your payment…
            </p>
            <p className="store__note">
              Finish in the Stripe tab. It lands on your account within a minute of paying.
            </p>
            <button type="button" className="store__ghost" onClick={onCheck}>
              Check now
            </button>
          </>
        )}

        {state.kind === 'buy' && (
          <>
            {/* A subscription that has run out puts the card back to Buy, which
                is right — they do not have it and the shop should sell it. But
                a card that says only "Buy" to somebody who had this last week
                has quietly dropped the part they would ask about, so the state
                that made it buyable again gets its own line. Perpetual grants
                never reach here: a pack bought outright does not leave. */}
            {shown.kind === 'lapsed' && (
              <p className="store__note store__note--warn">{shown.note}</p>
            )}
            {/*
              ONE button, whatever the pack costs and however many ways it is
              sold. A pack sold three ways used to print three buttons, which
              gave its card a taller, differently-shaped action row than the
              one-time pack beside it: the same shelf, the same size card, and
              two buttons that did not line up. So the several ways moved into
              a chooser that opens OVER the card when the one button is
              pressed, and the button itself stayed exactly what its neighbour
              has. Nothing is picked silently — the chooser prices every way
              before anything opens.
            */}
            {multiPlan && primaryPlan ? (
              <button
                ref={buyRef}
                type="button"
                className="store__buy"
                aria-haspopup="dialog"
                aria-expanded={choosing}
                onClick={() => (choosing ? closeChooser() : setChoosing(true))}
              >
                Buy {pack.name} · From {formatUsd(primaryPlan.priceCents)}
                {primaryPlan.cadence}
                <span className="store__buy-caret">
                  <Caret />
                </span>
              </button>
            ) : (
              <button type="button" className="store__buy" onClick={() => onBuy()}>
                Buy {pack.name} · {formatUsd(pack.priceCents)}
              </button>
            )}
            {/* A test-mode link is a real checkout that refuses every real card,
                and Stripe's own refusal says nothing about why. Better to say it
                here than to take somebody to a page that cannot serve them. */}
            {testMode ? (
              <p className="store__note store__note--warn">
                Not on sale yet. This opens a Stripe test checkout, which only takes test cards.
              </p>
            ) : (
              <p className="store__note">Secure checkout by Stripe. Opens in a new tab.</p>
            )}

            {/*
              Drawn OVER the card rather than pushed into it. An expansion in
              the flow would grow this card, and a grid row stretches its
              siblings to the tallest of them, so opening one card's chooser
              would leave a hole under the other card's button — which is the
              unevenness this whole change is about, moved somewhere else.
            */}
            {choosing && (
              <PlanPanel
                label={`Choose a plan for ${pack.name}`}
                title="Choose a Plan"
                step="plans"
                onClose={() => closeChooser()}
              >
                <ul className="store__plan-list">
                  {plans.map((plan) => (
                    <PlanRow
                      key={plan.id}
                      label={plan.label}
                      note={planNote(plan.id)}
                      /*
                        The saving belongs UNDER THE AMOUNT it is about, not
                        beside the plan's name: it is a fact about the money,
                        and a reader comparing three prices is looking down the
                        right-hand column when they need it. It is also the
                        thing that decides the sale, so it is set at reading
                        size rather than in the site's 9px tag mono.

                        Rendered in EVERY row whenever the chooser has a saving
                        to state, empty where there is nothing to say. A badge
                        on one row alone would make that row taller than the
                        other two, which is the same unevenness this chooser was
                        built to remove — so the space is reserved by the same
                        element in all of them, and hidden rather than absent
                        where it is blank. A chooser with no saving anywhere
                        reserves nothing.
                      */
                      money={
                        <>
                          <span className="store__plan-price">
                            {formatUsd(plan.priceCents)}
                            {plan.cadence ? (
                              <span className="store__plan-cadence">{plan.cadence}</span>
                            ) : null}
                          </span>
                          {saving !== null && (
                            /*
                              The SAME TEXT in every row, hidden where it is not
                              true. An empty span reserved the badge's height and
                              not its width, so the yearly row's money column was
                              95px against the other two at 66 and 64 — which at
                              375px squeezed that row's note to a third line and
                              made it 96px tall against 79. The reservation only
                              works if it reserves the real thing, and this can
                              never go stale: the string is the one being
                              measured. `visibility: hidden` keeps it out of the
                              accessibility tree, so nothing announces a saving
                              on a plan that does not have one.
                            */
                            <span
                              className="store__plan-save"
                              data-blank={plan.id !== 'annual' || undefined}
                            >
                              Save {formatUsd(saving)}
                            </span>
                          )}
                        </>
                      }
                      onClick={() => {
                        setChoosing(false)
                        onBuy(plan)
                      }}
                    />
                  ))}
                </ul>
              </PlanPanel>
            )}
          </>
        )}
      </div>
    </article>
  )
}

/**
 * What one app's shelf says about THIS account, on the index card.
 *
 * Every state gets a sentence, including the awkward ones. A card that simply
 * showed nothing while the read was in flight, or nothing when it failed, would
 * be an app whose ownership the reader cannot see — and the whole reason to put
 * ownership on the index is so they do not have to open two pages to find out
 * they already bought it.
 *
 * The failure wording is the pack card's, on purpose: one refusal said two
 * different ways in two places is two things to keep in step.
 */
function ownedLine(state: OwnedState, ownedHere: number, total: number): string {
  if (state === 'loading') return 'Checking your account…'
  if (state === 'signedOut') return 'Sign in to see what you already own here.'
  if (state === 'error') return "We couldn't check your purchases just now."
  if (ownedHere === 0) return `Nothing from this app on your account yet.`
  // Derived from the count, never assumed (rule 17): "Both" was typed here
  // once, and an app with three packs would have said it about three.
  if (ownedHere === total) {
    if (total === 1) return 'On your account already.'
    return total === 2 ? 'Both packs are on your account.' : `All ${total} packs are on your account.`
  }
  return `${ownedHere} of ${total} on your account.`
}

/**
 * One app on the Store's index: what it is, what it sells, and the way in.
 *
 * The WHOLE card opens that app's shop, the way every card on this site that
 * opens a page does — `.card__cover` first in the card, so it is also first in
 * the tab order. The link to the app's own page sits above it at z-index 5,
 * the same arrangement `Apps.tsx` uses for a download button, because a reader
 * weighing up a pack for an app they have not seen should be one click from
 * what the app actually is.
 *
 * The pack rows are DERIVED from `app.packs` — rule 17. Nothing here types a
 * pack's name, its price or how many there are, so an app that gains a third
 * pack gains a third row without this file being opened.
 */
function AppCard({
  app,
  index,
  state,
  owns,
  revoked,
  revokedPack,
}: {
  app: StoreApp
  index: number
  state: OwnedState
  /** Does this account hold that pack of this app? */
  owns: (packId: string) => boolean
  /** A block on the whole app, or null. */
  revoked: Revocation | null
  /** A block on one of its packs — the app's own when there is one. */
  revokedPack: (packId: string) => Revocation | null
}) {
  const reveal = useReveal<HTMLElement>('card3d', index % 3)
  const tilt = useTilt<HTMLElement>()
  const icon = iconFor(useSiteContent(), app.page)
  const from = cheapestPlan(app)
  // The same question the app's own shop page asks, asked here too — a card
  // that showed prices with no hint that nothing can be bought would send a
  // reader one click to find out. See `src/store/sale.ts`.
  const sale = useSaleState(app)
  const shut = sale === 'open' ? null : saleWording(sale, app.title)
  /*
   * Ownership is only ANSWERED once the shelf is ready. Asked earlier — while
   * the read is in flight, or after it failed — the set is simply empty, and
   * marking a row "not owned" from that would be the one mistake this page may
   * not make: telling somebody they have not bought what they have bought. So
   * every row keeps its price until there is a real answer, and the line under
   * them says which of the four states we are in.
   */
  const ready = state === 'ready'
  const ownedHere = ready
    ? app.packs.filter((pack) => revokedPack(pack.id) == null && owns(pack.id)).length
    : 0
  const one = app.packs.length === 1
  /*
   * "From" is a claim that there is a dearer way in, so it is only made when
   * there is: a second pack, or a pack sold on more than one plan. One pack
   * sold one way has a price, not a starting price, and printing `From $7.99`
   * over `$7.99` is the shop being vague about the only number it has.
   */
  const several = app.packs.length > 1 || (app.packs[0]?.plans?.length ?? 0) > 1

  return (
    <article ref={mergeRefs(reveal, tilt)} className="card store__app">
      <span className="card__spot" aria-hidden="true" />
      <span className="card__edge" aria-hidden="true" />

      <a
        className="card__cover"
        href={storeAppHash(app.id)}
        onClick={() => rememberOrigin('the Store')}
      >
        <span className="sr-only">
          Open the {app.title} {one ? 'pack' : 'packs'}
        </span>
      </a>

      {/* `--card-layer: auto` so the app-page link inside can rise above
          `.card__cover`; see base.css. */}
      <div className="store__app-body">
        <div className="store__app-head">
          <h3 className="store__app-title">
            {icon && <AppIcon icon={icon.icon} shape={icon.shape} size={34} />}
            {app.title}
            <span className="store__app-arrow" aria-hidden="true">
              →
            </span>
          </h3>
          <span className="chip chip--hot store__app-status">{app.status}</span>
        </div>

        <p className="store__app-copy">{app.copy}</p>

        {/* Every pack on one line: the name, and the cheapest way in — or, once
            this account's answer is in, that it already owns it. It is a
            contents list rather than a sales pitch: the pitch is on the card
            inside, and repeating it here would be a second copy of the words
            to keep true.

            A price is what somebody has still to pay, so a pack they already
            own prints OWNED in its place rather than both. Both would ask a
            reader who is scanning a column of amounts to work out which of them
            still apply to them, and the amount is on the pack's own card
            anyway. */}
        <ul className="store__app-packs">
          {app.packs.map((pack) => {
            const lead = pack.plans?.[0] ?? null
            const blocked = revokedPack(pack.id) != null
            const held = ready && !blocked && owns(pack.id)
            return (
              <li
                key={pack.id}
                className="store__app-pack"
                data-owned={held || undefined}
                data-blocked={blocked || undefined}
              >
                <span className="store__app-pack-name">{pack.name}</span>
                {/* A price is what is still to pay, so a pack this account may
                    not buy prints why instead. Printing the amount beside a
                    thing we will refuse to sell is the shop advertising at
                    somebody it has already turned away. */}
                {blocked ? (
                  <span className="store__app-pack-blocked">Not available</span>
                ) : held ? (
                  <span className="store__app-pack-owned">
                    <span className="store__app-pack-tick" aria-hidden="true">
                      <Tick />
                    </span>
                    Owned
                  </span>
                ) : (
                  <span className="store__app-pack-price">
                    {lead ? 'From ' : null}
                    {formatUsd(pack.priceCents)}
                    {lead?.cadence ? (
                      <span className="store__app-pack-cadence">{lead.cadence}</span>
                    ) : null}
                  </span>
                )}
              </li>
            )
          })}
        </ul>

        {/* Three answers, most specific first. A block is about THIS account
            and outranks everything; a shut shop is about the app and is true
            for everybody; the catalogue's own note is what stands when neither
            applies. Only ever one of them, because a card that printed both a
            block and a sale note would be asking a locked-out reader to work
            out which sentence was about them. */}
        {revoked ? (
          <p className="store__app-blocked">
            <span className="store__revoked-mark" aria-hidden="true">
              <Cross />
            </span>
            <span>
              <strong>Not available on this account.</strong>{' '}
              {revoked.reason ?? 'No reason was recorded with it.'}
            </span>
          </p>
        ) : shut ? (
          <p className="store__soon store__soon--card">
            <span className="store__soon-name">{shut.name}</span>
            <span className="store__soon-line">{shut.line}</span>
          </p>
        ) : (
          <p className="store__app-availability">{app.availability}</p>
        )}

        <div className="store__app-foot">
          <p className="store__app-owned" data-state={state}>
            {state === 'ready' && ownedHere > 0 && (
              <span className="store__app-owned-tick" aria-hidden="true">
                <Tick />
              </span>
            )}
            {ownedLine(state, ownedHere, app.packs.length)}
          </p>

          {/* Not a button: the card itself is the link that opens the packs,
              and a second control pointing at the same place would be a second
              tab stop saying the same thing. This is the affordance for it,
              and it lights with the card. */}
          <span className="store__app-cta" aria-hidden="true">
            {one ? 'View The Pack' : 'View The Packs'}
            {from !== null ? ` · ${several ? 'From ' : ''}${formatUsd(from.cents)}` : null}
            {/* The cadence rides with the amount it belongs to, the way the
                pack rows above print it: `From $5.99` alone is a monthly
                rent dressed as a price (rule 10). */}
            {from?.cadence ? <span className="store__app-pack-cadence">{from.cadence}</span> : null}
            <span className="store__app-cta-arrow">→</span>
          </span>

          <a
            className="store__app-link"
            href={appHash(app.page)}
            onClick={() => rememberOrigin('the Store')}
          >
            About {app.title}
            <span className="store__app-link-arrow" aria-hidden="true">
              →
            </span>
          </a>
        </div>
      </div>
    </article>
  )
}

/**
 * Who the purchase will land on.
 *
 * On BOTH views, because a shop that takes money without naming the account it
 * credits is asking for a support email, and the reader who needs it most is
 * the one about to press Buy — which is the app view.
 *
 * It reads as a status pill in the terms panel's own header rather than as a
 * band of its own. Two stacked full-width boxes above the shelf cost about 250
 * pixels of the first screen between them and said, structurally, that these
 * were two subjects; they are one — who is paying, and what paying here means.
 */
function AccountStrip({ onOpenAuth }: { onOpenAuth: () => void }) {
  const { status, user, profile } = useAuth()
  const who = profile?.display_name || profile?.username || user?.email || null

  return (
    <div className="store__account" data-signed-in={status === 'signedIn' || undefined}>
      {status === 'signedIn' ? (
        <>
          <span className="store__account-dot" aria-hidden="true" />
          <span className="store__account-text">
            Buying as <strong>{who}</strong>, so purchases land here.
          </span>
        </>
      ) : status === 'loading' ? (
        <span className="store__account-text">Checking your account…</span>
      ) : (
        <>
          <span className="store__account-text">
            Sign in first, so a purchase has an account to land on.
          </span>
          <button type="button" className="store__ghost" onClick={onOpenAuth}>
            Sign in
          </button>
        </>
      )}
    </div>
  )
}

/**
 * The three things a reader has to know BEFORE the Buy button.
 *
 * Above the cards on both views, not folded under them.
 *
 * Everything here is also said at length in `storeAnswers.ts`, and being said
 * there is not enough: a fold is a thing you open when you already suspect
 * there is something to find, and the three facts most likely to make somebody
 * NOT press Buy have to be readable before they press it. A refund policy
 * discovered afterwards is a refund policy nobody agreed to.
 *
 * Three promises in three different directions: what the card lists is all of
 * it, what is bought once stays bought, and money that has gone does not come
 * back. The last one ends in the thing a reader can actually do, because a rule
 * with no way out of it reads as a wall.
 *
 * THREE ABREAST, NOT THREE STACKED, and the account it will land on sits in the
 * same header. Nothing has been dropped — every claim below is the claim that
 * was there — but the block went from two boxes and nine lines of full-width
 * prose to one box and three short columns, which is about 140 pixels of the
 * first screen handed back to the shelf. Rule 16 holds: the grid is
 * `auto-fit, minmax(min(100%, …))`, so the three fall to one column when the
 * column would be narrower than its own words rather than at a width typed
 * here.
 */
function BeforeYouPay({ onOpenAuth }: { onOpenAuth: () => void }) {
  // Outside `.store__head` on both views, because that box is capped at 720px
  // — the measure a heading and a lede want to be read at — and three columns
  // of terms want the shelf's width. So it reveals on its own rather than with
  // the head it used to sit inside.
  const reveal = useReveal<HTMLElement>('wipe', 1)

  return (
    <section ref={reveal} className="store__terms" aria-label="Before you pay">
      <div className="store__terms-head">
        <p className="store__terms-title">Before You Pay</p>
        <AccountStrip onOpenAuth={onOpenAuth} />
      </div>
      <ul className="store__terms-list">
        <li>
          <strong>What is on the card is what you get.</strong> Everything a pack unlocks is
          listed on its own card, and that list is the whole of it — nothing held back, and
          nothing turning up later that costs again.
        </li>
        <li>
          <strong>A one-time pack is truly yours.</strong> Paid once and kept for good, on
          your TDG Account rather than on a machine. Nothing to renew, nothing to activate,
          and we do not take it back.
        </li>
        <li>
          <strong>Payments are not refundable.</strong> Every sale costs us fees we do not
          get back, and we are two people rather than a company — so please be sure before
          you pay. Anything that renews you can cancel from its own card whenever you like,
          and you keep it to the end of the period you have paid for.
        </li>
      </ul>
    </section>
  )
}

/**
 * Everything about the money, folded shut the way an app page is.
 *
 * On both views for the reason `BeforeYouPay` is: the long version of the
 * refund policy has to be reachable from the page carrying the Buy button, not
 * only from the one that lists the apps.
 */
function MoneyAnswers() {
  const how = useReveal<HTMLDivElement>('scale', 1)

  return (
    <div ref={how} className="store__answers">
      <h3 className="store__answers-title">Before you buy</h3>
      <p className="store__answers-lede">
        The whole money side, so none of it has to be guessed at. Open the one you want.
      </p>
      <SectionsProvider>
        <FoldControls />
        <div className="store__folds">
          {STORE_ANSWERS.map((section) => (
            <Fold key={section.id} section={section} prefix="store-sec" level={4} />
          ))}
        </div>
      </SectionsProvider>
    </div>
  )
}

/** The Store's index: one card per app, and the way into each one. */
function StoreIndex({
  onOpenAuth,
  stateFor,
  ownsIn,
  revokedIn,
}: {
  onOpenAuth: () => void
  stateFor: (appId: string) => OwnedState
  /** Whether one app's pack is on this account. The card counts its own. */
  ownsIn: (app: StoreApp, packId: string) => boolean
  /** A block on that app, or on one of its packs. Omit the pack for the app. */
  revokedIn: (app: StoreApp, packId?: string) => Revocation | null
}) {
  const head = useReveal<HTMLDivElement>('wipe', 0)

  return (
    <>
      {/* The same control every routed page on this site opens with, so coming
          back off the Store is the press it is everywhere else. */}
      <BackButton fallbackLabel="Home" fallbackHash="#top" />

      <div ref={head} className="store__head">
        <div className="kicker">
          <span className="kicker__num">06</span>
          <span className="kicker__rule" />
          <span className="kicker__label">Store</span>
        </div>
        <h2 className="h2 store__heading">It follows your account, not your machine.</h2>
        <p className="lede store__lede">
          A few paid extras for the apps we build. Everything else stays free. These are the
          pieces that pay for the nights they took. Most are charged once and are yours for
          good; one is a plan you can change or stop from its own card, and it says so before
          you click. Either way it sits on your TDG Account rather than on a machine. Open an
          app below for its packs, its prices and everything that comes with them.
        </p>

      </div>

      <BeforeYouPay onOpenAuth={onOpenAuth} />

      {/*
        TDG Cloud, above the app cards — its own area, not one of them.

        Deliberately NOT an entry in STORE_APPS, and that is rule 17's own
        exception ("a genuinely different shape"): the apps below sell packs
        that unlock features, Cloud sells one pooled storage allowance with a
        usage meter, a retention promise and a launch flag TDG Core owns. Its
        plans, quotas, prices and availability all arrive from
        tdg_cloud_public_config() at runtime (src/cloud/), so launch day is a
        flag flip and not a deploy of this file.
      */}
      <CloudShelf onOpenAuth={onOpenAuth} />

      {/* DERIVED from the catalogue, per rule 17. Adding an app to `STORE_APPS`
          adds a card here; there is nowhere to forget. */}
      <div className="store__apps" data-single={STORE_APPS.length === 1 || undefined}>
        {STORE_APPS.map((app, i) => (
          <AppCard
            key={app.id}
            app={app}
            index={i}
            state={stateFor(app.id)}
            owns={(packId) => ownsIn(app, packId)}
            revoked={revokedIn(app)}
            revokedPack={(packId) => revokedIn(app, packId)}
          />
        ))}
      </div>

      <MoneyAnswers />

      <div className="store__foot">
        <BackButton fallbackLabel="Home" fallbackHash="#top" tone="quiet" />
      </div>
    </>
  )
}

/** One app's shop: what it is, and every pack it sells with its buy options. */
function StoreApp({
  app,
  onOpenAuth,
  cardState,
  grantFor,
  revoked,
  onBuy,
  onCheck,
}: {
  app: StoreApp
  onOpenAuth: () => void
  cardState: (app: StoreApp, pack: StorePack) => CardState
  grantFor: (appId: string, packId: string) => PackGrant | null
  /**
   * A block on the WHOLE app, or null.
   *
   * Every card below already says it — `revokedFor` answers with the app's
   * block for any pack in it — and it is said ONCE up here as well, because a
   * reader who has to infer "all of it" from the same sentence repeated on
   * three cards has been made to do arithmetic to find out they are locked out.
   */
  revoked: Revocation | null
  onBuy: (app: StoreApp, pack: StorePack, plan?: StorePlan) => void
  onCheck: () => void
}) {
  const head = useReveal<HTMLDivElement>('wipe', 0)
  const icon = iconFor(useSiteContent(), app.page)
  // Whether this app's packs may be bought at all. Asked ONCE for the page and
  // handed to every card, so two packs of one app can never disagree about
  // whether their app exists — see `src/store/sale.ts`.
  const sale = useSaleState(app)
  const shut = sale === 'open' ? null : saleWording(sale, app.title)

  return (
    <>
      {/* "Back to the Store" when the reader came from the index, and the same
          place by hash when they arrived cold from a shared link or from the
          app's own page. `BackButton` is the app pages' own control, so this
          reads and behaves exactly like the one on every other routed page.

          Beside it, the way ON — this app's own page. The two pages are each
          other's onward link now: `#/app/veditor` offers "See the packs in the
          Store" in this exact row, and this offers the way back into the
          prose. It used to be a link further down the head, which was one
          control to the same place in a different shape on each side of the
          same pair; rule 6 says a mirrored pair takes its shape from one
          place. Nothing was lost in the move — same words, same destination,
          same single tab stop, now where the reader is already looking for a
          way out of the page. */}
      <PageNav>
        <BackButton fallbackLabel="the Store" fallbackHash={STORE_HASH} />
        <OnwardButton
          href={appHash(app.page)}
          label={`Read about ${app.title}`}
          from="the Store"
        />
      </PageNav>

      <div ref={head} className="store__head">
        <div className="kicker">
          <span className="kicker__num">06</span>
          <span className="kicker__rule" />
          <span className="kicker__label">Store · {app.title}</span>
        </div>
        <h2 className="h2 store__heading store__heading--app">
          {icon && <AppIcon icon={icon.icon} shape={icon.shape} className="store__heading-icon" />}
          {app.title}
        </h2>
        <p className="lede store__lede">{app.copy}</p>

        {/* No derived chip beside the written one. The box below says the same
            state in the same words, immediately under it, and a 9px tag
            repeating the heading of the thing it sits on top of is a word to
            read that answers nothing. */}
        <div className="chips store__app-chips">
          <span className="chip chip--hot">{app.status}</span>
        </div>
        {/* Said once at the top as well as on every card, the same argument the
            whole-app block makes one paragraph down: a reader who has to infer
            "none of them" from the same sentence repeated on three cards has
            been made to do arithmetic to find out the shop is shut.

            It REPLACES the catalogue's own availability note rather than
            sitting beside it, so there is only ever one sentence here about
            whether these packs can be bought, and it is the derived one. */}
        {shut ? (
          <p className="store__soon store__soon--wide">
            <span className="store__soon-name">{shut.name}</span>
            <span className="store__soon-line">{shut.line}</span>
          </p>
        ) : (
          <p className="store__availability">{app.availability}</p>
        )}

        {/* Above the terms, not below them: a block on this whole app is the
            more urgent of the two, and it decides whether the terms are worth
            reading at all. */}
        {revoked && (
          <p className="store__revoked store__revoked--wide">
            <span className="store__revoked-mark" aria-hidden="true">
              <Cross />
            </span>
            <span>
              <strong>{app.title} is not available on this account.</strong>
              <span className="store__revoked-why">
                {revoked.reason ?? 'No reason was recorded with it.'} We removed it on{' '}
                {formatDay(revoked.created_at) ?? 'an earlier date'}, and nothing below can be
                bought from here. If you think this is wrong, send us feedback from the account
                menu.
              </span>
            </span>
          </p>
        )}
      </div>

      <BeforeYouPay onOpenAuth={onOpenAuth} />

      {/* A shop holding ONE pack is told so, because the grid collapses its
          empty tracks and a lone card would otherwise stretch the page. */}
      <div className="store__packs" data-single={app.packs.length === 1 || undefined}>
        {app.packs.map((pack, i) => (
          <PackCard
            key={pack.id}
            pack={pack}
            appId={app.id}
            appTitle={app.title}
            index={i}
            state={withSale(cardState(app, pack), sale)}
            sale={sale}
            grant={grantFor(app.id, pack.id)}
            /* Belt as well as braces: no card draws a Buy button while the
               shop is shut, and the one press that spends money still refuses
               to fire on its own account rather than trusting that. */
            onBuy={(plan) => sale === 'open' && onBuy(app, pack, plan)}
            onSignIn={onOpenAuth}
            onCheck={onCheck}
          />
        ))}
      </div>

      <MoneyAnswers />

      <div className="store__foot">
        <PageNav>
          <BackButton fallbackLabel="the Store" fallbackHash={STORE_HASH} tone="quiet" />
          <OnwardButton
            href={appHash(app.page)}
            label={`Read about ${app.title}`}
            from="the Store"
            tone="quiet"
          />
        </PageNav>
      </div>
    </>
  )
}

export function Store({ onOpenAuth, app }: { onOpenAuth: () => void; app?: string }) {
  const { user } = useAuth()
  const { stateFor, owned, grantFor, revokedFor, refresh } = useOwnedPacks()
  const blob = useParallax<HTMLDivElement>(-0.12)

  /**
   * The pack whose Stripe tab is open, if any, and what the tab is for.
   *
   * `upgrade` is a subscriber buying the same pack outright. The card already
   * reads Owned for them, so "did it land?" cannot be `owned.has(key)` — that
   * was true before the tab opened, and this effect used to answer it on the
   * same tick: the card said "Payment received" the instant the confirm was
   * pressed, with nothing paid, and the watch below was cancelled before it
   * ran once. For an upgrade the thing to wait for is the GRANT changing
   * shape, from a subscription to a perpetual one, which is what the webhook
   * writes when the one-off payment clears.
   */
  type Pending = { key: string; app: string; pack: string; upgrade: boolean }
  const [pending, setPending] = useState<Pending | null>(null)
  /** Packs that arrived while this page was open, which is worth saying. */
  const [justLanded, setJustLanded] = useState<readonly string[]>([])

  // It landed. Stop waiting, and remember to say so on the card.
  useEffect(() => {
    if (!pending) return
    const landed = pending.upgrade
      ? grantFor(pending.app, pending.pack)?.kind === 'perpetual'
      : owned.has(pending.key)
    if (!landed) return
    const { key } = pending
    setJustLanded((seen) => (seen.includes(key) ? seen : [...seen, key]))
    setPending(null)
  }, [pending, owned, grantFor])

  // Keep asking while a checkout is open. The webhook lands the pack within a
  // minute of payment and the payment happens in another tab, so watching for
  // it is the only honest thing this page can do. Depends on `pending` alone,
  // never on `owned`: re-running on every answer would reset the deadline and
  // poll for ever.
  useEffect(() => {
    if (!pending) return
    const deadline = Date.now() + WAIT_MS
    const timer = window.setInterval(() => {
      if (Date.now() > deadline) {
        setPending(null)
        return
      }
      refresh()
    }, POLL_MS)
    // Coming back to this tab is the strongest signal there is that something
    // happened in the other one, so ask at once rather than up to four seconds later.
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [pending, refresh])

  const cardState = (app: StoreApp, pack: StorePack): CardState => {
    const key = packKey(app.id, pack.id)
    // Before ownership, deliberately. The server takes the grant when a block
    // goes on, so the two cannot normally both be true — and if a stale read
    // ever makes them, the honest card is the one that does not tell somebody
    // they still have what has been taken.
    const block = revokedFor(app.id, pack.id)
    if (block) return { kind: 'revoked', block }
    if (owned.has(key)) return { kind: 'owned', justLanded: justLanded.includes(key) }
    if (pending?.key === key) return { kind: 'waiting' }
    const state = stateFor(app.id)
    if (state === 'loading') return { kind: 'checking' }
    if (state === 'signedOut') return { kind: 'signedOut' }
    if (state === 'error') return { kind: 'error' }
    return { kind: 'buy' }
  }

  /**
   * Does this account hold that one pack of that one app?
   *
   * Keyed on `packKey`, never on the bare pack id — DevFleet and TDG Veditor
   * both sell one called `themes`, and a lookup by pack id alone would print
   * OWNED on the row for the one that was not bought. Same rule the pack cards
   * keep; see `store/useOwnedPacks.ts`.
   */
  const ownsIn = (app: StoreApp, packId: string) => owned.has(packKey(app.id, packId))

  const buy = (app: StoreApp, pack: StorePack, plan?: StorePlan) => {
    if (!user) {
      onOpenAuth()
      return
    }
    // A new tab, not this one: navigating away would throw the wait away, and
    // coming back to a shop that has already flipped to Owned is the whole
    // point of watching for it.
    window.open(buyUrl(pack, user.id, user.email, plan), '_blank', 'noopener,noreferrer')
    const key = packKey(app.id, pack.id)
    setPending({ key, app: app.id, pack: pack.id, upgrade: owned.has(key) })
  }

  /*
   * The router only ever hands over an id the catalogue claims — `#/store/x`
   * for an app we do not sell resolves to the plain Store, in `route.ts`. This
   * lookup makes the same decision for the same reason rather than trusting
   * that one: a view that renders nothing for an id it cannot find would be a
   * blank shop, and the index is the honest answer to "the packs for what?".
   */
  const shopFor = app ? (STORE_APPS.find((entry) => entry.id === app) ?? null) : null

  return (
    <section id="top" className="section section--blend store">
      <div className="texture store__grid" aria-hidden="true" />
      <div ref={blob} className="blob store__blob" aria-hidden="true" />

      <div className="shell store__shell">
        {shopFor ? (
          <StoreApp
            app={shopFor}
            onOpenAuth={onOpenAuth}
            cardState={cardState}
            grantFor={grantFor}
            revoked={revokedFor(shopFor.id)}
            onBuy={buy}
            onCheck={refresh}
          />
        ) : (
          <StoreIndex
            onOpenAuth={onOpenAuth}
            stateFor={stateFor}
            ownsIn={ownsIn}
            revokedIn={(app, packId) => revokedFor(app.id, packId)}
          />
        )}
      </div>
    </section>
  )
}
