const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const base=path.resolve(__dirname,'../bili-youtube-danmaku');
let receive,tick,now=0,width=390,height=220,available=true;
const animations=[],created=[];
function node(){
 const style={getPropertyValue:k=>style[k] || '',getPropertyPriority:()=>'',setProperty:(k,v)=>style[k]=v,removeProperty:k=>delete style[k]};
 return {style,children:[],get clientWidth(){return width},get clientHeight(){return height},append(...items){for(const i of items){i.parentElement=this;this.children.push(i)}},attachShadow(){return node()},replaceChildren(){this.children=[]},remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(x=>x!==this);this.parentElement=null},getBoundingClientRect:()=>({width:140,height:30}),animate(frames){animations.push({frames,text:this.textContent});return {}}};
}
let parent=node();const original=parent;
const video={get parentElement(){return parent},closest:()=>null};
const container={querySelector:()=>available?video:null};
const doc={hidden:false,querySelector:s=>s==='#player-container-id'?container:null,createElement(){const n=node();created.push(n);return n},createTextNode:text=>({textContent:text})};
const ctx=vm.createContext({URL,document:doc,location:{href:'https://m.youtube.com/watch?v=a'},getComputedStyle:e=>({position:e.style.position || 'static'}),performance:{now:()=>now},setInterval:f=>tick=f,clearInterval(){},chrome:{runtime:{id:'test',onMessage:{addListener:f=>receive=f},sendMessage:async()=>({})},storage:{local:{get:async()=>({})},onChanged:{addListener(){}}}}});
for(const f of ['youtube.js','emoji.js','lifecycle.js','layout.js','overlay.js'])vm.runInContext(fs.readFileSync(path.join(base,f),'utf8'),ctx);
function send(text){let reply;receive({type:'render',items:[{text}]},null,r=>reply=r);assert.equal(reply.ok,true);}
send('portrait');tick();assert.equal(original.style.position,'relative');assert.equal(animations.length,1);assert.equal(animations[0].frames[0].transform,'translateX(390px)');
width=844;height=390;now+=30;tick();send('landscape');now+=30;tick();assert.equal(animations.at(-1).frames[0].transform,'translateX(844px)');
parent=node();send('replacement');now+=30;tick();assert.equal(original.style.position,undefined,'restore original parent positioning');assert.equal(original.children.length,0,'remove detached overlay');assert.equal(parent.style.position,'relative');
const full=node();full.contains=v=>v===video;doc.fullscreenElement=full;send('fullscreen');now+=30;tick();assert.equal(full.children.length,1);assert.equal(parent.style.position,undefined);
available=false;now+=30;tick();assert.equal(full.children.length,0);assert.equal(full.style.position,undefined);
console.log('PASS: mobile overlay mount, portrait/landscape bounds, replaced player, container fullscreen and style cleanup');
