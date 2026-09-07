import assert from 'node:assert/strict'
import test from 'node:test'
import { component, deferred, flush, hooks } from './harness.mjs'

const grant = { kind: 'subscription', status: 'active', subscriptionId: 'sub_fixture', currentPeriodEnd: '2099-01-01', cancelAtPeriodEnd: false }

test('revoked Cloud status includes the subscription held under the block', async () => {
  const h = hooks(), calls = []
  const supabase = { rpc(name) {
    calls.push(name)
    return Promise.resolve({ data: name === 'tdg_cloud_status'
      ? { plan: null, revoked: { pack: 'standard', reason: 'Fixture', created_at: '2026-09-01' } }
      : [{ app: 'cloud', held_grants: { standard: grant } }, { app: 'other', held_grants: { secret: grant } }] })
  } }
  const { useCloudStatus } = component('src/cloud/useCloudStatus.ts', h.React, {
    '../lib/supabase': { supabase }, '../auth/AuthProvider': { useAuth: () => ({ status: 'signedIn', user: { id: 'ACCOUNT_A' } }) },
  })
  h.render(useCloudStatus); await flush()
  const { state } = h.render(useCloudStatus)
  assert.equal(state.kind, 'ready')
  assert.equal(state.status.revoked.held_grants.standard.subscriptionId, 'sub_fixture')
  assert.equal(state.status.revoked.held_grants.secret, undefined)
  assert.deepEqual(calls, ['tdg_cloud_status', 'tdg_my_revocations'])
})

function find(node, predicate) {
  if (!node || typeof node !== 'object') return undefined
  if (predicate(node)) return node
  for (const child of Array.isArray(node) ? node : Object.values(node)) {
    const found = find(child, predicate)
    if (found) return found
  }
}

test('a revoked Cloud plan offers cancellation without resuming or changing the plan', async () => {
  const h = hooks(), calls = []
  const grants = component('src/store/grant.ts', h.React, {})
  const { CloudManage } = component('src/cloud/CloudManage.tsx', h.React, {
    '../components/PlanChooser': { PlanPanel: 'Panel', PlanRow: 'Row' },
    '../store/billing': { setRenewal: async (args) => { calls.push(args); return { ok: true, value: { currentPeriodEnd: '2099-01-01' } } }, openBilling() {}, billingMessage() {} },
    '../store/grant': grants, '../data/storeAnswers': { STORE_BILLING_LINK_NOTICE: {} },
    '../store/checkoutTab': { reserveCheckoutTab() {} },
  })
  const render = () => h.render(() => CloudManage({ pack: 'standard', planName: 'Cloud Standard', grant, blocked: true, onChanged() {} }))
  const entrance = find(render(), (n) => n.type === 'button')
  entrance.props.onClick()
  const menu = render()
  assert.equal(find(menu, (n) => n.props?.label === 'Change Plan'), undefined)
  assert.equal(find(menu, (n) => n.props?.label === 'Resume Subscription'), undefined)
  find(menu, (n) => n.props?.label === 'Cancel Subscription').props.onClick()
  const confirm = render()
  assert.ok(JSON.stringify(confirm).includes('stays unavailable'))
  find(confirm, (n) => n.type === 'button' && n.props?.children === 'Yes, Stop Renewals').props.onClick()
  await flush()
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ app: 'cloud', pack: 'standard', renew: false }])
})

test('the billing tab is reserved before waiting for its portal URL', async () => {
  const h = hooks(), response = deferred(), events = []
  const { CloudManage } = component('src/cloud/CloudManage.tsx', h.React, {
    '../components/PlanChooser': { PlanPanel: 'Panel', PlanRow: 'Row' },
    '../store/billing': { openBilling() { events.push('request'); return response.promise }, billingMessage() {} },
    '../store/grant': component('src/store/grant.ts', h.React, {}),
    '../data/storeAnswers': { STORE_BILLING_LINK_NOTICE: {} },
    '../store/checkoutTab': { reserveCheckoutTab() { events.push('reserve'); return { navigate(url) { events.push(url); return true }, close() { events.push('close') } } } },
  })
  const render = () => h.render(() => CloudManage({ pack: 'standard', planName: 'Cloud Standard', grant, onChanged() {} }))
  find(render(), n => n.type === 'button').props.onClick()
  find(render(), n => n.props?.label === 'Payment & Receipts').props.onClick()
  assert.deepEqual(events, ['reserve', 'request'])
  response.resolve({ ok: true, value: 'https://billing.stripe.com/fixture' }); await flush()
  assert.deepEqual(events, ['reserve', 'request', 'https://billing.stripe.com/fixture'])
})

test('a blocked popup stops before making a billing request', () => {
  const h = hooks(), events = []
  const { CloudManage } = component('src/cloud/CloudManage.tsx', h.React, {
    '../components/PlanChooser': { PlanPanel: 'Panel', PlanRow: 'Row' },
    '../store/billing': { openBilling() { events.push('request'); return new Promise(() => {}) }, billingMessage: error => error },
    '../store/grant': component('src/store/grant.ts', h.React, {}),
    '../data/storeAnswers': { STORE_BILLING_LINK_NOTICE: {} },
    '../store/checkoutTab': { reserveCheckoutTab: () => null },
  })
  const render = () => h.render(() => CloudManage({ pack: 'standard', planName: 'Cloud Standard', grant, onChanged() {} }))
  find(render(), n => n.type === 'button').props.onClick()
  find(render(), n => n.props?.label === 'Payment & Receipts').props.onClick()
  assert.deepEqual(events, [])
  assert.ok(JSON.stringify(render()).includes('popup_blocked'))
})
