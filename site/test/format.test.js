import { test } from 'node:test'
import assert from 'node:assert/strict'

import { fmtDuration, fmtTime, fmtDay, fmtDate, fmtWeekday, fmtMonth, fmtPct, fmtNum, fmtWhen, fmtPeriod } from '../js/format.js'
import { kyivTime as K, periodBounds } from '../js/time.js'
const U = (...a) => Date.UTC(...a) / 1000
test('durations read "5h 12m" / "5 год 12 хв", minutes floored and zero-padded after hours', () => {
  assert.equal(fmtDuration(5 * 3600 + 12 * 60, 'en'), '5h 12m'); assert.equal(fmtDuration(5 * 3600 + 12 * 60, 'uk'), '5 год 12 хв')
  assert.equal(fmtDuration(2 * 3600 + 5 * 60 + 59, 'en'), '2h 05m'); assert.equal(fmtDuration(12 * 60, 'uk'), '12 хв')
  assert.equal(fmtDuration(50 * 3600, 'en'), '50h 00m'); assert.equal(fmtDuration(59, 'en'), '0m'); assert.equal(fmtDuration(-30, 'uk'), '0 хв')
})
test('times are 24-hour Kyiv time whatever the host zone', () => {
  assert.equal(fmtTime(U(2026, 10, 1, 17, 5)), '19:05'); assert.equal(fmtTime(U(2026, 10, 1, 22, 5)), '00:05'); assert.equal(fmtTime(U(2026, 6, 1, 9)), '12:00')
})
test('dates use uk-UA / en-GB on the Kyiv calendar', () => {
  const t = U(2026, 10, 1, 17, 5)
  assert.equal(fmtDay(t, 'en'), 'Sun 1 Nov'); assert.equal(fmtDay(t, 'uk'), 'нд, 1 лист.')
  assert.equal(fmtDate(t, 'en'), '1 Nov'); assert.equal(fmtDate(t, 'uk'), '1 лист.')
  assert.equal(fmtWeekday(t, 'en'), 'Sun'); assert.equal(fmtWeekday(t, 'uk'), 'нд')
  assert.equal(fmtMonth(t, 'en'), 'November 2026'); assert.equal(fmtMonth(t, 'uk'), 'листопад 2026 р.')
  assert.equal(fmtDay(U(2026, 10, 1, 22, 30), 'en'), 'Mon 2 Nov') // 00:30 in Kyiv is already Monday
})
test('numbers and percentages follow the locale', () => {
  assert.equal(fmtPct(0.973, 'en'), '97.3%'); assert.equal(fmtPct(0.973, 'uk'), '97,3%'); assert.equal(fmtPct(1, 'en'), '100.0%'); assert.equal(fmtNum(4.2, 'uk'), '4,2')
})
test('fmtWhen says Today / Yesterday by Kyiv day', () => {
  const now = K(2026, 11, 3, 10)
  assert.equal(fmtWhen(K(2026, 11, 3, 8, 5), now, 'en'), 'Today, 08:05'); assert.equal(fmtWhen(K(2026, 11, 2, 23, 59), now, 'uk'), 'Вчора, 23:59')
  assert.equal(fmtWhen(K(2026, 11, 1, 19, 15), now, 'en'), 'Sun 1 Nov, 19:15')
})
test('fmtPeriod labels a day, an ISO week (end exclusive) and a month', () => {
  const now = K(2026, 11, 3, 10)
  assert.equal(fmtPeriod('day', periodBounds('day', now), now, 'en'), 'Today · 3 Nov')
  assert.equal(fmtPeriod('day', periodBounds('day', K(2026, 11, 2)), now, 'uk'), 'Вчора · 2 лист.')
  assert.equal(fmtPeriod('day', periodBounds('day', K(2026, 11, 1)), now, 'en'), 'Sun 1 Nov')
  assert.equal(fmtPeriod('week', periodBounds('week', K(2026, 11, 1)), now, 'en'), '26 Oct – 1 Nov')
  assert.equal(fmtPeriod('month', periodBounds('month', now), now, 'en'), 'November 2026 · so far')
  assert.equal(fmtPeriod('month', periodBounds('month', K(2026, 10, 5)), now, 'uk'), 'жовтень 2026 р.')
})
