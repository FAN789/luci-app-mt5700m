#!/bin/sh

set -eu

helper="${1:-$(dirname "$0")/../root/usr/share/mt5700m/usb.sh}"
fixture="$(mktemp -d /tmp/mt5700m-usb-test.XXXXXX)"
trap 'find "${fixture}" -depth -delete 2>/dev/null || true' EXIT

fail() {
	echo "FAIL: $*" >&2
	exit 1
}

make_tty() {
	local name="$1" interface_number="$2" protocol="$3" description="$4"
	local interface_dir="${fixture}/sys/devices/platform/usb/1-1/1-1:1.${interface_number}"

	mkdir -p "${interface_dir}" "${fixture}/sys/class/tty/${name}" "${fixture}/dev"
	printf '%s\n' 'ff' > "${interface_dir}/bInterfaceClass"
	printf '%s\n' '06' > "${interface_dir}/bInterfaceSubClass"
	printf '%s\n' "${protocol}" > "${interface_dir}/bInterfaceProtocol"
	printf '%s\n' "${description}" > "${interface_dir}/interface"
	ln -s "${interface_dir}" "${fixture}/sys/class/tty/${name}/device"
	: > "${fixture}/dev/${name}"
}

mkdir -p "${fixture}/sys/devices/platform/usb/1-1" "${fixture}/sys/bus/usb/devices"
printf '%s\n' '3466' > "${fixture}/sys/devices/platform/usb/1-1/idVendor"
printf '%s\n' '3301' > "${fixture}/sys/devices/platform/usb/1-1/idProduct"
ln -s "${fixture}/sys/devices/platform/usb/1-1" "${fixture}/sys/bus/usb/devices/1-1"

mkdir -p "${fixture}/sys/devices/platform/usb/1-1/1-1:2.0/net/wwan-test" "${fixture}/sys/class/net"
ln -s "${fixture}/sys/devices/platform/usb/1-1/1-1:2.0" "${fixture}/sys/bus/usb/devices/1-1:2.0"
ln -s "${fixture}/sys/devices/platform/usb/1-1/1-1:2.0/net/wwan-test" "${fixture}/sys/class/net/wwan-test"

make_tty ttyUSB6 2 10 'Application Interface'
make_tty ttyUSB7 3 12 'PC UI Interface'

MT5700M_SYSFS_ROOT="${fixture}/sys"
MT5700M_DEV_ROOT="${fixture}/dev"
export MT5700M_SYSFS_ROOT MT5700M_DEV_ROOT
. "${helper}"

[ "$(mt5700m_usb_info)" = 'normal|3301|1-1' ] || fail 'normal PID was not recognized'
device_speed="${fixture}/sys/devices/platform/usb/1-1/speed"
for speed in 480 5000 1.5; do
	printf '%s\n' "${speed}" > "${device_speed}"
	[ "$(mt5700m_usb_speed 1-1)" = "${speed}" ] || fail 'speed must follow the device attribute'
done
printf 'unknown\n' > "${device_speed}"
mt5700m_usb_speed 1-1 && fail 'malformed speed was accepted'
rm "${device_speed}"
mt5700m_usb_speed 1-1 2>/dev/null && fail 'missing speed was accepted'
[ "$(mt5700m_netdev)" = 'wwan-test' ] || fail 'MT5700M network interface was not discovered'
[ "$(mt5700m_pcui_port)" = "${fixture}/dev/ttyUSB7" ] || fail 'PCUI descriptor was not selected'
mt5700m_port_is_pcui "${fixture}/dev/ttyUSB6" && fail 'application interface was accepted as PCUI'

printf '%s\n' '3302' > "${fixture}/sys/devices/platform/usb/1-1/idProduct"
[ "$(mt5700m_usb_info)" = 'upgrade|3302|1-1' ] || fail 'upgrade PID was not recognized'
mt5700m_normal_slot >/dev/null 2>&1 && fail 'upgrade mode was treated as normal'

printf '%s\n' '3303' > "${fixture}/sys/devices/platform/usb/1-1/idProduct"
[ "$(mt5700m_usb_info)" = 'dump|3303|1-1' ] || fail 'dump PID was not recognized'

echo 'MT5700M USB detection tests passed.'
