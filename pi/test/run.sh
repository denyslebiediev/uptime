#!/bin/bash
# Offline harness for pi/uptime-hb (fake curl + systemctl). Runs under bash 3.2.
PI=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
PATH=$PI/test/bin:$PATH
HB=$PI/uptime-hb
B=11111111-2222-4333-8444-555555555555
P=aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee
BASE="{\"boot\":\"$B\",\"up\":12345.67}"
pass=0 fail=0
ROOT=$(mktemp -d)
trap 'rm -rf "$ROOT"' EXIT
n_setup=0

setup() {
  n_setup=$((n_setup + 1)); T=$ROOT/$n_setup
  mkdir -p "$T/state" "$T/fake" "$T/etc" "$T/proc/sys/kernel/random"
  echo 'UPTIME_HB_URL=https://hb.test/hb' > "$T/etc/env"
  echo 'Authorization: Bearer secret-token' > "$T/etc/auth"
  echo "$B" > "$T/proc/sys/kernel/random/boot_id"
  echo '12345.67 99999.99' > "$T/proc/uptime"
  export UPTIME_HB_ETC=$T/etc UPTIME_HB_STATE_DIR=$T/state UPTIME_HB_PROC=$T/proc UPTIME_HB_INTERVAL=0
  export FAKE_DIR=$T/fake FAKE_CURL_EXIT=0 FAKE_JOBS=
}
eq() {
  if [ "$2" = "$3" ]; then pass=$((pass + 1))
  else fail=$((fail + 1)); printf 'FAIL %s\n  got:  %s\n  want: %s\n' "$1" "$2" "$3"; fi
}
body() { cat "$FAKE_DIR/body.$1" 2>/dev/null; }
state() { cat "$T/state/state" 2>/dev/null; }
calls() { cat "$FAKE_DIR/n" 2>/dev/null || echo 0; }

setup; out=$("$HB" once); rc=$?
eq "once: ok exit + message" "$rc $out" "0 heartbeat ok"
eq "once: body is boot + fresh uptime" "$(body 1)" "$BASE"
eq "once: exact curl argv (no --json/--retry/-k, token only via @file)" "$(cat "$T/fake/argv.1")" \
  "$(printf '%s\n' -fsS --connect-timeout 5 --max-time 10 -H "@$T/etc/auth" -H 'Content-Type: application/json' --data "$BASE" https://hb.test/hb)"
eq "once: success writes no state" "$(ls -A "$T/state")" ""
setup; FAKE_CURL_EXIT=7; out=$("$HB" once); rc=$?
eq "once: failure exits with curl's code" "$rc $out" "7 heartbeat failing: curl: (7) fake error"
eq "once: failure saves state" "$(state)" "$B 12345.67 none"
eq "once: state write is atomic (no temp left)" "$(ls -A "$T/state")" "state"
setup; echo "$P 500.25 reboot" > "$T/state/state"; "$HB" once >/dev/null
eq "prev report from another boot" "$(body 1)" "{\"boot\":\"$B\",\"up\":12345.67,\"pb\":\"$P\",\"pu\":500.25,\"pc\":\"reboot\"}"
setup; echo "$B 100.00 none" > "$T/state/state"; "$HB" once >/dev/null
eq "same-boot state is not a prev report" "$(body 1)" "$BASE"
for s in "garbage 500.25 none" "$P 400000000.00 none" "$P 500.25 maybe"; do
  setup; echo "$s" > "$T/state/state"; "$HB" once >/dev/null; rc=$?
  eq "invalid state '$s' is ignored" "$rc $(body 1)" "0 $BASE"
done
setup; echo "$P 500.25 none" > "$T/state/state"; FAKE_CURL_EXIT="0 7 60 7 0"
"$HB" loop > "$T/log" 2>&1 & pid=$!
for _ in $(seq 50); do [ "$(calls)" -ge 6 ] 2>/dev/null && break; sleep 0.1; done
kill "$pid" 2>/dev/null; wait "$pid" 2>/dev/null
eq "loop: logs only ok<->failing changes" "$(cat "$T/log")" "$(printf '%s\n' 'heartbeat ok' 'heartbeat failing: curl: (7) fake error' 'heartbeat ok')"
eq "loop: prev report survives own state writes" "$(body 5)" "{\"boot\":\"$B\",\"up\":12345.67,\"pb\":\"$P\",\"pu\":500.25,\"pc\":\"none\"}"
eq "loop: failures saved current boot" "$(state)" "$B 12345.67 none"
for pair in reboot:reboot kexec:reboot poweroff:poweroff halt:poweroff; do
  t=${pair%:*} ev=${pair#*:}
  setup; echo "$P 500.25 none" > "$T/state/state"; FAKE_JOBS="42 $t.target start waiting"; "$HB" stop >/dev/null
  eq "stop: $t.target -> $ev marker" "$(state)" "$B 12345.67 $ev"
  eq "stop: $t.target -> one ev beat with prev report, --max-time 5" "$(calls) $(body 1) $(sed -n 5p "$T/fake/argv.1")" \
    "1 {\"boot\":\"$B\",\"up\":12345.67,\"ev\":\"$ev\",\"pb\":\"$P\",\"pu\":500.25,\"pc\":\"none\"} 5"
done
setup; FAKE_JOBS=''; out=$("$HB" stop 2>&1); rc=$?
eq "stop: no shutdown job (crash/manual stop) is silent, sends and saves nothing" "$rc|$out|$(ls -A "$T/fake")|$(state)" "0|||"
setup; FAKE_JOBS='42 reboot.target start waiting' FAKE_CURL_EXIT=7; "$HB" stop >/dev/null; rc=$?
eq "stop: offline keeps the marker, exits 0" "$rc $(state)" "0 $B 12345.67 reboot"
setup; echo "$P 500.25 none" > "$T/state/state"; FAKE_CURL_EXIT=7; "$HB" once >/dev/null
eq "failed beat keeps an undelivered prev report" "$(state)" "$P 500.25 none"
setup; echo "$P 500.25 none" > "$T/state/state"; "$HB" once >/dev/null
eq "first good beat replaces the delivered prev report" "$(state)" "$B 12345.67 none"
setup; echo "$P 500.25 none" > "$T/state/state"; FAKE_JOBS='42 reboot.target start waiting' FAKE_CURL_EXIT=7; "$HB" stop >/dev/null
eq "offline stop keeps an undelivered prev report" "$(state)" "$P 500.25 none"
osrel() { printf 'PRETTY_NAME="%s"\nVERSION_CODENAME=%s\n' "$1" "$2" > "$T/os"; }
for c in 'Debian GNU/Linux 13 (trixie)|trixie|trixie is supported' 'Debian GNU/Linux 12 (bookworm)|bookworm|bookworm is supported' \
         'Raspbian GNU/Linux 11 (bullseye)|bullseye|bullseye is not bookworm or trixie: heartbeat only, no host-wide changes'; do
  IFS='|' read -r name code want <<<"$c"
  setup; osrel "$name" "$code"; out=$(UPTIME_HB_OS_RELEASE=$T/os "$PI/install.sh" --check); rc=$?
  eq "install --check: $code" "$rc|$(sed -n 1p <<<"$out")|$(grep '^OS check: ' <<<"$out")" "0|OS:      $name|OS check: $want"
done
for c in 'ext4   ro,noatime' 'overlay rw,lowerdir=/media/root-ro'; do
  setup; osrel 'Debian GNU/Linux 12 (bookworm)' bookworm; out=$(FAKE_FINDMNT=$c UPTIME_HB_OS_RELEASE=$T/os "$PI/install.sh" --check); rc=$?
  eq "install --check: read-only root '$c' stops" "$rc|$(grep -c '^Root filesystem is read-only or an overlay' <<<"$out")" "1|1"
done
if [ "$(id -u)" != 0 ]; then   # never let the harness run the real installer as root
  setup; osrel 'Debian GNU/Linux 13 (trixie)' trixie; out=$(UPTIME_HB_OS_RELEASE=$T/os "$PI/install.sh" 2>&1 </dev/null); rc=$?
  eq "install: refuses without root" "$rc $(tail -n1 <<<"$out")" "1 Run with sudo: sudo ./install.sh"
fi
echo "$pass passed, $fail failed"; [ "$fail" = 0 ]
