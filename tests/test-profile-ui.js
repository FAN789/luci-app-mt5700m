const assert = require('assert');
const fs = require('fs');
const path = require('path');
const base = path.resolve(__dirname, '../luci-app-mt5700m/htdocs/luci-static/resources');
const controls = new Function('baseclass', fs.readFileSync(path.join(base, 'mt5700m/controls.js'), 'utf8'))({extend:x=>x});
const source = fs.readFileSync(path.join(base, 'view/mt5700m/connection.js'), 'utf8');
const view = new Function('view', 'controls', 'rpc', source)({extend:x=>x}, controls, {declare:()=>()=>Promise.resolve({})});
const raw = protocol => '===== Auto dial: =====\n^SETAUTODIAL:1,1,"'+protocol+'","","","",0\nOK\n';
assert.deepStrictEqual(view.profileSummary(raw('IP'), 'ipv4v6'), {actual:'ip', mismatch:true});
for (const [at,uci] of [['IP','ip'],['IPV6','ipv6'],['IPV4V6','ipv4v6']])
  assert.deepStrictEqual(view.profileSummary(raw(at), uci), {actual:uci, mismatch:false});
for (const text of ['', '[Auto dial]\nERROR', '[Auto dial]\n^SETAUTODIAL:0', raw('UNKNOWN'), raw('IP').replace(',0', ',9')])
  assert.deepStrictEqual(view.profileSummary(text, 'ipv4v6'), {actual:null, mismatch:false});
assert(source.includes("self.fact(_('Saved IP protocol'), configuredProtocol)"));
assert(source.includes("self.sessionRow(_('Module IP protocol (snapshot)'), actualProtocol)"));
assert(source.includes("self.runAction(callDial, _('Dialing started.'), applyWarning)"));
assert(source.includes("_('The 5G connection will be interrupted briefly while the modem redials.') + ' ' + applyWarning"));
console.log('PASS: module/saved protocol distinction, mismatch and unavailable states, explicit apply warnings');
