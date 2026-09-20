#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
export MOCK_PROFILE_DIR="$TMP"
MT5700M_PROFILE_JOURNAL="$TMP/private/rollback"
AT_HELPER="$TMP/at"
cat >"$AT_HELPER" <<'EOF'
#!/bin/sh
case "$2" in
 'AT^SETAUTODIAL?') printf '^SETAUTODIAL: %s\r\nOK\r\n' "$(cat "$MOCK_PROFILE_DIR/current")";;
 'AT^SETAUTODIAL='*)
  case "$2" in *'"new"'*) [ ! -f "$MOCK_PROFILE_DIR/fail" ] || exit 1;; esac
  printf '%s\n' "${2#AT^SETAUTODIAL=}" >"$MOCK_PROFILE_DIR/current";;
 *) exit 64;;
esac
EOF
chmod +x "$AT_HELPER"
uci() { printf '%s\n' "$*" >>"$TMP/uci"; }
log_message() { :; }
sleep() { :; }
sync() { :; }
. "$ROOT/luci-app-mt5700m/root/usr/share/mt5700m/profile.sh"
old='1,1,"IP","old","test-user","test-password",1'
new='1,1,"IP","new","","",0'
printf '%s\n' "$old" >"$TMP/current"
touch "$TMP/fail"
if apply_profile_transaction "$new"; then echo 'expected failure'; exit 1; fi
test "$(cat "$TMP/current")" = "$old"
test ! -f "$PROFILE_JOURNAL"
grep -q 'connection.apn=old' "$TMP/uci"
rm "$TMP/fail"
apply_profile_transaction "$new"
test "$(cat "$TMP/current")" = "$new"; test ! -f "$PROFILE_JOURNAL"
# Simulated abrupt power loss: durable old profile, modem already disabled.
printf '%s\n' "$old" >"$PROFILE_JOURNAL"; echo 0 >"$TMP/current"
recover_profile_transaction
test "$(cat "$TMP/current")" = "$old"; test ! -f "$PROFILE_JOURNAL"
printf 'invalid\n' >"$PROFILE_JOURNAL"
if recover_profile_transaction; then exit 1; fi
test "$(cat "$TMP/current")" = "$old"
echo 'PASS: failed apply rollback, verified success, crash journal recovery and invalid journal refusal'
