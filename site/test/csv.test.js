import { test } from 'node:test'
import assert from 'node:assert/strict'

import { toCsv } from '../js/csv.js'
const U = (...a) => Date.UTC(...a) / 1000, now = U(2026, 10, 2, 9, 30)
const ev = { now, from: U(2026, 9, 1), to: now, iv: [['rayduzhna', 'power_off', U(2026, 10, 1, 17, 15), U(2026, 10, 1, 19, 20), []], ['centralna', 'no_signal', U(2026, 10, 2, 8), null, ['provisional', 'stale']]],
  devices: [{ id: 'centralna', name: { uk: 'Центральна 50', en: 'Centralna 50' }, first_seen: U(2026, 9, 1) }, { id: 'rayduzhna', name: { uk: 'Райдужна 71', en: 'Rayduzhna 71' }, first_seen: U(2026, 9, 1) }] }
const OPEN = ',no_signal,2026-11-02T10:00:00+02:00,,90,2026-11-02T08:00:00Z,,provisional;stale'
test('CSV has a BOM, CRLF, the spec columns, Kyiv and UTC times; an open row has no end and counts to now', () => {
  assert.deepEqual(toCsv(ev, 'en').split('\r\n'), ['\uFEFFapartment,kind,start_kyiv,end_kyiv,duration_min,start_utc,end_utc,flags',
    'Rayduzhna 71,power_off,2026-11-01T19:15:00+02:00,2026-11-01T21:20:00+02:00,125,2026-11-01T17:15:00Z,2026-11-01T19:20:00Z,', 'Centralna 50' + OPEN, ''])
})
test('device filter and Ukrainian names', () => {
  assert.deepEqual(toCsv(ev, 'uk', 'centralna').split('\r\n').slice(1), ['Центральна 50' + OPEN, ''])
})
test('fields with commas or quotes are quoted', () => {
  const e = { ...ev, devices: [{ ...ev.devices[0], name: { uk: 'x', en: 'A, "B"' } }], iv: [ev.iv[1]] }
  assert.equal(toCsv(e, 'en').split('\r\n')[1], '"A, ""B"""' + OPEN)
})
