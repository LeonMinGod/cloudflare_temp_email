import { AsyncLocalStorage } from 'node:async_hooks';
import { Store,SqlStorage,Scheduler } from './storage.mjs';

export function createApp({root,site,guard,GameRun,AbuseState,siteSecrets,guardSecrets,assetFetcher}) {
  const scheduler=new Scheduler(),store=new Store(root+'/site.sqlite',scheduler),sql=new SqlStorage(root+'/guard.sqlite');
  const context=new AsyncLocalStorage(),instances=new Map();
  let guardObject;let active=false;
  const waitUntil=promise=>Promise.resolve(promise).catch(()=>console.log('{"event":"background_failed"}'));
  const gameEnv={...siteSecrets,KV:store.kv(),ASSETS:{fetch:assetFetcher||(()=>new Response(null,{status:404}))}};
  const guardEnv={...guardSecrets,KEYS:store.kv()};
  const gameFor=scope=>{
    let object=instances.get(scope);
    if(!object){object=new GameRun({storage:store.storage(scope),waitUntil},gameEnv);instances.set(scope,object);}
    return object;
  };
  gameEnv.GAME_RUNS={
    idFromName:name=>({name}),
    get:id=>({fetch:(input,init)=>scheduler.run(()=>{
      const scope=store.scopeFor(id.name,context.getStore()?.legacy||{});
      return gameFor(scope).fetch(input instanceof Request?input:new Request(input,init));
    })}),
  };
  const guardFor=()=>{
    if(!guardObject){const storage=store.storage('guard');storage.sql=sql;storage.transactionSync=fn=>sql.transactionSync(fn);guardObject=new AbuseState({storage,waitUntil},guardEnv);}
    return guardObject;
  };
  guardEnv.STATE={idFromName:name=>name,get:()=>({fetch:(input,init)=>scheduler.run(()=>guardFor().fetch(input instanceof Request?input:new Request(input,init)))})};
  const fetchSite=(request,meta={})=>context.run(meta,()=>site.fetch(request,gameEnv,{waitUntil}));
  const fetchGuard=request=>guard.fetch(request,guardEnv,{waitUntil});
  const alarmTimer=setInterval(()=>{
    if(!active)return;
    scheduler.run(async()=>{
      const rows=store.db.prepare('SELECT scope FROM alarms WHERE at<=? ORDER BY at LIMIT 16').all(Date.now());
      for(const {scope} of rows){
        store.db.prepare('DELETE FROM alarms WHERE scope=?').run(scope);
        if(scope==='guard')await guardFor().alarm();else await gameFor(scope).alarm();
      }
      // Expiration is checked on each read as well. Pruning is bounded.
      store.db.prepare('DELETE FROM kv WHERE name IN (SELECT name FROM kv WHERE expiration<=? LIMIT 128)').run(Math.floor(Date.now()/1000));
    }).catch(()=>console.log('{"event":"alarm_failed"}'));
  },1000);alarmTimer.unref();
  return {store,sql,scheduler,fetchSite,fetchGuard,gameEnv,guardEnv,
    activate(){active=true;},
    async close(){clearInterval(alarmTimer);await scheduler.run(()=>{sql.close();store.close();});},
  };
}
