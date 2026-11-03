// Power-cut tracker widget for Scriptable (https://docs.scriptable.app). Install: widget/README.md
const API = 'https://uptime-api.denyslebiediev.com', SITE = 'https://denyslebiediev.com/uptime/', CACHE_FILE = 'uptime-status.json'
const COL = 138 // 2 × 138 + 16 fits the narrowest medium widget (321 pt, iPhone SE) minus 14 pt padding per side
const UK = Device.language().startsWith('uk')
const L = UK ? { brand: 'Світло', asOf: 'станом на', offline: 'офлайн', since: 'з', todayOff: 'Сьогодні без світла',
  probably: 'ймовірно, немає світла', family: 'Оберіть малий, середній або віджет екрана блокування',
  noData: 'Ще немає даних. Відкрийте Scriptable з інтернетом.', on: 'Світло є', no_signal: "Немає зв'язку",
  rebooting: 'Перезапуск', device_off: 'Вимкнено', stale: 'Перевірте пристрій', unknown: 'Очікуємо перший сигнал' }
  : { brand: 'Power', asOf: 'as of', offline: 'offline', since: 'since', todayOff: 'Today off',
  probably: 'probably a power cut', family: 'Use small, medium or lock-screen',
  noData: 'No data yet. Open Scriptable while online.', on: 'Power on', no_signal: 'No signal',
  rebooting: 'Rebooting', device_off: 'Switched off', stale: 'Check the device', unknown: 'Waiting for the first signal' }
const dyn = (l, d) => Color.dynamic(new Color(l), new Color(d))
const C = { bg: dyn('#ffffff', '#111419'), text: dyn('#15171c', '#e9ecf2'), muted: dyn('#70747d', '#8b92a3'),
  on: dyn('#0f9f5a', '#34d399'), off: dyn('#dc3d43', '#fb7185'), warn: dyn('#e0a100', '#fbbf24') }
const STATES = { on: ['bolt.fill', C.on], no_signal: ['bolt.slash.fill', C.off], rebooting: ['arrow.clockwise', C.muted],
  device_off: ['power', C.muted], stale: ['exclamationmark.triangle', C.warn], unknown: ['hourglass', C.muted] }
// DrawContext ignores Color.dynamic (docs.scriptable.app/color), so the bar uses colors that read on #fff and #111419
const BAR = { on: new Color('#30a46c', 0.5), future: new Color('#8b92a3', 0.25), power_off: new Color('#e5484d'), no_signal: new Color('#e5484d'),
  no_connection: new Color('#e0a100'), reboot: new Color('#8b92a3'), device_off: new Color('#8b92a3') }

// Only network and cache code. Failure never writes the cache (Review Focus 1).
async function load() {
  const fm = FileManager.local(), file = fm.joinPath(fm.libraryDirectory(), CACHE_FILE)
  try {
    const r = new Request(API + '/status')
    r.timeoutInterval = 8
    const data = await r.loadJSON()
    if (r.response.statusCode !== 200 || !data || typeof data.now !== 'number' || typeof data.day !== 'object' || data.day === null || !Array.isArray(data.devices)) throw new Error('bad response')
    fm.writeString(file, JSON.stringify(data))
    return { data, offline: false }
  } catch (e) {
    if (!fm.fileExists(file)) return null
    try { return { data: JSON.parse(fm.readString(file)), offline: true } } catch (_) { return null } // a cut-off cache write shows "No data yet", not a SyntaxError
  }
}

const stateKey = d => d.state === 'no_signal' && d.flags.includes('stale') ? 'stale' : d.state

// Kyiv time whatever zone the phone is in (Review Focus 4)
const mkTime = tz => new Intl.DateTimeFormat(UK ? 'uk-UA' : 'en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
let TIME
try { TIME = mkTime('Europe/Kyiv') } catch (e) { TIME = mkTime('Europe/Kiev') }
const hhmm = t => TIME.format(t * 1000)

function fmtDur(sec) {
  const m = Math.floor(Math.max(0, sec) / 60), h = Math.floor(m / 60), mm = String(m % 60).padStart(2, '0')
  return UK ? (h > 0 ? `${h} год ${mm} хв` : `${m} хв`) : (h > 0 ? `${h}h ${mm}m` : `${m}m`)
}

const todayOff = (d, now) => d.today.reduce((s, [a, b, k]) => k === 'power_off' || k === 'no_signal' ? s + (b ?? now) - a : s, 0)
const asOf = (data, offline) => `${offline ? L.offline + ' · ' : ''}${L.asOf} ${hhmm(data.now)}`

function addIcon(s, key, size) {
  const sym = SFSymbol.named(STATES[key][0])
  if (!sym) return
  sym.applyFont(Font.semiboldSystemFont(size))
  const img = s.addImage(sym.image)
  img.imageSize = new Size(size, size)
  img.tintColor = STATES[key][1]
}

function addLive(s, d, font) {
  if (d.since === null) return
  const t = s.addDate(new Date(d.since * 1000))
  t.applyRelativeStyle()
  t.font = font
  t.lineLimit = 1
  t.minimumScaleFactor = 0.6
}

function barImage(d, data) {
  const ctx = new DrawContext(), { start, end } = data.day
  ctx.size = new Size(COL, 7)
  ctx.opaque = false
  ctx.respectScreenScale = true
  const x = t => Math.min(Math.max((t - start) / (end - start), 0), 1) * COL
  const rect = (a, b, c) => { ctx.setFillColor(c); ctx.fillRect(new Rect(a, 0, Math.max(b - a, 1), 7)) }
  const p = new Path()
  p.addRoundedRect(new Rect(0, 0, COL, 7), 3, 3)
  ctx.setFillColor(BAR.future)
  ctx.addPath(p)
  ctx.fillPath()
  rect(0, x(data.now), BAR.on)
  for (const [a, b, k] of d.today) rect(x(a), x(b ?? data.now), BAR[k])
  return ctx.getImage()
}

function txt(s, str, size, color, weight) {
  const t = s.addText(str)
  t.font = weight === 'bold' ? Font.boldSystemFont(size) : weight === 'semi' ? Font.semiboldSystemFont(size) : Font.systemFont(size)
  t.textColor = color
  t.lineLimit = 1
  t.minimumScaleFactor = 0.6
  return t
}

function newWidget(fam) {
  const w = new ListWidget()
  w.url = SITE
  w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000)
  if (fam.startsWith('accessory')) { w.addAccessoryWidgetBackground = true; w.setPadding(4, 8, 4, 8) }
  else { w.backgroundColor = C.bg; w.setPadding(14, 14, 14, 14) }
  return w
}

function message(w, text) {
  const t = w.addText(text)
  t.font = Font.systemFont(13)
  t.minimumScaleFactor = 0.6
}

function small(w, data, offline) {
  const h = w.addStack()
  h.centerAlignContent()
  txt(h, L.brand, 12, C.text, 'bold')
  h.addSpacer()
  txt(h, asOf(data, offline), 10.5, C.muted)
  w.addSpacer()
  data.devices.forEach((d, i) => {
    if (i) w.addSpacer(10)
    const key = stateKey(d), top = w.addStack()
    top.centerAlignContent()
    addIcon(top, key, 11)
    top.addSpacer(4)
    txt(top, d.name[UK ? 'uk' : 'en'], 11, C.muted)
    const row = w.addStack()
    row.centerAlignContent()
    txt(row, L[key], 13, STATES[key][1], 'semi')
    row.addSpacer(4)
    if (key !== 'unknown') addLive(row, d, Font.semiboldSystemFont(17))
  })
}

function medium(w, data, offline) {
  const cols = w.addStack()
  data.devices.forEach((d, i) => {
    if (i) cols.addSpacer()
    const key = stateKey(d), s = cols.addStack()
    s.layoutVertically()
    s.size = new Size(COL, 0)
    const top = s.addStack()
    top.centerAlignContent()
    addIcon(top, key, 12)
    top.addSpacer(4)
    txt(top, d.name[UK ? 'uk' : 'en'], 11, C.muted)
    s.addSpacer(6)
    txt(s, L[key], 12, STATES[key][1], 'semi')
    if (key !== 'unknown') {
      addLive(s, d, Font.semiboldSystemFont(24))
      txt(s, `${L.since} ${hhmm(d.since)}` + (key === 'no_signal' ? ` · ${L.probably}` : ''), 11, C.muted)
    }
    s.addSpacer()
    if (key !== 'unknown') {
      s.addImage(barImage(d, data)).imageSize = new Size(COL, 7)
      s.addSpacer(4)
      txt(s, `${L.todayOff} ${fmtDur(todayOff(d, data.now))}`, 10.5, C.muted)
    }
  })
  w.addSpacer(6)
  txt(w, asOf(data, offline), 10, C.muted)
}

function lock(w, data, offline) {
  for (const d of data.devices) {
    const key = stateKey(d), row = w.addStack()
    row.centerAlignContent()
    addIcon(row, key, 12)
    row.addSpacer(4)
    txt(row, `${d.short[UK ? 'uk' : 'en']} · ${L[key]}`, 13, C.text, 'semi')
    row.addSpacer()
    if (key !== 'unknown') addLive(row, d, Font.boldSystemFont(13))
  }
  txt(w, asOf(data, offline), 10, C.text)
}

const FAMILIES = { small, medium, accessoryRectangular: lock }
const fam = config.widgetFamily ?? 'medium'
let w = newWidget(fam)
try {
  if (!FAMILIES[fam]) message(w, L.family)
  else {
    const got = await load()
    if (got) FAMILIES[fam](w, got.data, got.offline)
    else message(w, L.noData)
  }
} catch (e) {
  w = newWidget(fam)
  message(w, String(e))
}
config.runsInWidget ? Script.setWidget(w) : await w.presentMedium()
Script.complete()
