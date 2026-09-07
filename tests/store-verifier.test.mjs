import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { compile, deferred } from './harness.mjs'

const url = 'https://buy.stripe.com/fixture'
const config = { availability: { available: false }, plans: { standard: {
  monthly_cents: 100, annual_cents: 1000,
  payment_link_monthly: url + 'month', payment_link_annual: url + 'year',
} } }

function server({ configStatus = 200, rows = [{ doc: config }], gate } = {}) {
  let handler, sweeps = 0
  const fakeFetch = async (input) => {
    const path = String(input)
    if (path.includes('tdg_cloud_config')) return Response.json(rows, { status: configStatus })
    if (path.includes('webhook_endpoints')) return Response.json({ data: ['veditor', 'devfleet', 'cloud'].map((app) => ({
      url: `https://fixture.invalid/functions/v1/${app}-stripe-webhook`, status: 'enabled', enabled_events: ['checkout.session.completed', 'customer.subscription.updated', 'customer.subscription.deleted'],
    })) })
    if (path.includes('/line_items')) {
      const annual = path.includes('/year/')
      return Response.json({ data: [{ price: { unit_amount: annual ? 1000 : 100, currency: 'usd', recurring: { interval: annual ? 'year' : 'month' } } }] })
    }
    if (path.includes('payment_links')) {
      sweeps++
      if (gate) await gate.promise
      return Response.json({ data: ['month', 'year'].map((id) => ({ id, url: url + id, active: false,
        metadata: { app: 'cloud', pack: 'standard' }, subscription_data: { metadata: { app: 'cloud', pack: 'standard' } },
      })) })
    }
    throw new Error(`Unexpected fetch ${path}`)
  }
  vm.runInNewContext(compile('supabase/functions/tdg-store-verify/index.ts'), {
    Deno: { env: { get: (key) => key === 'SUPABASE_URL' ? 'https://fixture.invalid' : 'fixture-key' }, serve: (fn) => { handler = fn } },
    Request, Response, fetch: fakeFetch, console: { error() {} }, exports: {},
  })
  return { call: (catalog) => handler(new Request('https://fixture.invalid/verify', catalog === undefined ? {} : { method: 'POST', body: JSON.stringify({ catalog }) })), sweeps: () => sweeps }
}

test('failed Cloud config reads cannot pass the release gate', async () => {
  const response = await server({ configStatus: 503, rows: { message: 'Unavailable' } }).call([])
  assert.equal(response.status, 500)
  assert.notEqual((await response.json()).ok, true)
})

test('missing or malformed Cloud configuration cannot pass', async () => {
  for (const rows of [[], [{ doc: {} }], [{ doc: { availability: { available: false }, plans: {} } }]]) {
    const response = await server({ rows }).call([])
    assert.notEqual((await response.json()).ok, true)
  }
})

test('valid dormant Cloud config and enabled webhooks pass', async () => {
  const response = await server().call([])
  assert.equal(response.status, 200)
  assert.equal((await response.json()).ok, true)
})

test('anonymous POSTs reuse upstream facts but keep independent catalogue verdicts', async () => {
  const app = server()
  assert.equal((await (await app.call([])).json()).ok, true)
  const cached = await app.call([{ url: url + 'unknown', cents: 123 }])
  assert.equal(cached.headers.get('X-Sweep-Cached'), 'true')
  const invalid = await cached.json()
  assert.equal(invalid.ok, false)
  assert.equal((await (await app.call()).json()).ok, true)
  assert.equal(app.sweeps(), 1)
})

test('overlapping cold requests share a single upstream sweep', async () => {
  const gate = deferred(), app = server({ gate })
  const pending = [app.call([]), app.call([]), app.call()]
  gate.resolve()
  await Promise.all(pending)
  assert.equal(app.sweeps(), 1)
})
