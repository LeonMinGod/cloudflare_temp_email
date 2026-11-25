import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../../../.github/scripts/vps_monitor_proxy.js',import.meta.url),'utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
const env={MONITOR_ORIGIN_TOKEN:'a'.repeat(43)};
test('registration and foreign-origin writes never reach the private origin',async()=>{
  const old=globalThis.fetch;let called=false;globalThis.fetch=()=>{called=true;throw Error('Unexpected origin access');};
  try{
    for(const url of ['/api/beszel/create-user','/api/collections/users/records'])assert.equal((await worker.fetch(new Request('https://vps.leonmingod.com'+url,{method:'POST',body:'{}'}),env)).status,403);
    assert.equal((await worker.fetch(new Request('https://vps.leonmingod.com/api/collections/users/auth-with-password',{method:'POST',body:'{}',headers:{Origin:'https://other.invalid'}}),env)).status,403);
    assert.equal(called,false);
  }finally{globalThis.fetch=old;}
});
test('proxy uses fixed TLS origin, preserves caller auth and disables private response caching',async()=>{
  const old=globalThis.fetch;let seen;
  globalThis.fetch=async(url,init)=>{seen={url,init};return new Response('{"items":[]}',{headers:{'Content-Type':'application/json','Cache-Control':'public'}});};
  try{
    const request=new Request('https://vps.leonmingod.com/api/collections/systems/records?page=1',{headers:{Authorization:'test-owner-session','X-Forwarded-For':'spoofed'}});
    const response=await worker.fetch(request,env);
    assert.equal(seen.url,'https://sj.leonmingod.com/_vpsmon/'+env.MONITOR_ORIGIN_TOKEN+'/api/collections/systems/records?page=1');
    assert.equal(seen.init.cache,'no-store');assert.equal(seen.init.headers.get('Authorization'),'test-owner-session');assert.equal(seen.init.headers.get('X-Forwarded-For'),null);
    assert.equal(response.headers.get('Cache-Control'),'no-store');assert.match(response.headers.get('X-Robots-Tag'),/noindex/);
  }finally{globalThis.fetch=old;}
});
