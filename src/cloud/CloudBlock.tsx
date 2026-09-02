import { formatDay } from '../store/grant'
import type { CloudStatus } from './useCloudStatus'

/**
 * What a revoked account is told about TDG Cloud, wherever Cloud is drawn.
 *
 * One component for the Store shelf and the Account fold, so the two cannot
 * say different things about the same block — the fold used to say nothing at
 * all: a revoked account opening `#/account` read "No Cloud plan on this
 * account" and was pointed at the Store, where every card refused it, while
 * every upload from its apps answered 42501 with no sentence anywhere saying
 * why. Rule 5: a revoked state never falls back to offering the product, and
 * every reachable state gets a face.
 *
 * The words say what, why (in the developer's own reason, or that none was
 * recorded) and when — the same three the Store's pack card gives a revoked
 * pack, in the same classes, so it looks like the rest of the shop.
 *
 * `planName` is the plan whose card this is drawn on, when it is drawn on
 * one. A block naming that plan is named as the reason; any other block is
 * said as the whole of Cloud, because that is what the server's write gate
 * refuses — every Cloud write, for any `app = 'cloud'` revocation row.
 */
export function CloudBlock({
  block,
  planId,
  planName,
}: {
  block: NonNullable<CloudStatus['revoked']>
  planId?: string
  planName?: string
}) {
  return (
    <>
      <p className="store__revoked">
        <span className="store__revoked-mark" aria-hidden="true">
          <Cross />
        </span>
        <span>
          <strong>
            {planId !== undefined && block.pack === planId
              ? `${planName ?? planId} was removed, so TDG Cloud is not available on this account`
              : 'TDG Cloud is not available on this account'}
          </strong>
          <span className="store__revoked-why">
            {block.reason ?? 'No reason was recorded with it.'}
          </span>
        </span>
      </p>
      <p className="store__note store__note--warn">
        We removed it on {formatDay(block.created_at) ?? 'an earlier date'}, and it cannot be
        bought again from here. Anything already hosted stays readable and downloadable. If you
        think this is wrong, send us feedback from the account menu.
      </p>
    </>
  )
}

/** The refusal mark, drawn where it is used (AGENTS.md §5). */
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
