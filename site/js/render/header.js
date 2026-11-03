// DOM helpers plus the header: live pulse, offline banner and headline sentence.
import { t } from '../i18n.js'
import { fmtDuration, fmtDays, stamp } from '../format.js'

/** @typedef {import('../api.js').StatusDevice} StatusDevice */

/**
 * Builds an element. API text enters only as a string kid (a text node), never as HTML.
 * @param {string} tag @param {{ className?: string, style?: Record<string, string>, dataset?: Record<string, string>, [attr: string]: any } | null} [props]
 * @param {...(Node | string | number | null | false)} kids @returns {HTMLElement}
 */
export function h(tag, props, ...kids) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null) continue
    if (k === 'className') el.className = v
    else if (k === 'style') for (const [p, x] of Object.entries(v)) el.style.setProperty(p, x)
    else if (k === 'dataset') Object.assign(el.dataset, v)
    else el.setAttribute(k, v)
  }
  el.append(...kids.filter(x => x !== null && x !== false))
  return el
}

/** @param {'on' | 'off' | 'reboot' | 'power' | 'warn' | 'wait'} name @returns {SVGElement} */
export const icon = name => document.getElementById('icons').content.querySelector(`[data-i="${name}"]`).cloneNode(true)

export const bannerText = (asOf, now, lang) => asOf === null ? t(lang, 'offline_empty') : t(lang, 'offline', { time: stamp(asOf, now, lang) })

/** @param {StatusDevice[]} devices @returns {{ text: string, tone: 'ok' | 'bad' | '' }[]} */
export function headline(devices, now, lang) {
  const all = state => devices.length >= 2 && devices.every(d => d.state === state)
  if (all('on')) return [{ text: t(lang, 'lede_all_on'), tone: 'ok' }]
  if (all('no_signal') && !devices.some(d => d.flags.includes('stale'))) return [{ text: t(lang, 'lede_all_no_signal'), tone: 'bad' }]
  return devices.map(d => {
    const name = d.name[lang]
    if (d.state === 'on') return { text: t(lang, 'lede_on', { name }), tone: 'ok' }
    if (d.state === 'no_signal') {
      const stale = d.flags.includes('stale')
      return { text: t(lang, stale ? 'lede_stale' : 'lede_no_signal', { name, dur: (stale ? fmtDays : fmtDuration)(now - d.since, lang) }), tone: 'bad' }
    }
    return { text: t(lang, `lede_${d.state}`, { name }), tone: '' }
  })
}

/** @param {HTMLElement} el the `.in` wrapper @param {import('../app.js').View} v */
export function renderHeader(el, v) {
  const live = el.querySelector('#live'), banner = el.querySelector('#banner')
  live.classList.toggle('off', !v.ok)
  live.querySelector('.txt').textContent = v.ok && v.status ? t(v.lang, 'live', { s: v.agoSec }) : ''
  const text = v.ok ? '' : bannerText(v.asOf, v.now, v.lang)
  banner.hidden = v.ok
  if (banner.textContent !== text) banner.textContent = text // a role=status region re-announces every write
  const parts = v.status ? headline(v.status.devices, v.now, v.lang) : []
  el.querySelector('#lede').replaceChildren(...parts.flatMap((p, i) => [i ? ' ' : '', h('span', { className: p.tone }, p.text)]))
}
