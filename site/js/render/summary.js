// The Summary: Day / Week / Month tiles with ‹ › back to the first day of monitoring.
import { t } from '../i18n.js'
import { periodBounds } from '../time.js'
import { fmtPeriod, fmtDuration, fmtPct } from '../format.js'
import { periodStats, bothOff } from '../stats.js'
import { h } from './header.js'

/** @typedef {import('../stats.js').Events} Events */
/** @typedef {import('../stats.js').PeriodStats} PeriodStats */

/** offset 0 = the current period, 1 = the one before; steps by calendar, never a fixed length. @param {'day' | 'week' | 'month'} kind */
export function periodRange(kind, offset, now) {
  let p = periodBounds(kind, now)
  for (let i = 0; i < offset; i++) p = periodBounds(kind, p.start - 1)
  return p
}

/** The earliest first_seen of any device, or `now` while none has reported. @param {Pick<Events, 'now' | 'devices'>} ev */
export function firstSeen(ev) {
  const xs = ev.devices.map(d => d.first_seen).filter(x => x !== null)
  return xs.length ? Math.min(...xs) : ev.now
}

/** `…` while the range loads, "No data" with nothing observed (never 100 %). @param {PeriodStats | null} st */
export function tileValues(st, lang) {
  if (!st) return { off: '…', cuts: '…', longest: '…', pct: '…' }
  if (st.pct === null) { const nd = t(lang, 'no_data'); return { off: nd, cuts: nd, longest: nd, pct: nd } }
  return {
    off: fmtDuration(st.off, lang), cuts: String(st.cuts),
    longest: fmtDuration(st.longest, lang) + (st.longestOngoing ? ` · ${t(lang, 'ongoing')}` : ''),
    pct: fmtPct(st.pct, lang),
  }
}

/** @param {HTMLElement} section `#summary` @param {import('../app.js').View} v */
export function renderSummary(section, v) {
  for (const b of section.querySelectorAll('#pseg [data-p]')) {
    b.classList.toggle('on', b.dataset.p === v.period); b.setAttribute('aria-checked', String(b.dataset.p === v.period))
  }
  const range = periodRange(v.period, v.offset, v.now), fs = v.ev ? firstSeen(v.ev) : Infinity
  section.querySelector('#plabel').textContent = fmtPeriod(v.period, range, v.now, v.lang)
  section.querySelector('[data-nav="1"]').disabled = range.start <= fs
  section.querySelector('[data-nav="-1"]').disabled = v.offset === 0
  const tiles = section.querySelector('#tiles')
  if (!v.ev) return tiles.replaceChildren()
  const loaded = range.start >= v.ev.from || v.ev.from <= fs
  const devs = v.ev.devices.map(d => ({ d, st: loaded ? periodStats(v.ev, d.id, range.start, range.end) : null }))
  const vals = devs.map(x => tileValues(x.st, v.lang))
  const tile = (key, field) => h('div', { className: 'tile' }, h('div', { className: 'l' }, t(v.lang, key)),
    h('div', { className: 'vs' }, ...devs.map((x, i) => h('div', { className: 'v' }, h('em', null, x.d.short[v.lang]), vals[i][field]))))
  const both = !loaded ? '…' : devs.some(x => x.st.pct === null) ? t(v.lang, 'no_data') : fmtDuration(bothOff(v.ev, range.start, range.end), v.lang)
  tiles.replaceChildren(tile('tile_off', 'off'), tile('tile_cuts', 'cuts'), tile('tile_longest', 'longest'), tile('tile_pct', 'pct'),
    h('div', { className: 'tile' }, h('div', { className: 'l' }, t(v.lang, 'tile_both')), h('div', { className: 'big' }, both),
      h('div', { className: 'l2' }, t(v.lang, 'tile_both_sub'))))
}
