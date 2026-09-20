#!/bin/sh
# Durable pre-change journal. Never source it or log its secret parameters.
PROFILE_JOURNAL="${MT5700M_PROFILE_JOURNAL:-/etc/mt5700m/profile-rollback}"
profile_valid() {
    printf '%s\n' "$1" | LC_ALL=C grep -Eq '^(0|[01],[12],"(IP|IPV6|IPV4V6)","[^",[:cntrl:]]*","[^",[:cntrl:]]*","[^",[:cntrl:]]*",[0-3])$'
}
profile_restore_uci() (
    local old="$1" enabled mode protocol apn username password auth
    [ "$old" != 0 ] || { uci -q set mt5700m.connection.enabled=0 && uci -q commit mt5700m; return $?; }
    set -f; IFS=,; set -- $old; unset IFS
    [ "$#" -eq 7 ] || return 1
    enabled="$1"; mode="$2"; protocol="${3#\"}"; protocol="${protocol%\"}"
    apn="${4#\"}"; apn="${apn%\"}"; username="${5#\"}"; username="${username%\"}"
    password="${6#\"}"; password="${password%\"}"; auth="$7"
    case "$protocol" in IP) protocol=ip;; IPV6) protocol=ipv6;; IPV4V6) protocol=ipv4v6;; esac
    case "$auth" in 0) auth=none;; 1) auth=pap;; 2) auth=chap;; 3) auth=auto;; esac
    uci -q set "mt5700m.connection.enabled=$enabled" &&
    uci -q set "mt5700m.connection.pdp_type=$protocol" &&
    uci -q set "mt5700m.connection.apn=$apn" &&
    uci -q set "mt5700m.connection.username=$username" &&
    uci -q set "mt5700m.connection.password=$password" &&
    uci -q set "mt5700m.connection.auth=$auth" && uci -q commit mt5700m
)
recover_profile_transaction() {
    local old current
    [ -f "$PROFILE_JOURNAL" ] || return 0
    old="$(cat "$PROFILE_JOURNAL")"; profile_valid "$old" || { log_message 'profile recovery journal invalid; refusing writes'; return 1; }
    "${AT_HELPER}" command 'AT^SETAUTODIAL=0' >/dev/null 2>&1 || return 1
    if [ "$old" != 0 ]; then
        "${AT_HELPER}" command "AT^SETAUTODIAL=$old" >/dev/null 2>&1 || return 1
    fi
    current="$("${AT_HELPER}" command 'AT^SETAUTODIAL?' 2>/dev/null | sed -n 's/^\^SETAUTODIAL: *//p' | tr -d '\r')"
    [ "$current" = "$old" ] || { log_message 'profile rollback not confirmed; journal retained'; return 1; }
    profile_restore_uci "$old" || return 1
    rm -f "$PROFILE_JOURNAL"
    log_message 'previous modem profile restored and verified'
}
apply_profile_transaction() (
    local desired="$1" old current
    recover_profile_transaction || return 1
    profile_valid "$desired" || { log_message 'invalid desired profile; refusing writes'; return 1; }
    old="$("${AT_HELPER}" command 'AT^SETAUTODIAL?' 2>/dev/null | sed -n 's/^\^SETAUTODIAL: *//p' | tr -d '\r')"
    profile_valid "$old" || { log_message 'cannot snapshot modem profile; refusing writes'; return 1; }
    [ "$old" != "$desired" ] || return 0
    umask 077; mkdir -p "${PROFILE_JOURNAL%/*}" || return 1
    printf '%s\n' "$old" >"${PROFILE_JOURNAL}.new" && mv "${PROFILE_JOURNAL}.new" "$PROFILE_JOURNAL" || return 1
    sync
    trap 'recover_profile_transaction >/dev/null 2>&1 || true' EXIT
    trap 'exit 1' HUP INT TERM
    "${AT_HELPER}" command 'AT^SETAUTODIAL=0' >/dev/null 2>&1 || return 1
    sleep 1
    "${AT_HELPER}" command "AT^SETAUTODIAL=$desired" >/dev/null 2>&1 || return 1
    current="$("${AT_HELPER}" command 'AT^SETAUTODIAL?' 2>/dev/null | sed -n 's/^\^SETAUTODIAL: *//p' | tr -d '\r')"
    [ "$current" = "$desired" ] || { log_message 'new profile readback mismatch; rolling back'; return 1; }
    rm -f "$PROFILE_JOURNAL"
    trap - EXIT HUP INT TERM
)
