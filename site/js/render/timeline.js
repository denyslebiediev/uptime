// Last 14 days: one row per Kyiv day, one bar per apartment, and the day's off-time.
import { t } from '../i18n.js'
import { periodBounds, lastDays, kyivParts } from '../time.js'
import { fmtDuration, fmtWeekday } from '../format.js'
import { segments, periodStats } from '../stats.js'
import { h } from './header.js'
import { track, hourTicks } from './cards.js'

/** @typedef {import('../stats.js').Events} Events */

/** 14 Kyiv days, today first; `off` is null for a day with nothing observed. @param {Events} ev */
export function timelineRows(ev, now) {
  return lastDays(now, 14).reverse().map(start => {
    const { end } = periodBounds('day', start)
    return {
      start, end, devices: ev.devices.map(d => {
        const st = periodStats(ev, d.id, start, end)
        return { id: d.id, segs: segments(ev, d.id, start, end), off: st.observed ? st.off : null }
      }),
    }
  })
}

/** @param {HTMLElement} section `#days` @param {import('../app.js').View} v */
export function renderTimeline(section, v) {
  const sub = section.querySelector('#tlsub'), tl = section.querySelector('#tl')
  if (!v.ev) { sub.textContent = ''; return tl.replaceChildren() }
  const devs = v.ev.devices, [a, b] = devs.map(d => d.short[v.lang])
  sub.textContent = t(v.lang, 'tl_sub', { a, b })
  const ticks = h('div', { className: 'tl-ticks' }, h('span'), hourTicks(),
    h('div', { className: 'tl-tot h' }, ...devs.map(d => h('span', null, d.short[v.lang]))))
  tl.replaceChildren(ticks, ...timelineRows(v.ev, v.now).map((row, r) => h('div', { className: 'tl-row' },
    h('div', { className: 'tl-day' }, ...(r === 0 ? [h('b', null, t(v.lang, 'today'))]
      : [fmtWeekday(row.start, v.lang), ' ', h('b', null, String(kyivParts(row.start).d))])),
    h('div', { className: 'tl-tracks' }, ...row.devices.map((x, i) => h('div', { className: 'tt' }, h('span', null, String(i + 1)),
      track(x.segs, row.start, row.end, v.now, devs[i].name[v.lang], v.lang, devs[i].first_seen)))),
    h('div', { className: 'tl-tot' }, ...row.devices.map(x => h('span', null, x.off === null ? '—' : fmtDuration(x.off, v.lang)))))))
}
