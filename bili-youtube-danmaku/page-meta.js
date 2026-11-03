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
      if(!entry || typeof entry.url!=='string')return;
      if(!code){let hash=2166136261;for(let i=0;i<entry.url.length;i++){hash^=entry.url.charCodeAt(i);hash=Math.imul(hash,16777619);}code='img_'+(hash>>>0).toString(36);}
      code=code.startsWith('[')?code:'['+code+']';
      if(code.length>42)return;
      emojis[code]=entry.url.slice(0,2048);
      const unique=entry.emoticon_unique || entry.emotion_unique || '';
      if(unique && !unique.startsWith('emoji_'))emojiScales[code]=1.8;
    }
    for(const entry of head){
      if(!entry || typeof entry!=='object' || Array.isArray(entry))continue;
      if(entry.url)image(text,entry);
      for(const key of ['emoticon','emoticon_info','emoticon_data'])if(entry[key]?.url)image(text,entry[key]);
      let extra=entry;
      if(typeof entry.extra==='string'){
        try{extra=Reflect.apply(original,JSON,[entry.extra]);}catch{continue;}
      }
      if(extra.emots && typeof extra.emots==='object')for(const [code,e] of Object.entries(extra.emots).slice(0,32))image(code,e);
      for(const key of ['emoticon','emoticon_info','emoticon_data'])if(extra[key]?.url)image(text,extra[key]);
    }
    const wholeCode=text.startsWith('[')?text:'['+text+']';
    const renderText=emojis[wholeCode]?wholeCode:!text && Object.keys(emojis).length===1?Object.keys(emojis)[0]:text;
    window.postMessage({channel:'danmaku-bridge-meta-v1',text,renderText,user:String(info[2]?.[1] || '').slice(0,40),color:head[3],emojis,emojiScales},location.origin);
  }
  JSON.parse=function(...args){
    const result=Reflect.apply(original,this,args);
    if(typeof args[0]==='string' && args[0].includes('DANMU_MSG')){
      try{if(Array.isArray(result))result.slice(0,100).forEach(publish);else publish(result);}catch{}
    }
    return result;
  };
})();
