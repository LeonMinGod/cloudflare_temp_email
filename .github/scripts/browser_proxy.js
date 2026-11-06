const failures=new Map();
const MOBILE_INPUT_SCRIPT = null;
function equal(a,b){let bad=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)bad|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return bad===0}
const COOKIE='__Host-rak_chrome',SESSION_SECONDS=28800,encoder=new TextEncoder();
const aad=encoder.encode('rak-private-chrome-session-v1\nhttps://browser.leonmingod.com');
const base64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unbase64=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
async function hash(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))),v=>v.toString(16).padStart(2,'0')).join('')}
async function sessionKey(secret){return crypto.subtle.importKey('raw',Uint8Array.from(secret.match(/../g),v=>parseInt(v,16)),{name:'AES-GCM'},false,['encrypt','decrypt'])}
async function issueSession(authorization,secret){
 const nonce=crypto.getRandomValues(new Uint8Array(12));
 const payload=encoder.encode(JSON.stringify({authorization,expires:Math.floor(Date.now()/1000)+SESSION_SECONDS}));
 const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData:aad},await sessionKey(secret),payload);
 return 'v1.'+base64(nonce)+'.'+base64(new Uint8Array(encrypted));
}
async function readSession(request,secret){
 try{
  const value=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  if(!value||value.length>8192||!/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value))return null;
  const [,iv,body]=value.split('.'),nonce=unbase64(iv);if(nonce.length!==12)return null;
  const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:nonce,additionalData:aad},await sessionKey(secret),unbase64(body));
  const payload=JSON.parse(new TextDecoder().decode(clear)),now=Math.floor(Date.now()/1000);
  if(typeof payload.authorization!=='string'||payload.authorization.length>4096||!Number.isSafeInteger(payload.expires)||payload.expires<=now||payload.expires>now+SESSION_SECONDS+60)return null;
  return equal(await hash(payload.authorization),secret)?payload.authorization:null;
 }catch{return null}
}
export default {
 async fetch(request, env) {
  const incoming=new URL(request.url), origin=new URL('https://sj.leonmingod.com');
  if(incoming.protocol!=='https:'){incoming.protocol='https:';return Response.redirect(incoming.href,308)}
  if(!/^[a-f0-9]{64}$/.test(env.BROWSER_AUTH_SHA256||''))return new Response('Private browser authentication unavailable',{status:503,headers:{'Cache-Control':'no-store'}});
  const supplied=request.headers.get('Authorization')||'';
  const basicValid=equal(await hash(supplied),env.BROWSER_AUTH_SHA256);
  const authorization=basicValid?supplied:await readSession(request,env.BROWSER_AUTH_SHA256);
   if(!authorization){
    const now=Date.now(),ip=request.headers.get('CF-Connecting-IP')||'unknown';
    if(failures.size>5000)failures.clear();
    const old=failures.get(ip),state=old&&now-old.since<60000?old:{since:now,count:0};state.count++;failures.set(ip,state);
    return new Response('Private Chrome login required',{status:state.count>10?429:401,headers:{'WWW-Authenticate':'Basic realm="restricted", charset="UTF-8"','Cache-Control':'no-store','Strict-Transport-Security':'max-age=31536000','X-Frame-Options':'DENY'}});
   }
  const isWebSocket=(request.headers.get('Upgrade')||'').toLowerCase()==='websocket';
  const requestOrigin=request.headers.get('Origin');
  if((isWebSocket&&requestOrigin!==incoming.origin)||(!['GET','HEAD','OPTIONS'].includes(request.method)&&requestOrigin&&requestOrigin!==incoming.origin))return new Response('Invalid request origin',{status:403,headers:{'Cache-Control':'no-store'}});
  if(incoming.pathname==='/rak-mobile-input.js'&&MOBILE_INPUT_SCRIPT!==null){
   return new Response(MOBILE_INPUT_SCRIPT,{headers:{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Strict-Transport-Security':'max-age=31536000','X-Frame-Options':'DENY','Content-Security-Policy':"frame-ancestors 'none'"}});
  }
  origin.pathname=env.BROWSER_ORIGIN_PREFIX+incoming.pathname;origin.search=incoming.search;
  const headers=new Headers(request.headers);
  // WebKit does not reliably forward cached Basic credentials on its WebSocket handshake.
  // A host-only encrypted, authenticated HttpOnly cookie preserves both proxy authentication layers.
  headers.set('Authorization',authorization);
  const forwardedCookies=(headers.get('Cookie')||'').split(';').map(x=>x.trim()).filter(x=>x&&!x.startsWith(COOKIE+'=')).join('; ');
  if(forwardedCookies)headers.set('Cookie',forwardedCookies);else headers.delete('Cookie');
  headers.set('Host','sj.leonmingod.com');
  headers.set('X-Rak-Browser-Origin',env.BROWSER_ORIGIN_TOKEN);
  headers.set('X-Forwarded-Host',incoming.host);headers.set('X-Forwarded-Proto','https');
  try {
   const upstream=await fetch(origin,{method:request.method,headers,
    body:['GET','HEAD'].includes(request.method)?undefined:request.body,
    redirect:'manual',cf:{cacheTtl:0,cacheEverything:false}});
   if(upstream.status===101)return upstream;
   const responseHeaders=new Headers(upstream.headers);
   const csp=responseHeaders.get('Content-Security-Policy');
   if(csp)responseHeaders.set('Content-Security-Policy',csp.replace("connect-src 'self';","connect-src 'self' wss://browser.leonmingod.com;"));
   responseHeaders.set('Cache-Control','no-store, no-transform');responseHeaders.set('Referrer-Policy','same-origin');
   responseHeaders.set('X-Content-Type-Options','nosniff');responseHeaders.set('X-Frame-Options','DENY');
   responseHeaders.set('Strict-Transport-Security','max-age=31536000');
   if(basicValid&&upstream.status===200&&(incoming.pathname==='/'||incoming.pathname==='/pelorus/'||incoming.pathname==='/pelorus'))responseHeaders.append('Set-Cookie',COOKIE+'='+await issueSession(authorization,env.BROWSER_AUTH_SHA256)+'; Path=/; Max-Age='+SESSION_SECONDS+'; Secure; HttpOnly; SameSite=Strict');
   if(!responseHeaders.has('Content-Security-Policy'))responseHeaders.set('Content-Security-Policy',"frame-ancestors 'none'");
   const response=new Response(upstream.body,{status:upstream.status,headers:responseHeaders});
   if(incoming.pathname==='/'&&upstream.status===200&&MOBILE_INPUT_SCRIPT!==null&&(responseHeaders.get('Content-Type')||'').includes('text/html')){
    response.headers.delete('Content-Length');response.headers.delete('ETag');
    return new HTMLRewriter().on('head',{element(e){e.append('<script defer src="/rak-mobile-input.js?v=20261106-2"></script>',{html:true})}}).transform(response);
   }
   return response;
  }catch{return Response.json({detail:'私人浏览器暂时无法连接'}, {status:502,headers:{'Cache-Control':'no-store'}})}
 }
};
