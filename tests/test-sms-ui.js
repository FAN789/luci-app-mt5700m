const fs = require('fs'), assert = require('assert');
const source = fs.readFileSync(__dirname + '/../luci-app-mt5700m/htdocs/luci-static/resources/mt5700m/controls.js', 'utf8');
let stored = null, starts = 0, polls = 0, mode = 'success', storageBlocked = false, modal = null;
const ui = new Function('baseclass','fs','_','window','ui','E',source)(
 {extend:x=>x}, {exec:(path,args)=>{
   if(args[0]==='sms-send-start') {
     starts++;
     if(mode==='lost-start') return Promise.reject(new Error('lost RPC reply'));
     return Promise.resolve({code:0,stdout:'job=job.ABC123\n'});
   }
   assert.equal(args[0],'sms-send-status'); polls++;
   if(mode==='failed') return Promise.resolve({code:0,stdout:'state=done\ncode=124\nSubmission unconfirmed\n'});
   if(mode==='interrupted') return Promise.resolve({code:0,stdout:'state=interrupted\n'});
   return Promise.resolve({code:0,stdout:polls===1?'state=running\n':'state=done\ncode=0\nSMS submitted\n'});
 }}, x=>x, {setTimeout:f=>setTimeout(f,0),localStorage:{getItem:()=>{if(storageBlocked)throw Error('blocked');return stored},setItem:(k,v)=>{stored=v},removeItem:()=>{stored=null}}}, {showModal:(title,nodes)=>{modal={title,nodes}},hideModal:()=>{modal=null}}, (tag,attrs,children)=>({tag,attrs,children}));
(async()=>{
 await ui.sendSms('12345','mock');
 assert.equal(starts,1); assert.equal(polls,2); assert.equal(stored,null);
 stored='job.ABC123';
 await assert.rejects(ui.sendSms('54321','new text'),/previous message was submitted/);
 assert.equal(starts,1);
 mode='lost-start';
 await assert.rejects(ui.sendSms('12345','mock'),/lost RPC/);
 assert.equal(starts,2); assert.equal(stored,'unknown');
 await assert.rejects(ui.sendSms('12345','mock'),/unknown/);
 assert.equal(starts,2);
 assert.equal(modal.title,'SMS result needs checking');
 modal.nodes[1].children[1].attrs.click();
 assert.equal(stored,null); assert.equal(starts,2);
 mode='interrupted'; stored='job.ABC123';
 await assert.rejects(ui.sendSms('12345','mock'),/unknown/);
 assert.equal(starts,2); assert.equal(stored,'job.ABC123');
 modal.nodes[1].children[1].attrs.click();
 mode='failed';
 await assert.rejects(ui.sendSms('12345','mock'),/Submission unconfirmed/);
 assert.equal(stored,null); assert.equal(starts,3);
 storageBlocked=true;
 await assert.rejects(ui.sendSms('12345','mock'),/No message was sent/);
 assert.equal(starts,3);
 storageBlocked=false; mode='success';
 const active=ui.sendSms('12345','mock');
 await assert.rejects(ui.sendSms('12345','mock'),/already being submitted/);
 await active;
 assert.equal(starts,4); assert.equal(stored,null); assert.equal(modal,null);
 console.log('PASS: SMS success/failure, lost reply, reload, manual recovery, storage failure and duplicate click');
})().catch(e=>{console.error(e);process.exit(1)});
