# Scriptable widget

Small, medium and lock-screen (rectangular) widget for the iPhone. It reads `GET /status` and caches the last good answer.

## Install

1. In the Files app, copy `uptime.js` into iCloud Drive › Scriptable.
2. Run `uptime` once in Scriptable: it shows the medium preview and fills the cache.
3. Long-press the Home Screen › + › Scriptable › small or medium › Add, then long-press the widget › Edit Widget › Script: `uptime`.
4. Lock screen: long-press the Lock Screen › Customize › Lock Screen › add Scriptable (rectangular) › Script: `uptime`.

## Checklist

| # | Action | Expected |
|---|---|---|
| 1 | Run `uptime` in Scriptable while online | Medium preview: icon, word, live duration, `since HH:MM`, a bar with a grey future part, `Today off …`, `as of HH:MM` = now in Kyiv time |
| 2 | Add small, medium and lock-screen rectangular widgets; tap each one | Layout as in the mockup; lock screen: one row per apartment plus the `as of` line, no bar. Each tap opens `https://uptime.denyslebiediev.com/` |
| 3 | Add a large widget | `Use small, medium or lock-screen`, wrapped, no crash |
| 4 | Watch for 2 min | Durations count up; `since` and `as of` stay fixed |
| 5 | Switch light ↔ dark | Background and text switch; bar segments visible in both |
| 6 | Tinted Home Screen (Edit › Customize › Tinted) | Icons and words readable; bar segments show as different shades |
| 7 | Airplane mode: run in Scriptable, then check the lock screen after its next refresh | Cached data with `offline · as of HH:MM` on every family |
| 8 | Online: set `API` to `https://uptime-api.denyslebiediev.com/x` (404), run; then to `https://example.com/?` (200, HTML), run; undo, run | Both edits: `offline · as of …` with the cached data. After the undo: a fresh `as of` |
| 9 | Airplane mode with `CACHE_FILE = 'none.json'`, run, then undo | `No data yet. Open Scriptable while online.` |
| 10 | Switch the iPhone language between Українська and English | Labels and names switch (`Центральна 50`, `Центральна`); iOS localizes the durations; lock-screen rows not cut off with `…` |
| 11 | Settings › General › Date & Time: turn off Set Automatically, Time Zone London, run, then undo | `since` and `as of` still match the site (Kyiv time), not the phone clock |
| 12 | While a device has no heartbeat yet | `Waiting for the first signal` / `Очікуємо перший сигнал`, hourglass icon, no duration |
| 13 | Online: right after `const got = await load()` add `got.data.devices[0].state = 'rebooting'; Object.assign(got.data.devices[1], { state: 'no_signal', flags: ['stale'] })`, run, then undo | Column 1: `arrow.clockwise` + `Rebooting`; column 2: `exclamationmark.triangle` + `Check the device`, no `probably a power cut`; no crash |
