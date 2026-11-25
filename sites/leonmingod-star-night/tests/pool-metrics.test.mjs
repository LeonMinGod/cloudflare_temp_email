import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeModelUsage, modelUsageRows, attachModelUsage } from '../src/pool-metrics.js';
import { compareModels, compareProviders, compareAccounts } from '../public/model-status/order-v1.mjs';
import { loadPoolCache, savePoolCache } from '../src/pool-storage.js';

const now=Date.parse('2026-10-30T00:00:00Z'),instance='11111111-1111-4111-8111-111111111111';
const body=(success=5,failed=1,id=instance)=>({schema:1,scope:'upstream_executions',instance_id:id,started_at:new Date(now-60000).toISOString(),enabled:true,api_key:'private-key',email:'private@example.com',models:[{id:'gpt-6.1-sol',provider:'codex',success,failed,auth_index:'private-auth',recent:[{at:now/1000,success,failed,ttft_ms:10000,ttft_samples:5,output_tokens:500,output_ms:10000,source:'private@example.com'}]}]});

test('model totals are real, idempotent, per model, persistent across CPA processes, and private',()=>{
  let cache=mergeModelUsage(null,body(),now);
  cache=mergeModelUsage(cache,body(),now+1000);
  let rows=modelUsageRows(cache,now+1000);assert.equal(rows[0].total,6);assert.equal(rows[0].success_rate,83.3);assert.equal(rows[0].ttft_seconds,2);assert.equal(rows[0].output_tokens_per_second,50);
  cache=mergeModelUsage(cache,body(7,2),now+2000);
  assert.equal(modelUsageRows(cache,now+2000)[0].total,9);
  cache=mergeModelUsage(cache,body(1,0,'22222222-2222-4222-8222-222222222222'),now+3000);
  assert.equal(modelUsageRows(cache,now+3000)[0].total,10);
  cache=mergeModelUsage(cache,body(6,1),now+4000);
  assert.equal(modelUsageRows(cache,now+4000)[0].total,10,'regressing counters must not be added twice');
  const snapshot=attachModelUsage({models:[{id:'gpt-6.1-sol'},{id:'gpt-6-astra'}]},cache,now+4000);
  assert.equal(snapshot.models[0].usage[0].total,10);assert.equal(snapshot.models[1].usage.length,0);assert.equal(snapshot.model_metrics_available,true);
  assert.doesNotMatch(JSON.stringify({cache,snapshot}),/private|api_key|auth_index|email|source:/);
  assert.equal(modelUsageRows(cache,now+6*3600000)[0].recent.length,0,'expired performance samples must be removed');
  assert.equal(modelUsageRows(cache,now+6*3600000)[0].total,10,'lifetime counts must survive window expiry');
});

test('model metrics reject unsupported contracts and ignore malformed individual counters',()=>{
  assert.throws(()=>mergeModelUsage(null,{...body(),instance_id:'not-an-instance'},now));
  const broken=body();broken.models[0].success=-1;assert.equal(modelUsageRows(mergeModelUsage(null,broken,now),now).length,0);
  const raw=body();raw.models.push({...raw.models[0],id:'private@example.com'});assert.equal(modelUsageRows(mergeModelUsage(null,raw,now),now).length,1);
});

test('common ordering prioritizes GPT/Codex and requested flagship aliases, keeping internal models behind chat models',()=>{
  const providers=['xai','antigravity','claude','codex','gemini'];assert.deepEqual(providers.sort(compareProviders),['codex','claude','gemini','antigravity','xai']);
  const model=id=>({id,providers:[id.startsWith('grok')?'xai':'codex']});
  const rows=['codex-auto-review','gpt-5.6-sol','gpt-image-2.5','gpt-6-astra','gpt-6.1-terra','gpt-6.1-sol','grok-4.7'].map(model).sort(compareModels);
  assert.deepEqual(rows.slice(0,3).map(x=>x.id),['gpt-6.1-sol','gpt-6.1-terra','gpt-6-astra']);
  assert(rows.findIndex(x=>x.id==='codex-auto-review')>rows.findIndex(x=>x.id==='gpt-image-2.5'));
  const accounts=[{id:'a',provider:'xai',state:'ready',success:100},{id:'b',provider:'codex',state:'disabled',success:300},{id:'c',provider:'codex',state:'ready',success:20},{id:'d',provider:'codex',state:'ready',success:200}];
  assert.deepEqual(accounts.sort(compareAccounts).map(x=>x.id),['d','c','a','b']);
});

test('large pool snapshots are atomically chunked below the Workers storage per-value limit and recover legacy state',async()=>{
  const data=new Map([['pool-status-v2',{legacy:true}]]);let transactions=0;
  const storage={get:async key=>data.get(key),put:async(key,value)=>{
    for(const [k,v] of typeof key==='object'?Object.entries(key):[[key,value]]){assert(Buffer.byteLength(JSON.stringify(v))<128*1024);data.set(k,v);}
  },transaction:async callback=>{transactions++;return callback(storage);}};
  assert.deepEqual(await loadPoolCache(storage),{legacy:true});
  const state={models:Array.from({length:100},(_,i)=>({id:'gpt-'+i,history:'状态'.repeat(5000)}))};
  await savePoolCache(storage,JSON.stringify(state));assert.equal(transactions,1);assert.deepEqual(await loadPoolCache(storage),state);
  await savePoolCache(storage,JSON.stringify({small:true}));assert.deepEqual(await loadPoolCache(storage),{small:true});
});

test('delta persistence skips identical parts, survives reload and removes obsolete chunks atomically',async()=>{
  const data=new Map();let writes=0,transactions=0;
  const storage={get:async key=>data.get(key),put:async(key,value)=>{
    for(const [k,v] of typeof key==='object'?Object.entries(key):[[key,value]]){writes++;data.set(k,v);}
  },delete:async keys=>{for(const key of keys){writes++;data.delete(key);}},transaction:async callback=>{transactions++;return callback(storage);}};
  const json=JSON.stringify({stamp:1000,padding:'a'.repeat(80_000)});
  let parts=await savePoolCache(storage,json);const first=writes,tx=transactions;
  parts=await savePoolCache(storage,json,parts);assert.equal(writes,first);assert.equal(transactions,tx);
  const changed=json.replace('1000','2000');parts=await savePoolCache(storage,changed,parts);
  assert.equal(writes,first+1,'Only one changed chunk should be written; the unchanged manifest stays intact');
  let loadedParts;assert.equal((await loadPoolCache(storage,value=>{loadedParts=value;})).stamp,2000);
  await savePoolCache(storage,changed,loadedParts);assert.equal(writes,first+1,'Reloading must not force a full rewrite');
  await savePoolCache(storage,JSON.stringify({stamp:3000}),loadedParts);
  assert.deepEqual(await loadPoolCache(storage),{stamp:3000});
  assert.equal([...data.keys()].filter(key=>key.startsWith('pool-status-v3-part-')).length,1);
});
