'use strict';
'require view';
'require fs';
'require rpc';
'require mt5700m.controls as controls';
'require mt5700m.ux as ux';
var callManagerStatus = rpc.declare({
    object: 'mt5700m',
    method: 'status',
    expect: {}
});
var callTraffic = rpc.declare({
    object: 'mt5700m-traffic',
    method: 'summary',
    expect: {}
});
var callInterfaceDump = rpc.declare({
    object: 'network.interface',
    method: 'dump',
    expect: {}
});
var lastSnapshot = null;

function firstInterfaceAddress(status, family) {
    var list = status && status[family + '-address'];
    return Array.isArray(list) && list[0] && list[0].address || '';
}

function sessionFromInterfaces(ipv4, ipv6) {
    var address4 = firstInterfaceAddress(ipv4, 'ipv4');
    var address6 = firstInterfaceAddress(ipv6, 'ipv6');
    var up4 = ipv4 && ipv4.up === true && !!address4;
    var up6 = ipv6 && ipv6.up === true && !!address6;
    return {
        ipv4Connected: up4,
        ipv6Connected: up6,
        ipv4Address: address4,
        ipv6Address: address6,
        capability: up4 && up6 ? _('IPv4 / IPv6 · same APN') : up6 ? _('IPv6 only') : _('IPv4 only'),
        mtu: _('Network default')
    };
}

function interfaceFromDump(dump, name) {
    return (dump && dump.interface || []).filter(function(item) {
        return item.interface === name;
    })[0] || {};
}

function trafficTotal(item) {
    return (Number(item && item.rx) || 0) + (Number(item && item.tx) || 0);
}

function trafficDateKey(item, monthly) {
    var date = item && item.date || {};
    var month = String(date.month || 0).padStart(2, '0');
    var day = String(date.day || 0).padStart(2, '0');
    return monthly ? [date.year || 0, month].join('-') : [date.year || 0, month, day].join('-');
}

function sortedTraffic(items, monthly) {
    return (items || []).slice().sort(function(a, b) {
        return trafficDateKey(a, monthly).localeCompare(trafficDateKey(b, monthly));
    });
}

function currentTraffic(items, monthly) {
    var now = new Date();
    var key = monthly ? [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0')].join('-') : [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
    return (items || []).filter(function(item) {
        return trafficDateKey(item, monthly) === key;
    })[0] || {};
}

function trafficUpdated(iface) {
    var value = iface && iface.updated;
    if (!value || !value.date || value.date.year < 2024)
        return _('Waiting for data');
    return '%04d-%02d-%02d %02d:%02d'.format(value.date.year || 0, value.date.month || 0, value.date.day || 0, value.time && value.time.hour || 0, value.time && value.time.minute || 0);
}
return view.extend({
    fetchStatus: function() {
        return Promise.all([callManagerStatus(), ux.read(['status']), callTraffic(), callInterfaceDump()]).then(function(r) {
            if (!r[0] || typeof r[0].connected !== 'boolean' || !r[3] || !Array.isArray(r[3].interface)) throw Error('状态读取不完整');
            return {native:r[1], traffic:r[2], manager:r[0], sessionData:sessionFromInterfaces(interfaceFromDump(r[3], r[0].interface || 'MT5700M'), interfaceFromDump(r[3], r[0].interface6 || 'MT5700Mv6'))};
        });
    },
    load: function() { return Promise.resolve(null); },
    startSignalUpdates: function(root) {
        var self=this, stamp=0, failed=false;
        ux.signal(root, function(data) {
            var card=root.querySelector('[data-mt-signal]'); if (!card) return;
            stamp=Number(data.sampled_at); failed=false;
            data.signalUpdated='信号 · '+ux.ageText(stamp);
            card.replaceWith(self.signalCard(data));
        }, function() { failed=true; }, function(remaining) {
            var label=root.querySelector('[data-signal-time]'), badge=root.querySelector('[data-signal-countdown]');
            if (badge) badge.textContent=remaining===null?'已暂停':remaining===0?'刷新中':remaining+' 秒后刷新';
            if(label) label.textContent=stamp?(failed?'更新暂缓 · ':'信号 · ')+ux.ageText(stamp)+(ux.age(stamp)>15?' · 数值可能过期':''):'等待后台信号采样…';
        });
    },
    startLocalUpdates: function(root) {
        var self=this;
        ux.watch(root,3,function() {
            return Promise.all([callManagerStatus(),callInterfaceDump()]).then(function(r) {
                if (!root.isConnected) return;
                var manager=r[0], interfaces=r[1];
                if(!manager || typeof manager.connected!=='boolean' || !interfaces || !Array.isArray(interfaces.interface)) throw Error('Incomplete state');
                var session=sessionFromInterfaces(interfaceFromDump(interfaces,manager.interface||'MT5700M'),interfaceFromDump(interfaces,manager.interface6||'MT5700Mv6'));
                var address=root.querySelector('[data-mt-address]'); if(address) address.replaceWith(self.addressCard(session));
                var health=root.querySelector('[data-mt-health]'); if(health) health.replaceChildren(...(manager.internet_verified===true?[]:[controls.healthNode(manager)]));
                var summary=root.querySelector('[data-mt-health-summary]'); if(summary){summary.className=manager.internet_verified===true?'mt5700m-hero-health':'';summary.textContent=manager.internet_verified===true?'蜂窝探测正常':'';}
                var badge=root.querySelector('[data-mt-connection]'),label=root.querySelector('[data-mt-connection-label]');
                var connected=manager.connected===true&&(session.ipv4Connected||session.ipv6Connected);
                if(badge) badge.className='mt5700m-status'+(connected?' online':'');
                if(label) label.textContent=connected?_('Connected'):manager.running===true?_('Module online'):_('Unavailable');
            }).catch(function() {
                var summary=root.querySelector('[data-mt-health-summary]');
                if(summary){summary.className='';summary.textContent='状态读取失败 · 保留上次数据';}
                var label=root.querySelector('[data-mt-connection-label]');if(label)label.textContent='状态待确认';
            });
        });
    },
    render: function() {
        var self=this, root=E('div',{'class':'mt-overview-shell mt-ui-page'},[ux.style()]);
        var notice=E('div',{'class':'mt-loading',role:'status'},'正在读取模组状态…'), content=E('div');
        root.appendChild(notice);root.appendChild(content);
        var ready=false, busy=false, stamp=0;
        function snapshot() {
            if(busy)return;busy=true;
            var task=ready?ux.read(['status']).then(function(native){return {native:native,manager:self.manager||{}};}):self.fetchStatus();
            return task.then(function(data){
                if(!root.isConnected)return;
                if(!data.native || !data.native.stdout)throw Error('Empty snapshot');
                var parsed=self.parseStatus(data);stamp=Number(parsed.snapshot_at)||0;
                if(!ready){
                    self.manager=data.manager;lastSnapshot={time:Date.now(),data:data};
                    content.replaceChildren(self.renderStatus(data));ready=true;
                    self.startSignalUpdates(root);self.startLocalUpdates(root);
                    ux.watch(root,15,function(){return callTraffic().then(function(report){
                        if(!report||!Array.isArray(report.interfaces))throw Error('No traffic data');
                        var panel=root.querySelector('.mt5700m-traffic');if(panel)panel.replaceWith(self.trafficPanel(report,self.manager.network||''));
                    }).catch(function(){var label=root.querySelector('.mt5700m-updated');if(label)label.textContent='读取失败 · 保留上次统计';});});
                }else{
                    var carrier=root.querySelector('[data-mt-carrier]');if(carrier)carrier.replaceWith(self.carrierCard(self.carrierInfo(parsed)));
                    var operator=root.querySelector('[data-mt-operator]');if(operator)operator.textContent=parsed.operator||'--';
                    var mode=root.querySelector('[data-mt-mode]');if(mode)mode.textContent=parsed.sysmode_detail||parsed.sysmode||'--';
                }
                notice.hidden=true;
            }).catch(function(){
                notice.hidden=false;notice.className='mt-read-error';
                notice.replaceChildren(E('span',{},ready?'概览更新失败，保留上次快照。':'暂时无法读取，不能据此判断模组断网。'),E('button',{'class':'btn',click:snapshot},'重试'));
            }).then(function(){busy=false;});
        }
        this._refreshSnapshot=snapshot;
        ux.watch(root,60,snapshot,function(){var label=root.querySelector('[data-overview-age]');if(label)label.textContent='载波快照 · '+ux.ageText(stamp);});
        return root;
    },
    parseStatus: function(res) {
        var data = {};
        (res.native && res.native.stdout || '').trim().split(/\n/).forEach(function(line) {
            var pos = line.indexOf('=');
            if (pos > -1)
                data[line.substring(0, pos)] = line.substring(pos + 1);
        });
        data.reachable = data.connected === '1' ? '1' : '0';
        data.model = data.product_name || 'MT5700M';
        data.temperature = String(data.temperature || '').replace(/[^0-9.-]/g, '');
        data.sysmode_detail = data.network_mode || data.sysmode_detail || data.sysmode || '';
        data.at_port = data.at_port || res.manager.at_port || '';
        data.connected = res.manager.connected === true && data.reachable === '1' && !/^(|NOSERVICE|NO SERVICE|UNKNOWN)$/i.test(data.sysmode || data.sysmode_detail || '') ? '1' : '0';
        if (/^(upgrade|dump|unknown)$/.test(data.usb_state || '')) {
            data.reachable = '0';
            data.connected = '0';
        }
        data.network_interface = res.manager.network || '';
        data.error = res.native && res.native.stderr || '';
        return data;
    },
    styleNode: function() {
        return E('style', {}, ['.mt5700m-page{max-width:1120px;margin:0 auto;color:var(--text-color-high,#20242a)}', '.mt-overview-shell{max-width:1120px;margin:0 auto}.mt-overview-update{font-size:11px;line-height:1.6;color:var(--text-color-medium,#888);padding:0 2px;margin:0 0 10px;text-align:right}.mt-overview-update.pending{text-align:left;padding:10px 14px;border-radius:8px;background:var(--background-color-low,#f5f7f9)}.mt-overview-health{font-size:12px;color:var(--text-color-medium,#888);padding:0 2px;margin:0 0 10px}.mt-overview-health:before{content:"";display:inline-block;width:6px;height:6px;background:#13a979;border-radius:50%;margin-right:7px}@media(max-width:650px){.mt-overview-update{text-align:left;font-size:10px}}', '.mt5700m-hero{position:relative;overflow:hidden;display:flex;justify-content:space-between;align-items:center;gap:20px;padding:22px 24px;margin-bottom:14px;border-radius:16px;background:linear-gradient(135deg,#1264d8 0%,#087eae 58%,#07988e 100%);color:#fff;box-shadow:0 10px 28px rgba(14,92,155,.16)}', '.mt5700m-hero:after{content:"";position:absolute;width:210px;height:210px;right:-78px;top:-118px;border:42px solid rgba(255,255,255,.08);border-radius:50%}.mt5700m-hero-copy,.mt5700m-hero-side{position:relative;z-index:1}', '.mt5700m-title{margin:0 0 6px;color:#fff;font-size:27px;line-height:1.2}.mt5700m-summary{font-size:13px;line-height:1.5;color:rgba(255,255,255,.84)}', '.mt5700m-hero-meta{display:flex;flex-wrap:wrap;gap:7px 18px;margin-top:13px;font-size:11px;color:rgba(255,255,255,.72)}.mt5700m-hero-meta strong{margin-left:5px;color:#fff;font-weight:700}', '.mt5700m-hero-side{display:flex;flex-direction:column;align-items:flex-end;gap:10px}.mt5700m-status{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;background:rgba(255,255,255,.16);font-size:12px;font-weight:700;white-space:nowrap}.mt5700m-dot{width:8px;height:8px;border-radius:50%;background:#ffcd57;box-shadow:0 0 0 4px rgba(255,205,87,.18)}.mt5700m-status.online .mt5700m-dot{background:#78f2b0;box-shadow:0 0 0 4px rgba(120,242,176,.18)}.mt5700m-refresh{border-color:rgba(255,255,255,.30)!important;background:rgba(255,255,255,.10)!important;color:#fff!important}', '.mt5700m-hero{padding:16px 20px;gap:14px;margin-bottom:12px}.mt5700m-hero .mt5700m-title{font-size:24px;margin:0 0 4px}.mt5700m-hero-meta{margin-top:8px;gap:5px 14px}.mt5700m-hero-side{flex-direction:row;gap:8px}.mt5700m-hero-foot{display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;margin-top:7px;font-size:10px;line-height:1.5;color:rgba(255,255,255,.76)}.mt5700m-hero-health{color:#baffdb}.mt5700m-hero-health:before{content:"";display:inline-block;width:5px;height:5px;margin-right:5px;border-radius:50%;background:#78f2b0}', '.mt5700m-focus-grid{display:grid;grid-template-columns:1.12fr .88fr 1.18fr;gap:12px;margin-bottom:12px}.mt5700m-focus{display:flex;flex-direction:column;min-height:230px;padding:17px 18px}.mt5700m-focus-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:13px}.mt5700m-focus-title{font-size:14px;font-weight:750}.mt5700m-focus-desc{margin-top:3px;color:var(--mt-ui-muted);font-size:10px;line-height:1.4}', '.mt5700m-badge{display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border-radius:999px;background:#eef2f6;color:#6b7480;font-size:10px;font-weight:750;white-space:nowrap}.mt5700m-badge:before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}.mt5700m-badge.good,.mt5700m-badge.active{background:#e8f8f1;color:#087c60}.mt5700m-badge.fair{background:#fff5df;color:#9b6500}.mt5700m-badge.weak{background:#fff0ee;color:#b84035}', '.mt5700m-signal-value{display:flex;align-items:baseline;gap:6px}.mt5700m-signal-value strong{font-size:31px;letter-spacing:-.04em}.mt5700m-signal-value span{font-size:11px;color:var(--mt-ui-muted)}.mt5700m-signal-bars{display:flex;align-items:flex-end;gap:3px;height:52px;margin:5px 0 13px}.mt5700m-signal-bar{flex:1;min-width:2px;border-radius:2px 2px 1px 1px;background:var(--mt-ui-border);opacity:.55}.mt5700m-signal-bar.on{background:#4b94df;opacity:1}.mt5700m-signal-bars.excellent .on{background:#13a979}.mt5700m-signal-bars.fair .on{background:#e4a23a}.mt5700m-signal-bars.weak .on{background:#db5b52}', '.mt5700m-signal-meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:auto}.mt5700m-mini{padding:8px;border-radius:9px;background:var(--background-color-low,#f5f7f9)}.mt5700m-mini span{display:block;margin-bottom:3px;color:var(--mt-ui-muted);font-size:9px}.mt5700m-mini strong{font-size:12px}', '.mt5700m-carrier-main{margin:2px 0 12px}.mt5700m-carrier-main strong{display:block;font-size:29px;line-height:1.15;letter-spacing:-.03em}.mt5700m-carrier-main span{display:block;margin-top:4px;color:var(--mt-ui-muted);font-size:11px}.mt5700m-band-list{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}.mt5700m-band{padding:5px 8px;border-radius:8px;background:#edf5ff;color:#176bc1;font-size:10px;font-weight:700}.mt5700m-carrier-stats{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:auto}', '.mt5700m-ip-list{display:grid;gap:9px}.mt5700m-ip-row{padding:10px 11px;border-radius:10px;background:var(--background-color-low,#f5f7f9)}.mt5700m-ip-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:5px;font-size:10px;color:var(--mt-ui-muted)}.mt5700m-ip-state{font-weight:700;color:#9a6200}.mt5700m-ip-state.on{color:#087c60}.mt5700m-ip-value{font:600 12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all}.mt5700m-ip-meta{display:flex;justify-content:space-between;gap:10px;margin-top:9px;color:var(--mt-ui-muted);font-size:10px}', '.mt5700m-card-link{display:inline-flex;align-items:center;gap:5px;margin-top:auto;padding-top:12px;color:#176bc1;font-size:10px;font-weight:700;text-decoration:none}.mt5700m-card-link:after{content:"›";font-size:16px;line-height:10px}', '.mt5700m-traffic{padding:18px;margin-bottom:12px}.mt5700m-traffic-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:14px}.mt5700m-traffic-head h3{margin:0 0 4px;font-size:16px}.mt5700m-traffic-head p{margin:0;color:var(--mt-ui-muted);font-size:10px}.mt5700m-traffic-side{text-align:right}.mt5700m-updated{color:var(--mt-ui-muted);font-size:10px;white-space:nowrap}.mt5700m-legend{display:flex;justify-content:flex-end;gap:10px;margin-top:5px;color:var(--mt-ui-muted);font-size:9px}.mt5700m-legend span:before{content:"";display:inline-block;width:7px;height:3px;margin-right:4px;border-radius:9px;background:#337de8;vertical-align:middle}.mt5700m-legend span:last-child:before{background:#16a085}', '.mt5700m-traffic-layout{display:grid;grid-template-columns:repeat(3,minmax(0,.62fr)) minmax(300px,1.8fr);gap:10px}.mt5700m-traffic-stat{padding:13px;border-radius:11px;background:var(--background-color-low,#f5f7f9)}.mt5700m-traffic-label{font-size:10px;color:var(--mt-ui-muted);margin-bottom:6px}.mt5700m-traffic-value{font-size:18px;font-weight:750;letter-spacing:-.02em}.mt5700m-traffic-split{margin-top:5px;color:var(--mt-ui-muted);font-size:9px;line-height:1.45}', '.mt5700m-days{display:flex;flex-direction:column;justify-content:center;gap:6px;padding:2px 0 2px 8px}.mt5700m-day{display:grid;grid-template-columns:42px minmax(80px,1fr) 112px;align-items:center;gap:8px;font-size:9px}.mt5700m-date{color:var(--mt-ui-muted);font-weight:650}.mt5700m-bars{display:flex;flex-direction:column;gap:2px}.mt5700m-bar{height:4px;border-radius:999px;background:var(--background-color-low,#eef1f5);overflow:hidden}.mt5700m-bar i{display:block;height:100%;min-width:2px;border-radius:inherit;background:#337de8}.mt5700m-bar.tx i{background:#16a085}.mt5700m-values{text-align:right;font-variant-numeric:tabular-nums;color:var(--mt-ui-muted)}', '.mt5700m-shortcuts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.mt5700m-shortcut{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;color:inherit;text-decoration:none}.mt5700m-shortcut strong{display:block;font-size:12px}.mt5700m-shortcut span{display:block;margin-top:3px;color:var(--mt-ui-muted);font-size:9px;line-height:1.4}.mt5700m-shortcut b{color:#176bc1;font-size:20px}.mt5700m-alert{margin-bottom:12px}', '@media(max-width:900px){.mt5700m-focus-grid{grid-template-columns:1fr 1fr}.mt5700m-address-card{grid-column:1/-1;min-height:auto}.mt5700m-traffic-layout{grid-template-columns:repeat(3,1fr)}.mt5700m-days{grid-column:1/-1;padding:8px 0 0}}', '@media(max-width:650px){.mt5700m-hero{display:block}.mt5700m-hero-side{align-items:flex-start;margin-top:14px}.mt5700m-focus-grid,.mt5700m-shortcuts{grid-template-columns:1fr}.mt5700m-address-card{grid-column:auto}.mt5700m-focus{min-height:auto}.mt5700m-traffic-layout{grid-template-columns:1fr}.mt5700m-days{grid-column:auto}.mt5700m-day{grid-template-columns:38px 1fr}.mt5700m-values{grid-column:2;text-align:left}.mt5700m-traffic-head{display:block}.mt5700m-updated{margin-top:7px}}'].join(''));
    },
    signalQuality: function(kind, value) {
        var percentage, levels, index;
        if (isNaN(value))
            return {
                label: _('No data'),
                cls: 'unknown',
                percentage: 0
            };
        if (kind === 'rsrp') {
            percentage = (value + 120) * 2.5;
            levels = [-80, -90, -100];
        } else if (kind === 'rsrq') {
            percentage = (value + 25) * 4;
            levels = [-10, -15, -20];
        } else {
            percentage = (value + 10) * 2.5;
            levels = [20, 13, 0];
        }
        index = value >= levels[0] ? 0 : value >= levels[1] ? 1 : value >= levels[2] ? 2 : 3;
        return {
            label: [_('Excellent'), _('Good'), _('Fair'), _('Weak')][index],
            cls: ['excellent', 'good', 'fair', 'weak'][index],
            percentage: Math.max(0, Math.min(100, percentage))
        };
    },
    carrierInfo: function(data) {
        var count = parseInt(data.carrier_count || '0', 10) || 0;
        var carriers = [],
            parts, i;
        for (i = 1; i <= count; i++) {
            parts = String(data['carrier_' + i] || '').split('|');
            if (parts.length < 8) continue;
            carriers.push({
                radio: parts[0],
                band: parts[1], frequency: parts[2],
                dlBandwidth: parts[4],
                ulBandwidth: parts[7]
            });
        }
        return {
            available: carriers.length > 0,
            active: data.ca_active === '1' && carriers.length > 1,
            dual: data.dc_active === '1',
            mode: data.ca_mode || '',
            count: carriers.length,
            dlBandwidth: data.ca_dl_bandwidth || '',
            ulBandwidth: data.ca_ul_bandwidth || '',
            carriers: carriers
        };
    },
    signalCard: function(data) {
        var rsrp = parseFloat(data.rsrp),
            rsrq = parseFloat(data.rsrq),
            sinr = parseFloat(data.sinr);
        var quality = this.signalQuality('rsrp', rsrp),
            active = isNaN(rsrp) ? 0 : Math.max(1, Math.round(quality.percentage / 100 * 14));
        var bars = [],
            i;
        for (i = 0; i < 14; i++)
            bars.push(E('span', {
                'class': 'mt5700m-signal-bar' + (i < active ? ' on' : ''),
                'style': 'height:%dpx'.format(8 + i * 3)
            }));

        function countdown() {
            return E('small', {
                'data-signal-countdown': '',
                'style': 'display:inline-block;float:right;padding:2px 6px;border-radius:5px;background:var(--background-color-low,#eef2f6);font-size:10px;font-weight:normal;white-space:nowrap',
                'title': '这些信号指标使用同一次查询，同步刷新'
            }, '等待刷新');
        }
        return E('section', {
            'class': 'mt5700m-focus mt-ui-card',
            'data-mt-signal': ''
        }, [E('div', {
            'data-signal-time': '',
            'role': 'status',
            'style': 'font-size:11px'
        }, data.signalUpdated || '等待动态信号更新…'), E('div', {
            'class': 'mt5700m-focus-head'
        }, [E('div', {}, [E('div', {
            'class': 'mt5700m-focus-title'
        }, _('Signal'))]), countdown(), E('span', {
            'class': 'mt5700m-badge ' + quality.cls
        }, quality.label)]), E('div', {
            'class': 'mt5700m-signal-value'
        }, [E('strong', {}, isNaN(rsrp) ? '--' : String(data.rsrp)), E('span', {}, 'RSRP · dBm')]), E('div', {
            'class': 'mt5700m-signal-bars ' + quality.cls,
            'aria-hidden': 'true'
        }, bars), E('div', {
            'class': 'mt5700m-signal-meta'
        }, [E('div', {
            'class': 'mt5700m-mini'
        }, [E('span', {}, 'RSRQ'), E('strong', {}, isNaN(rsrq) ? '--' : data.rsrq + ' dB')]), E('div', {
            'class': 'mt5700m-mini'
        }, [E('span', {}, 'SINR'), E('strong', {}, isNaN(sinr) ? '--' : data.sinr + ' dB')]), E('div', {
            'class': 'mt5700m-mini'
        }, [E('span', {}, _('Network Mode')), E('strong', {}, data.sysmode || '--')])])]);
    },
    carrierCard: function(info) {
        var active = info.active || info.dual;
        var grouped={};info.carriers.forEach(function(c){var k=c.radio+' · '+c.band;grouped[k]=(grouped[k]||0)+1;});
        var badge = !info.available ? _('Unavailable') : info.active ? _('Aggregating') : info.dual ? _('Dual connectivity') : _('Single carrier');
        var headline = !info.available ? '--' : info.active ? info.count + 'CA' : info.dual ? (info.mode || 'EN-DC') : (info.carriers[0] ? info.carriers[0].band : _('Single carrier'));
        return E('section', {
            'class': 'mt5700m-focus mt-ui-card', 'data-mt-carrier':''
        }, [E('div', {
            'class': 'mt5700m-focus-head'
        }, [E('div', {}, [E('div', {
            'class': 'mt5700m-focus-title'
        }, _('Carrier status'))]), E('span', {
            'class': 'mt5700m-badge' + (active ? ' active' : '')
        }, badge)]), E('div', {
            'class': 'mt5700m-carrier-main'
        }, [E('strong', {}, headline), E('span', {}, info.mode || _('Mobile network'))]), E('div', {
            'class': 'mt5700m-band-list'
        }, info.carriers.length ? Object.keys(grouped).map(function(key) { return E('span', {'class':'mt5700m-band'}, key+(grouped[key]>1?' ×'+grouped[key]:'')); }) : E('span', {'class':'mt5700m-focus-desc'}, _('Current carrier information is unavailable.'))), E('div', {
            'class': 'mt5700m-carrier-stats'
        }, [E('div', {
            'class': 'mt5700m-mini'
        }, [E('span', {}, _('Downlink bandwidth')), E('strong', {}, info.dlBandwidth ? info.dlBandwidth + ' MHz' : '--')]), E('div', {
            'class': 'mt5700m-mini'
        }, [E('span', {}, _('Uplink bandwidth')), E('strong', {}, info.ulBandwidth ? info.ulBandwidth + ' MHz' : '--')])]), E('details',{'class':'mt-carrier-detail'},[E('summary',{},'各载波详情'),E('div',{},info.carriers.map(function(c,i){return E('div',{},'载波 '+(i+1)+' · '+c.band+' · 下行 '+(c.dlBandwidth||'--')+' MHz / 上行 '+(c.ulBandwidth||'--')+' MHz');}))]), E('a', {
            'class': 'mt5700m-card-link',
            'href': L.url('admin/modem/mt5700m/network')
        }, _('View radio and cell details'))]);
    },
    addressCard: function(session) {
        var active = session.ipv4Connected || session.ipv6Connected;
        var loading = session.loading === true;
        return E('section', {
            'class': 'mt5700m-focus mt5700m-address-card mt-ui-card',
            'data-mt-address': ''
        }, [E('div', {
            'class': 'mt5700m-focus-head'
        }, [E('div', {}, [E('div', {
            'class': 'mt5700m-focus-title'
        }, '蜂窝接口地址')]), E('span', {
            'class': 'mt5700m-badge' + (active ? ' active' : '')
        }, loading ? '正在读取' : active ? _('Active') : _('Disconnected'))]), E('div', {
            'class': 'mt5700m-ip-list'
        }, [E('div', {
            'class': 'mt5700m-ip-row'
        }, [E('div', {
            'class': 'mt5700m-ip-head'
        }, [E('span', {}, 'IPv4'), E('span', {
            'class': 'mt5700m-ip-state' + (session.ipv4Connected ? ' on' : '')
        }, loading ? '读取中' : session.ipv4Connected ? _('Connected') : _('Not assigned'))]), E('div', {
            'class': 'mt5700m-ip-value'
        }, session.ipv4Address || '--')]), E('div', {
            'class': 'mt5700m-ip-row'
        }, [E('div', {
            'class': 'mt5700m-ip-head'
        }, [E('span', {}, 'IPv6'), E('span', {
            'class': 'mt5700m-ip-state' + (session.ipv6Connected ? ' on' : '')
        }, loading ? '读取中' : session.ipv6Connected ? _('Connected') : _('Not assigned'))]), E('div', {
            'class': 'mt5700m-ip-value'
        }, session.ipv6Address || '--')])]), E('div', {
            'class': 'mt5700m-ip-meta'
        }, [E('span', {}, session.capability || '--'), E('span', {}, 'MTU ' + (session.mtu || '--'))]), E('a', {
            'class': 'mt5700m-card-link',
            'href': L.url('admin/modem/mt5700m/connection')
        }, _('View connection details'))]);
    },
    trafficPanel: function(report, interfaceName) {
        var iface = (report.interfaces || []).filter(function(item) {
            return item.name === interfaceName;
        })[0] || (report.interfaces || [])[0] || {
            traffic: {}
        };
        var traffic = iface.traffic || {},
            days = sortedTraffic(traffic.day, false),
            months = sortedTraffic(traffic.month, true);
        var today = currentTraffic(days, false),
            month = currentTraffic(months, true),
            lifetime = traffic.total || {};
        var recentDays = days.slice(-7).reverse(),
            maximum = Math.max.apply(Math, recentDays.map(trafficTotal).concat([1]));
        var dayRows = recentDays.length ? recentDays.map(function(item) {
            var rx = Number(item.rx) || 0,
                tx = Number(item.tx) || 0;
            return E('div', {
                'class': 'mt5700m-day'
            }, [E('span', {
                'class': 'mt5700m-date'
            }, trafficDateKey(item, false).substring(5)), E('div', {
                'class': 'mt5700m-bars'
            }, [E('div', {
                'class': 'mt5700m-bar'
            }, E('i', {
                'style': 'width:' + Math.max(1, rx / maximum * 100).toFixed(1) + '%'
            })), E('div', {
                'class': 'mt5700m-bar tx'
            }, E('i', {
                'style': 'width:' + Math.max(1, tx / maximum * 100).toFixed(1) + '%'
            }))]), E('span', {
                'class': 'mt5700m-values'
            }, controls.formatBytes(trafficTotal(item)))]);
        }) : [E('div', {
            'class': 'mt5700m-focus-desc'
        }, _('Statistics appear after the MT5700M data interface has carried traffic for a few minutes.'))];

        function stat(label, item) {
            return E('div', {
                'class': 'mt5700m-traffic-stat'
            }, [E('div', {
                'class': 'mt5700m-traffic-label'
            }, label), E('div', {
                'class': 'mt5700m-traffic-value'
            }, controls.formatBytes(trafficTotal(item))), E('div', {
                'class': 'mt5700m-traffic-split'
            }, [E('span', {}, _('Download %s').format(controls.formatBytes(item.rx))), E('span', {}, _('Upload %s').format(controls.formatBytes(item.tx)))])]);
        }
        return E('section', {
            'class': 'mt5700m-traffic mt-ui-card'
        }, [E('div', {
            'class': 'mt5700m-traffic-head'
        }, [E('div', {}, [E('h3', {
            'title': _('Local usage recorded only for the MT5700M data interface'),
            'style': 'margin-bottom:0'
        }, _('Traffic Statistics'))]), E('div', {
            'class': 'mt5700m-traffic-side'
        }, [E('div', {
            'class': 'mt5700m-updated'
        }, _('Last updated') + ' · ' + trafficUpdated(iface)), E('div', {
            'class': 'mt5700m-legend'
        }, [E('span', {}, _('Download')), E('span', {}, _('Upload'))])])]), E('div', {
            'class': 'mt5700m-traffic-layout'
        }, [stat(_('Today'), today), stat(_('This month'), month), stat(_('All-time total'), lifetime), E('div', {
            'class': 'mt5700m-days'
        }, dayRows)])]);
    },
    shortcut: function(title, description, path) {
        return E('a', {
            'class': 'mt5700m-shortcut mt-ui-card',
            'href': L.url(path)
        }, [E('div', {}, [E('strong', {}, title), E('span', {}, description)]), E('b', {}, '›')]);
    },
    renderStatus: function(res) {
        var self=this;
        var data = this.parseStatus(res),
            session = res.sessionData || controls.parseSession(res.session && res.session.stdout || '');
        var reachable = data.reachable === '1',
            connected = data.connected === '1',
            carrierInfo = this.carrierInfo(data);
        var operator = data.operator || '';
        if (!/[A-Za-z0-9\u4e00-\u9fff]/.test(operator)) operator = '';
        var usbNames = {
            upgrade: _('Upgrade mode'),
            dump: _('Dump mode'),
            unknown: _('Unknown USB mode')
        };
        var abnormalUsb = data.usb_state === 'upgrade' || data.usb_state === 'dump' || data.usb_state === 'unknown';
        return E('div', {
            'class': 'mt5700m-page mt-ui-page'
        }, [this.styleNode(), controls.styleNode(), E('div', {
            'data-mt-health': ''
        }, res.loading || res.manager.internet_verified === true ? [] : [controls.healthNode(res.manager)]), data.error ? E('div', {
            'class': 'alert-message warning mt5700m-alert'
        }, data.error) : null, res.session && res.session.stderr ? E('div', {
            'class': 'alert-message warning mt5700m-alert'
        }, res.session.stderr) : null, abnormalUsb ? E('div', {
            'class': 'alert-message warning mt5700m-alert'
        }, _('The MT5700M is in %s. Mobile data and AT management are unavailable until normal mode returns.').format(usbNames[data.usb_state])) : null, E('section', {
            'class': 'mt5700m-hero'
        }, [E('div', {
            'class': 'mt5700m-hero-copy'
        }, [E('h2', {
            'class': 'mt5700m-title'
        }, _('MT5700M Module')), connected ? null : E('div', {
            'class': 'mt5700m-summary'
        }, !reachable ? _('The modem did not respond. Check the module connection.') : connected ? _('Mobile network is connected and ready.') : _('The module is online, but mobile data is not connected.')), E('div', {
            'class': 'mt5700m-hero-meta'
        }, [E('span', {}, [_('Operator'), E('strong', {'data-mt-operator':''}, operator || '--')]), E('span', {}, [_('Network Mode'), E('strong', {'data-mt-mode':''}, data.sysmode_detail || data.sysmode || '--')]), E('span', {}, [_('Network interface'), E('strong', {}, data.network_interface || '--')])]), E('div', {
            'class': 'mt5700m-hero-foot'
        }, [E('span', {
            'class': res.manager.internet_verified === true ? 'mt5700m-hero-health' : '',
            'data-mt-health-summary': ''
        }, res.manager.internet_verified === true ? '蜂窝探测正常' : ''), E('span', {'data-overview-age':''}, '载波快照 · '+ux.ageText(data.snapshot_at))].filter(Boolean))].filter(Boolean)), E('div', {
            'class': 'mt5700m-hero-side'
        }, [E('div', {
            'class': 'mt5700m-status' + (connected ? ' online' : ''),
            'data-mt-connection': ''
        }, [E('span', {
            'class': 'mt5700m-dot'
        }), E('span', {
            'data-mt-connection-label': ''
        }, connected ? _('Connected') : reachable ? _('Module online') : _('Unavailable'))]), E('button', {
            'class': 'btn mt5700m-refresh',
            'click': function() {
                self._refreshSnapshot();
            }
        }, _('Refresh'))])]), E('div', {
            'class': 'mt5700m-focus-grid'
        }, [this.signalCard(data), this.carrierCard(carrierInfo), this.addressCard(session)]), this.trafficPanel(res.traffic || {}, data.network_interface || ''), E('div', {
            'class': 'mt5700m-shortcuts'
        }, [this.shortcut(_('Mobile data'), _('APN, dialing, IP details and session counters'), 'admin/modem/mt5700m/connection'), this.shortcut(_('Radio and Cells'), _('Bands, cells, radio policy and diagnostics'), 'admin/modem/mt5700m/network'), this.shortcut(_('Module and SIM'), _('Module identity, SIM information and maintenance'), 'admin/modem/mt5700m/system')])].filter(Boolean));
    },
    handleSave: null,
    handleSaveApply: null,
    handleReset: null
});
