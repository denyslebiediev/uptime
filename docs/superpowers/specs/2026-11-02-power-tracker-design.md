# Power-cut tracker ("uptime") — design

Date: 2026-11-02 · Status: draft, awaiting owner approval

Approved visual mockups (open in a browser; they are self-contained fragments from the design session):
`mockups/site.html` (website) and `mockups/widget.html` (iOS widget).

---

## 1. Why

The owner has two apartments in Ukraine — **Центральна 50 / Centralna 50** and **Райдужна 71 / Rayduzhna 71** — with frequent power cuts. They want to know, at a glance, **where there is electricity right now**, and to keep an honest history: when the power went off, when it came back, and how many hours each place was without power per day, week and month.

Each apartment has a Raspberry Pi with **no UPS**, so "the Pi is alive" ⇔ "there is electricity". The Pi cannot announce that power is going away, so the system is a dead-man switch: the Pi checks in, and silence means trouble.

Success = the owner glances at the iPhone widget and trusts it, and the website's numbers match what they lived through.

## 2. Goals, non-goals, anti-goals

**Goals**
- Live status per apartment on an iOS Scriptable widget (small, medium, lock-screen rectangular) and on a public website.
- Accurate history: outage start within ~30 s, power-back time within a few seconds, totals per day/week/month in Kyiv time.
- Tell apart: power cut · no connection while powered · planned reboot · device deliberately switched off.
- Premium, responsive website (PC, iPad, iPhone), Light/Dark/Auto with a switch, Ukrainian/English with a switch.
- Stay inside the Workers Paid plan's included quotas (expected usage ≈ 2 % of requests, < 1 % of D1).

**Non-goals** (owner said "I just want to be informed")
- Push notifications, Telegram bots, e-mail alerts.
- Internet-quality monitoring, more than a handful of devices, user accounts, an admin UI.
- Overlaying official outage schedules (DTEK queues).

**Anti-goals** — failure even if everything "works"
- An internet outage counted as hours without power.
- A planned reboot or deliberate shutdown counted as a power cut.
- The widget or site confidently showing a stale state without saying how old it is.
- A device token leaking (the repo is public).
- A blank or crashing widget.

## 3. Constraints

- **No UPS** → dead-man switch only.
- **No public IP at either location** (CGNAT; one Pi already runs a Cloudflare Tunnel) → devices only make outbound HTTPS requests.
- **Pi has no real-time clock** (Pi 3/4; Pi 5 without battery) → the Pi's wall clock is never trusted; all timestamps are the Worker's receive time. After boot, HTTPS may fail with "certificate not yet valid" until NTP syncs (seconds); the 30 s retry loop absorbs it. Never use `curl -k`.
- **Cloudflare Workers Paid plan** ($5/mo). DNS for `denyslebiediev.com` is already on Cloudflare.
- **GitHub Pages, public repo** (free plan) → all code public; secrets never committed.
- The site has its own custom domain **https://uptime.denyslebiediev.com/** (Cloudflare CNAME `uptime` → `denyslebiediev.github.io`, DNS only); the old `denyslebiediev.com/uptime/` address redirects there. Asset paths stay relative.
- **Europe/Kyiv** time with DST (23 h and 25 h days). Older iOS knows only `Europe/Kiev`; fall back to it.
- iOS decides when widgets refresh (realistically every 15–60 min) → the widget must say "as of HH:MM".
- Lock-screen widgets are rendered in one color → state must be an icon + word, never color alone.

## 4. Architecture

```
 Pi "centralna" ─┐  POST /hb every 30 s (bearer token)
 Pi "rayduzhna" ─┴──────────────►  Cloudflare Worker  ◄──► D1 (one table: span)
                                   uptime-api.denyslebiediev.com
 Website (GitHub Pages) ── GET /events, GET /status ──┘ ▲
 iOS widget (Scriptable) ─ GET /status ─────────────────┘
```

Monorepo `uptime` at `~/git/personal/uptime` (GitHub: `denyslebiediev/uptime`, public):

| Folder | Contents |
|---|---|
| `worker/` | Cloudflare Worker (TypeScript), `wrangler.jsonc`, D1 migrations, Vitest tests |
| `pi/` | heartbeat script, systemd units, `install.sh`, setup guide (`pi/README.md`) |
| `site/` | static website: `index.html`, CSS, native ES modules; no build step |
| `widget/` | one Scriptable script + install notes |
| `docs/` | this design, the plan, mockups |

No cron, no KV, no Durable Objects: status is computed on read.

## 5. How outages are detected (the core)

### 5.1 What the Pi sends

Every 30 s, a JSON body (≤ 512 bytes) with a fresh reading taken right before sending:

| Field | Meaning |
|---|---|
| `boot` | `/proc/sys/kernel/random/boot_id` (UUID, changes every boot) |
| `up` | first number of `/proc/uptime` (seconds since kernel start; immune to clock jumps) |
| `ev` | optional: `"reboot"` or `"poweroff"`, sent only by the shutdown hook |
| `pb`, `pu`, `pc` | optional "previous boot report" from the local state file (§6.3): previous `boot_id`, last uptime known alive, clean-shutdown marker (`none`/`reboot`/`poweroff`) |

The device identity comes **only** from the bearer token; any device field in the body is ignored. Any timestamp in the body is ignored.

### 5.2 What the Worker stores

One D1 table. A **span** is a run of heartbeats from one boot with no gap longer than **GAP = 120 s**.

```sql
CREATE TABLE span (
  id          INTEGER PRIMARY KEY,
  device      TEXT    NOT NULL,           -- 'centralna' | 'rayduzhna'
  boot_id     TEXT    NOT NULL,
  boot_at     INTEGER NOT NULL,           -- unix s, MIN(receive_time - up) over this boot
  first_seen  INTEGER NOT NULL,           -- unix s, Worker receive time
  last_seen   INTEGER NOT NULL,           -- unix s, Worker receive time
  alive_until INTEGER,                    -- unix s, from the next boot's previous-boot report
  shutdown    TEXT    NOT NULL DEFAULT 'none'  -- 'none' | 'reboot' | 'poweroff'
);
-- index must not be touched by the per-heartbeat UPDATE (each updated index = +1 row written)
CREATE INDEX span_device_id ON span(device, id);
```

Raw heartbeats and derived events are **not** stored. Intervals are derived on read by one pure function, so rule changes need no data migration and late information (§5.4) corrects history automatically. Devices and their display names live in Worker config, not in D1.

### 5.3 Heartbeat rules (each is a test case)

`now` = Worker receive time (unix s). `L` = the device's latest span.

1. **Server time only.** No timestamp from the Pi is ever stored.
2. **Write cap.** Same `boot` as `L`, `now − L.last_seen < 10`, no `ev` → `204`, no write.
3. **Same boot, continuous.** Same `boot`, `now − L.last_seen ≤ 120` → update `last_seen = now`, `boot_at = MIN(boot_at, now − up)`, `shutdown = ev ?? 'none'` (so a normal heartbeat clears a stale shutdown marker).
4. **Same boot, after a gap.** Same `boot`, gap `> 120` → insert a new span with the same `boot_id` and `boot_at`. Derived: *no connection* for the gap, zero hours without power.
5. **New boot.** Different `boot` → insert a span with `boot_at = MAX(now − up, L.last_seen)`. If `now − up < L.last_seen − 30` the packet is stale or bogus → `409`, nothing written. First-ever heartbeat of a device just inserts.
6. **Previous-boot report** (processed only together with rule 5). If `pb == L.boot_id`: `L.alive_until = clamp(L.boot_at + pu, L.last_seen, new.boot_at)` and `L.shutdown = pc` if `L.shutdown == 'none'`. Otherwise ignore. Idempotent.
7. **Blips.** A `boot` change always yields an interval (power off / reboot), even if the gap was shorter than 120 s and the live status never showed "no signal".

### 5.4 Deriving intervals between consecutive spans `A → B`

Same boot (`A.boot_id == B.boot_id`): **no_connection** `[A.last_seen, B.first_seen]`.

New boot:
- `back = clamp(B.boot_at, A.last_seen, B.first_seen)` — the kernel started (power returned a few seconds earlier).
- `gone = clamp(A.alive_until ?? A.last_seen, A.last_seen, back)` — last moment the Pi is known alive.
- **no_connection** `[A.last_seen, gone]` if non-empty (internet was down before the power went).
- Then for `[gone, back]`:
  - `A.shutdown == 'reboot'` and `back − gone ≤ 600` → **reboot**
  - `A.shutdown == 'poweroff'` → **device_off** (deliberately switched off; not a power cut)
  - otherwise → **power_off** (flag `after_shutdown` if `A.shutdown == 'reboot'`)
- **no_connection** `[back, B.first_seen]` if non-empty, flagged `connecting` (router/ISP coming back).

Trailing (after the latest span), live:
- `now − L.last_seen ≤ 120` → **on**, since `boot_at` of the current boot.
- `L.shutdown == 'reboot'` and `now − L.last_seen ≤ 600` → **rebooting**.
- `L.shutdown == 'poweroff'` → **device_off**.
- else **no_signal** since `L.last_seen`: an open interval (`end = null`), counted in stats as **provisional power_off**. Past 24 h, also flag `stale` ("no signal for N days — check the device").

All durations are clamped to ≥ 0. Interval kinds exposed by the API: `power_off`, `no_connection`, `reboot`, `device_off`, `no_signal` (open). Flags: `provisional`, `connecting`, `after_shutdown`, `stale`.

**Live wording for `no_signal`** (agreed in the design conversation): the state word is **"No signal" / "Немає зв'язку"** with the power-off icon, plus the qualifier **"probably a power cut" / "ймовірно, немає світла"** wherever there is room (site cards, headline, medium widget). It is never labelled a confirmed "No power" while it is still ambiguous; history settles it once the Pi reports back.

### 5.5 Precision and known limits (state these honestly in the UI footer)
- Power-off time is the last heartbeat received → up to 30 s early.
- Power-back time is kernel start → a few seconds late.
- Several power cycles during one long internet outage collapse into one cut (intermediate boots are invisible).
- A kernel crash looks like a short power cut (the hardware watchdog keeps it short instead of hours).
- If the internet stays down after power returns, the live status says "no signal" until the Pi reconnects; history then corrects itself.

## 6. Raspberry Pi client (`pi/`)

### 6.1 Heartbeat service
- Bash script `/usr/local/bin/uptime-hb` (~40 lines), run by `uptime-hb.service` (`Restart=always`, `RestartSec=5`, `Wants=`/`After=network-online.target`).
- Loop: read `boot_id` and a fresh `/proc/uptime`; `curl -fsS --connect-timeout 5 --max-time 10 -H @/etc/uptime-hb/auth -H 'Content-Type: application/json' --data … https://uptime-api.denyslebiediev.com/hb`; sleep 30. (Not `--json`, which needs curl ≥ 7.82 and the existing Pi may be older.) No `curl --retry` (a retried body carries a stale uptime). Requests never overlap.
- Log only on state changes (ok → failing → ok), not every 30 s.
- Config `/etc/uptime-hb/env` (device URL) and `/etc/uptime-hb/auth` (`Authorization: Bearer …`), root-owned, mode 0600.

### 6.2 Shutdown hook
Separate oneshot unit `uptime-hb-shutdown.service` (`RemainAfterExit=yes`, ordered `After=network-online.target` so it stops before networking). Its `ExecStop` checks `systemctl list-jobs` for `reboot.target`/`kexec.target` → `reboot`, `poweroff.target`/`halt.target` → `poweroff`, anything else → do nothing (so crashes and manual service restarts never send a false marker). It writes the marker to the state file and sends one `ev` heartbeat with `--max-time 5`.

### 6.3 Local state file (owner's decision: state file, no read-only mode)
`/var/lib/uptime-hb/state` holding `<boot_id> <uptime> <shutdown>`, written atomically (temp file + `mv`) **only** while heartbeats are failing (every 30 s during an internet outage) and by the shutdown hook. At startup the script reads it once and, if its `boot_id` differs from the current boot, includes it as `pb/pu/pc` in every heartbeat of this boot. A report this boot has not delivered yet is never overwritten: failing heartbeats leave it on disk, the first good heartbeat replaces it with this boot's line, and the shutdown hook writes its marker over it only after sending it. This is what makes rule 6 work: it catches "internet died first, power cut later" (common when the ISP's node is on a different outage schedule) and planned reboots done while offline.

This requires a writable root filesystem, so the read-only overlay is **not** used on either Pi. To protect the SD card instead: journald `Storage=volatile`, no other periodic writes from this project, and a high-endurance SD card.

### 6.4 Other device settings
- Hardware watchdog on (`RuntimeWatchdogSec=15` in a systemd drop-in), so a hang becomes a short reboot.
- Ethernet preferred. On Wi-Fi: set country `UA` and `nmcli connection modify <profile> connection.autoconnect-retries 0` (otherwise NetworkManager gives up for 5 min when the router boots slower than the Pi).
- Nothing special for NTP; optional `NTP=time.cloudflare.com` drop-in.

### 6.5 Install and guides (`pi/README.md`)
- `install.sh` (idempotent, run with sudo on the Pi): asks for device id and token (hidden input), installs script and units, writes config, enables services, runs one test heartbeat and prints the result. Re-running it upgrades.
- It first prints the OS release, curl version, root mount options and network manager in use. Supported: Raspberry Pi OS bookworm and trixie; on anything older it warns and installs only the heartbeat (which needs nothing but bash, curl and systemd).
- **Host-wide changes are opt-in yes/no prompts**, each skipped if already handled: hardware watchdog (skip if a `watchdog` daemon is active), journald `Storage=volatile` (skip if `log2ram` is active), NetworkManager autoconnect retries (only on Wi-Fi with NetworkManager). Defaults: yes on a fresh Pi; the owner decides on the cloudflared Pi at install time. If the root filesystem is already read-only/overlay, it says so and stops with instructions.
- **Guide A — blank Pi, from an empty SD card:** Raspberry Pi Imager → Raspberry Pi OS Lite 64-bit (current: trixie) → hostname, user, SSH key, locale/timezone Europe/Kyiv, Wi-Fi only if no Ethernet → first boot → `apt update && apt full-upgrade` → **remote SSH through a Cloudflare Tunnel** (owner's decision, same as the existing Pi: install `cloudflared` from Cloudflare's apt repo, create a tunnel in the Zero Trust dashboard, run it as a service with its token, add a public hostname `ssh://localhost:22` protected by a Cloudflare Access policy for the owner's e-mail, connect from the laptop with `cloudflared access ssh` as `ProxyCommand`; real hostnames, tokens and e-mail appear only as placeholders in the public repo) → copy repo `pi/` → `install.sh` → verify on the website → (optional) unplug power for a minute and watch it appear.
- **Guide B — the Pi already running cloudflared:** confirm the OS (`cat /etc/os-release`, systemd present), install alongside; nothing touches cloudflared or its config.
- Token: generated on the laptop (`openssl rand -hex 32`), stored via `wrangler secret put`, pasted once into `install.sh`.

## 7. Worker (`worker/`)

- TypeScript, Wrangler 4, `wrangler.jsonc`, `compatibility_date` = the day the project is created, observability on.
- Custom domain **`uptime-api.denyslebiediev.com`** (stable URL baked into Pis and widget).
- D1 database `uptime`, created explicitly with `--location eeur`, read replication off (every query hits the primary → read-your-writes).
- Config: `DEVICES` var = `[{"id":"centralna","name":{"uk":"Центральна 50","en":"Centralna 50"},"short":{"uk":"Центральна","en":"Centralna"}},{"id":"rayduzhna","name":{"uk":"Райдужна 71","en":"Rayduzhna 71"},"short":{"uk":"Райдужна","en":"Rayduzhna"}}]` (`short` is for the lock-screen widget); secrets `TOKEN_CENTRALNA`, `TOKEN_RAYDUZHNA`; local `.dev.vars` gitignored.

**Endpoints**

| Method & path | Who | Response |
|---|---|---|
| `POST /hb` | Pis | `204`; `400` bad body, `401` bad token, `409` stale, `413` too large. No CORS. |
| `GET /status` | widget, site live cards | ≈ 1–2 KB: `{now, day:{start,end}, devices:[{id, name:{uk,en}, short:{uk,en}, state, since, seen, flags, today:[[start,end,kind],…]}]}` where `day` is today's Kyiv midnight-to-midnight in unix s. `Cache-Control: public, max-age=15`. |
| `GET /events?from=&to=` | site | `{now, from, to, devices:[{id, name, short, state, since, seen, flags, first_seen}], iv:[[device, kind, start, end|null, flags],…]}` (live fields as in `/status`, without `today`). Default range: last 35 days; max 400 days. Intervals overlapping the range are returned unclipped. `Cache-Control: public, max-age=60`. |
| `OPTIONS *` | browsers | `204` with CORS headers, `Max-Age 86400`. |

- Every GET response, **including errors**, carries `Access-Control-Allow-Origin: *`. No credentials on GETs.
- **Auth:** authenticate before any D1 access; compare SHA-256 digests with `crypto.subtle.timingSafeEqual`; check every device token without early exit.
- **Validation:** body capped at 512 bytes (header and actual length); `boot`/`pb` must match the UUID regex; `up`/`pu` finite, `0 ≤ x ≤ 3.2e8`; `ev`/`pc` from the allowed set.
- **Rate limiting:** Workers Rate Limiting binding on public GETs, keyed by IP (e.g. 120 requests/min).
- **Interval derivation** is one pure function `derive(spans, now)` shared by `/status` and `/events`.
- **Deploy** from the laptop: `npm run deploy` = `wrangler d1 migrations apply uptime --remote && wrangler deploy` (Wrangler 4 targets the *local* DB unless `--remote` is given).
- Set a Cloudflare budget/usage alert as a guard against a runaway client.

## 8. Website (`site/`)

**Tech:** no build step — `index.html`, CSS, native ES modules (the user's `kyiv-plates` pattern). Relative asset paths only. No chart library; charts are HTML/CSS as in the mockup. Deployed by `.github/workflows/pages.yml` (checkout@v7 → upload-pages-artifact@v5 with `path: site` → deploy-pages@v5; triggered only by `site/**` changes; Pages source = GitHub Actions, set once).

**Look** (approved, see `mockups/site.html`):
- Typography and layout of the "Midnight" direction everywhere: system font stack (`system-ui, -apple-system, "Inter", "Segoe UI", sans-serif`), tabular numbers, big figures 600-weight with −0.03em tracking.
- Dark theme = Midnight colors; light theme = Daylight colors. Tokens from the mockup:

| token | light | dark |
|---|---|---|
| bg | `#f3f1ec` | `#0a0c10` (+ soft green/rose radial washes) |
| card | `#ffffff` | `#111419` |
| text / muted / faint | `#15171c` / `#686c75` / `#a3a6ac` | `#e9ecf2` / `#8b92a3` / `#5b6272` |
| status on (text, dot) | `#0f9f5a` | `#34d399` |
| status off (text, dot) | `#dc3d43` | `#fb7185` |
| track "power on" | `#2b9571` | `#1da967` |
| segment "no power" | `#e5484d` | `#fb7185` |
| segment "no connection" | `#e0a100` hatched | `#fbbf24` hatched |
| chart series | `#2a78d6` | `#3987e5` |

  The track vs strong-red pairing passes a color-blindness check (deutan and protan ΔE ≥ 8, OKLab ×100). The status greens fail it against red (deutan ΔE about 4), so the track must not reuse them; keep "no connection" hatched as its secondary encoding.
- **Theme switch** Auto / Light / Dark (top right). Auto follows the device. Choice persisted in `localStorage` (wrapped in try/catch); applied by a tiny inline script in `<head>` so there is no flash.
- **Language switch** УКР / ENG next to it. Default: Ukrainian if `navigator.languages` contains `uk`, else English; persisted. Brand: "Світло" / "Power". All strings in one dictionary; dates via `Intl` (`uk-UA` / `en-GB`, 24-hour); durations "5 год 12 хв" / "5h 12m". Apartment names come from the API.
- Responsive via container queries, verified at desktop, iPad and iPhone widths.

**Sections, top to bottom** (all approved):
1. Header: brand, "Live · updated N s ago", language switch, theme switch.
2. Headline sentence, e.g. "Power is on at Centralna 50. Rayduzhna 71: no signal for 2h 14m — probably a power cut." (variants for both on / both silent / rebooting / device off / stale).
3. Two status cards: state with icon + word, live duration, "since HH:MM", today's 24 h bar with a "now" marker, "today without power" and "this week".
4. Summary — Day / Week (ISO, Mon–Sun) / Month with ‹ › navigation back to the first day of monitoring: hours without power, number of cuts, longest cut, % of time with power, time both apartments were without power at once.
5. Last 14 days: one row per day, two bars (one per apartment) showing power off, no connection, reboot/device off, and today's future part; per-day totals.
6. Hours without power per day, last 30 days: one bar chart per apartment, dashed average line, today striped as "so far".
7. Usual pattern: hour-of-day heatmap over 30 days per apartment, with "most often off HH:MM–HH:MM" (best 4-hour window).
8. Events: newest first; filter All / per apartment; 8 rows then "show all"; ongoing cut marked live; CSV export.
9. Footer: "Times in Kyiv time · power-off times are accurate to about 30 s".

Every chart mark has a hover/tap tooltip with exact times. Status is never shown by color alone. `prefers-reduced-motion` respected.

**Statistics rules** (pure functions, tested):
- Periods in Europe/Kyiv: day = local midnight to next local midnight (23/24/25 h); week = ISO Monday 00:00; month = 1st 00:00.
- Off-time = `power_off` + provisional open `no_signal`. `no_connection`, `reboot`, `device_off` are not off-time.
- Off-hours are split by overlap with each period (a cut across midnight counts in both days). "Number of cuts" and "longest cut" count cuts that **start** in the period; an ongoing cut uses `now − start`, marked ongoing.
- % with power = `1 − off / observed`, `observed = |period ∩ [first_seen, now]|` minus `device_off` time.
- Both-off = `|off(A) ∩ off(B) ∩ period|`.
- Heatmap cell for local hour h = off seconds in hour h ÷ seconds of hour h that actually elapsed in the window (DST-safe).

**Data flow:** on load fetch `/events` (last 35 days) — older ranges fetched on demand when navigating back. Poll `/status` every 30 s while the tab is visible, `/events` every 5 min. On failure show "Can't reach the server — data as of HH:MM" and keep the last data. Never show raw HTML from the API (use `textContent`).

**CSV columns:** apartment, kind, start (Kyiv local ISO), end, duration (min), start UTC, end UTC, flags.

## 9. iOS widget (`widget/`)

One Scriptable script (`uptime.js`), families **small**, **medium**, **accessoryRectangular** (approved, see `mockups/widget.html`). Other families render a short "Use small, medium or lock-screen" message instead of crashing.

- Reads `GET /status` with `timeoutInterval = 8`; treats non-200 as failure; caches the last good JSON in `FileManager.local().libraryDirectory()`; on failure renders the cache with "offline · as of HH:MM".
- Live durations with `addDate(since)` + `applyRelativeStyle()`: it keeps counting without a refresh and is localized by iOS ("5 hr, 12 min" / "5 год 12 хв"), the closest live equivalent of the mockup's "5h 12m". Next to it a static "since HH:MM"; a footer "as of HH:MM" from the server's `now`. Rows use fixed-width stacks, `lineLimit = 1`, `minimumScaleFactor ≈ 0.6`.
- States shown: on / no signal (with "probably a power cut" on medium, §5.4) / rebooting / device off / stale. Each with an SF Symbol (`bolt.fill`, `bolt.slash.fill`, `arrow.clockwise`, `power`, `exclamationmark.triangle`) plus a word; guard `SFSymbol.named` returning null.
- Light/dark via `Color.dynamic`; the medium widget's 24 h bars (small has none, as in the mockup) drawn with `DrawContext` (`opaque = false`, `respectScreenScale = true`) using colors that read in both modes, from `day.start`/`day.end` and `today` segments supplied by the server (no time-zone math on the phone).
- Lock screen (as in the mockup): two text rows, no bar — icon, **short name** from `/status` (`Центральна`/`Centralna`, `Райдужна`/`Rayduzhna`), state word, live duration; `addAccessoryWidgetBackground = true`.
- Language from `Device.language()`: `uk` → Ukrainian labels and names, else English.
- `widget.url` = `https://uptime.denyslebiediev.com/`; `refreshAfterDate` = now + 5 min.
- Install notes: copy the script into the Scriptable folder in iCloud Drive, add the widget, pick the script.

## 10. Security and privacy
- Per-device 32-byte random tokens; on the Pi in root-only files; in the Worker as secrets; never in git (`.dev.vars`, `*.env` ignored).
- The public API exposes only names, states and intervals.
- The apartment names are street + building number, chosen by the owner knowing the page is public; no flat numbers anywhere.
- Repo is public: no personal data, IPs or tunnel details in code or docs.

## 11. Testing and verification
- **Worker:** Vitest with `@cloudflare/vitest-plugin` (the old `vitest-pool-workers` is deprecated), D1 migrations applied in tests. One test per heartbeat rule (§5.3) and per derivation branch (§5.4); a test asserting the `/events` query's `rows_read` stays small.
- **Site:** pure modules (Kyiv calendar, stats, formatting) tested with Node's built-in `node --test` (no dependencies). Must cover 2026-03-29 (23 h), 2026-10-25 (25 h), a cut across midnight, an ongoing cut, ISO week boundaries.
- **CI:** one GitHub Actions workflow running worker and site tests on push.
- **Manual end-to-end** (in the plan): run the Pi script; pull the Pi's plug for 2 min; unplug the router's WAN for 5 min; unplug WAN then the Pi (needs the state file); `sudo reboot`; `sudo poweroff` then replug. Check site and widget after each. Remote stand-ins when nobody is on site: a firewall rule dropping traffic to the API for 5 min (internet outage; auto-removed by a timer so it can't lock anyone out), `echo b > /proc/sysrq-trigger` (hard reset ≈ power cut), and `sudo reboot`.
- **Widget checklist:** light/dark, tinted Home Screen, lock screen, airplane mode (cache path), Ukrainian and English phone language.

## 12. Operations
- Worker deploy: `npm run deploy` from `worker/`. Site: push to `main`.
- Bad data fix: `wrangler d1 execute uptime --remote --command "…"` (documented examples: mark a span as `poweroff`, delete a test device's spans).
- Pi update: copy new `pi/` files and re-run `install.sh`.
- Repo conventions (from the owner's other repos): imperative one-line commit messages, no `Co-Authored-By` lines, `CLAUDE.md` kept out of git via `.git/info/exclude`, confirm commit messages with the owner before committing.

## 13. Decisions

**Made by the owner**
- Pis push to a Cloudflare Worker; public GitHub Pages site; iOS Scriptable widget.
- Power cuts are the thing being tracked; "informed" only — no notifications.
- Visual direction: Midnight + Daylight as dark/light of one design, Midnight typography, Auto/Light/Dark switch; responsive on PC/iPad/iPhone.
- Every website section in §8 ("keep everything").
- Widget: small, medium, lock-screen rectangular.
- Ukrainian + English with a switch; names Центральна 50 / Centralna 50 and Райдужна 71 / Rayduzhna 71.
- One Pi is blank (full guide); the other already runs cloudflared on Raspberry Pi OS Lite (install alongside).
- Detection approach of §5 (boot ID + uptime, server time), including the "No signal — probably a power cut" live wording — approved in conversation.
- Small state file on a writable SD card instead of the read-only overlay (§6.3).
- Remote access to both Pis by SSH through Cloudflare Tunnel; the blank-Pi guide sets it up (§6.5).

**Builder's calls already made (owner can override)**
- 30 s heartbeat, 120 s gap threshold, 10 min reboot window, 24 h "stale".
- D1 (single table) over Durable Objects/KV; no cron.
- API on `uptime-api.denyslebiediev.com`; repo and site path `uptime`.
- No-build static site; TypeScript Worker; bash + curl client.
- Hardware watchdog on both Pis; Ethernet preferred.
- Language default from the browser; brand "Світло" / "Power".
- Rate limit 120 req/min/IP on GETs.
- Lock-screen short names "Центральна"/"Centralna", "Райдужна"/"Rayduzhna"; widget durations via iOS relative style.
- `install.sh` asks before every host-wide change (watchdog, volatile logs, Wi-Fi retries).

## 14. Left to the builder
File and module breakdown inside each folder; exact CSS; Ukrainian copywriting; tooltip mechanics; the `/events` SQL; how the site lazy-loads older ranges; README wording; CI details.
