#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
STATE_DIR="$TMP/state"; INTERFACE=MT5700M
MT5700M_NET_SYSFS="$TMP/net"; mkdir -p "$MT5700M_NET_SYSFS/eth2"
NDIS_SYNC_MARKER="$STATE_DIR/sync"; NDIS_RECOVERY_MARKER="$STATE_DIR/recovery"
. "$ROOT/luci-app-mt5700m/root/usr/share/mt5700m/health.sh"
. "$ROOT/luci-app-mt5700m/root/usr/share/mt5700m/session.sh"
printf 100 > "$TMP/clock"
health_now() { cat "$TMP/clock"; }
advance() { printf '%s' "$(($(health_now)+$1))" > "$TMP/clock"; }
config_value() { echo "$2"; }
mt5700m_netdev() { echo eth2; }
interface_up() { return 0; }
health_host_address() { echo 192.0.2.10; }
PROBE=0; START_RC=124
health_probe() { advance "${PROBE_TIME:-0}"; return "$PROBE"; }
bring_down() { echo down >> "$TMP/actions"; }
bring_up() { echo up >> "$TMP/actions"; printf 1 > "$MT5700M_NET_SYSFS/eth2/carrier"; }
ifup() { echo renew >> "$TMP/actions"; }
set_ndis_session() { echo "ndis=$1" >> "$TMP/actions"; [ "$1" = 0 ] || return "$START_RC"; }
apply_profile() { echo profile >> "$TMP/actions"; }
log_message() { printf '%s\n' "$*" >> "$TMP/log"; }
sleep() { advance "$1"; }

# Missing marker is not permission to interrupt a verified live link.
printf 1 > "$MT5700M_NET_SYSFS/eth2/carrier"
recover_ndis_link; test -f "$NDIS_SYNC_MARKER"; test ! -f "$TMP/actions"
# Timeout may still succeed, but only a fresh positive probe confirms it.
printf 0 > "$MT5700M_NET_SYSFS/eth2/carrier"
recover_ndis_link; test "$(grep -c 'ndis=1' "$TMP/actions")" -eq 1
test "$(health_get state)" = healthy; test "$(health_get attempts)" = 1
grep -q 'Internet verified after step=start rc=124' "$TMP/log"
printf 0 > "$MT5700M_NET_SYSFS/eth2/carrier"
recover_ndis_link; test "$(grep -c 'ndis=1' "$TMP/actions")" -eq 1
# Failed verification consumes <=30s, including slow probes, and never resends.
advance 180; PROBE=1; PROBE_TIME=4
before=$(health_now)
recover_ndis_link && { echo 'Unverified timeout accepted' >&2; exit 1; }
elapsed=$(($(health_now)-before)); test "$elapsed" -le 32
test "$(health_get state)" = session-unconfirmed
test ! -f "$NDIS_SYNC_MARKER"
test "$(grep -c 'ndis=1' "$TMP/actions")" -eq 2
# Health and NDIS paths share the same last-attempt timestamp and hourly cap.
lines=$(wc -l < "$TMP/actions")
health_repair "$(health_now)"; test "$(wc -l < "$TMP/actions")" -eq "$lines"
advance 180; health_repair "$(health_now)"; test "$(health_get attempts)" = 3
printf 0 > "$MT5700M_NET_SYSFS/eth2/carrier"; advance 180
lines=$(wc -l < "$TMP/actions"); recover_ndis_link
test "$(health_get state)" = needs-attention
test "$(wc -l < "$TMP/actions")" -eq "$lines"
echo 'PASS: live-link preservation, confirmed/failed timeout, bounded wait and shared recovery budget'
