import { createExecutionContext } from 'cloudflare:test'
import { env, exports } from 'cloudflare:workers'
import { expect, it, vi } from 'vitest'
import worker from '../src/index'

const get = (q: string, init?: RequestInit) => exports.default.fetch('https://api.test' + q, init)
const ACAO = 'Access-Control-Allow-Origin'
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>
const call = (req: InstanceType<typeof IncomingRequest>, e: Env) => worker.fetch(req, e, createExecutionContext())
const base = { DB: env.DB, DEVICES: env.DEVICES, RATE_LIMITER: env.RATE_LIMITER, TOKEN_CENTRALNA: env.TOKEN_CENTRALNA, TOKEN_RAYDUZHNA: env.TOKEN_RAYDUZHNA }
const keys: string[] = []
const limited = { ...base, RATE_LIMITER: { limit: async ({ key }: { key: string }) => (keys.push(key), { success: false }) } } as unknown as Env
const broken = { ...base, DB: { prepare() { throw new Error('boom') }, batch() { throw new Error('boom') } } } as unknown as Env
const hb = (token: string) => new IncomingRequest('https://api.test/hb', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
  body: JSON.stringify({ boot: '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b', up: 5 }),
})

it('GET /status with an empty table returns both devices as unknown', async () => {
  const res = await get('/status')
  expect(res.status).toBe(200)
  expect(res.headers.get(ACAO)).toBe('*')
  expect(res.headers.get('Cache-Control')).toBe('public, max-age=15')
  const b = await res.json<{ day: { start: number; end: number }; devices: object[] }>()
  const unknown = { state: 'unknown', since: null, seen: null, flags: [], today: [] }
  expect(b.devices).toMatchObject([{ id: 'centralna', ...unknown }, { id: 'rayduzhna', ...unknown }])
  expect([82_800, 86_400, 90_000]).toContain(b.day.end - b.day.start)
  // only public fields (spec §10)
  expect(Object.keys(b).sort()).toEqual(['day', 'devices', 'now'])
  expect(Object.keys(b.devices[0]).sort()).toEqual(['flags', 'id', 'name', 'seen', 'short', 'since', 'state', 'today'])
})
it('GET /events defaults to the last 35 days', async () => {
  const res = await get('/events')
  expect(res.status).toBe(200)
  expect(res.headers.get('Cache-Control')).toBe('public, max-age=60')
  expect(res.headers.get(ACAO)).toBe('*')
  const b = await res.json<{ now: number; from: number; to: number; iv: unknown[]; devices: { first_seen: number | null }[] }>()
  expect(b.to).toBe(b.now)
  expect(b.from).toBe(b.now - 3_024_000)
  expect(b.iv).toEqual([])
  expect(b.devices[0].first_seen).toBeNull()
  expect(Object.keys(b).sort()).toEqual(['devices', 'from', 'iv', 'now', 'to'])
  expect(Object.keys(b.devices[0]).sort()).toEqual(['first_seen', 'flags', 'id', 'name', 'seen', 'short', 'since', 'state'])
})
it.each(['?from=abc', '?from=1.5', '?from=10&to=5', '?from=0&to=34560001'])('GET /events rejects bad ranges (%s)', async q => {
  const res = await get('/events' + q)
  expect(res.status).toBe(400)
  expect(await res.json()).toEqual({ error: 'bad_range' })
  expect(res.headers.get(ACAO)).toBe('*')
})
it('GET /events accepts exactly 400 days', async () => {
  expect((await get('/events?from=0&to=34560000')).status).toBe(200)
})
it('OPTIONS preflight', async () => {
  const res = await get('/events', { method: 'OPTIONS' })
  expect(res.status).toBe(204)
  expect(res.headers.get(ACAO)).toBe('*')
  expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS')
  expect(res.headers.get('Access-Control-Max-Age')).toBe('86400')
})
it('unknown path → 404 with CORS', async () => {
  const res = await get('/nope')
  expect(res.status).toBe(404)
  expect(await res.json()).toEqual({ error: 'not_found' })
  expect(res.headers.get(ACAO)).toBe('*')
})
it('over the rate limit → 429 with CORS, keyed by client IP', async () => {
  keys.length = 0
  const res = await call(new IncomingRequest('https://api.test/status', { headers: { 'CF-Connecting-IP': '203.0.113.7' } }), limited)
  expect(res.status).toBe(429)
  expect(await res.json()).toEqual({ error: 'rate_limited' })
  expect(res.headers.get(ACAO)).toBe('*')
  expect(keys).toEqual(['203.0.113.7'])
})
it('POST /hb is not rate limited', async () => {
  keys.length = 0
  expect((await call(hb('test-centralna'), limited)).status).toBe(204)
  expect(keys).toEqual([])
})
it('a D1 failure on GET is a 500 with CORS', async () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
  const res = await call(new IncomingRequest('https://api.test/status'), broken)
  expect(logged).toHaveBeenCalledOnce()
  logged.mockRestore()
  expect(res.status).toBe(500)
  expect(await res.json()).toEqual({ error: 'internal' })
  expect(res.headers.get(ACAO)).toBe('*')
})
it('auth runs before any D1 access', async () => {
  expect((await call(hb('wrong'), broken)).status).toBe(401)
})
