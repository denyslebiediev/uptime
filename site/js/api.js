// Reading the public API: base URL, keeping the last good body on failure, merging /events windows.

/** @typedef {import('./stats.js').Kind} Kind */
/** @typedef {import('./stats.js').Flag} Flag */
/** @typedef {[device: string, kind: Kind, start: number, end: number | null, flags: Flag[]]} IvRow */
/**
 * @typedef {{ id: string, name: { uk: string, en: string }, short: { uk: string, en: string },
 *   state: 'on' | 'no_signal' | 'rebooting' | 'device_off' | 'unknown', since: number | null, seen: number | null, flags: Flag[],
 *   today: [number, number | null, Kind][] }} StatusDevice
 */
/** @typedef {{ now: number, day: { start: number, end: number }, devices: StatusDevice[] }} StatusBody */

export const API_DEFAULT = 'https://uptime-api.denyslebiediev.com'

/** `?api=` may point only at a local `wrangler dev`, so a shared link can never swap the server. @param {string} search */
export function apiBase(search) {
  const api = new URLSearchParams(search).get('api')
  return api && /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(api) ? api : API_DEFAULT
}

/**
 * Never throws: on any failure it hands back `last`. The 10 s cap stays under the 30 s poll, so polls never overlap.
 * @template T @param {string} url @param {T | null} last @returns {Promise<{ data: T | null, ok: boolean }>}
 */
export async function loadWithFallback(url, last, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(url, { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
    const body = res.ok ? await res.json() : null
    if (Number.isFinite(body?.now) && Array.isArray(body.devices)) return { data: body, ok: true }
  } catch { /* offline, timeout or bad JSON: keep the last data */ }
  return { data: last, ok: false }
}

/**
 * Rows overlapping a range edge arrive in both bodies; `recent` wins. Open rows in `older` are dropped,
 * because an open row reaches `now`, so `recent` always holds its current form.
 * @param {IvRow[]} older @param {IvRow[]} recent @returns {IvRow[]}
 */
export function mergeIv(older, recent) {
  const key = r => `${r[0]}|${r[1]}|${r[2]}`
  const rows = new Map(older.filter(r => r[3] !== null).map(r => [key(r), r]))
  for (const r of recent) rows.set(key(r), r)
  return [...rows.values()].sort((a, b) => a[2] - b[2])
}
