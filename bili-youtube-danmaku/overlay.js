(() => {
  const life=new DanmakuLifecycle();
  const defaults = {enabled:true,fontSize:28,opacity:85,duration:9,area:60,showUser:false,useColor:true};
  let settings = {...defaults}, host, root, layer, queue=[], lastUrl=location.href;
  const layout=new DanmakuLayout();
  const emojiAssets=new Map();
  async function prepareEmoji(items){
    const urls=[...new Set(items.flatMap(item=>Object.values(DanmakuEmoji.cleanMap(item.emojis))))].filter(url=>!emojiAssets.has(url)).slice(0,16);
    if(!urls.length)return;
    urls.forEach(url=>emojiAssets.set(url,null));
    try{
      const r=await chrome.runtime.sendMessage({type:'emoji-assets',urls});
      for(const url of urls){const data=r?.assets?.[url];if(typeof data==='string' && /^data:image\/(png|jpeg|webp|gif|avif);base64,[A-Za-z0-9+/=]+$/.test(data) && data.length<280000)emojiAssets.set(url,data);}
    }catch{}
    while(emojiAssets.size>200)emojiAssets.delete(emojiAssets.keys().next().value);
  }
  function fillMessage(el,item){
    const text=(settings.showUser && item.user ? item.user+'：':'');
    // Keep the plain-text path for messages without recognized emoji.
    const parts=DanmakuEmoji.parts(item.text,item.emojis);
    if(!parts.some(p=>p.url)){el.textContent=text+item.text;return;}
    el.textContent=text;
    for(const part of parts){
      if(!part.url){el.append(document.createTextNode(part.text));continue;}
      const box=document.createElement('span');
      const scale=item.emojiScales?.[part.text]>=1.7?1.8:1;
      const em=Number((1.15*scale).toFixed(3));
      box.style.cssText=`display:inline-block;width:${em}em;height:${em}em;vertical-align:middle;position:relative;overflow:hidden;`;
      const fallback=document.createElement('span');fallback.textContent=part.text;
      fallback.style.cssText='position:absolute;inset:0;font-size:.38em;display:flex;align-items:center;justify-content:center;';
      box.append(fallback);el.append(box);
      const data=emojiAssets.get(part.url);
      if(data){
        const img=document.createElement('img');img.alt=part.text;img.title=part.text;
        img.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;';
        img.onload=()=>fallback.style.visibility='hidden';
        img.onerror=()=>{img.remove();fallback.style.visibility='visible';};
        img.src=data;box.append(img);
      }
    }
  }
  const clamp=(v,min,max)=>Math.min(max,Math.max(min,Number(v)||min));
  life.call(()=>chrome.storage.local.get('settings')).then(x=>settings={...defaults,...x.settings});
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area==='local' && changes.settings) {
      const wasEnabled=settings.enabled;
      settings={...defaults,...changes.settings.newValue};
      if(wasEnabled && !settings.enabled)clear();
    }
    if(area==='session' && Object.keys(changes).some(k=>k.startsWith('binding:'))) clear();
  });
  function clear(){queue=[]; layout.clear(); layer?.replaceChildren();}
  life.onStop(()=>{clear();host?.remove();emojiAssets.clear();});
  function mount(){
    if(lastUrl!==location.href){clear();lastUrl=location.href;}
    const player=document.querySelector('#movie_player');
    if(!player || !player.querySelector('video')) return false;
    if(!host || host.parentElement!==player){
      host?.remove(); host=document.createElement('div');
      host.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:60;overflow:hidden;';
      root=host.attachShadow({mode:'closed'});
      const style=document.createElement('style');
      style.textContent='.layer{position:absolute;inset:0;overflow:hidden;pointer-events:none}.msg{position:absolute;left:0;white-space:nowrap;font-family:Arial,"Microsoft YaHei",sans-serif;font-weight:600;color:white;text-shadow:1px 1px 2px #000,-1px -1px 2px #000;line-height:1.3;will-change:transform}';
      layer=document.createElement('div');layer.className='layer'; root.append(style,layer);player.append(host);clear();
    }
    return host.clientWidth>0 && host.clientHeight>0;
  }
  chrome.runtime.onMessage.addListener((m,s,reply)=>{
    if(m.type!=='render')return;
    if(!mount()){reply({ok:false});return;}
    if(settings.enabled || m.demo){
      const items=m.items.slice(0,30).map(item=>({...item,received:performance.now(),ready:!Object.keys(item.emojis || {}).length}));
      queue.push(...items);queue=queue.slice(-100);
      prepareEmoji(items).finally(()=>items.forEach(item=>item.ready=true));
    }
    reply({ok:true});
  });
  life.every(()=>{
    if(!mount() || !settings.enabled || document.hidden){queue=[];return;}
    const size=clamp(settings.fontSize,16,48), duration=clamp(settings.duration,5,20)*1000;
    const now=performance.now();
    queue=queue.filter(item=>now-item.received<8000);
    if(!queue.length)return;
    // At most 1.2s for image preparation; failed/slow downloads retain textual labels.
    if(!queue[0].ready && now-queue[0].received<1200)return;
      const item=queue[0], el=document.createElement('div');el.className='msg';
      fillMessage(el,item);
      el.style.cssText=`visibility:hidden;font-size:${size}px;opacity:${clamp(settings.opacity,20,100)/100};color:${settings.useColor!==false ? (DanmakuEmoji.color(item.color) || '#ffffff') : '#ffffff'};`;
      layer.append(el);const rect=el.getBoundingClientRect(), width=rect.width;
      const slot=layout.place({now,width:host.clientWidth,height:host.clientHeight*clamp(settings.area,20,100)/100,messageWidth:width,messageHeight:rect.height,duration});
      if(!slot){el.remove();return;}
      queue.shift();el.style.top=slot.top+'px';el.style.visibility='visible';
      const animation=el.animate([{transform:`translateX(${host.clientWidth}px)`},{transform:`translateX(${-width}px)`}],{duration,easing:'linear'});
      animation.onfinish=()=>el.remove();
  },150);
})();
