// Prints SQL for 40 days of realistic fake spans up to now. Local dev only: npm run seed:local
const DAY = 86_400, H = 3600
// shortcut: UTC hours stand in for Kyiv schedule hours; fine for fake data
const OFF = { centralna: [[6, 10], [16, 19]], rayduzhna: [[10, 14], [20, 23]] }
// [day, variation]: the first on-period ending on or after that day gets it
const SEVENTH = [0, 7, 14, 21, 28, 35].map(d => [d, 'gap'])
const VARIETY = { centralna: [...SEVENTH, [12, 'reboot']], rayduzhna: [...SEVENTH, [18, 'alive'], [25, 'poweroff']] }

const now = Math.floor(Date.now() / 1000)
const day0 = Math.floor(now / DAY) * DAY - 39 * DAY
const jitter = () => Math.round((Math.random() * 2 - 1) * 600)

// off windows that have started by now, each skipped with probability 0.3
function windows(hours) {
  const out = []
  for (let d = 0; d < 40; d++) {
    for (const [a, b] of hours) {
      if (Math.random() < 0.3) continue
      const start = day0 + d * DAY + a * H + jitter()
      if (start >= now) return out
      out.push({ d, start, end: day0 + d * DAY + b * H + jitter() })
    }
  }
  return out
}

const span = (boot_id, boot_at, first_seen, last_seen, extra = {}) => ({ boot_id, boot_at, first_seen, last_seen, alive_until: null, shutdown: 'none', ...extra })

// one on-period [boot_at, end] as spans; `end` is the next window start, or now for the newest
function onPeriod(variation, boot_at, end) {
  const boot = crypto.randomUUID(), fs = boot_at + 45
  const mid = fs + Math.floor((end - fs) / 3)
  switch (variation) {
    case 'gap': return [span(boot, boot_at, fs, mid), span(boot, boot_at, mid + 20 * 60, end)]
    case 'reboot': return [span(boot, boot_at, fs, mid, { shutdown: 'reboot' }), span(crypto.randomUUID(), mid + 50, mid + 95, end)]
    case 'poweroff': return [span(boot, boot_at, fs, mid, { shutdown: 'poweroff' }), span(crypto.randomUUID(), mid + 3 * H, mid + 3 * H + 45, end)]
    case 'alive': return [span(boot, boot_at, fs, end - 2 * H, { alive_until: end })]
    default: return [span(boot, boot_at, fs, end)]
  }
}

const rows = []
for (const [device, hours] of Object.entries(OFF)) {
  const ws = windows(hours)
  const pending = VARIETY[device].sort((a, b) => a[0] - b[0])
  const starts = [day0, ...ws.map(w => w.end)], ends = [...ws.map(w => w.start), now]
  for (let i = 0; i < starts.length; i++) {
    // now inside a window: the device is not back yet, so the cut is ongoing
    if (starts[i] + 45 > now) break
    const day = ws[i]?.d ?? 39, k = pending.findIndex(([d]) => d <= day)
    let spans = onPeriod('none', starts[i], ends[i])
    if (k >= 0) {
      const v = onPeriod(pending[k][1], starts[i], ends[i])
      // 'alive' needs a real window after it, and every variation must fit the on-period
      if ((ws[i] || pending[k][1] !== 'alive') && v.every(s => s.first_seen <= s.last_seen)) {
        spans = v
        pending.splice(k, 1)
      }
    }
    for (const s of spans) rows.push({ device, ...s })
  }
}

console.log('DELETE FROM span;')
for (const r of rows) {
  console.log(`INSERT INTO span (device, boot_id, boot_at, first_seen, last_seen, alive_until, shutdown) VALUES ('${r.device}', '${r.boot_id}', ${r.boot_at}, ${r.first_seen}, ${r.last_seen}, ${r.alive_until ?? 'NULL'}, '${r.shutdown}');`)
}
console.log(`-- ${rows.length} spans`)
