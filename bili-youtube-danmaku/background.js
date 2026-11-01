importScripts('emoji.js');
const imageJobs=new Map();
async function loadEmoji(url){
  if(!imageJobs.has(url)){
    const job=(async()=>{
      const response=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:AbortSignal.timeout(4000)});
      const mime=response.headers.get('content-type')?.split(';')[0];
      if(!response.ok || !['image/png','image/jpeg','image/webp','image/gif','image/avif'].includes(mime))throw Error('invalid image');
      const reader=response.body.getReader();let length=0;const chunks=[];
      while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>200000){await reader.cancel();throw Error('image too large');}chunks.push(value);}
      let binary='';for(const chunk of chunks)for(const byte of chunk)binary+=String.fromCharCode(byte);
      return `data:${mime};base64,${btoa(binary)}`;
    })().catch(()=>null);
    imageJobs.set(url,job);
    if(imageJobs.size>200)imageJobs.delete(imageJobs.keys().next().value);
  }
  return imageJobs.get(url);
}
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  (async () => {
    const source = sender.tab?.url || '';
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
    if (m.type === 'status' && /^https:\/\/live\.bilibili\.com\//.test(source)) {
      await chrome.storage.session.set({['status:'+sender.tab.id]: {at:Date.now(), count:m.count, ready:!!m.ready}});
      return {ok:true};
    }
    if (m.type === 'danmaku' && /^https:\/\/live\.bilibili\.com\//.test(source)) {
      const all = await chrome.storage.session.get(null);
      const {settings} = await chrome.storage.local.get('settings');
      if (settings?.enabled === false) return {ok:true};
      const room = new URL(source).pathname.split('/')[1];
      const items = Array.isArray(m.items) ? m.items.slice(0,30).map(x=>({text:String(x.text || '').trim().slice(0,200),user:String(x.user || '').slice(0,40),color:DanmakuEmoji.color(x.color) || '#ffffff',emojis:DanmakuEmoji.cleanMap(x.emojis),emojiScales:DanmakuEmoji.cleanScales(x.emojiScales)})).filter(x=>x.text) : [];
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
  await chrome.storage.session.remove('binding:'+id);
  await chrome.storage.session.remove('status:'+id);
});
