'use strict';
'require view';
'require form';
'require rpc';
'require uci';
'require ui';
'require fs';
'require mt5700m.controls as controls';

var callDialStatus = rpc.declare({
	object: 'mt5700m',
	method: 'status',
	expect: { }
});

var callDeviceStatus = rpc.declare({
	object: 'network.device',
	method: 'status',
	params: [ 'name' ],
	expect: { }
});

var callDialLog = rpc.declare({
	object: 'mt5700m',
	method: 'log',
	expect: { }
});

var callDial = rpc.declare({
	object: 'mt5700m',
	method: 'connect',
	expect: { }
});

var callHang = rpc.declare({
	object: 'mt5700m',
	method: 'disconnect',
	expect: { }
});

var callRedial = rpc.declare({
	object: 'mt5700m',
	method: 'redial',
	expect: { }
});

function parseContexts(raw, activationRaw) {
	var active = {};
	(activationRaw || '').split(/\n/).forEach(function(line) {
		var match = line.match(/^\+CGACT:\s*(\d+),(\d+)/);
		if (match) active[match[1]] = match[2] === '1';
	});
	return (raw || '').split(/\n/).map(function(line) {
		var match = line.match(/^\+CGDCONT:\s*(\d+),"([^"]*)","([^"]*)"/);
		return match ? { cid: match[1], type: match[2], apn: match[3], active: active[match[1]] === true } : null;
	}).filter(Boolean);
}

return view.extend({
	load: function() {
		return uci.load('mt5700m').then(L.bind(function() {
			return callDialStatus().catch(function() { return {}; }).then(L.bind(function(manager) {
				this.manager = manager || {};
				return Promise.all([
					Promise.resolve(this.manager),
					callDeviceStatus(this.manager.network || '').catch(function() { return {}; }),
					fs.exec('/usr/sbin/mt5700m-read', [ 'advanced', 'connection-settings' ]).catch(function(err) { return { stdout: '', stderr:err.message || String(err) }; }),
					fs.exec('/usr/sbin/mt5700m-read', [ 'advanced', 'session' ]).catch(function(err) { return { stdout: '', stderr:err.message || String(err) }; })
				]);
			}, this));
		}, this));
	},

	styleNode: function() {
		return E('style', {}, [
			'.mtconn-page{max-width:1040px;margin:0 auto}',
			'.mtconn-hero{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:20px 22px;margin-bottom:16px;border:1px solid var(--border-color-medium,#d9dde4);border-radius:15px;background:linear-gradient(135deg,rgba(20,111,217,.10),rgba(0,155,133,.08))}',
			'.mtconn-title{font-size:22px;font-weight:720;margin:0 0 5px}',
			'.mtconn-sub{font-size:13px;color:var(--text-color-medium,#69717d)}',
			'.mtconn-state{display:flex;align-items:center;gap:9px;font-size:14px;font-weight:700;white-space:nowrap}',
			'.mtconn-dot{width:10px;height:10px;border-radius:50%;background:#d79a22;box-shadow:0 0 0 5px rgba(215,154,34,.14)}',
			'.mtconn-state.online .mtconn-dot{background:#0aa378;box-shadow:0 0 0 5px rgba(10,163,120,.14)}',
			'.mtconn-facts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:16px}',
			'.mtconn-fact{padding:13px 14px;border:1px solid var(--border-color-medium,#d9dde4);border-radius:11px;background:var(--background-color-high,#fff)}',
			'.mtconn-label{font-size:11px;color:var(--text-color-medium,#69717d);margin-bottom:5px}',
			'.mtconn-value{font-size:14px;font-weight:650;word-break:break-word}',
			'.mtconn-actions{display:flex;flex-wrap:wrap;gap:9px;margin:0 0 18px}',
			'.mtconn-actions .btn{border-radius:9px}',
			'.mtconn-session{display:grid;grid-template-columns:1.25fr .9fr;align-items:start;gap:12px;margin-bottom:16px}.mtconn-session-card{padding:16px 18px}.mtconn-session-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:9px}.mtconn-session-head h3{margin:0 0 4px;font-size:14px}.mtconn-session-head p{margin:0;color:var(--mt-ui-muted);font-size:10px;line-height:1.45}.mtconn-session-badge{padding:4px 8px;border-radius:999px;background:#eef2f6;color:#6b7480;font-size:10px;font-weight:700;white-space:nowrap}.mtconn-session-badge.on{background:#e8f8f1;color:#087c60}',
			'.mtconn-session-columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 18px}.mtconn-session-row{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:8px 0;border-bottom:1px solid var(--mt-ui-border-soft);font-size:10px}.mtconn-session-row span{color:var(--mt-ui-muted)}.mtconn-session-row strong{text-align:right;word-break:break-all}.mtconn-session-actions{display:flex;justify-content:flex-end;margin-top:11px}',
			'.mtconn-pdp{margin:16px 0;padding:16px;border:1px solid var(--border-color-medium,#d9dde4);border-radius:13px;background:var(--background-color-high,#fff)}.mtconn-pdp-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px}.mtconn-pdp-head h3{font-size:15px;margin:0 0 4px}.mtconn-pdp-head p{font-size:11px;color:var(--text-color-medium,#69717d);margin:0;line-height:1.45}.mtconn-pdp-row{display:grid;grid-template-columns:58px 100px 1fr 90px auto;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--border-color-low,#edf0f4);font-size:12px}.mtconn-pdp-state{font-weight:650;color:#7b8794}.mtconn-pdp-state.on{color:#08775d}.mtconn-pdp-actions{display:flex;gap:6px;justify-content:flex-end}',
			'.mtconn-config{margin:16px 0;padding:18px 20px;border:1px solid var(--border-color-medium,#d9dde4);border-radius:13px;background:var(--background-color-high,#fff)}.mtconn-config-head{margin-bottom:10px}.mtconn-config-head h3{margin:0 0 5px;font-size:16px}.mtconn-config-head p{margin:0;color:var(--text-color-medium,#69717d);font-size:12px;line-height:1.5}.mtconn-config .cbi-map>h2,.mtconn-config .cbi-map-descr,.mtconn-config .cbi-section>h3{display:none}.mtconn-config .cbi-section{margin:0;padding:0;border:0;box-shadow:none}.mtconn-config .cbi-section-node{padding:0}.mtconn-config .cbi-value{padding:9px 0;border-bottom:1px solid var(--border-color-low,#edf0f4)}.mtconn-config .cbi-value:last-child{border-bottom:0}',
			'.mtconn-advanced-body{padding:0 18px 18px}.mtconn-advanced-body .mtconn-pdp{border:0;padding:0;margin:18px 0 0;box-shadow:none}.mtconn-advanced-body .mt-control-section{margin-top:18px}',
			'.mtconn-log{margin-top:16px;border:1px solid var(--border-color-medium,#d9dde4);border-radius:11px;background:var(--background-color-high,#fff)}',
			'.mtconn-log summary{cursor:pointer;padding:13px 15px;font-weight:650}',
			'.mtconn-log pre{max-height:260px;overflow:auto;margin:0;padding:14px 15px;border-top:1px solid var(--border-color-low,#edf0f4);font-size:11px;white-space:pre-wrap}',
			'@media(max-width:720px){.mtconn-hero{display:block}.mtconn-state{margin-top:14px}.mtconn-facts{grid-template-columns:repeat(2,minmax(0,1fr))}.mtconn-session{grid-template-columns:1fr}.mtconn-pdp-row{grid-template-columns:48px 80px 1fr}.mtconn-pdp-row .mtconn-pdp-state,.mtconn-pdp-actions{grid-column:3}.mtconn-config{padding:16px}}',
			'@media(max-width:420px){.mtconn-facts,.mtconn-session-columns{grid-template-columns:1fr}}'
		].join(''));
	},

	fact: function(label, value) {
		return E('div', { 'class': 'mtconn-fact mt-ui-card' }, [
			E('div', { 'class': 'mtconn-label' }, label),
			E('div', { 'class': 'mtconn-value' }, value || '--')
		]);
	},

	sessionRow: function(label, value) {
		return E('div', { 'class':'mtconn-session-row' }, [ E('span', {}, label), E('strong', {}, value || '--') ]);
	},

	sessionPanel: function(session, error) {
		var self = this;
		var active = session.ipv4Connected || session.ipv6Connected;
		var addressRows = [
			self.sessionRow(_('IPv4 address'), session.ipv4Address), self.sessionRow(_('IPv4 gateway'), session.ipv4Gateway),
			self.sessionRow(_('IPv4 DNS'), session.ipv4Dns), self.sessionRow(_('IPv6 address'), session.ipv6Address),
			self.sessionRow(_('IPv6 DNS'), session.ipv6Dns), self.sessionRow(_('IP capability'), session.capability),
			self.sessionRow('MTU', session.mtu)
		];
		if (session.detailed.length)
			session.detailed.forEach(function(item) {
				addressRows.push(self.sessionRow('CID ' + item.cid + ' · ' + (item.apn || _('Carrier default')), [ item.ipv4 ? 'IPv4' : '', item.ipv6 ? 'IPv6' : '', item.ethernet ? _('Ethernet') : '' ].filter(Boolean).join(' · ')));
			});
		return E('div', { 'class':'mtconn-session' }, [
			E('section', { 'class':'mtconn-session-card mt-ui-card' }, [
				E('div', { 'class':'mtconn-session-head' }, [ E('div', {}, [ E('h3', {}, _('Assigned addresses')), E('p', {}, _('Gateway, DNS and PDP session details reported by the MT5700M.')) ]), E('span', { 'class':'mtconn-session-badge' + (active ? ' on' : '') }, active ? _('Active') : _('Disconnected')) ]),
				error ? E('div', { 'class':'alert-message warning' }, error) : null,
				E('div', { 'class':'mtconn-session-columns' }, addressRows)
			].filter(Boolean)),
			E('section', { 'class':'mtconn-session-card mt-ui-card' }, [
				E('div', { 'class':'mtconn-session-head' }, [ E('div', {}, [ E('h3', {}, _('Module traffic counters')), E('p', {}, _('Counters maintained by the modem firmware for the current and accumulated sessions.')) ]), E('span', { 'class':'mtconn-session-badge' }, _('Module')) ]),
				self.sessionRow(_('Current duration'), controls.formatDuration(session.currentDuration)),
				self.sessionRow(_('Current total'), controls.formatBytes(session.currentRx + session.currentTx)),
				self.sessionRow(_('Accumulated duration'), controls.formatDuration(session.totalDuration)),
				self.sessionRow(_('Accumulated total'), controls.formatBytes(session.totalRx + session.totalTx)),
				self.sessionRow(_('Network maximum downlink'), controls.formatRate(session.maximumDown)),
				self.sessionRow(_('Network maximum uplink'), controls.formatRate(session.maximumUp)),
				E('div', { 'class':'mtconn-session-actions' }, E('button', { 'class':'btn', 'click':function() { controls.confirmRun(_('Clear module traffic counters'), _('This permanently clears current and accumulated MT5700M data-flow counters.'), [ 'flow-clear' ]); } }, _('Clear counters')))
			])
		]);
	},

	editPdp: function(context) {
		var cid = E('input', { 'class':'cbi-input-text', 'type':'number', 'min':'1', 'max':'11', 'value':context ? context.cid : '1' });
		var type = controls.select([['IPV4V6','IPv4 / IPv6'],['IP','IPv4'],['IPV6','IPv6']], context ? context.type : 'IPV4V6');
		var apn = E('input', { 'class':'cbi-input-text', 'maxlength':'99', 'placeholder':_('Carrier default'), 'value':context ? context.apn : '' });
		return ui.showModal(context ? _('Edit PDP context') : _('Add PDP context'), [
			E('p', {}, _('This changes a module-native PDP profile. The OpenWrt dialing profile above remains the normal place to configure APN.')),
			controls.row('CID', cid), controls.row(_('IP protocol'), type), controls.row('APN', apn),
			E('div', { 'class':'right' }, [ E('button', { 'class':'btn', 'click':ui.hideModal }, _('Cancel')), ' ', E('button', { 'class':'btn cbi-button-apply', 'click':function() {
				var cidValue = String(cid.value || '');
				if (!/^(?:[1-9]|1[01])$/.test(cidValue) || /[",\r\n]/.test(apn.value || ''))
					return ui.addNotification(null, E('p', {}, _('Enter a CID from 1 to 11 and a valid APN.')), 'warning');
				ui.hideModal();
				fs.exec('/usr/sbin/mt5700m-at', [ 'pdp-set', cidValue, type.value, apn.value.trim() ]).then(function() { window.location.reload(); }, function(err) { ui.addNotification(null, E('p', {}, err.message || String(err)), 'danger'); });
			} }, _('Save')) ])
		]);
	},

	loadLog: function(details, output) {
		if (!details.open || details.getAttribute('data-loaded') === '1')
			return;

		details.setAttribute('data-loaded', '1');
		output.textContent = _('Loading dialing log…');
		callDialLog().then(function(result) {
			output.textContent = result.log || _('No dialing log is available.');
		}).catch(function(err) {
			details.setAttribute('data-loaded', '0');
			output.textContent = err.message || String(err);
		});
	},

	runAction: function(action, success, confirmText) {
		var run = function() {
			ui.showModal(_('Working…'), [ E('p', { 'class': 'spinning' }, _('Applying the connection action…')) ]);
			return action().then(function() {
				ui.hideModal();
				ui.addNotification(null, E('p', {}, success));
				window.setTimeout(function() { window.location.reload(); }, 1200);
			}).catch(function(err) {
				ui.hideModal();
				ui.addNotification(null, E('p', {}, err.message || String(err)), 'danger');
			});
		};

		if (!confirmText)
			return run();

		return ui.showModal(_('Confirm Action'), [
			E('p', {}, confirmText),
			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'btn', 'click': ui.hideModal }, _('Cancel')),
				' ',
				E('button', { 'class': 'btn cbi-button-action', 'click': function() { ui.hideModal(); run(); } }, _('Continue'))
			])
		]);
	},

	render: function(results) {
		var manager = this.manager || results[0] || {};
		var self = this;

		var dial = results[0] || {};
		var device = results[1] || {};
		var moduleSettings = results[2] || {};
		var sessionResult = results[3] || {};
		var session = controls.parseSession(sessionResult.stdout || '');
		var moduleRaw = moduleSettings.stdout || '';
		var online = dial.connected === true && device.up === true && device.carrier !== false;
		var configuredApn = uci.get('mt5700m', 'connection', 'apn') || _('Automatic');
		var configuredProtocol = { ip:'IPv4', ipv6:'IPv6', ipv4v6:'IPv4 / IPv6' }[uci.get('mt5700m', 'connection', 'pdp_type')] || 'IPv4 / IPv6';
		var m = new form.Map('mt5700m');
		var s, o;
		var logOutput = E('pre', { 'class':'mt-ui-details-body' }, _('Expand to load the dialing log.'));
		var logDetails = E('details', {
			'class': 'mtconn-log mt-ui-details',
			'toggle': function(ev) { self.loadLog(ev.currentTarget, logOutput); }
		}, [
			E('summary', {}, [
				E('span', { 'class':'mt-ui-summary-copy' }, E('span', { 'class':'mt-ui-summary-title' }, _('Recent dialing log'))),
				E('span', { 'class':'mt-ui-chevron', 'aria-hidden':'true' }, '›')
			]),
			logOutput
		]);

		s = m.section(form.NamedSection, 'connection', 'connection');
		s.anonymous = true;

		o = s.option(form.Flag, 'enabled', _('Enable automatic dialing'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Value, 'apn', _('APN'));
		o.placeholder = _('Automatic');
		o.rmempty = true;

		o = s.option(form.ListValue, 'pdp_type', _('IP protocol'));
		o.value('ip', _('IPv4'));
		o.value('ipv6', _('IPv6'));
		o.value('ipv4v6', _('IPv4 / IPv6'));
		o.default = 'ipv4v6';
		o.rmempty = false;

		o = s.option(form.ListValue, 'auth', _('Authentication'));
		o.value('none', _('None'));
		o.value('pap', 'PAP');
		o.value('chap', 'CHAP');
		o.default = 'none';

		o = s.option(form.Value, 'username', _('Username'));
		o.depends('auth', 'pap');
		o.depends('auth', 'chap');

		o = s.option(form.Value, 'password', _('Password'));
		o.password = true;
		o.depends('auth', 'pap');
		o.depends('auth', 'chap');

		o = s.option(form.Value, 'metric', _('Route metric'));
		o.datatype = 'uinteger';
		o.default = '50';
		o.description = _('A smaller value gives this mobile connection a higher route priority.');

		o = s.option(form.DynamicList, 'dns_list', _('Custom DNS'));
		o.datatype = 'ipaddr';
		o.description = _('Leave empty to use DNS supplied by the mobile network.');

		var autoRaw = controls.section(moduleRaw, 'Auto dial');
		var interfaceRaw = controls.section(moduleRaw, 'Interface mode');
		var autoMatch = autoRaw.match(/\^SETAUTODIAL:\s*(\d+),(\d+),"([^"]*)",?"?([^",]*)"?,?"?([^",]*)"?,?"?([^",]*)"?,(\d+)/);
		var enabled = controls.select([['1',_('Enabled')],['0',_('Disabled')]], autoMatch ? autoMatch[1] : '1');
		var dialMode = controls.select([['0',_('Module internal dialing')],['1',_('Host dialing over USB')],['2',_('Host dialing over Ethernet')]], autoMatch ? autoMatch[2] : '1');
		var protocol = controls.select([['IPV4V6','IPv4 / IPv6'],['IP','IPv4'],['IPV6','IPv6']], autoMatch ? autoMatch[3] : 'IPV4V6');
		var moduleApn = E('input', { 'class':'cbi-input-text', 'placeholder':_('Leave empty to use carrier default'), 'value':autoMatch ? autoMatch[4] : '' });
		var moduleUsername = E('input', { 'class':'cbi-input-text', 'autocomplete':'off', 'value':autoMatch ? autoMatch[5] : '' });
		var modulePassword = E('input', { 'class':'cbi-input-text', 'type':'password', 'autocomplete':'new-password', 'value':autoMatch ? autoMatch[6] : '' });
		var moduleAuth = controls.select([['0',_('None')],['1','PAP'],['2','CHAP']], autoMatch ? autoMatch[7] : '0');
		var postRouteValue = controls.pick(interfaceRaw, /PostRoute:\s*(\d+)/, '');
		var dmzValue = controls.pick(interfaceRaw, /Dmz:\s*([^\n]+)/, '').trim();
		var postRouteKnown = postRouteValue === '1' || postRouteValue === '2';
		var postRouteOptions = [['2',_('Disabled')],['1',_('Enabled')]];
		if (!postRouteKnown)
			postRouteOptions.unshift(['', postRouteValue ? _('Unsupported value: %s').format(postRouteValue) : _('Unavailable')]);
		var postRoute = controls.select(postRouteOptions, postRouteKnown ? postRouteValue : '');
		postRoute.disabled = !postRouteKnown;
		var dmz = E('input', { 'class':'cbi-input-text', 'placeholder':'192.168.8.100', 'value':dmzValue.indexOf('not cfg') < 0 ? dmzValue : '' });
		var contexts = parseContexts(controls.section(moduleRaw, 'PDP contexts'), controls.section(moduleRaw, 'PDP activation'));
		var pdpPanel = E('section', { 'class':'mtconn-pdp mt-ui-card' }, [
			E('div', { 'class':'mtconn-pdp-head' }, [
				E('div', {}, [ E('h3', {}, _('Module PDP contexts')), E('p', {}, _('Advanced module-native profiles. IMS contexts are protected from editing; normal OpenWrt users should configure APN in the dialing profile above.')) ]),
				E('button', { 'class':'btn', 'click':function() { self.editPdp(null); } }, _('Add profile'))
			])
		].concat(contexts.length ? contexts.map(function(context) {
			var reserved = context.cid === '0' || context.cid === '5' || context.cid === '6' || String(context.apn || '').toLowerCase() === 'ims';
			return E('div', { 'class':'mtconn-pdp-row' }, [
				E('strong', {}, 'CID ' + context.cid), E('span', {}, context.type), E('span', {}, context.apn || _('Carrier default')),
				E('span', { 'class':'mtconn-pdp-state' + (context.active ? ' on' : '') }, context.active ? _('Active') : _('Inactive')),
				E('div', { 'class':'mtconn-pdp-actions' }, reserved ? E('span', {}, String(context.apn || '').toLowerCase() === 'ims' ? _('IMS reserved') : _('System reserved')) : [
					E('button', { 'class':'btn', 'click':function() { self.editPdp(context); } }, _('Edit')),
					E('button', { 'class':'btn', 'click':function() { controls.confirmRun(context.active ? _('Deactivate PDP context') : _('Activate PDP context'), _('Changing a module PDP context can interrupt mobile service.'), [ 'pdp-state', context.active ? '0' : '1', context.cid ]); } }, context.active ? _('Deactivate') : _('Activate')),
					E('button', { 'class':'btn cbi-button-negative', 'click':function() { controls.confirmRun(_('Remove PDP context'), _('Remove CID %s from the module?').format(context.cid), [ 'pdp-remove', context.cid ]); } }, _('Remove'))
				])
			]);
		}) : [ E('div', { 'class':'alert-message notice' }, _('No PDP contexts were reported.')) ]));
		var moduleControls = E('section', { 'class':'mt-control-section' }, [
			E('div', { 'class':'mt-control-section-head' }, [
				E('h3', {}, _('MT5700M data path')),
				E('p', {}, _('Module-side dialing and inbound-routing controls. Most OpenWrt installations should keep host dialing selected.'))
			]),
			moduleSettings.stderr ? E('div', { 'class':'alert-message warning' }, moduleSettings.stderr) : null,
			E('div', { 'class':'mt-control-grid' }, [
				controls.card(_('Module dialing policy'), _('Select how the MT5700M firmware exposes its mobile data session.'), [
					E('div', { 'class':'mt-control-note' }, _('Use one dialing owner for each data path. With the integrated OpenWrt service, keep host dialing over USB selected to avoid repeated reconnects.')),
					controls.row(_('Automatic dialing'), enabled),
					controls.row(_('Dial mode'), dialMode),
					controls.row(_('PDP protocol'), protocol),
					controls.row('APN', moduleApn),
					controls.row(_('Username'), moduleUsername),
					controls.row(_('Password'), modulePassword),
					controls.row(_('Authentication'), moduleAuth),
					controls.action(_('Apply module dialing'), function() {
						controls.confirmRun(_('Apply MT5700M dialing settings'), _('The mobile data session may disconnect and reconnect.'), [ 'advanced-set', 'autodial', enabled.value, dialMode.value, protocol.value, moduleApn.value, moduleUsername.value, modulePassword.value, moduleAuth.value ]);
					})
				]),
				controls.card(_('Inbound routing'), _('Optional module-side forwarding for devices connected behind the MT5700M data path.'), [
					controls.row(_('Post-routing'), postRoute),
					E('div', { 'class':'mt-control-note' }, _('Post-routing and DMZ are mutually exclusive. Leave both disabled unless the module itself is providing the downstream LAN.')),
					postRouteKnown ? controls.action(_('Apply post-routing'), function() {
						controls.confirmRun(_('Change post-routing'), _('The module must restart or cycle airplane mode before the new routing path is used.'), [ 'advanced-set', 'postroute', postRoute.value ], true);
					}) : E('div', { 'class':'mt-control-note' }, _('The modem reported a post-routing value that this firmware cannot safely change.')),
					controls.row(_('DMZ address'), dmz),
					controls.action(_('Apply DMZ'), function() {
						controls.confirmRun(_('Change DMZ host'), _('The selected IPv4 host may be exposed to unsolicited traffic from the mobile network.'), [ 'advanced-set', 'dmz', dmz.value.trim() || '0' ]);
					})
				])
			])
		].filter(Boolean));

		return m.render().then(function(formNode) {
			return E('div', { 'class': 'mtconn-page mt-ui-page' }, [
				self.styleNode(),
				controls.styleNode(),
				manager.usb_state && manager.usb_state !== 'normal' ? E('div', { 'class':'alert-message warning' }, _('The MT5700M is not in normal USB mode. Connection settings remain available, but dialing cannot start.')) : null,
				E('section', { 'class': 'mtconn-hero mt-ui-hero' }, [
					E('div', {}, [
						E('h2', { 'class': 'mtconn-title' }, _('Mobile data')),
						E('div', { 'class': 'mtconn-sub' }, _('Configure how the MT5700M connects to the mobile network.'))
					]),
					E('div', { 'class': 'mtconn-state' + (online ? ' online' : '') }, [
						E('span', { 'class': 'mtconn-dot' }),
						online ? _('Connected') : _('Disconnected')
					])
				]),
				E('div', { 'class': 'mtconn-facts' }, [
					self.fact(_('Automatic dialing'), uci.get('mt5700m', 'connection', 'enabled') === '0' ? _('Disabled') : _('Enabled')),
					self.fact(_('Network interface'), manager.network),
					self.fact('APN', configuredApn),
					self.fact(_('IP protocol'), configuredProtocol)
				]),
				self.sessionPanel(session, sessionResult.stderr),
				E('div', { 'class': 'mtconn-actions' }, online ? [
					E('button', { 'class': 'btn cbi-button-action', 'click': function() { return self.runAction(callRedial, _('Redial started.'), _('The 5G connection will be interrupted briefly while the modem redials.')); } }, _('Redial')),
					E('button', { 'class': 'btn cbi-button-negative', 'click': function() { return self.runAction(callHang, _('Connection stopped.'), _('Disconnect the mobile data connection now?')); } }, _('Disconnect'))
				] : [
					E('button', { 'class': 'btn cbi-button-action', 'click': function() { return self.runAction(callDial, _('Dialing started.')); } }, _('Connect'))
				]),
				E('section', { 'class':'mtconn-config mt-ui-card' }, [
					E('div', { 'class':'mtconn-config-head' }, [
						E('h3', {}, _('Connection settings')),
						E('p', {}, _('APN is normally detected automatically. Save changes, then redial to use the new settings.'))
					]),
					formNode
				]),
				E('details', { 'class':'mtconn-advanced mt-ui-details' }, [
					E('summary', {}, [
						E('span', { 'class':'mt-ui-summary-copy' }, [
							E('span', { 'class':'mt-ui-summary-title' }, _('Advanced connection tools')),
							E('span', { 'class':'mt-ui-summary-desc' }, _('PDP profiles, module dialing modes and inbound routing for troubleshooting or special deployments.'))
						]),
						E('span', { 'class':'mt-ui-chevron', 'aria-hidden':'true' }, '›')
					]),
					E('div', { 'class':'mtconn-advanced-body mt-ui-details-body' }, [ pdpPanel, moduleControls ])
				]),
				logDetails
			].filter(Boolean));
		});
	}
});
