import { test } from 'node:test'
import assert from 'node:assert/strict'

import { getPref, setPref } from '../js/theme.js'
const storage = s => Object.defineProperty(globalThis, 'localStorage', { value: s, configurable: true }), T = ['auto', 'light', 'dark']
test('getPref returns an allowed stored value', () => { storage({ getItem: k => (k === 'uptime.theme' ? 'dark' : null) }); assert.equal(getPref('uptime.theme', T), 'dark') })
test('getPref ignores values outside the allowed list', () => { storage({ getItem: () => 'purple' }); assert.equal(getPref('uptime.theme', T), null) })
test('storage that throws or is missing never breaks the page', () => {
  storage({ getItem() { throw new Error('SecurityError') }, setItem() { throw new Error('QuotaExceededError') } })
  assert.equal(getPref('uptime.lang', ['uk', 'en']), null); assert.doesNotThrow(() => setPref('uptime.lang', 'en')); storage(undefined); assert.equal(getPref('uptime.lang', ['uk', 'en']), null)
})
