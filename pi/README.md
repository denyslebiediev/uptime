# Pi setup

Each apartment's Raspberry Pi sends a heartbeat every 30 s. Placeholders used below: `<user>`, `<pi-hostname>`, `<ssh-hostname>`, `<owner-email>`, `<TUNNEL_TOKEN>`. Real hostnames, tokens and e-mails never go into git.

Copy command (run from the repo root; the old folder is removed first because `scp -r` into an existing folder nests the new copy inside it and would leave the old `install.sh` in place):

```sh
ssh <user>@<ssh-hostname> 'rm -rf ~/uptime-pi' && scp -r pi <user>@<ssh-hostname>:uptime-pi
```

## Guide A — blank Pi

Hardware: a high-endurance SD card; Ethernet preferred.

1. Raspberry Pi Imager → Raspberry Pi OS (other) → Raspberry Pi OS Lite (64-bit) (trixie). Set hostname `<pi-hostname>`, user `<user>` with a password (sudo asks for it since the 2026-04-13 release), SSH with a public key only, time zone Europe/Kyiv, and Wi-Fi with country UA only if there is no Ethernet.
2. First boot: `ssh <user>@<pi-hostname>.local`, then `sudo apt update && sudo apt full-upgrade -y && sudo reboot`.
3. Install cloudflared from Cloudflare's apt repo (source: pkg.cloudflare.com, 2026-11-03):
   ```sh
   sudo mkdir -p --mode=0755 /usr/share/keyrings
   curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
   echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
   sudo apt-get update && sudo apt-get install -y cloudflared
   ```
4. Zero Trust → Networking → Tunnels → Create a tunnel. Run only the `sudo cloudflared service install <TUNNEL_TOKEN>` line the dashboard shows, and wait for the status `Healthy`. Then Routes → Add route → Published application → `<ssh-hostname>`, Service `SSH`, `localhost:22`. (Source: developers.cloudflare.com, cloudflare-tunnel/use-cases/ssh/ssh-cloudflared-authentication/.)
5. Zero Trust → Access controls → Applications → Create new application → Self-hosted and private → public hostname `<ssh-hostname>`, policy Allow with Include Emails `<owner-email>`.
6. On the laptop: `brew install cloudflared`, then in `~/.ssh/config`:
   ```
   Host <ssh-hostname>
     ProxyCommand /opt/homebrew/bin/cloudflared access ssh --hostname %h
   ```
   (the path comes from `brew --prefix cloudflared`). Success: `ssh <user>@<ssh-hostname>` opens a browser login, then a shell.
7. Copy the files with the command above. On the Pi: `cd ~/uptime-pi && sudo ./install.sh`. Type this Pi's device id, paste its token, and press Enter at each host-wide prompt.
8. Check the site. Optional: unplug the Pi for a minute; a power cut of about 1 minute appears in Events once it is back.

## Guide B — Pi already running cloudflared

1. Copy the files with the command above, using this Pi's `<ssh-hostname>`. On the Pi run:
   ```sh
   cd ~/uptime-pi
   cat /etc/os-release
   systemctl --version | head -n1
   ./install.sh --check
   ```
2. On Wi-Fi, first run `sudo raspi-config nonint do_wifi_country UA`. Then run `sudo ./install.sh` and answer each host-wide prompt deliberately. For example, decline the volatile journal if you rely on persistent logs to debug cloudflared.
3. Nothing here touches cloudflared or its config: `systemctl is-active cloudflared` must still print `active`.

## Updating

Copy the files with the command above. On the Pi: `cd ~/uptime-pi && sudo ./install.sh`, pressing Enter at the device and token prompts to keep both.

To rotate a token: `openssl rand -hex 32`, then `npx wrangler secret put TOKEN_<DEVICE>` in `worker/`, then re-run the installer and paste it.

## Troubleshooting

Logs: `journalctl -u uptime-hb -u uptime-hb-shutdown -b` (with a volatile journal, earlier boots are gone).

- `curl: (60)` / "certificate is not yet valid": the clock is not synced yet. It normally clears within seconds. If it persists, run `timedatectl timesync-status`; if NTP is slow or blocked, optionally add `/etc/systemd/timesyncd.conf.d/uptime-hb.conf` containing `[Time]` and `NTP=time.cloudflare.com`, then `sudo systemctl restart systemd-timesyncd`. Never use `-k`.
- `(22) … 401`: wrong token; re-run the installer and paste this device's token. `(22) … 409`: a stale packet; it clears on the next beat. `(6)`/`(7)`/`(28)`: no internet; this is logged once, and the state file keeps the last time the Pi was known alive.
- Wi-Fi comes back about 5 minutes after the router: answer yes to "Wi-Fi reconnect forever".
- Secrets: `/etc/uptime-hb/auth` and tunnel tokens never go into git.
