#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
READ_HELPER="${ROOT}/root/usr/sbin/mt5700m-read"
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT INT TERM

fail() {
	echo "FAIL: $*" >&2
	exit 1
}

cat >"${TMP}/fake-at" <<'EOF'
#!/bin/sh
count="$(cat "${MT5700M_TEST_COUNT}" 2>/dev/null || echo 0)"
count=$((count + 1))
printf '%s\n' "${count}" >"${MT5700M_TEST_COUNT}"
sleep "${MT5700M_TEST_DELAY:-0}"
printf 'snapshot=%s\n' "${count}"
printf 'action=%s\n' "$*"
EOF
chmod 0755 "${TMP}/fake-at"

export MT5700M_AT_HELPER="${TMP}/fake-at"
export MT5700M_READ_CACHE_DIR="${TMP}/cache"
export MT5700M_READ_CACHE_TTL=1
export MT5700M_READ_CACHE_MAX_STALE=30
export MT5700M_TEST_COUNT="${TMP}/count"
export MT5700M_TEST_DELAY=1

first="$(sh "${READ_HELPER}" status)"
printf '%s\n' "${first}" | grep -qx 'snapshot=1' || fail 'first status snapshot is missing'
printf '%s\n' "${first}" | grep -qx 'action=status' || fail 'status action was not forwarded'
[ "$(cat "${MT5700M_TEST_COUNT}")" = 1 ] || fail 'first status read ran more than once'
permissions="$(ls -l "${MT5700M_READ_CACHE_DIR}/status.cache" | awk '{ print $1 }')"
[ "${permissions}" = '-rw-------' ] || fail 'snapshot permissions are not private'

second="$(sh "${READ_HELPER}" status)"
[ "${second}" = "${first}" ] || fail 'fresh cache did not return the same snapshot'
[ "$(cat "${MT5700M_TEST_COUNT}")" = 1 ] || fail 'fresh cache invoked the modem again'

sleep 2
stale="$(sh "${READ_HELPER}" status)"
[ "${stale}" = "${first}" ] || fail 'stale cache was not returned immediately'

attempt=0
while [ "$(cat "${MT5700M_TEST_COUNT}")" -lt 2 ]; do
	attempt=$((attempt + 1))
	[ "${attempt}" -lt 5 ] || fail 'background refresh did not start'
	sleep 1
done
sleep 1
refreshed="$(sh "${READ_HELPER}" status)"
printf '%s\n' "${refreshed}" | grep -qx 'snapshot=2' || fail 'background refresh did not replace the snapshot'

session="$(sh "${READ_HELPER}" advanced session)"
printf '%s\n' "${session}" | grep -qx 'action=advanced session' || fail 'session action was not cached independently'
[ -f "${MT5700M_READ_CACHE_DIR}/session.cache" ] || fail 'session cache was not created'
[ -f "${MT5700M_READ_CACHE_DIR}/session.time" ] || fail 'session timestamp was not created'

echo 'MT5700M read cache tests passed'
