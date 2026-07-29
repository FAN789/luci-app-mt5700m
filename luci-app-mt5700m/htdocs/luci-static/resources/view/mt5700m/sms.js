'use strict';
'require view';
'require fs';
'require ui';
'require dom';
'require mt5700m.controls as controls';

function swapDigits(value) {
	var out = '';
	for (var i = 0; i < value.length; i += 2) out += (value[i + 1] || '') + value[i];
	return out.replace(/F$/i, '');
}

function decodeUcs2(hex) {
	var out = '';
	for (var i = 0; i + 3 < hex.length; i += 4) out += String.fromCharCode(parseInt(hex.substring(i, i + 4), 16));
	return out;
}

function decodeGsm7(hex, septets, skipBits) {
	var bytes = [];
	for (var i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.substring(i, i + 2), 16));
	var table = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\u001bÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
	var out = '', escape = false;
	for (var n = 0; n < septets; n++) {
		var bit = (skipBits || 0) + n * 7, pos = bit >> 3, shift = bit & 7;
		var v = ((bytes[pos] || 0) >> shift) | (((bytes[pos + 1] || 0) << (8 - shift)) & 0x7f);
		if (escape) { out += ({ 10: '\f', 20: '^', 40: '{', 41: '}', 47: '\\', 60: '[', 61: '~', 62: ']', 64: '|', 101: '€' })[v] || ''; escape = false; }
		else if (v === 27) escape = true;
		else out += table[v] || ' ';
	}
	return out;
}

function decodePdu(pdu, index) {
	try {
		var p = 0, smscLen = parseInt(pdu.substring(p, p + 2), 16); p += 2 + smscLen * 2;
		var first = parseInt(pdu.substring(p, p + 2), 16); p += 2;
		var digits = parseInt(pdu.substring(p, p + 2), 16); p += 2;
		var toa = parseInt(pdu.substring(p, p + 2), 16); p += 2;
		var numberHex = pdu.substring(p, p + Math.ceil(digits / 2) * 2); p += Math.ceil(digits / 2) * 2;
		var number = (toa === 145 ? '+' : '') + swapDigits(numberHex).substring(0, digits);
		p += 2;
		var dcs = parseInt(pdu.substring(p, p + 2), 16); p += 2;
		var stamp = [];
		for (var s = 0; s < 6; s++, p += 2) stamp.push(swapDigits(pdu.substring(p, p + 2)));
		p += 2;
		var date = '20%s-%s-%s %s:%s'.format(stamp[0], stamp[1], stamp[2], stamp[3], stamp[4]);
		var udl = parseInt(pdu.substring(p, p + 2), 16); p += 2;
		var ud = pdu.substring(p), headerBytes = 0, concat = null;
		if (first & 0x40) {
			headerBytes = parseInt(ud.substring(0, 2), 16) + 1;
			var h = 2;
			while (h < headerBytes * 2) {
				var iei = parseInt(ud.substring(h, h + 2), 16), len = parseInt(ud.substring(h + 2, h + 4), 16), value = ud.substring(h + 4, h + 4 + len * 2); h += 4 + len * 2;
				if (iei === 0 && len === 3) concat = { ref: parseInt(value.substring(0, 2), 16), total: parseInt(value.substring(2, 4), 16), seq: parseInt(value.substring(4, 6), 16) };
				if (iei === 8 && len === 4) concat = { ref: parseInt(value.substring(0, 4), 16), total: parseInt(value.substring(4, 6), 16), seq: parseInt(value.substring(6, 8), 16) };
			}
		}
		var text;
		if ((dcs & 0x0c) === 0x08) text = decodeUcs2(ud.substring(headerBytes * 2, udl * 2));
		else {
			var headerSeptets = Math.ceil(headerBytes * 8 / 7), skipBits = headerBytes ? headerSeptets * 7 : 0;
			text = decodeGsm7(ud, Math.max(0, udl - headerSeptets), skipBits);
		}
		return { index: String(index), indexes: [ String(index) ], number: number, date: date, text: text, concat: concat, direction:'in', order:Number(index) || 0 };
	} catch (e) { return null; }
}

function parseMessages(raw) {
	var lines = (raw || '').replace(/\r/g, '').split('\n'), messages = [], pending = null;
	lines.forEach(function(line) {
		line = line.trim();
		var m = line.match(/^\+CMGL:\s*(\d+),/);
		if (m) pending = m[1];
		else if (pending != null && /^[0-9A-F]+$/i.test(line)) { var msg = decodePdu(line, pending); if (msg) messages.push(msg); pending = null; }
	});
	var merged = [], groups = {};
	messages.forEach(function(msg) {
		if (!msg.concat) { merged.push(msg); return; }
		var key = msg.number + ':' + msg.concat.ref;
		(groups[key] || (groups[key] = [])).push(msg);
	});
	Object.keys(groups).forEach(function(key) {
		var parts = groups[key].sort(function(a, b) { return a.concat.seq - b.concat.seq; }), first = parts[0];
		first.text = parts.map(function(p) { return p.text; }).join(''); first.indexes = parts.map(function(p) { return p.index; }); merged.push(first);
	});
	return merged.sort(function(a, b) { return b.indexes[0] - a.indexes[0]; });
}

function parseInfo(raw) {
	return {
		ims: ((raw.match(/\^IMSSWITCH:\s*(\d+)/)||[])[1]||''),
		smsc: ((raw.match(/\+CSCA:\s*"([^"]+)"/)||[])[1]||''),
		storage: ((raw.match(/\+CPMS:\s*"([A-Z]+)",(\d+),(\d+)/)||[]).slice(1))
	};
}

function groupMessages(messages) {
	var groups = {};
	messages.forEach(function(msg) { (groups[msg.number] || (groups[msg.number] = [])).push(msg); });
	return Object.keys(groups).map(function(number) { return { number:number, messages:groups[number].sort(function(a,b){return (a.order||0)-(b.order||0);}) }; }).sort(function(a,b){return (b.messages[b.messages.length-1].order||0)-(a.messages[a.messages.length-1].order||0);});
}

return view.extend({
	sentHistory:function(){
		try{return JSON.parse(window.localStorage.getItem('mt5700m.sms.sent')||window.localStorage.getItem('sms_sent_messages_cache')||'[]').map(function(item){return item&&item.content?{number:item.number,text:item.content,date:item.time,order:Date.parse(item.time)||0}:item;}).filter(function(item){return item&&item.number&&item.text;}).map(function(item){item.direction='out';item.indexes=[];return item;});}catch(e){return[];}
	},
	saveSent:function(number,text){
		var now=new Date(),history=this.sentHistory();
		history.push({number:number,text:text,date:'%s-%s-%s %s:%s'.format(now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0'),String(now.getHours()).padStart(2,'0'),String(now.getMinutes()).padStart(2,'0')),order:now.getTime(),direction:'out',indexes:[]});
		window.localStorage.setItem('mt5700m.sms.sent',JSON.stringify(history.slice(-500)));
	},
	clearSent:function(){window.localStorage.removeItem('mt5700m.sms.sent');window.localStorage.removeItem('sms_sent_messages_cache');},
	exportSent:function(){
		var history=this.sentHistory();
		if(!history.length)return ui.addNotification(null,E('p',{},_('There is no sent history to export.')),'info');
		var blob=new Blob([JSON.stringify({format:'mt5700m-sent-history',version:1,messages:history},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
		link.href=url;link.download='mt5700m-sent-history.json';document.body.appendChild(link);link.click();link.remove();window.setTimeout(function(){URL.revokeObjectURL(url);},0);
	},
	importSent:function(file){
		var self=this,reader=new FileReader();
		reader.onload=function(){
			try{
				var parsed=JSON.parse(reader.result),items=Array.isArray(parsed)?parsed:parsed.messages;
				if(!Array.isArray(items))throw new Error('format');
				var clean=items.map(function(item){
					var number=String(item.number||''),text=String(item.text||item.content||''),order=Number(item.order||Date.parse(item.date||item.time)||0);
					if(!/^\+?[0-9]{5,20}$/.test(number)||!text||!order)return null;
					return {number:number,text:text,date:String(item.date||item.time||''),order:order,direction:'out',indexes:[]};
				}).filter(Boolean).slice(-500);
				if(!clean.length&&items.length)throw new Error('content');
				window.localStorage.setItem('mt5700m.sms.sent',JSON.stringify(clean));window.localStorage.removeItem('sms_sent_messages_cache');window.location.reload();
			}catch(e){ui.addNotification(null,E('p',{},_('The selected file is not a valid MT5700M sent-history backup.')),'danger');}
		};
		reader.onerror=function(){ui.addNotification(null,E('p',{},_('The selected history file could not be read.')),'danger');};reader.readAsText(file);
	},
	load: function() { return Promise.all([
		fs.exec('/usr/sbin/mt5700m-read',['sms-list']).then(function(res){return res.stdout||'';},function(){return '';}),
		fs.exec('/usr/sbin/mt5700m-read',['sms-info']).then(function(res){return res.stdout||'';},function(){return '';})
	]); },
	styleNode: function(){return E('style',{},[
		'.mt-sms{max-width:1120px;margin:0 auto}.mt-sms-hero{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:21px 23px;border-radius:14px;background:linear-gradient(135deg,#173550,#17616c);color:#fff;margin-bottom:15px}.mt-sms-hero h2{color:#fff;margin:0 0 5px}.mt-sms-hero p{margin:0;color:#c8e0e3}.mt-sms-hero-actions{display:flex;gap:8px}.mt-sms-hero .btn{background:rgba(255,255,255,.13);border-color:rgba(255,255,255,.35);color:#fff}',
		'.mt-sms-shell{display:grid;grid-template-columns:300px minmax(0,1fr);min-height:590px;border:1px solid var(--border-color-medium,#d9dde4);border-radius:13px;background:var(--background-color-high,#fff);overflow:hidden}.mt-sms-sidebar{border-right:1px solid var(--border-color-low,#e9edf0);background:var(--background-color-low,#fafbfc)}.mt-sms-sidehead,.mt-sms-chathead{padding:15px 17px;border-bottom:1px solid var(--border-color-low,#e9edf0);display:flex;align-items:center;justify-content:space-between;gap:10px}.mt-sms-sidehead strong,.mt-sms-chathead strong{font-size:14px}',
		'.mt-sms-contact{display:block;width:100%;border:0;border-bottom:1px solid var(--border-color-low,#edf0f3);padding:14px 16px;text-align:left;background:transparent;cursor:pointer}.mt-sms-contact:hover,.mt-sms-contact.active{background:#eaf3fb}.mt-sms-contact-top{display:flex;justify-content:space-between;gap:8px}.mt-sms-contact-number{font-weight:700}.mt-sms-contact-date{font-size:10px;color:#78818a}.mt-sms-contact-preview{font-size:11px;color:#727c85;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
		'.mt-sms-chat{display:flex;flex-direction:column;min-width:0}.mt-sms-thread{flex:1;padding:20px;overflow:auto;max-height:470px;background:linear-gradient(#f8fafc,#fff)}.mt-sms-bubblewrap{display:flex;align-items:flex-end;gap:8px;margin-bottom:15px}.mt-sms-bubblewrap.out{justify-content:flex-end}.mt-sms-bubble{max-width:78%;padding:11px 13px;border-radius:4px 14px 14px 14px;background:#fff;border:1px solid #e0e6eb;box-shadow:0 2px 7px rgba(25,45,65,.04);white-space:pre-wrap;line-height:1.55}.mt-sms-bubblewrap.out .mt-sms-bubble{order:2;border-radius:14px 4px 14px 14px;background:#e7f4ff;border-color:#c7e1f5}.mt-sms-bubblewrap.out .mt-sms-delete{order:1}.mt-sms-bubbledate{font-size:10px;color:#87909a;margin-top:6px}.mt-sms-delete{border:0;background:transparent;color:#a66;cursor:pointer;font-size:11px;opacity:.65}.mt-sms-delete:hover{opacity:1}',
		'.mt-sms-compose{border-top:1px solid var(--border-color-low,#e9edf0);padding:13px 15px}.mt-sms-recipient{display:none;margin-bottom:9px}.mt-sms-recipient.show{display:block}.mt-sms-recipient input{width:100%}.mt-sms-compose-row{display:flex;gap:9px;align-items:flex-end}.mt-sms-compose textarea{flex:1;resize:vertical;min-height:54px;max-height:130px}.mt-sms-empty{display:flex;align-items:center;justify-content:center;min-height:420px;color:#78818a;text-align:center;padding:30px}.mt-sms-storage{font-size:11px;color:#d6eaed;margin-top:7px}',
		'.mt-sms-settings-row{display:grid;grid-template-columns:135px 1fr;gap:10px;align-items:center;margin:12px 0}.mt-sms-settings-row input,.mt-sms-settings-row select{width:100%}.mt-sms-danger{margin-top:18px;padding-top:14px;border-top:1px solid #eee}',
		'@media(max-width:760px){.mt-sms-shell{grid-template-columns:1fr}.mt-sms-sidebar{border-right:0;border-bottom:1px solid #e9edf0;max-height:250px;overflow:auto}.mt-sms-hero{display:block}.mt-sms-hero-actions{margin-top:13px}.mt-sms-thread{max-height:430px}.mt-sms-bubble{max-width:90%}}'
	].join(''));},

	settingsModal:function(info){
		var self=this,smsc=E('input',{'class':'cbi-input-text','value':info.smsc||''}),storage=E('select',{'class':'cbi-input-select'},[E('option',{'value':'SM'},_('SIM card')),E('option',{'value':'ME'},_('Module storage'))]);storage.value=info.storage[0]||'SM';
		var ims=E('select',{'class':'cbi-input-select'},[E('option',{'value':'1'},_('Enabled')),E('option',{'value':'0'},_('Disabled'))]);ims.value=info.ims==='0'?'0':'1';
		var importFile=E('input',{'type':'file','accept':'application/json,.json','style':'display:none','change':function(){if(importFile.files&&importFile.files[0])self.importSent(importFile.files[0]);}});
		function failed(err){ui.addNotification(null,E('p',{},err&&err.message?err.message:_('Message operation failed.')),'danger');}
		ui.showModal(_('Message settings'),[E('div',{},[
			E('div',{'class':'mt-sms-settings-row'},[E('label',{},_('SMS service')),ims]),
			E('div',{'class':'alert-message warning'},_('Changing SMS service cycles airplane mode and also changes the IMS PDP context. Leave it enabled unless the carrier does not support IMS messaging.')),
			E('div',{'class':'mt-sms-settings-row'},[E('label',{},_('Message center')),smsc]),E('div',{'class':'mt-sms-settings-row'},[E('label',{},_('Storage location')),storage]),
			E('div',{'class':'right'},[E('button',{'type':'button','class':'btn','click':ui.hideModal},_('Close')),' ',E('button',{'type':'button','class':'btn cbi-button-apply','click':function(){var value=smsc.value.trim();if(!/^\+?[0-9]{5,20}$/.test(value))return ui.addNotification(null,E('p',{},_('Enter a valid message center number.')),'warning');var tasks=[fs.exec('/usr/sbin/mt5700m-at',['sms-set','smsc',value]),fs.exec('/usr/sbin/mt5700m-at',['sms-set','storage',storage.value])];if(ims.value!==info.ims)tasks.push(fs.exec('/usr/sbin/mt5700m-at',['sms-ims',ims.value]));Promise.all(tasks).then(function(){ui.hideModal();ui.addNotification(null,E('p',{},_('Message settings saved.')));window.setTimeout(function(){window.location.reload();},1200);}).catch(failed);}},_('Save settings'))]),
			E('div',{'class':'mt-sms-danger'},[E('p',{},_('Sent messages are stored in this browser. Export a backup before clearing browser data or moving to another device.')),importFile,E('button',{'type':'button','class':'btn','click':function(){self.exportSent();}},_('Export sent history')),' ',E('button',{'type':'button','class':'btn','click':function(){importFile.click();}},_('Import sent history')),E('p',{},_('Clearing message history cannot be undone.')),E('button',{'type':'button','class':'btn','click':function(){self.clearSent();ui.hideModal();window.location.reload();}},_('Clear sent history')),' ',E('button',{'type':'button','class':'btn cbi-button-negative','click':function(){ui.hideModal();ui.showModal(_('Clear all messages?'),[E('p',{},_('Every received message stored on the module will be permanently deleted.')),E('div',{'class':'right'},[E('button',{'type':'button','class':'btn','click':ui.hideModal},_('Cancel')),' ',E('button',{'type':'button','class':'btn cbi-button-negative','click':function(){ui.hideModal();fs.exec('/usr/sbin/mt5700m-at',['sms-clear']).then(function(){window.location.reload();}).catch(failed);}},_('Clear all'))])]);}},_('Clear received messages'))])
		])]);
	},

	render:function(data){
		var self=this,messages=parseMessages(data[0]).concat(this.sentHistory()),groups=groupMessages(messages),info=parseInfo(data[1]);
		var contacts=E('div',{}),thread=E('div',{'class':'mt-sms-thread'}),chatTitle=E('strong',{},_('Select a conversation')),recipient=E('input',{'class':'cbi-input-text','placeholder':'+8613800000000','inputmode':'tel'}),recipientWrap=E('div',{'class':'mt-sms-recipient'},recipient),text=E('textarea',{'class':'cbi-input-text','rows':2,'maxlength':500,'placeholder':_('Write a message…')}),selected='';
		function showThread(group,button){selected=group?group.number:'';recipient.value=selected;recipientWrap.classList.toggle('show',!group);chatTitle.textContent=group?group.number:_('New message');contacts.querySelectorAll('.mt-sms-contact').forEach(function(node){node.classList.toggle('active',node===button);});dom.content(thread,group?group.messages.map(function(msg){return E('div',{'class':'mt-sms-bubblewrap '+(msg.direction==='out'?'out':'in')},[E('div',{'class':'mt-sms-bubble'},[msg.text||_('Empty message'),E('div',{'class':'mt-sms-bubbledate'},msg.date)]),E('button',{'type':'button','class':'mt-sms-delete','title':_('Delete'),'click':function(){ui.showModal(_('Delete message?'),[E('p',{},msg.direction==='out'?_('This removes the local sent-history entry.'):_('This removes the selected message from the module.')),E('div',{'class':'right'},[E('button',{'type':'button','class':'btn','click':ui.hideModal},_('Cancel')),' ',E('button',{'type':'button','class':'btn cbi-button-negative','click':function(){ui.hideModal();if(msg.direction==='out'){window.localStorage.setItem('mt5700m.sms.sent',JSON.stringify(self.sentHistory().filter(function(item){return item.order!==msg.order;})));window.location.reload();return;}Promise.all(msg.indexes.map(function(index){return fs.exec('/usr/sbin/mt5700m-at',['sms-delete',index]);})).then(function(){window.location.reload();}).catch(function(err){ui.addNotification(null,E('p',{},err&&err.message?err.message:_('Message operation failed.')),'danger');});}},_('Delete'))])]);}},'×')]);}):E('div',{'class':'mt-sms-empty'},[E('div',{},[E('strong',{},_('Start a new conversation')),E('p',{},_('Enter a phone number below and write your message.'))])]));thread.scrollTop=thread.scrollHeight;}
		groups.forEach(function(group,index){var last=group.messages[group.messages.length-1],button=E('button',{'type':'button','class':'mt-sms-contact'+(index?'':' active')},[E('div',{'class':'mt-sms-contact-top'},[E('span',{'class':'mt-sms-contact-number'},group.number),E('span',{'class':'mt-sms-contact-date'},last.date.substring(5))]),E('div',{'class':'mt-sms-contact-preview'},last.text||_('Empty message'))]);button.addEventListener('click',function(){showThread(group,button);});contacts.appendChild(button);});
		function newMessage(){showThread(null,null);recipientWrap.classList.add('show');recipient.focus();}
		function send(){var number=(selected||recipient.value).trim(),body=text.value.trim();if(!/^\+?[0-9]{5,20}$/.test(number)||!body)return ui.addNotification(null,E('p',{},_('Enter a valid phone number and message.')),'warning');ui.showModal(_('Send message?'),[E('p',{},_('Send this message to %s?').format(number)),E('div',{'class':'right'},[E('button',{'type':'button','class':'btn','click':ui.hideModal},_('Cancel')),' ',E('button',{'type':'button','class':'btn cbi-button-apply','click':function(){ui.hideModal();fs.exec('/usr/sbin/mt5700m-at',['sms-send',number,body]).then(function(){self.saveSent(number,body);text.value='';ui.addNotification(null,E('p',{},_('Message sent.')));window.location.reload();},function(err){ui.addNotification(null,E('p',{},err.message),'danger');});}},_('Send'))])]);}
		if(groups.length)showThread(groups[0],contacts.firstChild);else showThread(null,null);
		return E('div',{'class':'mt-sms mt-ui-page'},[this.styleNode(),controls.styleNode(),E('section',{'class':'mt-sms-hero mt-ui-hero'},[E('div',{},[E('h2',{},_('Messages')),E('p',{},_('Conversations using the SIM installed in the MT5700M.')),E('div',{'class':'mt-sms-storage'},info.storage.length?_('%s of %s message slots used').format(info.storage[1],info.storage[2]):_('Storage status unavailable'))]),E('div',{'class':'mt-sms-hero-actions'},[E('button',{'type':'button','class':'btn','click':newMessage},_('New message')),E('button',{'type':'button','class':'btn','click':function(){window.location.reload();}},_('Refresh')),E('button',{'type':'button','class':'btn','click':function(){self.settingsModal(info);}},_('Settings'))])]),E('div',{'class':'mt-sms-shell mt-ui-card'},[E('aside',{'class':'mt-sms-sidebar'},[E('div',{'class':'mt-sms-sidehead'},[E('strong',{},_('Conversations')),E('span',{},String(groups.length))]),contacts]),E('section',{'class':'mt-sms-chat'},[E('div',{'class':'mt-sms-chathead'},chatTitle),thread,E('div',{'class':'mt-sms-compose'},[recipientWrap,E('div',{'class':'mt-sms-compose-row'},[text,E('button',{'type':'button','class':'btn cbi-button-apply','click':send},_('Send'))])])])])]);
	},handleSave:null,handleSaveApply:null,handleReset:null
});
