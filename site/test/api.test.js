import { test } from 'node:test'
import assert from 'node:assert/strict'

import { API_DEFAULT, apiBase, loadWithFallback, mergeIv } from '../js/api.js'
const last = { now: 1793621100, devices: [] }, fresh = { now: 1793621130, devices: [] }, reply = (status, json) => async () => ({ ok: status >= 200 && status < 300, status, json })
test('apiBase accepts only a local http override', () => {
  assert.equal(apiBase(''), API_DEFAULT); assert.equal(apiBase('?api=http://localhost:8787'), 'http://localhost:8787'); assert.equal(apiBase('?api=http://127.0.0.1:8787'), 'http://127.0.0.1:8787')
  for (const bad of ['https://evil.example', 'http://localhost.evil.example', 'http://localhost:8787@evil.example', 'http://localhost:8787/x', 'javascript:alert(1)']) assert.equal(apiBase('?api=' + encodeURIComponent(bad)), API_DEFAULT, bad)
})
test('loadWithFallback returns fresh data', async () => assert.deepEqual(await loadWithFallback('u', last, reply(200, async () => fresh)), { data: fresh, ok: true }))
for (const [name, f] of [['network error', async () => { throw new TypeError('fetch failed') }], ['HTTP 503', reply(503, async () => ({ error: 'x' }))],
  ['malformed JSON', reply(200, async () => { throw new SyntaxError('Unexpected token <') })], ['wrong shape', reply(200, async () => ({ now: '1', devices: null }))]])
  test(`loadWithFallback keeps the last data on ${name}`, async () => {
    assert.deepEqual(await loadWithFallback('u', last, f), { data: last, ok: false }); assert.deepEqual(await loadWithFallback('u', null, f), { data: null, ok: false })
  })
test('loadWithFallback bypasses the HTTP cache and times out', async () => {
  let o; await loadWithFallback('u', null, async (_, opts) => { o = opts; throw new Error('x') }); assert.equal(o.cache, 'no-store'); assert.ok(o.signal instanceof AbortSignal)
})
test('mergeIv: one copy of rows in both ranges, recent wins, open rows only from recent, sorted by start', () => {
  const a = ['centralna', 'power_off', 100, 200, []], a2 = ['centralna', 'power_off', 100, 210, []], b = ['rayduzhna', 'no_connection', 300, 400, []], c = ['centralna', 'power_off', 50, 60, []]
  assert.deepEqual(mergeIv([a, c], [a2, b]), [c, a2, b])
  const p = ['rayduzhna', 'power_off', 300, 900, []]; assert.deepEqual(mergeIv([['rayduzhna', 'no_signal', 300, null, ['provisional']]], [p]), [p]) // that cut has ended since
})
