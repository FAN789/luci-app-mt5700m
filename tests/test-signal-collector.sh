#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
testroot="$(mktemp -d)"
trap 'rm -rf "${testroot}"' EXIT INT TERM
mkdir -p "$testroot/cache"
export TEST_ROOT="$testroot"
export MT5700M_AT_HELPER="$testroot/fake-at"
export MT5700M_READ_CACHE_DIR="$testroot/cache"
export MT5700M_ACTION_LOCK="$testroot/action.lock"
export MT5700M_LOCK_HELPER="$ROOT/luci-app-mt5700m/root/usr/share/mt5700m/lock.sh"
reader="$ROOT/luci-app-mt5700m/root/usr/sbin/mt5700m-read"
collector="$ROOT/luci-app-mt5700m/root/usr/sbin/mt5700m-signal"
cat >"$testroot/fake-at" <<'EOF'
#!/bin/sh
exec 9>"$MT5700M_ACTION_LOCK"
flock -n 9 || exit 75
echo call >>"$TEST_ROOT/calls"
[ ! -f "$TEST_ROOT/fail" ] || exit 124
printf 'sysmode=NR\nrsrp=-98\nsinr=8\n'
EOF
chmod 700 "$testroot/fake-at"
: >"$testroot/calls"
if sh "$reader" signal > /dev/null 2>&1; then exit 1; fi
test "$(wc -l <"$testroot/calls")" -eq 0
sh "$collector" once
for i in 1 2 3 4 5 6 7 8; do sh "$reader" signal >"$testroot/read-$i" & done
wait
test "$(wc -l <"$testroot/calls")" -eq 1
for i in 1 2 3 4 5 6 7 8; do cmp "$testroot/read-1" "$testroot/read-$i"; done
before="$(sha256sum "$testroot/cache/signal.cache")"
touch "$testroot/fail"
if sh "$collector" once; then exit 1; fi
test "$before" = "$(sha256sum "$testroot/cache/signal.cache")"
rm "$testroot/fail"
(
 exec 9>"$MT5700M_ACTION_LOCK"; flock -n 9
 if sh "$collector" once; then exit 1; else test "$?" -eq 75; fi
)
test "$(wc -l <"$testroot/calls")" -eq 2
test "$before" = "$(sha256sum "$testroot/cache/signal.cache")"
(
 exec 7>"$testroot/cache/collector.flock"; flock -n 7
 if sh "$collector" once; then exit 1; else test "$?" -eq 75; fi
)
test "$(wc -l <"$testroot/calls")" -eq 2
printf 'sysmode=NR\nsampled_at=%s\n' "$(( $(date +%s) - 31 ))" >"$testroot/cache/signal.cache"
if sh "$reader" signal >/dev/null; then exit 1; fi
test "$(wc -l <"$testroot/calls")" -eq 2
echo 'PASS: cold/stale reads never query AT; 8 clients share one snapshot; failure preserves cache; busy action skips; duplicate collector excluded'

# The real signal action must skip an SMS-owned action lock before any AT I/O.
(
 exec 9>"$MT5700M_ACTION_LOCK"; flock -n 9
 if sh "$ROOT/luci-app-mt5700m/root/usr/sbin/mt5700m-at" signal >"$testroot/busy.out" 2>/dev/null; then exit 1; else test "$?" -eq 75; fi
 test ! -s "$testroot/busy.out"
)
# Exercise actual daemon retry scheduling without waiting or touching hardware.
mkdir -p "$testroot/bin"
cat >"$testroot/loop-at" <<'EOF'
#!/bin/sh
n="$(cat "$TEST_ROOT/attempt" 2>/dev/null || echo 0)"; n=$((n+1)); echo "$n" >"$TEST_ROOT/attempt"
case "$n" in 1|2) exit 124 ;; 4) exit 75 ;; esac
printf 'sysmode=NR\nrsrp=-98\n'
EOF
cat >"$testroot/bin/sleep" <<'EOF'
#!/bin/sh
echo "$1" >>"$TEST_ROOT/delays"
if [ "$(wc -l <"$TEST_ROOT/delays")" -ge 4 ]; then kill -TERM "$PPID"; fi
EOF
chmod 700 "$testroot/loop-at" "$testroot/bin/sleep"
MT5700M_AT_HELPER="$testroot/loop-at" PATH="$testroot/bin:$PATH" sh "$collector" run
[ "$(tr '\n' ' ' <"$testroot/delays")" = '10 15 5 5 ' ]
echo 'PASS: real signal skips SMS lock; daemon failures back off and success/busy restore normal cadence'
