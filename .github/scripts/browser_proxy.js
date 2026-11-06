export default {
 async fetch(request, env) {
  const incoming=new URL(request.url), origin=new URL('https://sj.leonmingod.com');
  if(incoming.protocol!=='https:'){incoming.protocol='https:';return Response.redirect(incoming.href,308)}
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
   return new Response(upstream.body,{status:upstream.status,headers:responseHeaders});
  }catch{return Response.json({detail:'私人浏览器暂时无法连接'}, {status:502,headers:{'Cache-Control':'no-store'}})}
 }
};
