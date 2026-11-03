import { env, exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { authDevice } from '../src/auth'
import { derive } from '../src/derive'
import { recordHeartbeat } from '../src/heartbeat'
import type { Flag, Heartbeat, Kind, Span } from '../src/model'

const T = 1_800_000_000
const A = '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b'
const B = '7a2d3c4b-5e6f-4a71-9b8c-0d1e2f3a4b5c'
const P = '8b3e4d5c-6f7a-4b82-ac9d-1e2f3a4b5c6d'
const rec = (boot: string, up: number, now: number, extra: Partial<Heartbeat> = {}) => recordHeartbeat(env.DB, 'centralna', { boot, up, ...extra }, now)
const rows = async () => (await env.DB.prepare('SELECT * FROM span ORDER BY id').all<Span>()).results
const iv = (kind: Kind, start: number, end: number | null, flags: Flag[] = []) => ({ device: 'centralna', kind, start, end, flags })
const report = async () => {
  await rec(A, 100, T)
  return rec(B, 60, T + 3600, { pb: A, pu: 400, pc: 'reboot' })
}

it('rule 5: first heartbeat inserts boot_at = now − up', async () => {
  expect(await rec(A, 100, T)).toBe(204)
  expect(await rows()).toMatchObject([{ device: 'centralna', boot_id: A, boot_at: T - 100, first_seen: T, last_seen: T, alive_until: null, shutdown: 'none' }])
})
it('rule 2: same boot under 10 s without ev → 204, no write', async () => {
  await rec(A, 100, T)
  expect(await rec(A, 109, T + 9)).toBe(204)
  expect(await rows()).toMatchObject([{ last_seen: T }])
})
it('rule 2 never holds back an ev heartbeat', async () => {
  await rec(A, 100, T)
  await rec(A, 105, T + 5, { ev: 'reboot' })
  expect(await rows()).toMatchObject([{ last_seen: T + 5, shutdown: 'reboot' }])
})
it.each(['ev first', 'regular first'])('rule 2 holds under concurrency: an ev beat and a regular beat at the same instant keep the marker (%s)', async order => {
  await rec(A, 100, T)
  const beats = [() => rec(A, 130, T + 30, { ev: 'reboot' }), () => rec(A, 130, T + 30)]
  if (order === 'regular first') beats.reverse()
  await Promise.all(beats.map(b => b()))
  expect(await rows()).toMatchObject([{ last_seen: T + 30, shutdown: 'reboot' }])
})
it('rule 3: same boot ≤ 120 s updates last_seen, keeps MIN boot_at, clears the marker', async () => {
  await rec(A, 100, T, { ev: 'reboot' })
  await rec(A, 219, T + 120)
  expect(await rows()).toMatchObject([{ last_seen: T + 120, boot_at: T - 100, shutdown: 'none' }])
  await rec(A, 250.5, T + 150)
  expect(await rows()).toMatchObject([{ last_seen: T + 150, boot_at: T - 101 }])
})
it('rule 4: same boot after > 120 s → new span, same boot_at, no power cut', async () => {
  await rec(A, 100, T)
  await rec(A, 221, T + 121)
  expect((await rows())[1]).toMatchObject({ boot_id: A, boot_at: T - 100, first_seen: T + 121, last_seen: T + 121 })
  expect(derive(await rows(), T + 121)).toEqual([iv('no_connection', T, T + 121)])
})
it('rule 5: new boot → boot_at = MAX(now − up, L.last_seen)', async () => {
  await rec(A, 100, T)
  await rec(B, 50, T + 200)
  expect((await rows())[1].boot_at).toBe(T + 150)
})
it('rule 5: up to 30 s before L.last_seen is tolerated and clamped', async () => {
  await rec(A, 100, T)
  expect(await rec(B, 40, T + 10)).toBe(204)
  expect((await rows())[1].boot_at).toBe(T)
})
it('rule 5: stale packet → 409, nothing written', async () => {
  await rec(A, 100, T)
  expect(await rec(B, 41, T + 10)).toBe(409)
  expect(await rows()).toHaveLength(1)
  await rec(B, 50, T + 200)
  expect(await rec(A, 310, T + 210)).toBe(409)
  expect(await rows()).toHaveLength(2)
})
it('rule 6: previous-boot report sets alive_until and the marker', async () => {
  await report()
  const r = await rows()
  expect(r[0]).toMatchObject({ alive_until: T + 300, shutdown: 'reboot' })
  expect(r[1].boot_at).toBe(T + 3540)
  expect(derive(r, T + 3600)).toEqual([
    iv('no_connection', T, T + 300),
    iv('power_off', T + 300, T + 3540, ['after_shutdown']),
    iv('no_connection', T + 3540, T + 3600, ['connecting']),
  ])
})
it.each([[10, T], [1e6, T + 3540]])('rule 6: alive_until is clamped to [L.last_seen, new boot_at] (pu %d)', async (pu, expected) => {
  await rec(A, 100, T)
  await rec(B, 60, T + 3600, { pb: A, pu, pc: 'none' })
  expect((await rows())[0].alive_until).toBe(expected)
})
it('rule 6: keeps an existing marker', async () => {
  await rec(A, 100, T, { ev: 'poweroff' })
  await rec(B, 60, T + 3600, { pb: A, pu: 400, pc: 'reboot' })
  expect((await rows())[0].shutdown).toBe('poweroff')
})
it('rule 6: ignores a report for another boot', async () => {
  await rec(A, 100, T)
  await rec(B, 60, T + 3600, { pb: P, pu: 400, pc: 'reboot' })
  expect((await rows())[0]).toMatchObject({ alive_until: null, shutdown: 'none' })
})
it('rule 6 is applied only on the new-boot insert (idempotent)', async () => {
  await report()
  await rec(B, 90, T + 3630, { pb: A, pu: 9999, pc: 'poweroff' })
  expect((await rows())[0]).toMatchObject({ alive_until: T + 300, shutdown: 'reboot' })
})
it('rule 7: a 50 s blip still yields a power cut', async () => {
  await rec(A, 1000, T)
  await rec(B, 20, T + 50)
  expect(derive(await rows(), T + 50)).toEqual([iv('power_off', T, T + 30), iv('no_connection', T + 30, T + 50, ['connecting'])])
})
it('authDevice matches by token and never matches an empty secret', async () => {
  expect(await authDevice('Bearer test-rayduzhna', env)).toBe('rayduzhna')
  expect(await authDevice('Bearer ', { DEVICES: env.DEVICES, TOKEN_CENTRALNA: 'test-centralna', TOKEN_RAYDUZHNA: '' } as unknown as Env)).toBeNull()
})

describe('POST /hb', () => {
  const post = (body: BodyInit, token?: string) => exports.default.fetch('https://api.test/hb', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body,
  })

  it('rule 1: device comes from the token, time from the server', async () => {
    const t0 = Math.floor(Date.now() / 1000)
    const res = await post(JSON.stringify({ boot: A, up: 5, ts: 1, device: 'centralna' }), 'test-rayduzhna')
    expect(res.status).toBe(204)
    const [r] = await rows()
    expect(r.device).toBe('rayduzhna')
    expect(r.first_seen).toBeGreaterThanOrEqual(t0)
    expect(r.first_seen).toBeLessThanOrEqual(t0 + 5)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
  it('401 for a missing or wrong token, nothing written', async () => {
    for (const token of [undefined, 'test-centralnaX']) {
      const res = await post(JSON.stringify({ boot: A, up: 5 }), token)
      expect(res.status).toBe(401)
      expect(await res.text()).toBe('')
    }
    expect(await rows()).toEqual([])
  })
  it('413 for a body over 512 bytes, by header and by actual length', async () => {
    const big = await post(JSON.stringify({ boot: A, up: 5, pad: 'x'.repeat(520) }), 'test-centralna')
    expect(big.status).toBe(413)
    expect(await big.text()).toBe('')
    const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('x'.repeat(600))); c.close() } })
    expect((await post(stream, 'test-centralna')).status).toBe(413)
  })
  it('400 bad_body', async () => {
    const res = await post('nope', 'test-centralna')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'bad_body' })
  })
  it('409 stale', async () => {
    expect((await post(JSON.stringify({ boot: A, up: 5 }), 'test-centralna')).status).toBe(204)
    const res = await post(JSON.stringify({ boot: B, up: 1e6 }), 'test-centralna')
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'stale' })
  })
})
