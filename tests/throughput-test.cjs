const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const base=require('node:path').resolve(__dirname,'../bili-youtube-danmaku')+'/';
function fixture(){
 let now=0,receive,tick;const animated=[];
 function node(){return {style:{},clientWidth:1000,clientHeight:600,append(...items){items.forEach(i=>i.parentElement=this);},attachShadow:()=>node(),replaceChildren(){},remove(){},getBoundingClientRect:()=>({width:200,height:36}),animate(frames){animated.push({text:this.textContent,frames,top:this.style.top});return {};}};}
 const player=node();player.querySelector=()=>true;
 const ctx=vm.createContext({URL,chrome:{runtime:{id:'test',onMessage:{addListener:f=>receive=f},sendMessage:()=>new Promise(()=>{})},storage:{local:{get:async()=>({})},onChanged:{addListener(){}}}},document:{querySelector:()=>player,createElement:node,createTextNode:text=>({textContent:text}),hidden:false},location:{href:'test'},setInterval:f=>tick=f,clearInterval(){},performance:{now:()=>now}});
 for(const file of ['emoji.js','lifecycle.js','layout.js','overlay.js'])vm.runInContext(fs.readFileSync(base+file,'utf8'),ctx);
 return {animated,send:items=>receive({type:'render',items},null,()=>{}),tick:time=>{now=time;tick();}};
}
const burst=fixture();burst.send(Array.from({length:30},(_,i)=>({text:'burst-'+i})));burst.tick(0);
assert.ok(burst.animated.length>1,'multiple comments must launch in the same tick');
const tops=burst.animated.map(x=>parseFloat(x.top));for(let i=1;i<tops.length;i++)assert.ok(tops[i]-tops[i-1]>=40,'batch must retain safe track spacing');
const bypass=fixture();bypass.send([{text:'[slow]',emojis:{'[slow]':'https://i0.hdslb.com/slow.png'}},{text:'plain text'}]);bypass.tick(0);
assert.equal(bypass.animated.length,1);assert.equal(bypass.animated[0].text,'plain text','waiting emoji must not block following text');
bypass.tick(1300);assert.equal(bypass.animated.length,2,'slow emoji eventually uses fallback');
console.log(`PASS: ${burst.animated.length} comments launched in one tick with safe lanes; slow emoji bypass and timeout fallback`);
