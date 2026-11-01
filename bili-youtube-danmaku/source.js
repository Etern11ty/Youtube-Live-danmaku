(() => {
  const selector = '.chat-item.danmaku-item, .danmaku-item[data-danmaku], .chat-item[data-danmaku]';
  const seen = new WeakSet();
  let pending = [], count = 0;
  let catalog=Object.create(null),dirty=false,scanNeeded=true;
  chrome.storage.local.get('emojiCatalog').then(x=>{catalog={...DanmakuEmoji.cleanMap(x.emojiCatalog),...catalog};}).catch(()=>{});
  function learn(root){
    for(const img of root.querySelectorAll('img[alt], img[title], img[data-emoji]')){
      const raw=(img.getAttribute('data-emoji') || img.getAttribute('alt') || img.getAttribute('title') || img.parentElement?.closest('[title]')?.getAttribute('title') || '').trim();
      const isPalette=img.closest('.emoji-item, .emoticon-item, .emoji-panel, .emoticon-panel, .emoticons-panel, .emoticons-content');
      const code=DanmakuEmoji.validCode(raw)?raw:isPalette && raw && raw.length<=40?'['+raw+']':'';
      const url=DanmakuEmoji.safeUrl(img.currentSrc || img.getAttribute('src') || img.getAttribute('data-src'));
      if(code && url && catalog[code]!==url){catalog[code]=url;dirty=true;}
    }
  }
  function readBody(body){
    if(!body)return '';
    function walk(node){
      if(node.nodeType===3)return node.textContent || '';
      if(node.nodeType!==1)return '';
      if(node.tagName==='IMG')return node.getAttribute('alt') || node.getAttribute('title') || '';
      return Array.from(node.childNodes).map(walk).join('');
    }
    return walk(body);
  }
  const send = m => chrome.runtime.sendMessage(m).catch(()=>{});
  // Mark existing history before observing: only new messages are forwarded.
  document.querySelectorAll(selector).forEach(n=>seen.add(n));
  function collect(n) {
    if (seen.has(n)) return;
    const body = n.querySelector('.danmaku-content, .danmaku-item-content');
    learn(n);
    const text = (n.getAttribute('data-danmaku') || readBody(body)).trim();
    if (!text) return;
    const codes=text.match(/\[[^\[\]\r\n]{1,40}\]/g) || [];
    const images=body?Array.from(body.querySelectorAll('img')):[];
    if(codes.length && codes.length===images.length){
      images.forEach((img,i)=>{
        const url=DanmakuEmoji.safeUrl(img.currentSrc || img.getAttribute('src') || img.getAttribute('data-src'));
        if(url && catalog[codes[i]]!==url){catalog[codes[i]]=url;dirty=true;}
      });
    }
    seen.add(n);
    const user = (n.querySelector('.user-name, .user-name-content')?.textContent || '').trim();
    pending.push({text,user});
    if (pending.length > 120) pending.shift();
    count++;
  }
  new MutationObserver(records=>{
    scanNeeded=true;
    for (const r of records) for (const n of r.addedNodes) {
      if (n.nodeType !== 1) {const parent=n.parentElement?.closest(selector);if(parent)collect(parent);continue;}
      if (n.matches(selector)) collect(n);
      n.querySelectorAll(selector).forEach(collect);
      const parent = n.closest(selector); if (parent) collect(parent);
    }
  }).observe(document.documentElement,{childList:true,subtree:true});
  setInterval(()=>{
    if (pending.length) {
      const items=pending.splice(0,30).map(item=>{
        const emojis=Object.create(null);
        for(const p of DanmakuEmoji.parts(item.text,catalog))if(p.url)emojis[p.text]=p.url;
        return {...item,emojis};
      });
      send({type:'danmaku',items});
    }
  },150);
  learn(document);
  setInterval(()=>{
    if(scanNeeded){learn(document);scanNeeded=false;}
    if(dirty){catalog=DanmakuEmoji.cleanMap(catalog);chrome.storage.local.set({emojiCatalog:catalog}).catch(()=>{});dirty=false;}
  },1000);
  const status = ()=>send({type:'status',count,ready:!!document.querySelector('#chat-items, .chat-history-list, .chat-history-panel, '+selector)});
  status(); setInterval(status,5000);
})();
