const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const elements=Object.fromEntries(['bind','unbind','status','source','target'].map(id=>[id,{value:id==='target'?'1':'2',setAttribute(){}}]));
let bound=true,room='https://live.bilibili.com/123';
const records={};
const ctx=vm.createContext({document:{getElementById:id=>elements[id]},chrome:{storage:{session:{get:async key=>key===null?records:key==='binding:1' && bound?{[key]:{sourceId:2,room:'123'}}:{}}},tabs:{get:async()=>({url:room})}},URL});
vm.runInContext(fs.readFileSync(require('node:path').resolve(__dirname,'../bili-youtube-danmaku/popup.js'),'utf8').replace('init().catch(showError);',''),ctx);
(async()=>{
 await vm.runInContext('status()',ctx);assert.equal(elements.bind.textContent,'连接成功');assert.equal(elements.bind.disabled,true);assert.equal(elements.unbind.disabled,false);
 records['status:2:frame:0']={at:Date.now(),ready:false,count:0,frameId:0};
 records['status:2:frame:17']={at:Date.now()-1000,ready:true,count:12,frameId:17,room:'295558189',lastMessageAt:Date.now()-1000};
 await vm.runInContext('status()',ctx);assert.match(elements.status.textContent,/当前内嵌房间 295558189/);assert.match(elements.status.textContent,/12 条新弹幕/);
 elements.source.value='3';await vm.runInContext('status()',ctx);assert.equal(elements.bind.textContent,'连接直播间');assert.equal(elements.bind.disabled,false);
 await vm.runInContext('status(true)',ctx);assert.equal(elements.source.value,'2');
 bound=false;await vm.runInContext('status()',ctx);assert.equal(elements.bind.textContent,'连接直播间');assert.equal(elements.unbind.disabled,true);
 bound=true;room='https://live.bilibili.com/999';await vm.runInContext('status()',ctx);assert.equal(elements.bind.disabled,false);
 console.log('PASS: connected button, room change, target selection and disconnection state');
})().catch(e=>{console.error(e);process.exitCode=1});
