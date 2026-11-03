import { test } from 'node:test'
import assert from 'node:assert/strict'

import { STRINGS, LOCALE, pickLang, t } from '../js/i18n.js'
const ph = s => (s.match(/\{\w+\}/g) ?? []).sort()
test('uk and en have the same 79 keys, no empty strings and the same placeholders', () => {
  assert.deepEqual(Object.keys(STRINGS.uk).sort(), Object.keys(STRINGS.en).sort()); assert.equal(Object.keys(STRINGS.en).length, 79)
  for (const k of Object.keys(STRINGS.en)) { assert.ok(STRINGS.en[k] && STRINGS.uk[k], k); assert.deepEqual(ph(STRINGS.uk[k]), ph(STRINGS.en[k]), k) }
})
test('spec-fixed copy and 24-hour locales uk-UA / en-GB', () => {
  assert.equal(STRINGS.en.brand, 'Power'); assert.equal(STRINGS.uk.brand, 'Світло')
  assert.equal(STRINGS.en.state_no_signal, 'No signal'); assert.equal(STRINGS.uk.state_no_signal, "Немає зв'язку")
  assert.equal(STRINGS.en.probably_cut, 'probably a power cut'); assert.equal(STRINGS.uk.probably_cut, 'ймовірно, немає світла')
  assert.equal(STRINGS.en.state_unknown, 'Waiting for the first signal'); assert.equal(STRINGS.uk.state_unknown, 'Очікуємо перший сигнал')
  assert.equal(STRINGS.en.offline, "Can't reach the server — data as of {time}"); assert.deepEqual(LOCALE, { uk: 'uk-UA', en: 'en-GB' })
  assert.equal(STRINGS.en.footer, 'Times in Kyiv time · power-off times are accurate to about 30 s')
})
test('default language is uk when navigator.languages has uk, else en; a stored valid choice wins', () => {
  assert.equal(pickLang(null, ['en-US', 'uk-UA']), 'uk'); assert.equal(pickLang(null, ['UK']), 'uk'); assert.equal(pickLang(null, ['ru-UA', 'en']), 'en')
  assert.equal(pickLang(null, []), 'en'); assert.equal(pickLang('en', ['uk']), 'en'); assert.equal(pickLang('xx', ['uk']), 'uk')
})
test('t fills placeholders and returns the key when it is missing', () => {
  assert.equal(t('en', 'lede_on', { name: 'Centralna 50' }), 'Power is on at Centralna 50.')
  assert.equal(t('en', 'lede_no_signal', { name: 'Rayduzhna 71', dur: '2h 14m' }), 'Rayduzhna 71: no signal for 2h 14m — probably a power cut.')
  assert.equal(t('uk', 'since', { time: '14:05' }), 'з 14:05'); assert.equal(t('en', 'nope'), 'nope')
})
