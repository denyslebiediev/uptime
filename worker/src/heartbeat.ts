import { GAP, STALE_TOLERANCE, WRITE_CAP, type Heartbeat, type Span } from './model'

const LATEST = 'SELECT * FROM span WHERE device = ?1 ORDER BY id DESC LIMIT 1'
const INSERT = 'INSERT INTO span (device, boot_id, boot_at, first_seen, last_seen, shutdown) VALUES (?1, ?2, ?3, ?4, ?4, ?5)'
// MAX guards against clock skew between colos; the WHERE re-checks rule 2 so a racing regular beat cannot clear an ev marker; touches no indexed column
const EXTEND = 'UPDATE span SET last_seen = MAX(last_seen, ?1), boot_at = MIN(boot_at, ?2), shutdown = ?3 WHERE id = ?4 AND (?5 IS NOT NULL OR ?1 - last_seen >= ?6)'
const REPORT = "UPDATE span SET alive_until = ?1, shutdown = CASE shutdown WHEN 'none' THEN ?2 ELSE shutdown END WHERE id = ?3"

// Spec §5.3 rules 1–7; `now` is Worker receive time, the only clock ever stored.
export async function recordHeartbeat(db: D1Database, device: string, hb: Heartbeat, now: number): Promise<204 | 409> {
  const est = Math.floor(now - hb.up)
  const insert = (bootAt: number) => db.prepare(INSERT).bind(device, hb.boot, bootAt, now, hb.ev ?? 'none')
  const L = await db.prepare(LATEST).bind(device).first<Span>()
  if (!L) {
    await insert(est).run()
    return 204
  }
  if (hb.boot === L.boot_id) {
    const quiet = now - L.last_seen
    if (quiet < WRITE_CAP && !hb.ev) return 204
    if (quiet <= GAP) await db.prepare(EXTEND).bind(now, est, hb.ev ?? 'none', L.id, hb.ev ?? null, WRITE_CAP).run()
    else await insert(L.boot_at).run()
    return 204
  }
  if (est < L.last_seen - STALE_TOLERANCE) return 409
  const bootAt = Math.max(est, L.last_seen)
  // rule 6 rides only on the new-boot insert, which makes it idempotent
  if (hb.pb === L.boot_id && hb.pu !== undefined && hb.pc !== undefined) {
    const aliveUntil = Math.min(Math.max(Math.floor(L.boot_at + hb.pu), L.last_seen), bootAt)
    await db.batch([insert(bootAt), db.prepare(REPORT).bind(aliveUntil, hb.pc, L.id)])
  } else await insert(bootAt).run()
  return 204
}
