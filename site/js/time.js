// Kyiv calendar maths. Every time argument is unix seconds; never use the host zone.

/** @param {(tz: string) => boolean} [supports] */
export function pickZone(supports = tz => {
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true } catch { return false }
}) {
  return supports('Europe/Kyiv') ? 'Europe/Kyiv' : 'Europe/Kiev'
}

export const TZ = pickZone()

const WEEKDAYS = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
const parts = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, hourCycle: 'h23', weekday: 'short',
  year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
})

/** Kyiv wall clock: mo 1-12, h 0-23, wd ISO 1 = Mon ... 7 = Sun. */
export function kyivParts(t) {
  const p = Object.fromEntries(parts.formatToParts(t * 1000).map(x => [x.type, x.value]))
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second, wd: WEEKDAYS[p.weekday] }
}

const offset = t => { const p = kyivParts(t); return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) / 1000 - t }

/** Unix s of a Kyiv wall time; d/mo overflow like Date.UTC. Only for times that exist exactly once. */
export function kyivTime(y, mo, d, h = 0, mi = 0) {
  const guess = Date.UTC(y, mo - 1, d, h, mi) / 1000
  return guess - offset(guess - offset(guess))
}

/** @param {'day' | 'week' | 'month'} kind */
export function periodBounds(kind, t) {
  const { y, mo, d, wd } = kyivParts(t)
  if (kind === 'day') return { start: kyivTime(y, mo, d), end: kyivTime(y, mo, d + 1) }
  if (kind === 'week') return { start: kyivTime(y, mo, d - wd + 1), end: kyivTime(y, mo, d - wd + 8) }
  return { start: kyivTime(y, mo, 1), end: kyivTime(y, mo + 1, 1) }
}

/** Kyiv midnights of the n days ending with t's day, oldest first. */
export function lastDays(t, n) {
  const { y, mo, d } = kyivParts(t)
  return Array.from({ length: n }, (_, i) => kyivTime(y, mo, d - n + 1 + i))
}

export function kyivIso(t) {
  const p = kyivParts(t), o = Math.round(offset(t) / 60), a = Math.abs(o)
  const z = n => String(n).padStart(2, '0')
  return `${p.y}-${z(p.mo)}-${z(p.d)}T${z(p.h)}:${z(p.mi)}:${z(p.s)}${o < 0 ? '-' : '+'}${z(Math.floor(a / 60))}:${z(a % 60)}`
}
