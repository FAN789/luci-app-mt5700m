const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const R=path.join(__dirname,'../luci-app-mt5700m/htdocs/luci-static/resources');
class Element {
 constructor(tag,attrs={},children=[]){this.tagName=tag;this.attrs=attrs;this.children=[];this.parentNode=null;this.value=attrs.value||'';this.disabled=!!attrs.disabled;this.hidden=false;this.open=false;this.style={};this.dataset={};this.scrollTop=0;this.scrollHeight=500;this.listeners={};this._text='';this.className=attrs.class||'';
 Object.keys(attrs).forEach(k=>{if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=attrs[k];if(typeof attrs[k]==='function')this.listeners[k]=attrs[k];});
 this.classList={toggle:(c,on)=>{const a=new Set(this.className.split(' '));if(on)a.add(c);else a.delete(c);this.className=[...a].join(' ');},add:c=>this.classList.toggle(c,true)};
 this.replaceChildren(...(Array.isArray(children)?children:[children]));}
 get isConnected(){return this===document.body||!!this.parentNode?.isConnected;}
 get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
 set textContent(v){this._text=String(v);this.children.forEach(x=>x.parentNode=null);this.children=[];}
 appendChild(node){if(node===null||node===undefined)return;if(!(node instanceof Element)){const n=new Element('#text');n._text=String(node);node=n;}node.parentNode=this;this.children.push(node);return node;}
 replaceChildren(...nodes){this._text='';this.children.forEach(x=>x.parentNode=null);this.children=[];nodes.flat().forEach(n=>this.appendChild(n));}
 replaceWith(n){const p=this.parentNode;if(!p)return;let i=p.children.indexOf(this);p.children[i]=n;n.parentNode=p;this.parentNode=null;}
 remove(){if(this.parentNode){this.parentNode.children=this.parentNode.children.filter(x=>x!==this);this.parentNode=null;}}
 matches(q){if(q.startsWith('.'))return this.className.split(' ').includes(q.slice(1));if(q.startsWith('['))return Object.hasOwn(this.attrs,q.slice(1,-1));return this.tagName===q;}
 querySelectorAll(q){let r=[];for(const c of this.children){if(q.split(',').some(s=>c.matches(s.trim())))r.push(c);r.push(...c.querySelectorAll(q));}return r;}
 querySelector(q){return this.querySelectorAll(q)[0]||null;}
 addEventListener(k,f){this.listeners[k]=f;} setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this.attrs[k]??null;}
 click(){return this.listeners.click?.call(this,{currentTarget:this,target:this});}focus(){} get firstChild(){return this.children[0];}
}
const document={hidden:false,addEventListener(){},removeEventListener(){}};document.body=new Element('body');
let now=2000000000000,timers=[],serial=0;
class Clock extends Date{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}}
const timeout=(fn,ms)=>{const id=++serial;timers.push({id,fn,at:now+ms});return id};
const clear=id=>timers=timers.filter(x=>x.id!==id);
async function flush(){for(let i=0;i<40;i++)await Promise.resolve();}
async function advance(ms){const end=now+ms;let turns=0;while(timers.some(t=>t.at<=end)){assert(++turns<3000,'timer storm');timers.sort((a,b)=>a.at-b.at);const t=timers.shift();now=t.at;t.fn();await flush();}now=end;}
let calls=[],responses={},modal=null,storage={},rpcFail=false;
const ctx={console,document,Date:Clock,E:(...a)=>new Element(...a),baseclass:{extend:x=>x},view:{extend:x=>x},_:x=>x,
 setTimeout:timeout,clearTimeout:clear,window:{setTimeout:timeout,clearTimeout:clear,addEventListener(){},removeEventListener(){},localStorage:{getItem:k=>storage[k]||null,setItem:(k,v)=>storage[k]=v,removeItem:k=>delete storage[k]},location:{reload(){throw Error('Unexpected reload')}}},
 ui:{showModal:(title,nodes)=>modal={title,nodes},hideModal:()=>modal=null,addNotification(){}},
 L:{resource:p=>p,url:p=>p,bind:(fn,self)=>fn.bind(self)},dom:{content:(node,c)=>node.replaceChildren(c)},
 fs:{exec:(p,args)=>{calls.push(args.slice());const r=responses[args.join(' ')]||responses[args[0]];return Promise.resolve().then(()=>typeof r==='function'?r(args):r||{code:0,stdout:''});}},
 rpc:{declare:({object,method})=>()=>{
  if(rpcFail)return Promise.reject(Error('RPC unavailable'));
  if(object==='mt5700m')return Promise.resolve({connected:true,running:true,internet_verified:true,network:'eth2'});
  if(object==='network.interface')return Promise.resolve({interface:[{interface:'MT5700M',up:true,'ipv4-address':[{address:'10.0.0.2'}]}]});
  return Promise.resolve({interfaces:[]});
 }},uci:{load:()=>Promise.resolve(),get:()=>null},form:{Map:class{section(){return {option(){return {value(){},depends(){}}}}}render(){return Promise.resolve(new Element('div'));}},NamedSection:class{},Flag:class{},Value:class{},ListValue:class{},DynamicList:class{}}};
vm.createContext(ctx);vm.runInContext("String.prototype.format=function(...args){let i=0;return this.replace(/%[0-9.]*[sdf]/g,()=>String(args[i++]));}",ctx);
function load(name){return vm.runInContext('(function(){'+fs.readFileSync(path.join(R,name+'.js'),'utf8')+'})()',ctx);}
ctx.ux=load('mt5700m/ux');ctx.controls=load('mt5700m/controls');
function mount(n){document.body.replaceChildren(n);return n;}
// Optional snapshots let browser tests inspect the actual view output below.
function snapshot(name, root) {
 const directory = process.env.MT5700M_DOM_DIR;
 if (!directory) return;
 function escape(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
 }
 function serialize(node) {
  if (node.tagName === '#text') return escape(node._text);
  const attrs = {...node.attrs, class: node.className};
  if (node.open) attrs.open = '';
  if (node.disabled) attrs.disabled = '';
  if (node.hidden) attrs.hidden = '';
  const attributes = Object.entries(attrs)
   .filter(([key, value]) => typeof value !== 'function' && key !== 'style')
   .map(([key, value]) => key + '="' + escape(value) + '"');
  const style = [typeof node.attrs.style === 'string' ? node.attrs.style : '',
   ...Object.entries(node.style).map(([key, value]) => key.replace(/[A-Z]/g, c => '-' + c.toLowerCase()) + ':' + value)].join(';');
  attributes.push('style="' + escape(style) + '"');
  const children = node.tagName === 'style' ? node.textContent : escape(node._text) + node.children.map(serialize).join('');
  return '<' + node.tagName + ' ' + attributes.join(' ') + '>' + children + '</' + node.tagName + '>';
 }
 fs.mkdirSync(directory, {recursive: true});
 fs.writeFileSync(path.join(directory, name + '.html'), serialize(root));
}
(async()=>{
 // Cached reads coalesce and failures can be retried.
 responses.signal=()=>({code:0,stdout:`sysmode=NR\nrsrp=-90\nrsrq=-5\nsinr=12\nsampled_at=${now/1000}\n`});
 calls=[];await Promise.all([ctx.ux.read(['signal']),ctx.ux.read(['signal'])]);assert.equal(calls.length,1);
 responses.bad={code:75,stderr:'busy'};await assert.rejects(ctx.ux.read(['bad']),/busy/);await assert.rejects(ctx.ux.read(['bad']),/busy/);
 let samples=0,errors=0;let root=mount(new Element('div'));ctx.ux.signal(root,()=>samples++,()=>errors++);
 await advance(0);assert.equal(samples,1);await advance(4999);assert.equal(samples,1);await advance(1);assert.equal(samples,2);
 document.hidden=true;await advance(15000);assert.equal(samples,2);document.hidden=false;await advance(5000);assert(samples>=3);
 root.remove();let prior=calls.length;await advance(10000);assert.equal(calls.length,prior);
 root=mount(new Element('div'));responses.signal={code:0,stdout:'sysmode=NR\nsampled_at=1\n'};ctx.ux.signal(root,()=>samples++,()=>errors++);await advance(0);assert.equal(errors,1);root.remove();
 // Overview renders fresh carrier/traffic separately, one countdown, and preserves addresses on RPC failure.
 responses.signal=()=>({code:0,stdout:`sysmode=NR\nrsrp=-90\nrsrq=-5\nsinr=12\nsampled_at=${now/1000}\n`});
 let usbSpeed='480';
 responses.status=()=>({code:0,stdout:`connected=1\nsysmode=NR\noperator=Test\nusb_speed_mbps=${usbSpeed}\ncarrier_count=2\ncarrier_1=NR|n78|1|x|100|x|x|100\ncarrier_2=NR|n78|2|x|100|x|x|100\nca_active=1\nsnapshot_at=${now/1000}\n`});
 const overview=load('view/mt5700m/status');root=mount(overview.render());await advance(0);await advance(1000);
 assert.equal(root.querySelectorAll('[data-signal-countdown]').length,1);
 const signalCard=root.querySelector('[data-mt-signal]');
 assert(signalCard.children[0].className.includes('mt5700m-focus-head'));
 assert.equal(signalCard.children[1].attrs['data-signal-time'],'');
 const signalActions=root.querySelector('[data-signal-countdown]').parentNode;
 assert.equal(signalActions.className,'mt-signal-actions');
 assert(signalActions.children.some(n=>n.className.includes('mt5700m-badge')));
assert(root.textContent.includes('n78 + n78'));assert(root.textContent.includes('10.0.0.2'));
 assert(root.textContent.includes('2CA'));
 assert(root.querySelector('[data-mt-usb-link]').textContent.includes('480 Mbps'));
 usbSpeed='5000';
 rpcFail=true;await advance(4000);assert(root.textContent.includes('10.0.0.2'));assert(root.textContent.includes('状态待确认'));rpcFail=false;
 const initial=calls.filter(c=>c[0]==='status').length;await advance(61000);assert(calls.filter(c=>c[0]==='status').length>initial);
 assert.equal(root.querySelector('[data-mt-usb-link]').textContent,'5 Gbps');snapshot('status',root);root.remove();

 // Carrier semantics, address transitions, history pagination and timing preference.
 const sample={carrier_count:'2',ca_active:'1',dc_active:'0',ca_mode:'NR-CA',snapshot_at:String(now/1000),
  carrier_1:'NR|n78|1|3500|100|1|3500|100',carrier_2:'NR|n78|2|3600|100|2|3600|100'};
 assert(overview.carrierCard(overview.carrierInfo(sample)).textContent.includes('2CA'));
 assert(!overview.carrierCard(overview.carrierInfo(sample)).textContent.includes('NR-CA'));
 assert(overview.carrierCard(overview.carrierInfo({...sample,dc_active:'1',ca_mode:'EN-DC + CA'})).textContent.includes('EN-DC + CA'));
 assert(overview.carrierCard(overview.carrierInfo({...sample,carrier_count:'1',ca_active:'0'})).textContent.includes('Single carrier'));
 assert(!overview.carrierCard(overview.carrierInfo({...sample,ca_active:'0'})).textContent.includes('Single carrier'));
 assert(overview.carrierCard(overview.carrierInfo({})).textContent.includes('Waiting for carrier snapshot'));
 for(const session of [
  {ipv4Connected:true,expected:1},
  {ipv4Connected:true,ipv6Connected:true,ipv6Address:'2001:db8::1',expected:2},
  {ipv4Connected:true,ipv6Address:'2001:db8::1',expected:2},
  {ipv4Connected:true,loading:true,expected:2},
  {ipv4Connected:true,ipv6Expected:true,expected:2},
  {expected:2}]){
  assert.equal(overview.addressCard(session).querySelectorAll('.mt5700m-ip-row').length,session.expected);
 }
 storage['mt5700m.overview.countdown']='off';
 assert(overview.signalCard({rsrp:'-90'}).querySelector('[data-signal-countdown]').hidden);
 storage['mt5700m.overview.countdown']='on';
 assert(!overview.signalCard({rsrp:'-90'}).querySelector('[data-signal-countdown]').hidden);

 for(const [raw,dc,mode,expected] of [['NR-5GC','0','NR','5G SA'],['NR-5GC','1','EN-DC','5G NSA'],['LTE','0','LTE','LTE'],['NR','0','NR','NR']]){
  const rendered=overview.renderStatus({native:{stdout:'sysmode=NR\nnetwork_mode='+raw+'\ndc_active='+dc+'\nca_mode='+mode+'\n'},manager:{connected:true},sessionData:{},traffic:{interfaces:[]}});
  assert.equal(rendered.querySelector('[data-mt-mode]').textContent,expected);
 }
 assert(overview.signalCard({sysmode:'LTE'}).textContent.includes('4G (LTE)'));
 const historyDays=Array.from({length:70},(_,i)=>{const d=new Date(Date.UTC(2025,0,i+1));return {date:{year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate()},rx:i===0?0:i*1024,tx:0};});
 const trafficReport={interfaces:[{name:'history-fixture',traffic:{day:historyDays,total:{rx:100,tx:0}}}]};
 let historyPanel=overview.trafficPanel(trafficReport,'history-fixture');
 assert.equal(historyPanel.querySelectorAll('.mt-traffic-record').length,7);
 historyPanel.querySelectorAll('button')[0].click();
 assert.equal(historyPanel.querySelectorAll('.mt-traffic-record').length,37);
 historyPanel=overview.trafficPanel(trafficReport,'history-fixture');
 assert.equal(historyPanel.querySelectorAll('.mt-traffic-record').length,37);
 historyPanel.querySelectorAll('button')[0].click();
 historyPanel.querySelectorAll('button')[0].click();
 assert.equal(historyPanel.querySelectorAll('.mt-traffic-record').length,70);
 assert(historyPanel.querySelectorAll('i').some(n=>n.attrs.style==='width:0%'));
 assert(!historyPanel.querySelectorAll('i').some(n=>n.attrs.style.includes('NaN')));
 historyPanel.querySelectorAll('button')[0].click();
 assert.equal(historyPanel.querySelectorAll('.mt-traffic-record').length,7);
 assert.equal(overview.trafficPanel({interfaces:[]},'empty').querySelectorAll('button').length,0);
 if(process.env.MT5700M_DOM_DIR)snapshot('history',new Element('div',{'class':'mt-ui-page'},[ctx.ux.style(),overview.trafficPanel(trafficReport,'history-fixture')]));
 // Deferred radio/connection pages must not query advanced controls until expanded.
 for(const name of ['network','connection','system','advanced']){
  responses.network={code:0,stdout:'===== Serving cell: AT^MONSC =====\n^MONSC: NR,460,1,1,1,1,1,1,-90,-5,12\n'};
  const p=load('view/mt5700m/'+name);calls=[];root=mount(p.render());await advance(0);await advance(1000);
  assert(!root.textContent.includes('读取失败'),name+' render failed');
  if(name==='network')assert(!calls.some(c=>c[0]==='advanced'),'radio queried eagerly');
  if(name==='connection')assert(!calls.some(c=>c[0]==='advanced'),'connection queried eagerly');
  snapshot(name,root);
  if(process.env.MT5700M_DOM_DIR){
   for(const detail of root.querySelectorAll('details')){
    detail.open=true;
    if(detail.listeners.toggle)detail.listeners.toggle({currentTarget:detail,target:detail});
   }
   await advance(1000);snapshot(name+'-expanded',root);
   if(name==='network'){await advance(6000);snapshot('network-refreshed',root);}
  }
  root.remove();
 }
 if(process.env.MT5700M_DOM_DIR){
  for(const name of ['terminal','settings']){
   const auxiliary=load('view/mt5700m/'+name);
   root=mount(await auxiliary.render());await advance(1000);snapshot(name,root);root.remove();
  }
 }
 // SMS read errors are never reported as a successful empty inbox. Refresh preserves a draft.
 const sms=load('view/mt5700m/sms');responses['sms-list']={code:75,stderr:'busy'};responses['sms-info']={code:75,stderr:'busy'};
 root=mount(sms.render());await advance(0);assert(root.textContent.includes('短信读取失败'));assert(root.querySelectorAll('button').find(x=>x.textContent==='设置').disabled);
 const draft=root.querySelector('textarea');draft.value='unsent draft';
 responses['sms-list']={code:0,stdout:'OK\n'};responses['sms-info']={code:0,stdout:'^IMSSWITCH: 1\n+CSCA: "12345"\n+CPMS: "SM",0,100\nOK\n'};
 await sms.refreshMessages();assert.equal(draft.value,'unsent draft');assert(!root.querySelectorAll('button').find(x=>x.textContent==='设置').disabled);
 snapshot('sms',root);
 // Settings save no-op must make no writes; changed fields run serially and stop after a failure.
 const info={ims:'1',smsc:'12345',storage:['SM','0','100']};sms.settingsModal(info);let modalRoot=new Element('div',{},modal.nodes);calls=[];
 snapshot('sms-settings',modalRoot);
 await modalRoot.querySelectorAll('button').find(x=>x.textContent==='Save settings').click();await flush();assert.equal(calls.length,0);
 sms.settingsModal(info);modalRoot=new Element('div',{},modal.nodes);modalRoot.querySelectorAll('input')[0].value='54321';modalRoot.querySelectorAll('select')[1].value='ME';
 responses['sms-set']=()=>{throw Error('simulated rejection')};calls=[];modalRoot.querySelectorAll('button').find(x=>x.textContent==='Save settings').click();await flush();
 assert.equal(calls.filter(c=>c[0]==='sms-set').length,1,'failed setting must stop remaining writes');
 console.log('PASS: coalescing, failed-read retry, 5s cadence, hidden/detached pause, stale rejection, snapshot refresh, RPC error retention, lazy loading, SMS failure/empty distinction, draft retention and sequential settings');
})().catch(e=>{console.error(e);process.exitCode=1;});
