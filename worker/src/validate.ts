import { UP_MAX, type Heartbeat } from './model'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const EV = ['reboot', 'poweroff'] as const
const PC = ['none', 'reboot', 'poweroff'] as const
const isUuid = (x: unknown): x is string => typeof x === 'string' && UUID.test(x)
const isUp = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && 0 <= x && x <= UP_MAX
const isIn = <T>(set: readonly T[], x: unknown): x is T => set.includes(x as T)

// Spec §7: returns only the known keys, or null for anything malformed.
export function validate(raw: string): Heartbeat | null {
  let body: unknown
  try { body = JSON.parse(raw) } catch { return null }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null
  const { boot, up, ev, pb, pu, pc } = body as Record<string, unknown>
  if (!isUuid(boot) || !isUp(up)) return null
  const hb: Heartbeat = { boot, up }
  if (ev !== undefined) {
    if (!isIn(EV, ev)) return null
    hb.ev = ev
  }
  if (pb === undefined && pu === undefined && pc === undefined) return hb
  // the Pi always sends the whole previous-boot report, so a partial one is malformed
  return isUuid(pb) && isUp(pu) && isIn(PC, pc) ? { ...hb, pb, pu, pc } : null
}
