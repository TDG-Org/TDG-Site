import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { watchRevokedSession } from './sessionGuard'
import { OFFLINE_MESSAGE, authMessage } from './wording'

/**
 * The site's own sign-in endpoint. GoTrue only knows email and password, so
 * turning a USERNAME into a session needs a server that may call
 * `bea_login_identity`. A browser may not, because a function that turns a
 * public handle into somebody's email address is an email-harvesting endpoint.
 */
const ACCOUNT_FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tdg-site-account`

/**
 * Where a provider redirect and a password-reset email are told to land.
 *
 * **`window.location.origin` alone is wrong here, and wrong only in
 * production.** This site is served from a subpath — `base: '/TDG-Site/'` in
 * vite.config.ts — so the origin on its own is `https://tdg-org.github.io`,
 * which is the ORG's Pages root and not this site. Somebody who signed in with
 * GitHub or Google, or clicked the link in a reset email, was returned to
 * somebody else's index page, and the two handlers waiting for them — the
 * `?error=` reader and the `PASSWORD_RECOVERY` branch, both below — live on a
 * page that never loaded. They could not run, so nothing ever looked broken
 * from in here.
 *
 * `BASE_URL` is the piece that knows the subpath: `/` under `npm run dev`,
 * `/TDG-Site/` in a production build, always with a trailing slash. Same
 * reasoning as `src/lib/asset.ts`, and the same failure shape AGENTS.md rule 15
 * names — it works perfectly in dev and breaks only after deploy, which is why
 * it sat here unnoticed.
 *
 * Read at call time rather than at module load: `window.location.origin` is
 * whatever host this build is actually being served from, so one build works on
 * localhost, on `vite preview` and on Pages without being told which.
 *
 * The other half of this is NOT in this repo. GoTrue checks the value against
 * the project's own **Redirect URLs allow-list**, a Supabase dashboard setting,
 * and refuses anything not on it. `https://tdg-org.github.io/TDG-Site/**` has
 * to be listed there or the corrected URL is refused just as flatly as the
 * wrong one worked.
 */
const siteUrl = () => window.location.origin + import.meta.env.BASE_URL

async function callAccountFn(
  body: Record<string, unknown>,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const res = await fetch(ACCOUNT_FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (res.ok && !data.error) return { ok: true, data }
    return { ok: false, error: authMessage(typeof data.error === 'string' ? data.error : null) }
  } catch {
    // A fetch that never landed is NOT bad credentials, and saying so would
    // send somebody to reset a password that was right all along.
    return { ok: false, error: OFFLINE_MESSAGE }
  }
}

/**
 * Username-or-email + password → a session this tab owns.
 *
 * At module scope, and not a line inside the context object, because TWO
 * things need it: the Login tab, and `signUp` finishing what it started. A
 * second copy inside sign-up would be a second set of refusals for one
 * situation, which is the exact thing the endpoint exists to prevent — see the
 * note inside `signIn`.
 */
async function passwordSignIn(identifier: string, password: string): Promise<{ error: string | null }> {
  const answer = await callAccountFn({ action: 'login', identifier, password })
  if (!answer.ok) return { error: answer.error }

  const session = answer.data.session as
    | { access_token?: string; refresh_token?: string }
    | undefined
  if (!session?.access_token || !session.refresh_token) {
    return { error: authMessage('server_error') }
  }
  // Adopting the session through supabase-js is what puts it in localStorage
  // and starts the refresh timer. The session is not "signed in" to this tab
  // until the library owns it.
  const { error } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  })
  return { error: error ? authMessage(error.code, error.message) : null }
}

export type Profile = {
  user_id: string
  username: string | null
  display_name: string | null
  /**
   * The TDG developer flag on the shared `profiles` table, the same column
   * `bea_is_admin()` reads, so this and the server always agree about who is a
   * developer. Readable here only because `profiles_select_own` lets an account
   * read its OWN row: nobody learns anybody else's.
   *
   * It reveals the Developer console (src/dev/) and nothing more. Every
   * privileged action re-checks it in Postgres, so a copy of this site with the
   * flag forced true is a page full of buttons that all answer 42501.
   */
  is_admin: boolean
  /** The few lines somebody wrote about themselves. `not null default ''` in
   *  Postgres, so an account that has written nothing has an empty string
   *  rather than a null — the form and the column agree about "no bio". */
  bio: string
  /** A second address you can sign in with. Reset links still only ever go to
   *  the address you signed up with; see `src/auth/README.md`. */
  recovery_email: string | null
  /**
   * When the username was last changed, or null while it has never been.
   *
   * Read so the Account page can say when the next change is allowed BEFORE
   * somebody types one and is refused. The fourteen days are the server's,
   * stamped by a trigger on a column no client may write — this is that
   * stamp, not a local guess at it, and `PT429`'s own message remains the
   * authority the moment a save is actually refused.
   */
  username_changed_at: string | null
}

type SignUpInput = { email: string; password: string; username: string; displayName: string }
/** Username OR email, which is the whole point of the endpoint above. */
type SignInInput = { identifier: string; password: string }
type OAuthProvider = 'github' | 'google'

type AuthContextValue = {
  status: 'loading' | 'signedOut' | 'signedIn'
  user: User | null
  profile: Profile | null
  /** subscriptions.tier for the signed-in user ('free' by default); null while signed out. */
  tier: string | null
  /** True only for a signed-in TDG developer. Reveals the Developer console; grants nothing. */
  isAdmin: boolean
  /** True from the moment a password-reset email link lands back here until updatePassword succeeds. */
  recovery: boolean
  /** Set when a provider redirect lands back with `?error=…` (e.g. OAuth not configured yet). */
  oauthError: string | null
  dismissOauthError: () => void
  /**
   * Read the profile row again.
   *
   * For the one surface that CHANGES it: the Account page's Your Details
   * fields. Without this, saving a display name would leave the nav's account
   * menu, the page's own title and the Store's greeting all showing the old
   * one until the next sign-in — the profile is fetched once, when the session
   * arrives, because until now nothing on this site could edit it.
   *
   * Deliberately a re-READ rather than a setter taking the new values. The row
   * has triggers on it — `username_changed_at` is stamped by one, and
   * `recovery_email` is lowercased and trimmed by another — so what was sent
   * is not always what was stored, and a client that assumed otherwise would
   * show a value the database does not agree with. Ask.
   *
   * Never throws: a failed refresh leaves the previous profile in place, which
   * is stale but true, rather than blanking an account's own name because one
   * request lost the network.
   */
  refreshProfile: () => Promise<void>
  /**
   * Creates the account AND signs it in.
   *
   * Two failures, deliberately kept apart, because they need opposite things
   * said about them. `error` means **nothing was created** and the form should
   * be tried again. `pending` means the account is REAL and this browser is
   * not signed in to it — the sentence says why — and treating that as an
   * error would send somebody to sign up a second time on an address that is
   * now taken. Both null is the ordinary answer: signed in, close the modal.
   */
  signUp: (input: SignUpInput) => Promise<{ error: string | null; pending: string | null }>
  signIn: (input: SignInInput) => Promise<{ error: string | null }>
  signInWithOAuth: (provider: OAuthProvider) => Promise<{ error: string | null }>
  /** Takes a username or an email, like signing in does. */
  resetPassword: (identifier: string) => Promise<{ error: string | null }>
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

/**
 * Columns the UI actually reads. Never select('*') against a shared table.
 *
 * `bio` and `recovery_email` joined the list when the Account page gained
 * fields for them: a form that cannot read the current value can only offer an
 * empty box, and an empty box beside a saved value reads as the value having
 * been lost. Both are readable here for the same reason `is_admin` is —
 * `profiles_select_own` lets an account read its OWN row, and nobody learns
 * anybody else's.
 */
const PROFILE_COLUMNS =
  'user_id,username,display_name,is_admin,bio,recovery_email,username_changed_at'

/**
 * One profile read, shared by the sign-in path and by `refreshProfile`.
 *
 * A function rather than two copies of the query, because the column list is
 * the thing that would drift: a field added for the Account page and not added
 * here comes back undefined, and an undefined value in a controlled input is
 * React quietly switching it to uncontrolled halfway through a save.
 *
 * Answers null on failure, and the caller decides what that means — on boot it
 * means "no profile yet", on a refresh it means "keep the one you have".
 */
async function readProfile(uid: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('user_id', uid)
    .maybeSingle()
  return data
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [tier, setTier] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'signedOut' | 'signedIn'>('loading')
  const [recovery, setRecovery] = useState(false)
  const [oauthError, setOauthError] = useState<string | null>(null)

  // A provider that isn't enabled yet redirects back here with ?error=…
  // instead of raising synchronously, and this is the only place that lands.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const err = params.get('error_description') || params.get('error')
    if (!err) return
    setOauthError(err.replace(/\+/g, ' '))
    params.delete('error')
    params.delete('error_code')
    params.delete('error_description')
    const rest = params.toString()
    window.history.replaceState(
      {},
      '',
      window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash,
    )
  }, [])

  useEffect(() => {
    let cancelled = false

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // A clicked reset-password link lands here as a real session, not as
      // a normal sign-in, so hold it in "recovery" until a new password is set,
      // so the UI shows "choose a new password" instead of flipping to Account.
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      setUser(session?.user ?? null)
      setStatus(session?.user ? 'signedIn' : 'signedOut')
      if (!session?.user) {
        setProfile(null)
        setTier(null)
        return
      }
      const uid = session.user.id
      void readProfile(uid).then((row) => {
        if (!cancelled) setProfile(row)
      })
      supabase
        .from('subscriptions')
        .select('tier')
        .eq('user_id', uid)
        .maybeSingle()
        .then(({ data }) => {
          if (!cancelled) setTier(data?.tier ?? null)
        })
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  /*
   * A session can be ended somewhere else, by the Developer console's Sign Out
   * Everywhere, or by a ban. Neither can expire the access token already in this
   * browser, and supabase-js restores that token from storage without asking
   * anybody, so without this the tab stays signed in for up to an hour of
   * reloads after the account was signed out. See sessionGuard.ts.
   */
  useEffect(() => watchRevokedSession(supabase), [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      profile,
      tier,
      isAdmin: profile?.is_admin === true,
      recovery,
      oauthError,
      dismissOauthError: () => setOauthError(null),

      async refreshProfile() {
        const uid = user?.id
        if (!uid) return
        const row = await readProfile(uid)
        // A failed read leaves the previous profile standing. Stale and true
        // beats blank: this runs right after a save, and blanking somebody's
        // own name because the follow-up request lost the network would look
        // exactly like the save having destroyed it.
        if (row) setProfile(row)
      },

      async signUp({ email, password, username, displayName }) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username, display_name: displayName || null } },
        })
        if (error) {
          return { error: authMessage(error.code, error.message), pending: null }
        }
        /*
         * A duplicate email does NOT come back as an error.
         *
         * While the project's `mailer_autoconfirm` is off — it is; ask
         * `/auth/v1/settings` — GoTrue answers a sign-up for an address it
         * already knows with a success shaped exactly like a new one: a user
         * object and no session, so that a stranger cannot use the form to
         * learn who has an account here. The one thing that differs is the
         * identities array, which is empty in that case and holds the new
         * identity otherwise.
         *
         * Left alone, that success reaches somebody who already has an account
         * as a sign-up that appeared to work and left them signed out, with
         * nothing on the page saying why. Telling them plainly costs the
         * anti-enumeration property, which is a trade worth making on a site
         * this size.
         *
         * This arm survives the switch being turned off, rather than becoming
         * the wrong answer: GoTrue then refuses a duplicate outright with
         * `user_already_exists`, which is the arm above, and `wording.ts`
         * answers both codes with the same sentence.
         */
        const identities = data.user?.identities
        if (Array.isArray(identities) && identities.length === 0) {
          return { error: authMessage('email_exists'), pending: null }
        }
        if (data.session) return { error: null, pending: null }

        /*
         * No session came back, so finish the job here rather than sending
         * somebody to their inbox.
         *
         * Creating an account signs you in. That is the rule for every TDG
         * app, and tdg-core keeps it in the place all of them share:
         * `on_auth_user_confirm_email`, a BEFORE INSERT trigger on
         * `auth.users` that stamps `email_confirmed_at` as the row is
         * written, so GoTrue finds the account already confirmed, sends no
         * confirmation email, and hands back a session. Measured on the live
         * project, not assumed — the migration header records exactly what was
         * driven. So this branch does not run today.
         *
         * It is here because the rule lives in a database this repo does not
         * own. Drop that trigger and GoTrue goes back to answering a sign-up
         * with a user and no session; the account still EXISTS and its
         * password still works, so one password grant is the difference
         * between somebody being signed in and somebody being told to go and
         * find an email. Cheap insurance for the exact wording of the ask.
         */
        const { error: signInError } = await passwordSignIn(email, password)
        if (!signInError) return { error: null, pending: null }

        /*
         * Created, and we could not sign them in. NOT an `error`: the account
         * is real, and saying otherwise would send somebody to make a second
         * one on an address that is now taken. The endpoint's own sentence is
         * carried through rather than replaced, because the two ways this can
         * happen need opposite things done about them — an unconfirmed email
         * means go and click a link, a lost connection means press it again —
         * and one sentence covering both would be right about neither.
         */
        return {
          error: null,
          pending: `Your account is ready, but we couldn't sign you in just now. ${signInError}`,
        }
      },

      async signIn({ identifier, password }) {
        /*
         * Always through the endpoint, even when the identifier is obviously an
         * email. Two paths would mean two sets of refusals for one situation,
         * and the day they disagree is the day somebody is told their password
         * is wrong because they typed a name instead of an address. `signUp`
         * reaches the same helper for that reason.
         */
        return passwordSignIn(identifier, password)
      },

      async signInWithOAuth(provider) {
        const { error } = await supabase.auth.signInWithOAuth({
          provider,
          // siteUrl(), never window.location.origin: the origin alone drops the
          // /TDG-Site/ base path and lands the reader on the org's Pages root.
          options: { redirectTo: siteUrl() },
        })
        return { error: error?.message ?? null }
      },

      async resetPassword(identifier) {
        // Through the endpoint too, so "I forgot my password" works for
        // somebody who only ever knew their username.
        const answer = await callAccountFn({
          action: 'reset',
          identifier,
          // Same as OAuth above, and it matters more here: this one is baked
          // into an email that outlives the tab that asked for it, so a wrong
          // base path is a dead link in somebody's inbox rather than a bad
          // second of browsing. The endpoint passes this straight through to
          // GoTrue's `redirect_to`; see supabase/functions/tdg-site-account.
          redirectTo: siteUrl(),
        })
        return { error: answer.ok ? null : answer.error }
      },

      async updatePassword(newPassword) {
        const { error } = await supabase.auth.updateUser({ password: newPassword })
        if (error) return { error: authMessage(error.code, error.message) }
        setRecovery(false)
        return { error: null }
      },

      async signOut() {
        setRecovery(false)
                // LOCAL scope, deliberately. supabase-js defaults signOut() to GLOBAL, which
        // revokes every session this user has: every other device, and every other
        // TDG app sharing this auth project. Signing out here was signing them out of
        // everything, which reached the user as "my apps keep signing me out".
        // Signing out everywhere is a separate feature and would need its own button.
        await supabase.auth.signOut({ scope: 'local' })
      },
    }),
    [status, user, profile, tier, recovery, oauthError],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
