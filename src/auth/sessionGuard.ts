/**
 * Noticing that a session was ended somewhere ELSE.
 *
 * ## The hole this fills
 *
 * "Sign Out Everywhere" in the Developer console deletes every row this account
 * has in `auth.sessions`, and the cascade takes its refresh tokens with them.
 * That part has always worked: the refresh grant answers
 * `refresh_token_not_found` from the moment the button is pressed.
 *
 * What it does NOT do — because nothing can — is reach inside a browser and
 * expire the access token already sitting in its storage. A Supabase access
 * token is a signed JWT with a one-hour life, and PostgREST accepts it on its
 * signature alone; it never asks whether the session behind it still exists.
 * supabase-js, meanwhile, restores that token from storage on boot and only
 * talks to the server when the token is close to expiring.
 *
 * So the honest description of the old behaviour is: sign out everywhere ended
 * every session in the database, and the tab stayed signed in for up to another
 * hour, reloads included. Measured, not guessed — with the sessions deleted,
 * `GET /rest/v1/profiles` still answered 200 with the account's own row.
 *
 * ## What actually detects it
 *
 * GoTrue's own `/auth/v1/user` DOES check. The access token carries a
 * `session_id` claim, and the endpoint answers `403 session_not_found` when
 * that session is gone. `supabase.auth.getUser()` is that call. `getSession()`
 * is not — it reads storage and returns whatever it finds.
 *
 * This module is therefore one idea: ask the server whether the session is
 * still real, at the moments a person would expect an answer, and end the local
 * session when it says no.
 *
 * ## When it asks
 *
 * On start, whenever the tab comes back to the foreground, when the machine
 * comes back online, and every few minutes otherwise. Foreground is the one
 * that matters most: it is what makes a reload — or a click back onto the tab —
 * the moment somebody finds out, which is what "sign out everywhere" is
 * expected to mean.
 *
 * ## Why a failed check is not a sign-out
 *
 * A request that never landed says nothing about the session, and treating it
 * as a revocation would sign people out for walking into a lift. Only an answer
 * FROM the server counts, and only one that means this token is no longer
 * accepted. Everything else — a timeout, a dead network, a 500 — leaves the
 * session exactly as it was.
 */
import type { AuthError, SupabaseClient } from '@supabase/supabase-js'

/**
 * GoTrue error codes that mean *this token will never be accepted again*, as
 * opposed to "something went wrong just now".
 *
 * `session_not_found` is the one Sign Out Everywhere produces. The rest are the
 * neighbouring ways a session can stop existing between two page loads — a ban,
 * a deleted account, a session that timed out server-side — and every one of
 * them wants the same answer here.
 */
const REVOKED_CODES: ReadonlySet<string> = new Set([
  'session_not_found',
  'session_expired',
  'refresh_token_not_found',
  'refresh_token_already_used',
  'user_not_found',
  'user_banned',
  'bad_jwt',
])

/** Foreground and online checks cover a person who is here. This covers a tab left open. */
const RECHECK_MS = 5 * 60 * 1000

/**
 * True only when the server itself refused the token.
 *
 * **The name is checked first, and it is the branch that matters.** supabase-js
 * does not hand `session_not_found` back as it arrives: `lib/fetch.js` turns
 * that exact code into an `AuthSessionMissingError`, which carries NO code at
 * all and a status of 400 — not the 403 the server sent. A check written on
 * code or status alone therefore misses the one case this whole file exists
 * for, and does it silently. Measured in the library, not assumed.
 *
 * The codes and the status stay as the net for everything else: a raw error
 * that reached here unwrapped, and any refusal whose code this list has not met
 * yet, because `/auth/v1/user` answers 401 or 403 for exactly one reason. A
 * transport failure arrives with no status and no name of its own.
 */
function isRevoked(error: AuthError | null): boolean {
  if (!error) return false
  if (error.name === 'AuthSessionMissingError') return true
  if (error.code && REVOKED_CODES.has(error.code)) return true
  return error.status === 401 || error.status === 403
}

/**
 * Start watching, and return the function that stops.
 *
 * Safe to call with nobody signed in: every check begins by reading local
 * storage, and no stored session means no request.
 */
export function watchRevokedSession(client: SupabaseClient): () => void {
  let stopped = false
  let checking = false

  const check = async () => {
    // Claimed before the first await, not after: a reload fires the start check
    // and the focus check in the same tick, and a flag taken later lets both
    // through and asks the server twice for one answer.
    if (stopped || checking) return
    checking = true
    try {
      // Cheap and local. Asking the server about a session we do not have would
      // be a request per tab per five minutes for every signed-out visitor.
      const { data } = await client.auth.getSession()
      if (!data.session || stopped) return

      const { error } = await client.auth.getUser()
      if (stopped || !isRevoked(error)) return
      // LOCAL scope. The session this token belonged to is already gone from
      // the database — a global sign-out would be a second call, to revoke
      // nothing, with a dead token. All that is left to do is forget it here,
      // and that is what flips the app to signed out: signOut emits SIGNED_OUT
      // and AuthProvider is listening.
      await client.auth.signOut({ scope: 'local' })
    } finally {
      checking = false
    }
  }

  const onVisible = () => {
    if (document.visibilityState === 'visible') void check()
  }

  void check()
  const timer = window.setInterval(() => void check(), RECHECK_MS)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onVisible)
  window.addEventListener('online', onVisible)

  return () => {
    stopped = true
    window.clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', onVisible)
    window.removeEventListener('online', onVisible)
  }
}
