const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(__dirname+'/../luci-app-mt5700m/htdocs/luci-static/resources/mt5700m/ux.js','utf8');
async function check(age){
 let now=2000000000000,calls=0,rendered=0,failed=0,queue=[],id=0;
 class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 const root={isConnected:true};
 const context={Date:Clock,document:{hidden:false,addEventListener(){},removeEventListener(){}},baseclass:{extend:x=>x},
 setTimeout:(fn,ms)=>{queue.push({fn,at:now+ms,id:++id});return id;},clearTimeout:id=>queue=queue.filter(q=>q.id!==id),
 fs:{exec:()=>{calls++;return Promise.resolve({code:0,stdout:`sysmode=NR\nrsrp=-98\nsampled_at=${(now-age*1000)/1000}\n`});}}};
 const ux=vm.runInNewContext('(function(){'+source+'})()',context);
 ux.signal(root,()=>rendered++,()=>failed++);
 async function advance(ms){const stop=now+ms;while(queue.some(q=>q.at<=stop)){queue.sort((a,b)=>a.at-b.at);const q=queue.shift();now=q.at;q.fn();for(let i=0;i<30;i++)await Promise.resolve();}now=stop;}
 await advance(0);assert.equal(calls,1);
 if(age>=0&&age<=30){assert.equal(rendered,1);assert.equal(failed,0);}else{assert.equal(rendered,0);assert.equal(failed,1);}
 await advance(4999);assert.equal(calls,1);await advance(1);assert.equal(calls,2);
 context.document.hidden=true;await advance(15000);assert.equal(calls,2);
 root.isConnected=false;await advance(10000);assert.equal(calls,2);
}
(async()=>{for(const age of [0,20,31,-10])await check(age);console.log('PASS: cache-only initial read, 5-second cadence, true freshness, stale/future sample rejection and hidden/detached pause');})().catch(e=>{console.error(e);process.exit(1)});
