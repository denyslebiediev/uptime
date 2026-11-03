import { test } from 'node:test'
import assert from 'node:assert/strict'

import { pickZone, kyivParts, kyivTime, periodBounds, lastDays, kyivIso } from '../js/time.js'
const H = 3600, U = (...a) => Date.UTC(...a) / 1000 // U(year, monthIndex0, day, h, mi)
test('Kyiv midnights land on the right UTC instants around DST', () => {
  assert.equal(kyivTime(2026, 3, 29), U(2026, 2, 28, 22)); assert.equal(kyivTime(2026, 3, 30), U(2026, 2, 29, 21))
  assert.equal(kyivTime(2026, 10, 25), U(2026, 9, 24, 21)); assert.equal(kyivTime(2026, 10, 26), U(2026, 9, 25, 22))
})
test('kyivParts reads Kyiv wall time, including the repeated 03:00 hour', () => {
  assert.deepEqual(kyivParts(U(2026, 10, 1, 17, 15)), { y: 2026, mo: 11, d: 1, h: 19, mi: 15, s: 0, wd: 7 })
  assert.equal(kyivParts(U(2026, 9, 25, 0, 30)).h, 3); assert.equal(kyivParts(U(2026, 9, 25, 1, 30)).h, 3)
  assert.equal(kyivParts(U(2026, 9, 24, 21)).h, 0) // midnight is 0, never 24
})
test('a Kyiv day lasts 23 h on 2026-03-29, 25 h on 2026-10-25, 24 h otherwise', () => {
  const a = periodBounds('day', kyivTime(2026, 3, 29, 12)); assert.equal(a.start, kyivTime(2026, 3, 29)); assert.equal(a.end - a.start, 23 * H)
  const b = periodBounds('day', kyivTime(2026, 10, 25, 12)); assert.equal(b.end - b.start, 25 * H)
  const o = periodBounds('day', kyivTime(2026, 11, 3)); assert.equal(o.start, kyivTime(2026, 11, 3)); assert.equal(o.end - o.start, 24 * H)
})
test('ISO weeks start Monday 00:00 Kyiv: 167 h, 169 h, and across New Year', () => {
  const w = periodBounds('week', kyivTime(2026, 3, 29, 23, 59)); assert.equal(w.start, kyivTime(2026, 3, 23)); assert.equal(w.end - w.start, 167 * H)
  const v = periodBounds('week', kyivTime(2026, 10, 19)); assert.equal(v.start, U(2026, 9, 18, 21)); assert.equal(v.end - v.start, 169 * H)
  assert.equal(periodBounds('week', kyivTime(2027, 1, 1)).start, kyivTime(2026, 12, 28))
})
test('months start on the 1st 00:00 Kyiv: March 743 h, October 745 h, December ends 2027-01-01', () => {
  const m = periodBounds('month', kyivTime(2026, 3, 15)); assert.equal(m.start, kyivTime(2026, 3, 1)); assert.equal(m.end - m.start, 743 * H)
  const o = periodBounds('month', kyivTime(2026, 10, 31, 23)); assert.equal(o.end - o.start, 745 * H)
  assert.equal(periodBounds('month', kyivTime(2026, 12, 31, 23)).end, kyivTime(2027, 1, 1))
})
test('previous and next periods come from start - 1 and end', () => {
  const w = periodBounds('week', kyivTime(2026, 3, 29))
  assert.equal(periodBounds('week', w.start - 1).start, kyivTime(2026, 3, 16)); assert.equal(periodBounds('week', w.end).start, kyivTime(2026, 3, 30))
})
test('lastDays returns Kyiv midnights oldest first across the 25 h day', () => {
  const ds = lastDays(kyivTime(2026, 10, 26, 10), 3)
  assert.deepEqual(ds, [kyivTime(2026, 10, 24), kyivTime(2026, 10, 25), kyivTime(2026, 10, 26)]); assert.equal(ds[2] - ds[1], 25 * H)
})
test('kyivIso prints the Kyiv offset', () => {
  assert.equal(kyivIso(U(2026, 10, 1, 17, 15)), '2026-11-01T19:15:00+02:00'); assert.equal(kyivIso(U(2026, 6, 1, 9)), '2026-07-01T12:00:00+03:00')
})
test('pickZone falls back to Europe/Kiev when Europe/Kyiv is unsupported', () => {
  assert.equal(pickZone(tz => tz !== 'Europe/Kyiv'), 'Europe/Kiev'); assert.equal(pickZone(() => true), 'Europe/Kyiv')
})
