import { GAP, REBOOT_WINDOW, STALE_AFTER, type Flag, type Interval, type Kind, type Live, type Span } from './model'

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi)

// Spec §5.4 trailing rules; only the last span matters.
export function live(spans: Span[], now: number): Live {
  const L = spans.at(-1)
  if (!L) return { state: 'unknown', since: null, seen: null, flags: [] }
  const seen = L.last_seen, quiet = now - seen
  if (quiet <= GAP) return { state: 'on', since: L.boot_at, seen, flags: [] }
  if (L.shutdown === 'reboot' && quiet <= REBOOT_WINDOW) return { state: 'rebooting', since: seen, seen, flags: [] }
  if (L.shutdown === 'poweroff') return { state: 'device_off', since: seen, seen, flags: [] }
  return { state: 'no_signal', since: seen, seen, flags: quiet > STALE_AFTER ? ['stale'] : [] }
}

// Spec §5.4: spans are one device's, ascending by id; intervals come back in start order.
export function derive(spans: Span[], now: number): Interval[] {
  const L = spans.at(-1)
  if (!L) return []
  const out: Interval[] = []
  const add = (kind: Kind, start: number, end: number | null, flags: Flag[] = []) => { out.push({ device: L.device, kind, start, end, flags }) }
  const noConnection = (start: number, end: number, flags: Flag[] = []) => { if (end > start) add('no_connection', start, end, flags) }
  for (let i = 1; i < spans.length; i++) {
    const A = spans[i - 1], B = spans[i]
    if (A.boot_id === B.boot_id) { noConnection(A.last_seen, B.first_seen); continue }
    const back = clamp(B.boot_at, A.last_seen, B.first_seen)
    const gone = clamp(A.alive_until ?? A.last_seen, A.last_seen, back)
    noConnection(A.last_seen, gone)
    // rule 7: a boot change always yields this interval, even at zero length
    if (A.shutdown === 'reboot' && back - gone <= REBOOT_WINDOW) add('reboot', gone, back)
    else if (A.shutdown === 'poweroff') add('device_off', gone, back)
    else add('power_off', gone, back, A.shutdown === 'reboot' ? ['after_shutdown'] : [])
    noConnection(back, B.first_seen, ['connecting'])
  }
  const { state, flags } = live(spans, now)
  if (state === 'rebooting') add('reboot', L.last_seen, null)
  else if (state === 'device_off') add('device_off', L.last_seen, null)
  else if (state === 'no_signal') add('no_signal', L.last_seen, null, ['provisional', ...flags])
  return out
}
