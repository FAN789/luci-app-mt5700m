const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(__dirname+'/../luci-app-mt5700m/htdocs/luci-static/resources/view/mt5700m/status.js','utf8');
async function check(age){
 let now=2000000000000,calls=0,rendered=[],queue=[],badge={textContent:''};
 const RealDate=Date;
 class Clock extends RealDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 const card={querySelector:()=>({textContent:''}),replaceWith:()=>{}};
 const root={isConnected:true,querySelector:()=>card,querySelectorAll:()=>[badge]};
 const context={Date:Clock,document:{hidden:false},window:{setTimeout:(fn,ms)=>queue.push({fn,at:now+ms})},
  view:{extend:o=>o},rpc:{declare:()=>()=>Promise.resolve({})},controls:{exec:()=>{calls++;return Promise.resolve({stdout:`sysmode=NR\nrsrp=-98\nsampled_at=${(now-age*1000)/1000}\n`});}},console};
 const page=vm.runInNewContext('(function(){'+source+'})()',context);
 page.signalCard=data=>{rendered.push(data);return card;};
 page.startSignalUpdates(root);
 async function advance(ms){const stop=now+ms;while(queue.some(q=>q.at<=stop)){queue.sort((a,b)=>a.at-b.at);const task=queue.shift();now=task.at;task.fn();for(let i=0;i<10;i++)await Promise.resolve();}now=stop;}
 await advance(0);assert.equal(calls,1);
 if(age===0){assert.equal(rendered.length,1);assert(rendered[0].signalUpdated.startsWith('信号更新：'));}
 if(age===20){assert.equal(rendered.length,1);assert(rendered[0].signalUpdated.startsWith('信号更新延迟'));}
 if(age===31)assert.equal(rendered.length,0);
 await advance(4999);assert.equal(calls,1);await advance(1);assert.equal(calls,2);
 context.document.hidden=true;await advance(15000);assert.equal(calls,2);
 root.isConnected=false;await advance(10000);assert.equal(calls,2);
}
(async()=>{for(const age of [0,20,31])await check(age);console.log('PASS actual UI callbacks: initial cache read, 5-second polling, true sample freshness, stale rejection, hidden/detached pause');})().catch(e=>{console.error(e);process.exit(1);});
