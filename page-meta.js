// Observe already-decoded live messages; do not change requests, sockets or results.
(() => {
  const original=JSON.parse;
  function publish(value){
    if(!value || typeof value.cmd!=='string' || !value.cmd.startsWith('DANMU_MSG') || !Array.isArray(value.info))return;
    const info=value.info, head=info[0];
    if(!Array.isArray(head) || typeof info[1]!=='string')return;
    const emojis={},emojiScales={};
    const text=info[1].slice(0,200);
    function image(code,entry){
      if(!entry || typeof entry.url!=='string' || !code)return;
      code=code.startsWith('[')?code:'['+code+']';
      if(code.length>42)return;
      emojis[code]=entry.url.slice(0,2048);
      const unique=entry.emoticon_unique || entry.emotion_unique || '';
      if(unique && !unique.startsWith('emoji_'))emojiScales[code]=1.8;
    }
    for(const entry of head){
      if(!entry || typeof entry!=='object' || Array.isArray(entry))continue;
      if(entry.url)image(text,entry);
      let extra=entry;
      if(typeof entry.extra==='string'){
        try{extra=Reflect.apply(original,JSON,[entry.extra]);}catch{continue;}
      }
      if(extra.emots && typeof extra.emots==='object')for(const [code,e] of Object.entries(extra.emots).slice(0,32))image(code,e);
    }
    window.postMessage({channel:'danmaku-bridge-meta-v1',text,user:String(info[2]?.[1] || '').slice(0,40),color:head[3],emojis,emojiScales},location.origin);
  }
  JSON.parse=function(...args){
    const result=Reflect.apply(original,this,args);
    if(typeof args[0]==='string' && args[0].includes('DANMU_MSG')){
      try{if(Array.isArray(result))result.slice(0,100).forEach(publish);else publish(result);}catch{}
    }
    return result;
  };
})();
