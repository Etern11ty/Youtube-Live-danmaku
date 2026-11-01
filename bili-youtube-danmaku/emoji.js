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
  function cleanScales(input){
    const out=Object.create(null);
    for(const [code,value] of Object.entries(input || {}).slice(0,400))if(validCode(code) && (value===1.7 || value===1.8))out[code]=1.8;
    return out;
  }
  function color(value){
    if(typeof value==='number' && Number.isInteger(value) && value>=0 && value<=0xffffff)return '#'+value.toString(16).padStart(6,'0');
    if(typeof value!=='string')return '';
    const s=value.trim();
    if(/^#[0-9a-f]{6}$/i.test(s))return s.toLowerCase();
    if(/^#[0-9a-f]{3}$/i.test(s))return '#'+s.slice(1).split('').map(c=>c+c).join('').toLowerCase();
    const match=s.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(?:1|1\.0+))?\s*\)$/i);
    if(match && match.slice(1).every(c=>Number(c)<=255))return '#'+match.slice(1).map(c=>Number(c).toString(16).padStart(2,'0')).join('');
    return '';
  }
  globalThis.DanmakuEmoji={safeUrl,validCode,cleanMap,parts,cleanScales,color};
})();
