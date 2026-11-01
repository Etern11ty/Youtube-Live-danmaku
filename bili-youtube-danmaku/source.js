(() => {
  const life=new DanmakuLifecycle();
  const selector = '.chat-item.danmaku-item, .danmaku-item[data-danmaku], .chat-item[data-danmaku]';
  const seen = new WeakSet();
  let pending = [], count = 0;
  let catalog=Object.create(null),dirty=false,scanNeeded=true;
  let scales=Object.create(null);
  const metadata=[];
  const screenColors=new Map();
  const normalizeText=text=>String(text || '').normalize('NFC').replace(/[\u200b-\u200d\ufeff]/g,'').replace(/\s+/g,' ').trim();
  const normalizeUser=user=>normalizeText(user).replace(/[:：]\s*$/,'');
  const matches=(m,item)=>Date.now()-m.at<8000 && (normalizeText(m.text)===normalizeText(item.text) || '['+normalizeText(m.text)+']'===normalizeText(item.text)) && (!m.user || !item.user || normalizeUser(m.user)===normalizeUser(item.user));
  const onMetadata=event=>{
    if(life.stopped)return;
    const m=event.data;
    if(event.source!==window || event.origin!==location.origin || m?.channel!=='danmaku-bridge-meta-v1' || typeof m.text!=='string')return;
    const color=DanmakuEmoji.color(m.color);
    if(!color)return;
    metadata.push({text:m.text.trim().slice(0,200),user:String(m.user || '').trim().slice(0,40),color,emojis:DanmakuEmoji.cleanMap(m.emojis),emojiScales:DanmakuEmoji.cleanScales(m.emojiScales),at:Date.now()});
    while(metadata.length>400 || metadata.length && Date.now()-metadata[0].at>8000)metadata.shift();
  };
  if(typeof window!=='undefined'){
    window.addEventListener('message',onMetadata);
    life.onStop(()=>window.removeEventListener('message',onMetadata));
  }
  function scanScreenColors(){
    if(typeof getComputedStyle!=='function')return;
    const floating='.bili-danmaku-x-dm, .b-danmaku, .bilibili-live-player-video-danmaku-item, .danmaku-item[style*="color"]';
    for(const node of document.querySelectorAll(floating)){
      const text=node.textContent?.trim();
      const color=DanmakuEmoji.color(getComputedStyle(node).color);
      if(text && color && color!=='#ffffff')screenColors.set(text,{color,at:Date.now()});
    }
    for(const [text,v] of screenColors)if(Date.now()-v.at>5000)screenColors.delete(text);
    while(screenColors.size>400)screenColors.delete(screenColors.keys().next().value);
  }
  life.call(()=>chrome.storage.local.get('emojiScales')).then(x=>{scales={...DanmakuEmoji.cleanScales(x.emojiScales),...scales};});
  function special(img,body){
    const marker=img.closest('[data-emoticon-unique], [data-emoticon-type], [data-emoji-type]');
    const unique=marker?.getAttribute('data-emoticon-unique') || '';
    const type=marker?.getAttribute('data-emoticon-type') || marker?.getAttribute('data-emoji-type') || '';
    if(/^(room_|fans_|fan_|custom_)/i.test(unique) || /^(fans?|fanclub|room|custom)$/i.test(type))return true;
    if(img.closest('.fans-emoticon, .fan-emoticon, .room-emoticon, .custom-emoticon, .fans-emoji, .custom-emoji'))return true;
    // Also preserve explicitly oversized inline emoji as special, without judging by URL/name.
    if(body && typeof getComputedStyle==='function' && img.getBoundingClientRect){
      const font=parseFloat(getComputedStyle(body).fontSize);
      return font>0 && img.getBoundingClientRect().height>font*1.5;
    }
    return false;
  }
  function rememberScale(code,img,body){
    if(DanmakuEmoji.validCode(code) && special(img,body) && scales[code]!==1.8){scales[code]=1.8;dirty=true;}
  }
  life.call(()=>chrome.storage.local.get('emojiCatalog')).then(x=>{catalog={...DanmakuEmoji.cleanMap(x.emojiCatalog),...catalog};});
  function learn(root){
    for(const img of root.querySelectorAll('img[alt], img[title], img[data-emoji]')){
      const raw=(img.getAttribute('data-emoji') || img.getAttribute('alt') || img.getAttribute('title') || img.parentElement?.closest('[title]')?.getAttribute('title') || '').trim();
      const isPalette=img.closest('.emoji-item, .emoticon-item, .emoji-panel, .emoticon-panel, .emoticons-panel, .emoticons-content');
      const code=DanmakuEmoji.validCode(raw)?raw:isPalette && raw && raw.length<=40?'['+raw+']':'';
      const url=DanmakuEmoji.safeUrl(img.currentSrc || img.getAttribute('src') || img.getAttribute('data-src'));
      if(code && url && catalog[code]!==url){catalog[code]=url;dirty=true;}
      if(code && url)rememberScale(code,img,null);
    }
  }
  function readBody(body){
    if(!body)return '';
    function walk(node){
      if(node.nodeType===3)return node.textContent || '';
      if(node.nodeType!==1)return '';
      if(node.tagName==='IMG'){
        const label=node.getAttribute('alt') || node.getAttribute('title') || '';
        return label && !DanmakuEmoji.validCode(label)?'['+label+']':label;
      }
      return Array.from(node.childNodes).map(walk).join('');
    }
    return walk(body);
  }
  const send = m => life.call(()=>chrome.runtime.sendMessage(m));
  // Mark existing history before observing: only new messages are forwarded.
  document.querySelectorAll(selector).forEach(n=>seen.add(n));
  function collect(n) {
    if(life.stopped)return;
    if (seen.has(n)) return;
    const body = n.querySelector('.danmaku-content, .danmaku-item-content');
    learn(n);
    let text = (n.getAttribute('data-danmaku') || readBody(body)).trim();
    if (!text) return;
    const images=body?Array.from(body.querySelectorAll('img')):[];
    if(images.length===1 && !body.textContent.trim() && !DanmakuEmoji.validCode(text) && text.length<=40 && !text.includes('['))text='['+text+']';
    const codes=text.match(/\[[^\[\]\r\n]{1,40}\]/g) || [];
    if(codes.length && codes.length===images.length){
      images.forEach((img,i)=>{
        const url=DanmakuEmoji.safeUrl(img.currentSrc || img.getAttribute('src') || img.getAttribute('data-src'));
        if(url && catalog[codes[i]]!==url){catalog[codes[i]]=url;dirty=true;}
        if(url)rememberScale(codes[i],img,body);
      });
    }
    seen.add(n);
    const user = (n.querySelector('.user-name, .user-name-content')?.textContent || '').trim();
    const declared=body?.getAttribute('data-color') || n.getAttribute('data-color');
    let color=DanmakuEmoji.color(declared);
    if(!color && /^\d{1,8}$/.test(declared || ''))color=DanmakuEmoji.color(Number(declared));
    if(!color && body && typeof getComputedStyle==='function')color=DanmakuEmoji.color(getComputedStyle(body).color);
    pending.push({text,user,color:color || '#ffffff',_at:Date.now()});
    if (pending.length > 120) pending.shift();
    count++;
  }
  const observer=new MutationObserver(records=>{
    scanNeeded=true;
    for (const r of records) for (const n of r.addedNodes) {
      if (n.nodeType !== 1) {const parent=n.parentElement?.closest(selector);if(parent)collect(parent);continue;}
      if (n.matches(selector)) collect(n);
      n.querySelectorAll(selector).forEach(collect);
      const parent = n.closest(selector); if (parent) collect(parent);
    }
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
  life.onStop(()=>{observer.disconnect();pending=[];metadata.length=0;screenColors.clear();});
  life.every(()=>{
    if (pending.length) {
      scanScreenColors();
      // Chat DOM and decoded message events can arrive in either order.
      // Briefly hold unmatched rows instead of prematurely locking in white.
      let ready=0;
      while(ready<Math.min(30,pending.length)){
        const item=pending[ready];
        if(typeof window!=='undefined' && Date.now()-item._at<450 && !metadata.some(m=>matches(m,item)))break;
        ready++;
      }
      const items=pending.splice(0,ready).map(item=>{
        const index=metadata.findIndex(m=>matches(m,item));
        const meta=index>=0?metadata.splice(index,1)[0]:null;
        if(meta){
          item.color=meta.color;
          Object.assign(catalog,meta.emojis);Object.assign(scales,meta.emojiScales);
          if(Object.keys(meta.emojis).length)dirty=true;
        }else{
          const shown=screenColors.get(item.text);
          if(shown && Date.now()-shown.at<5000)item.color=shown.color;
        }
        const emojis=Object.create(null);
        const emojiScales=Object.create(null);
        for(const p of DanmakuEmoji.parts(item.text,catalog))if(p.url)emojis[p.text]=p.url;
        for(const code of Object.keys(emojis))if(scales[code]===1.8)emojiScales[code]=1.8;
        const { _at,...message }=item;
        return {...message,emojis,emojiScales};
      });
      if(items.length)send({type:'danmaku',items});
    }
  },150);
  learn(document);
  life.every(()=>{
    if(scanNeeded){learn(document);scanNeeded=false;}
    if(dirty){catalog=DanmakuEmoji.cleanMap(catalog);scales=DanmakuEmoji.cleanScales(scales);life.call(()=>chrome.storage.local.set({emojiCatalog:catalog,emojiScales:scales}));dirty=false;}
  },1000);
  const status = ()=>send({type:'status',count,ready:!!document.querySelector('#chat-items, .chat-history-list, .chat-history-panel, '+selector)});
  status(); life.every(status,5000);
})();
