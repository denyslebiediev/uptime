import { test } from 'node:test'
import assert from 'node:assert/strict'

import { headline, bannerText } from '../js/render/header.js'
import { stateView } from '../js/render/cards.js'
import { stamp } from '../js/format.js'
const N = 1793621100 // Mon 2 Nov 2026 14:05 Kyiv
const C = { id: 'centralna', name: { uk: 'Центральна 50', en: 'Centralna 50' }, short: { uk: 'Центральна', en: 'Centralna' }, seen: N - 10, flags: [], today: [] }
const R = { ...C, id: 'rayduzhna', name: { uk: 'Райдужна 71', en: 'Rayduzhna 71' }, short: { uk: 'Райдужна', en: 'Rayduzhna' } }
const on = d => ({ ...d, state: 'on', since: N - 3600 }), U = { ...R, state: 'unknown', since: null, seen: null }
const silent = { ...R, state: 'no_signal', since: N - 8040 }, stale = { ...C, state: 'no_signal', since: N - 3 * 86400, flags: ['stale'] }, text = parts => parts.map(p => p.text).join(' ')
test('headline variants: both on, one silent (spec example), both silent, stale, rebooting, switched off', () => {
  assert.deepEqual(headline([on(C), on(R)], N, 'en'), [{ text: 'Power is on in both apartments.', tone: 'ok' }])
  assert.equal(text(headline([on(C), silent], N, 'en')), 'Power is on at Centralna 50. Rayduzhna 71: no signal for 2h 14m — probably a power cut.')
  assert.equal(text(headline([on(C), silent], N, 'uk')), "Центральна 50: світло є. Райдужна 71: немає зв'язку 2 год 14 хв — ймовірно, немає світла.")
  assert.deepEqual(headline([on(C), silent], N, 'en').map(p => p.tone), ['ok', 'bad'])
  assert.deepEqual(headline([{ ...C, state: 'no_signal', since: N - 600 }, silent], N, 'en'), [{ text: 'No signal from either apartment — probably a power cut.', tone: 'bad' }])
  assert.equal(text(headline([stale], N, 'en')), 'Centralna 50: no signal for 3 days — check the device.')
  assert.equal(text(headline([stale], N, 'uk')), "Центральна 50: немає зв'язку 3 дні — перевірте пристрій.")
  assert.equal(text(headline([{ ...C, state: 'rebooting', since: N - 60 }], N, 'en')), 'Centralna 50 is rebooting.'); assert.equal(text(headline([{ ...C, state: 'device_off', since: N - 60 }], N, 'en')), 'Centralna 50: the device is switched off.')
})
test('a device with no heartbeats yet renders without crashing', () => {
  assert.equal(text(headline([on(C), U], N, 'en')), 'Power is on at Centralna 50. Rayduzhna 71: waiting for the first signal.')
  assert.equal(text(headline([U], N, 'uk')), 'Райдужна 71: очікуємо перший сигнал.'); assert.deepEqual(headline([], N, 'en'), [])
  assert.deepEqual(stateView(U, N, 'en'), { tone: 'muted', icon: 'wait', word: 'Waiting for the first signal', note: null, dur: '—', since: null }); assert.equal(stateView(U, N, 'uk').word, 'Очікуємо перший сигнал')
})
test('stateView: an icon plus a word for every state', () => {
  assert.deepEqual(stateView(on(C), N, 'en'), { tone: 'on', icon: 'on', word: 'Power on', note: null, dur: '1h 00m', since: '13:05' })
  assert.deepEqual(stateView(silent, N, 'en'), { tone: 'off', icon: 'off', word: 'No signal', note: 'probably a power cut', dur: '2h 14m', since: '11:51' })
  assert.deepEqual(stateView(stale, N, 'en'), { tone: 'off', icon: 'warn', word: 'No signal', note: 'check the device', dur: '72h 00m', since: 'Fri 30 Oct, 14:05' })
  assert.equal(stateView({ ...C, state: 'rebooting', since: N - 60 }, N, 'en').icon, 'reboot'); assert.equal(stateView({ ...C, state: 'device_off', since: N - 60 }, N, 'en').word, 'Device switched off')
})
test('offline banner keeps the time of the last good data', () => {
  assert.equal(bannerText(N, N + 600, 'en'), "Can't reach the server — data as of 14:05"); assert.equal(bannerText(N, N + 600, 'uk'), 'Сервер недоступний — дані станом на 14:05')
  assert.equal(bannerText(null, N, 'en'), "Can't reach the server — trying again")
})
test('stamp adds the date only off the reference Kyiv day', () => {
  assert.equal(stamp(N - 3600, N, 'en'), '13:05'); assert.equal(stamp(1793570400 - 60, N, 'en'), 'Sun 1 Nov, 23:59') // a minute before Kyiv midnight
})
