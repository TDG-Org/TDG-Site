import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import type { PackGrant } from '../store/grant'

/**
 * This account's whole Cloud standing, in one round trip.
 *
 * `tdg_cloud_status()` on tdg-core answers everything at once — whether Cloud
 * is open, whether it is open FOR THIS ACCOUNT (the developer/tester door),
 * the plan and its grant, the pooled quota against what is used and reserved,
 * the per-app breakdown, this month's metered downloads, the retention
 * standing, any revocation, and the warnings the server itself computed. One
 * verb rather than five reads, so the Store shelf and the Account fold can
 * never disagree about the same account: they are printing one answer.
 *
 * ## The same rules `useOwnedPacks` keeps, because it is the same money
 *
 * A failed read is its own state and never becomes "you have no plan" — a
 * shop must not offer to sell what a hiccup hid. And the hook re-asks at the
 * moments a person expects an answer (tab foreground, focus, back online,
 * every five minutes), because a plan can lapse, renew or be revoked in some
 * other tab and nothing tells this one.
 */

export type CloudWarning = { kind: string; deadline?: string }

export type CloudStatus = {
  /** Cloud is on sale for everybody. */
  available: boolean
  /** Cloud works for THIS account — launched, or the developer/tester door. */
  enabledForYou: boolean
  /** Enabled while the public answer is still Coming Soon. */
  testing: boolean
  plan: { pack: string; name: string | null; grant: PackGrant | null } | null
  quotaBytes: number
  usedBytes: number
  reservedBytes: number
  freeBytes: number
  files: number
  perApp: { app: string; bytes: number; files: number }[]
  egress: { monthBytes: number; allowanceBytes: number; behavior: string }
  retention: { state: 'none' | 'read_only' | 'purge_eligible'; lapsedAt: string | null; deadline: string | null }
  revoked: { pack: string; reason: string | null; created_at: string } | null
  warnings: CloudWarning[]
}

export type CloudStatusState =
  | { kind: 'signedOut' }
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; status: CloudStatus }

const RECHECK_MS = 5 * 60 * 1000

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function parseStatus(raw: unknown): CloudStatus | null {
  if (raw === null || typeof raw !== 'object') return null
  const d = raw as Record<string, unknown>
  const plan = d.plan as Record<string, unknown> | null
  const egress = (d.egress ?? {}) as Record<string, unknown>
  const retention = (d.retention ?? {}) as Record<string, unknown>
  const retState = String(retention.state ?? 'none')
  return {
    available: d.available === true,
    enabledForYou: d.enabled_for_you === true,
    testing: d.testing === true,
    plan:
      plan !== null && typeof plan === 'object' && typeof plan.pack === 'string'
        ? {
            pack: plan.pack,
            name: typeof plan.name === 'string' ? plan.name : null,
            grant:
              plan.grant !== null && typeof plan.grant === 'object'
                ? (plan.grant as PackGrant)
                : null,
          }
        : null,
    quotaBytes: num(d.quota_bytes),
    usedBytes: num(d.used_bytes),
    reservedBytes: num(d.reserved_bytes),
    freeBytes: num(d.free_bytes),
    files: num(d.files),
    perApp: Array.isArray(d.per_app)
      ? (d.per_app as Record<string, unknown>[])
          .filter((r) => typeof r?.app === 'string')
          .map((r) => ({ app: String(r.app), bytes: num(r.bytes), files: num(r.files) }))
      : [],
    egress: {
      monthBytes: num(egress.month_bytes),
      allowanceBytes: num(egress.allowance_bytes),
      behavior: String(egress.behavior ?? 'warn'),
    },
    retention: {
      state: retState === 'read_only' || retState === 'purge_eligible' ? retState : 'none',
      lapsedAt: typeof retention.lapsed_at === 'string' ? retention.lapsed_at : null,
      deadline: typeof retention.deadline === 'string' ? retention.deadline : null,
    },
    revoked:
      d.revoked !== null && typeof d.revoked === 'object'
        ? (d.revoked as CloudStatus['revoked'])
        : null,
    warnings: Array.isArray(d.warnings)
      ? (d.warnings as Record<string, unknown>[])
          .filter((w) => typeof w?.kind === 'string')
          .map((w) => ({
            kind: String(w.kind),
            deadline: typeof w.deadline === 'string' ? w.deadline : undefined,
          }))
      : [],
  }
}

export function useCloudStatus(): { state: CloudStatusState; refresh: () => void } {
  const { status: authStatus, user } = useAuth()
  const [state, setState] = useState<CloudStatusState>({ kind: 'loading' })
  const [tick, setTick] = useState(0)
  const live = useRef(true)
  // Only the FIRST read may turn the fold red; a later failure leaves the
  // settled answer standing — the same rule useOwnedPacks keeps, for the same
  // reason: a re-check that failed is not an answer.
  const answered = useRef(false)
  const loadedFor = useRef<string | null>(null)

  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  const refresh = useCallback(() => setTick((n) => n + 1), [])

  const userId = user?.id ?? null

  useEffect(() => {
    if (authStatus === 'loading') {
      setState({ kind: 'loading' })
      return
    }
    if (authStatus === 'signedOut' || !userId) {
      loadedFor.current = null
      answered.current = false
      setState({ kind: 'signedOut' })
      return
    }
    if (loadedFor.current !== userId) {
      loadedFor.current = userId
      answered.current = false
      setState({ kind: 'loading' })
    }

    let cancelled = false
    void supabase.rpc('tdg_cloud_status').then(({ data, error }) => {
      if (cancelled || !live.current) return
      if (error) {
        if (!answered.current) setState({ kind: 'error' })
        return
      }
      const parsed = parseStatus(data)
      if (parsed === null) {
        if (!answered.current) setState({ kind: 'error' })
        return
      }
      answered.current = true
      setState({ kind: 'ready', status: parsed })
    })
    return () => {
      cancelled = true
    }
  }, [authStatus, userId, tick])

  useEffect(() => {
    if (authStatus !== 'signedIn' || !userId) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    const timer = window.setInterval(refresh, RECHECK_MS)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
    }
  }, [authStatus, userId, refresh])

  return { state, refresh }
}
