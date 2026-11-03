import { authDevice } from './auth'
import { devices } from './config'
import { recordHeartbeat } from './heartbeat'
import { EVENTS_DEFAULT_DAYS, EVENTS_MAX_DAYS, MAX_BODY } from './model'
import { eventsBody, statusBody } from './read'
import { validate } from './validate'

const DAY = 86_400
const CORS = { 'Access-Control-Allow-Origin': '*' }
const json = (body: unknown, status: number, maxAge?: number) =>
  Response.json(body, { status, headers: maxAge ? { ...CORS, 'Cache-Control': `public, max-age=${maxAge}` } : CORS })

// No CORS headers: only the Pis call this.
async function postHeartbeat(request: Request, env: Env): Promise<Response> {
  const device = await authDevice(request.headers.get('Authorization'), env)
  if (!device) return new Response(null, { status: 401 })
  if (Number(request.headers.get('Content-Length')) > MAX_BODY) return new Response(null, { status: 413 })
  const buf = await request.arrayBuffer()
  if (buf.byteLength > MAX_BODY) return new Response(null, { status: 413 })
  const hb = validate(new TextDecoder().decode(buf))
  if (!hb) return Response.json({ error: 'bad_body' }, { status: 400 })
  const status = await recordHeartbeat(env.DB, device, hb, Math.floor(Date.now() / 1000))
  return status === 204 ? new Response(null, { status }) : Response.json({ error: 'stale' }, { status })
}

// Integers only; to defaults to now, from to 35 days before to; at most 400 days.
function range(q: URLSearchParams, now: number): { from: number; to: number } | null {
  const f = q.get('from'), t = q.get('to')
  if ([f, t].some(x => x !== null && !/^\d+$/.test(x))) return null
  const to = t === null ? now : Number(t)
  const from = f === null ? to - EVENTS_DEFAULT_DAYS * DAY : Number(f)
  return from <= to && to - from <= EVENTS_MAX_DAYS * DAY ? { from, to } : null
}

async function route(request: Request, url: URL, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Max-Age': '86400' } })
  }
  if (request.method === 'GET') {
    const { success } = await env.RATE_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') ?? '' })
    if (!success) return json({ error: 'rate_limited' }, 429)
    const now = Math.floor(Date.now() / 1000)
    if (url.pathname === '/status') return json(await statusBody(env.DB, devices(env), now), 200, 15)
    if (url.pathname === '/events') {
      const r = range(url.searchParams, now)
      return r ? json(await eventsBody(env.DB, devices(env), r.from, r.to, now), 200, 60) : json({ error: 'bad_range' }, 400)
    }
  }
  return json({ error: 'not_found' }, 404)
}

export default {
  // ctx is unused; declared so worker.fetch takes the three arguments the runtime passes
  async fetch(request, env, _ctx) {
    const url = new URL(request.url)
    const hb = request.method === 'POST' && url.pathname === '/hb'
    try {
      return await (hb ? postHeartbeat(request, env) : route(request, url, env))
    } catch (e) {
      console.error(e)
      return Response.json({ error: 'internal' }, { status: 500, headers: hb ? {} : CORS })
    }
  },
} satisfies ExportedHandler<Env>
