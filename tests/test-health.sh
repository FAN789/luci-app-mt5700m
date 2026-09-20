#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
STATE_DIR="$TMP/state"; INTERFACE=MT5700M
. "$ROOT/luci-app-mt5700m/root/usr/share/mt5700m/health.sh"
NOW=100; MODEM=10.1.1.1; HOST=10.1.1.2; PROBE=0
health_now() { echo "$NOW"; }
config_value() { echo "$2"; }
mt5700m_netdev() { echo eth2; }
interface_up() { return 0; }
health_modem_address() { echo "$MODEM"; }
health_host_address() { echo "$HOST"; }
health_probe() { return "$PROBE"; }
ifup() { [ "$1" = MT5700M ]; echo renew >>"$TMP/actions"; }
set_ndis_session() { echo "ndis=$1" >>"$TMP/actions"; }
log_message() { :; }
sleep() { :; }
check_data_health; test ! -f "$TMP/actions"
NOW=160; check_data_health; test "$(cat "$TMP/actions")" = renew
NOW=220; check_data_health
NOW=280; check_data_health; test "$(wc -l <"$TMP/actions")" -eq 1
NOW=340; check_data_health
test "$(grep -c ndis "$TMP/actions")" -eq 2
HOST="$MODEM"; NOW=400; check_data_health; test "$(health_get state)" = healthy
test "$(health_get stage)" = 0
PROBE=1
NOW=460; check_data_health; NOW=520; check_data_health
test "$(wc -l <"$TMP/actions")" -eq 4
NOW=580; check_data_health; test "$(wc -l <"$TMP/actions")" -eq 5
NOW=640; check_data_health; NOW=700; check_data_health; NOW=760; check_data_health
test "$(health_get state)" = needs-attention
test "$(wc -l <"$TMP/actions")" -eq 5
MODEM=''; NOW=820; check_data_health; test "$(health_get state)" = modem-unconfirmed
MODEM=10.1.1.1; PROBE=2; NOW=880; check_data_health; test "$(health_get state)" = probe-unavailable
echo 'PASS: address mismatch, false alarm threshold, DHCP-first recovery, cooldown and hourly budget'
