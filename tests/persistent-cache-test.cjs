const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const base=require('node:path').resolve(__dirname,'../bili-youtube-danmaku')+'/';
(async()=>{
 const disk=new Map();let downloads=0,active=0,peak=0;
 const cache={match:async url=>disk.get(url)?.clone(),put:async(url,r)=>{disk.set(url,r.clone());},keys:async()=>[...disk.keys()],delete:async url=>disk.delete(url)};
 function serviceWorker(){
  let listener;
  const ctx=vm.createContext({URL,Response,AbortSignal,btoa,Uint8Array,caches:{open:async()=>cache},fetch:async url=>{downloads++;active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,5));active--;return new Response(url.includes('oversized')?new Uint8Array(524289):url.includes('large-emote')?new Uint8Array(300000):new Uint8Array([137,80,78,71]),{headers:{'content-type':'image/png'}});},chrome:{runtime:{onMessage:{addListener:f=>listener=f}},tabs:{onRemoved:{addListener(){}}}}});
  ctx.importScripts=file=>vm.runInContext(fs.readFileSync(base+file,'utf8'),ctx);
  vm.runInContext(fs.readFileSync(base+'background.js','utf8'),ctx);
  return urls=>new Promise(resolve=>listener({type:'emoji-assets',urls},{tab:{url:'https://www.youtube.com/watch?v=1'}},resolve));
 }
 const url='https://i0.hdslb.com/cache-test.png',first=serviceWorker();
 assert.ok((await first([url])).assets[url]);assert.equal(downloads,1);
 assert.ok((await serviceWorker()([url])).assets[url]);assert.equal(downloads,1,'worker restart must use persistent cached bytes');
 await Promise.all(Array.from({length:9},(_,i)=>first(['https://i0.hdslb.com/concurrent-'+i+'.png'])));
 assert.ok(peak<=4,'all requests must share a four-download concurrency limit');
 assert.equal(downloads,10);
 const large='https://i0.hdslb.com/large-emote.png';assert.ok((await first([large])).assets[large].length>280000);
 const afterLarge=downloads;assert.ok((await serviceWorker()([large])).assets[large]);assert.equal(downloads,afterLarge);
 const tooLarge='https://i0.hdslb.com/oversized.png';assert.equal((await first([tooLarge])).assets[tooLarge],undefined);assert.equal(disk.has(tooLarge),false);
 console.log('PASS: persistent image cache survives worker restart; global download concurrency <= 4');
})().catch(e=>{console.error(e);process.exitCode=1});
