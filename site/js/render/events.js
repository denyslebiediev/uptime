// Events: newest first, filter All / per apartment, 8 rows then "Show all", and the CSV download.
import { t } from '../i18n.js'
import { kyivIso } from '../time.js'
import { fmtDuration, fmtWhen, stamp } from '../format.js'
import { toCsv } from '../csv.js'
import { h } from './header.js'

/** @typedef {import('../api.js').IvRow} IvRow */

const PILL = { power_off: 'off', no_signal: 'off', no_connection: 'net', reboot: 'reboot', device_off: 'reboot' }

/**
 * Newest first. A `connecting` no_connection row is the 1–3 min router reconnect after every cut,
 * so it is left out here; the timeline and the CSV still show it.
 * @param {IvRow[]} iv @param {'all' | string} filter @returns {IvRow[]}
 */
export const eventRows = (iv, filter) => iv
  .filter(r => (filter === 'all' || r[0] === filter) && !(r[1] === 'no_connection' && r[4].includes('connecting')))
  .sort((a, b) => b[2] - a[2])

/** @param {IvRow} row @param {import('../i18n.js').Lang} lang @returns {{ cls: string, text: string }} */
export function kindPill(row, lang) {
  const cls = PILL[row[1]]
  return row[3] === null && cls === 'off' ? { cls: 'off live', text: t(lang, 'ongoing_pill') } : { cls, text: t(lang, `kind_${row[1]}`) }
}

/** @param {import('../stats.js').Events} ev @param {import('../i18n.js').Lang} lang */
export function downloadCsv(ev, lang) {
  const url = URL.createObjectURL(new Blob([toCsv(ev, lang)], { type: 'text/csv;charset=utf-8' }))
  h('a', { href: url, download: `uptime-${kyivIso(ev.now).slice(0, 10)}.csv` }).click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000) // Safari may still be reading the blob when click() returns
}

/** @param {HTMLElement} section `#events` @param {import('../app.js').View} v */
export function renderEvents(section, v) {
  const fseg = section.querySelector('#fseg'), log = section.querySelector('#log')
  if (!v.ev) { fseg.replaceChildren(); return log.replaceChildren() }
  const opts = [['all', t(v.lang, 'filter_all')], ...v.ev.devices.map(d => [d.id, d.short[v.lang]])]
  // the buttons are updated in place, not rebuilt, so keyboard focus survives a click and every poll
  if (fseg.children.length !== opts.length) fseg.replaceChildren(...opts.map(() => h('button', { role: 'radio' })))
  opts.forEach(([f, text], i) => {
    const b = fseg.children[i]
    b.dataset.f = f; b.textContent = text; b.classList.toggle('on', f === v.filter); b.setAttribute('aria-checked', String(f === v.filter))
  })
  const rows = eventRows(v.ev.iv, v.filter), name = id => v.ev.devices.find(d => d.id === id)?.name[v.lang] ?? id
  const k = key => h('em', { className: 'k' }, t(v.lang, key))
  const row = r => {
    const pill = kindPill(r, v.lang)
    return h('div', { className: 'lr' },
      h('span', { className: 'c-apt' }, name(r[0])),
      h('span', { className: 'c-off' }, k('col_off'), fmtWhen(r[2], v.now, v.lang)),
      h('span', { className: 'c-back' }, k('col_back'), r[3] === null ? '—' : stamp(r[3], r[2], v.lang)),
      h('span', { className: 'c-dur' }, fmtDuration((r[3] ?? v.now) - r[2], v.lang)),
      h('span', { className: 'c-type' }, h('span', { className: `pill ${pill.cls}` }, pill.text)))
  }
  log.replaceChildren(
    h('div', { className: 'lr h' }, ...['col_apartment', 'col_off', 'col_back', 'col_duration', 'col_type'].map(x => h('span', null, t(v.lang, x)))),
    ...(rows.length ? (v.showAll ? rows : rows.slice(0, 8)).map(row) : [h('div', { className: 'lr' }, t(v.lang, 'no_data'))]),
    !v.showAll && rows.length > 8 && h('button', { className: 'more' }, t(v.lang, 'show_all', { n: rows.length })))
}
