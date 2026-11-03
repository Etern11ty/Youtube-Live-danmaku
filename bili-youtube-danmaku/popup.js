const $=id=>document.getElementById(id);
const defaults={enabled:true,fontSize:28,opacity:85,duration:9,area:60,showUser:false,useColor:true};
let settings={...defaults};
let busy=false;
function modeUI(){const direct=$('mode').value==='direct';$('roomRow').hidden=!direct;$('sourceRow').hidden=direct;}
function inputRoom(){const t=$('room').value.trim();if(/^\d+$/.test(t))return String(Number(t));try{return String(Number(new URL(t).pathname.match(/^\/(?:blanc\/)?(\d+)\/?$/)?.[1]));}catch{return '';}}
async function call(message){const r=await chrome.runtime.sendMessage(message);if(!r?.ok)throw Error(r?.error||'操作失败');return r;}
function connectionButton(connected){
  $('bind').textContent=connected?'连接成功':'连接直播间';
  $('bind').disabled=connected;
  $('bind').setAttribute('aria-pressed',String(connected));
  $('unbind').disabled=!connected;
}
async function status(preferBinding=false){
  const id=Number($('target').value);const key='binding:'+id;
  const data=await chrome.storage.session.get(key),binding=data[key];
  if(busy)return;
  if(preferBinding && binding){$('mode').value=binding.mode || 'tab';if(binding.mode==='direct')$('room').value=binding.room;modeUI();}
  if(!binding){connectionButton(false);$('status').textContent=$('mode').value==='direct'?'选择 YouTube 页面，输入房间号或直播间链接后连接。':'请选择 YouTube 页面和 B 站直播间标签页，然后连接。';return;}
  if(binding.mode==='direct'){
    const key='direct-status:'+id;const s=(await chrome.storage.session.get(key))[key];
    const selected=$('mode').value==='direct' && inputRoom()===binding.room;
    const connected=s?.state==='connected' && Date.now()-s.at<60000;
    connectionButton(selected && connected);$('unbind').disabled=false;
    if(!selected){$('status').textContent=`当前仍在后台连接房间 ${binding.room}，点击连接可切换来源。`;return;}
    const labels={connecting:'正在连接',reconnecting:'正在重连',connected:'连接成功'};
    $('status').textContent=`${labels[s?.state] || '正在恢复连接'} · 房间 ${s?.room || binding.room}。`+(s?.detail?s.detail+'。':'')+`已收到 ${s?.count || 0} 条新弹幕。`;
    if(!connected){$('bind').textContent=s?.state==='reconnecting'?'重新连接':'连接中…';$('bind').disabled=s?.state!=='reconnecting';}return;
  }
  if($('mode').value!=='tab'){connectionButton(false);$('unbind').disabled=false;$('status').textContent=`当前仍绑定标签页房间 ${binding.room}，点击连接可切换为后台直连。`;return;}
  const k='status:'+binding.sourceId;
  const records=await chrome.storage.session.get(null);
  const frames=Object.entries(records).filter(([key,v])=>key.startsWith(k+':frame:') && Date.now()-v.at<20000).map(([,v])=>v);
  frames.sort((a,b)=>Number(b.ready)-Number(a.ready) || (b.lastMessageAt || 0)-(a.lastMessageAt || 0) || b.at-a.at);
  const s=frames[0] || records[k];
  const source=await chrome.tabs.get(binding.sourceId).catch(()=>null);
  if(!source || new URL(source.url).pathname.split('/')[1]!==binding.room){connectionButton(false);$('status').textContent='源直播间已关闭或切换，请重新连接。';return;}
  if(preferBinding)$('source').value=String(binding.sourceId);
  const selected=Number($('source').value)===binding.sourceId;
  connectionButton(selected);
  $('unbind').disabled=false;
  if(!selected){$('status').textContent=`当前仍绑定房间 ${binding.room}。点击连接直播间可切换到新选择的页面。`;return;}
  const context=s?.frameId?`已连接赛事页，当前内嵌房间 ${s.room || '未知'}。`:`已绑定房间 ${binding.room}。`;
  $('status').textContent=context+(!s||Date.now()-s.at>20000?'采集状态未更新，请刷新 B 站页面。':s.ready?`已检测到聊天区域，本次观察到 ${s.count} 条新弹幕。`:'等待聊天区域加载，请检查 B 站页面。');
}
async function init(){
  const saved=await chrome.storage.local.get(['settings','connectionMode','lastRoom']);
  settings={...defaults,...saved.settings};$('mode').value=saved.connectionMode==='tab'?'tab':'direct';$('room').value=saved.lastRoom || '';modeUI();
  const tabs=await chrome.tabs.query({});
  for(const [id,filter] of [['target',t=>t.url?.startsWith('https://www.youtube.com/')],['source',t=>/^https:\/\/live\.bilibili\.com\/\d+/.test(t.url||'')]]){
    const list=tabs.filter(filter);$(id).append(new Option(list.length?'请选择页面':'未找到页面，请先打开',''));
    list.forEach(t=>$(id).append(new Option(t.title||t.url,String(t.id))));
    const selected=list.find(t=>t.active)||list[0];if(selected)$(id).value=String(selected.id);
  }
  for(const key of Object.keys(defaults)){
    const input=$(key);if(typeof defaults[key]==='boolean')input.checked=settings[key];else{input.value=settings[key];$(key+'Value').textContent=settings[key];}
    input.addEventListener('input',async()=>{settings[key]=input.type==='checkbox'?input.checked:Number(input.value);if($(key+'Value'))$(key+'Value').textContent=input.value;await chrome.storage.local.set({settings});});
  }
  $('target').onchange=()=>status(true).catch(showError);
  $('source').onchange=()=>status().catch(showError);
  $('mode').onchange=async()=>{modeUI();await chrome.storage.local.set({connectionMode:$('mode').value});await status();};
  $('room').oninput=()=>status().catch(showError);
  $('bind').onclick=async()=>{
    try{
      if(!$('target').value)throw Error('请先打开并选择 YouTube 页面。');
      if($('mode').value==='tab' && !$('source').value)throw Error('请先打开并选择 B 站直播间标签页。');
      busy=true;$('bind').disabled=true;$('status').textContent='正在连接…';
      if($('mode').value==='direct')await call({type:'bind-direct',target:Number($('target').value),room:$('room').value});
      else await call({type:'bind',target:Number($('target').value),source:Number($('source').value)});
      await chrome.storage.local.set({connectionMode:$('mode').value,lastRoom:$('room').value.trim()});
      busy=false;await status();
    }catch(e){busy=false;connectionButton(false);showError(e);}
  };
  $('unbind').onclick=async()=>{try{await call({type:'unbind',target:Number($('target').value)});await status();}catch(e){showError(e);}};
  $('demo').onclick=async()=>{try{await call({type:'demo',target:Number($('target').value)});$('status').textContent='已发送测试弹幕。若未显示，请刷新 YouTube 页面并确认弹幕开关已打开。';}catch(e){showError(Error('测试未送达，请打开视频并刷新 YouTube 页面：'+e.message));}};
  await status(true);setInterval(()=>status().catch(()=>{}),5000);
}
function showError(e){$('status').textContent=e.message;}
init().catch(showError);
