import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizePool, accountState, handlePoolStatus, PoolStatusCoordinator, accountId, maskAccountEmail } from '../src/pool-status.js';
import { passiveQuota, parseQuota, quotaProbe } from '../src/pool-quota.js';
import { Miniflare } from 'miniflare';
import { loadPoolCache } from '../src/pool-storage.js';

const now=Date.parse('2026-10-29T12:00:00Z'),later=new Date(now+60000).toISOString();
const files=[
 {id:'private-account@example.com',auth_index:'private-index',name:'oauth-private-account@example.com.json',email:'private-account@example.com',path:'/auths/private.json',status_message:'Bearer secret-credential',provider:'codex',status:'active',success:9,failed:1,recent_requests:[{time:'12:00-12:10',success:2,failed:1}],cooldowns:[{scope:'model',model_key:'gpt-test',retry_at:later}],quota:{signals:{'X-Codex-Primary-Used-Percent':'31','X-Codex-Primary-Window-Minutes':'300','X-Codex-Primary-Reset-At':String((now+7200000)/1000),'Authorization':'secret-credential'},observed_at:new Date(now).toISOString()},id_token:{plan_type:'plus',chatgpt_account_id:'secret-account-id',chatgpt_subscription_active_until:'2026-11-25T08:00:00Z'}},
 {id:'private-disabled',auth_index:'disabled-index',name:'disabled.json',provider:'antigravity',status:'disabled',disabled:true,project_id:'private-project'},
 {id:'private-cooling',auth_index:'cooling-index',name:'cooling.json',provider:'codex',status:'error',unavailable:true,next_retry_after:later},
];
const usage={email:'never-return@example.com',account_id:'secret-account-id',plan_type:'plus',rate_limit:{primary_window:{used_percent:72,limit_window_seconds:18000,reset_at:(now+7200000)/1000},secondary_window:{used_percent:36,limit_window_seconds:604800,reset_at:(now+432000000)/1000}},credits:{balance:'0'}};
function harness(){
 let clock=now,writes=0;const rows=new Map(),calls=[];let status=200,innerStatus=200;
 const env={CPA_STATUS_MANAGEMENT_KEY:'management-test-placeholder',FREE_TOKEN_OPS_SECRET:'ops-test-placeholder'};
 const storage={get:async k=>structuredClone(rows.get(k)),put:async(k,v)=>{if(typeof k==='object'){for(const [name,value] of Object.entries(k)){writes++;rows.set(name,structuredClone(value));}}else{writes++;rows.set(k,structuredClone(v));}},delete:async keys=>{for(const key of Array.isArray(keys)?keys:[keys]){writes++;rows.delete(key);}},transaction:async callback=>callback(storage),setAlarm:async stamp=>rows.set('alarm',stamp)};
 const ctx={storage};
 const fetcher=async(url,options)=>{
  calls.push({url,options});assert.equal(options.headers.Authorization,'Bearer management-test-placeholder');assert.equal(options.redirect,'manual');
  if(status!==200)return new Response('private upstream error',{status});
  if(url.endsWith('/observability/usage/models'))return Response.json({schema:1,scope:'upstream_executions',instance_id:'11111111-1111-4111-8111-111111111111',started_at:new Date(now).toISOString(),enabled:true,models:[]});
  if(url.endsWith('/requests/api-call')){const payload=JSON.parse(options.body);assert.equal(payload.method,'GET');assert.equal(payload.url,'https://chatgpt.com/backend-api/wham/usage');return Response.json({status_code:innerStatus,body:JSON.stringify(usage)});}
  assert.equal(options.method,'GET');assert(!url.includes('/download'));
  return Response.json(url.includes('/models?')?{models:[{id:url.includes('disabled')?'gemini-test':'gpt-test'}]}:{files});
 };
 const coordinator=new PoolStatusCoordinator(ctx,env,{fetcher,clock:()=>clock});
 const send=body=>coordinator.fetch(new Request('https://internal/pool-status',{method:'POST',body:JSON.stringify(body)}));
 return {env,ctx,calls,coordinator,send,writes:()=>writes,advance:ms=>{clock+=ms;},setStatus:value=>{status=value;},setInner:value=>{innerStatus=value;}};
}

test('summaries mask email before returning it and retain true credential counters and model cooldowns',async()=>{
 const summary=await summarizePool(files,[['gpt-test','gpt-ready'],['gemini-test'],null],'local-secret',now);
 assert.equal(summary.totals.total,3);assert.equal(summary.totals.ready,1);assert.equal(summary.totals.cooldown,1);assert.equal(summary.totals.disabled,1);
 assert.equal(summary.models.find(x=>x.id==='gpt-test').cooldown,1);assert.equal(summary.models.find(x=>x.id==='gpt-ready').ready,1);
 const active=summary.accounts.find(x=>x.state==='ready');assert.equal(active.masked_email,'p***t@e***.com');assert.equal(active.success,9);assert.equal(active.failed,1);assert.equal(active.success_rate,90);
 assert.equal(active.quota.primary_remaining,69);assert.equal(active.quota.windows[0].label,'5 小时限额');assert.equal(active.quota.plan,'plus');
 assert.doesNotMatch(JSON.stringify(summary),/private-account|example\.com|oauth-private|private\.json|secret-credential|secret-account-id|Authorization|Bearer|\/auths/);
 assert.equal(summary.model_metrics_available,false);assert.equal(maskAccountEmail({email:'not-email'}),null);
 assert.equal(accountState({status:'active',cooldowns:files[0].cooldowns},now),'ready');
 assert.equal(accountState({status:'active',next_retry_after:later},now),'cooldown');
});

test('quota parsing preserves real remaining percent and reset times while stripping unrelated upstream data',()=>{
 const parsed=parseQuota('codex',usage,now);assert.equal(parsed.windows[0].remaining,28);assert.equal(parsed.windows[1].remaining,64);assert.equal(parsed.windows[0].label,'5 小时限额');assert.equal(parsed.windows[1].label,'周限额');assert.equal(parsed.credits,0);
 assert.doesNotMatch(JSON.stringify(parsed),/email|account_id|never-return|secret-account/);
 assert.equal(parseQuota('claude',{five_hour:{utilization:100,resets_at:later}},now).windows[0].remaining,0);
 assert.equal(passiveQuota({quota:{signals:{'X-Codex-Primary-Used-Percent':'bad'}}}).windows.length,0);
 assert.throws(()=>parseQuota('codex',{rate_limit:{primary_window:{used_percent:102}}},now));
 assert.equal(quotaProbe({provider:'xai',auth_index:'index'}).url,'https://cli-chat-proxy.grok.com/v1/billing?format=credits');
 assert.equal(quotaProbe(files[0]).header.Authorization,'Bearer $TOKEN$');
});

test('twenty concurrent reads coalesce globally; retries cannot bypass snapshot or per-account quota cooldown',async()=>{
 const h=harness(),responses=await Promise.all(Array.from({length:20},()=>h.send({kind:'snapshot'})));
 assert(responses.every(r=>r.status===200));assert.equal(h.calls.filter(x=>x.url.endsWith('/credentials')).length,1);
 assert.equal(h.calls.filter(x=>x.url.includes('/models?')).length,3);assert.equal(h.calls.filter(x=>x.url.endsWith('/requests/api-call')).length,1);
 const body=await responses[0].json();assert.equal(body.models[0].history.length,1);
 const id=body.accounts.find(x=>x.state==='ready').id;
 const beforeCached=h.writes();
 for(let i=0;i<10;i++)await h.send({kind:'quota',id});
 await Promise.all(Array.from({length:100},()=>h.send({kind:'snapshot'})));
 assert.equal(h.writes(),beforeCached,'Cached snapshot and quota reads must not write storage');
 assert.equal(h.calls.length,6);
 h.advance(61000);await h.send({kind:'snapshot'});assert.equal(h.calls.length,6);
 h.advance(239001);await h.send({kind:'snapshot'});assert.equal(h.calls.filter(x=>x.url.endsWith('/credentials')).length,2);
 h.advance(300000);await h.send({kind:'quota',id});assert.equal(h.calls.filter(x=>x.url.endsWith('/requests/api-call')).length,3);
});

test('bad management auth backs off for fifteen minutes and cannot be retried through the quota endpoint',async()=>{
 const h=harness();h.setStatus(401);assert.equal((await h.send({kind:'snapshot'})).status,503);
 for(let i=0;i<20;i++)await h.send({kind:'snapshot'});assert.equal(h.calls.length,1);
 await assert.rejects(h.send({kind:'quota',id:await accountId(files[0],h.env.FREE_TOKEN_OPS_SECRET)}));assert.equal(h.calls.length,1);
 h.advance(900001);h.setStatus(200);assert.equal((await h.send({kind:'snapshot'})).status,200);
});

test('background model collection is coalesced, persists without visitors and leaves credential/quota traffic idle',async()=>{
 const h=harness();await h.send({kind:'snapshot'});assert.equal(await h.ctx.storage.get('pool-status-kind'),'pool');
 const before=h.calls.length;h.advance(300001);
 await Promise.all([h.coordinator.alarm(),h.coordinator.modelMetrics(),h.coordinator.modelMetrics()]);
 assert.equal(h.calls.length,before+1);assert(h.calls.at(-1).url.endsWith('/observability/usage/models'));
 const replacement=new PoolStatusCoordinator(h.ctx,h.env,{fetcher:()=>{throw new Error('HEAD must not fetch');},clock:()=>now+300002});
 const result=await replacement.fetch(new Request('https://internal/pool-status',{method:'POST',body:JSON.stringify({kind:'snapshot',peek:true})}));
 assert.equal(result.status,200);assert.equal((await result.json()).model_metrics_available,true);
});

test('failed quota preserves the old value and disabled credentials do not produce automatic upstream probes',async()=>{
 const h=harness();await h.send({kind:'snapshot'});h.advance(300001);h.setInner(429);
 const id=await accountId(files[0],h.env.FREE_TOKEN_OPS_SECRET),response=await h.send({kind:'quota',id}),body=await response.json();
 assert.equal(body.quota.windows[0].remaining,28);assert.equal(body.quota.error,'upstream_busy');
 const probes=h.calls.filter(x=>x.url.endsWith('/requests/api-call'));assert.equal(probes.length,2);assert(probes.every(x=>JSON.parse(x.options.body).auth_index==='private-index'));
});

test('five-minute live refreshes retain only fifteen-minute checkpoints and persist refresh gates across reloads',async()=>{
 const h=harness();await h.send({kind:'snapshot'});
 const first=(await loadPoolCache(h.ctx.storage)).snapshot.updated_at;
 for(let i=0;i<2;i++){
  h.advance(300001);const live=await (await h.send({kind:'snapshot'})).json();assert.notEqual(live.updated_at,first);
  assert.equal((await loadPoolCache(h.ctx.storage)).snapshot.updated_at,first);
 }
 h.advance(300001);await h.send({kind:'snapshot'});
 assert.notEqual((await loadPoolCache(h.ctx.storage)).snapshot.updated_at,first);
 const control=await h.ctx.storage.get('pool-status-control-v1');assert(control.writes<10000);
 const before=h.calls.length;
 const replacement=new PoolStatusCoordinator(h.ctx,h.env,{fetcher:()=>{throw new Error('persisted cooldown must prevent new upstream calls');},clock:()=>now+900004});
 const response=await replacement.fetch(new Request('https://internal/pool-status',{method:'POST',body:JSON.stringify({kind:'snapshot'})}));
 assert.equal(response.status,200);assert.equal(h.calls.length,before);
});

test('guard conservation pauses optional checkpoint/history alarms without stopping a visible read',async()=>{
 const h=harness();h.env.KV={get:async()=>JSON.stringify({level:'conserve',expires:now+86400000})};
 const body=await (await h.send({kind:'snapshot'})).json();assert.equal(body.totals.total,3);
 assert.equal(await loadPoolCache(h.ctx.storage),undefined);
 const before=h.calls.length;h.advance(300001);await h.coordinator.alarm();assert.equal(h.calls.length,before);
 assert.equal(await h.ctx.storage.get('alarm'),Date.parse('2026-10-30T00:00:00Z'));
});

test('daily monitor cache budget survives reload and prevents further snapshot/control writes',async()=>{
 const h=harness();await h.send({kind:'snapshot'});
 const control=await h.ctx.storage.get('pool-status-control-v1');control.writes=10000;
 await h.ctx.storage.put('pool-status-control-v1',control);
 const replacement=new PoolStatusCoordinator(h.ctx,h.env,{fetcher:async()=>{throw new Error('network unavailable');},clock:()=>now+900001});
 await replacement.ready;const before=h.writes();await replacement.modelMetrics();
 assert.equal(h.writes(),before);
 assert.equal((await h.ctx.storage.get('pool-status-control-v1')).writes,10000);
});

test('a pre-deploy counter snapshot is merged once without resetting or double-counting model totals',async()=>{
 const h=harness(),backup={captured_at:'2026-10-29T11:59:00Z',body:{schema:1,scope:'upstream_executions',instance_id:'22222222-2222-4222-8222-222222222222',started_at:'2026-10-29T10:00:00Z',enabled:true,models:[{id:'gpt-test',provider:'codex',success:7,failed:1,recent:[]}]}};
 h.env.KV={get:async key=>key==='ops:cpa-model-usage-before-deploy:v1'?JSON.stringify(backup):null};
 const first=await (await h.send({kind:'snapshot'})).json();assert.equal(first.models.find(x=>x.id==='gpt-test').usage[0].total,8);
 h.advance(300001);const second=await (await h.send({kind:'snapshot'})).json();assert.equal(second.models.find(x=>x.id==='gpt-test').usage[0].total,8);
});

test('read-only public routes reject mutations and malformed IDs before touching upstream or claim limits',async()=>{
 assert.equal((await handlePoolStatus(new Request('https://leonmingod.com/api/pool-status',{method:'POST'}),{})).status,405);
 assert.equal((await handlePoolStatus(new Request('https://leonmingod.com/api/pool-status'),{})).status,503);
 const env={CPA_STATUS_MANAGEMENT_KEY:'test',FREE_TOKEN_OPS_SECRET:'test',GAME_RUNS:{get(){throw new Error('must not call');}}};
 assert.equal((await handlePoolStatus(new Request('https://leonmingod.com/api/pool-status/quota?id=arbitrary-url'),env)).status,400);
});

test('real Workers runtime coalesces reads and rejects redirects without forwarding the management credential',async()=>{
 let calls=0;const options={modules:true,scriptPath:'dist/index.js',compatibilityDate:'2025-06-01',bindings:{CPA_STATUS_MANAGEMENT_KEY:'management-runtime-test',FREE_TOKEN_OPS_SECRET:'ops-runtime-test'},durableObjects:{GAME_RUNS:{className:'GameRun',useSQLite:true}},serviceBindings:{ASSETS:()=>new Response('not found',{status:404})}};
 const blocked=new Miniflare({...options,outboundService:request=>{calls++;assert.equal(request.headers.get('Authorization'),'Bearer management-runtime-test');assert(request.url.startsWith('https://cpa.leonmingod.com/'));return new Response(null,{status:302,headers:{Location:'https://untrusted.example/credentials'}});}});
 try{
  assert.equal((await blocked.dispatchFetch('https://leonmingod.com/api/pool-status',{method:'HEAD'})).status,503);assert.equal(calls,0);
  assert.equal((await blocked.dispatchFetch('https://leonmingod.com/api/pool-status')).status,503);assert.equal(calls,1);
  assert.equal((await blocked.dispatchFetch('https://leonmingod.com/api/pool-status')).status,503);assert.equal(calls,1);
 }finally{await blocked.dispose();}
 const fresh=new Miniflare({...options,outboundService:request=>{calls++;if(request.url.endsWith('/observability/usage/models'))return Response.json({schema:1,scope:'upstream_executions',instance_id:'11111111-1111-4111-8111-111111111111',started_at:new Date(now).toISOString(),enabled:true,models:[]});return Response.json(request.url.includes('/models?')?{models:[{id:'runtime-model'}]}:{files:[{name:'test.json',provider:'xai',status:'active'}]});}});
 try{
  const responses=await Promise.all(Array.from({length:12},()=>fresh.dispatchFetch('https://leonmingod.com/api/pool-status')));assert(responses.every(r=>r.status===200));assert.equal(calls,4);
  const body=await responses[0].json();assert.equal(body.models[0].id,'runtime-model');assert.equal(body.totals.ready,1);assert.equal(body.models[0].history.length,1);
  assert.equal((await fresh.dispatchFetch('https://leonmingod.com/api/free-token/claim/code',{method:'POST',headers:{Origin:'https://leonmingod.com','Content-Type':'application/json'},body:JSON.stringify({email:'any@example.com'})})).status,503);
 }finally{await fresh.dispose();}
});
