import { test } from 'node:test'
import assert from 'node:assert/strict'

import { periodRange, firstSeen, tileValues } from '../js/render/summary.js'
const N = 1793621100 // Mon 2 Nov 2026 14:05 Kyiv
test('periodRange steps back whole Kyiv periods', () => {
  assert.deepEqual(periodRange('day', 8, N), { start: 1792875600, end: 1792965600 })   // Sun 25 Oct, 25 h
  assert.deepEqual(periodRange('week', 2, N), { start: 1792357200, end: 1792965600 })  // 19–25 Oct, 169 h
  assert.deepEqual(periodRange('month', 1, N), { start: 1790802000, end: 1793484000 }) // October
  assert.deepEqual(periodRange('week', 0, N), { start: 1793570400, end: 1794175200 })
})
test('firstSeen skips devices without data and falls back to now', () => {
  assert.equal(firstSeen({ now: N, devices: [{ first_seen: null }, { first_seen: 500 }, { first_seen: 900 }] }), 500); assert.equal(firstSeen({ now: N, devices: [{ first_seen: null }] }), N)
})
test('tileValues: No data for an unobserved period (never 100 %), … while loading, ongoing marked', () => {
  const nd = 'No data'
  assert.deepEqual(tileValues({ off: 0, observed: 0, pct: null, cuts: 0, longest: 0, longestOngoing: false }, 'en'), { off: nd, cuts: nd, longest: nd, pct: nd })
  assert.deepEqual(tileValues(null, 'en'), { off: '…', cuts: '…', longest: '…', pct: '…' })
  assert.deepEqual(tileValues({ off: 7440, observed: 36000, pct: 1 - 7440 / 36000, cuts: 2, longest: 2700, longestOngoing: true }, 'en'), { off: '2h 04m', cuts: '2', longest: '45m · ongoing', pct: '79.3%' })
})
