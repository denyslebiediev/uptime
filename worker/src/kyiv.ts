// Older runtimes (and iOS) know only the pre-2022 name.
const zone = (() => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: 'Europe/Kyiv' })
    return 'Europe/Kyiv'
  } catch (e) {
    if (e instanceof RangeError) return 'Europe/Kiev'
    throw e
  }
})()
const fmt = new Intl.DateTimeFormat('en', { timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' })

// Kyiv wall clock at unix second t, as numeric parts
const wall = (t: number) => {
  const p: Record<string, number> = {}
  for (const { type, value } of fmt.formatToParts(t * 1000)) p[type] = Number(value)
  return p
}
// Kyiv wall clock at t read as UTC, minus t: the zone offset in seconds
const off = (t: number) => {
  const p = wall(t)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) / 1000 - t
}
// exact in two passes because a Kyiv midnight never falls inside a DST jump
const midnight = (y: number, m: number, d: number) => {
  const guess = Date.UTC(y, m - 1, d) / 1000
  return guess - off(guess - off(guess))
}

// Spec §3: the Kyiv day [start, end) containing now; 23, 24 or 25 h long.
export function kyivDayBounds(now: number): { start: number; end: number } {
  const { year, month, day } = wall(now)
  return { start: midnight(year, month, day), end: midnight(year, month, day + 1) }
}
