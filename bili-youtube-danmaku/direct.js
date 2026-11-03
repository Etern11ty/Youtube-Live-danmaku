// Anonymous Bilibili connection protocol. All code runs locally in the extension.
globalThis.DanmakuDirect=(()=>{
  function roomInput(value){
    const text=String(value || '').trim();let room=text;
    if(!/^\d+$/.test(text)){
      let url;try{url=new URL(text);}catch{throw Error('请输入房间号或完整的 B 站直播间链接。');}
      if(!['https:','http:'].includes(url.protocol) || url.hostname!=='live.bilibili.com' || url.username || url.password || url.port)throw Error('仅支持 live.bilibili.com 直播间链接。');
      room=url.pathname.match(/^\/(?:blanc\/)?(\d+)\/?$/)?.[1] || '';
    }
    if(!/^\d{1,16}$/.test(room) || !Number.isSafeInteger(Number(room)) || Number(room)<1)throw Error('房间号无效，请检查直播间链接。');
    return String(Number(room));
  }
  function md5(text){
    const bytes=new TextEncoder().encode(text),n=Math.ceil((bytes.length+9)/64)*64,b=new Uint8Array(n);b.set(bytes);b[bytes.length]=128;
    const view=new DataView(b.buffer);view.setUint32(n-8,bytes.length*8,true);
    const shifts=[7,12,17,22,5,9,14,20,4,11,16,23,6,10,15,21];
    let a0=0x67452301,b0=0xefcdab89,c0=0x98badcfe,d0=0x10325476;
    for(let off=0;off<n;off+=64){let a=a0,bv=b0,c=c0,d=d0;
      for(let i=0;i<64;i++){let f,g;if(i<16){f=(bv&c)|(~bv&d);g=i;}else if(i<32){f=(d&bv)|(~d&c);g=(5*i+1)%16;}else if(i<48){f=bv^c^d;g=(3*i+5)%16;}else{f=c^(bv|~d);g=(7*i)%16;}
        const sum=(a+f+Math.floor(Math.abs(Math.sin(i+1))*4294967296)+view.getUint32(off+g*4,true))|0;
        const s=shifts[Math.floor(i/16)*4+i%4],old=d;d=c;c=bv;bv=(bv+((sum<<s)|(sum>>>(32-s))))|0;a=old;
      }a0=(a0+a)|0;b0=(b0+bv)|0;c0=(c0+c)|0;d0=(d0+d)|0;
    }
    return [a0,b0,c0,d0].map(x=>[0,8,16,24].map(s=>((x>>>s)&255).toString(16).padStart(2,'0')).join('')).join('');
  }
  const perm=[46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];
  function sign(params,images,now=Date.now()){
    const key=['img_url','sub_url'].map(k=>(images?.[k] || '').split('/').pop().split('.')[0]).join('');
    if(key.length!==64)throw Error('无法获取匿名连接签名，请稍后重试。');
    const mix=perm.map(i=>key[i]).join('').slice(0,32);
    const p={...params,wts:Math.floor(now/1000)};
    const q=Object.keys(p).sort().map(k=>encodeURIComponent(k)+'='+encodeURIComponent(String(p[k]).replace(/[!'()*]/g,''))).join('&');
    return q+'&w_rid='+md5(q+mix);
  }
  function packet(body,op){
    const data=new TextEncoder().encode(typeof body==='string'?body:JSON.stringify(body)),out=new Uint8Array(16+data.length),v=new DataView(out.buffer);
    v.setUint32(0,out.length);v.setUint16(4,16);v.setUint16(6,1);v.setUint32(8,op);v.setUint32(12,1);out.set(data,16);return out;
  }
  async function packets(bytes,visit,depth=0){
    if(depth>2 || bytes.length>4194304)throw Error('弹幕数据包超出限制');
    const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    for(let p=0;p<bytes.length;){
      if(p+16>bytes.length)throw Error('弹幕数据包不完整');
      const len=v.getUint32(p),head=v.getUint16(p+4),ver=v.getUint16(p+6),op=v.getUint32(p+8);
      if(head<16 || len<head || p+len>bytes.length)throw Error('弹幕数据包无效');
      const body=bytes.slice(p+head,p+len);p+=len;
      if(ver===2){
        const reader=new Blob([body]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();const chunks=[];let size=0;
        try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4194304)throw Error('弹幕解压数据超出限制');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
        const plain=new Uint8Array(size);let i=0;for(const chunk of chunks){plain.set(chunk,i);i+=chunk.length;}await packets(plain,visit,depth+1);
      }else if(ver===0 || ver===1){await visit(op,body);}else throw Error('不支持的弹幕压缩格式');
    }
  }
  function message(value){
    if(!value?.cmd?.startsWith('DANMU_MSG') || !Array.isArray(value.info))return null;
    const info=value.info,head=info[0];if(!Array.isArray(head) || typeof info[1]!=='string')return null;
    let text=info[1].slice(0,200);const emojis={},emojiScales={};
    const image=(code,entry)=>{
      const url=DanmakuEmoji.safeUrl(entry?.url);if(!url)return;
      if(!code)code='img_'+md5(url).slice(0,12);
      code=code.startsWith('[')?code:'['+code+']';if(!DanmakuEmoji.validCode(code))return;
      emojis[code]=url;const unique=entry.emoticon_unique || entry.emotion_unique || '';
      if(unique && !unique.startsWith('emoji_'))emojiScales[code]=1.8;
    };
    for(const e of head){if(!e || typeof e!=='object' || Array.isArray(e))continue;
      if(e.url)image(text,e);
      let extra=e;if(typeof e.extra==='string'){try{extra=JSON.parse(e.extra);}catch{extra={};}}
      for(const obj of [e,extra]){
        for(const k of ['emoticon','emoticon_info','emoticon_data'])if(obj?.[k]?.url)image(text,obj[k]);
        for(const [code,img] of Object.entries(obj?.emots || {}).slice(0,32))image(code,img);
      }
    }
    const whole=text.startsWith('[')?text:'['+text+']';if(emojis[whole])text=whole;else if(!text && Object.keys(emojis).length===1)text=Object.keys(emojis)[0];
    return text?{text,user:String(info[2]?.[1] || '').slice(0,40),color:DanmakuEmoji.color(head[3]) || '#ffffff',emojis,emojiScales}:null;
  }
  async function json(url){
    const response=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('B 站接口请求失败（'+response.status+'）');return response.json();
  }
  async function discover(input){
    const room=roomInput(input);
    const init=await json('https://api.live.bilibili.com/room/v1/Room/room_init?id='+room);
    if(init.code!==0 || !init.data?.room_id)throw Error('直播间不存在或暂时无法访问（'+init.code+'）');
    const real=init.data.room_id;
    const nav=await json('https://api.bilibili.com/x/web-interface/nav');
    const q=sign({id:real,type:0},nav.data?.wbi_img);
    const conf=await json('https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo?'+q);
    if(conf.code!==0 || !conf.data?.token)throw Error('匿名弹幕接口暂不可用（'+conf.code+'），可改用绑定标签页。');
    const hosts=(conf.data.host_list || []).filter(h=>typeof h.host==='string' && /^(?:[a-z0-9-]+\.)*chat\.bilibili\.com$/i.test(h.host) && Number.isInteger(h.wss_port) && h.wss_port>0 && h.wss_port<=65535);
    if(!hosts.length)throw Error('未获取到有效的弹幕服务器');
    return {room:String(real),token:conf.data.token,hosts,live:init.data.live_status};
  }
  class Connection{
    constructor(input,callbacks){this.input=input;this.cb=callbacks;this.stopped=false;this.tries=0;this.count=0;this.lastMessageAt=0;this.run();}
    state(state,detail=''){if(!this.stopped){this.lastStateAt=Date.now();this.cb.status({state,detail,room:this.room || this.input,count:this.count,lastMessageAt:this.lastMessageAt,at:Date.now()});}}
    stop(){this.stopped=true;clearTimeout(this.retry);clearTimeout(this.deadline);clearInterval(this.beat);if(this.ws){this.ws.onclose=null;this.ws.close();this.ws=null;}}
    async run(){
      if(this.stopped)return;this.state(this.tries?'reconnecting':'connecting');
      try{
        const c=await discover(this.input);if(this.stopped)return;this.room=c.room;this.live=c.live;
        const host=c.hosts[this.tries%c.hosts.length];const ws=this.ws=new WebSocket(`wss://${host.host}:${host.wss_port}/sub`);ws.binaryType='arraybuffer';
        this.deadline=setTimeout(()=>{this.error='连接超时';ws.close();},15000);
        let chain=Promise.resolve(),backlog=0;
        ws.onopen=()=>{if(this.stopped)return;ws.send(packet({uid:0,roomid:Number(c.room),protover:2,platform:'web',type:2,key:c.token},7));};
        ws.onmessage=e=>{
          if(this.stopped || this.ws!==ws)return;
          if(++backlog>100){this.error='接收队列拥堵，重新连接';ws.close();return;}
          chain=chain.then(async()=>{
            if(this.stopped || this.ws!==ws)return;
            await packets(new Uint8Array(e.data),async(op,body)=>{
              if(this.stopped || this.ws!==ws)return;
              if(op===8){const auth=JSON.parse(new TextDecoder().decode(body));if(auth.code!==0)throw Error('弹幕鉴权失败（'+auth.code+'）');
                clearTimeout(this.deadline);this.tries=0;this.lastResponse=Date.now();this.state('connected',this.live===1?'':'当前房间未在直播，等待新弹幕');
                ws.send(packet('',2));this.beat=setInterval(()=>{if(Date.now()-this.lastResponse>55000){this.error='心跳超时';ws.close();}else if(ws.readyState===1)ws.send(packet('',2));},20000);
              }else if(op===3){this.lastResponse=Date.now();this.state('connected',this.live===1?'':'当前房间未在直播，等待新弹幕');}
              else if(op===5){const item=message(JSON.parse(new TextDecoder().decode(body)));if(item){this.count++;this.lastMessageAt=Date.now();this.cb.message(item);if(Date.now()-this.lastStateAt>=1000)this.state('connected');}}
            });
          }).catch(e=>{this.error=e.message;ws.close();}).finally(()=>backlog--);
        };
        ws.onerror=()=>{this.error='弹幕服务器连接失败';};
        ws.onclose=()=>{clearTimeout(this.deadline);clearInterval(this.beat);this.ws=null;this.schedule(this.error || '连接已断开');};
      }catch(e){this.schedule(e.message);}
    }
    schedule(detail){if(this.stopped)return;this.error='';this.tries++;this.state('reconnecting',detail);this.retry=setTimeout(()=>this.run(),Math.min(60000,2000*2**Math.min(this.tries-1,5)));}
  }
  return {roomInput,md5,sign,packet,packets,message,discover,Connection};
})();
