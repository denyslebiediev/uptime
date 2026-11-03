// Boot, polling, state and re-rendering. Every renderer rebuilds its part of the page from one View.
import { apiBase, loadWithFallback, mergeIv } from './api.js'
import { getPref, setPref, initTheme } from './theme.js'
import { pickLang, t } from './i18n.js'
import { renderHeader } from './render/header.js'
import { renderCards } from './render/cards.js'
import { renderSummary, periodRange, firstSeen } from './render/summary.js'
import { renderTimeline } from './render/timeline.js'
import { renderBars } from './render/bars.js'
import { renderHeatmap } from './render/heatmap.js'
import { renderEvents, downloadCsv } from './render/events.js'
import { initTooltip } from './render/tooltip.js'

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
initTooltip($('ui'), $('tip'))

const S = {
  status: null, events: null, older: [], from0: null, loadedFrom: Infinity, okStatus: true, okEvents: true, clock: null,
  statusOkAt: 0, triedStatus: -Infinity, triedEvents: -Infinity, period: 'week', offset: 0, filter: 'all', showAll: false, loading: false,
}
const SECTIONS = [[renderHeader, '.in'], [renderCards, '#cards'], [renderSummary, '#summary'], [renderTimeline, '#days'],
  [renderBars, '#sm'], [renderHeatmap, '#heat'], [renderEvents, '#events']]

// server clock plus the monotonic time since its last good reply, so a wrong device clock does not matter
const serverNow = () => S.clock ? Math.floor(S.clock.server + (performance.now() - S.clock.at) / 1000) : Math.floor(Date.now() / 1000)
// an /events body also needs its rows and range, or every later render and poll would break on it
const goodEvents = data => Array.isArray(data.iv) && Number.isFinite(data.from)

/** @returns {View} */
function view() {
  const now = serverNow()
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
  const good = ok && (isStatus || goodEvents(data))
  if (isStatus) S.okStatus = good; else S.okEvents = good // each endpoint owns its flag, so one cannot hide the other's failure
  if (good) {
    S.clock = { server: data.now, at: performance.now() }
    if (isStatus) { S.status = data; S.statusOkAt = S.clock.at } else {
      S.events = data; S.from0 ??= data.from; S.loadedFrom = Math.min(S.loadedFrom, data.from)
    }
  }
  render()
}

/** Loads older /events rows back to t (never before the first heartbeat), at most 400 days per request. */
async function ensureFrom(t) {
  if (!S.events || S.loading || t >= S.loadedFrom || S.loadedFrom <= firstSeen(S.events)) return
  const from = Math.max(t, firstSeen(S.events), S.loadedFrom - 400 * 86400)
  S.loading = true
  const { data, ok } = await loadWithFallback(`${BASE}/events?from=${from}&to=${S.loadedFrom}`, null)
  const good = ok && goodEvents(data)
  if (good) { S.older = mergeIv(S.older, data.iv); S.loadedFrom = from }
  S.okEvents = good; S.loading = false
  render()
  if (good) ensureFrom(periodRange(S.period, S.offset, serverNow()).start) // the user may have clicked again meanwhile
}

/** Downloads the whole history as CSV; if that fetch fails, the loaded range, with the offline banner saying why. */
async function exportCsv() {
  const v = view()
  if (!v.ev) return
  // shortcut: the API caps a range at 400 days, so after 13 months the CSV holds the last 400; fetch in 400-day chunks then.
  const from = Math.max(firstSeen(v.ev), v.now - 400 * 86400)
  const { data, ok } = await loadWithFallback(`${BASE}/events?from=${from}&to=${v.now}`, null)
  const good = ok && goodEvents(data)
  downloadCsv(good ? data : v.ev, lang)
  if (!good) { S.okEvents = false; render() } // tick retries /events within 30 s; a good reply clears the banner
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
  const p = e.target.closest('[data-p]'), nav = e.target.closest('[data-nav]')
  if (p) { S.period = p.dataset.p; S.offset = 0 }
  if (nav) S.offset = Math.max(0, S.offset + Number(nav.dataset.nav))
  if (p || nav) { ensureFrom(periodRange(S.period, S.offset, serverNow()).start); render() }
  const f = e.target.closest('[data-f]'), more = e.target.closest('.more')
  if (f) { S.filter = f.dataset.f; S.showAll = false }
  if (more) S.showAll = true
  if (f || more) render()
  if (e.target.closest('#csv')) exportCsv()
})
document.addEventListener('visibilitychange', tick)
setInterval(tick, 1000)
render()
poll('/status')
poll(eventsPath())
