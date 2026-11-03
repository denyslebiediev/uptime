import { test } from 'node:test'
import assert from 'node:assert/strict'

import { timelineRows } from '../js/render/timeline.js'
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
