const HOST='vps.leonmingod.com';
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.hostname!==HOST)return new Response(null,{status:404});
    if(url.protocol!=='https:')return Response.redirect('https://'+HOST+url.pathname+url.search,308);
    if(!/^[A-Za-z0-9_-]{43}$/.test(env.MONITOR_ORIGIN_TOKEN||''))return new Response('Service unavailable',{status:503});
    const origin=request.headers.get('Origin');
    if(origin&&origin!=='https://'+HOST&&!['GET','HEAD'].includes(request.method))return new Response(null,{status:403});
    // Only the pre-created owner account is used; no public onboarding endpoint.
    if(url.pathname==='/api/beszel/create-user'||(url.pathname==='/api/collections/users/records'&&request.method==='POST'))return new Response(null,{status:403});
    const headers=new Headers(request.headers);headers.delete('Host');
    for(const name of ['X-Forwarded-For','X-Forwarded-Host','X-Forwarded-Proto','X-Real-IP','X-Monitor-Origin'])headers.delete(name);
    const prefix='/_vpsmon/'+env.MONITOR_ORIGIN_TOKEN;
    const target='https://sj.leonmingod.com'+prefix+url.pathname+url.search;
    const response=await fetch(target,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,redirect:'manual',cache:'no-store'});
    if(response.status===101)return response;
    const outgoing=new Headers(response.headers);outgoing.set('X-Robots-Tag','noindex, nofollow, noarchive');outgoing.set('Referrer-Policy','same-origin');
    if(url.pathname.startsWith('/api/')||!url.pathname.startsWith('/assets/'))outgoing.set('Cache-Control','no-store');
    const location=outgoing.get('Location');
    if(location){
      const resolved=new URL(location,target);
      if(resolved.hostname==='sj.leonmingod.com')outgoing.set('Location','https://'+HOST+resolved.pathname.replace(prefix,'')+resolved.search);
    }
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers:outgoing});
  }
};
