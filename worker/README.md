# Worker

Cloudflare Worker with a D1 database. It takes heartbeats from the Pis (`/hb`) and serves `/status` and `/events`. Run every command below from this folder.

## Develop

```sh
npm ci
npm test
npm run typecheck
npm run seed:local && npm run dev   # http://localhost:8787 with fake data
```

## Deploy

```sh
npm run deploy
```

This applies D1 migrations (`--remote`), then runs `wrangler deploy`. Secrets survive deploys, so later deploys need no `--secrets-file`.

## First-time setup

Do these once, in order.

1. Log in and check the account: `npx wrangler login`, then `npx wrangler whoami`. It must show the account that owns the denyslebiediev.com zone.
2. Create the database: `npx wrangler d1 create uptime --location eeur`. If Wrangler offers to add a binding, say no. Put the printed id into `d1_databases[0].database_id` in `wrangler.jsonc`. Then run `npx wrangler types` and `npm run typecheck` (both must pass). Check `npx wrangler d1 info uptime`: read replication must be `disabled`.
3. Make the tokens (see Tokens) in a git-ignored `prod.env`. Copy the values into your password manager now: the Pi installer asks for them.
4. First deploy: `npm run deploy -- --secrets-file prod.env`. The config refuses a first deploy without the tokens. Answer `y` to the migration prompt. If DNS or TLS fails right away, wait 2 to 5 minutes for the certificate.
5. Check it live:

   ```sh
   (
   API=https://uptime-api.denyslebiediev.com; set -a; . ./prod.env; set +a
   curl -si $API/status    # 200, CORS header, every device "unknown"
   HB='{"boot":"00000000-0000-4000-8000-000000000001","up":5}'
   curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN_CENTRALNA" -H 'Content-Type: application/json' --data "$HB" $API/hb   # 204
   curl -s -o /dev/null -w '%{http_code}\n' -H 'Authorization: Bearer wrong' -H 'Content-Type: application/json' --data "$HB" $API/hb            # 401
   curl -s $API/status | node -e 'const b=JSON.parse(require("fs").readFileSync(0));console.log(b.devices.map(d=>d.id+" "+d.state).join(", "))'   # centralna on, rayduzhna unknown
   npx wrangler d1 execute uptime --remote --command "DELETE FROM span WHERE boot_id = '00000000-0000-4000-8000-000000000001'"   # removes the test row
   )
   ```

   The subshell keeps the tokens out of your shell, so a later deploy cannot pick up stale values.

6. Delete the file: `rm prod.env`.
7. Add a budget alert (see Budget alert).

## Tokens

One secret per device. Make a token with:

```sh
openssl rand -hex 32
```

To make the first `prod.env`:

```sh
printf 'TOKEN_CENTRALNA=%s\nTOKEN_RAYDUZHNA=%s\n' "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" > prod.env && chmod 600 prod.env
git check-ignore -v prod.env   # must print a match
```

Never commit tokens or paste them in chat. To rotate one, open an SSH session to the Pi first. Generate a new value (`openssl rand -hex 32`), store it in your password manager, run the command below (paste at the prompt), then immediately re-run `pi/install.sh` on the Pi. Heartbeats fail in between and show as downtime.

```sh
npx wrangler secret put TOKEN_CENTRALNA
```

## Data fixes

```sh
# inspect a device's latest spans (UTC)
npx wrangler d1 execute uptime --remote --command "SELECT id, boot_id, datetime(boot_at,'unixepoch') boot, datetime(first_seen,'unixepoch') first, datetime(last_seen,'unixepoch') last, alive_until, shutdown FROM span WHERE device = 'centralna' ORDER BY id DESC LIMIT 20"
# maintenance booked as a power cut: mark the span BEFORE the gap as deliberately switched off
npx wrangler d1 execute uptime --remote --command "UPDATE span SET shutdown = 'poweroff' WHERE id = <id>"
# delete a test device's spans
npx wrangler d1 execute uptime --remote --command "DELETE FROM span WHERE device = '<device>'"
# undo a bad fix (Time Travel, last 30 days)
npx wrangler d1 time-travel restore uptime --timestamp <unix-seconds>
```

## Budget alert

A guard against a runaway bill. In the Cloudflare dashboard: Manage Account, Billing, Billable Usage, Create budget alert. Name it `uptime runaway guard`, set the threshold to USD 1, add your e-mail as recipient, and save. The Budget alerts list then includes it (next to Cloudflare's auto-created USD 10 default). Docs: https://developers.cloudflare.com/billing/manage/budget-alerts/
