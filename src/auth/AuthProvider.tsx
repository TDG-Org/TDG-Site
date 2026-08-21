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
import { OFFLINE_MESSAGE, authMessage } from './wording'

/**
 * The site's own sign-in endpoint. GoTrue only knows email and password, so
 * turning a USERNAME into a session needs a server that may call
 * `bea_login_identity` — a browser may not, because a function that turns a
 * public handle into somebody's email address is an email-harvesting endpoint.
 */
const ACCOUNT_FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tdg-site-account`

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
}

type SignUpInput = { email: string; password: string; username: string; displayName: string }
/** Username OR email — the whole point of the endpoint above. */
type SignInInput = { identifier: string; password: string }
type OAuthProvider = 'github' | 'google'

type AuthContextValue = {
  status: 'loading' | 'signedOut' | 'signedIn'
  user: User | null
  profile: Profile | null
  /** subscriptions.tier for the signed-in user ('free' by default); null while signed out. */
  tier: string | null
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

/** Columns the UI actually reads — never select('*') against a shared table. */
const PROFILE_COLUMNS = 'user_id,username,display_name'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [tier, setTier] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'signedOut' | 'signedIn'>('loading')
  const [recovery, setRecovery] = useState(false)
  const [oauthError, setOauthError] = useState<string | null>(null)

  // A provider that isn't enabled yet redirects back here with ?error=…
  // instead of raising synchronously — this is the only place that lands.
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
      // a normal sign-in — hold it in "recovery" until a new password is set,
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

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      profile,
      tier,
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
         * already knows with a success shaped exactly like a new one — a user
         * object, no session — so that a stranger cannot use the form to learn
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
        // localStorage and starts the refresh timer — the session is not
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
          options: { redirectTo: window.location.origin },
        })
        return { error: error?.message ?? null }
      },

      async resetPassword(identifier) {
        // Through the endpoint too, so "I forgot my password" works for
        // somebody who only ever knew their username.
        const answer = await callAccountFn({
          action: 'reset',
          identifier,
          redirectTo: window.location.origin,
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
        // revokes every session this user has — every other device, and every other
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
