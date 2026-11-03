# uptime

Power-cut tracker for two apartments. A Raspberry Pi in each sends a heartbeat every 30 s to a Cloudflare Worker, which derives power cuts, connection drops, reboots and switch-offs from them. A public page and an iOS widget show the result, all in Kyiv time.

**Site:** https://uptime.denyslebiediev.com/ · **API:** https://uptime-api.denyslebiediev.com/status

| Folder | What | Deploy |
| --- | --- | --- |
| `worker/` | Cloudflare Worker + D1 API | `cd worker && npm run deploy` ([worker/README.md](worker/README.md)) |
| `pi/` | heartbeat script and systemd units | copy `pi/` to the Pi and run `sudo ./install.sh` ([pi/README.md](pi/README.md)) |
| `site/` | static page, no build step | push to `main` ([pages.yml](.github/workflows/pages.yml)) |
| `widget/` | iOS Scriptable widget | copy `widget/uptime.js` into Scriptable ([widget/README.md](widget/README.md)) |
| `docs/` | design spec and mockups | n/a |

## Local development

Tests (same as [test.yml](.github/workflows/test.yml)):

```bash
(cd worker && npm ci && npm test)
for tz in Europe/Kyiv UTC America/New_York; do TZ=$tz node --test 'site/test/*.test.js' || break; done
shellcheck pi/uptime-hb pi/install.sh pi/test/run.sh pi/test/bin/curl pi/test/bin/systemctl && bash pi/test/run.sh
```

Run it locally:

```bash
cd worker && npm run seed:local && npm run dev      # API on :8787 with fake data
python3 -m http.server 8000 -d site                 # in another terminal
```

Then open http://localhost:8000/?api=http://localhost:8787. The `?api=` override accepts only `localhost` and `127.0.0.1`.
