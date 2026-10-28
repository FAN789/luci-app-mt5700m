#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
export PROFILE_TEST_DIR="$TMP"
AT_HELPER="$TMP/at"
cat >"$AT_HELPER" <<'EOF'
#!/bin/sh
[ "$1" = command ] && [ "$2" = 'AT^SETAUTODIAL?' ] || { echo write >>"$PROFILE_TEST_DIR/writes"; exit 1; }
printf '^SETAUTODIAL: %s\r\nOK\r\n' "$(cat "$PROFILE_TEST_DIR/current")"
[ ! -f "$PROFILE_TEST_DIR/fail" ] || exit 124
EOF
chmod +x "$AT_HELPER"
. "$ROOT/luci-app-mt5700m/root/usr/share/mt5700m/profile.sh"
SAVED='1,1,"IPV4V6","","","",0'
saved_profile() { printf '%s\n' "$SAVED"; }
printf '%s\n' "$SAVED" >"$TMP/current"
profile_matches_saved
for value in '1,1,"IP","","","",0' '1,1,"IPV6","","","",0' '1,2,"IPV4V6","","","",0' '0'; do
  printf '%s\n' "$value" >"$TMP/current"
  if profile_matches_saved; then exit 1; else rc=$?; fi
  test "$rc" = 1
done
for value in 'ERROR' '1,1,"BOGUS","","","",0'; do
  printf '%s\n' "$value" >"$TMP/current"
  if profile_matches_saved; then exit 1; else rc=$?; fi
  test "$rc" = 2
done
test ! -e "$TMP/writes"
printf '%s\n' "$SAVED" >"$TMP/current"; touch "$TMP/fail"
if profile_matches_saved; then exit 1; else rc=$?; fi
test "$rc" = 2
echo 'PASS: exact saved/modem profile comparison, unknown refusal and zero modem writes'
