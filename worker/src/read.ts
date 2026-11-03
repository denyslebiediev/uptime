import { derive, live } from './derive'
import { kyivDayBounds } from './kyiv'
import type { Device, EventsBody, Interval, Kind, Span, StatusBody } from './model'

// from the last span ending before `from` (its gap to the next span may overlap the range) to the newest; walks the (device, id) index
const SPANS = `SELECT * FROM span WHERE device = ?1 AND id >= COALESCE(
  (SELECT id FROM span WHERE device = ?1 AND last_seen < ?2 ORDER BY id DESC LIMIT 1), 0)
ORDER BY id`
const FIRST_SEEN = 'SELECT first_seen FROM span WHERE device = ?1 ORDER BY id LIMIT 1'

export const spansQuery = (db: D1Database, device: string, from: number): D1PreparedStatement => db.prepare(SPANS).bind(device, from)

// past `from`: drops intervals that only end at `from`, keeps zero-length blips inside the range (rule 7)
const reaches = (iv: Interval, from: number, now: number) => (iv.end ?? now) > from || iv.start >= from

export async function statusBody(db: D1Database, devs: Device[], now: number): Promise<StatusBody> {
  const day = kyivDayBounds(now)
  const res = await db.batch<Span>(devs.map(d => spansQuery(db, d.id, day.start)))
  return {
    now, day,
    devices: devs.map((device, i) => {
      const spans = res[i].results
      const today = derive(spans, now).filter(iv => iv.start < day.end && reaches(iv, day.start, now))
        .map((iv): [number, number | null, Kind] => [Math.max(iv.start, day.start), iv.end === null ? null : Math.min(iv.end, day.end), iv.kind])
      return { ...device, ...live(spans, now), today }
    }),
  }
}

export async function eventsBody(db: D1Database, devs: Device[], from: number, to: number, now: number): Promise<EventsBody> {
  const res = await db.batch([
    ...devs.map(d => spansQuery(db, d.id, from)),
    ...devs.map(d => db.prepare(FIRST_SEEN).bind(d.id)),
  ])
  const iv: EventsBody['iv'] = []
  const devices = devs.map((device, i) => {
    const spans = res[i].results as Span[]
    for (const x of derive(spans, now)) if (x.start <= to && reaches(x, from, now)) iv.push([x.device, x.kind, x.start, x.end, x.flags])
    const first = res[devs.length + i].results[0] as { first_seen: number } | undefined
    return { ...device, ...live(spans, now), first_seen: first?.first_seen ?? null }
  })
  // stable: ties keep config device order
  iv.sort((a, b) => a[2] - b[2])
  return { now, from, to, devices, iv }
}
