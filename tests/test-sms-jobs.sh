#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir "$TMP/bin"
cat >"$TMP/usb.sh" <<'EOF'
mt5700m_pcui_port() { echo /dev/fake; }
mt5700m_port_is_pcui() { return 0; }
EOF
cat >"$TMP/bin/mt5700m-transport" <<'EOF'
#!/bin/sh
sleep 2
echo 'SMS submitted: 1 part(s)'
EOF
chmod +x "$TMP/bin/mt5700m-transport"
export PATH="$TMP/bin:$PATH"
export MT5700M_USB_HELPER="$TMP/usb.sh"
export MT5700M_SMS_JOB_DIR="$TMP/jobs"
export MT5700M_ACTION_LOCK="$TMP/action.lock"
export MT5700M_READ_CACHE_DIR="$TMP/cache"
helper="$ROOT/luci-app-mt5700m/root/usr/sbin/mt5700m-at"
mkdir -p "$TMP/jobs/job.BLOCK1"
printf 'queued\n' >"$TMP/jobs/job.BLOCK1/state"
printf '%s\n' "$$" >"$TMP/jobs/job.BLOCK1/pid"
if sh "$helper" sms-send-start 12345 duplicate >"$TMP/duplicate.out" 2>&1; then exit 1; fi
grep -q 'Another SMS job is pending' "$TMP/duplicate.out"
printf 'done\n' >"$TMP/jobs/job.BLOCK1/state"
job=$(sh "$helper" sms-send-start 12345 fake-text | sed -n 's/^job=//p')
test -n "$job"
for i in 1 2 3 4 5 6 7 8; do
 status=$(sh "$helper" sms-send-status "$job")
 if printf '%s\n' "$status" | grep -q '^state=done$'; then break; fi
 sleep 1
done
printf '%s\n' "$status" | grep -q '^code=0$'
test ! -e "$TMP/jobs/$job/body"
test ! -e "$TMP/jobs/$job/number"
if sh "$helper" sms-send-status '../bad' >/dev/null 2>&1; then exit 1; fi
echo 'PASS: asynchronous SMS job, duplicate guard, private request cleanup and path rejection'
