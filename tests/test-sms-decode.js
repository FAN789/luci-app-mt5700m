const fs = require('fs'), assert = require('assert');
const source = fs.readFileSync(__dirname + '/../luci-app-mt5700m/htdocs/luci-static/resources/view/mt5700m/sms.js', 'utf8');
const api = new Function(source.slice(0, source.indexOf('return view.extend(')) + '\nreturn {decodeGsm7,decodePdu};')();
assert.equal(api.decodeGsm7('C1', 1, 0), 'A');
assert.equal(api.decodePdu('00', 1), null);
assert.equal(api.decodePdu('XYZ', 1), null);
assert.equal(api.decodePdu('0001', 1), null);
assert.equal(api.decodePdu('000000000000000000000000000000FF', 1), null);
console.log('PASS: GSM7 bitmask and malformed/non-deliver SMS rejection');
