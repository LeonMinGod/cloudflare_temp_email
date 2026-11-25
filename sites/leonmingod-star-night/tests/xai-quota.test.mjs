import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuota, quotaProbes } from '../src/pool-quota.js';
import { PoolStatusCoordinator } from '../src/pool-status.js';

const now=Date.parse('2026-10-30T00:00:00Z'),end='2026-11-04T13:58:00Z';
const creditBody={config:{currentPeriod:{type:'weekly',start:'2026-10-28T13:58:00Z',end},creditUsagePercent:11,productUsage:[{product:'GrokBuild',usagePercent:4},{product:'Cursor',usagePercent:4},{product:'GrokBot',usagePercent:3},{product:'private@example.com',usagePercent:1}],onDemandCap:{val:'0'},used:{val:'0'},monthlyLimit:{val:'0'},email:'private@example.com'}};
const data={credits:creditBody,billing:{config:{onDemandUsed:{val:'0'}}},user:{subscriptionTier:'SUPER_GROK_HEAVY',email:'private@example.com',user_id:'private-id'},settings:{subscription_tier_display:'SuperGrok Heavy'}};

test('xAI exposes real plan, remaining weekly quota, reset and shared product usage without identity or token fields',()=>{
  const value=parseQuota('xai',data,now);
  assert.equal(value.plan,'SuperGrok Heavy');assert.equal(value.windows[0].remaining,89);assert.equal(value.windows[0].reset_at,'2026-11-04T13:58:00.000Z');
  assert.equal(value.pay_as_you_go.enabled,false);assert.equal(value.product_usage.length,3);
  assert.deepEqual(value.product_usage.map(x=>x.product),['GrokBuild','Cursor','GrokBot']);
  assert.doesNotMatch(JSON.stringify(value),/private|email|user_id|api_key|access_token/);
  assert.equal(parseQuota('xai',{settings:data.settings},now).windows.length,0,'Plan alone must not fabricate 100% remaining');
  assert.throws(()=>parseQuota('xai',{credits:{config:{creditUsagePercent:true}}},now));
  const probes=quotaProbes({provider:'xai',auth_index:'private-auth-index'});
  assert.equal(probes.length,4);assert(probes.every(x=>x.request.method==='GET'&&x.request.url.startsWith('https://cli-chat-proxy.grok.com/v1/')));
  assert(probes.every(x=>!x.request.url.includes('chat/completions')));
});

test('xAI quota refreshes coalesce globally, keep the five-minute gate and never query disabled accounts automatically',async()=>{
  let clock=now;const saved=new Map(),calls=[];
  const storage={get:async key=>structuredClone(saved.get(key)),put:async(key,value)=>{for(const [k,v] of typeof key==='object'?Object.entries(key):[[key,value]])saved.set(k,structuredClone(v));},delete:async keys=>{for(const key of keys)saved.delete(key);},transaction:async fn=>fn(storage),setAlarm:async()=>{}};
  const files=[{id:'private-active',name:'active.json',auth_index:'active-index',provider:'xai',status:'active'},{id:'private-disabled',name:'disabled.json',auth_index:'disabled-index',provider:'xai',disabled:true}];
  const fetcher=async(url,options)=>{
    if(url.endsWith('/requests/api-call')){
      const probe=JSON.parse(options.body);calls.push(probe);assert.equal(probe.auth_index,'active-index');assert.equal(probe.method,'GET');
      const raw=probe.url.includes('format=credits')?data.credits:probe.url.includes('/billing')?data.billing:probe.url.includes('/user?')?data.user:data.settings;
      return Response.json({status_code:200,body:JSON.stringify(raw)});
    }
    if(url.includes('/models?'))return Response.json({models:[{id:'grok-4.7'}]});
    if(url.includes('/observability/usage/models'))return Response.json({schema:1,scope:'upstream_executions',instance_id:'11111111-1111-4111-8111-111111111111',started_at:new Date(now).toISOString(),enabled:true,models:[]});
    return Response.json({files});
  };
  const coordinator=new PoolStatusCoordinator({storage},{CPA_STATUS_MANAGEMENT_KEY:'private-management',FREE_TOKEN_OPS_SECRET:'private-ops'},{fetcher,clock:()=>clock});
  const send=body=>coordinator.fetch(new Request('https://internal/pool-status',{method:'POST',body:JSON.stringify(body)}));
  const responses=await Promise.all(Array.from({length:20},()=>send({kind:'snapshot'})));assert(responses.every(r=>r.status===200));assert.equal(calls.length,4);
  const snapshot=await responses[0].json(),account=snapshot.accounts.find(x=>x.state==='ready');assert.equal(account.quota.plan,'SuperGrok Heavy');assert.equal(account.quota.windows[0].remaining,89);
  await Promise.all(Array.from({length:20},()=>send({kind:'quota',id:account.id})));assert.equal(calls.length,4);
  clock+=61000;await send({kind:'snapshot'});assert.equal(calls.length,4);
  clock+=300000;await send({kind:'quota',id:account.id});assert.equal(calls.length,8);
});
