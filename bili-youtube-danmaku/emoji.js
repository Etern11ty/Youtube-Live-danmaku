(() => {
  const safeUrl=value=>{
    try {
      const u=new URL(value,'https://live.bilibili.com');
      if(!/(^|\.)hdslb\.com$/.test(u.hostname) || !['https:','http:'].includes(u.protocol) || u.username || u.password)return '';
      u.protocol='https:';return u.href;
    }catch{return '';}
  };
  const validCode=value=>typeof value==='string' && /^\[[^\[\]\r\n]{1,40}\]$/.test(value);
  function cleanMap(input){
    const out=Object.create(null);
    for(const [code,value] of Object.entries(input || {}).slice(0,400)){
      const url=safeUrl(value);if(validCode(code) && url)out[code]=url;
    }
    return out;
  }
  function parts(text,map){
    return String(text).split(/(\[[^\[\]\r\n]{1,40}\])/g).filter(Boolean).map(text=>({text,url:validCode(text)?safeUrl(map?.[text]):''}));
  }
  globalThis.DanmakuEmoji={safeUrl,validCode,cleanMap,parts};
})();
