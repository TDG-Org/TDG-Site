import assert from 'node:assert/strict'
import test from 'node:test'
import { component, deferred, flush, hooks } from './harness.mjs'

test('a late account read cannot restore profile, privileges, tier or setup after sign-out', async () => {
  const h = hooks(), calls = []
  let emit
  const queue = (kind) => { const request = deferred(); calls.push({ kind, ...request }); return request.promise }
  const supabase = {
    auth: { onAuthStateChange(cb) { emit = cb; return { data: { subscription: { unsubscribe() {} } } } } },
    from(table) { return { select() { return this }, eq() { return this }, maybeSingle() { return queue(table) } } },
    rpc() { return { maybeSingle() { return queue('setup') } } },
  }
  const { AuthProvider } = component('src/auth/AuthProvider.tsx', h.React, {
    '../lib/supabase': { supabase }, './sessionGuard': { watchRevokedSession: () => () => {} }, './wording': {},
  })
  const render = () => h.render(() => AuthProvider({ children: null })).props.value
  render()
  emit('SIGNED_IN', { user: { id: 'ACCOUNT_A' } }); render()
  emit('SIGNED_OUT', null); render()
  calls.find((c) => c.kind === 'profiles').resolve({ data: { user_id: 'ACCOUNT_A', username: 'alice', is_admin: true } })
  calls.find((c) => c.kind === 'setup').resolve({ data: { needs_username: true, needs_password: true } })
  calls.find((c) => c.kind === 'subscriptions').resolve({ data: { tier: 'pro' } })
  await flush()
  const value = render()
  assert.equal(value.status, 'signedOut')
  for (const field of ['user', 'profile', 'tier', 'setup']) assert.equal(value[field], null, field)
  assert.equal(value.isAdmin, false)
})

function inbox() {
  const h = hooks(), replies = deferred(), notices = deferred()
  let auth = { status: 'signedIn', user: { id: 'ACCOUNT_A' } }, fetches = 0
  const { ReplyInbox } = component('src/feedback/ReplyInbox.tsx', h.React, {
    '../auth/AuthProvider': { useAuth: () => auth },
    '../lib/modal': { MODAL_LAYER: { feedback: 1 }, useBackdropClose: () => ({}), useModal() {} },
    './api': { fetchInbox: () => { fetches++; return replies.promise }, ackReply() {}, appName: (x) => x, FEEDBACK_APP_ID: 'tdg-site' },
    '../notices/api': { fetchNotices: () => notices.promise, ackNotice() {} },
  })
  return {
    render: () => h.render(() => ReplyInbox()),
    auth: (next) => { auth = next }, fetches: () => fetches,
    async reply() {
      replies.resolve([{ reply_id: 'a', message: 'PRIVATE REPORT A', body: 'PRIVATE RESPONSE A', app: 'tdg-site', kind: 'bug', replied_at: '2026-09-01', replied_by: 'TDG' }])
      notices.resolve([]); await flush()
    },
  }
}

test('open private messages disappear on the first signed-out render', async () => {
  const box = inbox(); box.render(); await box.reply()
  assert.ok(box.render())
  box.auth({ status: 'signedOut', user: null })
  assert.equal(box.render(), null)
})

test('same-account token refresh preserves an in-flight inbox read', async () => {
  const box = inbox(); box.render()
  box.auth({ status: 'signedIn', user: { id: 'ACCOUNT_A' } }); box.render()
  await box.reply()
  assert.ok(box.render())
  assert.equal(box.fetches(), 1)
})
