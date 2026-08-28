import { supabase } from '../lib/supabase'

/**
 * Messages about what an account OWNS, waiting for the person it is about.
 *
 * ## What this is for
 *
 * A developer can change what somebody owns from `#/dev` — grant a pack, end a
 * subscription, take a product out of reach entirely. Before this, none of that
 * said anything to the person it happened to: the next time they opened the
 * shop, a pack they had was gone, or a card they had never seen said Revoked,
 * and there was nowhere at all for the reason to live. **A change somebody can
 * see and cannot account for reads as a fault**, and it is the kind of fault
 * people write in about.
 *
 * So the console offers one tick box beside the Save button, and the words the
 * developer writes there land here.
 *
 * ## Why it is a table and not an email
 *
 * The same reason `tdg_feedback_replies` is one, and the reason is not
 * squeamishness about mail: this project has no outbound mail at all, and the
 * entitlement path is the last place to add a dependency that can fail
 * silently at somebody else's SMTP server. A notice waits in tdg-core until the
 * person's own app asks for it, is shown once, and is acked by them pressing a
 * button — so **"sent" and "seen" stay different facts**, which is exactly the
 * distinction the Feedback tab already teaches a developer to read.
 *
 * ## Why the client is here and the panel is not
 *
 * This folder owns the fact; `src/feedback/ReplyInbox.tsx` draws it, along with
 * the feedback replies it already drew. One panel and not two, because both are
 * "a message from us that is waiting for you" and two dialogs opening over each
 * other at boot is worse than either. The same split `src/badges/api.ts` keeps
 * with the Developer console: the folder that owns the thing owns its client,
 * and other folders are callers.
 *
 * The verbs, and the whole reasoning, are in
 * `supabase/migrations/20260828235900_product_revocations_and_notices.sql`.
 */

/** One message waiting for the signed-in account. */
export type Notice = {
  id: number
  /** Which product it is about — an app id, or `tdg-site` for the shop itself. */
  app: string
  /** Title Case, short: what happened. */
  subject: string
  /** Sentence case: what we did, in the words a developer wrote for them. */
  body: string
  created_at: string
}

/**
 * What is waiting, oldest first.
 *
 * Opportunistic, exactly like the feedback inbox: it is asked once per sign-in
 * and a failure answers an empty list rather than a state. Nothing here is
 * urgent enough to earn an error surface of its own on a marketing page, and a
 * panel that could fail to open is better than one that opens to say it could
 * not open.
 */
export async function fetchNotices(): Promise<Notice[]> {
  const { data, error } = await supabase.rpc('tdg_my_notices')
  if (error || !Array.isArray(data)) return []
  return (data as Notice[]).filter(
    (n) => typeof n?.id === 'number' && typeof n?.body === 'string' && n.body.length > 0,
  )
}

/**
 * Read. Fire-and-forget, and only ever from the button that says so.
 *
 * `void supabase.rpc(…)` on its own compiles, runs and dispatches nothing —
 * the builder is lazy — which is the trap `feedback/api.ts` documents beside
 * its own ack. The `.then()` is what actually sends it.
 */
export function ackNotice(id: number): void {
  void supabase.rpc('tdg_notice_ack', { p_id: id }).then(
    () => undefined,
    () => undefined,
  )
}
