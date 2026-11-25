// Bundled around the exact captured live module. Configuration is public keys only.
import original,{ __OBJECT__ as OriginalObject } from './migration-original.js';
import { WorkerEntrypoint } from 'cloudflare:workers';
const CONFIG=__CONFIG__;
const enc=new TextEncoder();
const b64=bytes=>{let text='';for(let at=0;at<bytes.length;at+=8192)text+=String.fromCharCode(...bytes.subarray(at,at+8192));return btoa(text);};
const bytes=text=>Uint8Array.from(atob(text),x=>x.charCodeAt(0));
const hex=raw=>[...new Uint8Array(raw)].map(n=>n.toString(16).padStart(2,'0')).join('');
const hash=raw=>crypto.subtle.digest('SHA-256',raw).then(hex);
const controlName='migration-control-'+CONFIG.session;
const isSite=CONFIG.role==='site';
function namespace(env){return isSite?env.GAME_RUNS:env.STATE;}
function control(env){const ns=namespace(env);return ns.get(ns.idFromName(isSite?controlName:'cpa-v1'));}
async function command(env,value){return (await control(env).fetch('https://migration.internal/control',{method:'POST',body:JSON.stringify(value)})).json();}
function phaseOf(value){return value?.phase==='freeze'&&Date.now()>value.until?'normal':value?.phase||'normal';}

async function authenticated(request,text){
  const stamp=request.headers.get('X-Migration-Time'),signature=request.headers.get('X-Migration-Signature');
  if(!/^\d{13}$/.test(stamp||'')||Math.abs(Date.now()-Number(stamp))>30000||!signature||signature.length>800)return false;
  try{
    const key=await crypto.subtle.importKey('spki',bytes(CONFIG.signing_public_der),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,bytes(signature),enc.encode('lmg-cf-migration-v1\n'+CONFIG.session+'\n'+stamp+'\n'+text));
  }catch{return false;}
}
async function encrypted(value,kind){
  if(!/^[a-z0-9][a-z0-9-]{5,79}$/.test(kind||''))throw Error('Invalid object kind');
  const raw=enc.encode(JSON.stringify(value)),secret=crypto.getRandomValues(new Uint8Array(32)),nonce=crypto.getRandomValues(new Uint8Array(12));
  const aes=await crypto.subtle.importKey('raw',secret,'AES-GCM',false,['encrypt']);
  const recipient=await crypto.subtle.importKey('spki',bytes(CONFIG.recipient_public_der),{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);
  const purpose='lmg-migration-transport-v1',aad=enc.encode(purpose+'\n'+CONFIG.session+'\n'+kind);
  return Response.json({format:'AES-256-GCM+RSA-OAEP-SHA256',purpose,session:CONFIG.session,kind,wrapped_key:b64(new Uint8Array(await crypto.subtle.encrypt('RSA-OAEP',recipient,secret))),nonce:b64(nonce),ciphertext:b64(new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData:aad},aes,raw)))},{headers:{'Cache-Control':'no-store'}});
}
const tables=['peers','audit','replay','control','quotas','key_flush','kv_budget','guard_write_budget'];
async function migration(request,env){
  if(request.method!=='POST')return new Response(null,{status:404});
  const text=await request.text();if(text.length>150000||!await authenticated(request,text))return new Response(null,{status:403});
  let body;try{body=JSON.parse(text);}catch{return new Response(null,{status:400});}
  if(body.action==='control'){
    if(!['normal','freeze','forward','status'].includes(body.phase))return new Response(null,{status:400});
    return encrypted(await command(env,{op:body.phase,until:body.until}),body.kind);
  }
  if(body.action==='bindings'){
    const names=isSite?['FREE_TOKEN_CPA_KEY','FREE_TOKEN_OPS_SECRET','FREE_TOKEN_RENDER_KEY','FREE_TOKEN_TURNSTILE_SECRET','FREE_TOKEN_TURNSTILE_SITEKEY','RESEND_API_KEY','KEY_ENC_SECRET','CPA_STATUS_MANAGEMENT_KEY','CLAIM_MAIL_FROM','VPS_POOL_ENDPOINT']:['ADMIN_SECRET','SERVICE_SECRET','KEY_LIMIT_PER_MINUTE','KEY_LIMIT_PER_DAY','EMAIL_LIMIT_PER_MINUTE','EMAIL_LIMIT_PER_DAY','STATS_FLUSH_MS','KV_WRITES_PER_DAY'];
    const secrets={};for(const name of names)if(typeof env[name]==='string')secrets[name]=env[name];
    return encrypted({role:CONFIG.role,secrets},body.kind);
  }
  if(body.action==='kv-all'&&isSite){
    let cursor='',complete=false;const records=[];
    for(let pageNumber=0;pageNumber<20;pageNumber++){
      const page=await env.KV.list({limit:1000,...(cursor?{cursor}:{})});
      for(let at=0;at<page.keys.length;at+=20)records.push(...await Promise.all(page.keys.slice(at,at+20).map(async row=>({name:row.name,expiration:row.expiration??null,metadata:row.metadata??null,value:await env.KV.get(row.name,{type:'text',cacheTtl:60})}))));
      cursor=page.cursor||'';complete=page.list_complete;if(complete)break;
    }
    if(!complete)throw Error('KV export exceeds bound');
    return encrypted({records,complete:true},body.kind);
  }
  if(body.action==='kv'&&isSite){
    const page=await env.KV.list({limit:1000,...(body.cursor?{cursor:body.cursor}:{})});
    const records=[];
    for(let at=0;at<page.keys.length;at+=20){
      records.push(...await Promise.all(page.keys.slice(at,at+20).map(async row=>({name:row.name,expiration:row.expiration??null,metadata:row.metadata??null,value:await env.KV.get(row.name,{type:'text',cacheTtl:60})}))));
    }
    return encrypted({records,cursor:page.cursor||'',complete:page.list_complete},body.kind);
  }
  if(body.action==='objects'&&isSite){
    if(!Array.isArray(body.ids)||body.ids.length>50||body.ids.some(id=>!(/^[a-f0-9]{64}$/.test(id))))return new Response(null,{status:400});
    const objects=await Promise.all(body.ids.map(async id=>({id,...await (await env.GAME_RUNS.get(env.GAME_RUNS.idFromString(id)).fetch('https://migration.internal/export',{method:'POST',body:'{}'})).json()})));
    return encrypted({objects},body.kind);
  }
  if(body.action==='guard'&&!isSite){
    const data=await (await control(env).fetch('https://migration.internal/export',{method:'POST',body:'{}'})).json();
    return encrypted(data,body.kind);
  }
  return new Response(null,{status:400});
}
async function forward(request,env,ctx){
  const staticCache=request.method==='GET'&&!new URL(request.url).pathname.startsWith('/api/')&&/\.(webp|png|jpg|jpeg|gif|ico|svg|css|js|mjs|woff2?)$/.test(new URL(request.url).pathname)&&typeof caches!=='undefined';
  const cacheKey=staticCache?new Request(request.url,{method:'GET'}):null;
  if(cacheKey){const cached=await caches.default.match(cacheKey);if(cached)return cached;}
  const body=['GET','HEAD'].includes(request.method)?new Uint8Array():new Uint8Array(await request.arrayBuffer());
  if(body.length>1048576)return new Response(null,{status:413});
  const headers={};for(const name of ['accept','content-type','origin','referer','user-agent','cookie','cache-control','if-none-match','if-modified-since','range','x-lmg-operation','x-cpa-guard']){const value=request.headers.get(name);if(value!==null)headers[name]=value;}
  const meta={role:CONFIG.role,at:Date.now(),url:request.url,ip:request.headers.get('CF-Connecting-IP')||'local',headers,legacy:{}};
  if(isSite&&new URL(request.url).pathname.startsWith('/api/')){
    const names=['limit:'+await hash(enc.encode(meta.ip+'\n'+(headers['user-agent']||''))),'pool-status-cache-v2'];
    if(body.length&&body.length<16000){try{const input=JSON.parse(new TextDecoder().decode(body));if(typeof input.email==='string'){const email=input.email.trim().toLowerCase();if(email.length<=254)names.push('claim:'+email);}if(/^[a-f0-9-]{36}$/.test(input.id||''))names.push(input.id);}catch{}}
    for(const name of names)meta.legacy[name]=env.GAME_RUNS.idFromName(name).toString();
  }
  const secret=isSite?env.FREE_TOKEN_OPS_SECRET:env.SERVICE_SECRET;
  const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const message='lmg-origin-v1\n'+JSON.stringify(meta)+'\n'+request.method+'\n'+await hash(body);
  const signature=hex(await crypto.subtle.sign('HMAC',key,enc.encode(message)));
  const response=await fetch('https://sj.leonmingod.com/_origin/lmg',{method:request.method,headers:{'X-LMG-Origin':b64(enc.encode(JSON.stringify(meta))),'X-LMG-Origin-Signature':signature},body:['GET','HEAD'].includes(request.method)?undefined:body,redirect:'manual',cache:'no-store'});
  // Historical public assets outside the current bundled routes remain readable.
  if(isSite&&response.status===404&&['GET','HEAD'].includes(request.method)&&!new URL(request.url).pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
  if(cacheKey&&response.status===200&&!response.headers.has('Set-Cookie')&&/immutable/.test(response.headers.get('Cache-Control')||'')){const pending=caches.default.put(cacheKey,response.clone());if(ctx?.waitUntil)ctx.waitUntil(pending);else await pending;}
  return response;
}

async function fetchSite(request,env,ctx){
  const path=new URL(request.url).pathname;
  if(path==='/_migration/'+CONFIG.session)return migration(request,env);
  const dynamic=!isSite||path.startsWith('/api/');
  const token=dynamic?crypto.randomUUID():null;
  const state=await command(env,{op:dynamic?'enter':'status',token});
  if(state.phase==='forward')return forward(request,env,ctx);
  if(state.phase==='freeze'&&dynamic)return new Response('正在迁移，请稍后重试。',{status:503,headers:{'Retry-After':'10','Cache-Control':'no-store'}});
  try{return await original.fetch(request,env,ctx);}finally{if(token)await command(env,{op:'leave',token});}
}
export default {fetch:fetchSite};
export class Site extends WorkerEntrypoint {fetch(request){return fetchSite(request,this.env,this.ctx);}}
export class __OBJECT__ extends OriginalObject {
  async fetch(request){
    const url=new URL(request.url);
    if(url.hostname==='migration.internal'&&url.pathname==='/control'){
      const body=await request.json();let value=await this.ctx.storage.get('__migration_control')||{phase:'normal',active:{}};
      const now=Date.now();value.phase=phaseOf(value);value.active||={};for(const [id,until]of Object.entries(value.active))if(until<now)delete value.active[id];
      if(body.op==='enter'&&value.phase==='normal')value.active[body.token]=now+90000;
      if(body.op==='leave')delete value.active[body.token];
      if(['normal','freeze','forward'].includes(body.op)){
        if(value.phase==='forward'&&body.op!=='forward')return Response.json({phase:'forward',error:'Authoritative origin has moved'});
        value.phase=body.op;if(body.op==='freeze')value.until=Math.min(now+1800000,Math.max(now+60000,Number(body.until)||now+900000));
      }
      if(body.op!=='status')await this.ctx.storage.put('__migration_control',value);
      return Response.json({phase:value.phase,until:value.until||null,active:Object.keys(value.active).length});
    }
    if(url.hostname==='migration.internal'&&url.pathname==='/export'){
      const entries=[...await this.ctx.storage.list()].filter(([key])=>key!=='__migration_control');
      const result={entries,alarm:await this.ctx.storage.getAlarm()};
      if(!isSite){result.tables={};for(const table of tables)result.tables[table]=[...this.ctx.storage.sql.exec('SELECT * FROM '+table)];}
      return Response.json(result);
    }
    return super.fetch(request);
  }
  async alarm(){
    const value=isSite?await command(this.env,{op:'status'}):{phase:phaseOf(await this.ctx.storage.get('__migration_control'))};
    if(value.phase==='forward'){await this.ctx.storage.deleteAlarm();return;}
    if(value.phase==='freeze'){await this.ctx.storage.setAlarm(Date.now()+60000);return;}
    return super.alarm();
  }
}
