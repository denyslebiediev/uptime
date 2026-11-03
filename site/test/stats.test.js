import { test } from 'node:test'
import assert from 'node:assert/strict'

import { kyivTime as K } from '../js/time.js'
import { segments, periodStats, bothOff, hourPattern, bestWindow } from '../js/stats.js'
const H = 3600, U = (...a) => Date.UTC(...a) / 1000, C = 'centralna', R = 'rayduzhna'
const D1 = K(2026, 11, 1), D2 = K(2026, 11, 2), D3 = K(2026, 11, 3), D4 = K(2026, 11, 4)
const ev = (iv, now = D4, first_seen = K(2026, 1, 1), from = K(2026, 1, 1)) => ({ now, from, to: now, devices: [{ id: C, first_seen }, { id: R, first_seen }], iv })
const days = e => [[D1, D2], [D2, D3], [D3, D4]].map(([a, b]) => periodStats(e, C, a, b).off)
test('off-time is power_off + open no_signal; % with power = 1 − off / observed, observed excluding device_off and the future', () => {
  const s = periodStats(ev([[C, 'power_off', D1 + H, D1 + 2 * H, []], [C, 'no_connection', D1 + 3 * H, D1 + 4 * H, []], [C, 'reboot', D1 + 5 * H, D1 + 5 * H + 60, []],
    [C, 'device_off', D1 + 6 * H, D1 + 7 * H, []], [C, 'no_signal', D1 + 20 * H, null, ['provisional']]], D1 + 22 * H), C, D1, D2)
  assert.equal(s.off, 3 * H); assert.equal(s.cuts, 2); assert.equal(s.observed, 21 * H); assert.equal(s.pct, 1 - (3 * H) / (21 * H))
})
test('a whole-day cut on 2026-03-29 is 23 h off and 0 % with power', () => {
  const s = periodStats(ev([[C, 'power_off', K(2026, 3, 29), K(2026, 3, 30), []]]), C, K(2026, 3, 29), K(2026, 3, 30))
  assert.equal(s.off, 23 * H); assert.equal(s.observed, 23 * H); assert.equal(s.pct, 0)
})
test('a cut across midnight counts in both days but is one cut of the day it starts', () => {
  const e = ev([[C, 'power_off', K(2026, 11, 1, 22), K(2026, 11, 2, 2), []]]), a = periodStats(e, C, D1, D2), b = periodStats(e, C, D2, D3)
  assert.deepEqual([a.off, a.cuts, a.longest, b.off, b.cuts, b.longest], [2 * H, 1, 4 * H, 2 * H, 0, 0])
})
test('a 50-hour cut splits 14 h / 24 h / 12 h over three days', () => {
  assert.deepEqual(days(ev([[C, 'power_off', K(2026, 11, 1, 10), K(2026, 11, 3, 12), []]])), [14 * H, 24 * H, 12 * H])
})
test('an ongoing cut counts up to now and is the longest, marked ongoing', () => {
  const e = ev([[C, 'power_off', D1 + H, D1 + 2 * H, []], [C, 'no_signal', K(2026, 11, 1, 10), null, ['provisional']]], K(2026, 11, 3, 12))
  assert.deepEqual(days(e), [15 * H, 24 * H, 12 * H])
  const w = periodStats(e, C, K(2026, 10, 26), D2) // ISO week Mon 26 Oct – Sun 1 Nov
  assert.equal(w.cuts, 2); assert.equal(w.longest, 50 * H); assert.equal(w.longestOngoing, true)
})
test('segments clip to the period and to now and mark open intervals ongoing', () => {
  const e = ev([[C, 'no_connection', D1 - H, D1 + H, ['connecting']], [R, 'power_off', D1, D1 + H, []], [C, 'no_signal', D1 + 20 * H, null, ['provisional']]], D1 + 22 * H)
  assert.deepEqual(segments(e, C, D1, D2), [{ kind: 'no_connection', start: D1, end: D1 + H, ongoing: false, flags: ['connecting'] },
    { kind: 'no_signal', start: D1 + 20 * H, end: D1 + 22 * H, ongoing: true, flags: ['provisional'] }])
})
test('a period before monitoring started is No data; a partly observed one uses observed time only', () => {
  const e = ev([[C, 'power_off', D2 + 18 * H, D2 + 21 * H, []]], D4, D2 + 12 * H)
  assert.equal(periodStats(e, C, D1, D2).pct, null)
  const p = periodStats(e, C, D2, D3); assert.equal(p.observed, 12 * H); assert.equal(p.pct, 0.75)
  assert.equal(periodStats(e, C, D4, D4 + 24 * H).pct, null) // the future is not observed
})
test('time before the loaded /events range is not observed', () => {
  assert.equal(periodStats(ev([], D4, K(2026, 1, 1), D2), C, D1, D2).pct, null)
})
test('a device with first_seen null gives zeros and pct null', () => {
  assert.deepEqual(periodStats(ev([], D4, null), C, D1, D2), { off: 0, observed: 0, pct: null, cuts: 0, longest: 0, longestOngoing: false })
  assert.equal(bothOff(ev([], D4, null), D1, D2), 0); assert.deepEqual(hourPattern(ev([], D4, null), C, D1, D2), Array(24).fill(null))
})
test('both-off is the overlap of both apartments\' off-time inside the period', () => {
  const e = ev([[C, 'power_off', D1 + H, D1 + 5 * H, []], [R, 'no_connection', D1, D1 + H, []], [R, 'power_off', D1 + 3 * H, D1 + 8 * H, []],
    [C, 'no_signal', D1 + 20 * H, null, []], [R, 'no_signal', D1 + 21 * H, null, []]], D1 + 23 * H)
  assert.equal(bothOff(e, D1, D2), 4 * H) // 03–05 plus 21–23 (now)
})
test('heatmap divides by elapsed seconds of each Kyiv hour: 03:00 happens twice on 2026-10-25', () => {
  const c = hourPattern(ev([[C, 'power_off', U(2026, 9, 25, 0), U(2026, 9, 25, 2), []]]), C, K(2026, 10, 25), K(2026, 10, 26)) // 03:00 EEST to 04:00 EET: both runs of hour 03
  assert.equal(c.length, 24); assert.equal(c[3], 1); assert.equal(c[2], 0); assert.equal(c[4], 0)
})
test('heatmap hour 03 on 2026-03-29 never elapsed, so it is null', () => {
  const c = hourPattern(ev([]), C, K(2026, 3, 29), K(2026, 3, 30)); assert.equal(c[3], null); assert.equal(c[2], 0); assert.equal(c[4], 0)
})
test('best 4-hour window wraps past midnight, ties go to the lowest start, null without off-time', () => {
  const w = Array(24).fill(0); w[23] = w[0] = w[1] = 1; w[2] = 0.5
  assert.equal(bestWindow(w), 23); assert.equal(bestWindow([1, ...Array(23).fill(0)]), 0)
  assert.equal(bestWindow(Array(24).fill(0)), null); assert.equal(bestWindow(Array(24).fill(null)), null)
})
