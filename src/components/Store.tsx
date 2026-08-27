import { useEffect, useRef, useState, type ReactNode } from 'react'
import { mergeRefs } from '../lib/mergeRefs'
import { MODAL_LAYER, useEscape } from '../lib/modal'
import { useParallax } from '../hooks/useParallax'
import { useReveal } from '../hooks/useReveal'
import { useTilt } from '../hooks/useTilt'
import { useAuth } from '../auth/AuthProvider'
import { useDevMode } from '../dev/devMode'
import { useOwnedPacks } from '../store/useOwnedPacks'
import {
  formatDay,
  standingOfGrant,
  standingTone,
  type PackGrant,
  type PackStanding,
} from '../store/grant'
import { billingMessage, openBilling, setRenewal, type BillingError } from '../store/billing'
import { SectionsProvider } from '../lib/sections'
import { appHash, rememberOrigin, storeShelfId } from '../lib/route'
import { AppIcon } from './AppIcon'
import { iconForPage } from '../data/appPages'
import { Fold, FoldControls } from './Folded'
import { STORE_ANSWERS } from '../data/storeAnswers'
import {
  STORE_APPS,
  annualSavingCents,
  buyUrl,
  formatUsd,
  isTestLink,
  isSubscription,
  type StorePlan,
  packKey,
  type StoreApp,
  type StorePack,
} from '../data/store'
import './Store.css'

/** How long to keep asking after a buy before giving the button back. */
const WAIT_MS = 5 * 60 * 1000
const POLL_MS = 4000

type CardState =
  | { kind: 'checking' }
  | { kind: 'signedOut' }
  | { kind: 'error' }
  | { kind: 'owned'; justLanded: boolean }
  | { kind: 'waiting' }
  | { kind: 'buy' }

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
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

/**
 * The one line under a plan's name, in the words the money is actually in.
 *
 * Written off the plan's KIND rather than its id-by-id, so a fourth plan on
 * some future pack still gets a sentence instead of a blank. Nothing here
 * names an amount: the row beside it already carries the only copy of that.
 */
function planNote(plan: StorePlan): string {
  if (plan.id === 'monthly') return 'Billed every month. Cancel any time.'
  if (plan.id === 'annual') return 'Billed once a year. Cancel any time.'
  return 'Paid once. Yours for good, no renewal.'
}

/**
 * The panel every chooser on a pack card is drawn in.
 *
 * There are two of them now — choosing a plan before buying, and changing or
 * stopping one afterwards — and rule 11 of AGENTS.md is that a pack sold more
 * than one way looks the SAME wherever it appears. That promise is kept
 * mechanically here rather than by two files agreeing: both choosers are this
 * component, so the scrim, the head, the dialog role, Escape, the focus and the
 * animation cannot drift apart.
 *
 * Drawn OVER the card and never pushed into it, for the reason `Store.css`
 * sets out at length: the packs sit in a grid row, a grid row stretches its
 * siblings to the tallest of them, and an expansion in the flow would grow
 * BOTH cards and leave a hole under the other one's button.
 *
 * `step` re-runs the focus. The subscription panel replaces its own rows with a
 * confirm question in place, and focus that stayed on a button which no longer
 * exists is a keyboard reader stranded on the page behind the panel.
 */
function PlanPanel({
  label,
  title,
  step,
  onClose,
  children,
}: {
  /** Names the pack, per rule 14: a dialog says what it is about. */
  label: string
  /** The 10px mono head. Title Case. */
  title: string
  /** Changes when the panel's contents are replaced, so focus follows. */
  step: string
  onClose: () => void
  children: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)

  // Put the keyboard where the choice is. The first row rather than the close
  // button: this panel's actions are all reversible or confirmed, and landing
  // on Close would make the keyboard route to the thing the panel exists for
  // the longest one on the card.
  useEffect(() => {
    panel.current
      ?.querySelector<HTMLButtonElement>('.store__plan, .store__ask-row button')
      ?.focus({ preventScroll: true })
  }, [step])

  // Escape backs out of it the way it backs out of every other thing that
  // opens on this site — through the SAME stack, so the press goes to whatever
  // is painted in front and to nothing else. Still deliberately not `useModal`:
  // that locks the page's scroll for a dialog covering all of it, and this one
  // is anchored inside a card that is a third of the page and leaves the rest
  // scrolling. `useEscape` is that ordering without the lock; a listener of its
  // own is what had a panel closing underneath the auth modal opened over it.
  useEscape({ open: true, onClose, layer: MODAL_LAYER.storePlan })

  return (
    <>
      {/* A press anywhere else closes it. A button rather than a bare div so it
          is a real click target with real semantics, and hidden from a screen
          reader because Escape is its keyboard equivalent and a second "close"
          in the tab order is noise. */}
      <button
        type="button"
        className="store__plans-scrim"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
      />
      <div ref={panel} className="store__plans" role="dialog" aria-label={label}>
        <div className="store__plans-head">
          <p className="store__plans-title">{title}</p>
          <button type="button" className="store__plans-close" onClick={onClose}>
            <span className="sr-only">Close this panel</span>
            <Cross />
          </button>
        </div>
        {children}
      </div>
    </>
  )
}

/**
 * One row of a chooser: a name, a line saying what it does, and the money.
 *
 * The money column is reserved in EVERY row, empty where there is nothing to
 * say, for the reason the saving badge is: a column present on one row and
 * absent from another makes those rows different heights, which is the same
 * unevenness the chooser was built to remove, one level down.
 */
function PlanRow({
  label,
  note,
  money,
  tone,
  onClick,
}: {
  label: string
  note: string
  money?: ReactNode
  /** `leave` draws the row as the way out. Nothing else is ever tinted. */
  tone?: 'leave'
  onClick: () => void
}) {
  return (
    <li>
      <button type="button" className="store__plan" data-tone={tone} onClick={onClick}>
        <span className="store__plan-text">
          <span className="store__plan-label">{label}</span>
          <span className="store__plan-note">{note}</span>
        </span>
        <span className="store__plan-money">{money}</span>
      </button>
    </li>
  )
}

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
  grant,
  devView,
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
  /** How this account holds it, when the app records that. Null when it does not. */
  grant: PackGrant | null
  /**
   * Is a TDG developer looking at this, with Developer Mode switched on?
   *
   * It reveals one thing and grants nothing — the subscription panel over a
   * grant that has no Stripe subscription behind it, which is what every
   * hand-made grant is and what every grant on this project is today. Without
   * it the whole subscription surface is unreachable until the first real
   * subscriber exists, which is a state nobody has looked at on the money path.
   */
  devView: boolean
  onBuy: (plan?: StorePlan) => void
  onSignIn: () => void
  onCheck: () => void
}) {
  const reveal = useReveal<HTMLElement>('card3d', index % 3)
  const tilt = useTilt<HTMLElement>()
  const owned = state.kind === 'owned'
  const testMode = isTestLink(pack)
  const subscription = isSubscription(pack)
  const plans = pack.plans ?? []
  const primaryPlan = plans[0] ?? null
  const multiPlan = plans.length > 1
  const saving = multiPlan ? annualSavingCents(plans) : null
  const lifetimePlan = plans.find((plan) => plan.id === 'lifetime') ?? null

  /** What this account's own grant says about this pack, in the card's words. */
  const standing = standingOfGrant(grant)

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
   * Is Manage or Cancel Plan drawn ONLY because a developer asked to see it?
   *
   * `standing.manageable` stays honest and needs a real Stripe subscription
   * id, because a customer offered a button that can only ever fail is worse
   * off than one who is told plainly why there is no button. A developer with
   * Developer Mode on gets it anyway, and the panel says at the top what it is
   * and that its actions will refuse — a preview, labelled as one, rather than
   * a control that quietly does nothing.
   */
  const devOnly =
    !standing.manageable &&
    devView &&
    (shown.kind === 'active' ||
      shown.kind === 'ending' ||
      shown.kind === 'trial' ||
      shown.kind === 'dunning')
  const canManage = shown.manageable || devOnly

  // A chooser belongs to the state that opened it and to nothing else. A card
  // that flips to Waiting mid-choice must not leave one hanging over the wait,
  // and a card whose wait times out must not find one still open underneath.
  //
  // `manageable` is in here for the same reason one level down: a re-read that
  // lands a lapsed or hand-granted standing takes the subscription button away,
  // and a panel left open with nothing behind it would be a dialog the reader
  // cannot get back to and cannot act in.
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
    if (!lifetimePlan) return
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

      <h4 className="store__pack-name">{pack.name}</h4>
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
        {state.kind === 'checking' && <p className="store__note store__note--quiet">Checking your account…</p>}

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

              Drawn only when there is genuinely something behind it: a pack
              granted by hand from `#/dev` is a subscription with no Stripe
              subscription to act on, and a button that can only ever fail is
              worse than no button.
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
                    changes what every row below means. Only a developer with
                    Developer Mode on can reach this. */}
                {devOnly && (
                  <p className="store__devnote">
                    <strong>Developer view.</strong> This grant has no Stripe subscription behind
                    it, so every action here will refuse. It is drawn so the panel can be looked
                    at before there is a real subscriber.
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
                    {lifetimePlan && !shown.ending && (
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

                {step.at === 'busy' && (
                  <p className="store__waiting store__waiting--panel">
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
                    <p className="store__note store__note--warn">{billingMessage(step.error)}</p>
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
            <p className="store__waiting">
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
                      note={planNote(plan)}
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

function AppSection({
  app,
  cardState,
  grantFor,
  devView,
  onBuy,
  onSignIn,
  onCheck,
}: {
  app: StoreApp
  cardState: (app: StoreApp, pack: StorePack) => CardState
  grantFor: (appId: string, packId: string) => PackGrant | null
  devView: boolean
  onBuy: (app: StoreApp, pack: StorePack, plan?: StorePlan) => void
  onSignIn: () => void
  onCheck: () => void
}) {
  const head = useReveal<HTMLElement>('wipe', 0)
  const tilt = useTilt<HTMLElement>()
  const icon = iconForPage(app.page)

  return (
    /* The id is what `#/store/<app>` lands on, and it is on the SECTION rather
       than on the title, so arriving here brings the packs with it instead of
       putting a heading on screen with its shelf below the fold. */
    <section
      id={storeShelfId(app.id)}
      className="store__app"
      aria-labelledby={`store-${app.id}`}
    >
      {/* The head of a shelf is a card that opens the app's own page, the same
          way every card under Apps and Tools does. Somebody weighing up a pack
          for an app they have not seen should be one click from what the app
          actually is, and one click back. */}
      <article ref={mergeRefs(head, tilt)} className="card store__app-head">
        <span className="card__spot" aria-hidden="true" />
        <span className="card__edge" aria-hidden="true" />
        <a
          className="card__cover"
          href={appHash(app.page)}
          onClick={() => rememberOrigin('the Store')}
        >
          <span className="sr-only">Open the {app.title} page</span>
        </a>

        <div className="store__app-titles">
          <h3 id={`store-${app.id}`} className="store__app-title">
            {icon && <AppIcon icon={icon.icon} shape={icon.shape} size={38} />}
            {app.title}
            <span className="store__app-arrow" aria-hidden="true">
              →
            </span>
          </h3>
          <p className="store__app-copy">{app.copy}</p>
          <p className="store__app-availability">{app.availability}</p>
        </div>
        <span className="chip chip--hot store__app-status">{app.status}</span>
      </article>

      {/* A shelf holding ONE pack is told so, because the grid collapses its
          empty tracks and a lone card would otherwise stretch the page. */}
      <div className="store__packs" data-single={app.packs.length === 1 || undefined}>
        {app.packs.map((pack, i) => (
          <PackCard
            key={pack.id}
            pack={pack}
            appId={app.id}
            appTitle={app.title}
            index={i}
            state={cardState(app, pack)}
            grant={grantFor(app.id, pack.id)}
            devView={devView}
            onBuy={(plan) => onBuy(app, pack, plan)}
            onSignIn={onSignIn}
            onCheck={onCheck}
          />
        ))}
      </div>
    </section>
  )
}

export function Store({ onOpenAuth }: { onOpenAuth: () => void }) {
  const { status, user, profile } = useAuth()
  const { stateFor, owned, grantFor, refresh } = useOwnedPacks()
  /**
   * A TDG developer, with the Developer Mode switch on.
   *
   * Both halves, and neither is a permission. `is_admin` is the same column
   * Postgres re-checks on every privileged call, and Developer Mode is a
   * per-browser preference about chrome — so this reveals a preview and grants
   * nothing, exactly like the Developer tab it sits beside. A copy of this site
   * with both forced true shows one extra panel whose buttons all refuse.
   */
  const devView = useDevMode() && profile?.is_admin === true
  const blob = useParallax<HTMLDivElement>(-0.12)
  const head = useReveal<HTMLDivElement>('wipe', 0)
  const how = useReveal<HTMLDivElement>('scale', 1)

  /** The pack whose Stripe tab is open, if any. A `packKey`, never a pack id. */
  const [pending, setPending] = useState<string | null>(null)
  /** Packs that arrived while this page was open, which is worth saying. */
  const [justLanded, setJustLanded] = useState<readonly string[]>([])

  // It landed. Stop waiting, and remember to say so on the card.
  useEffect(() => {
    if (!pending || !owned.has(pending)) return
    setJustLanded((seen) => (seen.includes(pending) ? seen : [...seen, pending]))
    setPending(null)
  }, [pending, owned])

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
    if (owned.has(key)) return { kind: 'owned', justLanded: justLanded.includes(key) }
    if (pending === key) return { kind: 'waiting' }
    const state = stateFor(app.id)
    if (state === 'loading') return { kind: 'checking' }
    if (state === 'signedOut') return { kind: 'signedOut' }
    if (state === 'error') return { kind: 'error' }
    return { kind: 'buy' }
  }

  const buy = (app: StoreApp, pack: StorePack, plan?: StorePlan) => {
    if (!user) {
      onOpenAuth()
      return
    }
    // A new tab, not this one: navigating away would throw the wait away, and
    // coming back to a shop that has already flipped to Owned is the whole
    // point of watching for it.
    window.open(buyUrl(pack, user.id, user.email, plan), '_blank', 'noopener,noreferrer')
    setPending(packKey(app.id, pack.id))
  }

  const who = profile?.display_name || profile?.username || user?.email || null

  return (
    <section id="top" className="section section--blend store">
      <div className="texture store__grid" aria-hidden="true" />
      <div ref={blob} className="blob store__blob" aria-hidden="true" />

      <div className="shell store__shell">
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
            you click. Either way it sits on your TDG Account rather than on a machine. Neither
            app has shipped yet, and what that means for buying today is under the shelf, along
            with the rest of it.
          </p>

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

          {/*
            Above the shelf, not folded under it.

            Everything here is also said at length in `storeAnswers.ts`, and
            being said there is not enough: a fold is a thing you open when you
            already suspect there is something to find, and the three facts
            most likely to make somebody NOT press Buy have to be readable
            before they press it. A refund policy discovered afterwards is a
            refund policy nobody agreed to.

            Three lines, and each is a promise in a different direction: what
            the card lists is all of it, what is bought once stays bought, and
            money that has gone does not come back. The last one ends in the
            thing a reader can actually do, because a rule with no way out of
            it reads as a wall.
          */}
          <div className="store__terms">
            <p className="store__terms-title">Before You Pay</p>
            <ul className="store__terms-list">
              <li>
                <strong>What is on the card is what you get.</strong> Everything a pack unlocks is
                listed on its own card above, and that list is the whole of it. Nothing is held
                back, and nothing turns up later that you have to buy a second time.
              </li>
              <li>
                <strong>A one-time pack is truly yours.</strong> Paid once, kept for good, on your
                TDG Account rather than on a machine. There is nothing to renew, nothing to
                activate, and we do not take it back.
              </li>
              <li>
                <strong>Payments are not refundable.</strong> Every sale costs us fees we do not
                get back, and we are two people rather than a company that can absorb that — so
                please read the card and be sure before you pay. Anything that renews can be
                cancelled from its own card whenever you like, and you keep it to the end of the
                period you have already paid for.
              </li>
            </ul>
          </div>
        </div>

        {STORE_APPS.map((app) => (
          <AppSection
            key={app.id}
            app={app}
            cardState={cardState}
            grantFor={grantFor}
            devView={devView}
            onBuy={buy}
            onSignIn={onOpenAuth}
            onCheck={refresh}
          />
        ))}

        {/* Everything about the money, folded shut the way an app page is, and
            for the same reason: the shelf is what somebody came for, and seven
            expanded sections between it and the footer would bury it. The two
            longest are the ones about a purchase going wrong, because the one
            that works needs no explaining. */}
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
      </div>
    </section>
  )
}
