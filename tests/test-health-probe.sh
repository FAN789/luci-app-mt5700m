#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
. "$ROOT/luci-app-mt5700m/root/usr/share/mt5700m/health.sh"
printf 100 > "$TMP/clock"
health_now() { cat "$TMP/clock"; }
CURL_RC=28
curl() {
    local limit=0 ipv4=0 bound=0
    while [ "$#" -gt 0 ]; do
        case "$1" in
            -4) ipv4=1;;
            --interface) shift; [ "$1" = eth2 ]; bound=1;;
            --max-time) shift; limit="$1";;
            -k|--insecure) return 99;;
        esac
        shift
    done
    [ "$ipv4$bound" = 11 ]; [ "$limit" -ge 1 ]; [ "$limit" -le 2 ]
    printf '%s' "$(($(health_now)+limit))" > "$TMP/clock"
    echo "$limit" >> "$TMP/calls"
    [ "$CURL_RC" = 0 ] && printf 200
    return "$CURL_RC"
}
health_probe eth2 3 && exit 1
test "$(health_now)" = 103
test "$(cat "$TMP/calls")" = "$(printf '2\n1')"
# A TLS validation failure is not connectivity, and still obeys the budget.
CURL_RC=60
health_probe eth2 1 && exit 1
test "$(health_now)" = 104
CURL_RC=0
health_probe eth2 1
test "$(health_now)" = 105
echo 'PASS: IPv4/interface binding, strict TLS and shared probe deadline'
