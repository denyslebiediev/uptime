// Hours without power per day, last 30 days: one bar chart per apartment.
import { t } from '../i18n.js'
import { periodBounds, lastDays } from '../time.js'
import { fmtDay, fmtDate, fmtDuration, fmtNum } from '../format.js'
import { periodStats } from '../stats.js'
import { h } from './header.js'

/** @typedef {{ start: number, off: number, observed: number }} BarDay */

/** One entry per Kyiv day, oldest first, today last. @param {import('../stats.js').Events} ev @returns {BarDay[]} */
export function barSeries(ev, device, now) {
  return lastDays(now, 30).map(start => {
    const { off, observed } = periodStats(ev, device, start, periodBounds('day', start).end)
    return { start, off, observed }
  })
}

/** In hours: a 24 h scale once any day passes 12 h; the average leaves out today and days with nothing observed. @param {BarDay[]} series */
export function barScale(series) {
  const full = series.slice(0, -1).filter(x => x.observed > 0)
  return {
    max: series.some(x => x.off > 12 * 3600) ? 24 : 12,
    avg: full.length ? full.reduce((n, x) => n + x.off, 0) / full.length / 3600 : null,
  }
}

/** @param {HTMLElement} el `#sm` @param {import('../app.js').View} v */
export function renderBars(el, v) {
  if (!v.ev) return el.replaceChildren()
  el.replaceChildren(...v.ev.devices.map(d => {
    const series = barSeries(v.ev, d.id, v.now), { max, avg } = barScale(series), last = series.length - 1
    const pct = hours => `${Math.min(hours / max, 1) * 100}%`
    const bar = (x, i) => {
      const today = i === last, none = x.observed === 0
      const tip = none ? t(v.lang, 'no_data')
        : t(v.lang, 'tip_day', { date: fmtDay(x.start, v.lang), dur: fmtDuration(x.off, v.lang) }) + (today ? ` · ${t(v.lang, 'so_far')}` : '')
      return h('i', {
        className: [today && 'today', none && 'none'].filter(Boolean).join(' ') || null, style: { height: pct(x.off / 3600) },
        dataset: { tip }, role: 'img', 'aria-label': tip,
      })
    }
    return h('div', { className: 'panel' },
      h('div', { className: 'bc-hd' }, d.name[v.lang], h('span', null, t(v.lang, 'avg', { h: avg === null ? '—' : fmtNum(avg, v.lang) }))),
      h('div', { className: 'plot' },
        ...[0, 1, 2, 3].map(i => h('div', { className: 'gl', style: { bottom: `${(i / 3) * 100}%` } }, h('span', null, String((i * max) / 3)))),
        avg !== null && h('div', { className: 'avg', style: { bottom: pct(avg) } }),
        h('div', { className: 'bars' }, ...series.map(bar))),
      h('div', { className: 'bx' }, h('span', null, fmtDate(series[0].start, v.lang)), h('span', null, fmtDate(series[15].start, v.lang)),
        h('span', null, t(v.lang, 'today'))))
  }))
}
