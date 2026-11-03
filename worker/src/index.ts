import { authDevice } from './auth'
import { recordHeartbeat } from './heartbeat'
import { MAX_BODY } from './model'
import { validate } from './validate'

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

export default {
  fetch(request, env) {
    if (request.method === 'POST' && new URL(request.url).pathname === '/hb') return postHeartbeat(request, env)
    return Response.json({ error: 'not_found' }, { status: 404 })
  },
} satisfies ExportedHandler<Env>
