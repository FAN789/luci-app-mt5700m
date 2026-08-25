#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
AT_HELPER="${ROOT}/root/usr/sbin/mt5700m-at"
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT INT TERM

fail() {
	echo "FAIL: $*" >&2
	exit 1
}

mkdir -p "${TMP}/bin"

cat > "${TMP}/bin/uci" <<'EOF'
#!/bin/sh
key=''
for argument in "$@"; do key="${argument}"; done
case "${key}" in
	mt5700m.settings.enabled) echo 1 ;;
	mt5700m.settings.mode) echo network ;;
	mt5700m.settings.host) echo 192.0.2.1 ;;
	mt5700m.settings.port) echo 20249 ;;
	mt5700m.settings.timeout) echo 8 ;;
	*) exit 1 ;;
esac
EOF

cat > "${TMP}/bin/nc" <<'EOF'
#!/bin/sh
command="$(tr -d '\r\n')"
printf '%s\n' "${command}" >> "${MT5700M_TEST_LOG}"
case "${command}" in
	'AT^LTEFREQLOCK?')
		echo "^LTEFREQLOCK: ${MT5700M_TEST_LTE_LOCK:-0}"
		echo OK
		;;
	'AT^NRFREQLOCK?')
		echo "^NRFREQLOCK: ${MT5700M_TEST_NR_LOCK:-0}"
		echo OK
		;;
	'AT^CELLSCAN=3')
		echo '^CELLSCAN: 3,"46000",3500000,321,4E,00AB,0,0,0,0,1,-91,-18,24,'
		echo OK
		;;
	*)
		echo OK
		;;
esac
EOF

chmod 0755 "${TMP}/bin/uci" "${TMP}/bin/nc"
export PATH="${TMP}/bin:${PATH}"
export MT5700M_TEST_LOG="${TMP}/commands"
export MT5700M_USB_HELPER="${ROOT}/root/usr/share/mt5700m/usb.sh"
export MT5700M_READ_CACHE_DIR="${TMP}/read-cache"

expect_command() {
	expected="$1"
	shift
	: > "${MT5700M_TEST_LOG}"
	sh "${AT_HELPER}" "$@" >/dev/null
	grep -Fqx "${expected}" "${MT5700M_TEST_LOG}" ||
		fail "$* did not emit ${expected}"
}

expect_rejected() {
	: > "${MT5700M_TEST_LOG}"
	if sh "${AT_HELPER}" "$@" >/dev/null 2>&1; then
		fail "$* was accepted unexpectedly"
	fi
	[ ! -s "${MT5700M_TEST_LOG}" ] || fail "$* emitted an AT command before rejection"
}

: > "${MT5700M_TEST_LOG}"
scan="$(MT5700M_CELL_SCAN_DIR="${TMP}/scan" sh "${AT_HELPER}" cellscan)"
printf '%s\n' "${scan}" | grep -q '^\^CELLSCAN:' || fail 'cell scan result was not returned'
cat > "${TMP}/expected-scan" <<'EOF'
AT^LTEFREQLOCK?
AT^NRFREQLOCK?
AT+COPS=2
AT^CELLSCAN=3
AT+COPS=0
EOF
cmp "${TMP}/expected-scan" "${MT5700M_TEST_LOG}" || fail 'cell scan command sequence is incorrect'

: > "${MT5700M_TEST_LOG}"
MT5700M_CELL_SCAN_DIR="${TMP}/async-scan" sh "${AT_HELPER}" cellscan-start >/dev/null
attempt=0
while :; do
	state="$(MT5700M_CELL_SCAN_DIR="${TMP}/async-scan" sh "${AT_HELPER}" cellscan-status | sed -n 's/^state=//p')"
	[ "${state}" = 'done' ] && break
	[ "${state}" != 'error' ] || fail 'asynchronous cell scan worker failed'
	attempt=$((attempt + 1))
	[ "${attempt}" -lt 20 ] || fail 'asynchronous cell scan worker timed out'
	sleep 0.1
done
MT5700M_CELL_SCAN_DIR="${TMP}/async-scan" sh "${AT_HELPER}" cellscan-result |
	grep -q '^\^CELLSCAN:' || fail 'asynchronous scan result is unavailable'

: > "${MT5700M_TEST_LOG}"
if MT5700M_TEST_LTE_LOCK=3 MT5700M_CELL_SCAN_DIR="${TMP}/scan" \
	sh "${AT_HELPER}" cellscan >"${TMP}/locked.out" 2>"${TMP}/locked.err"; then
	fail 'cell scan was allowed while LTE lock was active'
fi
grep -q 'Remove the active frequency or cell lock' "${TMP}/locked.err" ||
	fail 'active lock error is not actionable'
grep -qx 'AT^LTEFREQLOCK?' "${MT5700M_TEST_LOG}" ||
	fail 'locked scan changed modem registration state'

: > "${MT5700M_TEST_LOG}"
sh "${AT_HELPER}" advanced-set radio-policy 0803 3FFFFFFF 1 2 7FFFFFFFFFFFFFFF >/dev/null
grep -qx 'AT^SYSCFGEX="0803",3FFFFFFF,1,2,7FFFFFFFFFFFFFFF,,' "${MT5700M_TEST_LOG}" ||
	fail 'radio policy command does not match MT5700M command contract'

[ "$(sh "${AT_HELPER}" preview-lock lte 2 3 1850 100)" = 'AT^LTEFREQLOCK=2,0,1,"3","1850","100"' ] ||
	fail 'LTE cell-lock command is incorrect'
[ "$(sh "${AT_HELPER}" preview-lock nr 2 78 630000 1 321)" = 'AT^NRFREQLOCK=2,0,1,"78","630000","1","321"' ] ||
	fail 'NR cell-lock command is incorrect'

for group in connection connection-settings session radio radio-diagnostics hardware all; do
	sh "${AT_HELPER}" advanced "${group}" >/dev/null ||
		fail "advanced read group ${group} failed"
done
for read_command in status network system sms-list sms-info; do
	sh "${AT_HELPER}" "${read_command}" >/dev/null ||
		fail "read command ${read_command} failed"
done

mkdir -p "${MT5700M_READ_CACHE_DIR}"
: >"${MT5700M_READ_CACHE_DIR}/status.cache"
: >"${MT5700M_READ_CACHE_DIR}/status.time"
: >"${MT5700M_READ_CACHE_DIR}/session.cache"
: >"${MT5700M_READ_CACHE_DIR}/session.time"
expect_command 'AT^TDPCIELANCFG=2' advanced-set nic-speed 2
[ ! -e "${MT5700M_READ_CACHE_DIR}/status.cache" ] || fail 'write did not invalidate the status cache'
[ ! -e "${MT5700M_READ_CACHE_DIR}/session.cache" ] || fail 'write did not invalidate the session cache'
[ ! -e "${MT5700M_READ_CACHE_DIR}/status.time" ] || fail 'write did not invalidate the status timestamp'
[ ! -e "${MT5700M_READ_CACHE_DIR}/session.time" ] || fail 'write did not invalidate the session timestamp'
expect_command 'AT^TDPMCFG=1,0,0,0' advanced-set pcie-controller 1
expect_command 'AT^LEDSWITCH=1' advanced-set led 1
expect_command 'AT^SETMODE=4' advanced-set usb-mode 4
expect_command 'AT^TDCFG="infcfg","mode",2' advanced-set interface-mode 2
expect_command 'AT^TDCFG="infcfg","PostRoute",2' advanced-set postroute 2
expect_command 'AT^TDCFG="infcfg","dmz","192.0.2.2"' advanced-set dmz 192.0.2.2
expect_command 'AT^TDSIMHP=1' advanced-set sim-hotplug 1
expect_command 'AT^HVSST=1,1' advanced-set sim-activation 1
expect_command 'AT^SCICHG=0,1' advanced-set sim-slot 0
expect_command 'AT^THERMAUTOFUN=1,0,2' advanced-set thermal 1 2
expect_command 'AT^THERMLDLOGSW=0,1' advanced-set thermal-log 0 1
expect_command 'AT^THERMLDAUTOPARA=60,70,65,80,75,90,85,100,95' advanced-set thermal-thresholds 60 70 65 80 75 90 85 100 95
expect_command 'AT^NRRCCAPCFG=3,1' advanced-set carrier-aggregation 1
expect_command 'AT^NRRCCAPCFG=2,3' advanced-set vonr 3
expect_command 'AT^NRRCCAPCFG=5,0,1' advanced-set dss 0 1
expect_rejected advanced-set direct-ip 0
expect_command 'AT+CGDCONT=2,"IPV4V6","internet"' pdp-set 2 IPV4V6 internet
expect_command 'AT+CGDCONT=2' pdp-remove 2
expect_command 'AT+CGACT=1,2' pdp-state 1 2
expect_command 'AT^NDISDUP=1,0' ndis 0
expect_command 'AT^NDISDUP=1,1' ndis 1
expect_rejected ndis 2
expect_command 'AT^DSFLOWCLR' flow-clear
expect_command 'AT+CFUN=0' airplane 0
expect_command 'AT+CPIN="1234"' sim-pin verify 1234
expect_command 'AT+CLCK="SC",1,"1234"' sim-pin enable 1234
expect_command 'AT+CPWD="SC","1234","5678"' sim-pin change 1234 5678
expect_command 'AT+CPIN="12345678","5678"' sim-pin unblock 12345678 5678
expect_command 'AT&F0' factory-reset
expect_command 'AT^PHYNUM=IMEI,123456789012345' set-imei 123456789012345
expect_command 'AT^FOTASTATE?' fota-state
expect_command 'AT^FOTADLQ' fota-progress
expect_command 'AT^FOTADL=1' fota-resume
expect_command 'AT^FWUP' fota-upgrade
expect_command 'AT^RESET' restart

echo 'MT5700M command contract tests passed'
