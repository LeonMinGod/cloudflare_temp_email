import { passiveQuota, parseQuota, quotaProbe, quotaProbes } from './pool-quota.js';
import { attachModelUsage, mergeModelUsage } from './pool-metrics.js';
import { loadPoolCache, savePoolCache } from './pool-storage.js';
import { compareModels, compareAccounts, compareProviders } from '../public/model-status/order-v1.mjs';

const ORIGIN='https://public-cpa.leonmingod.com';
export const REFRESH_MS=300_000, QUOTA_MS=300_000, CHECKPOINT_MS=900_000, STALE_MS=1_800_000;
const CONTROL='pool-status-control-v1', BUDGET_KEY='ops:do-write-budget:v1', DAILY_CACHE_WRITES=10_000;
const PROVIDERS=new Set(['codex','antigravity','gemini','gemini-cli','claude','anthropic','aistudio','vertex','openai','qwen','iflow','kiro','copilot','xai','grok']);
const number=value=>Number.isFinite(Number(value))&&Number(value)>=0?Number(value):0;
const timestamp=value=>{const n=Date.parse(value||'');return Number.isFinite(n)&&n>0?n:0;};
const safeModel=value=>typeof value==='string'&&value.length<=256&&value.trim()&&!/[\u0000-\u001f\u007f@]/u.test(value);
const providerOf=file=>{const p=String(file.provider||file.type||'').toLowerCase();return PROVIDERS.has(p)?p:'other';};
const stateOf=row=>row.ready?'ready':row.cooldown?'cooldown':row.error?'error':row.disabled?'disabled':'unknown';
const counts=()=>({total:0,ready:0,cooldown:0,disabled:0,error:0,unknown:0});

export function maskAccountEmail(file){
  const raw=typeof file.email==='string'?file.email:typeof file.account==='string'?file.account:'';
  if(raw.length>254||!/^[-\w.+%]+@[-\w.]+\.[a-z]{2,}$/i.test(raw))return null;
  const [local,domain]=raw.split('@'),suffix=domain.slice(domain.lastIndexOf('.'));
  return `${local[0]}***${local.length>3?local.at(-1):''}@${domain[0]}***${suffix.toLowerCase()}`;
}

export function accountState(file,now){
  if(file.disabled||file.status==='disabled')return 'disabled';
  const active=(Array.isArray(file.cooldowns)?file.cooldowns:[]).filter(x=>timestamp(x.retry_at)>now);
  if(timestamp(file.next_retry_after)>now||active.some(x=>x.scope!=='model'))return 'cooldown';
  if(file.unavailable)return active.length?'cooldown':'error';
  if(file.status==='error')return 'error';
  return ['active','ready'].includes(file.status)?'ready':'unknown';
}
export async function accountId(file,secret,index=0){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`pool-account-v1\n${file.id||file.name||index}`));
  return Array.from(new Uint8Array(signature).slice(0,4),x=>x.toString(16).padStart(2,'0')).join('');
}
function recentRequests(file){
  return (Array.isArray(file.recent_requests)?file.recent_requests:[]).slice(-20).map((row,index)=>({
    time:typeof row.time==='string'&&/^[\dTZ :+.\-/]{1,50}$/.test(row.time)?row.time:`时间段 ${index+1}`,
    success:number(row.success),failed:number(row.failed),
  }));
}
export async function summarizePool(files,inventory,secret,now=Date.now()){
  const accounts=[],modelMap=new Map(),providers=new Map(),totals=counts();let successful=0,failed=0;
  for(let index=0;index<files.length;index++){
    const file=files[index],provider=providerOf(file),state=accountState(file,now),id=await accountId(file,secret,index);
    const cooldowns=(Array.isArray(file.cooldowns)?file.cooldowns:[]).filter(x=>timestamp(x.retry_at)>now);
    const retry=Math.max(timestamp(file.next_retry_after),...cooldowns.map(x=>timestamp(x.retry_at)),0),models=inventory[index];
    const success=number(file.success),errors=number(file.failed);
    accounts.push({id,provider,state,masked_email:maskAccountEmail(file),models:Array.isArray(models)?models.length:null,cooldown_models:cooldowns.filter(x=>x.scope==='model').length,
      retry_at:retry?new Date(retry).toISOString():null,quota:passiveQuota(file,now),success,failed:errors,success_rate:success+errors?Math.round(success/(success+errors)*1000)/10:null,recent_requests:recentRequests(file)});
    totals.total++;totals[state]++;successful+=success;failed+=errors;
    if(!providers.has(provider))providers.set(provider,{provider,...counts()});
    providers.get(provider).total++;providers.get(provider)[state]++;
    if(!Array.isArray(models))continue;
    for(const model of new Set(models.filter(safeModel))){
      if(!modelMap.has(model))modelMap.set(model,{id:model,...counts(),providers:new Set(),retry_at:null});
      const row=modelMap.get(model),blocked=cooldowns.find(x=>x.scope==='model'&&x.model_key===model);
      const stateForModel=state==='ready'&&blocked?'cooldown':state;
      row.total++;row[stateForModel]++;row.providers.add(provider);
      if(blocked&&(!row.retry_at||timestamp(blocked.retry_at)<timestamp(row.retry_at)))row.retry_at=new Date(timestamp(blocked.retry_at)).toISOString();
    }
  }
  return {schema:1,updated_at:new Date(now).toISOString(),stale:false,totals,successful,failed,stats_scope:'account',model_metrics_available:false,
    models_partial:inventory.some(x=>!Array.isArray(x)),providers:[...providers.values()].sort((a,b)=>compareProviders(a.provider,b.provider)),
    models:[...modelMap.values()].map(row=>({...row,providers:[...row.providers].sort(compareProviders)})).sort(compareModels),
    accounts:accounts.sort(compareAccounts)};
}

async function management(path,env,fetcher,signal,body){
  const options={method:body?'POST':'GET',headers:{Authorization:`Bearer ${env.CPA_STATUS_MANAGEMENT_KEY}`,Accept:'application/json'},redirect:'manual',signal};
  if(body){options.headers['Content-Type']='application/json';options.body=JSON.stringify(body);}
  const response=await fetcher(`${ORIGIN}/v8/management/${path}`,options);
  if(!response.ok)throw Object.assign(new Error('CPA status unavailable'),{status:response.status,managementAuth:[401,403].includes(response.status),code:`CPA_HTTP_${response.status}`});
  const reader=response.body.getReader(),chunks=[];let length=0;
  for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>4*1024*1024){await reader.cancel();throw new Error('CPA_RESPONSE_TOO_LARGE');}chunks.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
const publicError=error=>[401,403].includes(error?.status)?'authorization_unavailable':error?.status===429?'upstream_busy':error?.message==='QUOTA_NO_DATA'?'not_observed':'temporarily_unavailable';

// One coordination atom for this one CPA pool, outside the model data path.
// Uses a dedicated named object in the existing namespace, not any game run.
export class PoolStatusCoordinator{
  constructor(ctx,env,{fetcher=(url,options)=>fetch(url,options),clock=()=>Date.now()}={}){
    this.ctx=ctx;this.env=env;this.fetcher=fetcher;this.clock=clock;this.pending=null;this.quotaPending=new Map();this.files=[];this.filesAt=0;
    this.ready=Promise.all([loadPoolCache(ctx.storage,parts=>{this.persistedParts=parts;}),ctx.storage.get('pool-status-kind'),ctx.storage.get(CONTROL)]).then(([value,kind,control])=>{
      this.cache=value||{snapshot:null,next:0,failures:0,inventories:{},quotas:{},history:{}};
      this.control=control||{};this.lastCheckpoint=control?.checkpointAt||0;
      if(control?.gates){Object.assign(this.cache,control.gates);delete this.cache.quotaNext;
        for(const [id,next] of Object.entries(control.gates.quotaNext||{}))this.cache.quotas[id]={next,value:this.cache.quotas[id]?.value||{windows:[],supported:true}};}
      if(control?.origin!==ORIGIN){
        this.cache.next=0;this.cache.metricsNext=0;this.cache.managementBlockedUntil=0;this.cache.failures=0;
        for(const row of Object.values(this.cache.quotas))row.next=0;
      }
      this.isPool=kind==='pool';
    });
  }
  async budgetState(){
    const now=this.clock();
    if(now<(this.budgetNext||0))return this.lowWriteMode;
    if(this.budgetPending)return this.budgetPending;
    this.budgetNext=now+REFRESH_MS;
    this.budgetPending=(async()=>{
      let value=null;
      try{if(this.env.KV){const raw=await this.env.KV.get(BUDGET_KEY);value=typeof raw==='string'?JSON.parse(raw):raw;}}catch{}
      this.lowWriteMode=Boolean(value&&value.expires>now&&['conserve','critical'].includes(value.level));
      return this.lowWriteMode;
    })().finally(()=>{this.budgetPending=null;});
    return this.budgetPending;
  }
  persist({checkpoint=false}={}){
    const now=this.clock(),json=checkpoint&&this.cache.snapshot?JSON.stringify(this.cache):null;
    const gates={next:this.cache.next||0,metricsNext:this.cache.metricsNext||0,managementBlockedUntil:this.cache.managementBlockedUntil||0,
      quotaNext:Object.fromEntries(Object.entries(this.cache.quotas).map(([id,row])=>[id,row.next]))};
    this.persistQueue=(this.persistQueue||Promise.resolve()).catch(()=>{}).then(async()=>{
      const day=new Date(now).toISOString().slice(0,10),spent=this.control.day===day?this.control.writes||0:0;
      let full=Boolean(json&&!this.lowWriteMode&&(!this.lastCheckpoint||now-this.lastCheckpoint>=CHECKPOINT_MS));
      const upper=full?Math.ceil(json.length/24000)+(this.persistedParts?.length||0)+1:0;
      if(spent+upper+1>DAILY_CACHE_WRITES)full=false;
      if(!full&&this.control.origin===ORIGIN&&this.control.day===day&&JSON.stringify(this.control.gates)===JSON.stringify(gates))return;
      if(spent+1>DAILY_CACHE_WRITES)return;
      const control={origin:ORIGIN,gates,day,writes:spent+(full?upper:0)+1,checkpointAt:full?now:this.lastCheckpoint};
      if(full){let parts;
        await this.ctx.storage.transaction(async tx=>{await tx.put(CONTROL,control);parts=await savePoolCache({transaction:callback=>callback(tx)},json,this.persistedParts);});
        this.persistedParts=parts;this.lastCheckpoint=now;
      }else await this.ctx.storage.put(CONTROL,control);
      this.control=control;
    });
    return this.persistQueue;
  }
  async credentials(signal){
    const now=this.clock();if(this.files.length&&now-this.filesAt<REFRESH_MS)return this.files;
    if(now<(this.cache.managementBlockedUntil||0))throw Object.assign(new Error('Management backoff'),{status:401});
    if(!this.filesPending)this.filesPending=(async()=>{
      try{
        const body=await management('credentials',this.env,this.fetcher,signal);
        if(!Array.isArray(body.files))throw new Error('CPA_INVALID_STATUS');
        this.files=body.files.slice(0,500);this.filesAt=now;return this.files;
      }catch(error){if([401,403].includes(error.status)){this.cache.managementBlockedUntil=now+900_000;await this.persist();}throw error;}
    })().finally(()=>{this.filesPending=null;});
    return this.filesPending;
  }
  async quota(file,id){
    const now=this.clock(),probe=quotaProbe(file),cached=this.cache.quotas[id];
    if(!probe)return passiveQuota(file,now);
    if(now<(this.cache.managementBlockedUntil||0))return {...(cached?.value||passiveQuota(file,now)),error:'authorization_unavailable',next_refresh_at:new Date(this.cache.managementBlockedUntil).toISOString()};
    if(this.quotaPending.has(id))return this.quotaPending.get(id);
    if(cached&&now<cached.next)return {...cached.value,next_refresh_at:new Date(cached.next).toISOString()};
    const job=(async()=>{
      const entry={next:now+QUOTA_MS,value:cached?.value||passiveQuota(file,now)};
      this.cache.quotas[id]=entry;await this.persist();
      try{
        const probes=quotaProbes(file),responses=await Promise.allSettled(probes.map(async({key,request})=>{
          const response=await management('requests/api-call',this.env,this.fetcher,AbortSignal.timeout(12_000),request);
          if(response.status_code!==200)throw Object.assign(new Error('Quota upstream unavailable'),{status:response.status_code});
          return {key,body:typeof response.body==='string'?JSON.parse(response.body):response.body};
        }));
        const denied=responses.find(x=>x.status==='rejected'&&x.reason.managementAuth);
        if(denied)throw denied.reason;
        const values=responses.filter(x=>x.status==='fulfilled').map(x=>x.value);
        if(!values.length)throw responses.find(x=>x.status==='rejected').reason;
        const raw=probes.length===1?values[0].body:Object.fromEntries(values.map(x=>[x.key,x.body]));
        entry.value={...parseQuota(providerOf(file),raw,now),renew_at:passiveQuota(file,now).renew_at};
      }catch(error){
        entry.value={...entry.value,error:publicError(error)};
        if([401,403].includes(error.status))entry.next=now+900_000;
        if(error.managementAuth)this.cache.managementBlockedUntil=now+900_000;
      }
      await this.persist();return {...entry.value,next_refresh_at:new Date(entry.next).toISOString()};
    })();
    this.quotaPending.set(id,job);
    try{return await job;}finally{this.quotaPending.delete(id);}
  }
  async modelMetrics(){
    if(this.metricsPending)return this.metricsPending;
    const now=this.clock();
    if(now<(this.cache.metricsNext||0)||now<(this.cache.managementBlockedUntil||0))return;
    this.metricsPending=(async()=>{
      this.cache.metricsNext=now+REFRESH_MS;await this.persist();
      try{
        if(this.env.KV){try{
          const raw=await this.env.KV.get('ops:cpa-model-usage-before-deploy:v1');
          const backup=typeof raw==='string'?JSON.parse(raw):raw;
          if(backup?.captured_at&&this.cache.importedUsageBackup!==backup.captured_at){
            this.cache.modelUsage=mergeModelUsage(this.cache.modelUsage,backup.body,now);
            this.cache.importedUsageBackup=backup.captured_at;
          }
        }catch{}}
        const usage=await management('observability/usage/models',this.env,this.fetcher,AbortSignal.timeout(12_000));
        this.cache.modelUsage=mergeModelUsage(this.cache.modelUsage,usage,now);
        if(this.cache.snapshot)attachModelUsage(this.cache.snapshot,this.cache.modelUsage,now);
      }catch(error){
        this.cache.metricsNext=now+([401,403].includes(error.status)?900_000:REFRESH_MS);
        if(error.managementAuth)this.cache.managementBlockedUntil=now+900_000;
      }
      await this.persist({checkpoint:true});
    })().finally(()=>{this.metricsPending=null;});
    return this.metricsPending;
  }
  async schedule(){
    if(this.scheduled)return;
    if(!this.isPool){await this.ctx.storage.put('pool-status-kind','pool');this.isPool=true;}
    const now=this.clock(),paused=await this.budgetState();
    const target=paused?Date.parse(new Date(now).toISOString().slice(0,10)+'T00:00:00Z')+86400000:Math.max(now+REFRESH_MS,this.cache.metricsNext||0,this.cache.managementBlockedUntil||0);
    const existing=await this.ctx.storage.getAlarm?.();
    if(!existing||existing<=now||existing>target)await this.ctx.storage.setAlarm(target);
    this.scheduled=true;
  }
  async alarm(){
    await this.ready;
    try{if(!await this.budgetState())await this.modelMetrics();}finally{this.scheduled=false;await this.schedule();}
  }
  async collect(){
    const now=this.clock();this.cache.next=now+REFRESH_MS;await this.persist();
    try{
      const signal=AbortSignal.timeout(18_000),files=await this.credentials(signal),inventory=new Array(files.length).fill(null);
      const ids=await Promise.all(files.map((f,i)=>accountId(f,this.env.FREE_TOKEN_OPS_SECRET,i)));
      let next=0,fatal;
      await Promise.all(Array.from({length:Math.min(3,files.length)},async()=>{
        while(!fatal&&!signal.aborted&&next<Math.min(32,files.length)){
          const i=next++,cached=this.cache.inventories[ids[i]];
          if(cached&&now-cached.at<QUOTA_MS){inventory[i]=cached.models;continue;}
          if(typeof files[i].name!=='string')continue;
          try{
            const body=await management(`credentials/models?name=${encodeURIComponent(files[i].name)}`,this.env,this.fetcher,signal);
            if(Array.isArray(body.models)){inventory[i]=body.models.map(x=>x.id).filter(safeModel);this.cache.inventories[ids[i]]={at:now,models:inventory[i]};}
          }catch(error){if([401,403].includes(error.status))fatal=error;else if(cached)inventory[i]=cached.models;}
        }
      }));
      if(fatal)throw fatal;
      const snapshot=await summarizePool(files,inventory,this.env.FREE_TOKEN_OPS_SECRET,now);
      await this.modelMetrics();
      attachModelUsage(snapshot,this.cache.modelUsage,now);
      // Automatic quota probes are limited to active supported accounts. Disabled
      // accounts stay disabled and never create recurring upstream quota traffic.
      const candidates=files.map((file,i)=>({file,id:ids[i]})).filter(x=>accountState(x.file,now)==='ready'&&quotaProbe(x.file)).slice(0,4);
      await Promise.all(candidates.map(({file,id})=>this.quota(file,id)));
      for(const account of snapshot.accounts){
        const cached=this.cache.quotas[account.id];
        if(cached){const observed=account.quota;account.quota={...cached.value,next_refresh_at:new Date(cached.next).toISOString()};
          if(timestamp(observed.observed_at)>timestamp(account.quota.observed_at)&&observed.windows.length)account.quota={...observed,next_refresh_at:account.quota.next_refresh_at};}
      }
      for(const model of snapshot.models){
        const history=this.cache.history[model.id]||[];
        history.push({at:new Date(now).toISOString(),state:stateOf(model)});model.history=history.slice(-60);this.cache.history[model.id]=model.history;
      }
      const valid=new Set(ids);for(const id of Object.keys(this.cache.quotas))if(!valid.has(id))delete this.cache.quotas[id];
      const validModels=new Set(snapshot.models.map(x=>x.id));for(const id of Object.keys(this.cache.history))if(!validModels.has(id))delete this.cache.history[id];
      this.cache.snapshot=snapshot;this.cache.failures=0;this.cache.next=now+REFRESH_MS;await this.persist({checkpoint:true});
    }catch(error){
      console.warn(JSON.stringify({event:'pool_refresh_failure',status:error?.status||0,code:error?.code||'POOL_REFRESH_FAILED'}));
      this.cache.failures++;this.cache.next=this.clock()+([401,403].includes(error.status)?900_000:Math.min(900_000,REFRESH_MS*2**Math.min(this.cache.failures-1,4)));
      if(error.managementAuth)this.cache.managementBlockedUntil=this.clock()+900_000;
      this.cache.lastError=publicError(error);await this.persist();
    }
  }
  reply(status,body){return Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Pool-Abuse-Exempt':'read-only-status'}});}
  async fetch(request){
    await this.ready;const {kind,id,peek}=await request.json();
    if(!peek)await this.budgetState();
    if(!peek)await this.schedule();
    if(kind==='quota'){
      if(!/^[a-f0-9]{8}$/.test(id||''))return this.reply(400,{error:'账号编号不正确。'});
      if(peek){const row=this.cache.quotas[id];return this.reply(row?200:404,row?{id,quota:{...row.value,next_refresh_at:new Date(row.next).toISOString()}}:{error:'额度尚未读取。'});}
      const files=await this.credentials(AbortSignal.timeout(10_000));
      let selected;for(let i=0;i<files.length;i++)if(await accountId(files[i],this.env.FREE_TOKEN_OPS_SECRET,i)===id){selected=files[i];break;}
      if(!selected)return this.reply(404,{error:'账号不存在或已移除。'});
      const value=await this.quota(selected,id);
      if(this.cache.snapshot){const account=this.cache.snapshot.accounts.find(x=>x.id===id);if(account&&JSON.stringify(account.quota)!==JSON.stringify(value)){account.quota=value;await this.persist();}}
      return this.reply(200,{id,quota:value});
    }
    if(!peek&&this.clock()>=this.cache.next){
      if(!this.pending)this.pending=this.collect().finally(()=>{this.pending=null;});
      await this.pending;
    }else if(this.pending)await this.pending;
    const snapshot=this.cache.snapshot,now=this.clock();
    if(!snapshot||now-timestamp(snapshot.updated_at)>STALE_MS)return this.reply(503,{error:'号池暂时无法连接，请稍后再试。',retry_after:Math.max(1,Math.ceil((this.cache.next-now)/1000))});
    return this.reply(200,{...snapshot,stale:now-timestamp(snapshot.updated_at)>REFRESH_MS,refresh_after:Math.max(1,Math.ceil((this.cache.next-now)/1000)),quota_cooldown_seconds:QUOTA_MS/1000,checkpoint_interval_seconds:CHECKPOINT_MS/1000});
  }
}

export async function handlePoolStatus(request,env){
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Pool-Abuse-Exempt':'read-only-status'};
  const reply=(status,body)=>new Response(request.method==='HEAD'?null:JSON.stringify(body),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8',...(status===405?{Allow:'GET, HEAD'}:{})}});
  if(!['GET','HEAD'].includes(request.method))return reply(405,{error:'Method not allowed'});
  if(!env.CPA_STATUS_MANAGEMENT_KEY||!env.FREE_TOKEN_OPS_SECRET||!env.GAME_RUNS)return reply(503,{error:'号池状态正在连接，请稍后查看。'});
  const url=new URL(request.url),kind=url.pathname.endsWith('/quota')?'quota':'snapshot',id=url.searchParams.get('id');
  if(kind==='quota'&&!/^[a-f0-9]{8}$/.test(id||''))return reply(400,{error:'账号编号不正确。'});
  try{
    const stub=env.GAME_RUNS.get(env.GAME_RUNS.idFromName('pool-status-cache-v2'));
    const response=await stub.fetch('https://pool.internal/pool-status',{method:'POST',body:JSON.stringify({kind,id,peek:request.method==='HEAD'})});
    return new Response(request.method==='HEAD'?null:response.body,{status:response.status,headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});
  }catch{return reply(503,{error:'号池暂时无法连接，请稍后再试。',retry_after:300});}
}
