/**
 * What a refusal SAYS, in one place.
 *
 * ## Match on codes, never on message text
 *
 * GoTrue ships stable `error_code` values (`@supabase/auth-js`'s
 * `error-codes.d.ts`), and matching those instead of the human sentence is not
 * a style preference. It is the difference between a right answer and a wrong
 * one. The messages OVERLAP: refusing a password you are already using reads
 * "New password should be different from the old password.", which contains
 * the substring "password should be" that a too-short check would look for. A
 * table of substrings therefore answers "use at least six characters" to
 * somebody who typed twelve, and which arm wins is decided by nothing more
 * principled than the order they happen to be written in.
 *
 * A code cannot be a prefix of another code.
 *
 * ## Two vocabularies meet here
 *
 * `tdg-site-account` answers with a deliberately tiny set (`invalid_credentials`,
 * `email_not_confirmed`, `rate_limited`, `server_error`, `bad_request`) chosen
 * so it can never reveal whether an account exists. supabase-js answers with
 * GoTrue's own codes for everything the browser does directly. Both land here,
 * so the site says one thing about one situation however it found out.
 */

/** The endpoint's own vocabulary, plus GoTrue's codes for the direct calls. */
export function authMessage(code: string | null | undefined, fallback?: string): string {
  switch (code) {
    // ── from tdg-site-account ──
    case 'invalid_credentials':
      return 'That username or email and password do not match an account.'
    case 'email_not_confirmed':
      return 'Confirm your email first. The link is in the message we sent when you signed up.'
    case 'rate_limited':
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Too many attempts just now. Wait a minute and try again.'
    case 'bad_request':
      return 'Fill in both fields and try again.'

    // ── from GoTrue, for the calls the browser makes itself ──
    case 'user_already_exists':
    case 'email_exists':
      return 'An account already has that email. Log in instead, or reset the password.'
    case 'weak_password':
      // Deliberately no number: the policy lives in the dashboard and can change
      // with no build here, so a length quoted in this file goes stale in the
      // worst direction, telling somebody a password is fine that the server
      // will refuse. The server's own sentence is passed through instead.
      return fallback ?? "That password isn't strong enough."
    case 'same_password':
      return "That's already your password. Choose a different one."
    case 'validation_failed':
      return "Check the details above. Something there isn't in a form we can use."
    case 'signup_disabled':
      return 'New accounts are switched off at the moment.'
    case 'user_banned':
      return "That account is suspended. Get in touch if you think that's wrong."
    case 'session_not_found':
    case 'refresh_token_not_found':
      return 'That session has ended. Log in again.'
    case 'otp_expired':
      return 'That link has expired. Ask for a new one.'
    case 'server_error':
      return 'The account server had a problem. Try again in a moment.'
    default:
      return fallback ?? 'Something went wrong. Try again in a moment.'
  }
}

/** Sentence case, for a request that never reached the server at all. */
export const OFFLINE_MESSAGE =
  "Couldn't reach the account server. Check your connection and try again."

/**
 * The one place the site decides what a username may look like.
 *
 * Kept in step with `bea_username_available` on the server, which is the
 * authority. This only refuses shapes that could never be valid, so a name
 * that cannot work never costs a round trip. It is NOT the check that decides
 * availability; that answer can only come from the server.
 */
export const USERNAME_MIN = 3
export const USERNAME_MAX = 20
export const USERNAME_RULE = 'Usernames are 3–20 characters: letters, numbers, underscore.'

export function usernameShapeProblem(raw: string): string | null {
  const name = raw.trim()
  if (name === '') return 'Choose a username.'
  if (name.length < USERNAME_MIN || name.length > USERNAME_MAX) return USERNAME_RULE
  if (!/^[a-z0-9_]+$/i.test(name)) return USERNAME_RULE
  return null
}
