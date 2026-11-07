import { test } from 'node:test'
import assert from 'node:assert/strict'

import { timelineRows } from '../js/render/timeline.js'
import { onSpans, track } from '../js/render/cards.js'
const H = 3600, FRI = 1793311200, SAT = 1793397600, SUN = 1793484000, MON = 1793570400 // Kyiv midnights 30 Oct – 2 Nov 2026
const F22 = 1793390400, NOW = 1793577600 // Fri 22:00, Mon 02:00
const ev = (iv, first_seen = NOW - 30 * 86400) => ({ now: NOW, from: NOW - 35 * 86400, to: NOW, devices: [{ id: 'centralna', first_seen }], iv })
const day = (rows, d) => rows.find(r => r.start === d).devices[0], spans = x => x.segs.map(s => [s.start, s.end, s.ongoing])
test('a 50-hour cut draws a segment and a total on every day it touches', () => {
  const rows = timelineRows(ev([['centralna', 'power_off', F22, MON, []]]), NOW)
  assert.equal(rows.length, 14); assert.equal(rows[0].start, MON); assert.equal(rows[13].start, 1792443600) // Tue 20 Oct: calendar days across the 25 h day, not 13 × 86400
  assert.deepEqual([FRI, SAT, SUN, MON].map(d => spans(day(rows, d))), [[[F22, SAT, false]], [[SAT, SUN, false]], [[SUN, MON, false]], []])
  assert.deepEqual([FRI, SAT, SUN, MON].map(d => day(rows, d).off), [2 * H, 24 * H, 24 * H, 0])
})
test('an ongoing cut is drawn up to now on today; days before monitoring have no total', () => {
  const rows = timelineRows(ev([['centralna', 'no_signal', F22, null, ['provisional']]], SAT), NOW)
  assert.deepEqual(spans(day(rows, MON)), [[MON, NOW, true]]); assert.equal(day(rows, MON).off, 2 * H); assert.equal(day(rows, FRI).off, null)
})
test('power-on stretches are what the other segments leave between first signal and now', () => {
  const seg = (start, end) => ({ kind: 'power_off', start, end, ongoing: false, flags: [] })
  assert.deepEqual(onSpans([seg(20, 30), seg(30, 40), seg(50, 60)], 10, 70), [[10, 20], [40, 50], [60, 70]])
  assert.deepEqual(onSpans([seg(0, 10), seg(5, 8)], 0, 12), [[10, 12]]) // a segment nested in a longer one must not reopen the gap
  assert.deepEqual(onSpans([seg(0, 20)], 10, 20), [])
  assert.deepEqual(onSpans([], 10, 5), []) // first signal is still in the future
})
test('bar tooltips give every stretch of the day, without the apartment name', () => {
  globalThis.document = { createElement: () => ({ style: { setProperty() {} }, dataset: {}, kids: [], setAttribute() {}, append(...k) { this.kids.push(...k) } }) }
  const cut = { kind: 'power_off', start: MON + H, end: MON + 3 * H, ongoing: false, flags: [] }
  const bar = track([cut], MON, MON + 24 * H, MON + 4 * H, 'Centralna 50', 'en', FRI) // first seen days before this bar
  assert.deepEqual(bar.kids.map(k => k.dataset.tip).filter(Boolean), ['Power on · 00:00 – 01:00 (1h 00m)', 'Power on · 03:00 – now (1h 00m)', 'Power cut · 01:00 – 03:00 (2h 00m)'])
})
