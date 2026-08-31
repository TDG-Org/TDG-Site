import { useEffect, useRef, useState } from 'react'
import { mergeRefs } from '../lib/mergeRefs'
import { useAuth } from '../auth/AuthProvider'
import { PlanPanel, PlanRow, planNote } from '../components/PlanChooser'
import { formatUsd } from '../data/store'
import {
  cloudBuyUrl,
  cloudSavingCents,
  formatBytes,
  formatQuota,
  type CloudPlan,
} from '../data/cloud'
import { formatDay, standingOfGrant } from '../store/grant'
import { useReveal } from '../hooks/useReveal'
import { useTilt } from '../hooks/useTilt'
import { ACCOUNT_HASH, CLOUD_ANCHOR } from '../lib/route'
import { useCloudConfig } from './config'
import { useCloudStatus, type CloudStatus } from './useCloudStatus'
import { CloudManage } from './CloudManage'
import './Cloud.css'

/**
 * TDG Cloud on the Store's index: its own area above the app cards.
 *
 * ## Why this is not an app card
 *
 * The cards below sell packs that unlock features in one app each. This sells
 * ONE pooled storage allowance for the whole account, with a usage meter, a
 * retention promise and a launch flag — a genuinely different shape, which is
 * rule 17's own stated exception (Makullveny is the precedent). What it still
 * shares it shares mechanically: the `.card` body, the chips, the buy button
 * classes, and the SAME `PlanPanel` chooser every pack card uses.
 *
 * ## Where every word and number comes from
 *
 * TDG Core. `useCloudConfig` reads `tdg_cloud_public_config()` — plan names,
 * quotas, prices, availability, the payment links — over the built-in copy in
 * `src/data/cloud.ts`, and it FAILS CLOSED: no fresh server answer means
 * Coming Soon with no way to pay, never a stale link. So launch day is a flag
 * a developer flips in `#/dev`, and this file ships finished, dormant.
 *
 * ## The states, because every one needs a face
 *
 * Coming Soon (the default until launch: priced plans, a disabled button that
 * says so), on sale signed-out (Sign in to buy), on sale (the chooser, then
 * the same five-minute watch the pack cards keep while a Stripe tab is open),
 * held (Owned with the usage meter and the manage panel), revoked (the block,
 * its reason and its date — never a Buy button), and could-not-check (the
 * plans still price, the account strip says the reading failed, and nothing
 * is offered for sale to somebody who may already hold it).
 */

const WAIT_MS = 5 * 60 * 1000
const POLL_MS = 4000

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

/** A little cloud, for the section mark. Drawn where it is used (AGENTS §5). */
function CloudGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M17.5 19a4.5 4.5 0 0 0 .42-8.98 6 6 0 0 0-11.7 1.42A3.75 3.75 0 0 0 6.75 19Z" />
    </svg>
  )
}

function CloudPlanCard({
  plan,
  available,
  status,
  statusKind,
  pending,
  onOpenAuth,
  onBuy,
  onChanged,
}: {
  plan: CloudPlan
  /** The public answer: is Cloud on sale for everybody? */
  available: boolean
  status: CloudStatus | null
  statusKind: 'signedOut' | 'loading' | 'error' | 'ready'
  /** This plan's checkout is open in another tab. */
  pending: boolean
  onOpenAuth: () => void
  onBuy: (plan: CloudPlan, link: string) => void
  onChanged: () => void
}) {
  const [choosing, setChoosing] = useState(false)
  const buyRef = useRef<HTMLButtonElement>(null)
  const saving = cloudSavingCents(plan.monthlyCents, plan.annualCents)

  // Closing the chooser puts focus back on the button that opened it — the
  // return every chooser on the Store makes.
  const closeChooser = () => {
    setChoosing(false)
    buyRef.current?.focus()
  }

  const held = status?.plan?.pack === plan.id
  const grant = held ? (status?.plan?.grant ?? null) : null
  const standing = standingOfGrant(grant)
  // A whole-Cloud block (`*`) covers both plans; a per-plan block only its own.
  const block =
    status?.revoked && (status.revoked.pack === '*' || status.revoked.pack === plan.id)
      ? status.revoked
      : null
  // Can THIS person buy? The public flag, or the tester door once Core opened
  // it for them — either way the links must have arrived from the live server.
  const buyable =
    (available || status?.enabledForYou === true) &&
    plan.linkMonthly !== null &&
    plan.linkAnnual !== null

  // The chooser belongs to the state that opened it (see PackCard).
  useEffect(() => {
    if (held || block !== null || pending) setChoosing(false)
  }, [held, block, pending])

  return (
    <article className="cloud__plan" data-held={held || undefined}>
      <div className="cloud__plan-head">
        <h4 className="cloud__plan-name">{plan.name}</h4>
        <span className="cloud__plan-quota">{formatQuota(plan.quotaGb)}</span>
      </div>
      <p className="cloud__plan-tagline">{plan.tagline}</p>

      <div className="cloud__plan-price">
        <span className="cloud__plan-amount">
          {formatUsd(plan.monthlyCents)}
          <span className="cloud__plan-cadence">/mo</span>
        </span>
        <span className="cloud__plan-alt">
          or {formatUsd(plan.annualCents)}/yr
          {saving !== null && <span className="cloud__plan-save">Save {formatUsd(saving)}</span>}
        </span>
      </div>

      <div className="cloud__action">
        {block !== null ? (
          <>
            <p className="store__revoked">
              <span className="store__revoked-mark" aria-hidden="true">
                <Cross />
              </span>
              <span>
                <strong>
                  {block.pack === '*'
                    ? 'TDG Cloud is not available on this account'
                    : `${plan.name} is not available on this account`}
                </strong>
                <span className="store__revoked-why">
                  {block.reason ?? 'No reason was recorded with it.'}
                </span>
              </span>
            </p>
            <p className="store__note store__note--warn">
              We removed it on {formatDay(block.created_at) ?? 'an earlier date'}, and it cannot be
              bought again from here. If you think this is wrong, send us feedback from the account
              menu.
            </p>
          </>
        ) : held ? (
          <>
            <p className="store__owned" data-tone={standing.kind === 'perpetual' ? 'ok' : undefined}>
              <span className="store__owned-tick" aria-hidden="true">
                <Tick />
              </span>
              Your Plan
              {standing.kind !== 'perpetual' && (
                <span className="store__owned-standing">{standing.label}</span>
              )}
            </p>
            <p className="store__note">
              {standing.kind === 'perpetual'
                ? 'Granted to your account. Nothing renews, and there is nothing to cancel.'
                : standing.note}
            </p>
            <CloudManage pack={plan.id} planName={plan.name} grant={grant} onChanged={onChanged} />
          </>
        ) : pending ? (
          <>
            <p className="store__waiting">
              <span className="store__waiting-dot" aria-hidden="true" />
              Waiting for your payment…
            </p>
            <p className="store__note">
              Finish in the Stripe tab. It lands on your account within a minute of paying.
            </p>
          </>
        ) : !buyable ? (
          /* The one CTA a dormant shop is allowed: a button that says why it
             does nothing. Disabled for real, so it is skipped by keyboard and
             reader alike. The explanation is said ONCE, in the shelf's shared
             footnote, rather than under each card. */
          <button type="button" className="store__buy cloud__soon" disabled>
            Coming Soon
          </button>
        ) : statusKind === 'signedOut' ? (
          <>
            <button type="button" className="store__buy" onClick={onOpenAuth}>
              Sign in to buy
            </button>
            <p className="store__note">
              A plan attaches to your TDG Account, so your storage follows you to every machine.
            </p>
          </>
        ) : statusKind === 'error' ? (
          <>
            <p className="store__note store__note--warn">
              We couldn't check your account just now, so nothing is on offer — you may already
              have a plan.
            </p>
            <button type="button" className="store__ghost" onClick={onChanged}>
              Try again
            </button>
          </>
        ) : statusKind === 'loading' ? (
          <p className="store__note store__note--quiet">Checking your account…</p>
        ) : (
          <>
            <button
              ref={buyRef}
              type="button"
              className="store__buy"
              aria-haspopup="dialog"
              aria-expanded={choosing}
              onClick={() => (choosing ? closeChooser() : setChoosing(true))}
            >
              Get {plan.name} · From {formatUsd(plan.monthlyCents)}/mo
              <span className="store__buy-caret">
                <Caret />
              </span>
            </button>
            <p className="store__note">Secure checkout by Stripe. Opens in a new tab.</p>

            {choosing && (
              <PlanPanel
                label={`Choose a plan for ${plan.name}`}
                title="Choose a Plan"
                step="plans"
                onClose={closeChooser}
              >
                <ul className="store__plan-list">
                  {(
                    [
                      { id: 'monthly', label: 'Monthly', cents: plan.monthlyCents, cadence: '/mo', link: plan.linkMonthly },
                      { id: 'annual', label: 'Yearly', cents: plan.annualCents, cadence: '/yr', link: plan.linkAnnual },
                    ] as const
                  ).map((row) => (
                    <PlanRow
                      key={row.id}
                      label={row.label}
                      note={planNote(row.id)}
                      money={
                        <>
                          <span className="store__plan-price">
                            {formatUsd(row.cents)}
                            <span className="store__plan-cadence">{row.cadence}</span>
                          </span>
                          {saving !== null && (
                            <span
                              className="store__plan-save"
                              data-blank={row.id !== 'annual' || undefined}
                            >
                              Save {formatUsd(saving)}
                            </span>
                          )}
                        </>
                      }
                      onClick={() => {
                        setChoosing(false)
                        if (row.link !== null) onBuy(plan, row.link)
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

export function CloudShelf({ onOpenAuth }: { onOpenAuth: () => void }) {
  const reveal = useReveal<HTMLElement>('card3d', 0)
  const tilt = useTilt<HTMLElement>()
  const config = useCloudConfig()
  const { state, refresh } = useCloudStatus()
  const { user } = useAuth()

  const status = state.kind === 'ready' ? state.status : null

  /** The plan id whose Stripe tab is open, if any. */
  const [pending, setPending] = useState<string | null>(null)
  const [justLanded, setJustLanded] = useState(false)

  // It landed. Stop waiting, and say so once.
  useEffect(() => {
    if (!pending || status?.plan?.pack !== pending) return
    setJustLanded(true)
    setPending(null)
  }, [pending, status?.plan?.pack])

  // The same watch the pack cards keep while a checkout tab is open: poll the
  // status for five minutes, and ask at once when this tab comes back.
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
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [pending, refresh])

  const buy = (plan: CloudPlan, link: string) => {
    if (!user) {
      onOpenAuth()
      return
    }
    window.open(cloudBuyUrl(link, user.id, user.email), '_blank', 'noopener,noreferrer')
    setPending(plan.id)
  }

  const live = config.available
  const testing = status?.testing === true
  const held = status?.plan ?? null
  const usedShare =
    status !== null && status.quotaBytes > 0
      ? Math.min(status.usedBytes / status.quotaBytes, 1)
      : 0

  return (
    /*
     * The id is `CLOUD_ANCHOR`'s, from lib/route.ts, and it is the ONLY reason
     * this panel has one: `#/store?to=cloud-plans` is the address every other
     * TDG app points its Cloud buttons at, so a reader who pressed Cloud in
     * Bible Educator arrives looking at the plans instead of at the top of the
     * shop with 900px between them and the thing they asked for. It is read
     * from the constant rather than typed, so the id and the link can never
     * drift apart. No `.kicker` in here, which is right: `landingFor` in
     * lib/anchors.ts then lands the CARD's own top under the nav, and the card
     * is what the link is about.
     */
    <section
      ref={mergeRefs(reveal, tilt)}
      id={CLOUD_ANCHOR}
      className="card cloud__panel"
      aria-label="TDG Cloud"
    >
      <span className="card__spot" aria-hidden="true" />
      <span className="card__edge" aria-hidden="true" />

      <div className="cloud__body">
        {/* One row: the name on the left, the state chips on the right, one
            line of what it is underneath — everything else the old intro and
            bullet lists said is said once, in the footnote. */}
        <div className="cloud__head">
          <h3 className="cloud__title">
            <span className="cloud__title-glyph" aria-hidden="true">
              <CloudGlyph />
            </span>
            TDG Cloud
          </h3>
          <div className="chips">
            {testing ? (
              <span className="chip chip--hot">DEV TESTING</span>
            ) : live ? (
              <span className="chip chip--hot">LIVE</span>
            ) : (
              <span className="chip chip--hot">COMING SOON</span>
            )}
          </div>
          <p className="cloud__lede">
            One pooled storage allowance for your whole TDG Account — projects, saves, settings and
            media, synced across every TDG app and machine you sign in on.
          </p>
        </div>

        {/* DERIVED from the config, per rule 17: a plan TDG Core adds or
            renames appears here with no edit, and one it cannot name still
            renders with its numbers. */}
        <div className="cloud__plans">
          {config.plans.map((plan) => (
            <CloudPlanCard
              key={plan.id}
              plan={plan}
              available={live}
              status={status}
              statusKind={state.kind}
              pending={pending === plan.id}
              onOpenAuth={onOpenAuth}
              onBuy={buy}
              onChanged={refresh}
            />
          ))}
        </div>

        {/* The signed-in strip: this account's own standing, at a glance. Only
            ever drawn from a real answer — a failed read already said so on
            the cards and must not be repeated as a third warning here. */}
        {held !== null && status !== null && (
          <div className="cloud__mine">
            <div className="cloud__mine-line">
              <span className="cloud__mine-plan">
                <span className="cloud__mine-tick" aria-hidden="true">
                  <Tick />
                </span>
                {justLanded
                  ? `Payment received — ${held.name ?? 'your plan'} is on your account.`
                  : `${held.name ?? 'Your plan'} · ${formatBytes(status.usedBytes)} of ${formatQuota(
                      Math.round(status.quotaBytes / 1073741824),
                    )} used`}
              </span>
              <a className="cloud__mine-link" href={ACCOUNT_HASH}>
                Manage In Your Account
                <span aria-hidden="true"> →</span>
              </a>
            </div>
            <div
              className="cloud__bar"
              role="img"
              aria-label={`${formatBytes(status.usedBytes)} of ${formatBytes(status.quotaBytes)} used`}
            >
              <span className="cloud__bar-fill" style={{ width: `${usedShare * 100}%` }} />
            </div>
          </div>
        )}

        <p className="cloud__foot">
          {!live && !testing && (
            <>
              <strong>Not on sale yet</strong> — prices are set, and buying opens right here when
              TDG Cloud launches.{' '}
            </>
          )}
          Only your real work counts, never caches or temporary files. Cancel any time: your plan
          runs to what you paid for, then your data stays readable for {config.retentionDays} days.
        </p>
      </div>
    </section>
  )
}
