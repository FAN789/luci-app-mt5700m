const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../luci-app-mt5700m/htdocs/luci-static/resources');
const source = fs.readFileSync(path.join(root, 'mt5700m/controls.js'), 'utf8');
let result;
const controls = new Function('baseclass', 'fs', '_', source)(
  { extend: x => x }, { exec: () => Promise.resolve(result) }, x => x);
(async () => {
  result = {code: 0, stdout: 'OK'};
  assert.strictEqual((await controls.exec('test', [])).stdout, 'OK');
  result = {code: 65, stderr: 'modem rejected'};
  await assert.rejects(controls.exec('test', []), /modem rejected/);
  result = undefined;
  await assert.rejects(controls.exec('test', []), /Command failed/);
  for (const file of fs.readdirSync(path.join(root, 'view/mt5700m'))) {
    if (!file.endsWith('.js')) continue;
    const content = fs.readFileSync(path.join(root, 'view/mt5700m', file), 'utf8');
    new Function(content);
    assert(!content.includes('fs.exec('), file + ' bypasses checked execution');
  }
  console.log('PASS: UI command failures propagate; all views parse');
})().catch(e => { console.error(e); process.exit(1); });
