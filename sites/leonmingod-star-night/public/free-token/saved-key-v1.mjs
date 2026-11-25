import { readSavedKey } from './verify-flow-v2.mjs';
import { installCcSwitch } from './ccswitch-v1.mjs';

let dialog,base,key,status;
function field(tag,text,className){const element=document.createElement(tag);if(text!==undefined)element.textContent=text;if(className)element.className=className;return element;}
function credentials(){const saved=readSavedKey();return saved?{baseUrl:saved.baseUrl||'https://cpa-dhke.onrender.com/v1',apiKey:saved.key}:null;}
function createViewer(){
  dialog=field('dialog',undefined,'saved-key-modal');dialog.setAttribute('aria-labelledby','saved-local-key-title');
  const close=field('button','×','saved-key-close');close.type='button';close.setAttribute('aria-label','关闭保存的 Key');close.addEventListener('click',()=>dialog.close());
  const title=field('h2','本浏览器保存的 API Key');title.id='saved-local-key-title';
  dialog.append(close,title,field('p','这是之前保存在当前浏览器里的 Key。','saved-key-description'));
  base=field('input');base.id='saved-local-base';base.readOnly=true;base.setAttribute('aria-label','保存的接口地址');
  key=field('textarea');key.id='saved-local-secret';key.readOnly=true;key.rows=3;key.spellcheck=false;key.setAttribute('aria-label','保存的 API Key');
  for(const [label,input,kind] of [['接口地址 · Base URL',base,'url'],['专属 API Key',key,'key']]){
    const labelNode=field('label',label);labelNode.htmlFor=input.id;
    const row=field('div',undefined,'saved-key-row'),copy=field('button','复制');copy.type='button';copy.dataset.savedCopy=kind;copy.addEventListener('click',()=>copyValue(kind));row.append(input,copy);dialog.append(labelNode,row);
  }
  const all=field('button','复制地址与 Key','saved-key-primary');all.type='button';all.dataset.savedCopy='all';all.addEventListener('click',()=>copyValue('all'));
  const cc=field('button','接入 CC Switch','ccswitch-entry');cc.type='button';
  status=field('p','','saved-key-status');status.setAttribute('role','status');dialog.append(all,cc,status);document.body.append(dialog);
  installCcSwitch({button:cc,ownerDialog:dialog,readCredentials:()=>({baseUrl:base.value,apiKey:key.value})});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});
}
async function copyValue(kind){
  const text=kind==='url'?base.value:kind==='key'?key.value:`Base URL: ${base.value}\nAPI Key: ${key.value}`;
  try{await navigator.clipboard.writeText(text);status.textContent='已复制。';}
  catch{const input=kind==='url'?base:key;input.focus();input.select();status.textContent='请长按或使用 Ctrl+C 复制。';}
}
function showViewer(){const value=credentials();if(!value){refresh();return;}if(!dialog)createViewer();base.value=value.baseUrl;key.value=value.apiKey;status.textContent='';if(!dialog.open)dialog.showModal();}
const entries=[...document.querySelectorAll('[data-saved-key-entry]')];
function refresh(){
  const exists=Boolean(credentials()),victory=document.querySelector('.arena')?.classList.contains('victory')||document.getElementById('reward-secret')?.hidden===false;
  for(const entry of entries){const hidden=!exists||(entry.hasAttribute('data-victory-only')&&!victory);if(entry.hidden!==hidden)entry.hidden=hidden;}
}
for(const entry of entries)entry.addEventListener('click',showViewer);
window.addEventListener('storage',refresh);window.addEventListener('pageshow',refresh);
window.addEventListener('pagehide',()=>{dialog?.close();if(base)base.value='';if(key)key.value='';});
const arena=document.querySelector('.arena'),reward=document.getElementById('reward-secret');
if(arena)new MutationObserver(refresh).observe(arena,{attributes:true,attributeFilter:['class']});
if(reward)new MutationObserver(refresh).observe(reward,{attributes:true,attributeFilter:['hidden']});
refresh();
