import { env } from 'cloudflare:workers'
import { expect, it } from 'vitest'
import { devices } from '../src/config'
import type { Span } from '../src/model'
import { eventsBody, spansQuery, statusBody } from '../src/read'

const u = (y: number, m: number, d: number, h: number) => Date.UTC(y, m, d, h) / 1000
const put = (device: string, s: Pick<Span, 'boot_id' | 'boot_at' | 'first_seen' | 'last_seen'>) => env.DB
  .prepare("INSERT INTO span (device, boot_id, boot_at, first_seen, last_seen, alive_until, shutdown) VALUES (?1, ?2, ?3, ?4, ?5, NULL, 'none')")
  .bind(device, s.boot_id, s.boot_at, s.first_seen, s.last_seen).run()
const NOW = u(2026, 10, 3, 12)
const S = u(2026, 10, 2, 22)
const F = NOW - 35 * 86_400
const DEVS = devices(env)
const centralnaAB = async () => {
  await put('centralna', { boot_id: 'a', boot_at: F - 9000, first_seen: F - 8970, last_seen: F - 600 })
  await put('centralna', { boot_id: 'b', boot_at: F + 600, first_seen: F + 630, last_seen: NOW - 5 })
}

it('status: today clips a cut that began before midnight', async () => {
  await put('centralna', { boot_id: 'a', boot_at: S - 7200, first_seen: S - 7200, last_seen: S - 1800 })
  await put('centralna', { boot_id: 'b', boot_at: S + 1800, first_seen: S + 1830, last_seen: NOW - 5 })
  const b = await statusBody(env.DB, DEVS, NOW)
  expect(b.day).toEqual({ start: S, end: S + 86_400 })
  expect(b.devices[0]).toMatchObject({
    id: 'centralna', name: { uk: 'Центральна 50', en: 'Centralna 50' }, short: { uk: 'Центральна', en: 'Centralna' },
    state: 'on', since: S + 1800, seen: NOW - 5, flags: [],
    today: [[S, S + 1800, 'power_off'], [S + 1800, S + 1830, 'no_connection']],
  })
})
it('status: an ongoing cut is open in today', async () => {
  await put('rayduzhna', { boot_id: 'r', boot_at: S - 7200, first_seen: S - 7200, last_seen: NOW - 3600 })
  const b = await statusBody(env.DB, DEVS, NOW)
  expect(b.devices[1]).toMatchObject({ state: 'no_signal', since: NOW - 3600, today: [[NOW - 3600, null, 'no_signal']] })
})
it('status: a cut that ended exactly at Kyiv midnight is not in today', async () => {
  await put('centralna', { boot_id: 'a', boot_at: S - 7200, first_seen: S - 7200, last_seen: S - 3600 })
  await put('centralna', { boot_id: 'b', boot_at: S, first_seen: S, last_seen: NOW - 5 })
  const b = await statusBody(env.DB, DEVS, NOW)
  expect(b.devices[0]).toMatchObject({ state: 'on', since: S, today: [] })
})
it('status: a zero-length blip inside today is kept', async () => {
  const X = S + 3600
  // boot_at before a.last_seen clamps back to X: power_off [X, X]
  await put('centralna', { boot_id: 'a', boot_at: S - 7200, first_seen: S - 7200, last_seen: X })
  await put('centralna', { boot_id: 'b', boot_at: X - 60, first_seen: X + 30, last_seen: NOW - 5 })
  const b = await statusBody(env.DB, DEVS, NOW)
  expect(b.devices[0].today).toEqual([[X, X, 'power_off'], [X, X + 30, 'no_connection']])
})
it('events: overlapping intervals unclipped, older ones dropped, first_seen from the first span', async () => {
  await put('centralna', { boot_id: 'z', boot_at: F - 20000, first_seen: F - 20000, last_seen: F - 10000 })
  await centralnaAB()
  const b = await eventsBody(env.DB, DEVS, F, NOW, NOW)
  expect(b).toMatchObject({ now: NOW, from: F, to: NOW })
  expect(b.iv).toEqual([['centralna', 'power_off', F - 600, F + 600, []], ['centralna', 'no_connection', F + 600, F + 630, ['connecting']]])
  expect(b.devices[0]).toMatchObject({ first_seen: F - 20000, state: 'on' })
  expect(b.devices[1]).toMatchObject({ state: 'unknown', since: null, seen: null, first_seen: null })
})
it('events: iv sorted by start across devices, open no_signal last', async () => {
  await centralnaAB()
  await put('rayduzhna', { boot_id: 'r1', boot_at: F - 500, first_seen: F - 500, last_seen: F + 100 })
  await put('rayduzhna', { boot_id: 'r2', boot_at: F + 200, first_seen: F + 200, last_seen: NOW - 3600 })
  const { iv } = await eventsBody(env.DB, DEVS, F, NOW, NOW)
  expect(iv.map(r => [r[0], r[2]])).toEqual([['centralna', F - 600], ['rayduzhna', F + 100], ['centralna', F + 600], ['rayduzhna', NOW - 3600]])
  expect(iv.at(-1)).toEqual(['rayduzhna', 'no_signal', NOW - 3600, null, ['provisional']])
})
it('events: an interval ending exactly at from is left out', async () => {
  await put('centralna', { boot_id: 'a', boot_at: F - 9000, first_seen: F - 8970, last_seen: F - 600 })
  await put('centralna', { boot_id: 'b', boot_at: F, first_seen: F, last_seen: NOW - 5 })
  const { iv } = await eventsBody(env.DB, DEVS, F, NOW, NOW)
  expect(iv).toEqual([])
})
it('the spans query reads the range, not the table (rows_read)', async () => {
  const T0 = 1_790_000_000
  await env.DB.prepare(`WITH RECURSIVE n(i) AS (SELECT 0 UNION ALL SELECT i + 1 FROM n WHERE i < 1999)
    INSERT INTO span (device, boot_id, boot_at, first_seen, last_seen, shutdown)
    SELECT d.v, 'b' || i, ?1 + i * 3600, ?1 + i * 3600, ?1 + i * 3600 + 1800, 'none'
    FROM n, (SELECT 'centralna' AS v UNION ALL SELECT 'rayduzhna') AS d ORDER BY i`).bind(T0).run()
  const r = await spansQuery(env.DB, 'centralna', T0 + 1976 * 3600).all<Span>()
  expect(r.results.length).toBe(25)
  expect(r.results[0].first_seen).toBe(T0 + 1975 * 3600)
  // a scan of the 4,000-row table reads ≥ 4,000
  expect(r.meta.rows_read).toBeLessThan(200)
})
