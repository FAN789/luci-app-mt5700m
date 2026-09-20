#!/bin/sh
# Called with both manager/action locks held. Only the cellular interface is
# repaired. Monotonic timers and /var/run state prevent clock-change storms.
health_now() { cut -d. -f1 /proc/uptime; }
health_get() { cat "${STATE_DIR}/health-$1" 2>/dev/null || echo 0; }
health_put() { mkdir -p "${STATE_DIR}"; printf '%s\n' "$2" >"${STATE_DIR}/health-$1.new"; mv "${STATE_DIR}/health-$1.new" "${STATE_DIR}/health-$1"; }
health_state() { health_put state "$1"; }
health_ipv4() { awk -F. 'NF==4 {for(i=1;i<=4;i++)if($i!~/^[0-9]+$/||$i>255)exit 1; if($0!="0.0.0.0")print}'; }
health_modem_address() {
    "${AT_HELPER}" command 'AT+CGPADDR=1' 2>/dev/null |
        sed -n 's/^+CGPADDR: *1,"\([0-9.]*\)".*/\1/p' | head -n 1 | health_ipv4
}
health_host_address() { ip -4 -o addr show dev "$1" 2>/dev/null | awk '{split($4,a,"/"); print a[1]}'; }
health_probe() {
    local target code
    command -v curl >/dev/null 2>&1 || return 2
    for target in https://www.baidu.com https://www.qq.com; do
        code="$(curl --interface "$1" --connect-timeout 2 --max-time 2 -s -o /dev/null -w '%{http_code}' "$target" 2>/dev/null)" || continue
        case "$code" in [1-5][0-9][0-9]) return 0;; esac
    done
    return 1
}
health_repair() {
    local now="$1" attempts last window
    last="$(health_get repair)"
    [ "$last" = 0 ] || [ $((now-last)) -ge 180 ] || { health_state cooldown; return 0; }
    window="$(health_get window)"
    if [ "$window" = 0 ] || [ $((now-window)) -ge 3600 ]; then health_put window "$now"; health_put attempts 0; fi
    attempts="$(health_get attempts)"
    [ "$attempts" -lt 3 ] || { health_state needs-attention; return 0; }
    # Save attempt before touching the link: a failed command must not loop.
    health_put repair "$now"; health_put attempts $((attempts+1))
    health_put failures 0; health_put mismatch 0
    if [ "$(health_get stage)" = 0 ]; then
        health_put stage 1
        health_state renewing-lease
        ifup "${INTERFACE}" >/dev/null 2>&1
        log_message 'cellular health: refreshing DHCP lease'
    else
        health_state recovering-session
        # Do not reapply APN or change WAN/firewall policy during recovery.
        set_ndis_session 0 >/dev/null 2>&1 || true
        sleep 2
        if set_ndis_session 1 >/dev/null 2>&1; then
            ifup "${INTERFACE}" >/dev/null 2>&1
            log_message 'cellular health: data session recovery requested'
        else
            health_state needs-attention
            log_message 'cellular health: session recovery failed'
        fi
    fi
}
check_data_health() {
    local now last dev modem host failures mismatch probe_rc
    [ "$(config_value enabled 1)" = 1 ] || { health_state disabled; return 0; }
    [ "$(config_value pdp_type ip)" != ipv6 ] || { health_state ipv6-not-probed; return 0; }
    now="$(health_now)"; last="$(health_get checked)"
    [ "$last" = 0 ] || [ $((now-last)) -ge 60 ] || return 0
    health_put checked "$now"
    dev="$(mt5700m_netdev || true)"
    [ -n "$dev" ] && interface_up "${INTERFACE}" || { health_state link-down; return 0; }
    modem="$(health_modem_address)"; host="$(health_host_address "$dev")"
    [ -n "$modem" ] || { health_state modem-unconfirmed; health_put mismatch 0; return 0; }
    if ! printf '%s\n' "$host" | grep -Fxq "$modem"; then
        mismatch="$(health_get mismatch)"; mismatch=$((mismatch+1)); health_put mismatch "$mismatch"
        health_state lease-mismatch
        [ "$mismatch" -lt 2 ] || health_repair "$now"
        return 0
    fi
    health_put mismatch 0
    if health_probe "$dev"; then
        health_state healthy; health_put verified "$now"; health_put failures 0; health_put stage 0
        # Retain hourly repair budget even after recovery to cap flapping.
        return 0
    else probe_rc=$?; fi
    [ "$probe_rc" != 2 ] || { health_state probe-unavailable; return 0; }
    failures="$(health_get failures)"; failures=$((failures+1)); health_put failures "$failures"
    health_state probe-failed
    [ "$failures" -lt 3 ] || health_repair "$now"
}
