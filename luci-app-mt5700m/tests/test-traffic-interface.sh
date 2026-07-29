#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TRAFFIC="${ROOT}/root/usr/sbin/mt5700m-traffic"
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT INT TERM

mkdir -p "${TMP}/bin" "${TMP}/sys/wwan42/statistics" "${TMP}/runtime" "${TMP}/etc"
printf '1000\n' >"${TMP}/sys/wwan42/statistics/rx_bytes"
printf '500\n' >"${TMP}/sys/wwan42/statistics/tx_bytes"

cat >"${TMP}/bin/uci" <<'EOF'
#!/bin/sh
case "$*" in
	'-q get network.MT5700M.device') echo wwan42 ;;
	*) exit 1 ;;
esac
EOF
chmod 0755 "${TMP}/bin/uci"

PATH="${TMP}/bin:${PATH}" \
MT5700M_TRAFFIC_SYS_CLASS_NET="${TMP}/sys" \
MT5700M_TRAFFIC_RUNTIME_DIR="${TMP}/runtime" \
MT5700M_TRAFFIC_HISTORY_FILE="${TMP}/etc/history" \
	sh "${TRAFFIC}" update '' 10 20 2026-07-30 12:00

output="$(PATH="${TMP}/bin:${PATH}" \
	MT5700M_TRAFFIC_SYS_CLASS_NET="${TMP}/sys" \
	MT5700M_TRAFFIC_RUNTIME_DIR="${TMP}/runtime" \
	MT5700M_TRAFFIC_HISTORY_FILE="${TMP}/etc/history" \
	sh "${TRAFFIC}" json)"
printf '%s\n' "${output}" | grep -q '"name":"wwan42"'
printf '%s\n' "${output}" | grep -q '"rx":10'
printf '%s\n' "${output}" | grep -q '"tx":20'

echo 'dynamic traffic interface tests passed'
