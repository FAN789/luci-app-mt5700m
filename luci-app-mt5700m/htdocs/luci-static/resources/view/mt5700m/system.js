'use strict';
'require view';
'require fs';
'require ui';
'require mt5700m.controls as controls';

function section(raw, label) {
	var marker = '===== ' + label + ':';
	var active = false;
	var output = [];
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

function lineValue(text, prefix) {
	var line = (text || '').split(/\n/).filter(function(item) { return item.indexOf(prefix) === 0; })[0] || '';
	return line.substring(prefix.length).replace(/^[ :]+/, '').trim();
}

function subscriptionRate(value) {
	value = Number(value) || 0;
	return value > 0 ? (value / 1000).toFixed(value % 1000 ? 1 : 0) + ' Mbps' : '--';
}

return view.extend({
	load: function() {
		return fs.exec('/usr/sbin/mt5700m-read', [ 'system' ]).catch(function(err) { return { stdout: '', stderr: err.message || String(err) }; });
	},

	styleNode: function() {
		return E('style', {}, [
			'.mt-system{max-width:1120px;margin:0 auto;color:var(--text-color-high,#20242a)}',
			'.mt-system-hero{display:flex;justify-content:space-between;align-items:center;gap:18px;padding:22px 24px;border-radius:15px;background:linear-gradient(135deg,#304667,#3b587d);color:#fff;margin-bottom:15px}',
			'.mt-system-kicker{font-size:12px;font-weight:700;opacity:.72;margin-bottom:5px}.mt-system-title{font-size:25px;font-weight:720;margin:0 0 6px;color:#fff}.mt-system-sub{font-size:13px;opacity:.8}',
			'.mt-system-temp{min-width:92px;text-align:center;padding:11px 14px;border-radius:12px;background:rgba(255,255,255,.12)}.mt-system-temp strong{display:block;font-size:24px}.mt-system-temp span{font-size:11px;opacity:.75}',
			'.mt-system-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.mt-system-card{padding:16px;border:1px solid var(--border-color-medium,#d9dde4);border-radius:13px;background:var(--background-color-high,#fff);box-shadow:0 3px 12px rgba(20,32,50,.04)}.mt-system-card.wide{grid-column:1/-1}',
			'.mt-system-card h3{font-size:14px;margin:0 0 11px}.mt-system-row{display:flex;justify-content:space-between;gap:16px;padding:9px 0;border-bottom:1px solid var(--border-color-low,#edf0f4);font-size:12px}.mt-system-row:last-child{border-bottom:0}.mt-system-row span{color:var(--text-color-medium,#6e7783)}.mt-system-row strong{text-align:right;word-break:break-word}',
			'.mt-system-fota{margin-top:14px;padding:18px;border:1px solid #ead7b2;border-radius:13px;background:linear-gradient(135deg,#fffdf8,#fff9ec)}.mt-system-fota-head{display:flex;justify-content:space-between;align-items:flex-start;gap:15px}.mt-system-fota h3{font-size:16px;margin:0 0 5px}.mt-system-fota p{font-size:12px;color:#74664c;margin:0;line-height:1.5}',
			'.mt-system-state{padding:5px 10px;border-radius:999px;background:#edf1f7;color:#4e5d73;font-size:11px;font-weight:700;white-space:nowrap}.mt-system-state.active{background:#e0f5ed;color:#08775d}.mt-system-state.error{background:#fde7e3;color:#a43e2c}',
			'.mt-system-progress{height:8px;margin:16px 0 7px;border-radius:999px;background:#eadfc8;overflow:hidden}.mt-system-progress span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#328df4,#15aa8d)}.mt-system-progress-label{font-size:11px;color:#7b6d52;text-align:right}',
			'.mt-system-url{display:grid;grid-template-columns:1fr auto;gap:9px;margin-top:14px}.mt-system-url input{width:100%;box-sizing:border-box}.mt-system-url .btn,.mt-system-actions .btn{border-radius:9px}',
			'.mt-system-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:14px}.mt-system-details{margin-top:14px;border:1px solid var(--border-color-medium,#d9dde4);border-radius:11px;overflow:hidden}.mt-system-details summary{cursor:pointer;padding:12px 14px;font-size:12px;font-weight:650}.mt-system-raw{margin:0;padding:14px;background:#17202a;color:#dce6ef;white-space:pre-wrap;word-break:break-word;font:11px/1.55 monospace;max-height:420px;overflow:auto}',
			'.mt-system-maintenance{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-top:14px;padding:16px 18px;border:1px solid var(--border-color-medium,#d9dde4);border-radius:13px;background:var(--background-color-high,#fff)}.mt-system-maintenance h3{margin:0 0 4px;font-size:15px}.mt-system-maintenance p{margin:0;color:var(--text-color-medium,#6e7783);font-size:11px}.mt-system-maintenance .mt-system-actions{margin:0;justify-content:flex-end}.mt-system-thermal-form{display:grid;grid-template-columns:1fr 1fr;gap:0 14px;max-height:46vh;overflow:auto}',
			'@media(max-width:720px){.mt-system-hero{align-items:flex-start}.mt-system-grid{grid-template-columns:1fr}.mt-system-card.wide{grid-column:auto}.mt-system-url{grid-template-columns:1fr}.mt-system-url .btn{width:100%}.mt-system-maintenance{display:block}.mt-system-maintenance .mt-system-actions{margin-top:12px;justify-content:flex-start}.mt-system-thermal-form{grid-template-columns:1fr}}'
		].join(''));
	},

	row: function(label, value) {
		return E('div', { 'class': 'mt-system-row' }, [ E('span', {}, label), E('strong', {}, value || '--') ]);
	},

	runConfirmed: function(title, message, args, danger, recoveryDelay) {
		return ui.showModal(title, [
			E('p', {}, message),
			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'btn', 'click': ui.hideModal }, _('Cancel')), ' ',
				E('button', { 'class': 'btn ' + (danger ? 'cbi-button-negative' : 'cbi-button-apply'), 'click': function() {
					ui.hideModal();
					fs.exec('/usr/sbin/mt5700m-at', args).then(function() {
						ui.addNotification(null, E('p', {}, recoveryDelay ? _('Restart accepted. The USB interface normally returns in about 22 seconds.') : _('Command accepted by the modem.')));
						window.setTimeout(function() { window.location.reload(); }, recoveryDelay || 1500);
					}, function(err) { ui.addNotification(null, E('p', {}, err.message || String(err)), 'danger'); });
				} }, _('Continue'))
			])
		]);
	},

	showPinManager: function(simState) {
		var operation = controls.select([
			['verify',_('Verify current PIN')],['enable',_('Enable PIN lock')],['disable',_('Disable PIN lock')],
			['change',_('Change PIN')],['unblock',_('Unlock with PUK')]
		], simState === 'SIM PUK' ? 'unblock' : 'verify');
		var first = E('input', { 'class':'cbi-input-text', 'type':'password', 'inputmode':'numeric', 'autocomplete':'off' });
		var second = E('input', { 'class':'cbi-input-text', 'type':'password', 'inputmode':'numeric', 'autocomplete':'new-password' });
		var firstLabel = E('label', {}, _('PIN'));
		var secondRow = controls.row(_('New PIN'), second);
		function update() {
			firstLabel.textContent = operation.value === 'unblock' ? _('PUK code') : operation.value === 'change' ? _('Current PIN') : _('PIN');
			secondRow.style.display = operation.value === 'change' || operation.value === 'unblock' ? '' : 'none';
		}
		operation.addEventListener('change', update);
		window.setTimeout(update, 0);
		return ui.showModal(_('SIM PIN management'), [
			E('div', { 'class':'alert-message warning' }, _('Incorrect PIN or PUK attempts can permanently lock the SIM. Check the carrier documentation before continuing.')),
			controls.row(_('Operation'), operation), E('div', { 'class':'mt-control-row' }, [ firstLabel, first ]), secondRow,
			E('div', { 'class':'right' }, [ E('button', { 'class':'btn', 'click':ui.hideModal }, _('Cancel')), ' ', E('button', { 'class':'btn cbi-button-negative', 'click':function() {
				var firstValue = first.value.trim(), secondValue = second.value.trim();
				if ((operation.value === 'unblock' ? !/^\d{8}$/.test(firstValue) : !/^\d{4,8}$/.test(firstValue)) || ((operation.value === 'change' || operation.value === 'unblock') && !/^\d{4,8}$/.test(secondValue)))
					return ui.addNotification(null, E('p', {}, _('PIN must contain 4–8 digits; PUK must contain exactly 8 digits.')), 'warning');
				ui.hideModal();
				fs.exec('/usr/sbin/mt5700m-at', [ 'sim-pin', operation.value, firstValue, secondValue ]).then(function() { window.location.reload(); }, function(err) { ui.addNotification(null, E('p', {}, err.message || String(err)), 'danger'); });
			} }, _('Apply')) ])
		]);
	},

	showThermalManager: function(values, logValues) {
		var labels = [
			_('Normal threshold'), _('First power reduction'), _('First recovery'),
			_('Second power reduction'), _('Second recovery'), _('Continuous power limit'),
			_('Continuous-limit recovery'), _('Emergency airplane mode'), _('Emergency recovery')
		];
		var inputs = labels.map(function(label, index) {
			return E('input', { 'class':'cbi-input-text', 'type':'number', 'min':'0', 'max':'150', 'value':values[index] || '' });
		});
		var serialLog = controls.select([['0',_('Disabled')],['1',_('Enabled')]], logValues[0] || '0');
		var fileLog = controls.select([['0',_('Disabled')],['1',_('Enabled')]], logValues[1] || '0');
		return ui.showModal(_('Thermal protection settings'), [
			E('div', { 'class':'alert-message warning' }, _('Incorrect thresholds can cause performance loss, overheating or an emergency radio shutdown. Keep every recovery value below its matching trigger value.')),
			E('div', { 'class':'mt-system-thermal-form' }, labels.map(function(label, index) { return controls.row(label + ' (°C)', inputs[index]); })),
			controls.row(_('Serial thermal log'), serialLog), controls.row(_('Stored thermal log'), fileLog),
			E('div', { 'class':'right' }, [ E('button', { 'class':'btn', 'click':ui.hideModal }, _('Cancel')), ' ', E('button', { 'class':'btn cbi-button-negative', 'click':function() {
				var next = inputs.map(function(input) { return String(input.value || ''); });
				if (next.some(function(value) { return !/^\d+$/.test(value) || Number(value) > 150; }))
					return ui.addNotification(null, E('p', {}, _('Every threshold must be a temperature from 0 to 150°C.')), 'warning');
				if (!(Number(next[1]) > Number(next[0]) && Number(next[3]) > Number(next[1]) && Number(next[5]) > Number(next[3]) && Number(next[7]) > Number(next[5]) && Number(next[2]) < Number(next[1]) && Number(next[4]) < Number(next[3]) && Number(next[6]) < Number(next[5]) && Number(next[8]) < Number(next[7])))
					return ui.addNotification(null, E('p', {}, _('Trigger temperatures must rise by level, and each recovery temperature must be lower than its trigger.')), 'warning');
				ui.hideModal();
				Promise.all([
					fs.exec('/usr/sbin/mt5700m-at', [ 'advanced-set', 'thermal-thresholds' ].concat(next)),
					fs.exec('/usr/sbin/mt5700m-at', [ 'advanced-set', 'thermal-log', serialLog.value, fileLog.value ])
				]).then(function() { ui.addNotification(null, E('p', {}, _('Thermal settings saved.'))); window.setTimeout(function() { window.location.reload(); }, 1200); }, function(err) { ui.addNotification(null, E('p', {}, err.message || String(err)), 'danger'); });
			} }, _('Apply')) ])
		]);
	},

	showIdentityLab: function(currentImei) {
		var input = E('input', { 'class':'cbi-input-text', 'inputmode':'numeric', 'maxlength':'15', 'placeholder':currentImei || '123456789012345' });
		return ui.showModal(_('Device identity laboratory'), [
			E('div', { 'class':'alert-message warning' }, _('IMEI writing is not documented in the supplied MT5700M AT manual and may be restricted by local law or the mobile operator. This control is provided only for restoring the original device identity.')),
			controls.row(_('New IMEI'), input),
			E('div', { 'class':'right' }, [ E('button', { 'class':'btn', 'click':ui.hideModal }, _('Cancel')), ' ', E('button', { 'class':'btn cbi-button-negative', 'click':function() {
				var value = input.value.trim();
				if (!/^\d{15}$/.test(value) || value === currentImei)
					return ui.addNotification(null, E('p', {}, _('Enter a different 15-digit IMEI.')), 'warning');
				ui.hideModal();
				controls.confirmRun(_('Write device identity'), _('This unsupported operation can prevent network registration. Continue only when restoring the identity printed on the module label.'), [ 'set-imei', value ], true);
			} }, _('Review change')) ])
		]);
	},

	showFactoryReset: function() {
		var confirm = E('input', { 'class':'cbi-input-text', 'placeholder':'RESET', 'autocomplete':'off' });
		return ui.showModal(_('Restore module factory settings'), [
			E('div', { 'class':'alert-message warning' }, _('This erases module-side APN, radio, SIM, interface and thermal settings, then restarts the MT5700M. OpenWrt settings are not erased.')),
			controls.row(_('Type RESET to confirm'), confirm),
			E('div', { 'class':'right' }, [ E('button', { 'class':'btn', 'click':ui.hideModal }, _('Cancel')), ' ', E('button', { 'class':'btn cbi-button-negative', 'click':function() {
				if (confirm.value !== 'RESET') return ui.addNotification(null, E('p', {}, _('Confirmation text does not match.')), 'warning');
				ui.hideModal(); fs.exec('/usr/sbin/mt5700m-at', [ 'factory-reset' ]).then(function() { ui.addNotification(null, E('p', {}, _('Factory reset accepted. The module will restart.'))); }, function(err) { ui.addNotification(null, E('p', {}, err.message || String(err)), 'danger'); });
			} }, _('Restore factory settings')) ])
		]);
	},

	render: function(res) {
		var raw = res.stdout || '';
		var identity = section(raw, 'Identity');
		var version = section(raw, 'Version');
		var sim = lineValue(section(raw, 'SIM'), '+CPIN');
		var iccid = lineValue(section(raw, 'ICCID'), '^ICCID');
		var imsi = (section(raw, 'IMSI').match(/(?:^|\n)(\d{10,18})(?:\n|$)/) || [,''])[1];
		var phone = lineValue(section(raw, 'Subscriber number'), '+CNUM').replace(/"/g, '').split(',').map(function(value) { return value.trim(); }).filter(function(value) { return /^\+?\d{5,20}$/.test(value); })[0] || _('Not stored on SIM');
		var subscription = lineValue(section(raw, 'Subscription rate'), '^DSAMBR').replace(/"/g, '').split(',').map(function(value) { return value.trim(); });
		var operatorValues = lineValue(section(raw, 'Operator'), '+COPS').replace(/"/g, '').split(',');
		var networkTime = lineValue(section(raw, 'Network time'), '^NWTIME').replace(/"/g, '');
		var functionLevel = lineValue(section(raw, 'Function level'), '+CFUN');
		var ledState = lineValue(section(raw, 'LED'), '^LEDSWITCH');
		var simActivation = lineValue(section(raw, 'SIM activation'), '^HVSST').split(',');
		var simSlots = lineValue(section(raw, 'SIM slot'), '^SCICHG').split(',');
		var temperatures = lineValue(section(raw, 'Temperature'), '^CHIPTEMP').split(',').map(function(value) { return value.trim(); }).filter(function(value) { return /^-?\d+$/.test(value) && Number(value) > -1000 && Number(value) < 2000; }).map(Number);
		var temperature = temperatures.length ? (Math.max.apply(null, temperatures) / 10).toFixed(1) : '';
		var fotaMode = lineValue(section(raw, 'FOTA mode'), '^FOTAMODE');
		var fotaModeName = fotaMode === '0,1,0,1' ? _('HTTP update mode') : fotaMode;
		var fotaState = lineValue(section(raw, 'FOTA state'), '^FOTASTATE');
		var fotaProgress = lineValue(section(raw, 'FOTA progress'), '^FOTADLQ').replace(/"/g, '').split(',');
		var total = Number(fotaProgress[fotaProgress.length - 2]) || 0;
		var received = Number(fotaProgress[fotaProgress.length - 1]) || 0;
		var percent = total > 0 ? Math.max(0, Math.min(100, Math.floor(received / total * 100))) : 0;
		var model = 'MT5700M';
		var revision = lineValue(identity, 'Revision') || lineValue(section(raw, 'Revision'), '');
		var imei = lineValue(identity, 'IMEI') || section(raw, 'IMEI').split(/\n/)[0];
		var buildDate = lineValue(version, '^VERSION:BDT');
		var software = lineValue(version, '^VERSION:EXTS');
		var hardware = lineValue(version, '^VERSION:EXTH');
		var thermalStatus = lineValue(section(raw, 'Thermal status'), '^THERMLDAUTOSTATUS') || lineValue(section(raw, 'Thermal status'), '+THERMLDAUTOSTATUS');
		var thermalValues = thermalStatus.split(',').map(function(value) { return value.trim(); });
		var thermalLevel = Number(thermalValues[5]) || 0;
		var thermalThresholds = lineValue(section(raw, 'Thermal thresholds'), '^THERMLDAUTOPARA').split(',').map(function(value) { return value.trim(); });
		var thermalLog = lineValue(section(raw, 'Thermal log'), '^THERMLDLOGSW').replace(/\s+/g, ',').split(',');
		var stateNames = { '10': _('Waiting to download'), '11': _('Checking for updates'), '12': _('Update available'), '13': _('Update check failed'), '14': _('No update available'), '20': _('Download failed'), '30': _('Downloading'), '31': _('Download paused'), '40': _('Download complete'), '50': _('Preparing installation') };
		var stateName = fotaState ? (stateNames[fotaState] || _('Unknown state')) : _('Status unavailable');
		var stateClass = fotaState === '30' || fotaState === '40' || fotaState === '50' ? ' active' : fotaState === '13' || fotaState === '20' ? ' error' : '';
		var fotaUrl = E('input', { 'class': 'cbi-input-text', 'placeholder': 'http://server/path/' });
		var ledSelect = controls.select([['1',_('Enabled')],['0',_('Disabled')]], ledState || '1');
		var simEnabled = controls.select([['1',_('Active')],['0',_('Inactive')]], simActivation[1] || '1');
		var simSlot = controls.select([['0',_('SIM slot 0')],['1',_('SIM slot 1')]], simSlots[0] || simActivation[2] || '0');
		var self = this;

		return E('div', { 'class': 'mt-system mt-ui-page' }, [
			this.styleNode(),
			controls.styleNode(),
			res.stderr ? E('div', { 'class': 'alert-message warning' }, res.stderr) : null,
			E('section', { 'class': 'mt-system-hero mt-ui-hero' }, [
				E('div', {}, [ E('div', { 'class': 'mt-system-kicker' }, _('MT5700M SYSTEM')), E('h2', { 'class': 'mt-system-title' }, model), E('div', { 'class': 'mt-system-sub' }, revision || _('Module information')) ]),
				E('div', { 'class': 'mt-system-temp' }, [ E('strong', {}, temperature ? temperature + '°' : '--'), E('span', {}, _('Peak sensor temperature')) ])
			]),
			E('div', { 'class': 'mt-system-grid' }, [
				E('section', { 'class': 'mt-system-card mt-ui-card' }, [ E('h3', {}, _('Module information')), this.row(_('Model'), model), this.row(_('Firmware version'), software || revision), this.row(_('Hardware version'), hardware), this.row('IMEI', imei), this.row(_('Build date'), buildDate) ]),
				E('section', { 'class': 'mt-system-card mt-ui-card' }, [ E('h3', {}, _('SIM and subscription')), this.row(_('Phone Number'), phone), this.row('ICCID', iccid), this.row('IMSI', imsi), this.row(_('Subscription downlink'), subscriptionRate(subscription[1])), this.row(_('Subscription uplink'), subscriptionRate(subscription[2])), E('div', { 'class':'mt-control-note' }, _('Device and SIM identifiers are displayed only in this local management page.')) ]),
				E('section', { 'class': 'mt-system-card mt-ui-card' }, [ E('h3', {}, _('Runtime status')), this.row(_('SIM Status'), sim), this.row(_('Operator'), operatorValues[2] || '--'), this.row(_('Network time'), networkTime), this.row(_('Radio function'), functionLevel === '0' ? _('Airplane mode') : functionLevel === '1' ? _('Online') : functionLevel), this.row(_('SIM power path'), simActivation[1] === '1' ? _('Active') : simActivation.length > 1 ? _('Inactive') : ''), this.row(_('FOTA mode'), fotaModeName) ]),
				E('section', { 'class': 'mt-system-card mt-ui-card' }, [ E('h3', {}, _('Thermal protection status')), this.row(_('Protection level'), thermalValues.length ? (thermalLevel === 0 ? _('Normal') : _('Level %d').format(thermalLevel)) : ''), this.row(_('First power reduction'), thermalThresholds[1] ? thermalThresholds[1] + '°C / ' + thermalThresholds[2] + '°C' : ''), this.row(_('Second power reduction'), thermalThresholds[3] ? thermalThresholds[3] + '°C / ' + thermalThresholds[4] + '°C' : ''), this.row(_('Continuous power limit'), thermalThresholds[5] ? thermalThresholds[5] + '°C / ' + thermalThresholds[6] + '°C' : ''), this.row(_('Emergency airplane mode'), thermalThresholds[7] ? thermalThresholds[7] + '°C / ' + thermalThresholds[8] + '°C' : ''), this.row(_('Thermal logging'), thermalLog[0] === '1' || thermalLog[1] === '1' ? _('Enabled') : thermalLog.length > 1 ? _('Disabled') : '') ]),
				E('section', { 'class': 'mt-system-card wide mt-ui-card' }, [
					E('h3', {}, _('SIM and radio')),
					E('div', { 'class':'mt-control-desc' }, _('Daily SIM and radio controls defined by the MT5700M AT command manual.')),
					controls.state(_('Current radio state'), functionLevel === '0' ? _('Airplane mode') : _('Online')),
					controls.action(functionLevel === '0' ? _('Resume mobile radio') : _('Enter airplane mode'), function() { self.runConfirmed(_('Change radio function'), functionLevel === '0' ? _('Resume mobile registration and data service?') : _('Airplane mode immediately disconnects mobile data and voice service.'), [ 'airplane', functionLevel === '0' ? '1' : '0' ], functionLevel !== '0'); }),
					controls.row(_('Module status LED'), ledSelect),
					controls.action(_('Apply LED setting'), function() { controls.confirmRun(_('Module status LED'), _('The LED setting is stored by the module and takes effect after restart.'), [ 'advanced-set', 'led', ledSelect.value ], true); }),
					controls.action(_('Manage SIM PIN'), function() { self.showPinManager(sim); }),
					controls.row(_('SIM activation'), simEnabled),
					controls.action(_('Apply SIM activation'), function() { controls.confirmRun(_('SIM activation'), simEnabled.value === '1' ? _('Activate the physical SIM for network registration?') : _('Deactivating the SIM immediately removes mobile service.'), [ 'advanced-set', 'sim-activation', simEnabled.value ], simEnabled.value === '0'); }),
					controls.row(_('Active SIM slot'), simSlot),
					controls.action(_('Switch SIM slot'), function() { controls.confirmRun(_('Switch SIM slot'), _('The MT5700M will detach from the network while changing the physical SIM path.'), [ 'advanced-set', 'sim-slot', simSlot.value ], true); })
				])
			]),
			E('section', { 'class':'mt-system-maintenance mt-ui-card' }, [
				E('div', {}, [ E('h3', {}, _('Protection and maintenance')), E('p', {}, _('Module protection, recovery and communication troubleshooting tools.')) ]),
				E('div', { 'class':'mt-system-actions' }, [
					E('a', { 'class':'btn', 'href':L.url('admin/modem/mt5700m/settings') }, _('Communication diagnostics')),
					E('button', { 'class':'btn', 'click':function() { self.showThermalManager(thermalThresholds, thermalLog); } }, _('Configure thermal protection')),
					E('button', { 'class':'btn', 'click':function() { self.showIdentityLab(imei); } }, _('Device identity laboratory')),
					E('button', { 'class':'btn cbi-button-negative', 'click':function() { self.showFactoryReset(); } }, _('Restore factory settings'))
				])
			]),
			E('section', { 'class': 'mt-system-fota mt-ui-card' }, [
				E('div', { 'class': 'mt-system-fota-head' }, [ E('div', {}, [ E('h3', {}, _('Firmware update')), E('p', {}, _('Use an MT5700M-compatible HTTP update server. Do not interrupt power during installation.')) ]), E('span', { 'class': 'mt-system-state' + stateClass }, stateName) ]),
				E('div', { 'class': 'mt-system-progress' }, E('span', { 'style': 'width:%d%%'.format(percent) })), E('div', { 'class': 'mt-system-progress-label' }, _('%d%% complete').format(percent)),
				E('div', { 'class': 'mt-system-url' }, [ fotaUrl, E('button', { 'class': 'btn cbi-button-action', 'click': function() {
					if (!/^http:\/\//.test(fotaUrl.value || ''))
						return ui.addNotification(null, E('p', {}, _('Enter a valid HTTP update-server URL.')), 'warning');
					self.runConfirmed(_('Start firmware download'), _('The modem will contact the specified server and may temporarily use mobile data.'), [ 'fota-start', fotaUrl.value ], false);
				} }, _('Check and download')) ]),
				E('div', { 'class': 'mt-system-actions' }, [
					E('button', { 'class': 'btn cbi-button', 'click': function() { window.location.reload(); } }, _('Refresh status')),
					E('button', { 'class': 'btn cbi-button', 'disabled': fotaState === '31' ? null : 'disabled', 'click': function() { self.runConfirmed(_('Resume download'), _('Resume the paused firmware download?'), [ 'fota-resume' ], false); } }, _('Resume Download')),
					E('button', { 'class': 'btn cbi-button-negative', 'disabled': fotaState === '40' ? null : 'disabled', 'click': function() { self.runConfirmed(_('Install firmware'), _('The modem will restart. Do not disconnect power until installation is complete.'), [ 'fota-upgrade' ], true); } }, _('Install update')),
					E('button', { 'class': 'btn cbi-button-negative', 'click': function() { self.runConfirmed(_('Restart Module'), _('This will restart the MT5700M module and temporarily interrupt 5G connectivity.'), [ 'restart' ], true, 24000); } }, _('Restart Module'))
				])
			]),
			E('details', { 'class': 'mt-system-details mt-ui-details' }, [
				E('summary', {}, [
					E('span', { 'class':'mt-ui-summary-copy' }, E('span', { 'class':'mt-ui-summary-title' }, _('Technical details'))),
					E('span', { 'class':'mt-ui-chevron', 'aria-hidden':'true' }, '›')
				]),
				E('pre', { 'class': 'mt-system-raw mt-ui-details-body' }, raw || _('No response.'))
			])
		]);
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
