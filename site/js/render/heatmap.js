// Usual pattern: the share of each Kyiv hour without power over the last 30 days, per apartment.
import { t } from '../i18n.js'
import { lastDays } from '../time.js'
import { fmtPct } from '../format.js'
import { hourPattern, bestWindow } from '../stats.js'
import { h } from './header.js'

const hh = hour => `${String(hour).padStart(2, '0')}:00`

/** @param {HTMLElement} el `#heat` @param {import('../app.js').View} v */
export function renderHeatmap(el, v) {
  if (!v.ev) return el.replaceChildren()
  const from = lastDays(v.now, 30)[0]
  const rows = v.ev.devices.flatMap(d => {
    const cells = hourPattern(v.ev, d.id, from, v.now), top = Math.max(...cells.map(c => c ?? 0)) || 1, best = bestWindow(cells)
    return [
      h('div', { className: 'hm-name' }, d.name[v.lang], best !== null && h('small', null, t(v.lang, 'most_often', { from: hh(best), to: hh((best + 4) % 24) }))),
      h('div', { className: 'cells' }, ...cells.map((c, hour) => {
        const tip = c === null ? t(v.lang, 'no_data') : t(v.lang, 'tip_hour', { from: hh(hour), to: hh(hour + 1), pct: fmtPct(c, v.lang) })
        return h('i', { style: { '--p': c === null ? '0%' : `${8 + Math.round((92 * c) / top)}%` }, dataset: { tip }, role: 'img', 'aria-label': tip })
      })),
    ]
  })
  el.replaceChildren(
    h('div', { className: 'hm' }, ...rows, h('span'),
      h('div', { className: 'hx' }, ...Array.from({ length: 24 }, (_, hour) => h('span', null, String(hour))))),
    h('div', { className: 'hl' }, h('span', null, t(v.lang, 'rarely')), h('i'), h('span', null, t(v.lang, 'often'))))
}
