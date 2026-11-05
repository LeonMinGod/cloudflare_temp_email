import fs from 'node:fs';
import http from 'node:http';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { createApp } from './app.mjs';
import { verifyBridge } from './bridge.mjs';

const root=process.env.LMG_ROOT||'/opt/yifu-cpa';
const stage=process.env.LMG_SITE_STAGE==='1';
const marker=root+'/private/site'+(stage?'-stage':'')+'-active';
const config=JSON.parse(fs.readFileSync(root+'/private/site-secrets'+(stage?'-stage':'')+'.json','utf8'));
const live=JSON.parse(fs.readFileSync(root+'/website/live/metadata.json','utf8'));
const site=await import(pathToFileURL(root+'/website/live/site/'+live.workers.site.main));
const guard=await import(pathToFileURL(root+'/website/live/guard/'+live.workers.guard.main));
fs.mkdirSync(root+'/data/website',{recursive:true,mode:0o700});
const originalFetch=globalThis.fetch;
// Keep the original source's strict, signed pool URL while avoiding CF round trips.
globalThis.fetch=(input,init)=>{
  const value=typeof input==='string'?input:input instanceof URL?input.href:input.url;
  if(value==='https://yifu.leonmingod.com/_pool/status')return originalFetch('http://127.0.0.1:8318/_pool/status',init);
  return originalFetch(input,init);
};
const app=createApp({root:root+'/data/website'+(stage?'-stage':''),site:site.default,guard:guard.default,GameRun:site.GameRun,AbuseState:guard.AbuseState,siteSecrets:config.site,guardSecrets:config.guard});
if(fs.existsSync(marker))app.activate();

async function bodyOf(incoming){let size=0;const parts=[];for await(const part of incoming){size+=part.length;if(size>1048576)throw Error('Request exceeds limit');parts.push(part);}return Buffer.concat(parts);}
async function send(outgoing,response,method){
  const headers=Object.fromEntries(response.headers);delete headers['set-cookie'];
  const cookies=response.headers.getSetCookie();if(cookies.length)headers['set-cookie']=cookies;
  headers['X-LMG-Origin-Host']='RAKsmart';outgoing.writeHead(response.status,headers);
  if(response.body&&method!=='HEAD')Readable.fromWeb(response.body).pipe(outgoing);else outgoing.end();
}
function reconstruct(meta,method,body){
  const headers=new Headers(meta.headers||{});headers.set('CF-Connecting-IP',meta.ip);
  // Forwarded headers supplied by the browser never become origin/client truth.
  for(const name of ['host','x-forwarded-for','x-forwarded-host','x-forwarded-proto','x-lmg-origin','x-lmg-origin-signature','content-length'])headers.delete(name);
  return new Request(meta.url,{method,headers,body:['GET','HEAD'].includes(method)?undefined:body});
}
const external=http.createServer(async(incoming,outgoing)=>{
  try{
    if(incoming.url==='/healthz'&&incoming.method==='GET')return send(outgoing,Response.json({ready:true,host:'RAKsmart',storage:'sqlite'}),incoming.method);
    const body=await bodyOf(incoming),headers=new Headers(incoming.headers);
    let hint;try{hint=JSON.parse(Buffer.from(headers.get('X-LMG-Origin')||'','base64').toString());}catch{}
    const secret=hint?.role==='site'?config.site.FREE_TOKEN_OPS_SECRET:config.guard.SERVICE_SECRET;
    const meta=secret&&verifyBridge(headers,incoming.method,body,secret);
    if(!meta)return send(outgoing,new Response(null,{status:403}),incoming.method);
    if(!fs.existsSync(marker))return send(outgoing,new Response('Origin warming up',{status:503,headers:{'Retry-After':'5','Cache-Control':'no-store'}}),incoming.method);
    const request=reconstruct(meta,incoming.method,body);
    await send(outgoing,meta.role==='site'?await app.fetchSite(request,{legacy:meta.legacy||{}}):await app.fetchGuard(request),incoming.method);
  }catch{if(!outgoing.headersSent)outgoing.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});outgoing.end('{"error":"Service temporarily unavailable"}');}
});
const internal=http.createServer(async(incoming,outgoing)=>{
  try{
    if(!fs.existsSync(marker))return send(outgoing,new Response(null,{status:503}),incoming.method);
    const body=await bodyOf(incoming);
    const request=new Request('http://guard.local'+incoming.url,{method:incoming.method,headers:incoming.headers,body:['GET','HEAD'].includes(incoming.method)?undefined:body});
    await send(outgoing,await app.fetchGuard(request),incoming.method);
  }catch{outgoing.writeHead(503);outgoing.end();}
});
external.listen(stage?18320:8320,'127.0.0.1');internal.listen(stage?18321:8321,'127.0.0.1');
console.log('{"event":"website_started","host":"RAKsmart","storage":"sqlite"}');
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{
  external.close(()=>internal.close(async()=>{await app.close();process.exit(0);}));
});
