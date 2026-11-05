import { isIP } from 'node:net';
import { POLICY, initialState, check, observe, prune, metrics } from './policy.mjs';
import { applyAuthorize, classifyRecord, encodeDecision, limitsFromEnv, parseAuthorizeBody, planFlush, readQuota, responseHeader } from './authorize.mjs';
import { WriteBudget, BUDGET_KEY } from './write-budget.mjs';
import { RECOVERY_KEY, RECOVERY_END, recoveryEnabled, RecoveryLimiter } from './recovery.mjs';
const encoder=new TextEncoder();
const recoveryLimiter=new RecoveryLimiter();
const json=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export function canonicalIP(value){
  if(typeof value!=='string'||!isIP(value))return null;
  if(isIP(value)===4)return value;
  const canonical=new URL(`http://[${value}]/`).hostname.slice(1,-1);
  if(canonical.startsWith('::ffff:')){
    const words=canonical.slice(7).split(':');
    if(words.length===2){const high=parseInt(words[0],16),low=parseInt(words[1],16);return `${high>>8}.${high&255}.${low>>8}.${low&255}`;}
  }
  return canonical;
}
async function authorized(request,env,body,admin){
  const parts=(request.headers.get('X-CPA-Guard')||'').match(/^(\d{13}):([a-f0-9]{32}):([a-f0-9]{64})$/);
  if(!parts||Math.abs(Date.now()-Number(parts[1]))>30000)return null;
  const secret=admin?env.ADMIN_SECRET:env.SERVICE_SECRET;
  if(!secret)return null;
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const message=`${parts[1]}\n${parts[2]}\nPOST\n${new URL(request.url).pathname}\n${body}`;
  const bytes=new Uint8Array(parts[3].match(/../g).map(v=>parseInt(v,16)));
  return await crypto.subtle.verify('HMAC',key,bytes,encoder.encode(message))?parts[2]:null;
}
export async function authorizeRoute(request,env,{now=Date.now(),limiter=recoveryLimiter}={}){
  if(request.method!=='POST')return json(404,{error:'Not found'});
  const text=await request.text();
  if(text.length>4096)return json(413,{error:'Request too large'});
  const nonce=await authorized(request,env,text,false);
  if(!nonce)return json(403,{error:'Forbidden'});
  let body;try{body=JSON.parse(text);}catch{return json(400,{error:'Invalid JSON'});}
  if(body?.ip!==undefined){body.ip=canonicalIP(body.ip);if(!body.ip)return json(400,{error:'Invalid IP'});}
  const parsed=parseAuthorizeBody(body);
  if(parsed.error)return json(400,{error:'Invalid request'});
  if(!env.KEYS||!env.STATE||!env.SERVICE_SECRET)return json(503,{error:'Key store unavailable'});
  let record=null;
  try{
    const raw=await env.KEYS.get('key:'+parsed.hash);
    if(raw)record=JSON.parse(raw);
  }catch{return json(503,{error:'Key store unavailable'});}
  if(record&&(typeof record!=='object'||Array.isArray(record)))return json(503,{error:'Key store unavailable'});
  const classified=classifyRecord(record);
  const signed=async decision=>{
    const payload=encodeDecision(decision);
    return new Response(payload,{status:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-CPA-Guard':await responseHeader(env.SERVICE_SECRET,nonce,'/v1/authorize',200,payload)}});
  };
  // Unknown/revoked keys are denied from the authoritative registry without
  // asking SQLite to persist an otherwise stateless rejection.
  if(!classified.active)return signed({allow:false,reason:classified.reason,retry_after:0});
  // Only an explicitly enabled, time-bounded incident switch can bypass DO
  // writes. An arbitrary DO outage never enables registry-only authorization.
  if(now<RECOVERY_END){
    let recovery;
    try{const raw=await env.KEYS.get(RECOVERY_KEY);recovery=raw?JSON.parse(raw):null;}
    catch{return json(503,{error:'Key store unavailable'});}
    if(recoveryEnabled(recovery,now)){
      const decision=limiter.decide({hash:parsed.hash,email:classified.email,nonce,limits:limitsFromEnv(env),now});
      return decision?signed(decision):json(503,{error:'Key store unavailable'});
    }
  }
  let response;
  try{
    response=await env.STATE.get(env.STATE.idFromName('cpa-v1')).fetch('https://state.internal/authorize',{method:'POST',body:JSON.stringify({nonce,hash:parsed.hash,email:classified.email,active:classified.active,reason:classified.reason,limits:limitsFromEnv(env),now:Date.now()})});
  }catch{return json(503,{error:'Key store unavailable'});}
  if(!response.ok)return json(503,{error:'Key store unavailable'});
  return signed(await response.json());
}
export default {
  async fetch(request,env){
    const path=new URL(request.url).pathname,admin=path==='/admin';
    if(path==='/v1/authorize')return authorizeRoute(request,env);
    if(!['/rpc','/admin'].includes(path)||request.method!=='POST')return json(404,{error:'Not found'});
    const text=await request.text();if(text.length>8192)return json(413,{error:'Request too large'});
    const nonce=await authorized(request,env,text,admin);if(!nonce)return json(403,{error:'Forbidden'});
    let body;try{body=JSON.parse(text);}catch{return json(400,{error:'Invalid JSON'});}
    if(!body||typeof body!=='object'||Array.isArray(body))return json(400,{error:'Invalid request'});
    if(body.ip!==undefined){body.ip=canonicalIP(body.ip);if(!body.ip)return json(400,{error:'Invalid IP'});}
    if(!admin&&(!body.ip||!['check','observe'].includes(body.action)))return json(400,{error:'Invalid operation'});
    if(admin&&(!['status','enable','disable','allow','unallow','unban'].includes(body.action)||(['allow','unallow','unban'].includes(body.action)&&!body.ip)))return json(400,{error:'Invalid administrative operation'});
    // Scope administrative capabilities to a separate secret never sent to CPA.
    return env.STATE.get(env.STATE.idFromName('cpa-v1')).fetch('https://state.internal/'+(admin?'admin':'rpc'),{method:'POST',body:JSON.stringify({...body,nonce})});
  },
};

export class AbuseState {
  constructor(ctx,env){
    this.ctx=ctx;this.env=env;this.budget=new WriteBudget(ctx.storage.sql);this.sql={exec:(...args)=>this.budget.exec(...args)};
    this.volatileReplay=new Map();this.lastReplayCleanup=Date.now();
    this.sql.exec('CREATE TABLE IF NOT EXISTS peers (ip TEXT PRIMARY KEY,state TEXT NOT NULL,updated INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY,ip TEXT NOT NULL,entry TEXT NOT NULL,created INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS replay (nonce TEXT PRIMARY KEY,response TEXT NOT NULL,created INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS control (id INTEGER PRIMARY KEY,value TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS quotas (kind TEXT NOT NULL,id TEXT NOT NULL,minute_start INTEGER NOT NULL,minute_count INTEGER NOT NULL,day_start INTEGER NOT NULL,day_count INTEGER NOT NULL,allowed INTEGER NOT NULL,flushed INTEGER NOT NULL,PRIMARY KEY (kind,id))');
    this.sql.exec('CREATE TABLE IF NOT EXISTS key_flush (id INTEGER PRIMARY KEY,next INTEGER NOT NULL,top_dirty INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS kv_budget (day TEXT PRIMARY KEY,writes INTEGER NOT NULL)');
  }
  config(){return JSON.parse([...this.sql.exec('SELECT value FROM control WHERE id=1')][0]?.value||'{"enabled":false,"allowlist":[]}');}
  async fetch(request){
    if(new URL(request.url).pathname==='/authorize')return this.authorize(await request.json());
    const body=await request.json(),now=Date.now(),admin=new URL(request.url).pathname==='/admin';
    const replayKey=(admin?'admin:':'rpc:')+body.nonce;
    const cached=this.volatileReplay.get(replayKey);
    if(cached&&cached.until>now)return json(200,cached.result);
    const previous=[...this.sql.exec('SELECT response FROM replay WHERE nonce=? AND created>?',replayKey,now-60000)][0];
    if(previous)return json(200,JSON.parse(previous.response));
    const config=this.config();let result;
    this.ctx.storage.transactionSync(()=>{
      if(admin){
        if(body.action==='status'){
          const rows=body.ip?[...this.sql.exec('SELECT ip,state FROM peers WHERE ip=?',body.ip)]:[...this.sql.exec('SELECT ip,state FROM peers ORDER BY updated DESC LIMIT 100')];
          result={config,policy:POLICY,peers:rows.map(r=>{const s=prune(JSON.parse(r.state),now);return{ip:r.ip,active:s.active,bans:s.bans,counters:s.counters,sharedUntil:s.sharedUntil,throttleUntil:s.throttleUntil,windows:metrics(s,now)};}),records:[...this.sql.exec('SELECT ip,entry FROM audit ORDER BY created DESC LIMIT 100')].map(r=>({ip:r.ip,...JSON.parse(r.entry)}))};
        }else if(body.action==='enable'||body.action==='disable'){
          config.enabled=body.action==='enable';this.sql.exec('INSERT OR REPLACE INTO control VALUES (1,?)',JSON.stringify(config));result={config};
        }else if(body.action==='allow'||body.action==='unallow'){
          if(!body.ip)throw new Error('IP required');
          config.allowlist=config.allowlist.filter(ip=>ip!==body.ip);
          if(body.action==='allow')config.allowlist.push(body.ip);
          this.sql.exec('INSERT OR REPLACE INTO control VALUES (1,?)',JSON.stringify(config));result={config};
        }else if(body.action==='unban'){
          if(!body.ip)throw new Error('IP required');
          const row=[...this.sql.exec('SELECT state FROM peers WHERE ip=?',body.ip)][0];
          if(row){const state=JSON.parse(row.state);state.active=null;state.events=[];state.throttleUntil=0;state.credentialThrottles={};if(body.resetHistory===true)state.bans=[];this.sql.exec('UPDATE peers SET state=?,updated=? WHERE ip=?',JSON.stringify(state),now,body.ip);}
          this.sql.exec('INSERT INTO audit VALUES (?,?,?,?)',body.nonce,body.ip,JSON.stringify({action:'manual_unban',at:now,resetHistory:body.resetHistory===true}),now);result={unbanned:body.ip};
        }else result={error:'Unknown operation'};
      }else{
        const row=[...this.sql.exec('SELECT state FROM peers WHERE ip=?',body.ip)][0];
        const state=row?JSON.parse(row.state):initialState(),original=JSON.stringify(state);
        const before=JSON.stringify(state.active),exempt=config.allowlist.includes(body.ip);
        const event={...body,exempt},status=Number(body.status);
        const routine=body.action==='observe'&&(body.gatewayDenied||exempt||status<400);
        const diagnostic=body.action==='observe'&&status>=500;
        const sharedBefore=state.sharedUntil;
        const decision=body.action==='observe'&&!routine?observe(state,event,now):check(state,now,event);
        // Coalesce NAT protection refreshes, never shortening the promised day.
        if(event.trusted)state.sharedUntil=sharedBefore>now+POLICY.repeatWindow?sharedBefore:now+POLICY.repeatWindow+300000;
        // Probes with no state transition and gateway-generated denials do not
        // need to rewrite a peer. Genuine observations/evidence remain durable.
        const encoded=JSON.stringify(state);
        if(!routine&&(!diagnostic||this.budget.diagnosticAllowed())&&encoded!==original)
          this.sql.exec('INSERT OR REPLACE INTO peers VALUES (?,?,?)',body.ip,encoded,now);
        if(state.active&&JSON.stringify(state.active)!==before){
          const id=body.ip+':'+state.active.id;
          this.sql.exec('INSERT OR REPLACE INTO audit VALUES (?,?,?,?)',id,body.ip,JSON.stringify(state.active),now);
          console.log(JSON.stringify({event:'cpa_abuse_ban',reason:state.active.reason,until:state.active.until,evidence:state.active.evidence,enforced:config.enabled}));
        }
        result={...decision,enforced:config.enabled,action:config.enabled?decision.action:'allow',observedAction:decision.action,policyVersion:1};
      }
      const durableReplay=admin?body.action!=='status':body.action==='observe'&&!body.gatewayDenied&&!config.allowlist.includes(body.ip)&&Number(body.status)>=400&&Number(body.status)<500;
      if(durableReplay)this.sql.exec('INSERT INTO replay VALUES (?,?,?)',replayKey,JSON.stringify(result),now);
    });
    // Only harmless observations/reads use the bounded ephemeral replay cache;
    // authorization consumption and abnormal evidence keep durable replay rows.
    this.volatileReplay.set(replayKey,{until:now+60000,result});
    while(this.volatileReplay.size>2048||this.volatileReplay.values().next().value?.until<=now)
      this.volatileReplay.delete(this.volatileReplay.keys().next().value);
    this.cleanupReplay(now);
    await this.publishBudget();
    if(!await this.ctx.storage.getAlarm())await this.ctx.storage.setAlarm(now+3600000);
    return json(200,result);
  }
  async authorize(payload){
    let result;
    this.ctx.storage.transactionSync(()=>{result=applyAuthorize(this.sql,payload);});
    const now=Number(payload.now)||Date.now();
    this.cleanupReplay(now);
    await this.publishBudget();
    if(!await this.ctx.storage.getAlarm())await this.ctx.storage.setAlarm(now+3600000);
    return json(200,result);
  }
  cleanupReplay(now){
    // Scanning and deleting the replay table per request amplified both reads
    // and writes during retry storms. Expiry is checked on every lookup.
    if(now-this.lastReplayCleanup<60000||!this.budget.diagnosticAllowed())return;
    this.sql.exec('DELETE FROM replay WHERE nonce IN (SELECT nonce FROM replay WHERE created<? LIMIT 128)',now-60000);
    this.lastReplayCleanup=now;
  }
  async publishBudget(){
    if(!this.env?.KEYS)return;
    // A KV write yields to other requests. Coalesce publication without holding
    // a storage transaction or blocking unrelated quota/authentication work.
    while(this.budgetPublication)await this.budgetPublication;
    const signal=this.budget.signal(),key=signal.day+':'+signal.level;
    if(key===this.lastBudgetSignal)return;
    // id=1 remains the existing IP policy. Persist the successful day/level in
    // id=2 so object eviction does not turn every cold start into a KV write.
    const published=[...this.sql.exec('SELECT value FROM control WHERE id=2')][0]?.value;
    if(published===key){this.lastBudgetSignal=key;return;}
    const publication=(async()=>{
      try{
        await this.env.KEYS.put(BUDGET_KEY,JSON.stringify(signal));
        this.sql.exec('INSERT OR REPLACE INTO control (id,value) VALUES (2,?)',key);
        this.lastBudgetSignal=key;
        if(signal.level!=='normal')console.log(JSON.stringify({event:'do_write_budget',...signal}));
      }catch{console.log(JSON.stringify({event:'do_budget_signal_failed'}));}
    })();
    this.budgetPublication=publication;
    try{await publication;}finally{this.budgetPublication=null;}
  }
  async alarm(){
    const now=Date.now();
    if(this.budget.diagnosticAllowed()){
      this.sql.exec('DELETE FROM peers WHERE ip IN (SELECT ip FROM peers WHERE updated<? LIMIT 128)',now-POLICY.retention);
      this.sql.exec('DELETE FROM audit WHERE id IN (SELECT id FROM audit WHERE created<? LIMIT 128)',now-POLICY.retention);
      this.sql.exec('DELETE FROM replay WHERE nonce IN (SELECT nonce FROM replay WHERE created<? LIMIT 128)',now-60000);
      try{await this.flushStats(now);}catch{console.log(JSON.stringify({event:'cpa_stats_flush_failed'}));}
    }
    await this.publishBudget();
    // Expiry is also checked on every request, independently of alarm scheduling.
    await this.ctx.storage.setAlarm(now+3600000);
  }
  async flushStats(now){
    const kv=this.env?.KEYS;
    if(!kv)return;
    const scheduled=[...this.sql.exec('SELECT next,top_dirty FROM key_flush WHERE id=1')][0];
    if(!scheduled||now<scheduled.next)return;
    const limits=limitsFromEnv(this.env||{});
    let index={entries:[]};
    try{const raw=await kv.get('leaderboard:index');if(raw)index=JSON.parse(raw);}catch{this.sql.exec('INSERT OR REPLACE INTO key_flush (id,next,top_dirty) VALUES (1,?,?)',now+limits.flushMs,scheduled.top_dirty||0);return;}
    const entries=Array.isArray(index.entries)?index.entries:[];
    const quotas=new Map(),stats=new Map();
    for(const entry of entries.slice(0,20)){
      const hash=entry?.key_sha256;
      if(typeof hash!=='string')continue;
      const quota=readQuota(this.sql,'key',hash);
      if(quota)quotas.set(hash,quota);
      else{
        try{const raw=await kv.get('stats:'+hash);const parsed=raw?JSON.parse(raw):null;const value=Number(parsed?.requests??parsed?.score??0);stats.set(hash,Number.isFinite(value)&&value>=0?Math.floor(value):0);}catch{stats.set(hash,0);}
      }
    }
    const day=new Date(now).toISOString().slice(0,10);
    const used=[...this.sql.exec('SELECT writes FROM kv_budget WHERE day=?',day)][0]?.writes||0;
    const plan=planFlush(entries,quotas,stats,now,Math.max(0,limits.maxWritesPerDay-used),scheduled.top_dirty===1);
    let writes=used,topDirty=scheduled.top_dirty===1;
    for(const item of plan.stats){
      await kv.put('stats:'+item.hash,JSON.stringify(item.value));
      this.sql.exec("UPDATE quotas SET flushed=? WHERE kind='key' AND id=?",item.requests,item.hash);
      writes++;
      topDirty=1;
      this.sql.exec('INSERT OR REPLACE INTO key_flush (id,next,top_dirty) VALUES (1,?,1)',scheduled.next);
    }
    if(plan.top){
      await kv.put('leaderboard:top',JSON.stringify(plan.top));
      writes++;
      topDirty=0;
    }
    this.sql.exec('INSERT OR REPLACE INTO kv_budget (day,writes) VALUES (?,?)',day,writes);
    this.sql.exec('DELETE FROM kv_budget WHERE day<?',day);
    this.sql.exec('INSERT OR REPLACE INTO key_flush (id,next,top_dirty) VALUES (1,?,?)',now+limits.flushMs,topDirty?1:0);
  }
}
