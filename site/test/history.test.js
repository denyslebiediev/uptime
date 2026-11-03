import { test } from 'node:test'
import assert from 'node:assert/strict'

import { barScale } from '../js/render/bars.js'
import { eventRows, kindPill } from '../js/render/events.js'
const day = (h, observed = 86400) => ({ start: 0, off: h * 3600, observed })
test('barScale: average skips today and days without data; scale is 12 h or 24 h', () => {
  assert.deepEqual(barScale([day(1), day(0, 0), day(2), day(9, 50000)]), { max: 12, avg: 1.5 })
  assert.deepEqual(barScale([day(13), day(1)]), { max: 24, avg: 13 }); assert.deepEqual(barScale([day(0, 0), day(3, 40000)]), { max: 12, avg: null })
})
const iv = [['centralna', 'power_off', 100, 200, []], ['centralna', 'no_connection', 200, 260, ['connecting']],
  ['rayduzhna', 'no_connection', 300, 400, []], ['rayduzhna', 'no_signal', 500, null, ['provisional']]]
test('eventRows: newest first, filtered, router-reconnect noise left out', () => {
  assert.deepEqual(eventRows(iv, 'all'), [iv[3], iv[2], iv[0]]); assert.deepEqual(eventRows(iv, 'centralna'), [iv[0]])
})
test('kindPill: the ongoing cut is marked live; every kind has a word', () => {
  assert.deepEqual(kindPill(iv[3], 'en'), { cls: 'off live', text: 'Ongoing' }); assert.deepEqual(kindPill(iv[0], 'en'), { cls: 'off', text: 'Power cut' })
  assert.deepEqual(kindPill(iv[2], 'uk'), { cls: 'net', text: 'Немає інтернету' }); assert.deepEqual(kindPill(['centralna', 'device_off', 1, 2, []], 'en'), { cls: 'reboot', text: 'Switched off' })
})
