const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../luci-app-mt5700m');
const source = fs.readFileSync(path.join(root, 'htdocs/luci-static/resources/mt5700m/controls.js'), 'utf8');
const controls = new Function('baseclass', 'ui', 'fs', '_', 'E', source)(
  {extend: x => x}, {}, {}, x => x,
  (tag, attrs, children) => ({tag, attrs, children}));
const css = controls.styleNode().children;
assert(css.includes('.mt-ui-page.mt-ui-page{width:100%;max-width:none'));
assert(css.includes('background:transparent!important'));
assert(css.includes('::before') && css.includes('content:none!important'));
assert(css.includes('@media(max-width:650px)'));
assert(css.includes('.mt-band-option input[type="checkbox"]{appearance:auto!important'));
assert(css.includes('.mt5700m-traffic-split>span{display:block}'));
const status = fs.readFileSync(path.join(root, 'htdocs/luci-static/resources/view/mt5700m/status.js'), 'utf8');
assert(status.includes("_('Download %s')") && status.includes("_('Upload %s')"));
const po = fs.readFileSync(path.join(root, 'po/zh_Hans/mt5700m.po'), 'utf8');
for (const msg of ['Download %s', 'Upload %s']) assert(po.includes(`msgid "${msg}"`));
console.log('PASS: scoped theme resets, responsive layout, checkbox and translated traffic lines');
