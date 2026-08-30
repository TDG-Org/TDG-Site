import { useEffect, useRef, useState } from 'react'
import { PlanPanel, PlanRow } from '../components/PlanChooser'
import { billingMessage, openBilling, setRenewal, type BillingError } from '../store/billing'
import { formatDay, standingOfGrant, type PackGrant, type PackStanding } from '../store/grant'
import { STORE_BILLING_LINK_NOTICE } from '../data/storeAnswers'

/**
 * Manage or cancel a TDG Cloud plan, wherever the plan is shown.
 *
 * The Store shelf and the Account page's Cloud fold both mount THIS — one
 * component, two doors, so rule 11's "a plan that can be started can be
 * stopped, from the same card" is kept mechanically in both places and the
 * two can never word the same subscription differently.
 *
 * It is the pack cards' manage panel with the one row Cloud does not have:
 * there is no Buy It Outright, because Cloud has no lifetime plan — storage
 * that costs us rent cannot be sold once. Everything else is the same
 * machinery those cards use: `tdg-site-billing` resolves the caller from
 * their own token and the subscription from their own `cloud_entitlements`
 * row, cancelling is `cancel_at_period_end` and never "stop now", and
 * `cloud_packs_in_force()` keeps a cancelled plan working to the date the
 * panel names. A grant with no Stripe subscription behind it — a plan granted
 * from `#/dev` — says **Billing Link Missing** inside the panel rather than
 * hiding the entrance, exactly as the Store's cards do.
 *
 * The HOST provides the positioning context: `PlanPanel` anchors to its
 * nearest positioned ancestor, so whatever mounts this wraps it in something
 * `position: relative` (`.cloud__action` on the shelf, `.cloud__managehost`
 * in the fold).
 */
export function CloudManage({
  pack,
  planName,
  grant,
  onChanged,
}: {
  /** The pack id the billing call names — `standard` or `studio`. */
  pack: string
  /** The plan's name, for the dialog label. */
  planName: string
  /** The grant behind it, exactly as the webhook wrote it. */
  grant: PackGrant | null
  /** Called after Stripe confirmed a change, so the host re-reads status. */
  onChanged: () => void
}) {
  const [choosing, setChoosing] = useState(false)
  const [step, setStep] = useState<
    { at: 'menu' } | { at: 'confirm' } | { at: 'busy'; doing: string } | { at: 'error'; error: BillingError }
  >({ at: 'menu' })
  /** Stripe's own answer, shown until the webhook's grant replaces it —
   *  the same optimism the pack cards keep, for the same seconds. */
  const [justChanged, setJustChanged] = useState<PackStanding | null>(null)
  const entrance = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setJustChanged(null)
  }, [grant?.cancelAtPeriodEnd, grant?.currentPeriodEnd, grant?.status])

  const standing = standingOfGrant(grant)
  const shown = justChanged ?? standing

  const canManage =
    shown.kind === 'active' || shown.kind === 'ending' || shown.kind === 'trial' || shown.kind === 'dunning'
  const billingLinkMissing = canManage && !shown.manageable

  // A chooser belongs to the standing that opened it: a plan that lapses
  // under an open panel must not leave a dialog with nothing behind it.
  useEffect(() => {
    if (!canManage) {
      setChoosing(false)
      setStep({ at: 'menu' })
    }
  }, [canManage])

  if (!canManage) return null

  // Escape and the scrim both land here, and focus goes back to the button
  // that opened the panel — the same return every chooser on the Store makes,
  // so a keyboard reader is never dropped at the top of the page.
  const close = () => {
    setChoosing(false)
    setStep({ at: 'menu' })
    entrance.current?.focus()
  }

  const changeRenewal = async (renew: boolean) => {
    setStep({ at: 'busy', doing: renew ? 'Starting the renewals again…' : 'Stopping the renewals…' })
    const result = await setRenewal({ app: 'cloud', pack, renew })
    if (!result.ok) {
      setStep({ at: 'error', error: result.error })
      return
    }
    setJustChanged(
      standingOfGrant({
        ...grant,
        kind: 'subscription',
        status: grant?.status ?? 'active',
        cancelAtPeriodEnd: !renew,
        currentPeriodEnd: result.value.currentPeriodEnd ?? grant?.currentPeriodEnd ?? null,
      }),
    )
    close()
    onChanged()
  }

  const goToStripe = async (intent: 'update' | 'billing') => {
    setStep({ at: 'busy', doing: 'Opening your billing page…' })
    const result = await openBilling({ app: 'cloud', pack, intent })
    if (!result.ok) {
      setStep({ at: 'error', error: result.error })
      return
    }
    window.open(result.value, '_blank', 'noopener,noreferrer')
    close()
  }

  return (
    <>
      <button
        ref={entrance}
        type="button"
        className="store__buy store__buy--quiet"
        aria-haspopup="dialog"
        aria-expanded={choosing}
        onClick={() => (choosing ? close() : setChoosing(true))}
      >
        Manage or Cancel Plan
        <span className="store__buy-caret">
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
        </span>
      </button>

      {choosing && (
        <PlanPanel
          label={`Manage or cancel your ${planName} plan`}
          title="Manage Subscription"
          step={step.at}
          onClose={close}
        >
          {billingLinkMissing && (
            <p className="store__billing-note">
              <strong>{STORE_BILLING_LINK_NOTICE.name}.</strong> {STORE_BILLING_LINK_NOTICE.text}
            </p>
          )}
          {step.at === 'menu' && (
            <ul className="store__plan-list" data-menu>
              <PlanRow
                label="Change Plan"
                note="Move between the Cloud plans, or between monthly and yearly, on Stripe's page."
                onClick={() => void goToStripe('update')}
              />
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
                      ? `Renewals stop. Yours until ${formatDay(shown.endsAt.toISOString())}, then your data goes read-only.`
                      : 'Renewals stop. Yours to the end of the period you have paid for, then your data goes read-only.'
                  }
                  tone="leave"
                  onClick={() => setStep({ at: 'confirm' })}
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
              <p className="store__ask-q">Cancel this subscription?</p>
              <p className="store__ask-what">
                {shown.endsAt
                  ? `Nothing more is charged, and nothing is taken away today. Your storage keeps working until ${formatDay(shown.endsAt.toISOString())}. After that your hosted data stays readable and downloadable for a while — the Store's Cloud section says how long — and comes back in full if you resubscribe before it is removed.`
                  : 'Nothing more is charged, and nothing is taken away today. Your storage keeps working to the end of the period you have paid for, then your hosted data stays readable and downloadable for a while before it is removed.'}
              </p>
              <div className="store__ask-row">
                <button type="button" className="store__ghost" onClick={() => setStep({ at: 'menu' })}>
                  Keep My Plan
                </button>
                <button
                  type="button"
                  className="store__buy store__buy--leave"
                  onClick={() => void changeRenewal(false)}
                >
                  Yes, Stop Renewals
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

          {step.at === 'error' && (
            <div className="store__ask">
              <p className="store__note store__note--warn">{billingMessage(step.error)}</p>
              <div className="store__ask-row">
                <button type="button" className="store__ghost" onClick={() => setStep({ at: 'menu' })}>
                  Back
                </button>
                <button type="button" className="store__ghost" onClick={close}>
                  Close
                </button>
              </div>
            </div>
          )}
        </PlanPanel>
      )}
    </>
  )
}
