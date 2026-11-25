import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,observe,check,POLICY,metrics} from '../src/policy.mjs';
const bad={status:404,unknownApiPath:true,pathHash:'one'};
const now=1800000000000;
test('twenty abnormalities in five minutes trigger exactly one expiring one-hour ban',()=>{
 const s=initialState();for(let i=0;i<19;i++)assert.equal(observe(s,bad,now+i*1000).action,'allow');
 assert.equal(observe(s,bad,now+19000).action,'block');const until=s.active.until;assert.equal(until,now+19000+POLICY.shortBan);
 for(let i=0;i<100;i++)observe(s,{status:403,gatewayDenied:true},now+20000+i);
 assert.equal(s.active.until,until);assert.equal(s.bans.length,1);assert.equal(check(s,until).action,'allow');
});
test('daily low-rate probes trigger 24 hours despite never reaching short windows',()=>{
 const s=initialState();for(let i=0;i<29;i++)assert.equal(observe(s,bad,now+i*1800000).action,'allow');
 const t=now+29*1800000;assert.equal(observe(s,bad,t).action,'block');assert.equal(s.active.reason,'30_in_24h');assert.equal(s.active.until,t+86400000);
 assert.equal(check(s,t+86400000).action,'allow');
 const expired=initialState();for(let i=0;i<40;i++)observe(expired,bad,now+i*4*3600000);assert.equal(expired.active,null,'Rolling daily window, not a lifetime total');
});
test('in-flight genuine responses escalate duration without inventing repeat strikes',()=>{
 const s=initialState();for(let i=0;i<40;i++)observe(s,{...bad,pathHash:String(i)},now+i);
 assert.equal(s.active.duration,POLICY.longBan);assert.equal(s.bans.length,1);
});
test('third distinct ban within 24 hours upgrades to seven days',()=>{
 const s=initialState();for(let episode=0;episode<3;episode++){
  s.active=null;s.events=[];
  for(let i=0;i<20;i++)observe(s,bad,now+episode*3600000+i);
 }
 assert.equal(s.bans.length,3);assert.equal(s.active.reason,'third_ban_in_24h');assert.equal(s.active.duration,604800000);
 assert.equal(check(s,s.active.until).action,'allow');
});
test('different statuses are retained; 5xx, model 404s and occasional 429s are not ban evidence',()=>{
 const s=initialState();for(let i=0;i<100;i++){observe(s,{status:503},now+i);observe(s,{status:404,unknownApiPath:false},now+i);observe(s,{status:429,retryAfter:1},now+i*60000)}
 assert.equal(s.active,null);assert.equal(s.counters['5xx'],100);assert.equal(s.counters['404'],100);assert.equal(s.counters['429'],100);
 const m=metrics(s,now+100*60000);assert.equal(m.day.statuses['5xx'],100);
});
test('authentication failures, malformed input and unsupported methods can combine',()=>{
 const s=initialState();const cases=[{status:401,authenticationFailure:true},{status:403,authenticationFailure:true},{status:405,unsupportedMethod:true},{status:415,malformed:true}];
 for(let i=0;i<20;i++)observe(s,cases[i%4],now+i);
 assert.equal(s.active.duration,3600000);assert.equal(Object.keys(s.active.evidence.categories).length,3);
});
test('429s count only after repeated ignored backoff; no single response bans',()=>{
 const s=initialState();observe(s,{status:429,retryAfter:60},now);
 for(let i=1;i<=9;i++)observe(s,{status:429,retryAfter:60},now+i*1000);
 assert.equal(s.active,null);assert.equal(s.events.filter(e=>e.reason==='ignored_backoff').length,0);
 for(let i=10;i<=20;i++)observe(s,{status:429,retryAfter:60},now+i*1000);
 assert.equal(s.active.duration,3600000);
});
test('shared-IP protection allows legitimate users and applies short backoff to abuse',()=>{
 const s=initialState();observe(s,{status:200,trusted:true,credentialHash:'good'},now);
 for(let i=0;i<40;i++)observe(s,bad,now+i+1);
 assert.equal(s.active,null);assert.equal(check(s,now+50).action,'throttle');assert.equal(check(s,now+50,{trusted:true,credentialHash:'good'}).action,'allow');
 observe(s,{...bad,trusted:true,credentialHash:'bad'},now+51);
 const badDecision=check(s,now+52,{trusted:true,credentialHash:'bad'});
 assert.equal(badDecision.action,'throttle');assert.ok(badDecision.retryAfter>3500);
 assert.equal(check(s,now+52,{trusted:true,credentialHash:'good'}).action,'allow');
});
