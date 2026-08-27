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
  signUp: (input: SignUpInput) => Promise<{ error: string | null; needsEmailConfirm: boolean }>
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

/** Columns the UI actually reads. Never select('*') against a shared table. */
const PROFILE_COLUMNS = 'user_id,username,display_name,is_admin'

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
      supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('user_id', uid)
        .maybeSingle()
        .then(({ data }) => {
          if (!cancelled) setProfile(data)
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

      async signUp({ email, password, username, displayName }) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username, display_name: displayName || null } },
        })
        if (error) {
          return { error: authMessage(error.code, error.message), needsEmailConfirm: false }
        }
        /*
         * A duplicate email does NOT come back as an error.
         *
         * With confirmation required, GoTrue answers a sign-up for an address it
         * already knows with a success shaped exactly like a new one: a user
         * object and no session, so that a stranger cannot use the form to learn
         * who has an account here. The one thing that differs is the identities array,
         * which is empty in that case and holds the new identity otherwise.
         *
         * Left alone, the form then says "check your email for a confirmation
         * link" to somebody who already has an account and will never receive
         * one. Telling them plainly costs the anti-enumeration property, which
         * is a trade worth making on a site this size: the alternative is
         * sending a real person to wait for a message that is not coming.
         */
        const identities = data.user?.identities
        if (Array.isArray(identities) && identities.length === 0) {
          return { error: authMessage('email_exists'), needsEmailConfirm: false }
        }
        return { error: null, needsEmailConfirm: !data.session }
      },

      async signIn({ identifier, password }) {
        /*
         * Always through the endpoint, even when the identifier is obviously an
         * email. Two paths would mean two sets of refusals for one situation,
         * and the day they disagree is the day somebody is told their password
         * is wrong because they typed a name instead of an address.
         */
        const answer = await callAccountFn({ action: 'login', identifier, password })
        if (!answer.ok) return { error: answer.error }

        const session = answer.data.session as
          | { access_token?: string; refresh_token?: string }
          | undefined
        if (!session?.access_token || !session.refresh_token) {
          return { error: authMessage('server_error') }
        }
        // Adopting the session through supabase-js is what puts it in
        // localStorage and starts the refresh timer. The session is not
        // "signed in" to this tab until the library owns it.
        const { error } = await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        })
        return { error: error ? authMessage(error.code, error.message) : null }
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
