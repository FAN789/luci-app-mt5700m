#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT INT TERM
export TEST_ROOT="$TMP"
manager="$ROOT/luci-app-mt5700m/root/usr/sbin/mt5700m-manager"
# Execute the actual monitor functions with isolated USB/network/AT stand-ins.
# No production config, services, locks or serial port are accessed.
awk '/^monitor_sync_if_needed\(\)/,/^}/' "$manager" >"$TMP/harness"
awk '/^monitor_manager\(\)/,/^}/' "$manager" >>"$TMP/harness"
cat >>"$TMP/harness" <<'EOF'
INTERFACE=test_modem
mt5700m_usb_info() { echo "${TEST_USB_STATE:-normal}|fixture"; }
mt5700m_netdev() { echo fixture_ncm; }
uci() { echo "${TEST_DEVICE:-fixture_ncm}"; }
sync_manager() { echo sync >>"$TEST_ROOT/sync"; }
acquire_lock() { return 0; }
release_lock() { :; }
mt5700m_action_lock() { return 0; }
recover_profile_transaction() { return 0; }
recover_ndis_link() { echo recovery >>"$TEST_ROOT/checks"; }
check_data_health() { echo health >>"$TEST_ROOT/checks"; }
refresh_temperature_cache() { echo temperature >>"$TEST_ROOT/checks"; }
refresh_read_caches() { echo prewarm >>"$TEST_ROOT/prewarm"; }
sleep() { test "$1" -eq 15; exit 0; }
monitor_manager
EOF
sh "$TMP/harness"
test ! -e "$TMP/prewarm"
test ! -e "$TMP/sync"
test "$(wc -l <"$TMP/checks")" -eq 3
TEST_USB_STATE=absent sh "$TMP/harness"
test "$(wc -l <"$TMP/sync")" -eq 1
TEST_DEVICE=replaced_ncm sh "$TMP/harness"
test "$(wc -l <"$TMP/sync")" -eq 2
test ! -e "$TMP/prewarm"
echo 'PASS: unchanged device avoids full sync/prewarm; USB/interface changes resync; recovery, health and temperature checks retained'
