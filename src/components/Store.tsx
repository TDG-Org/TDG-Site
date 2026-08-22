import { useEffect, useRef, useState } from 'react'
import { mergeRefs } from '../lib/mergeRefs'
import { useParallax } from '../hooks/useParallax'
import { useReveal } from '../hooks/useReveal'
import { useTilt } from '../hooks/useTilt'
import { useAuth } from '../auth/AuthProvider'
import { useOwnedPacks } from '../store/useOwnedPacks'
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

function PackCard({
  pack,
  appTitle,
  index,
  state,
  onBuy,
  onSignIn,
  onCheck,
}: {
  pack: StorePack
  /** The app this pack is for, so a card never names the wrong one. */
  appTitle: string
  index: number
  state: CardState
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

  /**
   * Is the plan chooser open over this card?
   *
   * Per CARD, never per page: two cards on a shelf are two independent shops
   * as far as this is concerned, and a single shared flag would open the wrong
   * one the first time a second pack gained plans.
   */
  const [choosing, setChoosing] = useState(false)
  const buyRef = useRef<HTMLButtonElement>(null)
  const firstPlanRef = useRef<HTMLButtonElement>(null)

  const closeChooser = (refocus = true) => {
    setChoosing(false)
    if (refocus) buyRef.current?.focus()
  }

  // The chooser belongs to the Buy state and to nothing else. A card that
  // flips to Waiting mid-choice must not leave it hanging over the wait, and
  // a card whose wait times out must not find it still open underneath.
  useEffect(() => {
    if (state.kind !== 'buy') setChoosing(false)
  }, [state.kind])

  // Open: put the keyboard where the choice is, and let Escape back out of it
  // the way it backs out of every other thing that opens on this site.
  useEffect(() => {
    if (!choosing) return
    firstPlanRef.current?.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setChoosing(false)
      buyRef.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [choosing])

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
            <p className="store__owned">
              <span className="store__owned-tick" aria-hidden="true">
                <Tick />
              </span>
              Owned
            </p>
            <p className="store__note">
              {state.justLanded
                ? `Payment received. It is on your account now, so open ${appTitle} and it is there.`
                : `On your TDG Account. Sign in inside ${appTitle} and it unlocks.`}
            </p>
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
              <>
                {/* A press anywhere else closes it. A button rather than a bare
                    div so it is a real click target with real semantics, and
                    hidden from a screen reader because Escape is its keyboard
                    equivalent and a second "close" in the tab order is noise. */}
                <button
                  type="button"
                  className="store__plans-scrim"
                  tabIndex={-1}
                  aria-hidden="true"
                  onClick={() => closeChooser()}
                />
                <div
                  className="store__plans"
                  role="dialog"
                  aria-label={`Choose a plan for ${pack.name}`}
                >
                  <div className="store__plans-head">
                    <p className="store__plans-title">Choose a Plan</p>
                    <button
                      type="button"
                      className="store__plans-close"
                      onClick={() => closeChooser()}
                    >
                      <span className="sr-only">Close the plan chooser</span>
                      <Cross />
                    </button>
                  </div>

                  <ul className="store__plan-list">
                    {plans.map((plan, planIndex) => (
                      <li key={plan.id}>
                        <button
                          ref={planIndex === 0 ? firstPlanRef : undefined}
                          type="button"
                          className="store__plan"
                          onClick={() => {
                            setChoosing(false)
                            onBuy(plan)
                          }}
                        >
                          <span className="store__plan-text">
                            <span className="store__plan-label">
                              {plan.label}
                              {plan.id === 'annual' && saving !== null && (
                                <span className="chip store__plan-save">
                                  SAVE {formatUsd(saving)}
                                </span>
                              )}
                            </span>
                            <span className="store__plan-note">{planNote(plan)}</span>
                          </span>
                          <span className="store__plan-price">
                            {formatUsd(plan.priceCents)}
                            {plan.cadence ? (
                              <span className="store__plan-cadence">{plan.cadence}</span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
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
  onBuy,
  onSignIn,
  onCheck,
}: {
  app: StoreApp
  cardState: (app: StoreApp, pack: StorePack) => CardState
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
            appTitle={app.title}
            index={i}
            state={cardState(app, pack)}
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
  const { stateFor, owned, refresh } = useOwnedPacks()
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
          <h2 className="h2 store__heading">Buy once. It follows your account.</h2>
          <p className="lede store__lede">
            A few paid extras for the apps we build. Everything else stays free. These are the
            pieces that pay for the nights they took. Every pack on this shelf is charged once and
            sits on your TDG Account rather than on a machine. Neither app has shipped yet, and
            what that means for buying today is under the shelf, along with the rest of it.
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
        </div>

        {STORE_APPS.map((app) => (
          <AppSection
            key={app.id}
            app={app}
            cardState={cardState}
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
