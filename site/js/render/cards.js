// The two live status cards: state, live duration, today's bar and the off-time totals.
import { t } from '../i18n.js'
import { periodBounds } from '../time.js'
import { fmtDuration, stamp } from '../format.js'
import { periodStats } from '../stats.js'
import { h, icon } from './header.js'

/** @typedef {import('../api.js').StatusDevice} StatusDevice */
/** @typedef {import('../stats.js').Seg} Seg */

const ICON = { on: 'on', no_signal: 'off', rebooting: 'reboot', device_off: 'power', unknown: 'wait' }
const SG = { power_off: 'off', no_signal: 'off', no_connection: 'net', reboot: 'reboot', device_off: 'reboot' }
const isOff = kind => kind === 'power_off' || kind === 'no_signal'

/** Icon plus word for every state, so it never relies on colour alone. @param {StatusDevice} d */
export function stateView(d, now, lang) {
  const cut = d.state === 'no_signal', stale = d.flags.includes('stale')
  return {
    tone: d.state === 'on' ? 'on' : cut ? 'off' : 'muted',
    icon: cut && stale ? 'warn' : ICON[d.state],
    word: t(lang, `state_${d.state}`),
    note: cut ? t(lang, stale ? 'check_device' : 'probably_cut') : null,
    dur: d.since === null ? '—' : fmtDuration(now - d.since, lang),
    since: d.since === null ? null : stamp(d.since, now, lang),
  }
}

/** Seconds of power_off + no_signal. @param {Seg[]} segs */
export const dayOff = segs => segs.reduce((n, s) => n + (isOff(s.kind) ? s.end - s.start : 0), 0)

/**
 * One day's bar over [start, end) (23, 24 or 25 h). Before firstSeen it is "no data", never "powered".
 * @param {Seg[]} segs @param {number | null} [firstSeen] @returns {HTMLElement}
 */
export function track(segs, start, end, now, name, lang, firstSeen = start) {
  const pct = x => (x / (end - start)) * 100
  const mark = (cls, a, b, tip) => h('i', {
    className: `sg ${cls}`, style: { left: `${pct(a - start)}%`, width: `${Math.max(pct(b - a), .45)}%` }, dataset: { tip }, role: 'img', 'aria-label': tip,
  })
  const noData = Math.min(firstSeen ?? end, end)
  return h('div', { className: 'track' },
    noData > start && mark('nd', start, noData, t(lang, 'no_data')),
    ...segs.map(s => mark(SG[s.kind], s.start, s.end,
      `${name} · ${t(lang, 'kind_' + s.kind)} · ${stamp(s.start, start, lang)} – ${s.ongoing ? t(lang, 'now') : stamp(s.end, start, lang)} (${fmtDuration(s.end - s.start, lang)})`)),
    now < end && h('i', { className: 'sg fut', style: { left: `${pct(now - start)}%`, width: `${pct(end - now)}%` } }),
    now < end && h('i', { className: 'now', style: { left: `${pct(now - start)}%` } }))
}

/** @param {HTMLElement} el `#cards` @param {import('../app.js').View} v */
export function renderCards(el, v) {
  if (!v.status) return el.replaceChildren()
  const { day, devices } = v.status, week = periodBounds('week', v.now)
  el.replaceChildren(...devices.map(d => {
    const s = stateView(d, v.now, v.lang), name = d.name[v.lang]
    const segs = d.today.map(([a, b, kind]) => ({ kind, start: a, end: b ?? v.now, ongoing: b === null, flags: [] }))
    // until /events loads, a device with no heartbeats must not be drawn as powered
    const firstSeen = v.ev ? v.ev.devices.find(x => x.id === d.id)?.first_seen ?? null : d.state === 'unknown' ? null : day.start
    const weekOff = v.ev ? fmtDuration(periodStats(v.ev, d.id, week.start, week.end).off, v.lang) : '—'
    return h('div', { className: `scard ${s.tone}` },
      h('div', { className: 'row' }, h('span', { className: 'dot' }), name),
      h('div', { className: 'state' }, icon(s.icon), s.word, s.note && h('small', null, s.note)),
      h('div', { className: 'dur' }, s.dur, s.since && h('small', null, t(v.lang, 'since', { time: s.since }))),
      track(segs, day.start, day.end, v.now, name, v.lang, firstSeen),
      h('div', { className: 'ticks' }, ...['00', '06', '12', '18', '24'].map(x => h('span', null, x))),
      h('div', { className: 'mini' },
        h('span', null, t(v.lang, 'today_off'), ' ', h('b', null, fmtDuration(dayOff(segs), v.lang))),
        h('span', null, t(v.lang, 'week_off'), ' ', h('b', null, weekOff))))
  }))
}
