'use strict';
'require view';
'require fs';
'require mt5700m.controls as controls';

return view.extend({
	load: function() {
		return fs.exec('/usr/sbin/mt5700m-read', [ 'advanced', 'hardware' ]).catch(function(err) {
			return { stdout: '', stderr: err.message || String(err) };
		});
	},

	styleNode: function() {
		return E('style', {}, [
			'.mt-hardware{max-width:1120px;margin:0 auto}.mt-hardware-head{padding:22px 24px;border-radius:15px;background:linear-gradient(135deg,#263b59,#354d70);color:#fff;margin-bottom:16px}.mt-hardware-head h2{color:#fff;margin:0 0 7px;font-size:24px}.mt-hardware-head p{margin:0;opacity:.84;font-size:13px;line-height:1.55}',
			'.mt-hardware-warning{margin-bottom:14px}.mt-hardware-details{margin-top:14px;border:1px solid var(--border-color-medium,#d9dde4);border-radius:11px;overflow:hidden}.mt-hardware-details summary{cursor:pointer;padding:12px 14px;font-size:12px;font-weight:650}.mt-hardware-raw{margin:0;padding:14px;background:#17202a;color:#dce6ef;white-space:pre-wrap;word-break:break-word;font:11px/1.55 monospace;max-height:420px;overflow:auto}',
			'.mt-hardware-tools{display:flex;justify-content:space-between;align-items:center;gap:18px;margin-top:18px;padding:16px 18px}.mt-hardware-tools h3{margin:0 0 4px;font-size:14px}.mt-hardware-tools p{margin:0;color:var(--mt-ui-muted);font-size:10px;line-height:1.45}.mt-hardware-tool-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}',
			'@media(max-width:760px){.mt-hardware-head{padding:20px}.mt-hardware-tools{display:block}.mt-hardware-tool-actions{justify-content:flex-start;margin-top:12px}}'
		].join(''));
	},

	render: function(res) {
		var raw = res.stdout || '';
		var usbRaw = controls.section(raw, 'USB mode');
		var interfaceRaw = controls.section(raw, 'Interface mode');
		var nic = controls.pick(controls.section(raw, 'NIC speed'), /\^TDPCIELANCFG:\s*(\d+)/, '');
		var pcieController = controls.pick(controls.section(raw, 'PCIe controller'), /\^TDPMCFG:\s*(\d+)/, '');
		var hotplug = controls.pick(controls.section(raw, 'SIM hotplug'), /\^TDSIMHP:\s*(\d+)/, '');
		var simSlot = controls.pick(controls.section(raw, 'SIM slot'), /\^SCICHG:\s*(\d+)/, '');
		var thermalMatch = controls.section(raw, 'Thermal control').match(/\^THERMAUTOFUN:\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
		var interfaceMode = controls.pick(interfaceRaw, /Mode:\s*(\d+)/, '');
		var usbModeValue = controls.pick(usbRaw, /\^SETMODE:\s*(\d+)/, controls.pick(usbRaw, /(?:^|\n)(\d+)(?:\n|$)/, '4'));

		var usbMode = controls.select([
			['0','Linux ECM'],['1','Windows NCM'],['2','Linux ECM · Debug'],['3','Windows NCM · Debug'],
			['4','Linux NCM'],['5','Linux NCM · Debug'],['6','Windows RNDIS'],['8','PPP']
		], usbModeValue);
		var nicProfile = controls.select([['1','RTL8111 · 1 Gbps'],['2','RTL8125 · 2.5 Gbps']], nic);
		var pcieEnabled = controls.select([['1',_('Enabled')],['0',_('Disabled')]], pcieController || '1');
		var ifaceMode = controls.select([
			['1',_('USB Stick + Ethernet router mode')],
			['2',_('USB router + Ethernet router mode')]
		], interfaceMode);
		var simHotplug = controls.select([['1',_('Enabled')],['0',_('Disabled')]], hotplug);
		var thermalEnabled = controls.select([['1',_('Enabled')],['0',_('Disabled')]], thermalMatch ? thermalMatch[1] : '1');
		var thermalInterval = controls.select([['1','1 s'],['2','2 s'],['3','3 s'],['5','5 s'],['10','10 s'],['30','30 s'],['60','60 s']], thermalMatch ? thermalMatch[3] : '2');

		return E('div', { 'class':'mt-hardware mt-ui-page' }, [
			this.styleNode(),
			controls.styleNode(),
			E('section', { 'class':'mt-hardware-head mt-ui-hero' }, [
				E('h2', {}, _('Advanced Settings')),
				E('p', {}, _('Hardware interfaces, safeguards and diagnostic tools for experienced users. Normal operation does not require changes on this page.'))
			]),
			res.stderr ? E('div', { 'class':'alert-message warning mt-hardware-warning' }, res.stderr) : null,
			E('div', { 'class':'alert-message warning mt-hardware-warning' }, _('Changing an interface profile can interrupt both mobile data and module management. Record the current value before applying a change.')),
			E('section', { 'class':'mt-control-section' }, [
				E('div', { 'class':'mt-control-section-head' }, [
					E('h3', {}, _('Data interfaces')),
					E('p', {}, _('Profiles used by the host USB network driver and the optional PCIe Ethernet path.'))
				]),
				E('div', { 'class':'mt-control-grid' }, [
					controls.card(_('USB data mode'), _('Select the USB network-driver profile presented by the module.'), [
						controls.row(_('USB mode'), usbMode),
						controls.action(_('Apply USB mode'), function() {
							controls.confirmRun(_('Change USB mode'), _('USB connectivity may disappear until the module restarts.'), [ 'advanced-set', 'usb-mode', usbMode.value ], true);
						})
					]),
					controls.card(_('PCIe Ethernet'), _('Match the PHY profile to the Ethernet controller connected to the MT5700M.'), [
						controls.row(_('PCIe controller'), pcieEnabled),
						controls.action(_('Apply PCIe controller'), function() {
							controls.confirmRun(_('PCIe controller'), _('Disabling the PCIe controller removes the module Ethernet data path and may reduce power use.'), [ 'advanced-set', 'pcie-controller', pcieEnabled.value ], true);
						}),
						controls.row(_('PHY profile'), nicProfile),
						E('div', { 'class':'mt-control-note' }, _('This selects a hardware PHY profile; it does not force Ethernet link negotiation speed.')),
						controls.action(_('Apply PHY profile'), function() {
							controls.confirmRun(_('Change PCIe Ethernet PHY'), _('An incorrect PHY profile can make the module Ethernet link unavailable.'), [ 'advanced-set', 'nic-speed', nicProfile.value ], true);
						})
					]),
					controls.card(_('Interface operating mode'), _('Select the documented relationship between the USB and Ethernet data paths.'), [
						controls.row(_('Interface mode'), ifaceMode),
						controls.action(_('Apply interface mode'), function() {
							controls.confirmRun(_('Change interface mode'), _('This changes USB and Ethernet addressing and may disconnect the current session.'), [ 'advanced-set', 'interface-mode', ifaceMode.value ], true);
						})
					], true)
				])
			]),
			E('section', { 'class':'mt-control-section' }, [
				E('div', { 'class':'mt-control-section-head' }, [
					E('h3', {}, _('Module hardware behavior')),
					E('p', {}, _('SIM detection and the built-in temperature-protection polling policy.'))
				]),
				E('div', { 'class':'mt-control-grid' }, [
					controls.card(_('SIM hardware'), _('Review the active SIM path and configure physical-card change detection.'), [
						controls.state(_('Active SIM slot'), simSlot === '0' ? _('External SIM') : simSlot === '1' ? _('Internal SIM') : '--'),
						controls.row(_('SIM hotplug'), simHotplug),
						controls.action(_('Apply SIM hotplug'), function() {
							controls.confirmRun(_('SIM hotplug'), _('Apply the selected physical SIM detection behavior?'), [ 'advanced-set', 'sim-hotplug', simHotplug.value ]);
						})
					]),
					controls.card(_('Thermal protection'), _('Configure the MT5700M built-in temperature-protection polling.'), [
						controls.row(_('Thermal protection'), thermalEnabled),
						controls.row(_('Temperature interval'), thermalInterval),
						E('div', { 'class':'mt-control-note' }, _('Keep thermal protection enabled for normal operation.')),
						controls.action(_('Apply thermal settings'), function() {
							controls.confirmRun(_('Thermal protection'), _('Apply these thermal-protection settings?'), [ 'advanced-set', 'thermal', thermalEnabled.value, thermalInterval.value ]);
						})
					])
				])
			]),
			E('section', { 'class':'mt-hardware-tools mt-ui-card' }, [
				E('div', {}, [ E('h3', {}, _('Diagnostics and developer tools')), E('p', {}, _('Open low-level communication settings or send AT commands directly to the module.')) ]),
				E('div', { 'class':'mt-hardware-tool-actions' }, [
					E('a', { 'class':'btn', 'href':L.url('admin/modem/mt5700m/settings') }, _('Communication diagnostics')),
					E('a', { 'class':'btn cbi-button-action', 'href':L.url('admin/modem/mt5700m/terminal') }, _('AT Console'))
				])
			]),
			E('details', { 'class':'mt-hardware-details mt-ui-details' }, [
				E('summary', {}, [
					E('span', { 'class':'mt-ui-summary-copy' }, E('span', { 'class':'mt-ui-summary-title' }, _('Technical details'))),
					E('span', { 'class':'mt-ui-chevron', 'aria-hidden':'true' }, '›')
				]),
				E('pre', { 'class':'mt-hardware-raw mt-ui-details-body' }, raw || _('No response.'))
			])
		]);
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
