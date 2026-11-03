#!/bin/bash
# Power-cut tracker installer: sudo ./install.sh [--check]. Idempotent; re-running upgrades.
set -eu
umask 077
cd "$(dirname "${BASH_SOURCE[0]}")"

ETC=/etc/uptime-hb
OS_RELEASE=${UPTIME_HB_OS_RELEASE:-/etc/os-release}
URL=https://uptime-api.denyslebiediev.com/hb
WATCHDOG_CONF=/etc/systemd/system.conf.d/uptime-hb-watchdog.conf
JOURNAL_CONF=/etc/systemd/journald.conf.d/uptime-hb-volatile.conf

osval() { sed -n "s/^$1=//p" "$OS_RELEASE" 2>/dev/null | head -n1 | tr -d '"'; }
pretty=$(osval PRETTY_NAME); codename=$(osval VERSION_CODENAME)
curl_v=$(curl --version 2>/dev/null | head -n1 || true)
rootfs=$(findmnt -no FSTYPE,OPTIONS / 2>/dev/null || true)
net=unknown
for n in NetworkManager dhcpcd systemd-networkd; do
  if systemctl is-active --quiet "$n" 2>/dev/null; then net=$n; break; fi
done
echo "OS:      ${pretty:-unknown}"
echo "curl:    ${curl_v:-not installed}"
echo "root fs: ${rootfs:-unknown}"
echo "network: $net"
supported=0
case $codename in
  bookworm|trixie) supported=1; echo "OS check: $codename is supported" ;;
  *) echo "OS check: ${codename:-unknown} is not bookworm or trixie: heartbeat only, no host-wide changes" ;;
esac

read -r fstype opts <<<"$rootfs"  # util-linux 2.38 pads the FSTYPE column
case $fstype:$opts in
  overlay:*|*:ro|*:ro,*)
    echo 'Root filesystem is read-only or an overlay; the state file needs a writable root (spec §6.3).'
    echo 'Overlay: sudo raspi-config nonint do_overlayfs 1 && sudo reboot'
    echo 'Read-only fstab: remove "ro" from the / line in /etc/fstab, then reboot.'
    echo 'Then run this installer again.'
    exit 1 ;;
esac

[ "${1:-}" != --check ] || exit 0
[ "$(id -u)" = 0 ] || { echo 'Run with sudo: sudo ./install.sh'; exit 1; }
for t in curl systemctl; do command -v $t >/dev/null || { echo 'Missing curl or systemctl: sudo apt install curl'; exit 1; }; done

# ask NAME: Enter or y means yes
ask() { local a; read -r -p "$1 [Y/n]: " a; case $a in ''|y|Y|yes) return 0 ;; *) return 1 ;; esac; }

cur_dev=$(sed -n 's/^# device: //p' "$ETC/env" 2>/dev/null | head -n1 || true)
if [ -n "$cur_dev" ]; then read -r -p "Device id (centralna/rayduzhna) [$cur_dev]: " dev
else read -r -p 'Device id (centralna/rayduzhna): ' dev; fi
dev=${dev:-$cur_dev}
case $dev in centralna|rayduzhna) ;; *) echo 'Device id must be centralna or rayduzhna.'; exit 1 ;; esac

read -rs -p 'Token (hidden, Enter keeps the current one): ' token; echo
if [ -z "$token" ]; then
  [ -f "$ETC/auth" ] || { echo 'A token is required.'; exit 1; }
  token=$(sed -n 's/^Authorization: Bearer //p' "$ETC/auth")
fi
[[ $token =~ ^[0-9a-f]{64}$ ]] || { echo 'Token must be 64 lowercase hex characters (openssl rand -hex 32).'; exit 1; }

install -m 0755 uptime-hb /usr/local/bin/
install -m 0644 uptime-hb.service uptime-hb-shutdown.service /etc/systemd/system/
install -d -m 0700 "$ETC"
printf '# device: %s\nUPTIME_HB_URL=%s\n' "$dev" "$URL" > "$ETC/env"
printf 'Authorization: Bearer %s\n' "$token" > "$ETC/auth"
chmod 0600 "$ETC/env" "$ETC/auth"

# dropin FILE CONTENT COMMAND...: writes a 0644 drop-in in a 0755 folder, then runs COMMAND
dropin() {
  local file=$1 content=$2; shift 2
  install -d -m 0755 "$(dirname "$file")"
  printf '%s\n' "$content" > "$file"; chmod 0644 "$file"
  "$@"
}

if [ "$supported" = 1 ]; then
  name='Hardware watchdog'
  if [ -e "$WATCHDOG_CONF" ]; then echo "$name: already configured"
  elif systemctl is-active --quiet watchdog; then echo "$name: skipped (watchdog daemon is active)"
  elif [ ! -e /dev/watchdog ]; then echo "$name: skipped (no /dev/watchdog)"
  elif ask "$name"; then dropin "$WATCHDOG_CONF" $'[Manager]\nRuntimeWatchdogSec=15' systemctl daemon-reexec; fi

  name='Volatile journal'
  if [ -e "$JOURNAL_CONF" ]; then echo "$name: already configured"
  elif systemctl is-active --quiet log2ram; then echo "$name: skipped (log2ram is active)"
  elif ask "$name"; then dropin "$JOURNAL_CONF" $'[Journal]\nStorage=volatile' systemctl restart systemd-journald; fi

  name='Wi-Fi reconnect forever'
  if [ "$net" = NetworkManager ]; then
    while IFS= read -r line <&3; do
      case $line in 802-11-wireless:*) ;; *) continue ;; esac
      con=${line#802-11-wireless:}
      if [ "$(nmcli -g connection.autoconnect-retries connection show "$con")" = 0 ]; then echo "$name: already configured ($con)"
      elif ask "$name ($con)"; then nmcli connection modify "$con" connection.autoconnect-retries 0; fi
    done 3<<<"$(nmcli -t -f TYPE,NAME connection show --active)"  # fd 3 keeps ask on the real stdin
  fi
fi

systemctl daemon-reload
systemctl enable uptime-hb-shutdown.service uptime-hb.service
systemctl start uptime-hb-shutdown.service
rc=0; /usr/local/bin/uptime-hb once || rc=$?
systemctl restart uptime-hb.service
if [ "$rc" = 0 ]; then echo "Done. Open https://denyslebiediev.com/uptime/ — $dev should show \"Power on\" within a minute."
else echo 'See Troubleshooting in pi/README.md.'; fi
exit "$rc"
