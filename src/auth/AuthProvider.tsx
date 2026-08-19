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

export type Profile = {
  user_id: string
  username: string | null
  display_name: string | null
}

type SignUpInput = { email: string; password: string; username: string; displayName: string }
type SignInInput = { email: string; password: string }
type OAuthProvider = 'github' | 'google'

type AuthContextValue = {
  status: 'loading' | 'signedOut' | 'signedIn'
  user: User | null
  profile: Profile | null
  /** subscriptions.tier for the signed-in user ('free' by default); null while signed out. */
  tier: string | null
  /** Set when a provider redirect lands back with `?error=…` (e.g. OAuth not configured yet). */
  oauthError: string | null
  dismissOauthError: () => void
  signUp: (input: SignUpInput) => Promise<{ error: string | null; needsEmailConfirm: boolean }>
  signIn: (input: SignInInput) => Promise<{ error: string | null }>
  signInWithOAuth: (provider: OAuthProvider) => Promise<{ error: string | null }>
  resetPassword: (email: string) => Promise<{ error: string | null }>
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

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
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
      oauthError,
      dismissOauthError: () => setOauthError(null),

      async signUp({ email, password, username, displayName }) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username, display_name: displayName || null } },
        })
        if (error) return { error: error.message, needsEmailConfirm: false }
        return { error: null, needsEmailConfirm: !data.session }
      },

      async signIn({ email, password }) {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        return { error: error?.message ?? null }
      },

      async signInWithOAuth(provider) {
        const { error } = await supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo: window.location.origin },
        })
        return { error: error?.message ?? null }
      },

      async resetPassword(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        })
        return { error: error?.message ?? null }
      },

      async signOut() {
        await supabase.auth.signOut()
      },
    }),
    [status, user, profile, tier, oauthError],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
