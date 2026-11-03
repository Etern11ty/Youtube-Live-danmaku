const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),zlib=require('node:zlib'),path=require('node:path');
const base=process.env.DANMAKU_BASE || path.resolve(__dirname,'../bili-youtube-danmaku');
const ctx=vm.createContext({URL,TextEncoder,TextDecoder,Uint8Array,DataView,Blob,DecompressionStream,AbortSignal,Date,console,setTimeout,clearTimeout,setInterval,clearInterval});
for(const file of ['emoji.js','direct.js'])vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),ctx);
const D=ctx.DanmakuDirect;
const md5=s=>crypto.createHash('md5').update(s).digest('hex');
// Signatures are checked with an independent permutation and Node crypto.
async function run(){
 for(const s of ['','a','abc','弹幕桥','x'.repeat(55),'y'.repeat(56),'z'.repeat(200)])assert.equal(D.md5(s),md5(s));
 for(const s of ['123',' 00123 ','https://live.bilibili.com/123?foo=bar','http://live.bilibili.com/blanc/123/'])assert.equal(D.roomInput(s),'123');
 for(const s of ['','0','-1','1e3','https://live.bilibili.com.evil.com/123','https://evil.com/123','https://live.bilibili.com/123/extra','https://u:p@live.bilibili.com/123','99999999999999999'])assert.throws(()=>D.roomInput(s));
 const images={img_url:'https://i.test/7cd084941338484aae1ad9425b84077c.png',sub_url:'https://i.test/4932caff0ff746eab6f01bf08b70ac45.png'};
 const signed=D.sign({foo:"a!b'c(d)*e",id:123,type:0},images,1700000000000);
 const q="foo=abcde&id=123&type=0&wts=1700000000";
 // Known WBI mixin for this public sample key pair.
 assert.equal(signed,q+'&w_rid='+md5(q+'ea1db124af3c7062474693fa704f4ff8'));
 const item=D.message({cmd:'DANMU_MSG',info:[[0,1,0,0xff3366,{extra:JSON.stringify({emots:{'[special]':{url:'https://i0.hdslb.com/a.png',emoticon_unique:'room_1'}}})}],'hey[special]',[1,'name']]});
 assert.equal(item.color,'#ff3366');assert.equal(item.emojis['[special]'],'https://i0.hdslb.com/a.png');assert.equal(item.emojiScales['[special]'],1.8);
 assert.equal(D.message({cmd:'DANMU_MSG',info:[[0,0,0,0,{url:'https://i0.hdslb.com/b.png'}],'face',[]]}).text,'[face]');
 const msg=Buffer.from(D.packet(JSON.stringify({cmd:'DANMU_MSG',info:[[0,0,0,16777215],'测试',[]]}),5));
 const zipped=zlib.deflateSync(msg),compressed=Buffer.alloc(16+zipped.length);compressed.writeUInt32BE(compressed.length);compressed.writeUInt16BE(16,4);compressed.writeUInt16BE(2,6);compressed.writeUInt32BE(5,8);zipped.copy(compressed,16);
 const got=[];await D.packets(new Uint8Array(compressed),(op,body)=>got.push([op,JSON.parse(new TextDecoder().decode(body)).info[1]]));assert.equal(got[0][1],'测试');
 await assert.rejects(()=>D.packets(new Uint8Array([0])));
 const calls=[];let step=0;
 ctx.fetch=async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>++step===1?{code:0,data:{room_id:123,live_status:1}}:step===2?{data:{wbi_img:images}}:{code:0,data:{token:'temporary',host_list:[{host:'broadcastlv.chat.bilibili.com',wss_port:443},{host:'evil.test',wss_port:443}]}}};};
 const result=await D.discover('123');assert.equal(result.hosts.length,1);assert.ok(calls.every(x=>x.options.credentials==='omit' && x.options.referrerPolicy==='no-referrer'));
 console.log('PASS: input validation, MD5/WBI signing, compressed packets, colors/emotes, anonymous discovery and host allowlist');
}
run().catch(e=>{console.error(e);process.exitCode=1});
