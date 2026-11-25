import { RULES, createGame, step, phaseOf, installEntropy } from './engine-v8.mjs';
import { verifyHuman } from '../human-v2.mjs';
import { rememberEmailInput, startEmailVerification, takeResult } from '../verify-flow-v2.mjs';
import { LOSS_TAUNTS } from './taunts-v1.mjs';
import { lossSummary, createSound } from './feedback-v1.mjs';

const $ = id => document.getElementById(id);
rememberEmailInput($('player-email'));
$('player-email').addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); $('send-code').click(); }
});
const canvas = $('game'), ctx = canvas.getContext('2d');
const screen = $('screen'), start = $('start');
const sound = createSound($('sound'));
let lastNear = -120;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let state = createGame(1), run, trace = [], playing = false, busy = false;
let target = 500, lastRecorded = -1, animation, lastSecond = -1, countdownTimer;
let startedAt = 0, countdownDeadline = 0;
const held = new Set();
let rewardData;
let committedFrame = 0, committedTarget = 500, progressPromise, progressTimer;
function connectionLost(error) {
  if (!playing) return;
  playing = false; busy = false; cancelAnimationFrame(animation); clearInterval(progressTimer); held.clear();
  show('阵法连接中断', error.message || '网络连接已中断，请重新开局。', '重新挑战 →');
}
async function flushProgress(final = false) {
  const activeRun = run;
  if (progressPromise) {
    try { await progressPromise; } catch (error) { if (run === activeRun) throw error; else return; }
    if (!final || run !== activeRun) return;
  }
  if (state.frame <= committedFrame || (!final && state.frame - committedFrame < 60)) return;
  if (run !== activeRun) return;
  const frame = state.frame, from = committedFrame;
  const entries = trace.filter(e => e[0] >= from && e[0] < frame);
  if (entries[0]?.[0] !== from) entries.unshift([from, committedTarget]);
  const packet = { id: run.id, receipt: run.receipt, frame, trace: entries };
  const pending = (async () => {
    let data;
    // A lost response may be retried only with the exact same immutable packet.
    try { data = await api('progress', packet); }
    catch (error) { if (error.status) throw error; data = await api('progress', packet); }
    if (run !== activeRun) return;
    if (data.frame !== frame) throw new Error('本局记录不匹配，请重新开局。');
    installEntropy(state, data.entropy);
    run.receipt = data.receipt; committedFrame = frame; committedTarget = entries.at(-1)[1];
  })();
  progressPromise = pending;
  try { await pending; } catch (error) { if (run === activeRun) throw error; }
  finally { if (progressPromise === pending) progressPromise = undefined; }
  if (run === activeRun && final && committedFrame < state.frame) await flushProgress(true);
}

async function api(action, body) {
  const response = await fetch(`/api/free-token/game/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', cache: 'no-store', body: JSON.stringify(body) });
  let data;
  try { data = await response.json(); } catch { throw new Error('网络有些波动，请稍后再试。'); }
  if (!response.ok) { const error = new Error(data.error || '暂时无法领取，请稍后重试。'); error.status = response.status; throw error; }
  return data;
}

const atlas = new Image(); atlas.src = '/free-token/game/jade-atlas-v1.webp';
const background = new Image(); background.src = '/free-token/game/mountain-night-v1.webp';
const goldToken = new Image(); goldToken.src = '/free-token/game/golden-token-v1.webp';
const goldWard = new Image(); goldWard.src = '/free-token/game/golden-ward-v1.webp';
let effects = [];
const icons = [[0,0],[1,0],[0,1],[1,1]];
function sprite(index, x, y, size, angle = 0, alpha = 1) {
  if (!atlas.complete || !atlas.naturalWidth) return;
  const w = atlas.naturalWidth / 2, h = atlas.naturalHeight / 2, [col,row] = icons[index];
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x,y); ctx.rotate(angle);
  ctx.drawImage(atlas,col*w,row*h,w,h,-size/2,-size/2,size,size); ctx.restore();
}
function draw() {
  ctx.fillStyle = '#0b202b'; ctx.fillRect(0,0,720,1000);
  if (background.complete && background.naturalWidth) {
    const crop = background.naturalWidth / .72;
    ctx.drawImage(background,0,(background.naturalHeight-crop)/2,background.naturalWidth,crop,0,0,720,1000);
  }
  ctx.fillStyle = '#04182038'; ctx.fillRect(0,0,720,1000);
  // Subtle upward travel; a small fixed number of strokes, without blur filters.
  if (playing && !reduced) {
    ctx.strokeStyle='#b3e9d625';ctx.lineWidth=1;
    for(let i=0;i<9;i++){const x=35+(i*83)%660,y=(i*127+state.frame*3.2)%1100-60;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+23);ctx.stroke();}
  }
  for (const object of state.objects) {
    if (state.frame < object.launchAt) {
      // A brief glint at each incoming sword's location; no gap labels/boxes.
      const progress = 1 - (object.launchAt - state.frame) / RULES.warningFrames;
      ctx.save();ctx.translate(object.x,38);ctx.globalAlpha=.4+progress*.5;
      sprite(2,0,0,66,0,.65);
      ctx.strokeStyle='#ffd6ac';ctx.lineWidth=2;ctx.beginPath();
      ctx.moveTo(-14,0);ctx.lineTo(14,0);ctx.moveTo(0,-24);ctx.lineTo(0,24+progress*25);ctx.stroke();ctx.restore();
      continue;
    }
    ctx.save();ctx.translate(object.x,object.y);
    if (object.type === 'jade') {
      ctx.fillStyle='#91edc01b';ctx.beginPath();ctx.arc(0,0,29,0,Math.PI*2);ctx.fill();
      sprite(1,0,0,82,reduced?0:Math.sin(object.id+state.frame*.04)*.1);
    } else if (object.type === 'ward') {
      if(goldToken.complete&&goldToken.naturalWidth){
        const size=96;ctx.rotate(reduced?0:Math.sin(state.frame*.045)*.055);
        ctx.drawImage(goldToken,-size/2,-size/2,size,size);
      }
    } else {
      ctx.fillStyle=object.wave?'#ef816423':'#ef816418';ctx.beginPath();ctx.ellipse(0,0,28,35,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#ed806643';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-34);ctx.lineTo(-object.vx*12,-88);ctx.stroke();
      sprite(2,0,0,112,Math.atan2(-object.vx,object.speed));
    }
    ctx.restore();
  }
  // Native generated, transparent gold barrier surrounds the sword while active.
  const wardLeft=Math.max(0,state.wardUntil-state.frame);
  if(wardLeft>0&&goldWard.complete&&goldWard.naturalWidth){
    ctx.save();ctx.translate(state.x,RULES.playerY);
    const pulse=reduced?1:1+Math.sin(state.frame*.075)*.018;
    ctx.rotate(reduced?0:Math.sin(state.frame*.009)*.035);ctx.scale(pulse,pulse);
    ctx.globalAlpha=!reduced&&wardLeft<60?.78+.22*Math.sin(state.frame*.25):.94;
    const size=RULES.wardRadius+20;ctx.drawImage(goldWard,-size,-size,size*2,size*2);ctx.restore();
  }
  // Draw a short sword trail and a visible invulnerability shield.
  ctx.save();ctx.translate(state.x,RULES.playerY);
  if (playing && !reduced) {
    const tail=ctx.createLinearGradient(0,25,0,115);tail.addColorStop(0,'#c0ffe28c');tail.addColorStop(1,'#77ebd000');ctx.fillStyle=tail;
    ctx.beginPath();ctx.moveTo(-6,24);ctx.quadraticCurveTo(-18,80,0,122);ctx.quadraticCurveTo(18,80,6,24);ctx.fill();
  }
  if (state.cooldown) {ctx.strokeStyle=state.frame%12<6?'#dcf3bc9c':'#dcf3bc44';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,-8,37,62,0,0,Math.PI*2);ctx.stroke();}
  sprite(0,0,-2,144,0,state.cooldown&&state.frame%8<4?.6:1);ctx.restore();
  effects = effects.filter(fx => state.frame - fx.frame < (fx.kind==='near'?42:fx.kind==='deflect'?32:24)).slice(-48);
  for (const fx of effects) {
    const duration=fx.kind==='near'?42:fx.kind==='deflect'?32:24;
    const frames=state.frame-fx.frame,age=frames/duration;
    ctx.save();ctx.globalAlpha=1-age;
    if(fx.kind==='deflect'){
      const x=fx.x+fx.vx*frames,y=fx.y+fx.vy*frames;
      ctx.strokeStyle='#ffe6a6';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x-fx.vx*2,y-fx.vy*2);ctx.lineTo(x,y);ctx.stroke();
      sprite(2,x,y,100,Math.atan2(-fx.vx,fx.vy)+(reduced?0:frames*.17),1-age);
      if(!reduced){ctx.strokeStyle='#ffcf8f';ctx.lineWidth=2;for(let i=0;i<3;i++){const angle=i*2.1+fx.x;ctx.beginPath();ctx.moveTo(fx.x+Math.cos(angle)*age*36,fx.y+Math.sin(angle)*age*36);ctx.lineTo(fx.x+Math.cos(angle)*(age*36+9),fx.y+Math.sin(angle)*(age*36+9));ctx.stroke();}}
    }else if(fx.kind==='near'){
      ctx.strokeStyle='#c9f4dd';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(fx.x-20,fx.y+45);ctx.quadraticCurveTo(fx.x-36,fx.y,fx.x+12,fx.y-35);ctx.stroke();
      ctx.fillStyle='#d4f7e0';ctx.font='24px KaiTi,serif';ctx.textAlign='center';ctx.fillText('险过',Math.max(35,Math.min(685,fx.x)),fx.y-36-age*24);
    }else if(fx.kind==='pickup'||fx.kind==='gold'){
      const x=fx.x+(state.x-fx.x)*age,y=fx.y+(RULES.playerY-RULES.pickupReach-fx.y)*age;
      if(fx.kind==='pickup')sprite(1,x,y,50*(1-age),age*.8,1-age);
      ctx.strokeStyle=fx.kind==='gold'?'#ffe7a0':'#c9f2aa';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,8+age*22,0,Math.PI*2);ctx.stroke();
      if(!reduced){ctx.beginPath();ctx.moveTo(fx.x,fx.y);ctx.quadraticCurveTo((fx.x+x)/2+12,fx.y-20,x,y);ctx.stroke();}
    }else{
      ctx.strokeStyle='#f0a28e';ctx.lineWidth=2;ctx.beginPath();ctx.arc(fx.x,fx.y,12+age*44,0,Math.PI*2);ctx.stroke();
    }
    ctx.restore();
  }
}
atlas.onload=background.onload=goldToken.onload=goldWard.onload=()=>{if(!playing)draw();};

function hud(){
  const second=Math.max(0,Math.ceil((RULES.frames-state.frame)/60));
  $('time').innerHTML=`${second}<span>s</span>`;$('jade').innerHTML=`${state.jade}<span> / ${RULES.goal}</span>`;
  const wardLeft=Math.max(0,state.wardUntil-state.frame);
  $('shield-label').textContent=wardLeft?'金刚罩':'护盾';
  $('shields').textContent=wardLeft?`${Math.ceil(wardLeft/RULES.fps)}s`:'◇ '.repeat(Math.max(0,state.shields))+'· '.repeat(RULES.shields-Math.max(0,state.shields));
  $('shields').style.color=wardLeft?'#ffe3a1':'';$('shields').setAttribute('aria-label',wardLeft?`金刚罩剩余${Math.ceil(wardLeft/RULES.fps)}秒`:`${state.shields}点护盾`);
  const phase=phaseOf(state);document.querySelector('.arena').dataset.phase=phase===3?'survival':state.rageAt>=0?'rage':'normal';
  $('phase').textContent=phase===3?'终阵 · 守心':['第一阵 · 风起','第二阵 · 追魂','第三阵 · 剑潮'][phase];
  if(second!==lastSecond && second%10===0){$('announcement').textContent=`剩余${second}秒，已收集${state.jade}枚灵玉，${state.shields}点护盾。`;lastSecond=second;}
}

function show(title,description,button='再试一局 →'){
  $('screen-title').textContent=title;$('screen-description').textContent=description;start.textContent=button;start.hidden=false;start.disabled=false;screen.hidden=false;$('loss-taunt').hidden=true;$('oath-detour').hidden=true;
}

// Always settle against elapsed real time, including throttled/hidden frames.
function advance(){
  if(!playing)return;
  const due=Math.min(RULES.frames,Math.max(0,Math.floor((Date.now()-startedAt)*RULES.fps/1000)));
  while(state.frame<due&&!state.done){
    if(held.has('ArrowLeft')||held.has('a')||held.has('A'))target=Math.max(0,target-18);
    if(held.has('ArrowRight')||held.has('d')||held.has('D'))target=Math.min(1000,target+18);
    target=Math.round(target);
    if(target!==lastRecorded){trace.push([state.frame,target]);lastRecorded=target;}
    try { step(state,target); } catch (error) { connectionLost(error); return; }
    if(state.hit)effects.push({x:state.x,y:RULES.playerY,frame:state.frame,hit:true});
    for(const event of state.events || []){
      if(event.kind==='near'){
        if(state.frame-lastNear<90)continue;
        lastNear=state.frame;
      }
      effects.push({...event,frame:state.frame});
      if(due-state.frame<3)sound.play(event.kind);
    }
    if(effects.length>48)effects.splice(0,effects.length-48);
    if(state.hit&&!reduced){document.querySelector('.arena').classList.remove('shake');void canvas.offsetWidth;document.querySelector('.arena').classList.add('shake');}
  }
}
function tick(){
  if(!playing)return;
  advance();if(!playing)return;draw();hud();
  if(state.done){end();return;}
  animation=requestAnimationFrame(tick);
}
function syncClock(){
  if(!playing)return;
  cancelAnimationFrame(animation);tick();
}
function updateCountdown(){
  if(!countdownDeadline)return;
  const remaining=Math.ceil((countdownDeadline-Date.now())/600);
  if(remaining>0){$('countdown').textContent=String(Math.min(3,remaining));return;}
  clearInterval(countdownTimer);startedAt=countdownDeadline;countdownDeadline=0;
  $('countdown').hidden=true;playing=true;busy=false;
  progressTimer=setInterval(()=>{
    if(!playing)return;advance();
    if(playing&&state.frame-committedFrame>=60)flushProgress().catch(connectionLost);
  },180);
  canvas.focus({preventScroll:true});syncClock();
}

async function end(){
  playing=false;cancelAnimationFrame(animation);clearInterval(progressTimer);held.clear();
  if(!state.won){show(state.shields<=0?'又倒下了？':'撑住了，玉呢？',lossSummary(state,RULES),'不服，再战一局 →');$('loss-taunt').textContent=LOSS_TAUNTS[Math.floor(Math.random()*LOSS_TAUNTS.length)];$('loss-taunt').hidden=false;$('oath-detour').hidden=false;$('announcement').textContent='挑战失败。可以重试，或去叫义父领礼。';return;}
  document.querySelector('.arena').classList.add('victory');
  show('破阵成功',`收集 ${state.jade} 枚灵玉，剩余 ${state.shields} 点护盾。正在核验本局并准备奖励…`,'正在领取…');start.disabled=true;
  await claimReward();
}

function showRewardSteps(){
  $('reward-steps').hidden=false;$('reward-secret').hidden=true;$('reward-error').textContent='';
  $('reward').showModal();
}
function showRewardResult(data){
  rewardData=data;
  $('base-url').value=data.baseUrl;$('api-key').value=data.apiKey;
  $('reward-title').textContent=data.existing?'欢迎回来':data.replaced?'密钥已升级':'奖励已到账';
  $('reward-result-note').textContent=data.existing?'已凭邮箱找回原来的 API Key。':data.replaced?'旧版共享密钥已换成你的专属 API Key。':'这是与你的邮箱绑定的专属 API Key，请妥善保存。';
  $('copy-status').textContent='请复制保存。以后可用同一邮箱找回。';
  $('reward-steps').hidden=true;$('reward-secret').hidden=false;
  if(!$('reward').open)$('reward').showModal();
  const reopen=document.createElement('button');reopen.type='button';reopen.className='secondary';reopen.textContent='查看通关奖励';reopen.id='reopen-reward';
  reopen.addEventListener('click',()=>{if(rewardData)showRewardResult(rewardData);});
  $('reopen-reward')?.remove();screen.append(reopen);
}
async function claimReward(){
  if(busy)return;busy=true;start.disabled=true;
  try{
    await flushProgress(true);
    const data=await api('finish',{id:run.id,receipt:run.receipt});
    if(!data.won&&!data.claimable)throw new Error('奖励暂时未准备好，请稍后重试。');
    rewardData=undefined;$('score-note').textContent=`${data.jade} 枚灵玉 · ${data.shields} 点护盾 · 完整 45 秒`;
    showRewardSteps();show('破阵成功','验证邮箱即可领取专属 API Key，以后也能凭同一邮箱找回。','再挑战一局 →');
  }catch(error){const expired=[400,403,409,410].includes(error.status);show('破阵成功，领取未完成',error.message,expired?'重新挑战 →':'重试领取 →');if(!expired)start.dataset.retryClaim='true';}
  finally{busy=false;start.disabled=false;}
}
async function begin(){
  if(busy)return;
  sound.unlock();
  if(start.dataset.retryClaim==='true'){delete start.dataset.retryClaim;await claimReward();return;}
  busy=true;start.disabled=true;start.textContent='正在开阵…';$('notice').textContent='';$('reopen-reward')?.remove();rewardData=undefined;$('base-url').value=$('api-key').value='';
  try{
    const humanToken=await verifyHuman('game_start');
    run=await api('start',{humanToken});if(run.protocol!=='live-v1'||run.rules.version!==RULES.version)throw new Error('游戏已更新，请刷新页面。');
    committedFrame=0;committedTarget=500;progressPromise=undefined;clearInterval(progressTimer);
    state=createGame(run.seed);effects=[];lastNear=-120;trace=[];lastRecorded=-1;target=500;lastSecond=-1;startedAt=0;held.clear();document.querySelector('.arena').classList.remove('victory');draw();hud();screen.hidden=true;
    $('countdown').hidden=false;$('countdown').textContent='3';
    countdownDeadline=Date.now()+1800;
    countdownTimer=setInterval(updateCountdown,100);
    updateCountdown();
  }catch(error){busy=false;show('暂时未能开阵',error.message,'重新开阵 →');}
}

start.addEventListener('click',begin);
function steer(event){
  if(!playing)return;
  // Catch up with the previous target before accepting a new touch position.
  advance();if(state.done){syncClock();return;}
  const rect=canvas.getBoundingClientRect();
  target=Math.round(Math.max(0,Math.min(1000,((event.clientX-rect.left)/rect.width*720-38)/644*1000)));
}
canvas.addEventListener('pointerdown',event=>{if(!playing)return;canvas.setPointerCapture(event.pointerId);steer(event);});
canvas.addEventListener('pointermove',steer);
canvas.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','a','d','A','D'].includes(event.key))return;
  event.preventDefault();advance();held.add(event.key);
});
window.addEventListener('keyup',event=>{advance();held.delete(event.key);});
window.addEventListener('blur',()=>{advance();held.clear();});
document.addEventListener('visibilitychange',()=>{
  updateCountdown();advance();if(document.hidden)held.clear();syncClock();
});
window.addEventListener('pageshow',()=>{
  if(countdownDeadline){clearInterval(countdownTimer);countdownTimer=setInterval(updateCountdown,100);updateCountdown();}
  if(playing)syncClock();
  else if(!busy&&!rewardData)show('准备入阵？','收集 24 枚灵玉，并存活 45 秒。两点护盾，受击两次挑战结束。','执剑 · 开始挑战 →');
});
window.addEventListener('pagehide',()=>{
  advance();cancelAnimationFrame(animation);clearInterval(countdownTimer);held.clear();
  rewardData=undefined;$('base-url').value=$('api-key').value='';$('reward').close();
});
$('close-reward').addEventListener('click',()=>$('reward').close());$('reward').addEventListener('close',()=>{$('base-url').value=$('api-key').value='';$('copy-status').textContent='';});
$('send-code').addEventListener('click',async()=>{
  if(busy)return;busy=true;$('reward-error').textContent='';
  $('send-code').disabled=true;$('send-code').textContent='正在发送…';
  try{await startEmailVerification({email:$('player-email').value,source:'game',returnPath:'/free-token/game/',humanHost:$('claim-human')});}
  catch(error){$('reward-error').textContent=error instanceof TypeError?'网络有些波动，请再试一次。':error.message;}
  finally{busy=false;$('send-code').disabled=false;$('send-code').textContent='发送验证码';}
});
async function copy(kind){if(!rewardData)return;const text=kind==='url'?rewardData.baseUrl:kind==='key'?rewardData.apiKey:`Base URL: ${rewardData.baseUrl}\nAPI Key: ${rewardData.apiKey}`;try{await navigator.clipboard.writeText(text);$('copy-status').textContent='已复制。';}catch{const field=kind==='url'?$('base-url'):$('api-key');field.focus();field.select();$('copy-status').textContent='请长按或使用 Ctrl+C 复制。';}}
$('copy-url').addEventListener('click',()=>copy('url'));$('copy-key').addEventListener('click',()=>copy('key'));$('copy-all').addEventListener('click',()=>copy('all'));
const returnedReward=takeResult('game');
if(returnedReward){$('score-note').textContent='邮箱验证成功 · 通关奖励';showRewardResult(returnedReward);show('奖励已到账','专属 API Key 已与邮箱绑定，以后可凭同一邮箱找回。','再挑战一局 →');}
else if(location.hash==='#verify-email'){history.replaceState(null,'',location.pathname);$('score-note').textContent='重新填写邮箱';showRewardSteps();}
draw();hud();
