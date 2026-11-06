const failures=new Map();
const MOBILE_INPUT_SCRIPT = null;
function equal(a,b){let bad=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)bad|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return bad===0}
export default {
 async fetch(request, env) {
  const incoming=new URL(request.url), origin=new URL('https://sj.leonmingod.com');
  if(incoming.protocol!=='https:'){incoming.protocol='https:';return Response.redirect(incoming.href,308)}
  if(env.BROWSER_AUTH_SHA256){
   const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(request.headers.get('Authorization')||''));
   const actual=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
   if(!equal(actual,env.BROWSER_AUTH_SHA256)){
    const now=Date.now(),ip=request.headers.get('CF-Connecting-IP')||'unknown';
    if(failures.size>5000)failures.clear();
    const old=failures.get(ip),state=old&&now-old.since<60000?old:{since:now,count:0};state.count++;failures.set(ip,state);
    return new Response('Private Chrome login required',{status:state.count>10?429:401,headers:{'WWW-Authenticate':'Basic realm="restricted", charset="UTF-8"','Cache-Control':'no-store','Strict-Transport-Security':'max-age=31536000','X-Frame-Options':'DENY'}});
   }
  }
  if(incoming.pathname==='/rak-mobile-input.js'&&MOBILE_INPUT_SCRIPT!==null){
   return new Response(MOBILE_INPUT_SCRIPT,{headers:{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Strict-Transport-Security':'max-age=31536000','X-Frame-Options':'DENY','Content-Security-Policy':"frame-ancestors 'none'"}});
  }
  origin.pathname=env.BROWSER_ORIGIN_PREFIX+incoming.pathname;origin.search=incoming.search;
  const headers=new Headers(request.headers);
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
   if(!responseHeaders.has('Content-Security-Policy'))responseHeaders.set('Content-Security-Policy',"frame-ancestors 'none'");
   const response=new Response(upstream.body,{status:upstream.status,headers:responseHeaders});
   if(incoming.pathname==='/'&&upstream.status===200&&MOBILE_INPUT_SCRIPT!==null&&(responseHeaders.get('Content-Type')||'').includes('text/html')){
    response.headers.delete('Content-Length');response.headers.delete('ETag');
    return new HTMLRewriter().on('head',{element(e){e.append('<script defer src="/rak-mobile-input.js?v=20261106-1"></script>',{html:true})}}).transform(response);
   }
   return response;
  }catch{return Response.json({detail:'私人浏览器暂时无法连接'}, {status:502,headers:{'Cache-Control':'no-store'}})}
 }
};
