// CSV export of /events rows (spec §8 "CSV columns").
import { kyivIso } from './time.js'

/** @typedef {import('./stats.js').Events} Events */
/** @typedef {import('./i18n.js').Lang} Lang */

const utc = t => new Date(t * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')
const field = v => /[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v

/** BOM so Excel reads Cyrillic as UTF-8; CRLF after every line. @param {Events} ev @param {Lang} lang @param {string | null} [device] */
export function toCsv(ev, lang, device = null) {
  const rows = ev.iv.filter(r => device === null || r[0] === device).map(([id, kind, s, e, flags]) => [
    ev.devices.find(d => d.id === id)?.name?.[lang] ?? id, kind, kyivIso(s), e === null ? '' : kyivIso(e),
    Math.round(((e ?? ev.now) - s) / 60), utc(s), e === null ? '' : utc(e), flags.join(';'),
  ].map(x => field(String(x))).join(','))
  return '\uFEFF' + ['apartment,kind,start_kyiv,end_kyiv,duration_min,start_utc,end_utc,flags', ...rows].map(l => l + '\r\n').join('')
}
