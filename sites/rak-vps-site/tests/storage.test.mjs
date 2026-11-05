import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHmac,randomBytes } from 'node:crypto';
import { Store,SqlStorage } from '../storage.mjs';
import { createApp } from '../app.mjs';
import { verifyBridge,bridgeMessage } from '../bridge.mjs';
import { GameRun } from '../../leonmingod-star-night/src/game.js';
import guard,{AbuseState} from '../../api-abuse-guard/src/index.mjs';

const directory=()=>fs.mkdtempSync(path.join(os.tmpdir(),'rak-adapter-'));
test('async rollback cannot discard concurrent KV writes; TTL survives reopening',async()=>{
  const root=directory();let store=new Store(root+'/site.sqlite');const storage=store.storage('game');
  let entered;const ready=new Promise(r=>entered=r);let release;const wait=new Promise(r=>release=r);
  const rollback=storage.transaction(async tx=>{await tx.put('run',{bad:true});entered();await wait;throw Error('rollback');});
  await ready;const unrelated=store.kv().put('key:valid','persistent',{expiration:Math.floor(Date.now()/1000)+60});
  release();await assert.rejects(rollback,/rollback/);await unrelated;
  assert.equal(await storage.get('run'),undefined);store.close();store=new Store(root+'/site.sqlite');
  assert.equal(await store.kv().get('key:valid'),'persistent');
  await store.kv().put('expired','secret',{expiration:Math.floor(Date.now()/1000)-1});assert.equal(await store.kv().get('expired'),null);
  const listing=await store.kv().list();assert.deepEqual(listing.keys.map(x=>x.name),['key:valid']);assert.ok(listing.keys[0].expiration);
  store.close();fs.rmSync(root,{recursive:true});
});
test('CF object mapping retains imported limits and remains stable after restart',async()=>{
  const root=directory();let store=new Store(root+'/site.sqlite');const legacy='a'.repeat(64),name='limit:existing-browser';
  await store.storage(legacy).put('rate:start',Array(20).fill(Date.now()));
  assert.equal(store.scopeFor(name,{[name]:legacy}),legacy);store.close();store=new Store(root+'/site.sqlite');
  assert.equal(store.scopeFor(name,{}),legacy);
  const run=new GameRun({storage:store.storage(legacy)},{});
  const response=await store.scheduler.run(()=>run.fetch(new Request('https://game.internal/limit',{method:'POST',body:'{"action":"start"}'})));
  assert.equal(response.status,429);store.close();fs.rmSync(root,{recursive:true});
});
test('native guard persists authorization usage and sync rollback',async()=>{
  const root=directory();const sql=new SqlStorage(root+'/probe.sqlite');
  sql.exec('CREATE TABLE t(v TEXT)');assert.throws(()=>sql.transactionSync(()=>{sql.exec('INSERT INTO t VALUES (?)','discard');throw Error('abort');}));assert.equal([...sql.exec('SELECT * FROM t')].length,0);sql.close();
  const key='b'.repeat(64),secret='test-service-secret';
  const make=()=>createApp({root,site:{fetch:()=>new Response()},guard,GameRun,AbuseState,siteSecrets:{},guardSecrets:{SERVICE_SECRET:secret}});
  let app=make();await app.gameEnv.KV.put('key:'+key,JSON.stringify({status:'active',email:'test@example.invalid',created_at:new Date().toISOString()}));
  async function authorize(){
    const stamp=String(Date.now()),nonce=randomBytes(16).toString('hex');const body=JSON.stringify({key_sha256:key,path:'/v1/chat/completions'});
    const signature=createHmac('sha256',secret).update(stamp+'\n'+nonce+'\nPOST\n/v1/authorize\n'+body).digest('hex');
    const result=await app.fetchGuard(new Request('https://guard.workers.dev/v1/authorize',{method:'POST',body,headers:{'X-CPA-Guard':stamp+':'+nonce+':'+signature}}));assert.equal(result.status,200);return result.json();
  }
  const first=await authorize();assert.equal(first.allow,true);const consumed=app.sql.exec("SELECT allowed FROM quotas WHERE kind='key' AND id=?",key)[0].allowed;
  await app.close();app=make();assert.equal(app.sql.exec("SELECT allowed FROM quotas WHERE kind='key' AND id=?",key)[0].allowed,consumed);assert.equal((await authorize()).allow,true);
  assert.equal(app.sql.exec("SELECT allowed FROM quotas WHERE kind='key' AND id=?",key)[0].allowed,consumed+1);
  await app.close();fs.rmSync(root,{recursive:true});
});
test('origin signature binds browser identity, original URL and request bytes',()=>{
  const secret='test-bridge-secret',meta={role:'site',at:Date.now(),url:'https://leonmingod.com/api/free-token/claim',ip:'203.0.113.1',headers:{cookie:'session=one','user-agent':'browser'},legacy:{}};
  const body=Buffer.from('{"oath":"义父"}');const headers=new Headers({'X-LMG-Origin':Buffer.from(JSON.stringify(meta)).toString('base64'),'X-LMG-Origin-Signature':createHmac('sha256',secret).update(bridgeMessage(meta,'POST',body)).digest('hex')});
  assert.deepEqual(verifyBridge(headers,'POST',body,secret),meta);assert.equal(verifyBridge(headers,'POST',Buffer.from('changed'),secret),null);
  headers.set('X-LMG-Origin',Buffer.from(JSON.stringify({...meta,ip:'1.1.1.1'})).toString('base64'));assert.equal(verifyBridge(headers,'POST',body,secret),null);
});
