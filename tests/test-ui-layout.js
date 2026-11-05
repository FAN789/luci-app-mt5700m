const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../luci-app-mt5700m');
const source=fs.readFileSync(path.join(root,'htdocs/luci-static/resources/mt5700m/controls.js'),'utf8');
const controls=new Function('baseclass','ui','fs','_','E','ux',source)(
 {extend:x=>x},{},{},x=>x,(tag,attrs,children)=>({tag,attrs,children}),{style:()=>({tag:'link'})});
const node=controls.styleNode();
const base=node.children.find(x=>x.tag==='style').children;
const shared=fs.readFileSync(path.join(root,'htdocs/luci-static/resources/mt5700m/ux.css'),'utf8');
const css=(base+shared).replace(/\s+/g,'');
assert(base.includes('background:transparent!important'));
assert(base.includes('::before')&&base.includes('content:none!important'));
assert(css.includes('@media(max-width:650px)'));
assert(css.includes('input[type=checkbox]{appearance:auto!important'));
assert(css.includes('.mt5700m-traffic-split>span{display:block}'));
assert(css.includes('font-variant-numeric:tabular-nums'));
assert(css.includes('.mt5700m-signal-valuestrong{font-size:32px'));
assert(css.includes('.mt5700m-traffic-value{font-size:22px'));
assert(css.includes('.mt-signal-countdown{font-size:14px'));
assert(css.includes('height:38px;min-height:38px;margin:0'));
assert(css.includes('.mt5700m-hero-side{display:flex;flex-direction:row;align-items:center;gap:10px}'));
assert(css.includes('min-height:44px'));
assert(!css.includes('@font-face')&&!css.includes('@import'));
assert(node.children.some(x=>x.tag==='link'));
const status=fs.readFileSync(path.join(root,'htdocs/luci-static/resources/view/mt5700m/status.js'),'utf8');
assert(status.includes("_('Download %s')")&&status.includes("_('Upload %s')"));
const po=fs.readFileSync(path.join(root,'po/zh_Hans/mt5700m.po'),'utf8');
for(const msg of ['Download %s','Upload %s'])assert(po.includes(`msgid "${msg}"`));
console.log('PASS: scoped theme protection, responsive layout, typography, checkbox, translated traffic, aligned controls and 44px mobile actions');

assert(css.includes('.mt-ui-page.mt-ui-page{width:100%;max-width:none;min-width:0;box-sizing:border-box}'));
assert(css.includes('.mt-signal-actions{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:8px'));

const version=fs.readFileSync(path.join(root,'Makefile'),'utf8').match(/^PKG_VERSION:=(.+)$/m)[1].trim();
assert(fs.readFileSync(path.join(root,'htdocs/luci-static/resources/mt5700m/ux.js'),'utf8').includes('?v='+version),'CSS cache version must follow release version');
