import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomBytes} from 'node:crypto';
import {Miniflare} from 'miniflare';
import {canonicalIP} from '../src/index.mjs';
test('canonical IPv4/IPv6 identity cannot split one address into aliases',()=>{
 assert.equal(canonicalIP('2001:4860:4860:0:0:0:0:8888'),'2001:4860:4860::8888');
 assert.equal(canonicalIP('::ffff:8.8.8.8'),'8.8.8.8');assert.equal(canonicalIP('8.8.8.8,1.1.1.1'),null);
});
test('persistent SQLite worker enforces signatures, deduplication, expiry state, controls and safe logging',async()=>{
 const mf=new Miniflare({modules:true,scriptPath:'dist/index.js',compatibilityDate:'2025-04-01',compatibilityFlags:['nodejs_compat'],bindings:{SERVICE_SECRET:'service-test-secret',ADMIN_SECRET:'admin-test-secret'},durableObjects:{STATE:{className:'AbuseState',useSQLite:true}}});
 async function rpc(body,admin=false,secret=admin?'admin-test-secret':'service-test-secret',nonce=randomBytes(16).toString('hex')){
  const text=JSON.stringify(body),stamp=String(Date.now()),path=admin?'/admin':'/rpc';
  const signature=createHmac('sha256',secret).update(`${stamp}\n${nonce}\nPOST\n${path}\n${text}`).digest('hex');
  return mf.dispatchFetch('https://guard.example'+path,{method:'POST',headers:{'X-CPA-Guard':`${stamp}:${nonce}:${signature}`},body:text});
 }
 try{
  assert.equal((await rpc({action:'enable'},true,'service-test-secret')).status,403);
  assert.equal((await mf.dispatchFetch('https://guard.example/rpc',{method:'POST',body:'{}'})).status,403);
  assert.equal((await rpc({action:'enable'},true)).status,200);
  const separated=randomBytes(16).toString('hex');
  await rpc({action:'status'},true,undefined,separated);
  assert.equal((await rpc({action:'check',ip:'9.9.9.9'},false,undefined,separated)).status,200,'Admin replay entries must not cross into service RPC');
  const ip='8.8.8.8',event={action:'observe',ip,status:404,unknownApiPath:true,pathHash:'scan'};
  const nonce=randomBytes(16).toString('hex');await rpc(event,false,undefined,nonce);await rpc(event,false,undefined,nonce);
  for(let i=1;i<19;i++)assert.equal((await (await rpc(event)).json()).action,'allow');
  const banned=await (await rpc(event)).json();assert.equal(banned.action,'block');assert.equal(banned.retryAfter,3600);
  const status=await (await rpc({action:'status'},true)).json();assert.equal(status.peers[0].counters['404'],20);assert.equal(status.records.length,1);
  assert.equal((await (await rpc({action:'check',ip:'1.1.1.1'})).json()).action,'allow');
  await rpc({action:'allow',ip},true);assert.equal((await (await rpc({action:'check',ip})).json()).action,'allow');
  await rpc({action:'unallow',ip},true);assert.equal((await (await rpc({action:'check',ip})).json()).action,'block');
  await rpc({action:'unban',ip},true);assert.equal((await (await rpc({action:'check',ip})).json()).action,'allow');
  assert.equal((await (await rpc({action:'status',ip},true)).json()).peers[0].bans.length,1,'Manual unban preserves repeat history unless explicitly reset');
  await rpc({action:'disable'},true);for(let i=0;i<20;i++)await rpc(event);
  const disabled=await (await rpc({action:'check',ip})).json();assert.equal(disabled.action,'allow');assert.equal(disabled.enforced,false);
 }finally{await mf.dispose()}
});
