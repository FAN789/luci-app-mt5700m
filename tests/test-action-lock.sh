#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
export MT5700M_ACTION_LOCK="$TMP/action.lock"
. "$ROOT/luci-app-mt5700m/root/usr/share/mt5700m/lock.sh"
(
 mt5700m_action_lock
 touch "$TMP/held"
 sleep 20
) &
owner=$!
while [ ! -e "$TMP/held" ]; do sleep 0.1; done
if (mt5700m_action_lock) 2>/dev/null; then echo 'FAIL: parallel owner'; exit 1; fi
# Kill holder and its sleeping child: no stale directory/PID recovery needed.
children=$(ps -o pid= --ppid "$owner" || true)
kill -KILL "$owner" $children
wait "$owner" 2>/dev/null || true
(mt5700m_action_lock)
echo 'PASS: complete-action exclusion and killed-owner lock recovery'
