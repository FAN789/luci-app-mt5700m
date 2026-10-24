#!/bin/sh
# Automatic NDIS recovery; sourced after health.sh, under manager/action locks.
session_wait_verified() {
    local dev="$1" deadline remaining address carrier
    deadline=$(($(health_now)+${2:-30}))
    while :; do
        remaining=$((deadline-$(health_now)))
        [ "$remaining" -gt 0 ] || return 1
        carrier="$(cat "${MT5700M_NET_SYSFS:-/sys/class/net}/${dev}/carrier" 2>/dev/null || echo 0)"
        address="$(health_host_address "$dev")"
        if [ "$carrier" = 1 ] && [ -n "$address" ] && health_probe "$dev" "$remaining"; then
            return 0
        fi
        [ "$(health_now)" -lt "$deadline" ] || return 1
        sleep 1
    done
}

recover_ndis_link() {
    local netdev carrier reason now rc
    [ "$(config_value enabled 1)" = 1 ] || return 0
    netdev="$(mt5700m_netdev || true)"
    [ -n "$netdev" ] || return 1
    carrier="$(cat "${MT5700M_NET_SYSFS:-/sys/class/net}/${netdev}/carrier" 2>/dev/null || echo 0)"
    if [ "$carrier" = 1 ]; then
        if [ ! -e "$NDIS_SYNC_MARKER" ]; then
            # Never tear down a live carrier just because /var/run was lost.
            # Reuse the throttled health probe, including its repair budget.
            check_data_health
            if [ "$(health_get state)" = healthy ]; then
                mkdir -p "$STATE_DIR"
                touch "$NDIS_SYNC_MARKER"
                log_message 'NDIS sync: existing Internet connection verified'
            fi
        fi
        return 0
    fi
    now="$(health_now)"
    # Shared with health_repair: 180s minimum interval, at most 3/hour total.
    health_claim_repair "$now" || return 0
    reason=carrier-loss
    [ -e "$NDIS_SYNC_MARKER" ] || reason=host-start
    log_message "NDIS recovery: begin reason=$reason"
    rm -f "$NDIS_SYNC_MARKER"
    bring_down
    if set_ndis_session 0; then rc=0; else rc=$?; fi
    log_message "NDIS recovery: step=stop rc=$rc"
    [ "$rc" = 0 ] || { bring_up; return 1; }
    sleep 2
    if apply_profile; then rc=0; else rc=$?; fi
    log_message "NDIS recovery: step=profile rc=$rc"
    [ "$rc" = 0 ] || { bring_up; return 1; }
    if set_ndis_session 1; then rc=0; else rc=$?; fi
    log_message "NDIS recovery: step=start rc=$rc"
    bring_up
    # A timeout is ambiguous, not permission to repeat the command. Observe
    # address/carrier/HTTPS for <=30s including probe time, even after an OK.
    case "$rc" in 0|124) ;; *) return 1;; esac
    if ! session_wait_verified "$netdev" 30; then
        health_state session-unconfirmed
        log_message "NDIS recovery: Internet not verified after step=start rc=$rc"
        return 1
    fi
    mkdir -p "$STATE_DIR"
    touch "$NDIS_SYNC_MARKER" "$NDIS_RECOVERY_MARKER"
    health_state healthy
    health_put verified "$(health_now)"
    health_put checked "$(health_now)"
    health_put failures 0
    health_put stage 0
    log_message "NDIS recovery: Internet verified after step=start rc=$rc"
}
