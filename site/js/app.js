// Boot, polling, state and re-rendering. Every renderer rebuilds its part of the page from one View.
import { apiBase, loadWithFallback, mergeIv } from './api.js'
import { getPref, setPref, initTheme } from './theme.js'
import { pickLang, t } from './i18n.js'
import { renderHeader } from './render/header.js'
import { renderCards } from './render/cards.js'

/**
 * What every render*(el, v) gets. `ev` is the merged /events data: from = earliest loaded `from`, to = now.
 * @typedef {{ lang: import('./i18n.js').Lang, now: number, ok: boolean, asOf: number | null, agoSec: number,
 *   status: import('./api.js').StatusBody | null, ev: import('./stats.js').Events | null,
 *   period: 'day' | 'week' | 'month', offset: number, filter: 'all' | string, showAll: boolean }} View
 */

const $ = id => document.getElementById(id)
const BASE = apiBase(location.search)
let lang = pickLang(getPref('uptime.lang', ['uk', 'en']), navigator.languages ?? [])
initTheme($('tseg'))

const S = {
  status: null, events: null, older: [], from0: null, loadedFrom: Infinity, okStatus: true, okEvents: true, clock: null,
  statusOkAt: 0, triedStatus: -Infinity, triedEvents: -Infinity, period: 'week', offset: 0, filter: 'all', showAll: false,
}
const SECTIONS = [[renderHeader, '.in'], [renderCards, '#cards']]

/** @returns {View} */
function view() {
  // server clock plus the monotonic time since its last good reply, so a wrong device clock does not matter
  const now = S.clock ? Math.floor(S.clock.server + (performance.now() - S.clock.at) / 1000) : Math.floor(Date.now() / 1000)
  return {
    lang, now, ok: S.okStatus && S.okEvents, asOf: S.status?.now ?? S.events?.now ?? null,
    agoSec: Math.round((performance.now() - S.statusOkAt) / 1000), status: S.status,
    ev: S.events && { now, from: S.loadedFrom, to: now, devices: S.events.devices, iv: mergeIv(S.older, S.events.iv) },
    period: S.period, offset: S.offset, filter: S.filter, showAll: S.showAll,
  }
}

function draw(sections) {
  const v = view()
  for (const [fn, sel] of sections) {
    try { fn(document.querySelector(sel), v) } catch (e) { console.error(e) } // one bad section never blanks the page
  }
}

function render() {
  document.documentElement.lang = lang
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(lang, el.dataset.i18n)
  for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(lang, el.dataset.i18nAria))
  for (const b of $('lseg').querySelectorAll('[data-l]')) {
    b.classList.toggle('on', b.dataset.l === lang); b.setAttribute('aria-checked', String(b.dataset.l === lang))
  }
  draw(SECTIONS)
}

async function poll(path) {
  const isStatus = path === '/status'
  if (isStatus) S.triedStatus = performance.now(); else S.triedEvents = performance.now()
  const { data, ok } = await loadWithFallback(BASE + path, isStatus ? S.status : S.events)
  // an /events body also needs its rows and range, or every later render and poll would break on it
  const good = ok && (isStatus || (Array.isArray(data.iv) && Number.isFinite(data.from)))
  if (isStatus) S.okStatus = good; else S.okEvents = good // each endpoint owns its flag, so one cannot hide the other's failure
  if (good) {
    S.clock = { server: data.now, at: performance.now() }
    if (isStatus) { S.status = data; S.statusOkAt = S.clock.at } else {
      S.events = data; S.from0 ??= data.from; S.loadedFrom = Math.min(S.loadedFrom, data.from)
    }
  }
  render()
}

// The /events window grows from the first body's `from` instead of sliding, so loaded rows are never dropped.
const eventsPath = () => (S.from0 === null ? '/events' : `/events?from=${S.from0}`)

function tick() {
  if (document.hidden) return
  const at = performance.now(), status = at - S.triedStatus >= 30_000
  // /events waits 5 min only once it has data and its last attempt was good; until then it retries every 30 s
  const events = at - S.triedEvents >= (S.events && S.okEvents ? 300_000 : 30_000)
  if (status) poll('/status')
  if (events) poll(eventsPath())
  if (!status && !events) draw(SECTIONS.slice(0, 1))
}

$('ui').addEventListener('click', e => {
  const b = e.target.closest('[data-l]')
  if (b) { setPref('uptime.lang', b.dataset.l); lang = b.dataset.l; render() }
})
document.addEventListener('visibilitychange', tick)
setInterval(tick, 1000)
render()
poll('/status')
poll(eventsPath())
