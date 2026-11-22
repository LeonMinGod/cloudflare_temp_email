import { normalizeProvider } from '../public/model-status/order-v1.mjs';

const WINDOW_MS=300_000, SLOTS=60;
const validName=value=>typeof value==='string'&&value.length>0&&value.length<=256&&!/[\u0000-\u001f\u007f@]/u.test(value);
const counter=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const at=value=>{const n=Date.parse(value||'');return Number.isFinite(n)?n:0;};
const empty=()=>({success:0,failed:0,ttft_ms:0,ttft_samples:0,output_tokens:0,output_ms:0});

// Store only public aggregates and per-process high-water counters. Polling twice
// never adds the same executions twice; a new CPA process does not reset totals.
export function mergeModelUsage(previous,body,now=Date.now()){
  if(body?.schema!==1||body.scope!=='upstream_executions'||!Array.isArray(body.models)||!/^[\da-f-]{36}$/i.test(body.instance_id||'')||!at(body.started_at)||typeof body.enabled!=='boolean')throw new Error('CPA_INVALID_MODEL_USAGE');
  const state=structuredClone(previous||{started_at:body.started_at,rows:{},sources:{}}),instance=body.instance_id;
  const source=state.sources[instance]||{rows:{}};source.at=now;
  for(const raw of body.models.slice(0,512)){
    if(!validName(raw.id)||!validName(raw.provider)||counter(raw.success)===null||counter(raw.failed)===null)continue;
    const key=`m:${raw.provider}\n${raw.id}`,last=source.rows[key]||{success:0,failed:0};
    // A process counter is monotonic. Regressed/stale reads cannot double count.
    if(raw.success<last.success||raw.failed<last.failed)continue;
    if(!state.rows[key]&&Object.keys(state.rows).length>=512)continue;
    const row=state.rows[key]||{id:raw.id,provider:raw.provider,success:0,failed:0};
    row.success+=raw.success-last.success;row.failed+=raw.failed-last.failed;
    state.rows[key]=row;
    source.rows[key]={success:raw.success,failed:raw.failed,recent:(Array.isArray(raw.recent)?raw.recent:[]).slice(-SLOTS).filter(bucket=>Number.isSafeInteger(bucket.at)&&bucket.at*1000>=now-SLOTS*WINDOW_MS&&bucket.at*1000<=now&&Object.keys(empty()).every(k=>counter(bucket[k])!==null)).map(bucket=>({at:bucket.at,...Object.fromEntries(Object.keys(empty()).map(k=>[k,bucket[k]]))}))};
  }
  state.sources[instance]=source;
  for(const [id] of Object.entries(state.sources).sort((a,b)=>b[1].at-a[1].at).slice(4))delete state.sources[id];
  state.updated_at=new Date(now).toISOString();state.enabled=body.enabled;state.dropped=counter(body.dropped)||0;
  return state;
}

export function modelUsageRows(state,now=Date.now()){
  if(!state)return [];
  const end=Math.floor(now/WINDOW_MS)*WINDOW_MS;
  const grouped=new Map();
  for(const [key,row] of Object.entries(state.rows)){
    const provider=normalizeProvider(row.provider);
    const groupKey=`${provider}\n${row.id}`;
    let agg=grouped.get(groupKey);
    if(!agg){
      agg={id:row.id,provider,success:0,failed:0,buckets:new Map()};
      grouped.set(groupKey,agg);
    }
    agg.success+=row.success;
    agg.failed+=row.failed;
    for(const source of Object.values(state.sources))for(const bucket of source.rows[key]?.recent||[]){
      if(bucket.at*1000<end-(SLOTS-1)*WINDOW_MS||bucket.at*1000>end)continue;
      const current=agg.buckets.get(bucket.at)||empty();
      for(const k of Object.keys(empty()))current[k]+=bucket[k];
      agg.buckets.set(bucket.at,current);
    }
  }
  return [...grouped.values()].map(agg=>{
    const recent=Array.from({length:SLOTS},(_,i)=>{const stamp=end-(SLOTS-1-i)*WINDOW_MS;return {at:new Date(stamp).toISOString(),...(agg.buckets.get(stamp/1000)||empty())};});
    const sums=recent.reduce((sum,b)=>{for(const k of Object.keys(empty()))sum[k]+=b[k];return sum;},empty());
    const total=agg.success+agg.failed;
    return {id:agg.id,provider:agg.provider,success:agg.success,failed:agg.failed,total,
      success_rate:total?Math.round(agg.success/total*1000)/10:null,
      ttft_seconds:sums.ttft_samples?Math.round(sums.ttft_ms/sums.ttft_samples)/1000:null,ttft_samples:sums.ttft_samples,
      output_tokens_per_second:sums.output_ms?Math.round(sums.output_tokens/sums.output_ms*10000)/10:null,
      recent_summary:sums,recent:recent.map(({at,success,failed})=>({at,success,failed})).filter(b=>b.success+b.failed>0)};
  });
}

export function attachModelUsage(snapshot,state,now=Date.now()){
  const rows=modelUsageRows(state,now),byModel=new Map();
  for(const row of rows){if(!byModel.has(row.id))byModel.set(row.id,[]);byModel.get(row.id).push(row);}
  snapshot.model_metrics_available=Boolean(state?.enabled);snapshot.model_stats_since=state?.started_at||null;
  snapshot.model_metrics_updated_at=state?.updated_at||null;snapshot.model_metrics_stale=Boolean(state&&now-at(state.updated_at)>600_000);
  snapshot.model_stats_scope='upstream_executions';
  for(const model of snapshot.models)model.usage=byModel.get(model.id)||[];
  return snapshot;
}
