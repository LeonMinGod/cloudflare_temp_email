import test from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { RULES, replay, validateTrace, createGame, step } from '../public/free-token/game/engine-v6.mjs';
import { verifyRun, verifyProgress } from '../src/game.js';
import * as live from '../public/free-token/game/engine-v7.mjs';
import { verifyHuman, operationProbe } from '../src/security.js';
import { readFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import { build } from 'esbuild';
import { play } from '../scripts/calibrate.mjs';
import { playPlanned } from '../scripts/planner.mjs';

const TEST_ENC_SECRET=btoa(String.fromCharCode(...Array.from({length:32},(_,i)=>i)));

function winning(seed, engine) {
  if(!engine){for(const options of [{reaction:6,horizon:96},{reaction:4,horizon:120},{reaction:5,horizon:100}]){const result=playPlanned(seed,options);if(result.state.won)return result;}return null;}
  for (const reaction of [4,7,10,14]) for (const foresight of [20,30,45,60]) {
    const result=play(seed,reaction,foresight,engine);
    if(result.state.won)return result;
  }
  return null;
}

test('server replay agrees with completed client actions and rejects malformed traces',()=>{
  const {state,trace}=winning(27399508);
  assert.deepEqual(replay(27399508,trace),{won:true,jade:state.jade,shields:state.shields,frames:2700});
  for(const invalid of [[],[[1,500]],[[0,500],[0,600]],[[0,1001]],[[0,NaN]],[[0,1.5]],[[0,500],[2700,100]]])assert.equal(validateTrace(invalid),false);
  assert.equal(replay(1,[[0,500]]).won,false);
});

function liveRun(now = 100000) {
  return { protocol:'live-v1',rulesVersion:7,sessionHash:'browser-a',started:now,expires:now+180000,lastSeen:now,claimed:false,receipt:'receipt-0',state:live.createGame(27399508) };
}
test('offline solve plus waiting cannot claim; legacy reward protocols are retired',()=>{
  const now=100000,run=liveRun(now),trace=winning(27399508).trace;
  assert.equal(verifyRun(run,{sessionHash:'browser-a',receipt:run.receipt,trace},now+45000).status,400);
  assert.equal(verifyRun(run,{sessionHash:'browser-a',receipt:run.receipt},now+45000).status,400);
  for(const version of [1,2,3,4,5,6])assert.equal(verifyRun({seed:27399508,rulesVersion:version,sessionHash:'browser-a',started:now,expires:now+180000},{sessionHash:'browser-a',trace},now+46000).status,410);
});
test('live prefixes reject speedups, delayed batches, overwritten receipts and malformed inputs',()=>{
  const now=100000,run=liveRun(now),packet={sessionHash:'browser-a',receipt:run.receipt,frame:60,trace:[[0,500]]};
  assert.equal(verifyProgress(run,packet,now+1000).status,200);
  assert.equal(verifyProgress(run,packet,now+100).status,400);
  assert.equal(verifyProgress(run,packet,now+45000).status,400);
  assert.equal(verifyProgress(run,{...packet,frame:2700},now+45000).status,400);
  assert.equal(verifyProgress(run,{...packet,receipt:'old'},now+1000).status,409);
  assert.equal(verifyProgress(run,{...packet,sessionHash:'other'},now+1000).status,403);
  for(const trace of [[],[[1,500]],[[0,500],[0,600]],[[0,1001]],[[0,NaN]],[[0,500],[60,1]]])assert.equal(verifyProgress(run,{...packet,trace},now+1000).status,400);
  assert.equal(run.state.frame,0,'Rejected and successful checks do not mutate stored prefixes');
});
test('future encounter entropy is necessary and cannot be replaced after commitment',()=>{
  const state=live.createGame(1);
  for(let i=0;i<180;i++)live.step(state,500);
  assert.throws(()=>live.step(state,500),/连接中断/);
  live.installEntropy(state,[{frame:180,seed:987654321}]);live.step(state,500);assert.equal(state.frame,181);
  assert.throws(()=>live.installEntropy(state,[{frame:180,seed:1}]),/committed/);
});
test('finish checks authoritative state, timing, identity, receipt and single-use claim',()=>{
  const now=100000,run=liveRun(now-46000);
  run.lastSeen=now;run.state={...run.state,frame:2700,jade:24,shields:2,won:true,done:true};
  const body={sessionHash:run.sessionHash,receipt:run.receipt};
  assert.equal(verifyRun(run,body,now).status,200);
  assert.equal(verifyRun({...run,claimed:true},body,now).status,409);
  assert.equal(verifyRun(run,{...body,sessionHash:'wrong'},now).status,403);
  assert.equal(verifyRun(run,{...body,receipt:'wrong'},now).status,409);
  assert.equal(verifyRun({...run,expires:now-1},body,now).status,410);
  assert.equal(verifyRun({...run,started:now-1000},body,now).status,400);
  assert.equal(verifyRun({...run,lastSeen:now-8000},body,now).status,400);
  assert.equal(verifyRun({...run,state:{...run.state,jade:23}},body,now).status,400);
});
test('real SQLite Durable Object locks prefixes, supports exact retries and grants one concurrent reward',async()=>{
  const fixtureClass=`export {default, Site} from './src/index.js';import {GameRun} from './src/game.js';export class TestGameRun extends GameRun { async fetch(request) { const path=new URL(request.url).pathname; if(path==='/test-read')return Response.json(await this.ctx.storage.get('run')); if(path==='/test-put'){await this.ctx.storage.put('run',await request.json());return Response.json({ok:true});}return super.fetch(request); }};`;
  const bundled=await build({stdin:{contents:fixtureClass,resolveDir:process.cwd()},bundle:true,format:'esm',target:'es2022',external:['cloudflare:workers'],write:false});
  const mf=new Miniflare({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2025-04-01',bindings:{FREE_TOKEN_RENDER_KEY:'test-reward-placeholder',FREE_TOKEN_LOCAL_TEST:'local-test-only',KEY_ENC_SECRET:TEST_ENC_SECRET},durableObjects:{GAME_RUNS:{className:'TestGameRun',useSQLite:true}},serviceBindings:{ASSETS:()=>new Response('Not found',{status:404})}});
  const origin='http://localhost',headers={'Content-Type':'application/json',Origin:origin,'User-Agent':'test-browser'};
  const send=(action,body,cookie)=>mf.dispatchFetch(origin+'/api/free-token/game/'+action,{method:'POST',headers:{...headers,...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
  try{
    const initial=await send('start',{humanToken:'local-test'});assert.equal(initial.status,200);
    const challenge=await initial.json(),cookie=initial.headers.get('set-cookie').split(';')[0];assert.equal(challenge.rules.version,8);assert.equal(challenge.protocol,'live-v1');assert.equal(challenge.entropy,undefined);
    const ns=await mf.getDurableObjectNamespace('GAME_RUNS'),stub=ns.get(ns.idFromName(challenge.id));
    const stored=await (await stub.fetch('https://game.internal/test-read')).json();stored.started=Date.now()-1100;stored.lastSeen=stored.started;
    await stub.fetch('https://game.internal/test-put',{method:'POST',body:JSON.stringify(stored)});
    const packet={id:challenge.id,receipt:challenge.receipt,frame:60,trace:[[0,500]]};
    const progress=await send('progress',packet,cookie);assert.equal(progress.status,200);const receipt=await progress.json();assert.deepEqual(receipt.entropy.map(e=>e.frame),[180]);
    assert.deepEqual(await (await send('progress',packet,cookie)).json(),receipt,'Exact lost-response retry is idempotent');
    assert.equal((await send('progress',{...packet,trace:[[0,600]]},cookie)).status,409);
    assert.equal((await send('finish',{id:challenge.id,trace:winning(27399508).trace},cookie)).status,400);
    assert.equal((await send('finish',{id:challenge.id,receipt:receipt.receipt})).status,403);
    const ready=await (await stub.fetch('https://game.internal/test-read')).json();ready.started=Date.now()-45000;ready.lastSeen=Date.now();ready.state={...ready.state,frame:2700,jade:24,shields:2,done:true,won:true};
    await stub.fetch('https://game.internal/test-put',{method:'POST',body:JSON.stringify(ready)});
    const responses=await Promise.all(Array.from({length:6},()=>send('finish',{id:challenge.id,receipt:receipt.receipt},cookie)));
    assert.equal(responses.filter(r=>r.status===200).length,1);assert.equal(responses.filter(r=>r.status===409).length,5);
    const won=responses.find(r=>r.status===200);const reward=await won.json();assert.equal(reward.won,true);assert.equal(reward.claimable,true);assert.equal(reward.apiKey,undefined);assert.match(won.headers.get('Set-Cookie'),/lmg_claim_local=/);
  }finally{await mf.dispose();}
});

test('the second damaging hit ends the two-shield run',()=>{
  const state=createGame(1);
  const hit=()=>{state.objects.push({id:999,type:'hazard',x:state.x,y:RULES.playerY-1,speed:1,vx:0,radius:26});step(state,state.target);};
  assert.equal(state.shields,2);hit();assert.equal(state.shields,1);assert.equal(state.done,false);
  while(state.cooldown>0)step(state,state.target);
  hit();assert.equal(state.shields,0);assert.equal(state.done,true);assert.equal(state.won,false);
});




test('rage begins on the last five jade, not on remaining seconds',()=>{
  const late=createGame(1);late.frame=RULES.frames-300;late.jade=RULES.goal-6;step(late);assert.equal(late.rageAt,-1);
  const early=createGame(1);early.frame=100;early.jade=RULES.goal-5;step(early);assert.equal(early.rageAt,100);
});

test('collecting the goal stops jade drops but requires full survival time',()=>{
  const state=createGame(1);state.jade=RULES.goal;state.objects=[{id:1,type:'jade',x:100,y:0,vx:0,speed:7,radius:19}];step(state);
  assert.equal(state.done,false);assert.equal(state.won,false);assert.ok(state.objects.every(o=>o.type!=='jade'));
  state.objects=[];state.frame=RULES.frames-2;step(state);assert.equal(state.done,false);step(state);assert.equal(state.won,true);
});




test('swords keep their initial trajectory at the edge instead of ricocheting',()=>{
  const state=createGame(1);state.objects=[{id:999,type:'hazard',x:36,y:0,speed:10,vx:-4,radius:26}];
  step(state);assert.equal(state.objects[0].vx,-4);assert.equal(state.objects[0].x,32);
  for(let i=0;i<21;i++)step(state);
  assert.ok(!state.objects.some(o=>o.id===999),'Offscreen swords leave instead of turning back');
});

test('wall gaps remain reachable and clear of crossing swords throughout passage',()=>{
  let walls=0,protectedFrames=0;
  for(const jade of [0,19,24])for(let seed=1;seed<=30;seed++){
    const state=createGame(seed*6849877),seen=new Set();state.cooldown=RULES.frames+10;
    while(!state.done){
      state.jade=jade;step(state,Math.round(500+480*Math.sin(state.frame/133)));
      const frame=state.frame-1;
      for(const gap of state.corridors){
        if(!seen.has(gap.spawned)){
          seen.add(gap.spawned);walls++;assert.ok(gap.right-gap.left>=160);
          const distance=Math.max(gap.left-state.x,state.x-gap.right,0);
          assert.ok(18+Math.ceil(distance/RULES.maxMove)<gap.from-gap.spawned,'Gap is reachable after 300ms reaction');
        }
        if(frame<gap.from||frame>gap.until)continue;
        protectedFrames++;
        for(const o of state.objects){
          if(o.type!=='hazard')continue;
          const nearest=Math.max(gap.left,Math.min(gap.right,o.x));
          assert.ok(Math.hypot(nearest-o.x,RULES.playerY-o.y)>=o.radius+15,`Closed gap at seed ${seed}, frame ${frame}`);
        }
      }
    }
  }
  assert.ok(walls>900);assert.ok(protectedFrames>30000);
});




test('jade is collected at the visible sword tip and along the blade',()=>{
  for(const y of [RULES.playerY-RULES.pickupReach-30,RULES.playerY-48,RULES.playerY]){
    const state=createGame(1);state.frame=100;
    state.objects=[{id:999,type:'jade',x:state.x,y:y-7,speed:7,vx:0,radius:19}];step(state,500);
    assert.equal(state.collected,1);assert.equal(state.jade,1);assert.ok(state.pickupY<=RULES.playerY);
  }
  const state=createGame(1);state.frame=100;state.objects=[{id:999,type:'jade',x:state.x+36,y:RULES.playerY-70-7,speed:7,vx:0,radius:19}];step(state,500);assert.equal(state.collected,0);
});

test('extending pickup to the tip does not enlarge the damage hitbox',()=>{
  const state=createGame(1);state.frame=100;state.objects=[{id:999,type:'hazard',x:state.x,y:RULES.playerY-RULES.pickupReach-30-7,speed:7,vx:0,radius:26}];step(state,500);assert.equal(state.shields,2);assert.equal(state.hit,0);
});

test('gold grants five seconds without counting as jade and beats same-frame damage',()=>{
  const state=createGame(1);state.frame=100;
  const hazard=()=>({id:998,type:'hazard',x:state.x,y:RULES.playerY-1,speed:1,vx:0,radius:26});
  state.objects=[hazard(),{id:999,type:'ward',x:state.x,y:RULES.playerY-RULES.pickupReach-30-7,speed:7,vx:0,radius:24}];step(state,500);
  assert.equal(state.wardCollected,1);assert.equal(state.wardUntil,400);assert.equal(state.jade,0);assert.equal(state.shields,2);assert.equal(state.blocked,1);
  state.objects=[];state.frame=399;state.objects=[hazard()];step(state,500);assert.equal(state.shields,2);
  state.objects=[hazard()];step(state,500);assert.equal(state.shields,1,'Damage resumes exactly at expiry');
});

test('a second gold pickup refreshes five seconds instead of stacking time',()=>{
  const state=createGame(1);state.frame=200;state.wardUntil=450;state.objects=[{id:999,type:'ward',x:state.x,y:RULES.playerY-70-7,speed:7,vx:0,radius:24}];step(state,500);assert.equal(state.wardUntil,500);
});



test('availability exposes no secret and closed issuance blocks both claim paths',async()=>{
  for(const enabled of [false,true]){
    const mf=new Miniflare({modules:true,scriptPath:'dist/index.js',compatibilityDate:'2025-04-01',bindings:enabled?{FREE_TOKEN_RENDER_KEY:'availability-test-placeholder',FREE_TOKEN_TURNSTILE_SECRET:'test-turnstile-secret',KEY_ENC_SECRET:TEST_ENC_SECRET}:{},durableObjects:{GAME_RUNS:{className:'GameRun',useSQLite:true}},serviceBindings:{ASSETS:()=>new Response('Not found',{status:404})}});
    try{
      const response=await mf.dispatchFetch('http://localhost/api/free-token/status');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
      const text=await response.text();assert.equal(JSON.parse(text).open,enabled);assert.ok(!text.includes('availability-test-placeholder'));assert.ok(!text.includes('apiKey'));
      const headers={'Content-Type':'application/json',Origin:'http://localhost'};
      const claim=await mf.dispatchFetch('http://localhost/api/free-token/claim',{method:'POST',headers,body:JSON.stringify({oath:'义父',confirmed:true})});assert.equal(claim.status,enabled?200:503);
      if(enabled){
        const issued=await claim.json();assert.equal(issued.next,'email');assert.equal(issued.apiKey,undefined);
        const start=await mf.dispatchFetch('http://localhost/api/free-token/game/start',{method:'POST',headers,body:'{}'});assert.equal(start.status,403);
      }
      if(!enabled){assert.match((await claim.json()).error,/领取暂时不可用/);const start=await mf.dispatchFetch('http://localhost/api/free-token/game/start',{method:'POST',headers,body:'{}'});assert.equal(start.status,503);assert.match((await start.json()).error,/暂未开放/);}
    }finally{await mf.dispose();}
  }
});

test('human verification rejects missing, forged, reused, wrong-host and wrong-action tokens',async()=>{
  const request=new Request('https://leonmingod.com/api/free-token/claim',{method:'POST',headers:{Origin:'https://leonmingod.com'},body:'{}'});
  const env={FREE_TOKEN_TURNSTILE_SECRET:'unit-test-secret'};
  assert.equal((await verifyHuman(request,env,'','oath_claim')).status,403);
  const original=globalThis.fetch;let submitted;
  try{
    for(const data of [{success:false},{success:true,hostname:'evil.example',action:'oath_claim'},{success:true,hostname:'leonmingod.com',action:'game_start'}]){
      globalThis.fetch=async(url,init)=>{submitted=init.body;return Response.json(data);};
      assert.equal((await verifyHuman(request,env,'test-token','oath_claim')).status,403);
    }
    globalThis.fetch=async()=>Response.json({success:true,hostname:'leonmingod.com',action:'oath_claim'});
    assert.equal(await verifyHuman(request,env,'test-token','oath_claim'),null);
    assert.equal(submitted.get('response'),'test-token');
    globalThis.fetch=async()=>{throw new Error('network');};
    assert.equal((await verifyHuman(request,env,'test-token','oath_claim')).status,503);
  }finally{globalThis.fetch=original;}
  assert.equal((await verifyHuman(request,{FREE_TOKEN_LOCAL_TEST:'local-test-only'},'local-test','oath_claim')).status,503,'Local test mode cannot bypass production host verification');
});
test('operations probe is private, body-bound, path-bound and expires after 30 seconds',async()=>{
  const secret='test-private-ops-secret',timestamp=String(Date.now()),body='{"oath":"义父","confirmed":true}';
  const signature=createHmac('sha256',secret).update(`${timestamp}\nPOST\n/api/free-token/claim\n${body}`).digest('hex');
  const req=(path='/api/free-token/claim',text=body,stamp=timestamp)=>new Request('https://leonmingod.com'+path,{method:'POST',headers:{'X-LMG-Operation':stamp+':'+signature},body:text});
  assert.equal(await operationProbe(req(),{FREE_TOKEN_OPS_SECRET:secret}),true);
  assert.equal(await operationProbe(req('/api/free-token/game/start'),{FREE_TOKEN_OPS_SECRET:secret}),false);
  assert.equal(await operationProbe(req(undefined,'{}'),{FREE_TOKEN_OPS_SECRET:secret}),false);
  assert.equal(await operationProbe(req(undefined,undefined,String(Date.now()-60000)),{FREE_TOKEN_OPS_SECRET:secret}),false);
  assert.equal(await operationProbe(req(),{FREE_TOKEN_OPS_SECRET:'wrong'}),false);
});
