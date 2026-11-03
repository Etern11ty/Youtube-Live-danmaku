importScripts('emoji.js');
const imageJobs=new Map();
let imageDownloads=0;
const imageWaiters=[];
const imageFailures=new Map();
async function imageSlot(task){
  if(imageDownloads>=4)await new Promise(resolve=>imageWaiters.push(resolve));
  else imageDownloads++;
  try{return await task();}finally{const next=imageWaiters.shift();if(next)next();else imageDownloads--;}
}
const recentMessages=new Map();
function frameRoom(url){try{return new URL(url).pathname.match(/^\/(?:blanc\/)?(\d+)(?:\/|$)/)?.[1] || '';}catch{return '';}}
async function loadEmoji(url){
  if(Date.now()-(imageFailures.get(url)||0)<30000)return null;
  if(!imageJobs.has(url)){
    const job=imageSlot(async()=>{
      // Cache Storage survives background suspension, page reload and browser restart.
      const cache=typeof caches!=='undefined'?await caches.open('danmaku-emoji-v1').catch(()=>null):null;
      const saved=cache?await cache.match(url).catch(()=>null):null;
      const response=saved || await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:AbortSignal.timeout(4000)});
      const mime=response.headers.get('content-type')?.split(';')[0];
      if(!response.ok || !['image/png','image/jpeg','image/webp','image/gif','image/avif'].includes(mime))throw Error('invalid image');
      const reader=response.body.getReader();let length=0;const chunks=[];
      while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>524288){await reader.cancel();throw Error('image too large');}chunks.push(value);}
      if(cache && !saved){
        const bytes=new Uint8Array(length);let offset=0;
        for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
        await cache.put(url,new Response(bytes,{headers:{'Content-Type':mime}})).catch(()=>{});
        const keys=await cache.keys().catch(()=>[]);
        await Promise.all(keys.slice(0,Math.max(0,keys.length-200)).map(key=>cache.delete(key).catch(()=>{})));
      }
      let binary='';for(const chunk of chunks)for(const byte of chunk)binary+=String.fromCharCode(byte);
      return `data:${mime};base64,${btoa(binary)}`;
    }).catch(()=>{imageFailures.set(url,Date.now());imageJobs.delete(url);if(imageFailures.size>200)imageFailures.delete(imageFailures.keys().next().value);return null;});
    imageJobs.set(url,job);
    if(imageJobs.size>200)imageJobs.delete(imageJobs.keys().next().value);
  }
  return imageJobs.get(url);
}
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  (async () => {
    const source = sender.tab?.url || '';
    const frameUrl=sender.url || source;
    const isLiveSource=source.startsWith('https://live.bilibili.com/') && frameUrl.startsWith('https://live.bilibili.com/');
    if(m.type==='emoji-assets' && source.startsWith('https://www.youtube.com/')){
      const urls=[...new Set((Array.isArray(m.urls)?m.urls:[]).map(DanmakuEmoji.safeUrl).filter(Boolean))].slice(0,16);
      const assets=Object.create(null);
      // Bound fetch concurrency; only the Bilibili image CDN is allowed.
      for(let i=0;i<urls.length;i+=4)await Promise.all(urls.slice(i,i+4).map(async url=>{const data=await loadEmoji(url);if(data)assets[url]=data;}));
      return {ok:true,assets};
    }
    if (m.type === 'bind') {
      if (sender.tab || !Number.isInteger(m.target) || !Number.isInteger(m.source)) throw Error('无效绑定');
      const [target, origin] = await Promise.all([chrome.tabs.get(m.target), chrome.tabs.get(m.source)]);
      if (!target.url?.startsWith('https://www.youtube.com/') || !/^https:\/\/live\.bilibili\.com\/\d+/.test(origin.url || '')) throw Error('请选择有效页面');
      await chrome.storage.session.set({['binding:'+target.id]: {sourceId:origin.id, room:new URL(origin.url).pathname.split('/')[1]}});
      return {ok:true};
    }
    if (m.type === 'unbind' && !sender.tab) {
      await chrome.storage.session.remove('binding:'+m.target); return {ok:true};
    }
    if (m.type === 'status' && isLiveSource) {
      await chrome.storage.session.set({['status:'+sender.tab.id+':frame:'+(sender.frameId || 0)]: {at:Date.now(),count:Number(m.count)||0,ready:!!m.ready,frameId:sender.frameId || 0,room:frameRoom(frameUrl),lastMessageAt:Number(m.lastMessageAt)||0}});
      return {ok:true};
    }
    if (m.type === 'danmaku' && isLiveSource) {
      const all = await chrome.storage.session.get(null);
      const {settings} = await chrome.storage.local.get('settings');
      if (settings?.enabled === false) return {ok:true};
      const room = new URL(source).pathname.split('/')[1];
      let items = Array.isArray(m.items) ? m.items.slice(0,30).map(x=>({text:String(x.text || '').trim().slice(0,200),user:String(x.user || '').slice(0,40),color:DanmakuEmoji.color(x.color) || '#ffffff',emojis:DanmakuEmoji.cleanMap(x.emojis),emojiScales:DanmakuEmoji.cleanScales(x.emojiScales)})).filter(x=>x.text) : [];
      let recent=recentMessages.get(sender.tab.id);
      if(!recent){recent=new Map();recentMessages.set(sender.tab.id,recent);}
      const now=Date.now(),frame=sender.frameId || 0;
      for(const [key,value] of recent)if(now-value.at>1500)recent.delete(key);
      items=items.filter(item=>{
        const key=JSON.stringify([item.text,item.user,item.color]);
        const prev=recent.get(key);
        // Only suppress cross-frame duplicates; repeated messages in one room remain valid.
        if(prev && prev.frame!==frame && now-prev.at<1000)return false;
        recent.set(key,{at:now,frame});return true;
      });
      while(recent.size>500)recent.delete(recent.keys().next().value);
      if(!items.length)return {ok:true};
      await Promise.all(Object.entries(all).filter(([k,v])=>k.startsWith('binding:') && v.sourceId===sender.tab.id && v.room===room).map(([k])=>chrome.tabs.sendMessage(Number(k.slice(8)), {type:'render',items}).catch(()=>{})));
      return {ok:true};
    }
    if (m.type === 'demo' && !sender.tab) {
      await chrome.tabs.sendMessage(m.target,{type:'render',demo:true,items:[{text:'弹幕桥连接测试成功 ✨',user:'测试'},{text:'这里将显示 B 站直播间弹幕',user:'弹幕桥'}]});
      return {ok:true};
    }
    return {ok:false,error:'未知操作'};
  })().then(reply).catch(e=>reply({ok:false,error:e.message}));
  return true;
});
chrome.tabs.onRemoved.addListener(async id=>{
  recentMessages.delete(id);
  await chrome.storage.session.remove('binding:'+id);
  await chrome.storage.session.remove('status:'+id);
  const all=await chrome.storage.session.get(null);
  await Promise.all(Object.keys(all).filter(k=>k.startsWith('status:'+id+':frame:')).map(k=>chrome.storage.session.remove(k)));
});
