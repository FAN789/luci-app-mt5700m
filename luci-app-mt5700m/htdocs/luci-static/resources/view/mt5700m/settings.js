'use strict';
'require view';
'require form';
'require mt5700m.controls as controls';

return view.extend({
	render: function() {
		var m, s, o;

		m = new form.Map('mt5700m');

		s = m.section(form.NamedSection, 'settings', 'mt5700m');
		s.anonymous = true;

		o = s.option(form.Flag, 'enabled', _('Enable module management'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.ListValue, 'mode', _('Connection method'));
		o.value('auto', _('Automatic (recommended)'));
		o.value('serial', _('Serial Port'));
		o.value('network', _('Network TCP'));
		o.default = 'auto';
		o.rmempty = false;

		o = s.option(form.Value, 'at_port', _('AT Serial Port'));
		o.placeholder = _('Automatically detect the PCUI interface');
		o.description = _('The manager validates the TD Tech PCUI descriptor instead of assuming a fixed ttyUSB number. Leave this empty unless troubleshooting.');
		o.depends('mode', 'serial');
		o.rmempty = true;

		o = s.option(form.Value, 'host', _('AT Host'));
		o.datatype = 'host';
		o.default = '192.168.8.1';
		o.rmempty = false;
		o.depends('mode', 'network');

		o = s.option(form.Value, 'port', _('AT Port'));
		o.datatype = 'port';
		o.default = '20249';
		o.rmempty = false;
		o.depends('mode', 'network');

		o = s.option(form.Value, 'timeout', _('Response timeout'));
		o.datatype = 'range(1,60)';
		o.default = '8';
		o.rmempty = false;

		return m.render().then(function(formNode) {
			return E('div', { 'class':'mt-diag-page mt-ui-page' }, [
				E('style', {}, [
					'.mt-diag-page{max-width:900px;margin:0 auto}.mt-diag-hero{display:flex;justify-content:space-between;align-items:center;gap:18px;padding:20px 22px;margin-bottom:16px;border-radius:15px;background:linear-gradient(135deg,#304667,#3b587d);color:#fff}.mt-diag-hero h2{margin:0 0 5px;color:#fff;font-size:22px}.mt-diag-hero p{margin:0;font-size:14px;opacity:.8}.mt-diag-badge{padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.14);font-size:14px;white-space:nowrap}',
					'.mt-diag-card{padding:18px 20px;border:1px solid var(--border-color-medium,#d9dde4);border-radius:13px;background:var(--background-color-high,#fff)}.mt-diag-card-head{margin-bottom:10px}.mt-diag-card-head h3{margin:0 0 5px;font-size:17px}.mt-diag-card-head p{margin:0;color:var(--text-color-medium,#69717d);font-size:14px;line-height:1.5}.mt-diag-card .cbi-map>h2,.mt-diag-card .cbi-map-descr,.mt-diag-card .cbi-section>h3{display:none}.mt-diag-card .cbi-section{margin:0;padding:0;border:0;box-shadow:none}.mt-diag-card .cbi-section-node{padding:0}.mt-diag-card .cbi-value{padding:9px 0;border-bottom:1px solid var(--border-color-low,#edf0f4)}.mt-diag-card .cbi-value:last-child{border-bottom:0}.mt-diag-back{margin-top:14px}',
					'@media(max-width:720px){.mt-diag-hero{display:block}.mt-diag-badge{display:inline-block;margin-top:12px}.mt-diag-card{padding:16px}}'
				].join('')),
				controls.styleNode(),
				E('section', { 'class':'mt-diag-hero mt-ui-hero' }, [
					E('div', {}, [ E('h2', {}, _('Communication diagnostics')), E('p', {}, _('Low-level AT channel settings for troubleshooting module communication.')) ]),
					E('span', { 'class':'mt-diag-badge' }, _('Automatic mode recommended'))
				]),
				E('section', { 'class':'mt-diag-card mt-ui-card' }, [
					E('div', { 'class':'mt-diag-card-head' }, [
						E('h3', {}, _('AT communication')),
						E('p', {}, _('These settings do not change APN or mobile data. Leave them unchanged unless automatic detection fails.'))
					]),
					formNode
				]),
				E('div', { 'class':'mt-diag-back' }, E('a', { 'class':'btn', 'href':L.url('admin/modem/mt5700m/system') }, _('Back to Device and SIM')))
			]);
		});
	}
});
