const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const base=require('node:path').resolve(__dirname,'../bili-youtube-danmaku')+'/';
function setup(){
 let mutate,now=0,src='',raw='';const timers=[],sent=[];
 const row={nodeType:1,matches:()=>true,closest:()=>row,querySelectorAll:s=>s.startsWith('img')?[img]:[],getAttribute:k=>k==='data-danmaku'?raw:'',querySelector:s=>s.startsWith('.danmaku-content')?body:null};
 const img={nodeType:1,tagName:'IMG',currentSrc:'',closest:s=>s.startsWith('.chat-item')?row:null,getAttribute:k=>k==='src'?src:'',querySelectorAll:()=>[]};
 const body={nodeType:1,tagName:'SPAN',childNodes:[img],textContent:'',querySelectorAll:()=>[img],getAttribute:()=>''};
 const win={addEventListener(){},removeEventListener(){}};
 const ctx=vm.createContext({URL,Date:class extends Date{static now(){return 1000+now}},window:win,location:{origin:'https://live.bilibili.com'},chrome:{runtime:{id:'test',sendMessage:async m=>sent.push(m)},storage:{local:{get:async()=>({}),set:async()=>{}}}},document:{documentElement:{},querySelectorAll:()=>[],querySelector:()=>true},MutationObserver:class{constructor(f){mutate=f}observe(){}disconnect(){}},setInterval:f=>timers.push(f),clearInterval(){}});
 for(const file of ['emoji.js','lifecycle.js','source.js'])vm.runInContext(fs.readFileSync(base+file,'utf8'),ctx);
 return {row,img,body,sent,setSrc:s=>src=s,setRaw:s=>raw=s,add:()=>mutate([{addedNodes:[row]}]),attribute:()=>mutate([{type:'attributes',target:img,addedNodes:[]}]),flush:()=>{now+=600;timers[0]();}};
}
const imageOnly=setup();imageOnly.setSrc('https://i0.hdslb.com/meme.webp');imageOnly.add();imageOnly.flush();
const message=imageOnly.sent.find(m=>m.type==='danmaku').items[0];
assert.match(message.text,/^\[img_/);assert.equal(message.emojis[message.text],'https://i0.hdslb.com/meme.webp');assert.equal(message._node,undefined);
const lazy=setup();lazy.add();lazy.flush();assert.equal(lazy.sent.filter(m=>m.type==='danmaku').length,0);
lazy.setSrc('https://i0.hdslb.com/late.png');lazy.attribute();lazy.flush();assert.equal(lazy.sent.filter(m=>m.type==='danmaku').length,1);
lazy.attribute();lazy.flush();assert.equal(lazy.sent.filter(m=>m.type==='danmaku').length,1,'attribute updates cannot replay emitted messages');
const changed=setup();changed.setRaw('赛事表情');changed.add();changed.setSrc('https://i0.hdslb.com/arrived.png');changed.attribute();changed.flush();
const updated=changed.sent.find(m=>m.type==='danmaku').items[0];assert.match(updated.text,/^\[img_/);assert.equal(updated.emojis[updated.text],'https://i0.hdslb.com/arrived.png');
const mix=setup();mix.setSrc('https://i0.hdslb.com/mixed.png');mix.body.childNodes=[{nodeType:3,textContent:'前'},mix.img,{nodeType:3,textContent:'后'}];mix.body.textContent='前后';mix.add();mix.flush();assert.match(mix.sent.find(m=>m.type==='danmaku').items[0].text,/^前\[img_.+\]后$/);
console.log('PASS: unlabeled image-only messages; lazy src; pending image update; no duplicate replay; inline text/image order');
const events=[],ctx=vm.createContext({window:{postMessage:m=>events.push(m)},location:{origin:'https://live.bilibili.com'}});
vm.runInContext(fs.readFileSync(base+'page-meta.js','utf8'),ctx);
ctx.raw=JSON.stringify({cmd:'DANMU_MSG',info:[[0,1,25,0xffffff,{url:'https://i0.hdslb.com/single.png',emoticon_unique:'room_123_4'}],'赛事表情',[1,'name']]});
vm.runInContext('JSON.parse(raw)',ctx);assert.equal(events[0].renderText,'[赛事表情]');assert.equal(events[0].emojis['[赛事表情]'],'https://i0.hdslb.com/single.png');
ctx.raw=JSON.stringify({cmd:'DANMU_MSG',info:[[0,1,25,0xffffff,{extra:JSON.stringify({emoticon:{url:'https://i0.hdslb.com/nested.png'}})}],'嵌套表情',[1,'name']]});
vm.runInContext('JSON.parse(raw)',ctx);assert.equal(events[1].renderText,'[嵌套表情]');
console.log('PASS: whole-message native emote becomes replaceable token; nested image metadata');
