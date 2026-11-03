// Statistics over an /events body. Every time is unix seconds; off-time is power_off + open no_signal.
import { kyivParts } from './time.js'

/** @typedef {'power_off' | 'no_connection' | 'reboot' | 'device_off' | 'no_signal'} Kind */
/** @typedef {'provisional' | 'connecting' | 'after_shutdown' | 'stale'} Flag */
/**
 * @typedef {{ now: number, from: number, to: number,
 *   devices: { id: string, name: { uk: string, en: string }, short: { uk: string, en: string },
 *     state: 'on' | 'no_signal' | 'rebooting' | 'device_off' | 'unknown', since: number | null, seen: number | null, flags: Flag[], first_seen: number | null }[],
 *   iv: [string, Kind, number, number | null, Flag[]][] }} Events
 */
/** @typedef {{ kind: Kind, start: number, end: number, ongoing: boolean, flags: Flag[] }} Seg */
/** @typedef {{ off: number, observed: number, pct: number | null, cuts: number, longest: number, longestOngoing: boolean }} PeriodStats */

const isOff = kind => kind === 'power_off' || kind === 'no_signal'
const total = segs => segs.reduce((n, x) => n + x.end - x.start, 0)
const firstSeen = (ev, device) => ev.devices.find(d => d.id === device)?.first_seen ?? null
const offSegs = (ev, device, start, end) => segments(ev, device, start, end).filter(x => isOff(x.kind))

/**
 * A device's intervals clipped to [max(start, ev.from), min(end, ev.now)], empty ones dropped, in iv order.
 * @param {Events} ev @returns {Seg[]}
 */
export function segments(ev, device, start, end) {
  const a = Math.max(start, ev.from), b = Math.min(end, ev.now)
  return ev.iv.filter(r => r[0] === device)
    .map(([, kind, s, e, flags]) => ({ kind, start: Math.max(s, a), end: Math.min(e ?? ev.now, b), ongoing: e === null, flags }))
    .filter(x => x.end > x.start)
}

/** @param {Events} ev @returns {PeriodStats} */
export function periodStats(ev, device, start, end) {
  const off = total(offSegs(ev, device, start, end)), fs = firstSeen(ev, device)
  let observed = 0
  if (fs !== null) {
    const a = Math.max(start, fs)
    observed = Math.max(0, Math.min(end, ev.now) - Math.max(a, ev.from)) - total(segments(ev, device, a, end).filter(x => x.kind === 'device_off'))
  }
  let cuts = 0, longest = 0, longestOngoing = false
  for (const [d, kind, s, e] of ev.iv) {
    if (d !== device || !isOff(kind) || s < start || s >= end) continue
    const len = (e ?? ev.now) - s
    cuts++
    if (len > longest) { longest = len; longestOngoing = e === null } // strict >: the first row wins ties
  }
  const pct = observed > 0 ? Math.min(1, Math.max(0, 1 - off / observed)) : null
  return { off, observed, pct, cuts, longest, longestOngoing }
}

const intersect = (a, b) => a.flatMap(x => b.map(y => ({ start: Math.max(x.start, y.start), end: Math.min(x.end, y.end) })))
  .filter(x => x.end > x.start)

/** Seconds inside the period when every device is off at once. @param {Events} ev */
export function bothOff(ev, start, end) {
  const lists = ev.devices.map(d => offSegs(ev, d.id, start, end))
  return lists.length ? total(lists.reduce(intersect)) : 0
}

/**
 * 24 cells by Kyiv hour: off seconds / seconds of that hour that elapsed in the window; null where none elapsed.
 * @param {Events} ev @returns {(number | null)[]}
 */
export function hourPattern(ev, device, start, end) {
  const fs = firstSeen(ev, device), exposure = Array(24).fill(0), offSec = Array(24).fill(0)
  if (fs === null) return Array(24).fill(null)
  const from = Math.max(start, ev.from, fs), to = Math.min(end, ev.now), off = offSegs(ev, device, start, end)
  // shortcut: assumes Kyiv's UTC offset is a whole number of hours (true since 1924); step by kyivTime hours if that ever changes
  for (let a = from, b; a < to; a = b) {
    b = Math.min(to, (Math.floor(a / 3600) + 1) * 3600)
    const h = kyivParts(a).h
    exposure[h] += b - a
    for (const x of off) offSec[h] += Math.max(0, Math.min(b, x.end) - Math.max(a, x.start))
  }
  return exposure.map((e, h) => e > 0 ? offSec[h] / e : null)
}

/** Start hour of the width-hour window (wrapping past midnight) with the largest sum; ties to the lowest; null if all 0. */
export function bestWindow(cells, width = 4) {
  let best = null, max = 0
  for (let s = 0; s < cells.length; s++) {
    let sum = 0
    for (let i = 0; i < width; i++) sum += cells[(s + i) % cells.length] ?? 0
    if (sum > max + 1e-9) { max = sum; best = s } // tolerance: float addition order must not break ties
  }
  return best
}
