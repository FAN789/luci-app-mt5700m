#!/bin/sh
# One inherited flock protects complete operations, not just individual ATs.
# Kernel releases the lock after the last owning descriptor closes, even SIGKILL.
mt5700m_action_lock() {
	if [ "${MT5700M_ACTION_LOCKED:-0}" = 1 ] && [ -e /proc/self/fd/9 ]; then return 0; fi
	umask 077
	exec 9>"${MT5700M_ACTION_LOCK:-/var/lock/mt5700m-action.lock}" || return 1
	local attempts=0
	while ! flock -n 9; do
		attempts=$((attempts + 1))
		[ "${attempts}" -lt 6 ] || { echo 'Modem operation busy; retry later' >&2; exec 9>&-; return 75; }
		# Some KWRT BusyBox builds reject fractional sleep arguments.
		sleep 1
	done
	export MT5700M_ACTION_LOCKED=1
}
