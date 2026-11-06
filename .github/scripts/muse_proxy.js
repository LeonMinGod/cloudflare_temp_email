const BOOTSTRAP = `<script>(()=>{const k=new URLSearchParams(location.hash.slice(1)).get('key');if(k){localStorage.setItem('muse2api_key',k);history.replaceState(null,'',location.pathname+location.search)}})()</script>`;
export default {
  async fetch(request, env) {
    const incoming = new URL(request.url);
    if (incoming.pathname === '/readyz' && !request.headers.get('Authorization')) {
      return Response.json({error:'Authentication required'}, {status:401});
    }
    const origin = new URL('https://sj.leonmingod.com');
    origin.pathname = env.MUSE_ORIGIN_PREFIX + incoming.pathname;
    origin.search = incoming.search;
    const headers = new Headers(request.headers);
    headers.delete('Cookie');
    headers.set('Host', 'sj.leonmingod.com');
    headers.set('X-Forwarded-Host', incoming.host);
    headers.set('X-Forwarded-Proto', 'https');
    try {
      const upstream = await fetch(origin, {method:request.method, headers,
        body:['GET','HEAD'].includes(request.method)?undefined:request.body, redirect:'manual'});
      const responseHeaders = new Headers(upstream.headers);
      responseHeaders.set('Cache-Control', 'no-store');
      responseHeaders.set('Referrer-Policy', 'no-referrer');
      responseHeaders.set('X-Content-Type-Options', 'nosniff');
      let response = new Response(upstream.body, {status:upstream.status, headers:responseHeaders});
      if (upstream.headers.get('Content-Type')?.includes('text/html')) {
        response = new HTMLRewriter().on('head', {element(e){e.prepend(BOOTSTRAP,{html:true})}}).transform(response);
      }
      return response;
    } catch {
      return Response.json({error:'Muse origin temporarily unavailable'}, {status:502});
    }
  }
};
