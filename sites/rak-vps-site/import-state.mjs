import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createHash,webcrypto } from 'node:crypto';
import { Store,SqlStorage,Scheduler } from './storage.mjs';

const [root,input,stage='stage']=process.argv.slice(2);
if(!['stage','final'].includes(stage))throw Error('Invalid destination');
const state=JSON.parse(fs.readFileSync(input,'utf8'));
const directory=root+'/data/website'+(stage==='stage'?'-stage':'');
fs.mkdirSync(directory,{recursive:true,mode:0o700});
if(stage==='final'&&fs.existsSync(root+'/private/site-active'))throw Error('Refusing to replace active registry');
const scheduler=new Scheduler(),store=new Store(directory+'/site.sqlite',scheduler),sql=new SqlStorage(directory+'/guard.sqlite');
const metadata=JSON.parse(fs.readFileSync(root+'/website/live/metadata.json','utf8'));
const {AbuseState}=await import(pathToFileURL(root+'/website/live/guard/'+metadata.workers.guard.main));
const storage=store.storage('guard');storage.sql=sql;storage.transactionSync=fn=>sql.transactionSync(fn);
new AbuseState({storage},{KEYS:store.kv()}); // Create the exact live schema before importing rows.
let emailCount=0,decrypted=0,keyCount=0,revoked=0,objectCount=0;
try{
  const rawKey=Buffer.from(state['site-bindings'].secrets.KEY_ENC_SECRET,'base64');
  if(rawKey.length!==32)throw Error('Original key encryption binding missing');
  const key=await webcrypto.subtle.importKey('raw',rawKey,'AES-GCM',false,['decrypt']);
  // Verify every retained ciphertext before modifying either destination database.
  for(const row of state['site-kv'].records){
    if(row.value===null)continue;
    if(row.name.startsWith('email:')){
      emailCount++;const record=JSON.parse(row.value),sealed=record.key_enc;
      if(sealed){
        const email=row.name.slice(6);const plain=Buffer.from(await webcrypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(sealed.iv,'base64'),additionalData:Buffer.from('lmg-key-enc-v1\n'+email)},key,Buffer.from(sealed.ct,'base64')));
        if(createHash('sha256').update(plain).digest('hex')!==record.key_sha256)throw Error('Email ciphertext/hash mismatch');
        decrypted++;
      }
    }
    if(row.name.startsWith('key:')){keyCount++;if(JSON.parse(row.value).status!=='active')revoked++;}
  }
  await store.transaction(async()=>{
    store.db.exec('DELETE FROM kv; DELETE FROM objects; DELETE FROM alarms; DELETE FROM object_names');
    for(const row of state['site-kv'].records){
      if(row.value===null)continue;
      await store.kv().put(row.name,row.value,{...(row.expiration?{expiration:row.expiration}:{}),...(row.metadata===null?{}:{metadata:row.metadata})});
    }
    for(const [name,exported]of Object.entries(state))if(name.startsWith('site-objects-')){
      for(const object of exported.objects){
        objectCount++;
        for(const [key,value]of object.entries)await store.storage(object.id).put(key,value);
        if(object.alarm)await store.storage(object.id).setAlarm(object.alarm);
      }
    }
    for(const [key,value]of state['guard-state'].entries)await store.storage('guard').put(key,value);
    if(state['guard-state'].alarm)await store.storage('guard').setAlarm(state['guard-state'].alarm);
    sql.transactionSync(()=>{
      const allowed=['peers','audit','replay','control','quotas','key_flush','kv_budget','guard_write_budget'];
      for(const table of allowed){
        const rows=state['guard-state'].tables[table];if(!Array.isArray(rows))throw Error('Guard table missing');
        const columns=sql.exec('PRAGMA table_info('+table+')').map(r=>r.name);sql.exec('DELETE FROM '+table);
        const query='INSERT INTO '+table+' ('+columns.join(',')+') VALUES ('+columns.map(()=>'?').join(',')+')';
        for(const row of rows){if(Object.keys(row).some(key=>!columns.includes(key)))throw Error('Unknown guard column');sql.exec(query,...columns.map(key=>row[key]??null));}
      }
    });
  });
  for(const db of [store.db,sql.db])if(Object.values(db.prepare('PRAGMA quick_check').get())[0]!=='ok')throw Error('Imported SQLite integrity failure');
  const secrets={site:state['site-bindings'].secrets,guard:state['guard-bindings'].secrets};
  const secretPath=root+'/private/site-secrets'+(stage==='stage'?'-stage':'')+'.json';
  fs.writeFileSync(secretPath,JSON.stringify(secrets),{mode:0o600});
  console.log(JSON.stringify({kv_records:store.db.prepare('SELECT count(*) AS n FROM kv').get().n,email_bindings:emailCount,ciphertexts_verified:decrypted,legacy_without_ciphertext:emailCount-decrypted,key_records:keyCount,revoked_preserved:revoked,objects:objectCount,guard_tables:8,guard_quotas:sql.exec('SELECT count(*) AS n FROM quotas')[0].n,sqlite_integrity:true,original_secrets_preserved:true}));
}finally{sql.close();store.close();}
