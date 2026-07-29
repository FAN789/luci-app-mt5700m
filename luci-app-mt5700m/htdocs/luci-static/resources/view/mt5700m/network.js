'use strict';
'require view';
'require fs';
'require ui';
'require dom';
'require mt5700m.controls as controls';

function sectionValue(raw, label) {
	var marker = '===== ' + label + ':';
	var lines = (raw || '').split(/\n/);
	var active = false;
	var result = [];

	lines.forEach(function(line) {
		if (line.indexOf('===== ') === 0) {
			active = line.indexOf(marker) === 0;
			return;
		}
		if (active && line.trim() && line.trim() !== 'OK')
			result.push(line.trim());
	});

	return result.join('\n');
}

function matchValues(text, prefix) {
	var line = (text || '').split(/\n/).filter(function(item) { return item.indexOf(prefix) === 0; })[0] || '';
	return line.substring(prefix.length).replace(/^[ :]+/, '').replace(/"/g, '').split(',').map(function(value) { return value.trim(); });
}

function cleanCsv(value) {
	return (value || '').replace(/\s+/g, '').replace(/^,+|,+$/g, '').replace(/,+/g, ',');
}

function validCsv(value) {
	return /^[0-9]+(,[0-9]+)*$/.test(value);
}

function csvInRange(value, minimum, maximum) {
	return validCsv(value) && value.split(',').every(function(item) {
		var number = Number(item);
		return number >= minimum && number <= maximum;
	});
}

function countLines(text, prefix) {
	return (text || '').split(/\n/).filter(function(line) { return line.indexOf(prefix) === 0; }).length;
}

function stateValue(raw) {
	var match = String(raw || '').match(/^state=(.+)$/m);
	return match ? match[1].trim() : '';
}

function parseCellScan(raw) {
	var ratNames = { '1': 'UMTS', '2': 'LTE', '3': '5G NR' };
	var scsNames = [ '15', '30', '60', '120', '240' ];

	return String(raw || '').split(/\n/).filter(function(line) {
		return /^\^CELLSCAN:\s*/.test(line);
	}).map(function(line) {
		var field = line.replace(/^\^CELLSCAN:\s*/, '').split(',').map(function(value) {
			return value.trim().replace(/^"|"$/g, '');
		});
		var frequency = Number(field[2]);
		var band = parseInt(field[4], 16);
		var rsrp = /^-?\d+$/.test(field[11] || '') ? field[11] : '';
		var rsrq = /^-?\d+$/.test(field[12] || '') ? (Number(field[12]) * 0.5).toFixed(1) : '';
		var sinr = /^-?\d+$/.test(field[13] || '') ? (Number(field[13]) * 0.5).toFixed(1) : '';

		return {
			rat: ratNames[field[0]] || field[0] || '--',
			plmn: field[1] || '--',
			frequency: isFinite(frequency) ? (frequency / 1000).toFixed(1) : '--',
			pci: field[3] || '--',
			band: isFinite(band) ? 'B' + band : '--',
			lac: field[5] ? '0x' + field[5].toUpperCase() : '--',
			scs: scsNames[Number(field[10])] || '--',
			rsrp: rsrp || '--',
			rsrq: rsrq || '--',
			sinr: sinr || '--'
		};
	});
}

function formatMcs(values) {
	if (!values.length)
		return '';
	var rat = values[2] === '1' ? 'NR' : values[2] === '0' ? 'LTE' : '';
	var codewords = values.slice(3).filter(function(value) { return /^\d+$/.test(value) && value !== '255'; });
	return [ rat, codewords.length ? 'MCS ' + codewords.join(' / ') : '' ].filter(Boolean).join(' · ');
}

function bandChecklist(options, mask, anyMask) {
	var numeric = parseInt(mask || '0', 16);
	var all = String(mask || '').toUpperCase() === anyMask;
	var checks = options.map(function(item) {
		var value = parseInt(item[0], 16);
		return E('input', {
			'type':'checkbox',
			'value':item[0],
			'checked':all || (numeric && Math.floor(numeric / value) % 2 === 1) ? 'checked' : null
		});
	});
	var node = E('div', { 'class':'mt-band-options' }, options.map(function(item, index) {
		return E('label', { 'class':'mt-band-option' }, [ checks[index], E('span', {}, item[1]) ]);
	}));
	node._bandCheckboxes = checks;
	return node;
}

function selectedBandMask(node, anyMask) {
	var selected = node._bandCheckboxes.filter(function(checkbox) { return checkbox.checked; });
	if (!selected.length)
		return '';
	if (selected.length === node._bandCheckboxes.length)
		return anyMask;
	return selected.reduce(function(total, checkbox) { return total + parseInt(checkbox.value, 16); }, 0).toString(16).toUpperCase();
}

function bandPanel(title, description, checklist) {
	return E('section', { 'class':'mt-band-card mt-ui-card' }, [
		E('div', { 'class':'mt-band-head' }, [
			E('div', {}, [ E('h3', {}, title), E('p', {}, description) ]),
			E('button', {
				'type':'button',
				'class':'btn',
				'click':function() { checklist._bandCheckboxes.forEach(function(checkbox) { checkbox.checked = true; }); }
			}, _('Select all'))
		]),
		checklist
	]);
}

function parseServingCell(values) {
	var rat = String(values[0] || '').toUpperCase();
	var cell = {
		rat: values[0] || '', mcc: values[1] || '', mnc: values[2] || '',
		arfcn: '', scs: '', cellId: '', pci: '', tac: '', metrics: []
	};

	if (rat.indexOf('NR') === 0) {
		cell.arfcn = values[3] || '';
		cell.scs = values[4] || '';
		cell.cellId = values[5] || '';
		cell.pci = values[6] || '';
		cell.tac = values[7] || '';
		cell.metrics = [
			{ label: 'RSRP', value: values[8] || '', unit: 'dBm' },
			{ label: 'RSRQ', value: values[9] || '', unit: 'dB' },
			{ label: 'SINR', value: values[10] || '', unit: 'dB' }
		];
	} else if (rat.indexOf('LTE') === 0) {
		cell.arfcn = values[3] || '';
		cell.cellId = values[4] || '';
		cell.pci = values[5] || '';
		cell.tac = values[6] || '';
		cell.metrics = [
			{ label: 'RSRP', value: values[7] || '', unit: 'dBm' },
			{ label: 'RSRQ', value: values[8] || '', unit: 'dB' },
			{ label: 'RSSI', value: values[9] || '', unit: 'dBm' }
		];
	} else if (rat.indexOf('WCDMA') === 0) {
		cell.arfcn = values[3] || '';
		cell.cellId = values[5] || '';
		cell.tac = values[6] || '';
		cell.metrics = [
			{ label: 'RSCP', value: values[7] || '', unit: 'dBm' },
			{ label: 'RXLEV', value: values[8] || '', unit: 'dBm' },
			{ label: 'ECIO', value: values[9] || '', unit: 'dB' }
		];
	} else {
		cell.metrics = [
			{ label: 'RSRP', value: '', unit: 'dBm' },
			{ label: 'RSRQ', value: '', unit: 'dB' },
			{ label: 'SINR', value: '', unit: 'dB' }
		];
	}

	return cell;
}

return view.extend({
	load: function() {
		return Promise.all([
			fs.exec('/usr/sbin/mt5700m-read', [ 'network' ]).catch(function(err) {
				return { stdout: '', stderr: err.message || String(err) };
			}),
			fs.exec('/usr/sbin/mt5700m-read', [ 'advanced', 'radio' ]).catch(function(err) {
				return { stdout: '', stderr: err.message || String(err) };
			})
		]);
	},

	styleNode: function() {
		return E('style', {}, [
			'.mt-net{max-width:1120px;margin:0 auto;color:var(--text-color-high,#20242a)}',
			'.mt-net-hero{display:flex;justify-content:space-between;align-items:center;gap:18px;padding:21px 23px;border:1px solid #cfe4fb;border-radius:15px;background:linear-gradient(135deg,#f4f9ff,#eefaf8);margin-bottom:16px}',
			'.mt-net-kicker{font-size:12px;color:#2470a9;font-weight:700;margin-bottom:5px}',
			'.mt-net-title{font-size:25px;font-weight:720;line-height:1.2;margin:0 0 6px}',
			'.mt-net-sub{font-size:13px;color:var(--text-color-medium,#68717d)}',
			'.mt-net-badge{display:inline-flex;align-items:center;gap:7px;padding:7px 11px;border-radius:999px;background:#dcf6eb;color:#08775d;font-size:12px;font-weight:700;white-space:nowrap}',
			'.mt-net-badge:before{content:"";width:7px;height:7px;border-radius:50%;background:#17b883}',
			'.mt-net-badge.off{background:#fff0e2;color:#99530a}.mt-net-badge.off:before{background:#e99737}',
			'.mt-net-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0 0 16px}',
			'.mt-net-metric,.mt-net-panel{border:1px solid var(--border-color-medium,#d9dde4);border-radius:13px;background:var(--background-color-high,#fff);box-shadow:0 3px 12px rgba(20,32,50,.04)}',
			'.mt-net-metric{padding:16px}.mt-net-label{font-size:12px;color:var(--text-color-medium,#707985);margin-bottom:6px}',
			'.mt-net-value{font-size:23px;font-weight:720}.mt-net-unit{font-size:12px;color:#747c86;margin-left:5px}',
			'.mt-net-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}',
			'.mt-net-panel{padding:16px}.mt-net-panel h3{font-size:14px;margin:0 0 12px}',
			'.mt-net-row{display:flex;justify-content:space-between;gap:16px;padding:9px 0;border-bottom:1px solid var(--border-color-low,#edf0f4);font-size:13px}',
			'.mt-net-row:last-child{border-bottom:0}.mt-net-row span:first-child{color:var(--text-color-medium,#707985)}.mt-net-row strong{text-align:right;word-break:break-word}',
			'.mt-net-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:15px}.mt-net-actions .btn{border-radius:9px;padding:7px 14px}',
			'.mt-net-details{margin-top:14px;border:1px solid var(--border-color-medium,#d9dde4);border-radius:12px;overflow:hidden}',
			'.mt-net-details summary{cursor:pointer;padding:13px 15px;font-size:13px;font-weight:650}.mt-net-raw{margin:0;padding:14px;background:#17202a;color:#dce6ef;white-space:pre-wrap;word-break:break-word;font:12px/1.55 monospace;max-height:420px;overflow:auto}',
			'.mt-freq-head{margin-top:20px;padding:19px 20px;border-radius:13px;background:linear-gradient(135deg,#f4f7fb,#f1f8f6);border:1px solid #dce7ee}.mt-freq-head h3{font-size:18px;margin:0 0 6px}.mt-freq-head p{margin:0;color:var(--text-color-medium,#68717d);font-size:12px}',
			'.mt-freq-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px}.mt-freq-card{padding:17px;border:1px solid var(--border-color-medium,#d9dde4);border-radius:13px;background:var(--background-color-high,#fff)}.mt-freq-card h4{margin:0 0 12px;font-size:14px}.mt-freq-field{margin:11px 0}.mt-freq-field label{display:block;font-size:12px;color:var(--text-color-medium,#6d7680);margin-bottom:5px}.mt-freq-field input,.mt-freq-field select{width:100%;box-sizing:border-box}.mt-freq-help{font-size:11px;color:var(--text-color-medium,#7b838c);margin-top:5px}.mt-freq-actions{display:flex;justify-content:flex-end;margin-top:14px}',
			'.mt-band-card{padding:18px}.mt-band-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin-bottom:14px}.mt-band-head h3{margin:0 0 4px;font-size:15px}.mt-band-head p{margin:0;color:var(--text-color-medium,#6d7680);font-size:11px;line-height:1.45}.mt-band-head .btn{flex:0 0 auto}.mt-band-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.mt-band-option{display:flex;align-items:center;gap:9px;min-height:40px;padding:7px 10px;border:1px solid var(--border-color-low,#e8ecf0);border-radius:9px;background:var(--background-color-low,#f8fafb);cursor:pointer;font-size:12px;transition:border-color .15s ease,background-color .15s ease}.mt-band-option:hover{border-color:#9cc5ee;background:#f1f7fd}.mt-band-option input{flex:0 0 auto;width:16px!important;height:16px;margin:0}.mt-band-apply{grid-column:1/-1;display:flex;justify-content:space-between;align-items:center;gap:18px;padding:15px 18px}.mt-band-apply p{margin:0;color:var(--text-color-medium,#6d7680);font-size:11px;line-height:1.5}.mt-band-apply .btn{flex:0 0 auto}',
			'.mt-scan-progress{text-align:center;padding:22px 12px}.mt-scan-spinner{display:inline-block;width:28px;height:28px;border:3px solid #d8e6f4;border-top-color:#2384d8;border-radius:50%;animation:mt-scan-spin .8s linear infinite}.mt-scan-progress p{margin:14px 0 0;color:var(--text-color-medium,#68717d)}@keyframes mt-scan-spin{to{transform:rotate(360deg)}}',
			'.mt-scan-summary{margin:0 0 12px;color:var(--text-color-medium,#68717d);font-size:13px}.mt-scan-table-wrap{max-width:100%;overflow:auto;border:1px solid var(--border-color-medium,#d9dde4);border-radius:10px}.mt-scan-table{width:100%;border-collapse:collapse;white-space:nowrap;font-size:12px}.mt-scan-table th,.mt-scan-table td{padding:9px 11px;border-bottom:1px solid var(--border-color-low,#edf0f4);text-align:left}.mt-scan-table th{background:var(--background-color-low,#f5f8fa);font-weight:700}.mt-scan-table tr:last-child td{border-bottom:0}',
			'@media(max-width:720px){.mt-net-hero{display:block}.mt-net-badge{margin-top:13px}.mt-net-metrics{grid-template-columns:1fr}.mt-net-grid,.mt-freq-grid{grid-template-columns:1fr}.mt-band-options{grid-template-columns:repeat(2,minmax(0,1fr))}.mt-band-apply{display:block}.mt-band-apply .btn{width:100%;margin-top:12px}}',
			'@media(max-width:430px){.mt-band-head{display:block}.mt-band-head .btn{margin-top:10px}.mt-band-options{grid-template-columns:1fr}}'
		].join(''));
	},

	row: function(label, value) {
		return E('div', { 'class': 'mt-net-row' }, [ E('span', {}, label), E('strong', {}, value || '--') ]);
	},

	metric: function(label, value, unit) {
		return E('div', { 'class': 'mt-net-metric mt-ui-card' }, [
			E('div', { 'class': 'mt-net-label' }, label),
			E('span', { 'class': 'mt-net-value' }, value || '--'),
			value ? E('span', { 'class': 'mt-net-unit' }, unit) : null
		]);
	},

	showCellScanResult: function(raw) {
		var rows = parseCellScan(raw);
		var content;

		if (rows.length) {
			content = E('div', {}, [
				E('p', { 'class':'mt-scan-summary' }, _('%d nearby cells found. The modem has returned to automatic network selection.').format(rows.length)),
				E('div', { 'class':'mt-scan-table-wrap' }, E('table', { 'class':'mt-scan-table' }, [
					E('thead', {}, E('tr', {}, [
						E('th', {}, _('Network')), E('th', {}, 'PLMN'), E('th', {}, _('Band')),
						E('th', {}, _('Frequency')), E('th', {}, 'PCI'), E('th', {}, 'TAC / LAC'),
						E('th', {}, 'SCS'), E('th', {}, 'RSRP'), E('th', {}, 'RSRQ'), E('th', {}, 'SINR')
					])),
					E('tbody', {}, rows.map(function(row) {
						return E('tr', {}, [
							E('td', {}, row.rat), E('td', {}, row.plmn), E('td', {}, row.band),
							E('td', {}, row.frequency + ' MHz'), E('td', {}, row.pci), E('td', {}, row.lac),
							E('td', {}, row.scs === '--' ? '--' : row.scs + ' kHz'),
							E('td', {}, row.rsrp === '--' ? '--' : row.rsrp + ' dBm'),
							E('td', {}, row.rsrq === '--' ? '--' : row.rsrq + ' dB'),
							E('td', {}, row.sinr === '--' ? '--' : row.sinr + ' dB')
						]);
					}))
				])),
				E('details', { 'class':'mt-net-details', 'style':'margin-top:12px' }, [
					E('summary', {}, _('Raw modem response')),
					E('pre', { 'class':'mt-net-raw' }, raw)
				])
			]);
		} else {
			content = E('div', {}, [
				E('div', { 'class':'alert-message warning' }, _('No valid cell records were returned.')),
				E('pre', { 'class':'mt-net-raw' }, raw || _('No response.'))
			]);
		}

		ui.showModal(_('Cell Scan'), [
			content,
			E('div', { 'class':'right', 'style':'margin-top:14px' }, E('button', { 'class':'btn', 'click':ui.hideModal }, _('Close')))
		]);
	},

	startCellScan: function() {
		var self = this;
		var attempts = 0;

		ui.showModal(_('Cell Scan'), E('div', { 'class':'mt-scan-progress' }, [
			E('span', { 'class':'mt-scan-spinner', 'aria-hidden':'true' }),
			E('p', {}, _('Scanning nearby cells. Mobile service is temporarily disconnected; this usually takes 1–2 minutes.'))
		]));

		function poll() {
			return fs.exec('/usr/sbin/mt5700m-read', [ 'cellscan-status' ]).then(function(result) {
				var state = stateValue(result.stdout);
				if (state === 'done' || state === 'error') {
					return fs.exec('/usr/sbin/mt5700m-read', [ 'cellscan-result' ]).then(function(scan) {
						if (state === 'error')
							throw new Error((scan.stdout || scan.stderr || _('Cell scan failed.')).replace(/^state=error\s*/m, '').trim());
						self.showCellScanResult(scan.stdout || '');
					});
				}
				if (++attempts >= 100)
					throw new Error(_('Cell scan timed out. Automatic network selection has been requested; refresh the page after the modem reconnects.'));
				return new Promise(function(resolve) {
					window.setTimeout(function() { resolve(poll()); }, 2000);
				});
			});
		}

		return fs.exec('/usr/sbin/mt5700m-at', [ 'cellscan-start' ]).then(function() {
			return poll();
		}).catch(function(err) {
			ui.showModal(_('Cell Scan'), [
				E('div', { 'class':'alert-message danger' }, err.message || String(err)),
				E('div', { 'class':'right' }, E('button', { 'class':'btn', 'click':ui.hideModal }, _('Close')))
			]);
		});
	},

	lockPanel: function(title, rat, currentType) {
		var self = this;
		var type = E('select', { 'class':'cbi-input-select' }, [E('option',{'value':'3'},_('Band Lock')),E('option',{'value':'1'},_('ARFCN Lock')),E('option',{'value':'2'},_('Cell Lock')),E('option',{'value':'0'},_('Remove Lock'))]);
		type.value = /^(0|1|2|3)$/.test(currentType || '') ? currentType : '0';
		var bands = E('input', { 'class':'cbi-input-text','placeholder':rat==='nr'?'78,41':'3,8','inputmode':'numeric' });
		var arfcns = E('input', { 'class':'cbi-input-text','placeholder':rat==='nr'?'630000,520000':'1850,3450','inputmode':'numeric' });
		var scs = E('input', { 'class':'cbi-input-text','placeholder':'1,1','inputmode':'numeric' });
		var pcis = E('input', { 'class':'cbi-input-text','placeholder':'100,200','inputmode':'numeric' });
		var wraps = {};
		function field(key,label,input,help){wraps[key]=E('div',{'class':'mt-freq-field'},[E('label',{},label),input,E('div',{'class':'mt-freq-help'},help)]);return wraps[key];}
		function update(){var t=type.value;wraps.bands.style.display=t==='0'?'none':'';wraps.arfcns.style.display=t==='1'||t==='2'?'':'none';if(wraps.scs)wraps.scs.style.display=t==='1'||t==='2'?'':'none';wraps.pcis.style.display=t==='2'?'':'none';}
		function apply(){
			var t=type.value, values=[cleanCsv(bands.value),cleanCsv(arfcns.value),cleanCsv(scs.value),cleanCsv(pcis.value)];
			var required=t==='0'?[]:t==='3'?[0]:t==='1'?(rat==='nr'?[0,1,2]:[0,1]):(rat==='nr'?[0,1,2,3]:[0,1,3]);
			if(required.some(function(i){return !validCsv(values[i]);}))return ui.addNotification(null,E('p',{},_('Complete all required fields using comma-separated numbers.')),'warning');
				var lengths=required.map(function(i){return values[i].split(',').length;});
				if(lengths.some(function(n){return n!==lengths[0];}))return ui.addNotification(null,E('p',{},_('Each field must contain the same number of values.')),'warning');
				if(lengths[0]>20)return ui.addNotification(null,E('p',{},_('The MT5700M manual allows at most 20 lock entries.')),'warning');
				if(rat==='nr'&&(t==='1'||t==='2')&&!csvInRange(values[2],0,4))return ui.addNotification(null,E('p',{},_('NR SCS type must be between 0 and 4.')),'warning');
				if(t==='2'&&!csvInRange(values[3],0,rat==='nr'?1007:503))return ui.addNotification(null,E('p',{},_('PCI is outside the valid range for the selected radio technology.')),'warning');
				var args=rat==='nr'?['lock',rat,t,values[0],values[1],values[2],values[3]]:['lock',rat,t,values[0],values[1],values[3]];
				ui.showModal(_('Confirm frequency change'),[E('p',{},[t==='0'?_('Remove the current %s frequency lock?').format(rat.toUpperCase()):_('Apply this %s frequency lock? Mobile connectivity may reconnect.').format(rat.toUpperCase()),' ',_('Mobile service will disconnect briefly while the module enters airplane mode.')]),E('div',{'class':'right'},[E('button',{'type':'button','class':'btn','click':ui.hideModal},_('Cancel')),' ',E('button',{'type':'button','class':'btn cbi-button-negative','click':function(){ui.hideModal();fs.exec('/usr/sbin/mt5700m-at',args).then(function(){ui.addNotification(null,E('p',{},_('Frequency lock updated.')));window.setTimeout(function(){window.location.reload();},2500);},function(err){ui.addNotification(null,E('p',{},err.message||_('The modem rejected this setting.')),'danger');});}},t==='0'?_('Remove Lock'):_('Apply Lock'))])]);
		}
		type.addEventListener('change',update);
		var body=[field('type',_('Lock Type'),type,_('Choose the least restrictive mode that meets your need.')),field('bands',_('Bands'),bands,_('Use numbers separated by commas.')),field('arfcns',_('ARFCNs'),arfcns,_('One ARFCN for each band.'))];
		if(rat==='nr')body.push(field('scs',_('SCS Types'),scs,_('One SCS type for each NR band.')));
		body.push(field('pcis','PCI',pcis,_('One PCI for each band and ARFCN.')),E('div',{'class':'mt-freq-actions'},E('button',{'type':'button','class':'btn cbi-button-apply','click':apply},_('Review and apply'))));
		var card=E('section',{'class':'mt-freq-card mt-ui-card'},[E('h4',{},title)].concat(body));window.setTimeout(update,0);return card;
	},

	radioDiagnostics: function(raw) {
		var uplinkMcs = matchValues(controls.section(raw, 'Uplink MCS'), '^MCS');
		var downlinkMcs = matchValues(controls.section(raw, 'Downlink MCS'), '^MCS');
		var txPower = matchValues(controls.section(raw, 'NR transmit power'), '^NTXPOWER');
		var ssb = matchValues(controls.section(raw, 'NR SSB beam'), '^NRSSBID');
		var qos = matchValues(controls.section(raw, 'QoS'), '+CGEQOSRDP');
		var dataRegistration = matchValues(controls.section(raw, 'Data registration'), '+C5GREG');
		var ims = matchValues(controls.section(raw, 'IMS registration'), '+CIREG');
		var endc = matchValues(controls.section(raw, 'Dual connectivity'), '^LENDC');
		var lteSecondary = countLines(controls.section(raw, 'LTE secondary cells'), '^CASCELLINFO');
		var nsaSecondary = countLines(controls.section(raw, 'NSA secondary cells'), '^MONSSC: NR');
		return E('div', { 'class':'mt-net-grid', 'style':'margin-top:12px' }, [
			E('section', { 'class':'mt-net-panel mt-ui-card' }, [
				E('h3', {}, _('Radio link details')),
				this.row(_('Uplink modulation'), formatMcs(uplinkMcs)), this.row(_('Downlink modulation'), formatMcs(downlinkMcs)),
				this.row(_('QoS class'), qos[1] ? 'QCI ' + qos[1] : ''), this.row(_('NR PUSCH power'), txPower[0] && txPower[0] !== '999' ? txPower[0] + ' dBm' : ''),
				this.row(_('NR PUCCH power'), txPower[1] && txPower[1] !== '999' ? txPower[1] + ' dBm' : ''), this.row(_('NR transmit frequency'), txPower[4] && txPower[4] !== '0' ? (Number(txPower[4]) / 1000).toFixed(1) + ' MHz' : '')
			]),
			E('section', { 'class':'mt-net-panel mt-ui-card' }, [
				E('h3', {}, _('5G beam and service')), this.row(_('LTE secondary carriers'), String(lteSecondary)), this.row(_('NSA secondary connections'), String(nsaSecondary)),
				this.row(_('SSB ARFCN'), ssb[0]), this.row(_('Serving beam PCI'), ssb[2]), this.row(_('Beam RSRP'), ssb[3] ? ssb[3] + ' dBm' : ''), this.row(_('Beam SINR'), ssb[4] ? ssb[4] + ' dB' : ''),
				this.row(_('Detected SSB beams'), ssb[6]), this.row(_('Data registration'), dataRegistration[1] === '1' || dataRegistration[1] === '5' ? _('Registered') : dataRegistration.length ? _('Not registered') : ''),
				this.row(_('IMS registration'), ims[1] === '1' ? _('Registered') : ims.length ? _('Not registered') : ''), this.row(_('LTE-NR dual connectivity'), endc[0] === '1' ? _('Enabled') : endc.length ? _('Disabled') : '')
			])
		]);
	},

	render: function(results) {
		var res = results[0] || {}, radioSettings = results[1] || {};
		var raw = res.stdout || '', radioRaw = radioSettings.stdout || '';
		var signal = matchValues(sectionValue(raw, 'Signal'), '^HCSQ');
		var cell = parseServingCell(matchValues(sectionValue(raw, 'Serving cell'), '^MONSC'));
		var registration = matchValues(sectionValue(raw, 'Network registration'), '+CEREG');
		var operator = matchValues(sectionValue(raw, 'Operator'), '+COPS');
		var lteLock = matchValues(sectionValue(raw, 'LTE lock'), '^LTEFREQLOCK');
		var nrLock = matchValues(sectionValue(raw, 'NR lock'), '^NRFREQLOCK');
		var rrc = matchValues(sectionValue(raw, 'RRC state'), '^RRCSTAT');
		var rrcLabels = [ _('Idle'), _('Connected'), _('Inactive'), _('Invalid') ];
		var rrcState = rrc.length > 1 ? (rrcLabels[Number(rrc[1])] || rrc[1]) : '';
		if (rrc.length > 2)
			rrcState += rrc[2] === '98' ? ' · ' + _('Camped') : rrc[2] === '99' ? ' · ' + _('Not camped') : '';
		var registered = registration[1] === '1' || registration[1] === '5';
		var operatorName = operator[2] || _('Mobile Network');
		var lteLockState = !lteLock[0] ? '--' : lteLock[0] === '0' ? _('Not locked') : _('Locked');
		var nrLockState = !nrLock[0] ? '--' : nrLock[0] === '0' ? _('Not locked') : _('Locked');
		var systemValues = matchValues(controls.section(radioRaw, 'Radio mode'), '^SYSCFGEX');
		var radioCode = systemValues[0] || '';
		var wcdmaMask = systemValues[1] || '3FFFFFFF';
		var roamValue = systemValues[2] || '1';
		var serviceDomain = systemValues[3] || '2';
		var lteMask = systemValues[4] || '7FFFFFFFFFFFFFFF';
		var radioLabels = {
			'00': _('Automatic'), '01': 'GSM', '02': 'WCDMA', '03': 'LTE', '08': '5G NR',
			'0302': 'LTE / WCDMA', '030201': 'LTE / WCDMA / GSM',
			'0803': '5G NR / LTE', '080302': '5G NR / LTE / WCDMA'
		};
		var radioMode = radioLabels[radioCode] ? radioLabels[radioCode] + ' · ' + radioCode : radioCode;
		var radioModeSelect = controls.select([
			['080302',_('5G NR / LTE / WCDMA (recommended)')],['0803',_('5G NR / LTE')],['08',_('5G NR only')],
			['03',_('LTE only')],['0302',_('LTE / WCDMA')],['02','WCDMA']
		], radioCode || '080302');
		var roaming = controls.select([['0',_('Home network only')],['1',_('Allow roaming')]], roamValue);
		var service = controls.select([['1',_('Data service only')],['2',_('Voice and data service')]], serviceDomain);
		var wcdmaBands = bandChecklist([['400000','B1 · 2100 MHz'],['2000000000000','B8 · 900 MHz']], wcdmaMask, '3FFFFFFF');
		var lteBands = bandChecklist([
			['1','B1'],['4','B3'],['10','B5'],['80','B8'],['200000000','B34'],
			['2000000000','B38'],['4000000000','B39'],['8000000000','B40'],['10000000000','B41']
		], lteMask, '7FFFFFFFFFFFFFFF');
		var accessValues = matchValues(controls.section(radioRaw, '5G access mode'), '^C5GOPTION');
		var accessCode = accessValues.slice(0, 3).join(',');
		var accessPreset = controls.select([
			['option23',_('SA + NSA (Option 2 + 3)')],['option2',_('SA only (Option 2)')],['option3',_('NSA only (Option 3)')]
		], accessCode === '1,0,1' ? 'option2' : accessCode === '0,1,0' ? 'option3' : 'option23');
		var ca = controls.pick(controls.section(radioRaw, 'NR carrier aggregation'), /\^NRRCCAPQRY:\s*3,(\d+)/, '');
		var vonr = controls.pick(controls.section(radioRaw, 'VoNR'), /\^NRRCCAPQRY:\s*2,(\d+)/, '');
		var dssMatch = controls.section(radioRaw, 'DSS').match(/\^NRRCCAPQRY:\s*5,(\d+),(\d+)/);
		var caEnabled = controls.select([['1',_('Enabled')],['0',_('Disabled')]], ca);
		var vonrMode = controls.select([['0',_('Disabled')],['1','FR1 VoNR'],['2','FR2 VoNR'],['3','FR1 + FR2 VoNR']], vonr);
		var dssRate = controls.select([['0',_('Keep factory capability')],['1',_('Force capability off')]], dssMatch ? dssMatch[1] : '0');
		var dssDmrs = controls.select([['0',_('Keep factory capability')],['1',_('Force capability off')]], dssMatch ? dssMatch[2] : '0');
		var diagnosticHost = E('div', { 'class':'mt-net-diagnostics' }, E('div', { 'class':'alert-message notice' }, _('Loading detailed radio diagnostics…')));
		var self = this;
		window.setTimeout(function() {
			fs.exec('/usr/sbin/mt5700m-read', [ 'advanced', 'radio-diagnostics' ]).then(function(result) {
				dom.content(diagnosticHost, self.radioDiagnostics(result.stdout || ''));
			}, function(err) {
				dom.content(diagnosticHost, E('div', { 'class':'alert-message warning' }, err.message || String(err)));
			});
		}, 0);
		var radioControls = E('section', { 'class':'mt-control-section' }, [
			E('div', { 'class':'mt-control-section-head' }, [
				E('h3', {}, _('Radio preferences')),
				E('p', {}, _('5G service capabilities reported by the MT5700M. Keep the carrier defaults unless compatibility troubleshooting requires a change.'))
			]),
			radioSettings.stderr ? E('div', { 'class':'alert-message warning' }, radioSettings.stderr) : null,
			E('div', { 'class':'mt-control-grid' }, [
				controls.card(_('Network access policy'), _('Select radio priority, roaming and the service domain. These values are applied together as required by the MT5700M manual.'), [
					controls.row(_('Radio access order'), radioModeSelect),
					controls.row(_('Roaming policy'), roaming),
					controls.row(_('Service domain'), service)
				], true),
				bandPanel(_('WCDMA bands'), _('Select the WCDMA bands the module may use.'), wcdmaBands),
				bandPanel(_('LTE bands'), _('Select the LTE bands the module may use.'), lteBands),
				E('section', { 'class':'mt-band-apply mt-ui-card' }, [
					E('p', {}, _('Keep all bands selected for normal use. Restricting bands can prevent registration when travelling.')),
					E('button', { 'type':'button', 'class':'btn cbi-button-apply', 'click':function() {
						var selectedWcdma = selectedBandMask(wcdmaBands, '3FFFFFFF');
						var selectedLte = selectedBandMask(lteBands, '7FFFFFFFFFFFFFFF');
						if (!selectedWcdma || !selectedLte)
							return ui.addNotification(null, E('p', {}, _('Select at least one WCDMA band and one LTE band.')), 'warning');
						controls.confirmRun(_('Change network policy'), _('The module may lose service if the selected radio technology or bands are unavailable.'), [ 'advanced-set', 'radio-policy', radioModeSelect.value, selectedWcdma, roaming.value, service.value, selectedLte ], true);
					} }, _('Apply network and band settings'))
				]),
				controls.card(_('5G access architecture'), _('Choose whether the module may use standalone 5G, non-standalone 5G, or both.'), [
					controls.row(_('5G access mode'), accessPreset),
					E('div', { 'class':'mt-control-note' }, _('The MT5700M manual requires an airplane-mode cycle before this setting and a module restart afterwards. The cycle is handled automatically; restart when ready.')),
					controls.action(_('Apply 5G access mode'), function() {
						controls.confirmRun(_('Change 5G access mode'), _('Mobile service will disconnect briefly while the module enters airplane mode.'), [ 'advanced-set', '5g-access', accessPreset.value ], true);
					})
				]),
				controls.card(_('5G service capabilities'), _('Carrier aggregation and voice capability advertised by the module.'), [
					controls.state(_('Current radio mode'), radioMode),
					controls.row(_('NR carrier aggregation capability'), caEnabled),
					controls.action(_('Apply carrier aggregation'), function() {
						controls.confirmRun(_('NR carrier aggregation capability'), _('Apply the selected carrier aggregation capability?'), [ 'advanced-set', 'carrier-aggregation', caEnabled.value ], true);
					}),
					controls.row(_('VoNR mode'), vonrMode),
					controls.action(_('Apply VoNR mode'), function() {
						controls.confirmRun(_('VoNR mode'), _('Apply the selected VoNR capability?'), [ 'advanced-set', 'vonr', vonrMode.value ], true);
					})
				]),
				controls.card(_('DSS compatibility'), _('Restrict optional DSS capabilities only when required by the mobile network.'), [
					controls.row(_('DSS rate matching capability'), dssRate),
					controls.row(_('Additional DMRS capability'), dssDmrs),
					E('div', { 'class':'mt-control-note' }, _('Force capability off is a compatibility override. Keep the factory capability for normal operation.')),
					controls.action(_('Apply DSS settings'), function() {
						controls.confirmRun('DSS', _('Apply the selected DSS capability restrictions?'), [ 'advanced-set', 'dss', dssRate.value, dssDmrs.value ], true);
					})
				])
			])
		]);

		return E('div', { 'class': 'mt-net mt-ui-page' }, [
			this.styleNode(),
			controls.styleNode(),
			res.stderr ? E('div', { 'class': 'alert-message warning' }, res.stderr) : null,
			E('section', { 'class': 'mt-net-hero mt-ui-hero' }, [
				E('div', {}, [
					E('div', { 'class': 'mt-net-kicker' }, _('NETWORK AND CELL')),
					E('h2', { 'class': 'mt-net-title' }, operatorName),
					E('div', { 'class': 'mt-net-sub' }, _('Serving-cell and registration information reported by the modem.'))
				]),
				E('span', { 'class': 'mt-net-badge' + (registered ? '' : ' off') }, registered ? _('Registered') : _('Not registered'))
			]),
			E('div', { 'class': 'mt-net-metrics' }, [
				this.metric(cell.metrics[0].label, cell.metrics[0].value, cell.metrics[0].unit),
				this.metric(cell.metrics[1].label, cell.metrics[1].value, cell.metrics[1].unit),
				this.metric(cell.metrics[2].label, cell.metrics[2].value, cell.metrics[2].unit)
			]),
			E('div', { 'class': 'mt-net-grid' }, [
				E('section', { 'class': 'mt-net-panel' }, [
					E('h3', {}, _('Serving cell')),
					this.row(_('Radio access'), cell.rat || signal[0]),
					this.row('MCC / MNC', cell.mcc && cell.mnc ? '%s / %s'.format(cell.mcc, cell.mnc) : ''),
					this.row('ARFCN', cell.arfcn),
					this.row('PCI', cell.pci),
					this.row(_('Cell ID'), cell.cellId),
					this.row('TAC / LAC', cell.tac),
					cell.scs ? this.row(_('SCS type'), cell.scs + ' · ' + ([ '15', '30', '60', '120', '240' ][Number(cell.scs)] || '?') + ' kHz') : null,
					this.row(_('Registration'), registered ? (registration[1] === '5' ? _('Roaming') : _('Home network')) : _('Not registered'))
				]),
				E('section', { 'class': 'mt-net-panel' }, [
					E('h3', {}, _('Radio status')),
					this.row(_('Operator'), operatorName),
					this.row(_('RRC state'), rrcState),
					this.row(_('LTE Lock'), lteLockState),
					this.row(_('NR Lock'), nrLockState)
				])
			]),
			diagnosticHost,
			E('div', { 'class': 'mt-net-actions' }, [
				E('button', { 'class': 'btn cbi-button-action', 'click': function() { window.location.reload(); } }, _('Refresh status')),
				E('button', { 'class': 'btn cbi-button', 'click': function() {
					return ui.showModal(_('Confirm Action'), [
						E('p', {}, _('Cell scan disconnects mobile service for about 1–2 minutes and restores automatic network selection afterwards. Active LTE or 5G NR frequency locks must be removed first.')),
						E('div', { 'class': 'right' }, [ E('button', { 'class': 'btn', 'click': ui.hideModal }, _('Cancel')), ' ', E('button', { 'class': 'btn cbi-button-apply', 'click': function() {
							ui.hideModal();
							return self.startCellScan();
						} }, _('Continue')) ])
					]);
				} }, _('Cell Scan'))
			]),
			E('details', { 'class': 'mt-net-details mt-ui-details' }, [
				E('summary', {}, [
					E('span', { 'class':'mt-ui-summary-copy' }, E('span', { 'class':'mt-ui-summary-title' }, _('Technical details'))),
					E('span', { 'class':'mt-ui-chevron', 'aria-hidden':'true' }, '›')
				]),
				E('pre', { 'class': 'mt-net-raw mt-ui-details-body' }, raw || _('No response.'))
			]),
			radioControls,
			E('section', { 'class':'mt-freq-head mt-ui-card' }, [E('h3',{},_('Frequency and cell selection')),E('p',{},_('Advanced controls for limiting LTE or 5G NR bands, frequencies and cells. Leave these unlocked for normal automatic network selection.'))]),
			E('div', { 'class':'mt-freq-grid' }, [this.lockPanel(_('LTE network'),'lte',lteLock[0]),this.lockPanel(_('5G NR network'),'nr',nrLock[0])])
		]);
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
