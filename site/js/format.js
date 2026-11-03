import { TZ, periodBounds } from './time.js'
import { LOCALE, t } from './i18n.js'

const fmt = (locale, opts) => new Intl.DateTimeFormat(locale, { timeZone: TZ, ...opts })
const z = n => String(n).padStart(2, '0')

/** Whole minutes, floored (a live counter must not run ahead): "5h 12m" / "5 год 12 хв". */
export function fmtDuration(sec, lang) {
  const m = Math.floor(Math.max(0, sec) / 60), h = Math.floor(m / 60)
  const [hu, mu] = lang === 'uk' ? ['год', 'хв'] : ['h', 'm']
  return h > 0 ? (lang === 'uk' ? `${h} ${hu} ${z(m % 60)} ${mu}` : `${h}${hu} ${z(m % 60)}${mu}`) : (lang === 'uk' ? `${m} ${mu}` : `${m}${mu}`)
}

export const fmtTime = ts => fmt('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ts * 1000)
export const fmtDay = (ts, lang) => fmt(LOCALE[lang], { weekday: 'short', day: 'numeric', month: 'short' }).format(ts * 1000)
export const fmtDate = (ts, lang) => fmt(LOCALE[lang], { day: 'numeric', month: 'short' }).format(ts * 1000)
export const fmtWeekday = (ts, lang) => fmt(LOCALE[lang], { weekday: 'short' }).format(ts * 1000)
export const fmtMonth = (ts, lang) => fmt(LOCALE[lang], { month: 'long', year: 'numeric' }).format(ts * 1000)

/** "14:05" when ts is on ref's Kyiv day, else "Sun 1 Nov, 23:59". */
export const stamp = (ts, ref, lang) =>
  periodBounds('day', ts).start === periodBounds('day', ref).start ? fmtTime(ts) : `${fmtDay(ts, lang)}, ${fmtTime(ts)}`

/** @param {number} x 0...1 */
export const fmtPct = (x, lang) => new Intl.NumberFormat(LOCALE[lang], { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(x)
export const fmtNum = (x, lang, digits = 1) => new Intl.NumberFormat(LOCALE[lang], { maximumFractionDigits: digits }).format(x)

// 'today' | 'yesterday' | null, by Kyiv day (never now - 86400)
function relDay(ts, now) {
  const today = periodBounds('day', now), start = periodBounds('day', ts).start
  if (start === today.start) return 'today'
  return start === periodBounds('day', today.start - 1).start ? 'yesterday' : null
}

export function fmtWhen(ts, now, lang) {
  const rel = relDay(ts, now)
  return `${rel ? t(lang, rel) : fmtDay(ts, lang)}, ${fmtTime(ts)}`
}

/** @param {'day' | 'week' | 'month'} kind */
export function fmtPeriod(kind, { start, end }, now, lang) {
  if (kind === 'day') {
    const rel = relDay(start, now)
    return rel ? `${t(lang, rel)} · ${fmtDate(start, lang)}` : fmtDay(start, lang)
  }
  if (kind === 'week') return `${fmtDate(start, lang)} – ${fmtDate(end - 1, lang)}`
  return now >= start && now < end ? `${fmtMonth(start, lang)} · ${t(lang, 'so_far')}` : fmtMonth(start, lang)
}
