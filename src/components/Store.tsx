import { useEffect, useState } from 'react'
import { mergeRefs } from '../lib/mergeRefs'
import { useParallax } from '../hooks/useParallax'
import { useReveal } from '../hooks/useReveal'
import { useTilt } from '../hooks/useTilt'
import { useAuth } from '../auth/AuthProvider'
import { useOwnedPacks } from '../store/useOwnedPacks'
import { STORE_APPS, buyUrl, formatUsd, type StoreApp, type StorePack } from '../data/store'
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

function PackCard({
  pack,
  index,
  state,
  onBuy,
  onSignIn,
  onCheck,
}: {
  pack: StorePack
  index: number
  state: CardState
  onBuy: () => void
  onSignIn: () => void
  onCheck: () => void
}) {
  const reveal = useReveal<HTMLElement>('card3d', index % 3)
  const tilt = useTilt<HTMLElement>()
  const owned = state.kind === 'owned'

  return (
    <article ref={mergeRefs(reveal, tilt)} className="card store__pack" data-owned={owned || undefined}>
      <span className="card__spot" aria-hidden="true" />
      <span className="card__edge" aria-hidden="true" />

      <div className="store__pack-head">
        <div className="chips">
          <span className="chip">ONE-TIME</span>
          <span className="chip">YOURS FOR GOOD</span>
        </div>
        <div className="store__price">{formatUsd(pack.priceCents)}</div>
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
              We could not check your purchases just now — nothing is wrong with your account.
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
                ? 'Payment received — it is on your account now. Open TDG Veditor and it is there.'
                : 'On your TDG Account. Sign in inside TDG Veditor and it unlocks.'}
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
            <button type="button" className="store__buy" onClick={onBuy}>
              Buy {pack.name} — {formatUsd(pack.priceCents)}
            </button>
            <p className="store__note">Secure checkout by Stripe. Opens in a new tab.</p>
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
  cardState: (pack: StorePack) => CardState
  onBuy: (pack: StorePack) => void
  onSignIn: () => void
  onCheck: () => void
}) {
  const head = useReveal<HTMLDivElement>('wipe', 0)

  return (
    <section className="store__app" aria-labelledby={`store-${app.id}`}>
      <div ref={head} className="store__app-head">
        <div className="store__app-titles">
          <h3 id={`store-${app.id}`} className="store__app-title">
            {app.title}
          </h3>
          <p className="store__app-copy">{app.copy}</p>
          <p className="store__app-availability">{app.availability}</p>
        </div>
        <span className="chip chip--hot store__app-status">{app.status}</span>
      </div>

      <div className="store__packs">
        {app.packs.map((pack, i) => (
          <PackCard
            key={pack.id}
            pack={pack}
            index={i}
            state={cardState(pack)}
            onBuy={() => onBuy(pack)}
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
  const { state: ownedState, packs, refresh } = useOwnedPacks()
  const blob = useParallax<HTMLDivElement>(-0.12)
  const head = useReveal<HTMLDivElement>('wipe', 0)
  const how = useReveal<HTMLDivElement>('scale', 1)

  /** The pack whose Stripe tab is open, if any. */
  const [pending, setPending] = useState<string | null>(null)
  /** Packs that arrived while this page was open — worth saying so. */
  const [justLanded, setJustLanded] = useState<readonly string[]>([])

  // It landed. Stop waiting, and remember to say so on the card.
  useEffect(() => {
    if (!pending || !packs.includes(pending)) return
    setJustLanded((seen) => (seen.includes(pending) ? seen : [...seen, pending]))
    setPending(null)
  }, [pending, packs])

  // Keep asking while a checkout is open. The webhook lands the pack within a
  // minute of payment and the payment happens in another tab, so watching for
  // it is the only honest thing this page can do. Depends on `pending` alone,
  // never on `packs`: re-running on every answer would reset the deadline and
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
    // happened in the other one — ask at once rather than up to four seconds later.
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [pending, refresh])

  const cardState = (pack: StorePack): CardState => {
    if (packs.includes(pack.id)) return { kind: 'owned', justLanded: justLanded.includes(pack.id) }
    if (pending === pack.id) return { kind: 'waiting' }
    if (ownedState === 'loading') return { kind: 'checking' }
    if (ownedState === 'signedOut') return { kind: 'signedOut' }
    if (ownedState === 'error') return { kind: 'error' }
    return { kind: 'buy' }
  }

  const buy = (pack: StorePack) => {
    if (!user) {
      onOpenAuth()
      return
    }
    // A new tab, not this one: navigating away would throw the wait away, and
    // coming back to a shop that has already flipped to Owned is the whole
    // point of watching for it.
    window.open(buyUrl(pack, user.id, user.email), '_blank', 'noopener,noreferrer')
    setPending(pack.id)
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
            A few paid extras for the apps we build. Everything else stays free — these are the
            pieces that pay for the nights they took. One payment, no subscription, and it is
            attached to your TDG Account rather than to a machine.
          </p>

          <div className="store__account" data-signed-in={status === 'signedIn' || undefined}>
            {status === 'signedIn' ? (
              <>
                <span className="store__account-dot" aria-hidden="true" />
                <span className="store__account-text">
                  Buying as <strong>{who}</strong> — purchases land here.
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

        <div ref={how} className="store__how">
          <h3 className="store__how-title">How it works</h3>
          <ol className="store__steps">
            <li>
              <span className="store__step-num">01</span>
              <span className="store__step-text">
                <strong>Sign in</strong> with your TDG Account — the same one the apps use.
              </span>
            </li>
            <li>
              <span className="store__step-num">02</span>
              <span className="store__step-text">
                <strong>Pay through Stripe.</strong> We never see your card — Stripe handles the
                payment, the tax and the receipt.
              </span>
            </li>
            <li>
              <span className="store__step-num">03</span>
              <span className="store__step-text">
                <strong>Open the app.</strong> The pack is on your account within a minute — press
                Check Again on its Account page if you beat it there.
              </span>
            </li>
          </ol>
          <p className="store__fine">
            Bought a pack and cannot see it in the app? Sign in on this page. If it says Owned here,
            the app will see it too the next time it can reach the server.
          </p>
        </div>
      </div>
    </section>
  )
}
