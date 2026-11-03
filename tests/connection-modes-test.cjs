const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const base=process.env.DANMAKU_BASE || path.resolve(__dirname,'../bili-youtube-danmaku');
const turn=()=>new Promise(setImmediate);
async function background(){
 let listener,removed,updated,alarm;const session={},local={},sent=[],connections=[],timers=new Map();let serial=0;
 const store=data=>({get:async key=>key===null?{...data}:Object.fromEntries((Array.isArray(key)?key:[key]).map(k=>[k,data[k]])),set:async obj=>Object.assign(data,obj),remove:async key=>{for(const k of Array.isArray(key)?key:[key])delete data[k];}});
 const tabs={1:{id:1,url:'https://www.youtube.com/watch?v=a'},2:{id:2,url:'https://live.bilibili.com/123'}};
 const chrome={storage:{session:store(session),local:store(local)},runtime:{onMessage:{addListener:f=>listener=f}},tabs:{get:async id=>tabs[id],sendMessage:async(id,m)=>sent.push({id,m}),onRemoved:{addListener:f=>removed=f},onUpdated:{addListener:f=>updated=f}},alarms:{create(){},onAlarm:{addListener:f=>alarm=f}}};
 const ctx=vm.createContext({chrome,URL,Date,console,setTimeout:f=>{timers.set(++serial,f);return serial},clearTimeout:id=>timers.delete(id)});
 ctx.importScripts=f=>vm.runInContext(fs.readFileSync(path.join(base,f),'utf8'),ctx);
 vm.runInContext(fs.readFileSync(path.join(base,'background.js'),'utf8'),ctx);
 ctx.DanmakuDirect.Connection=class {constructor(room,cb){this.room=room;this.cb=cb;connections.push(this);}stop(){this.stopped=true;}};
 const call=(m,s={})=>new Promise(resolve=>listener(m,s,resolve));
 assert.equal((await call({type:'bind-direct',target:1,room:'https://live.bilibili.com/456?x=1'})).ok,true);
 assert.equal(session['binding:1'].room,'456');assert.equal(connections.length,1);
 const c=connections[0];c.cb.status({state:'connected',count:0});assert.equal(session['direct-status:1'].state,'connected');
 c.cb.message({text:'new[dog]',emojis:{},emojiScales:{}});for(const f of [...timers.values()])await f();timers.clear();assert.equal(sent.length,1);
 c.cb.message({text:'must not leak',emojis:{},emojiScales:{}});
 assert.equal((await call({type:'bind',target:1,source:2})).ok,true);assert.equal(c.stopped,true);assert.equal(timers.size,0);
 c.cb.status({state:'connected'});assert.equal(session['direct-status:1'],undefined,'stale callbacks ignored');
 await call({type:'bind-direct',target:1,room:'789'});assert.equal(connections.length,2);
 assert.equal((await call({type:'bind-direct',target:1,room:'0'})).ok,false);assert.equal(session['binding:1'].room,'789','invalid input keeps existing connection');
 assert.equal((await call({type:'bind-direct',target:1,room:'456'},{tab:tabs[2]})).ok,false);
 await call({type:'unbind',target:1});assert.equal(connections[1].stopped,true);assert.equal(session['binding:1'],undefined);
 session['binding:1']={mode:'direct',room:'999'};alarm({name:'direct-recovery'});await turn();await turn();assert.equal(connections.at(-1).room,'999','alarm restores persisted session binding');
 updated(1,{url:'https://example.com'});await turn();assert.equal(connections.at(-1).stopped,true);assert.equal(session['binding:1'],undefined);
 await call({type:'bind-direct',target:1,room:'123'});await removed(1);assert.equal(connections.at(-1).stopped,true);
 console.log('PASS: direct/tab switching, stale-source isolation, unbind, target removal/navigation and alarm recovery');
}
async function lifecycle(){
 const timers=new Map(),intervals=new Map(),sockets=[];let serial=0;
 class Socket{constructor(){sockets.push(this);this.readyState=1;this.sent=[];}send(b){this.sent.push(b);}close(){this.closed=true;this.readyState=3;this.onclose?.();}}
 const images={img_url:'https://i.test/'+'a'.repeat(32)+'.png',sub_url:'https://i.test/'+'b'.repeat(32)+'.png'};
 const ctx=vm.createContext({URL,TextEncoder,TextDecoder,Uint8Array,DataView,Blob,DecompressionStream,AbortSignal,Date,console,WebSocket:Socket,setTimeout:f=>{timers.set(++serial,f);return serial},clearTimeout:id=>timers.delete(id),setInterval:f=>{intervals.set(++serial,f);return serial},clearInterval:id=>intervals.delete(id),fetch:async url=>({ok:true,json:async()=>url.includes('room_init')?{code:0,data:{room_id:123,live_status:1}}:url.includes('/nav')?{data:{wbi_img:images}}:{code:0,data:{token:'test',host_list:[{host:'broadcastlv.chat.bilibili.com',wss_port:443}]}}})});
 for(const f of ['emoji.js','direct.js'])vm.runInContext(fs.readFileSync(path.join(base,f),'utf8'),ctx);
 const D=ctx.DanmakuDirect,states=[],items=[];const c=new D.Connection('123',{status:s=>states.push(s),message:m=>items.push(m)});await turn();
 const ws=sockets[0];ws.onopen();assert.equal(new DataView(ws.sent[0].buffer).getUint32(8),7);
 ws.onmessage({data:D.packet({code:0},8).buffer});await turn();assert.equal(states.at(-1).state,'connected');assert.equal(intervals.size,1);
 ws.onmessage({data:D.packet({cmd:'DANMU_MSG',info:[[0,0,0,0xff0000],'hello',[]]},5).buffer});await turn();assert.equal(items[0].color,'#ff0000');
 ws.close();assert.equal(states.at(-1).state,'reconnecting');assert.equal(intervals.size,0);assert.equal(timers.size,1);
 const retry=[...timers.values()][0];timers.clear();await retry();await turn();assert.equal(sockets.length,2);
 c.stop();assert.equal(timers.size,0);assert.equal(sockets[1].closed,true);
 const before=items.length;ws.onmessage({data:D.packet({cmd:'DANMU_MSG',info:[[0,0,0,0],'stale',[]]},5).buffer});await turn();assert.equal(items.length,before);
 console.log('PASS: authentication, heartbeat cleanup, reconnect and stopped-connection isolation');
}
background().then(lifecycle).catch(e=>{console.error(e);process.exitCode=1});
