'use strict';
'require baseclass';
'require ui';
'require fs';

function section(raw, label) {
	var marker = '===== ' + label + ':', active = false, output = [];
	(raw || '').split(/\n/).forEach(function(line) {
		if (line.indexOf('===== ') === 0) {
			active = line.indexOf(marker) === 0;
			return;
		}
		if (active && line.trim() && line.trim() !== 'OK')
			output.push(line.trim());
	});
	return output.join('\n');
}

function pick(text, expression, fallback) {
	var match = (text || '').match(expression);
	return match ? match[1] : fallback;
}

function csvValues(text, prefix) {
	var line = (text || '').split(/\n/).filter(function(item) { return item.indexOf(prefix) === 0; })[0] || '';
	return line.substring(prefix.length).replace(/^[ :]+/, '').replace(/"/g, '').split(',').map(function(value) { return value.trim(); });
}

function hexIPv4(value) {
	if (!/^[0-9a-f]{8}$/i.test(value || ''))
		return '';
	return [ 6, 4, 2, 0 ].map(function(offset) { return parseInt(value.substr(offset, 2), 16); }).join('.');
}

function hexNumber(value) {
	value = String(value || '').replace(/^0x/i, '');
	if (!/^[0-9a-f]+$/i.test(value))
		return 0;
	if (value.length <= 8)
		return parseInt(value, 16);
	return parseInt(value.slice(0, -8), 16) * 4294967296 + parseInt(value.slice(-8), 16);
}

function formatBytes(value) {
	var units = [ 'B', 'KiB', 'MiB', 'GiB', 'TiB' ], index = 0;
	value = Math.max(0, Number(value) || 0);
	while (value >= 1024 && index < units.length - 1) { value /= 1024; index++; }
	return (index ? value.toFixed(value >= 10 ? 1 : 2) : String(Math.round(value))) + ' ' + units[index];
}

function formatDuration(seconds) {
	seconds = Math.max(0, Number(seconds) || 0);
	var days = Math.floor(seconds / 86400), hours = Math.floor(seconds % 86400 / 3600), minutes = Math.floor(seconds % 3600 / 60);
	return (days ? days + _('d') + ' ' : '') + (hours ? hours + _('h') + ' ' : '') + minutes + _('min');
}

function formatRate(value) {
	value = Number(value) || 0;
	if (value >= 1000000000) return (value / 1000000000).toFixed(2) + ' Gbps';
	if (value >= 1000000) return (value / 1000000).toFixed(1) + ' Mbps';
	return value ? Math.round(value / 1000) + ' Kbps' : '--';
}

function parseSession(raw) {
	var ndis = csvValues(section(raw, 'Data session'), '^NDISSTATQRY');
	var dhcp4 = csvValues(section(raw, 'IPv4 lease'), '^DHCP');
	var dhcp6 = csvValues(section(raw, 'IPv6 lease'), '^DHCPV6');
	var flow = csvValues(section(raw, 'Data flow'), '^DSFLOWQRY');
	var mtu = csvValues(section(raw, 'MTU'), '^CGMTU');
	var pdpAddress = csvValues(section(raw, 'PDP address'), '+CGPADDR');
	var capability = pick(section(raw, 'IP capability'), /\^IPV6CAP:\s*(\w+)/, '');
	var capabilityNames = { '1':_('IPv4 only'), '2':_('IPv6 only'), '7':_('IPv4 / IPv6 · same APN'), '0B':_('IPv4 / IPv6 · separate APNs'), '0b':_('IPv4 / IPv6 · separate APNs') };
	var detailed = (section(raw, 'Detailed sessions') || '').split(/\n/).map(function(line) {
		var match = line.match(/^\^DCONNSTAT:\s*(\d+)(?:[,，]["“”]?([^,"“”]*)["“”]?[,，](\d+)[,，](\d+)[,，](\d+)(?:[,，](\d+))?)?/);
		return match ? { cid:match[1], apn:match[2] || '', ipv4:match[3] === '1', ipv6:match[4] === '1', type:match[5] || '', ethernet:match[6] === '1' } : null;
	}).filter(function(item) { return item && item.apn; });

	return {
		ipv4Connected:ndis[0] === '1' && ndis[4] === 'IPV4',
		ipv6Connected:ndis[5] === '1' && ndis[8] === 'IPV6',
		ipv4Address:hexIPv4(dhcp4[0]) || pdpAddress[1] || '',
		ipv4Gateway:hexIPv4(dhcp4[2]),
		ipv4Dns:[ hexIPv4(dhcp4[4]), hexIPv4(dhcp4[5]) ].filter(Boolean).join(' · '),
		ipv6Address:dhcp6[0] && dhcp6[0] !== '::' ? dhcp6[0] : '',
		ipv6Dns:[ dhcp6[4], dhcp6[5] ].filter(function(value) { return value && value !== '::'; }).join(' · '),
		capability:capabilityNames[capability] || capability,
		mtu:mtu[1] && mtu[1] !== '0' ? mtu[1] : _('Network default'),
		currentDuration:hexNumber(flow[0]), currentTx:hexNumber(flow[1]), currentRx:hexNumber(flow[2]),
		totalDuration:hexNumber(flow[3]), totalTx:hexNumber(flow[4]), totalRx:hexNumber(flow[5]),
		maximumDown:dhcp4[6] || dhcp6[6], maximumUp:dhcp4[7] || dhcp6[7], detailed:detailed
	};
}

function select(options, value) {
	var node = E('select', { 'class': 'cbi-input-select' }, options.map(function(item) {
		return E('option', { 'value': item[0] }, item[1]);
	}));
	if (value != null)
		node.value = String(value);
	return node;
}

function confirmRun(title, message, args, restartRequired) {
	return ui.showModal(title, [
		E('p', {}, message),
		restartRequired ? E('div', { 'class': 'alert-message warning' }, _('A module restart or airplane-mode cycle is required before this change takes effect.')) : null,
		E('div', { 'class': 'right' }, [
			E('button', { 'type': 'button', 'class': 'btn', 'click': ui.hideModal }, _('Cancel')), ' ',
			E('button', {
				'type': 'button',
				'class': 'btn cbi-button-negative',
				'click': function() {
					ui.hideModal();
					execChecked('/usr/sbin/mt5700m-at', args).then(function() {
						ui.addNotification(null, E('p', {}, _('Settings applied.')));
						window.setTimeout(function() { window.location.reload(); }, 900);
					}, function(err) {
						ui.addNotification(null, E('p', {}, err.message || String(err)), 'danger');
					});
				}
			}, _('Apply'))
		])
	]);
}

function execChecked(path, args) {
	return fs.exec(path, args).then(function(result) {
		if (!result || result.code !== 0)
			throw new Error(result && result.stderr ? result.stderr.trim() : _('Command failed.'));
		return result;
	});
}

var smsBusy = false;
var smsPendingKey = 'mt5700m.sms.pending-job';

function pollSmsJob(job, attempt) {
	return execChecked('/usr/sbin/mt5700m-read', [ 'sms-send-status', job ]).then(function(result) {
		var output = result.stdout || '', state = (output.match(/^state=(.*)$/m) || [])[1];
		if (state === 'done') {
			window.localStorage.removeItem(smsPendingKey);
			if (!/^code=0$/m.test(output)) throw new Error(output.replace(/^state=.*\n|^code=.*\n/gm, '').trim() || _('SMS submission failed.'));
			return result;
		}
		if ((state !== 'queued' && state !== 'running') || attempt >= 1500)
			throw new Error(_('SMS result is unknown. Check the recipient before resending.'));
		return new Promise(function(resolve) { window.setTimeout(resolve, 1000); }).then(function() { return pollSmsJob(job, attempt + 1); });
	});
}

function sendSms(number, body) {
	if (smsBusy) return Promise.reject(new Error(_('A message is already being submitted.')));
	var pending;
	try { pending = window.localStorage.getItem(smsPendingKey); }
	catch (error) { return Promise.reject(new Error(_('Browser storage is unavailable. No message was sent.'))); }
	smsBusy = true;
	ui.showModal(_('Submitting SMS'), [ E('p', { 'class': 'spinning' }, _('Waiting for modem confirmation (up to 120 seconds per part). Do not send again.')) ]);
	var task;
	if (pending) {
		// After navigation/reload, resolve the previous job, never send a new
		// recipient/body while its outcome is still unknown.
		task = (pending === 'unknown' ? Promise.reject(new Error(_('SMS result is unknown. Check the recipient before resending.'))) : pollSmsJob(pending, 0)).then(function() {
			throw new Error(_('The previous message was submitted. No new message was sent.'));
		});
	} else {
		task = Promise.resolve().then(function() {
			// Persist intent BEFORE RPC: a lost start reply must not enable a
			// second submission after a refresh.
			window.localStorage.setItem(smsPendingKey, 'unknown');
			return execChecked('/usr/sbin/mt5700m-at', [ 'sms-send-start', number, body ]);
		}).then(function(result) {
			var job = (result.stdout || '').match(/^job=(job\.[a-zA-Z0-9]{6})$/m);
			if (!job) throw new Error(_('No SMS job confirmation received. Do not resend automatically.'));
			window.localStorage.setItem(smsPendingKey, job[1]);
			return pollSmsJob(job[1], 0);
		});
	}
	return task.then(function(result) { smsBusy = false; ui.hideModal(); return result; }, function(error) {
		smsBusy = false; ui.hideModal();
		var unresolved = false;
		try { unresolved = !!window.localStorage.getItem(smsPendingKey); } catch (ignored) {}
		if (unresolved) ui.showModal(_('SMS result needs checking'), [
			E('p', {}, _('Check the recipient and wait for any running task to finish before clearing the pending state. Clearing does not send a message.')),
			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'btn', 'click': ui.hideModal }, _('Keep pending')),
				E('button', { 'class': 'btn', 'click': function() { window.localStorage.removeItem(smsPendingKey); ui.hideModal(); } }, _('I checked; clear pending state'))
			])
		]);
		throw error;
	});
}

function row(label, input) {
	return E('div', { 'class': 'mt-control-row' }, [ E('label', {}, label), input ]);
}
function healthNode(manager) {
	manager = manager || {};
	var state = manager.health_status || 'unknown';
	var good = manager.internet_verified === true;
	return E('div', { 'class': 'alert-message ' + (good ? 'notice' : 'warning') }, [
		E('strong', {}, good ? _('Cellular Internet verified') : _('Cellular Internet not yet verified')),
		' — ', E('span', {}, state),
		good ? '' : ' — ' + _('Link registration alone does not prove Internet access. Recovery is rate-limited.')
	]);
}

function action(label, handler) {
	return E('div', { 'class': 'mt-control-actions' }, E('button', {
		'type': 'button',
		'class': 'btn cbi-button-apply',
		'click': handler
	}, label));
}

function card(title, desc, body, wide) {
	return E('section', { 'class': 'mt-control-card mt-ui-card' + (wide ? ' wide' : '') }, [
		E('h3', {}, title),
		E('div', { 'class': 'mt-control-desc' }, desc)
	].concat(body));
}

function state(label, value) {
	return E('div', { 'class': 'mt-control-state' }, [ E('span', {}, label), E('strong', {}, value || '--') ]);
}

function styleNode() {
	return E('style', {}, [
		'.mt-ui-page{--mt-ui-accent:#1264d8;--mt-ui-teal:#07988e;--mt-ui-border:var(--border-color-medium,#d9dde4);--mt-ui-border-soft:var(--border-color-low,#edf0f4);--mt-ui-surface:var(--background-color-high,#fff);--mt-ui-muted:var(--text-color-medium,#69717d);max-width:1120px;margin:0 auto;color:var(--text-color-high,#20242a)}',
		'.mt-ui-hero{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:22px 24px;margin:0 0 16px;border:0;border-radius:16px;background:linear-gradient(135deg,#1264d8 0%,#087eae 58%,#07988e 100%);color:#fff;box-shadow:0 10px 28px rgba(14,92,155,.16)}.mt-ui-hero h2{margin:0 0 6px;color:#fff;font-size:24px;line-height:1.2}.mt-ui-hero p,.mt-ui-hero [class*="-sub"]{margin:0;color:rgba(255,255,255,.78);font-size:12px;line-height:1.5}.mt-ui-hero [class*="kicker"],.mt-ui-hero [class*="eyebrow"]{color:rgba(255,255,255,.68);font-size:11px;font-weight:750;letter-spacing:.08em;text-transform:uppercase}',
		'.mt-ui-card{border:1px solid var(--mt-ui-border);border-radius:14px;background:var(--mt-ui-surface);box-shadow:0 3px 12px rgba(20,32,50,.04)}',
		'.mt-ui-page .btn{border-radius:9px}.mt-ui-page input,.mt-ui-page select,.mt-ui-page textarea{border-radius:8px}',
		'.mt-ui-details{margin-top:14px;border:1px solid var(--mt-ui-border);border-radius:14px;background:var(--mt-ui-surface);overflow:hidden}.mt-ui-details>summary{display:grid;grid-template-columns:minmax(0,1fr) 34px;align-items:center;gap:14px;min-height:54px;padding:10px 12px 10px 18px;cursor:pointer;list-style:none;transition:background-color .16s ease}.mt-ui-details>summary::-webkit-details-marker{display:none}.mt-ui-details>summary:hover{background:var(--background-color-low,#f6f8fa)}.mt-ui-summary-copy{min-width:0}.mt-ui-summary-title{display:block;font-size:14px;font-weight:700;line-height:1.35}.mt-ui-summary-desc{display:block;margin-top:3px;color:var(--mt-ui-muted);font-size:11px;font-weight:400;line-height:1.45}.mt-ui-chevron{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:1px solid var(--mt-ui-border-soft);border-radius:9px;background:var(--background-color-low,#f5f7f9);color:var(--mt-ui-muted);font-size:22px;line-height:1;transform:rotate(0deg);transition:transform .18s ease,background-color .18s ease,color .18s ease}.mt-ui-details[open]>summary .mt-ui-chevron{transform:rotate(90deg);background:#eaf4ff;color:#176bc1}.mt-ui-details[open]>summary{border-bottom:1px solid var(--mt-ui-border-soft)}.mt-ui-details:not([open])>.mt-ui-details-body{display:none}',
		'.mt-control-section{margin-top:20px}.mt-control-section-head{margin:0 0 11px}.mt-control-section-head h3{margin:0 0 4px;font-size:17px}.mt-control-section-head p{margin:0;color:var(--text-color-medium,#6e7783);font-size:12px;line-height:1.5}',
		'.mt-control-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.mt-control-card{padding:18px;border:1px solid var(--border-color-medium,#d9dde4);border-radius:13px;background:var(--background-color-high,#fff)}.mt-control-card.wide{grid-column:1/-1}',
		'.mt-control-card h3{margin:0 0 5px;font-size:15px}.mt-control-desc{font-size:12px;color:var(--text-color-medium,#6e7783);margin-bottom:14px;line-height:1.5}.mt-control-row{display:grid;grid-template-columns:145px 1fr;gap:10px;align-items:center;margin:11px 0}.mt-control-row label{font-size:12px;color:var(--text-color-medium,#6e7783)}.mt-control-row input,.mt-control-row select{width:100%;box-sizing:border-box}',
		'.mt-control-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:15px}.mt-control-note{padding:10px 12px;border-radius:8px;background:#fff7e5;color:#795300;font-size:11px;line-height:1.5;margin-top:12px}.mt-control-state{display:flex;justify-content:space-between;gap:14px;padding:9px 0;border-bottom:1px solid var(--border-color-low,#edf0f4);font-size:12px}.mt-control-state:last-child{border-bottom:0}.mt-control-state span{color:var(--text-color-medium,#6e7783)}.mt-control-state strong{text-align:right}',
		'.mt-control-card.mt-ui-card{border-radius:14px}',
		'@media(max-width:760px){.mt-ui-hero{display:block;padding:20px}.mt-ui-card{border-radius:13px}.mt-ui-page .btn{min-height:36px}.mt-ui-page input:not([type="checkbox"]):not([type="radio"]),.mt-ui-page select{min-height:36px}.mt-ui-details>summary{grid-template-columns:minmax(0,1fr) 32px;padding-left:15px}.mt-control-grid{grid-template-columns:1fr}.mt-control-row{grid-template-columns:1fr;gap:5px}}'
	].join(''));
}

return baseclass.extend({
	exec: execChecked,
	sendSms: sendSms,
	healthNode: healthNode,
	section: section,
	pick: pick,
	csvValues: csvValues,
	hexIPv4: hexIPv4,
	hexNumber: hexNumber,
	formatBytes: formatBytes,
	formatDuration: formatDuration,
	formatRate: formatRate,
	parseSession: parseSession,
	select: select,
	confirmRun: confirmRun,
	row: row,
	action: action,
	card: card,
	state: state,
	styleNode: styleNode
});
