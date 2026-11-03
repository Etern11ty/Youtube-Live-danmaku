const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const base=require('node:path').resolve(__dirname,'../bili-youtube-danmaku')+'/';
async function backgroundTest(){
  let listener;const local={},session={},sent=[];
  const tabs={1:{id:1,url:'https://www.youtube.com/watch?v=test'},2:{id:2,url:'https://live.bilibili.com/123'},3:{id:3,url:'https://www.youtube.com/watch?v=other'},4:{id:4,url:'https://live.bilibili.com/456'}};
  const store=data=>({get:async k=>k===null?{...data}:{[k]:data[k]},set:async v=>Object.assign(data,v),remove:async k=>delete data[k]});
  const chrome={storage:{local:store(local),session:store(session)},runtime:{id:'test',onMessage:{addListener:f=>listener=f}},tabs:{get:async id=>{if(!tabs[id])throw Error('missing');return tabs[id]},sendMessage:async(id,m)=>sent.push({id,m}),onRemoved:{addListener(){}}}};
  const context=vm.createContext({chrome,URL,Date,console});
  context.importScripts=path=>vm.runInContext(fs.readFileSync(base+path,'utf8'),context);
  vm.runInContext(fs.readFileSync(base+'background.js','utf8'),context);
  const call=(m,s={})=>new Promise(resolve=>listener(m,s,resolve));
  assert.equal((await call({type:'bind',target:1,source:2})).ok,true);
  assert.equal((await call({type:'bind',target:3,source:4})).ok,true);
  await call({type:'danmaku',items:[{text:'hello',user:'a'}]},{tab:tabs[2]});
  assert.equal(sent.length,1);assert.equal(sent[0].id,1);assert.equal(sent[0].m.items[0].text,'hello');
  await call({type:'danmaku',items:[{text:'evil'}]},{tab:{id:2,url:'https://example.com'}});assert.equal(sent.length,1);
  tabs[2].url='https://live.bilibili.com/999';
  await call({type:'danmaku',items:[{text:'wrong room'}]},{tab:tabs[2]});assert.equal(sent.length,1);
  tabs[2].url='https://live.bilibili.com/123';local.settings={enabled:false};
  await call({type:'danmaku',items:[{text:'disabled'}]},{tab:tabs[2]});assert.equal(sent.length,1);
  assert.equal((await call({type:'bind',target:1,source:4},{tab:tabs[2]})).ok,false);
  local.settings={enabled:true};
  const nested={tab:tabs[2],url:'https://live.bilibili.com/blanc/295558189?liteVersion=true',frameId:17};
  await call({type:'status',ready:true,count:12,lastMessageAt:Date.now()},nested);
  await call({type:'status',ready:false,count:0},{tab:tabs[2],url:tabs[2].url,frameId:0});
  assert.equal(session['status:2:frame:17'].ready,true);
  assert.equal(session['status:2:frame:17'].room,'295558189');
  assert.equal(session['status:2:frame:0'].ready,false);
  await call({type:'danmaku',items:[{text:'赛事弹幕',color:'#ff5078'}]},nested);
  assert.equal(sent.length,2);assert.equal(sent.at(-1).id,1);assert.equal(sent.at(-1).m.items[0].color,'#ff5078');
  await call({type:'danmaku',items:[{text:'赛事弹幕',color:'#ff5078'}]},{tab:tabs[2],url:tabs[2].url,frameId:0});
  assert.equal(sent.length,2,'cross-frame duplicate suppressed');
  await call({type:'danmaku',items:[{text:'赛事弹幕',color:'#ff5078'}]},nested);
  assert.equal(sent.length,3,'same-frame repetitions preserved');
  await call({type:'danmaku',items:[{text:'foreign frame'}]},{tab:tabs[2],url:'https://example.com',frameId:18});
  assert.equal(sent.length,3,'foreign frame rejected');
  await call({type:'unbind',target:1});
  await call({type:'danmaku',items:[{text:'unbound'}]},{tab:tabs[2]});assert.equal(sent.length,3);
  console.log('PASS: event-page iframe routing, frame status isolation, color relay, cross-frame deduplication, foreign-frame rejection');
  console.log('PASS: routing, room isolation, disabled switch, sender validation, unbind');
}
async function sourceTest(){
  let observer;const intervals=[],sent=[];
  const old={};const doc={querySelectorAll:s=>s.startsWith('img')?[]:[old],querySelector:()=>true,documentElement:{}};
  class MutationObserver{constructor(f){observer=f}observe(){}}
  const chrome={runtime:{id:'test',sendMessage:async m=>sent.push(m)},storage:{local:{get:async()=>({}),set:async()=>{}}}};
  const context=vm.createContext({chrome,document:doc,MutationObserver,setInterval:f=>intervals.push(f),WeakSet,URL});
  vm.runInContext(fs.readFileSync(base+'emoji.js','utf8'),context);
  vm.runInContext(fs.readFileSync(base+'lifecycle.js','utf8'),context);
  vm.runInContext(fs.readFileSync(base+'source.js','utf8'),context);
  const item={nodeType:1,matches:()=>true,querySelectorAll:()=>[],closest:()=>null,getAttribute:()=>'<img onerror=alert(1)>',querySelector:()=>null};
  observer([{addedNodes:[item,item]}]);intervals[0]();
  const batch=sent.find(m=>m.type==='danmaku');assert.equal(batch.items.length,1);assert.equal(batch.items[0].text,'<img onerror=alert(1)>');
  console.log('PASS: new DOM message extraction and duplicate node suppression');
}
backgroundTest().then(sourceTest).catch(e=>{console.error(e);process.exitCode=1});
