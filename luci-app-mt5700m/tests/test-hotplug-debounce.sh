#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
HOTPLUG="${ROOT}/root/etc/hotplug.d/usb/60-mt5700m"
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT INT TERM

fail() {
	echo "FAIL: $*" >&2
	exit 1
}

cat > "${TMP}/manager" <<'EOF'
#!/bin/sh
printf '%s\n' "$1" >> "${MT5700M_TEST_LOG}"
EOF
chmod 0755 "${TMP}/manager"
: > "${TMP}/commands"

export MT5700M_USB_HELPER="${ROOT}/root/usr/share/mt5700m/usb.sh"
export MT5700M_MANAGER="${TMP}/manager"
export MT5700M_HOTPLUG_STATE="${TMP}/state"
export MT5700M_HOTPLUG_DELAY=0
export MT5700M_HOTPLUG_COOLDOWN=1
export MT5700M_TEST_LOG="${TMP}/commands"

for event in 1 2 3 4 5 6; do
	ACTION=add PRODUCT=3466/3301/1 sh "${HOTPLUG}"
done
sleep 2

[ "$(wc -l < "${TMP}/commands" | tr -d ' ')" = '1' ] ||
	fail 'composite USB events scheduled more than one synchronization'
grep -qx 'sync' "${TMP}/commands" ||
	fail 'hotplug worker did not request a manager synchronization'

ACTION=add PRODUCT=1234/5678/1 sh "${HOTPLUG}"
sleep 1
[ "$(wc -l < "${TMP}/commands" | tr -d ' ')" = '1' ] ||
	fail 'unrelated USB product scheduled a synchronization'

echo 'MT5700M hotplug debounce tests passed'
