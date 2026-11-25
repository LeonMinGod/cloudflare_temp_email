import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateKeyPairSync,sign,privateDecrypt,constants,createDecipheriv } from 'node:crypto';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

test('migration hooks reject unsigned export, encrypt secrets, retain normal behavior and freeze writes',async()=>{
  const session='rak-test-session',signer=generateKeyPairSync('rsa',{modulusLength:3072}),recipient=generateKeyPairSync('rsa',{modulusLength:3072});
  const config={role:'site',session,signing_public_der:signer.publicKey.export({type:'spki',format:'der'}).toString('base64'),recipient_public_der:recipient.publicKey.export({type:'spki',format:'der'}).toString('base64')};
  const source=fs.readFileSync('../rak-vps-site/cf-wrapper.mjs','utf8').replaceAll('__OBJECT__','GameRun').replace('__CONFIG__',JSON.stringify(config));
  const original=`export default {fetch:()=>new Response('original-business')};export class GameRun {constructor(ctx,env){this.ctx=ctx;this.env=env;}async fetch(){await this.ctx.storage.put('existing','retained');return new Response('object-original');}async alarm(){await this.ctx.storage.deleteAll();}}`;
  const bundled=await build({stdin:{contents:source,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',external:['cloudflare:workers'],plugins:[{name:'test-original',setup(b){b.onResolve({filter:/migration-original\.js$/},()=>({path:'original',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:original,loader:'js'}));}}]});
  const mf=new Miniflare({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2025-04-01',bindings:{KEY_ENC_SECRET:'never-public',FREE_TOKEN_OPS_SECRET:'test-ops-secret'},kvNamespaces:['KV'],durableObjects:{GAME_RUNS:{className:'GameRun',useSQLite:true}}});
  async function call(body){
    const stamp=String(Date.now()),raw=JSON.stringify(body);const signature=sign('sha256',Buffer.from('lmg-cf-migration-v1\n'+session+'\n'+stamp+'\n'+raw),signer.privateKey).toString('base64');
    const response=await mf.dispatchFetch('https://leonmingod.com/_migration/'+session,{method:'POST',body:raw,headers:{'X-Migration-Time':stamp,'X-Migration-Signature':signature}});assert.equal(response.status,200);
    const envelope=await response.json();assert.equal(envelope.kind,body.kind);const key=privateDecrypt({key:recipient.privateKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(envelope.wrapped_key,'base64'));
    const data=Buffer.from(envelope.ciphertext,'base64'),decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.nonce,'base64'));decipher.setAAD(Buffer.from('lmg-migration-transport-v1\n'+session+'\n'+body.kind));decipher.setAuthTag(data.subarray(-16));
    return JSON.parse(Buffer.concat([decipher.update(data.subarray(0,-16)),decipher.final()]).toString());
  }
  try{
    assert.equal((await mf.dispatchFetch('https://leonmingod.com/_migration/'+session,{method:'POST',body:'{}'})).status,403);
    assert.equal(await (await mf.dispatchFetch('https://leonmingod.com/api/test')).text(),'original-business');
    assert.equal((await call({action:'bindings',kind:'test-bindings'})).secrets.KEY_ENC_SECRET,'never-public');
    const kv=await mf.getKVNamespace('KV');await kv.put('key:existing','{"status":"revoked"}',{expiration:Math.floor(Date.now()/1000)+100});
    const exported=await call({action:'kv-all',kind:'test-kv-export'});assert.equal(exported.records[0].name,'key:existing');assert.ok(exported.records[0].expiration);assert.equal(exported.complete,true);
    const frozen=await call({action:'control',phase:'freeze',kind:'test-freeze'});assert.equal(frozen.phase,'freeze');assert.equal(frozen.active,0);
    assert.equal((await mf.dispatchFetch('https://leonmingod.com/api/test',{method:'POST',body:'{}'})).status,503);
    assert.equal(await (await mf.dispatchFetch('https://leonmingod.com/')).text(),'original-business');
    const resumed=await call({action:'control',phase:'normal',kind:'test-resume'});assert.equal(resumed.phase,'normal');
    assert.equal((await mf.dispatchFetch('https://leonmingod.com/api/test')).status,200);
  }finally{await mf.dispose();}
});
