(() => {
  const life=new DanmakuLifecycle();
  const selector = '.chat-item.danmaku-item, .danmaku-item[data-danmaku], .chat-item[data-danmaku]';
  const seen = new WeakSet();
  const pendingNodes=new WeakMap();
  let pending = [], count = 0,lastMessageAt=0;
  let catalog=Object.create(null),dirty=false,scanNeeded=true;
  let scales=Object.create(null);
  const metadata=[];
  const screenColors=new Map();
  const normalizeText=text=>String(text || '').normalize('NFC').replace(/[\u200b-\u200d\ufeff]/g,'').replace(/\s+/g,' ').trim();
  const normalizeUser=user=>normalizeText(user).replace(/[:：]\s*$/,'');
  const matches=(m,item)=>Date.now()-m.at<8000 && (normalizeText(m.text)===normalizeText(item.text) || normalizeText(m.text)===normalizeText(item._raw) || normalizeText(m.renderText)===normalizeText(item.text) || '['+normalizeText(m.text)+']'===normalizeText(item.text)) && (!m.user || !item.user || normalizeUser(m.user)===normalizeUser(item.user));
  const onMetadata=event=>{
    if(life.stopped)return;
    const m=event.data;
    if(event.source!==window || event.origin!==location.origin || m?.channel!=='danmaku-bridge-meta-v1' || typeof m.text!=='string')return;
    const color=DanmakuEmoji.color(m.color);
    const emojis=DanmakuEmoji.cleanMap(m.emojis);
    if(!color && !Object.keys(emojis).length)return;
    metadata.push({text:m.text.trim().slice(0,200),renderText:typeof m.renderText==='string'?m.renderText.slice(0,200):'',user:String(m.user || '').trim().slice(0,40),color,emojis,emojiScales:DanmakuEmoji.cleanScales(m.emojiScales),at:Date.now()});
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
        const label=(node.getAttribute('alt') || node.getAttribute('title') || '').trim();
        const url=DanmakuEmoji.safeUrl(node.currentSrc || node.getAttribute('src') || node.getAttribute('data-src'));
        if(!url)return label && !DanmakuEmoji.validCode(label)?'['+label+']':label;
        let hash=2166136261;for(let i=0;i<url.length;i++){hash^=url.charCodeAt(i);hash=Math.imul(hash,16777619);}
        const code=DanmakuEmoji.validCode(label)?label:'[img_'+(hash>>>0).toString(36)+']';
        if(catalog[code]!==url){catalog[code]=url;dirty=true;}
        rememberScale(code,node,body);
        return code;
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
    const existing=pendingNodes.get(n);
    if (seen.has(n) && !existing) return;
    const body = n.querySelector('.danmaku-content, .danmaku-item-content');
    learn(n);
    const images=body?Array.from(body.querySelectorAll('img')):[];
    const raw=(n.getAttribute('data-danmaku') || '').trim();
    const rendered=readBody(body).trim();
    let text=(images.length && rendered?rendered:raw || rendered).trim();
    if (!text) return;
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
    const ownEmojis=Object.create(null),ownScales=Object.create(null);
    for(const part of DanmakuEmoji.parts(text,catalog))if(part.url){ownEmojis[part.text]=part.url;if(scales[part.text])ownScales[part.text]=scales[part.text];}
    const fields={text,user,color:color || '#ffffff',_raw:raw,_node:n,_emojis:ownEmojis,_scales:ownScales};
    if(existing){Object.assign(existing,fields);return;}
    const item={...fields,_at:Date.now()};pending.push(item);pendingNodes.set(n,item);
    if (pending.length > 120) pending.shift();
    count++;
    lastMessageAt=Date.now();
  }
  const observer=new MutationObserver(records=>{
    scanNeeded=true;
    for (const r of records) for (const n of r.addedNodes || []) {
      if (n.nodeType !== 1) {const parent=n.parentElement?.closest(selector);if(parent)collect(parent);continue;}
      if (n.matches(selector)) collect(n);
      n.querySelectorAll(selector).forEach(collect);
      const parent = n.closest(selector); if (parent) collect(parent);
    }
    for(const r of records)if(r.type==='attributes' || r.type==='characterData'){
      const node=r.target.nodeType===1?r.target:r.target.parentElement;
      const parent=node?.closest(selector);if(parent)collect(parent);
    }
  });
  observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['src','data-src','alt','title','data-danmaku']});
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
          if(meta.color)item.color=meta.color;
          if(meta.renderText && Object.keys(meta.emojis).length)item.text=meta.renderText;
          Object.assign(catalog,meta.emojis);Object.assign(scales,meta.emojiScales);
          if(Object.keys(meta.emojis).length)dirty=true;
        }else{
          const shown=screenColors.get(item.text);
          if(shown && Date.now()-shown.at<5000)item.color=shown.color;
        }
        const emojis=Object.create(null);
        const emojiScales=Object.create(null);
        const mappings={...catalog,...item._emojis,...meta?.emojis};
        const sizes={...scales,...item._scales,...meta?.emojiScales};
        for(const p of DanmakuEmoji.parts(item.text,mappings))if(p.url)emojis[p.text]=p.url;
        for(const code of Object.keys(emojis))if(sizes[code]===1.8)emojiScales[code]=1.8;
        pendingNodes.delete(item._node);
        const { _at,_node,_raw,_emojis,_scales,...message }=item;
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
  const status = ()=>send({type:'status',count,lastMessageAt,ready:!!document.querySelector('#chat-items, .chat-history-list, .chat-history-panel, '+selector)});
  status(); life.every(status,5000);
})();
