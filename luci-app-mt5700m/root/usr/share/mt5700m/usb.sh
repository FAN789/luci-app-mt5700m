#!/bin/sh

# MT5700M-CN USB identities documented by TD Tech:
#   3466:3301 normal, 3466:3302 upgrade, 3466:3303 dump.
MT5700M_USB_VENDOR='3466'
MT5700M_SYSFS_ROOT="${MT5700M_SYSFS_ROOT:-/sys}"
MT5700M_DEV_ROOT="${MT5700M_DEV_ROOT:-/dev}"

# Read the negotiated speed of the selected device, not its root hub.
mt5700m_usb_speed() {
	local slot="$1" speed
	case "${slot}" in ''|*[!0-9.-]*|.*) return 1 ;; esac
	read -r speed < "${MT5700M_SYSFS_ROOT}/bus/usb/devices/${slot}/speed" 2>/dev/null || return 1
	printf '%s\n' "${speed}" | grep -Ex '[1-9][0-9]*(\.[0-9]+)?'
}

mt5700m_usb_info() {
	local device vendor product slot state first=''

	for device in "${MT5700M_SYSFS_ROOT}/bus/usb/devices/"*; do
		[ -r "${device}/idVendor" ] && [ -r "${device}/idProduct" ] || continue
		vendor="$(tr 'A-F' 'a-f' < "${device}/idVendor" 2>/dev/null)"
		[ "${vendor}" = "${MT5700M_USB_VENDOR}" ] || continue
		product="$(tr 'A-F' 'a-f' < "${device}/idProduct" 2>/dev/null)"
		slot="${device##*/}"
		case "${product}" in
			3301) state='normal' ;;
			3302) state='upgrade' ;;
			3303) state='dump' ;;
			*) state='unknown' ;;
		esac
		[ "${state}" = 'normal' ] && {
			printf '%s|%s|%s\n' "${state}" "${product}" "${slot}"
			return 0
		}
		[ -n "${first}" ] || first="${state}|${product}|${slot}"
	done

	[ -n "${first}" ] || return 1
	printf '%s\n' "${first}"
}

mt5700m_normal_slot() {
	local info rest

	info="$(mt5700m_usb_info)" || return 1
	[ "${info%%|*}" = 'normal' ] || return 1
	rest="${info#*|}"
	printf '%s\n' "${rest#*|}"
}

mt5700m_netdev() {
	local slot netpath netdev

	slot="$(mt5700m_normal_slot)" || return 1
	for netpath in "${MT5700M_SYSFS_ROOT}/bus/usb/devices/${slot}"*/net/*; do
		[ -e "${netpath}" ] || continue
		netdev="${netpath##*/}"
		[ -d "${MT5700M_SYSFS_ROOT}/class/net/${netdev}" ] || continue
		printf '%s\n' "${netdev}"
		return 0
	done
	return 1
}

mt5700m_bind_network_driver() {
	local slot interface class subclass driver control=''

	slot="$(mt5700m_normal_slot)" || return 1
	if command -v modprobe >/dev/null 2>&1; then
		modprobe usbnet 2>/dev/null || true
		modprobe cdc_ether 2>/dev/null || true
		modprobe cdc_ncm 2>/dev/null || true
	fi

	# A dynamic option(usb-serial) ID matches the whole composite device. If
	# option loads before cdc_ncm it may incorrectly claim the CDC control/data
	# pair, leaving AT ports available but no eth device. Release those two
	# interfaces first and bind the NCM control interface explicitly.
	for interface in "${MT5700M_SYSFS_ROOT}/bus/usb/devices/${slot}:"*; do
		[ -d "${interface}" ] || continue
		class="$(tr 'A-F' 'a-f' < "${interface}/bInterfaceClass" 2>/dev/null || true)"
		subclass="$(tr 'A-F' 'a-f' < "${interface}/bInterfaceSubClass" 2>/dev/null || true)"
		case "${class}" in 02|0a) ;; *) continue ;; esac
		driver="$(basename "$(readlink -f "${interface}/driver" 2>/dev/null)" 2>/dev/null || true)"
		if [ -n "${driver}" ] && [ "${driver}" != 'cdc_ncm' ]; then
			[ -w "${interface}/driver/unbind" ] && printf '%s\n' "${interface##*/}" > "${interface}/driver/unbind" 2>/dev/null || true
		fi
		[ "${class}:${subclass}" = '02:0d' ] && control="${interface##*/}"
	done

	[ -n "${control}" ] || return 1
	driver="$(basename "$(readlink -f "${MT5700M_SYSFS_ROOT}/bus/usb/devices/${control}/driver" 2>/dev/null)" 2>/dev/null || true)"
	[ "${driver}" = 'cdc_ncm' ] && return 0
	[ -w "${MT5700M_SYSFS_ROOT}/bus/usb/drivers/cdc_ncm/bind" ] || return 1
	printf '%s\n' "${control}" > "${MT5700M_SYSFS_ROOT}/bus/usb/drivers/cdc_ncm/bind" 2>/dev/null
}

mt5700m_usb_device_dir_for_path() {
	local path

	path="$(readlink -f "$1" 2>/dev/null)" || return 1
	while [ -n "${path}" ] && [ "${path}" != '/' ]; do
		if [ -r "${path}/idVendor" ] && [ -r "${path}/idProduct" ]; then
			printf '%s\n' "${path}"
			return 0
		fi
		path="${path%/*}"
	done
	return 1
}

mt5700m_tty_interface_dir() {
	local tty_path path

	tty_path="${MT5700M_SYSFS_ROOT}/class/tty/${1##*/}/device"
	path="$(readlink -f "${tty_path}" 2>/dev/null)" || return 1
	while [ -n "${path}" ] && [ "${path}" != '/' ]; do
		if [ -r "${path}/bInterfaceClass" ] || [ -r "${path}/interface" ]; then
			printf '%s\n' "${path}"
			return 0
		fi
		path="${path%/*}"
	done
	return 1
}

mt5700m_port_belongs_to_normal() {
	local usb_dir vendor product

	[ -e "$1" ] || return 1
	usb_dir="$(mt5700m_usb_device_dir_for_path "${MT5700M_SYSFS_ROOT}/class/tty/${1##*/}/device")" || return 1
	vendor="$(tr 'A-F' 'a-f' < "${usb_dir}/idVendor" 2>/dev/null)"
	product="$(tr 'A-F' 'a-f' < "${usb_dir}/idProduct" 2>/dev/null)"
	[ "${vendor}:${product}" = '3466:3301' ]
}

mt5700m_port_is_pcui() {
	local interface_dir class subclass protocol description

	mt5700m_port_belongs_to_normal "$1" || return 1
	interface_dir="$(mt5700m_tty_interface_dir "$1")" || return 1
	class="$(tr 'A-F' 'a-f' < "${interface_dir}/bInterfaceClass" 2>/dev/null)"
	subclass="$(tr 'A-F' 'a-f' < "${interface_dir}/bInterfaceSubClass" 2>/dev/null)"
	protocol="$(tr 'A-F' 'a-f' < "${interface_dir}/bInterfaceProtocol" 2>/dev/null)"
	description="$(cat "${interface_dir}/interface" 2>/dev/null || true)"

	[ "${class}:${subclass}:${protocol}" = 'ff:06:12' ] && return 0
	case "${description}" in
		*[Pp][Cc]*[Uu][Ii]*|*[Pp][Cc]*-[[:space:]]*[Uu][Ii]*) return 0 ;;
	esac
	return 1
}

mt5700m_pcui_port() {
	local tty

	mt5700m_normal_slot >/dev/null || return 1
	for tty in "${MT5700M_DEV_ROOT}/ttyUSB"*; do
		[ -e "${tty}" ] || continue
		mt5700m_port_is_pcui "${tty}" || continue
		printf '%s\n' "${tty}"
		return 0
	done
	return 1
}

mt5700m_bind_serial_driver() {
	local new_id

	mt5700m_bind_network_driver >/dev/null 2>&1 || true
	mt5700m_pcui_port >/dev/null 2>&1 && return 0
	command -v modprobe >/dev/null 2>&1 && {
		modprobe usbserial 2>/dev/null || true
		modprobe option 2>/dev/null || true
	}

	for new_id in \
		"${MT5700M_SYSFS_ROOT}/bus/usb-serial/drivers/option1/new_id" \
		"${MT5700M_SYSFS_ROOT}/bus/usb-serial/drivers/option/new_id"; do
		[ -w "${new_id}" ] || continue
		printf '%s\n' '3466 3301' > "${new_id}" 2>/dev/null || true
		mt5700m_bind_network_driver >/dev/null 2>&1 || true
		return 0
	done
	return 1
}

mt5700m_path_matches_slot() {
	local path="$1" slot="$2"

	[ -n "${path}" ] && [ -n "${slot}" ] || return 1
	case "${path}" in
		*"/${slot}"|*"/${slot}/"*|*"/${slot}:"*) return 0 ;;
	esac
	return 1
}
