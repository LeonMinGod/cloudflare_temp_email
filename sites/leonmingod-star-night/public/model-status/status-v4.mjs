import { providerKey, compareProviders, compareModels, compareAccounts, stateRank } from './order-v1.mjs';
const $=id=>document.getElementById(id);
const BRANDS={all:{name:'全部厂商',icon:'◈'},codex:{name:'OpenAI / Codex',icon:'◉'},claude:{name:'Claude',icon:'✳'},antigravity:{name:'Antigravity',icon:'▲'},gemini:{name:'Gemini',icon:'✦'},xai:{name:'xAI / Grok',icon:'𝕏'},openai:{name:'OpenAI API',icon:'◉'},qwen:{name:'通义千问',icon:'◇'},other:{name:'其他',icon:'◌'}};
const labels={ready:'正常',cooldown:'冷却中',error:'异常',disabled:'已停用',unknown:'未观测'};
const brand=value=>BRANDS[providerKey(value)]||{name:value,icon:'◌'};
const modelState=row=>row.ready?'ready':row.cooldown?'cooldown':row.error?'error':row.disabled?'disabled':'unknown';
const date=value=>{const t=Date.parse(value||'');return Number.isFinite(t)?new Date(t).toLocaleString('zh-CN',{hour12:false,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'未上报';};
const when=value=>{const remaining=Date.parse(value||'')-Date.now();if(!Number.isFinite(remaining))return '';if(remaining<=0)return '待更新';const hours=Math.ceil(remaining/3600000);return hours>=24?`${Math.ceil(hours/24)} 天后`:`约 ${hours} 小时后`;};
let data,view='models',provider=null,busy=false,controller,timer,nextRefresh=0,toastTimer;
const quotaBusy=new Set();
function element(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
function badge(state){const node=element('span',labels[state]||labels.unknown,'badge');node.dataset.state=state;return node;}
function notify(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{$('toast').hidden=true;},4500);}
function matchesProvider(row){return provider==='all'||(row.providers||[row.provider]).some(p=>providerKey(p)===provider);}
function matches(row){const search=$('search').value.trim().toLowerCase(),state=$('state-filter').value;return matchesProvider(row)&&(!state||(view==='models'?modelState(row):row.state)===state)&&(!search||`${row.id} ${row.masked_email||''} ${brand(row.provider||'').name}`.toLowerCase().includes(search));}
function renderProviders(){
  const list=new Map();for(const row of data.providers){const key=providerKey(row.provider);list.set(key,(list.get(key)||0)+row.total);}
  for(const key of ['codex','claude','antigravity','gemini','xai'])if(!list.has(key))list.set(key,0);
  if(provider===null)provider=list.get('codex')?'codex':data.providers[0]?providerKey(data.providers[0].provider):'all';
  const items=[['all',data.totals.total],...[...list].sort((a,b)=>compareProviders(a[0],b[0]))];
  $('provider-tabs').replaceChildren(...items.map(([key,count])=>{
    const item=element('button',undefined,'provider-tab');item.type='button';item.dataset.provider=key;item.setAttribute('aria-pressed',String(provider===key));
    item.append(element('span',brand(key).icon,'provider-icon'),element('span',brand(key).name),element('span',String(count),'provider-count'));
    item.addEventListener('click',()=>{provider=key;renderProviders();render();});return item;
  }));
}
function history(rows,slots=20,isAccount=false){
  const line=element('div',undefined,'history');line.setAttribute('role','img');line.setAttribute('aria-label',isAccount?'近期真实请求记录':'模型可用性检查记录');
  const values=rows.slice(-slots),pad=slots-values.length;
  for(let i=0;i<slots;i++){
    const tick=element('i'),row=values[i-pad];
    if(row){
      let state=row.state;
      if(isAccount){const total=row.success+row.failed;state=total?row.failed?row.success?'mixed':'error':'ready':'unknown';if(state==='mixed')tick.style.setProperty('--failure',`${row.failed/total*100}%`);}
      tick.dataset.state=state;tick.title=isAccount?`${row.time} · 成功 ${row.success} / 失败 ${row.failed}`:`${date(row.at)} · ${labels[row.state]}`;
    }else tick.title='未记录';line.append(tick);
  }
  return line;
}
function usageFor(row){
  const rows=(row.usage||[]).filter(x=>provider==='all'||providerKey(x.provider)===provider),sum={success:0,failed:0,ttft_ms:0,ttft_samples:0,output_tokens:0,output_ms:0},buckets=new Map();
  for(const x of rows){sum.success+=x.success;sum.failed+=x.failed;for(const field of ['ttft_ms','ttft_samples','output_tokens','output_ms'])sum[field]+=x.recent_summary?.[field]||0;
    for(const bucket of x.recent||[]){const b=buckets.get(bucket.at)||{at:bucket.at,success:0,failed:0};b.success+=bucket.success;b.failed+=bucket.failed;buckets.set(bucket.at,b);}}
  const end=Math.floor(Date.parse(data.model_metrics_updated_at||data.updated_at)/300000)*300000;
  const recent=Array.from({length:60},(_,i)=>{const stamp=new Date(end-(59-i)*300000).toISOString(),b=buckets.get(stamp);return {time:date(stamp),success:b?.success||0,failed:b?.failed||0};});
  return {...sum,total:sum.success+sum.failed,recent};
}
function modelCard(row){
  const metric=usageFor(row),available=data.model_metrics_available,card=element('article',undefined,'card model-card'),heading=element('div',undefined,'card-heading'),title=element('div');card.dataset.model=row.id;
  title.append(element('h2',row.id,'card-title'),element('p',`厂商：${row.providers.map(p=>brand(p).name).join(' / ')}`,'card-meta'));
  if(available)title.append(element('p',`${metric.total.toLocaleString('zh-CN')} 次总调用`,'model-total'));
  heading.append(title,badge(modelState(row)));card.append(heading);
  const numbers=element('div',undefined,'model-numbers');for(const [name,value] of [['成功率',available&&metric.total?`${(metric.success/metric.total*100).toFixed(1)}%`:'—'],['成功',available?metric.success.toLocaleString('zh-CN'):'—'],['失败',available?metric.failed.toLocaleString('zh-CN'):'—']]){const node=element('div');node.append(element('span',name),element('strong',String(value)));numbers.append(node);}card.append(numbers);
  card.append(history(metric.recent,60,true));const note=element('div',undefined,'history-note');note.append(element('span','过去 5 小时 · 每格 5 分钟'),element('span','现在'));card.append(note);
  const performance=element('div',undefined,'model-performance');
  const stat=(label,value)=>{const line=element('p');line.append(element('span',label),element('strong',value));return line;};
  performance.append(stat('近期平均首字延迟',metric.ttft_samples?`${(metric.ttft_ms/metric.ttft_samples/1000).toFixed(2)} s`:'暂无样本'),stat('近期平均输出速度',metric.output_ms?`${(metric.output_tokens/metric.output_ms*1000).toFixed(1)} token/s`:'暂无样本'));card.append(performance);
  const foot=element('div',undefined,'model-foot');foot.append(element('p',`可用凭证 ${row.ready} · 冷却 ${row.cooldown} · 关联 ${row.total}`));
  if(row.retry_at)foot.append(element('p',`最早冷却结束：${date(row.retry_at)} · ${when(row.retry_at)}`));
  if(!available)foot.append(element('p','调用统计暂时不可用，稍后自动更新。'));
  else if(data.model_metrics_stale)foot.append(element('p',`调用数据暂未更新 · 上次 ${date(data.model_metrics_updated_at)}`));
  card.append(foot);return card;
}
function quotaWindow(row){
  const box=element('div',undefined,'quota-window'),heading=element('div',undefined,'window-heading');heading.append(element('span',row.label),element('span','剩余'));box.append(heading);
  const value=element('div',undefined,'window-value');value.append(element('strong',`${row.remaining}%`));
  if(row.reset_at)value.append(element('span',`${date(row.reset_at)} 重置`),element('span',when(row.reset_at)));else value.append(element('span','重置时间未上报'));box.append(value);
  const meter=element('div',undefined,'meter');meter.dataset.level=row.remaining<=5?'empty':row.remaining<40?'low':'normal';meter.setAttribute('role','progressbar');meter.setAttribute('aria-valuemin','0');meter.setAttribute('aria-valuemax','100');meter.setAttribute('aria-valuenow',String(row.remaining));meter.setAttribute('aria-label',`${row.label}剩余`);meter.style.setProperty('--value',`${Math.min(100,Math.max(0,row.remaining))}%`);meter.append(element('span'));box.append(meter);return box;
}
const quotaErrorMessage=code=>code==='authorization_unavailable'?'额度查询暂未授权，已暂停重试；不影响其他凭证。':code==='upstream_busy'?'上游暂时限流，请等待下次可刷新时间。':code==='not_observed'?'上游没有返回可用额度，保留上次数据。':'上游暂未响应，保留上次数据。';
function accountCard(row){
  const card=element('article',undefined,'card account-card');card.dataset.account=row.id;
  const heading=element('div',undefined,'card-heading'),title=element('div'),name=element('h2',undefined,'card-title account-title');
  name.append(element('span',brand(row.provider).icon,'provider-icon'),element('span',row.masked_email||`${brand(row.provider).name} · ${row.id.toUpperCase()}`));
  title.append(name,element('p',`${brand(row.provider).name} · 凭证 ${row.id.toUpperCase()} · ${row.models??'—'} 个模型`,'card-meta'));heading.append(title,badge(row.state));card.append(heading);
  const requests=element('div',undefined,'request-line'),totals=element('span');totals.append(element('b',`成功 ${row.success??0}`),element('em',`失败 ${row.failed??0}`));requests.append(element('span','请求记录'),totals);card.append(requests,history(row.recent_requests||[],20,true));
  const historyNote=element('div',undefined,'history-note');historyNote.append(element('span','每格 10 分钟 · 无请求为灰色'),element('span',row.success_rate===null?'暂无请求':`成功率 ${row.success_rate}%`));card.append(historyNote);
  const box=element('div',undefined,'quota-box'),quota=row.quota||{},planLine=element('p',undefined,'plan-line');
  const plan=element('span');plan.append(document.createTextNode('套餐 '),element('strong',quota.plan||'未上报'));planLine.append(plan);
  if(quota.renew_at)planLine.append(element('span',`续期 ${date(quota.renew_at)} · ${when(quota.renew_at)}`));
  if(typeof quota.credits==='number')planLine.append(element('span',`Credit 余额 ${quota.credits}`));
  if(quota.pay_as_you_go)planLine.append(element('span',quota.pay_as_you_go.enabled?`按量付费 · 封顶 $${quota.pay_as_you_go.cap_usd}`:'按量付费 未启用'));
  if(typeof quota.prepaid_usd==='number'&&quota.prepaid_usd>0)planLine.append(element('span',`预付余额 $${quota.prepaid_usd.toFixed(2)}`));
  box.append(planLine);
  if(quota.windows?.length)for(const window of quota.windows)box.append(quotaWindow(window));
  else box.append(element('p',row.state==='disabled'?'凭证已停用，自动更新不查询其上游额度。':quota.supported?(quota.observed_at?'上游未提供可量化的剩余额度。':'尚未查询额度，点击下方按钮读取。'):'该厂商暂未提供可读取的额度。','unobserved'));
  if(quota.product_usage?.length){const breakdown=element('div',undefined,'quota-breakdown');breakdown.append(element('p','用量明细（共享配额）'));for(const row of quota.product_usage){const line=element('div');line.append(element('span',row.product),element('strong',`使用 ${row.used_percent}%`));breakdown.append(line);}box.append(breakdown);}
  if(row.retry_at)box.append(element('p',`调度冷却至 ${date(row.retry_at)} · ${when(row.retry_at)}`,'card-meta'));
  if(quota.error)box.append(element('p',quotaErrorMessage(quota.error),'quota-error'));
  const footer=element('div',undefined,'quota-footer'),age=element('span',quota.observed_at?`${quota.source==='live'?'主动查询':'最近观测'} ${date(quota.observed_at)}`:'未查询额度','quota-age');
  const button=element('button',undefined,'quota-refresh');button.type='button';button.dataset.quotaId=row.id;button.dataset.next=quota.next_refresh_at||'';button.dataset.supported=String(Boolean(quota.supported));
  button.addEventListener('click',()=>refreshQuota(row.id));footer.append(age,button);box.append(footer);card.append(box);return card;
}
function sortRows(rows,mode){
  const order=$('sort').value,common=mode==='models'?compareModels:compareAccounts,count=row=>mode==='models'?usageFor(row).total:(row.success||0)+(row.failed||0);
  return [...rows].sort((a,b)=>{
    if(order==='name')return a.id.localeCompare(b.id,undefined,{numeric:true});
    if(order==='requests')return count(b)-count(a)||common(a,b);
    if(order==='quota'&&mode==='accounts')return (a.quota?.windows?.[0]?.remaining??101)-(b.quota?.windows?.[0]?.remaining??101)||common(a,b);
    if(order==='status')return stateRank[a.state||modelState(a)]-stateRank[b.state||modelState(b)]||common(a,b);
    return common(a,b);
  });
}
function render(){
  if(!data)return;
  const allAccounts=data.accounts.filter(matchesProvider),allModels=data.models.filter(matchesProvider),success=allAccounts.reduce((n,a)=>n+(a.success||0),0),failed=allAccounts.reduce((n,a)=>n+(a.failed||0),0);
  $('total').textContent=String(allAccounts.length);$('ready').textContent=String(allAccounts.filter(a=>a.state==='ready').length);
  $('ready-note').textContent=`${allAccounts.filter(a=>a.state==='cooldown').length} 冷却 · ${allAccounts.filter(a=>a.state==='disabled').length} 停用`;
  $('account-note').textContent=provider==='all'?'全部厂商凭证':brand(provider).name;
  if(view==='models'&&data.model_metrics_available){const usage=allModels.map(usageFor),ok=usage.reduce((n,x)=>n+x.success,0),bad=usage.reduce((n,x)=>n+x.failed,0);$('success-rate').textContent=ok+bad?`${(ok/(ok+bad)*100).toFixed(1)}%`:'—';$('success-note').textContent=`累计 ${ (ok+bad).toLocaleString('zh-CN')} 次模型调用`;}else{$('success-rate').textContent=success+failed?`${(success/(success+failed)*100).toFixed(1)}%`:'—';$('success-note').textContent=`累计 ${success+failed} 次账号请求`;}
  $('model-count').textContent=String(allModels.length);$('model-coverage').textContent=data.models_partial?'部分模型列表暂未读取':'按真实凭证模型列表汇总';
  $('accounts-count').textContent=String(allAccounts.length);$('models-count').textContent=String(allModels.length);$('updated').textContent=`最后更新：${date(data.updated_at)}`;
  const accounts=sortRows(data.accounts.filter(matches),'accounts'),models=sortRows(data.models.filter(matches),'models');
  $('accounts-cards').replaceChildren(...(view==='accounts'?accounts.map(accountCard):[]));$('models-cards').replaceChildren(...(view==='models'?models.map(modelCard):[]));
  $('accounts-empty').hidden=accounts.length>0;$('accounts-empty').textContent='没有符合筛选条件的凭证。';$('models-empty').hidden=models.length>0;
  $('result-count').textContent=view==='accounts'?`${accounts.length} 个凭证`:`${models.length} 个模型`;
  $('sort').querySelector('[value=quota]').disabled=view==='models';
  $('method-note').textContent='状态每分钟共享更新；账号额度最多每 5 分钟查一次。页面隐藏时暂停更新。'+(data.model_stats_since?` 调用统计自 ${date(data.model_stats_since)} 开始，按上游执行次数计数（含重试）；近期性能来自最近 5 小时成功的流式请求，灰色表示无请求。`:'');
  updateCountdown();
}
function updateCountdown(){
  if(document.hidden)return;
  const remaining=Math.max(0,Math.ceil((nextRefresh-Date.now())/1000));$('refresh').disabled=busy||remaining>0;
  $('refresh-countdown').textContent=busy?'正在更新…':remaining?`${remaining} 秒后可刷新`:'可刷新 · 每分钟更新';
  for(const button of document.querySelectorAll('[data-quota-id]')){
    const left=Math.max(0,Math.ceil((Date.parse(button.dataset.next||'')-Date.now())/1000))||0,id=button.dataset.quotaId;
    button.disabled=quotaBusy.has(id)||left>0||button.dataset.supported!=='true';
    button.textContent=quotaBusy.has(id)?'正在查询…':left?`${left} 秒后可刷新`:button.dataset.supported==='true'?'↻ 刷新额度':'暂无额度接口';
  }
}
async function refreshQuota(id){
  if(quotaBusy.has(id))return;
  const row=data?.accounts.find(x=>x.id===id);if(!row||Date.parse(row.quota?.next_refresh_at||'')>Date.now())return;
  quotaBusy.add(id);updateCountdown();
  try{
    const response=await fetch(`/api/pool-status/quota?id=${encodeURIComponent(id)}`,{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(25000)}),body=await response.json();
    if(!response.ok)throw new Error(body.error||'额度暂时查询失败。');
    if(body.id!==id||!Array.isArray(body.quota?.windows))throw new Error('额度返回格式不正确。');
    row.quota=body.quota;notify(body.quota.error?quotaErrorMessage(body.quota.error):'额度已更新。');render();
  }catch(error){notify(error.name==='TimeoutError'?'查询超时，请稍后再试。':error.message);}
  finally{quotaBusy.delete(id);updateCountdown();}
}
async function refresh(){
  if(busy||document.hidden||Date.now()<nextRefresh)return;
  busy=true;updateCountdown();controller?.abort();controller=new AbortController();const timeout=setTimeout(()=>controller?.abort(),25000);
  try{
    const response=await fetch('/api/pool-status',{credentials:'omit',cache:'no-store',signal:controller.signal}),snapshot=await response.json();
    if(!response.ok){nextRefresh=Date.now()+Math.max(60,Number(snapshot.retry_after)||60)*1000;throw new Error(snapshot.error||'暂时无法读取号池。');}
    if(!Array.isArray(snapshot.models)||!Array.isArray(snapshot.accounts)||!Array.isArray(snapshot.providers))throw new Error('状态返回格式不正确。');
    data=snapshot;nextRefresh=Date.now()+Math.max(60,Number(snapshot.refresh_after)||60)*1000;renderProviders();render();
    $('status-note').dataset.error=String(Boolean(snapshot.stale));$('status-note').textContent=snapshot.stale?'连接暂时波动，正在显示上次成功读取的数据。':`● 已连接号池 · ${snapshot.totals.total} 个凭证 · ${snapshot.models.length} 个模型 · 切换厂商不触发额外查询`;
  }catch(error){if(error.name!=='AbortError'||!document.hidden){$('status-note').dataset.error='true';$('status-note').textContent=error instanceof TypeError?'网络连接暂时失败，请稍后刷新。':error.name==='AbortError'?'读取超时，将稍后重试。':error.message;}if(!data){$('accounts-empty').textContent='暂未读取到号池，请稍后刷新。';}nextRefresh=Math.max(nextRefresh,Date.now()+60000);}
  finally{clearTimeout(timeout);busy=false;updateCountdown();}
}
for(const mode of ['accounts','models'])$(mode+'-tab').addEventListener('click',()=>{
  view=mode;for(const type of ['accounts','models']){$(type+'-tab').setAttribute('aria-selected',String(type===mode));$(type+'-view').hidden=type!==mode;}
  $('search').value='';$('search').placeholder=mode==='models'?'搜索模型名称…':'搜索脱敏邮箱或凭证编号…';render();
});
for(const field of ['state-filter','sort'])$(field).addEventListener('change',render);$('search').addEventListener('input',render);$('refresh').addEventListener('click',refresh);
try{if(localStorage.getItem('lmg-pool-theme')==='dark')document.documentElement.dataset.theme='dark';}catch{}
$('theme').addEventListener('click',()=>{const dark=document.documentElement.dataset.theme!=='dark';document.documentElement.dataset.theme=dark?'dark':'light';try{localStorage.setItem('lmg-pool-theme',dark?'dark':'light');}catch{}});
function startTimer(){clearInterval(timer);timer=setInterval(()=>{if(document.hidden)return;updateCountdown();if(!busy&&Date.now()>=nextRefresh)void refresh();},1000);}
startTimer();document.addEventListener('visibilitychange',()=>{if(document.hidden)controller?.abort();else{updateCountdown();if(Date.now()>=nextRefresh)void refresh();}});
window.addEventListener('pagehide',()=>{clearInterval(timer);controller?.abort();});window.addEventListener('pageshow',startTimer);
void refresh();
