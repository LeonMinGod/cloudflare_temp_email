import { installCcSwitch } from '../ccswitch-v2.mjs?v=3';
import { DIRS, RULES, createGame, installEntropy, isOppositeDir, phaseOf, step, tickMsFor } from './engine-v3.mjs';
import { verifyHuman } from '../human-v2.mjs';
import { rememberEmailInput, startEmailVerification, takeResult } from '../verify-flow-v4.mjs';
import { LOSS_TAUNTS } from '../game/taunts-v1.mjs';

const $ = id => document.getElementById(id);
rememberEmailInput($('player-email'));
$('player-email').addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); $('send-code').click(); }
});

const SNAKE_TAUNTS = [
  ...LOSS_TAUNTS,
  '灵龙打结了？要不先去叫声义父顺顺气？🐉',
  '剑碑越落越密啦，隔壁叫声义父可比这省心多了。😂',
  '差一点就渡劫成功！实在不行……义父一直在等你。🫶',
];

const PHASE_NAMES = [
  '第一境 · 潜龙入星',
  '第二境 · 破雾衔珠',
  '第三境 · 剑碑封阵',
  '第四境 · 龙啸星河',
  '终境 · 衔珠渡劫',
];

const canvas = $('game');
const fieldWrap = $('field-wrap') || $('field');
const ctx = canvas.getContext('2d');
const arena = $('arena');
const screen = $('screen');
const startBtn = $('start');
const dpadButtons = new Map(Array.from(document.querySelectorAll('.dpad-btn')).map(b => [Number(b.dataset.dir), b]));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const BOARD_PX = 680;
const CELL = BOARD_PX / RULES.cols; // 40px exact integer grid

const atlasClassic = new Image();
atlasClassic.src = '/free-token/snake/snake-atlas-classic-v1.webp';
const atlasXmas = new Image();
atlasXmas.src = '/free-token/snake/snake-atlas-xmas-v1.webp';

const QUAD_COORDS = [[0, 0], [1, 0], [0, 1], [1, 1]]; // 0=head, 1=orb, 2=bonus, 3=stele

function currentAtlas() {
  return isXmas() ? atlasXmas : atlasClassic;
}

function drawSprite(index, x, y, size, angle = 0, alpha = 1, flipY = false) {
  const img = currentAtlas();
  if (!img.complete || !img.naturalWidth) return false;
  const sw = img.naturalWidth / 2;
  const sh = img.naturalHeight / 2;
  const [col, row] = QUAD_COORDS[index];
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  if (angle) ctx.rotate(angle);
  if (flipY) ctx.scale(1, -1);
  ctx.drawImage(img, col * sw, row * sh, sw, sh, -size / 2, -size / 2, size, size);
  ctx.restore();
  return true;
}

function createSnakeSound(button) {
  let enabled = true, audioCtx, lastAt = 0;
  try { enabled = localStorage.getItem('lmg-game-sound') !== 'off'; } catch {}
  function render() {
    button.textContent = enabled ? '♪' : '♩';
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', enabled ? '关闭音效' : '开启音效');
  }
  function unlock() {
    if (!enabled) return;
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      audioCtx ||= new AudioCtor();
      audioCtx.resume().catch(() => {});
    } catch {}
  }
  function tone(freqStart, freqEnd, duration = 0.14, gainPeak = 0.036, type = 'sine', offset = 0) {
    if (!enabled || !audioCtx || audioCtx.state !== 'running' || document.hidden) return;
    const now = audioCtx.currentTime + offset;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + duration * 0.85);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
  function play(kind, score = 0) {
    if (!enabled || !audioCtx || audioCtx.state !== 'running' || document.hidden) return;
    const now = audioCtx.currentTime;
    if (kind !== 'win' && kind !== 'hit' && now - lastAt < 0.055) return;
    lastAt = now;
    const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
    if (kind === 'orb') {
      const base = scale[score % scale.length];
      tone(base, base * 1.25, 0.14, 0.038, 'sine');
    } else if (kind === 'bonus') {
      tone(659.25, 880, 0.12, 0.042, 'triangle', 0);
      tone(880, 1318.5, 0.18, 0.042, 'triangle', 0.075);
    } else if (kind === 'warn') {
      tone(420, 340, 0.15, 0.024, 'triangle');
    } else if (kind === 'hit') {
      tone(220, 95, 0.24, 0.055, 'sawtooth');
    } else if (kind === 'win') {
      tone(523.25, 659.25, 0.16, 0.045, 'triangle', 0);
      tone(659.25, 783.99, 0.16, 0.045, 'triangle', 0.1);
      tone(783.99, 1046.5, 0.28, 0.05, 'triangle', 0.2);
    }
  }
  button.addEventListener('click', () => {
    enabled = !enabled;
    try { localStorage.setItem('lmg-game-sound', enabled ? 'on' : 'off'); } catch {}
    render();
    if (enabled) unlock();
    else audioCtx?.suspend().catch(() => {});
  });
  window.addEventListener('pagehide', () => { audioCtx?.suspend().catch(() => {}); });
  render();
  return { unlock, play };
}

const sound = createSnakeSound($('sound'));

const STARS = Array.from({ length: 42 }, (_, i) => ({
  x: ((i * 197 + 31) % (BOARD_PX - 20)) + 10,
  y: ((i * 313 + 61) % (BOARD_PX - 20)) + 10,
  r: (i % 3) * 0.65 + 0.8,
  phase: i * 1.3,
}));

const isXmas = () => document.documentElement.dataset.skin === 'xmas';
function syncSkinLegend() {
  const legend = $('bonus-legend');
  if (legend) legend.textContent = isXmas() ? '圣诞礼盒 +2·缩尾' : '金丹 +2·缩尾';
}
syncSkinLegend();

let state = createGame(1);
let prevBody = [[4, 8], [3, 8], [2, 8], [1, 8]];
let run = null;
let trace = [];
let playing = false;
let busy = false;
let turnQueue = [];
let lastRecordedDir = -1;
let committedTick = 0;
let committedDir = 1;
let progressPromise;
let progressTimer;
let countdownTimer;
let animation;
let startedAt = 0;
let countdownDeadline = 0;
let rewardData;
let particles = [];
let popups = [];

function flashButton(dir) {
  const btn = dpadButtons.get(dir);
  if (!btn) return;
  btn.classList.add('is-pressed');
  clearTimeout(btn._flashTimer);
  btn._flashTimer = setTimeout(() => btn.classList.remove('is-pressed'), 110);
}

function connectionLost(error) {
  if (!playing) return;
  playing = false;
  busy = false;
  cancelAnimationFrame(animation);
  clearInterval(progressTimer);
  turnQueue = [];
  show('阵法连接中断', error?.message || '网络连接已中断，请重新开局。', '重新挑战 →');
}

async function api(action, body) {
  const response = await fetch(`/api/free-token/snake/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify(body),
  });
  let data;
  try { data = await response.json(); } catch { throw new Error('网络有些波动，请稍后再试。'); }
  if (!response.ok) {
    const error = new Error(data.error || '暂时无法领取，请稍后重试。');
    error.status = response.status;
    throw error;
  }
  return data;
}

async function flushProgress(final = false) {
  const activeRun = run;
  if (progressPromise) {
    try { await progressPromise; } catch (error) { if (run === activeRun) throw error; else return; }
    if (!final || run !== activeRun) return;
  }
  if (state.tick <= committedTick || (!final && state.tick - committedTick < 8)) return;
  if (run !== activeRun) return;
  const tick = state.tick;
  const from = committedTick;
  const entries = trace.filter(e => e[0] >= from && e[0] < tick);
  if (entries[0]?.[0] !== from) entries.unshift([from, committedDir]);
  const packet = { id: run.id, receipt: run.receipt, tick, trace: entries };
  const pending = (async () => {
    let data;
    try { data = await api('progress', packet); }
    catch (error) {
      if (error.status) throw error;
      data = await api('progress', packet);
    }
    if (run !== activeRun) return;
    if (data.tick !== tick) throw new Error('本局记录不匹配，请重新开局。');
    installEntropy(state, data.entropy);
    run.receipt = data.receipt;
    committedTick = tick;
    committedDir = entries.at(-1)[1];
  })();
  progressPromise = pending;
  try { await pending; } catch (error) { if (run === activeRun) throw error; }
  finally { if (progressPromise === pending) progressPromise = undefined; }
  if (run === activeRun && final && committedTick < state.tick) await flushProgress(true);
}

function queueDirection(dir, vibrate = false) {
  if (!playing && !countdownDeadline) return;
  if (!Number.isInteger(dir) || dir < 0 || dir > 3) return;
  flashButton(dir);
  if (turnQueue.length === 0) {
    if (dir === state.dir || isOppositeDir(dir, state.dir)) return;
    turnQueue.push(dir);
  } else if (turnQueue.length === 1) {
    if (dir === turnQueue[0] || isOppositeDir(dir, turnQueue[0])) return;
    turnQueue.push(dir);
  } else {
    if (dir === turnQueue[0] || isOppositeDir(dir, turnQueue[0])) return;
    turnQueue[1] = dir;
  }
  if (vibrate) {
    try { navigator.vibrate?.(8); } catch {}
  }
}

function spawnParticles(gx, gy, color, count = 12) {
  if (reduced) return;
  const cx = (gx + 0.5) * CELL;
  const cy = (gy + 0.5) * CELL;
  const now = performance.now();
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
    const speed = 1.6 + Math.random() * 3.1;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: 2 + Math.random() * 2.5,
      color,
      born: now,
      life: 440 + Math.random() * 220,
    });
  }
  if (particles.length > 96) particles.splice(0, particles.length - 96);
}

function spawnPopup(gx, gy, text, color) {
  popups.push({
    x: Math.max(72, Math.min(BOARD_PX - 72, (gx + 0.5) * CELL)),
    y: Math.max(46, (gy + 0.35) * CELL),
    text,
    color,
    born: performance.now(),
    life: 800,
  });
}

function advance() {
  if (!playing) return;
  const now = Date.now();
  while (!state.done && now - startedAt >= state.elapsedMs + tickMsFor(state.score)) {
    prevBody = state.body.map(p => [p[0], p[1]]);
    const desired = turnQueue.length ? turnQueue.shift() : state.dir;
    if (desired !== lastRecordedDir || trace.length === 0) {
      trace.push([state.tick, desired]);
      lastRecordedDir = desired;
    }
    try {
      step(state, desired);
    } catch (error) {
      connectionLost(error);
      return;
    }
    const xmas = isXmas();
    for (const ev of state.events || []) {
      if (ev.kind === 'orb') {
        spawnParticles(ev.x, ev.y, xmas ? '#fda4af' : '#6ef3c7', 12);
        spawnPopup(ev.x, ev.y, '+1', xmas ? '#ffe4b5' : '#b7fbe2');
        sound.play('orb', state.score);
      } else if (ev.kind === 'bonus') {
        spawnParticles(ev.x, ev.y, '#fbbf24', 20);
        spawnPopup(ev.x, ev.y, ev.trimmed > 0 ? `+2 · 尾缩${ev.trimmed}` : '+2', '#fde68a');
        sound.play('bonus', state.score);
      } else if (ev.kind === 'dissolve') {
        spawnParticles(ev.x, ev.y, xmas ? '#bae6fd' : '#fdba74', 10);
      } else if (ev.kind === 'warn') {
        sound.play('warn', state.score);
      } else if (ev.kind === 'hit') {
        spawnParticles(ev.x, ev.y, '#fb7185', 20);
        sound.play('hit', state.score);
        if (!reduced) {
          arena.classList.remove('shake');
          void canvas.offsetWidth;
          arena.classList.add('shake');
        }
      } else if (ev.kind === 'win') {
        spawnParticles(ev.x, ev.y, '#fde68a', 28);
        sound.play('win', state.score);
      }
    }
  }
}

// Smooth quadratic midpoint spline sampler — turns grid joints into a flowing serpentine dragon!
function sampleDragonSpine(pts) {
  if (pts.length < 2) return pts.map(p => ({ x: p[0], y: p[1], tx: 1, ty: 0, u: 0 }));
  const raw = [];
  const subs = 5;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = i === 0 ? pts[0] : [(pts[i - 1][0] + pts[i][0]) * 0.5, (pts[i - 1][1] + pts[i][1]) * 0.5];
    const p1 = pts[i];
    const p2 = i === pts.length - 2
      ? pts[pts.length - 1]
      : [(pts[i][0] + pts[i + 1][0]) * 0.5, (pts[i][1] + pts[i + 1][1]) * 0.5];
    const steps = i === pts.length - 2 ? subs + 1 : subs;
    for (let s = 0; s < steps; s++) {
      const k = s / subs;
      const inv = 1 - k;
      const x = inv * inv * p0[0] + 2 * inv * k * p1[0] + k * k * p2[0];
      const y = inv * inv * p0[1] + 2 * inv * k * p1[1] + k * k * p2[1];
      raw.push([x, y]);
    }
  }
  // Compute cumulative arc length and unit tangents
  const dists = [0];
  for (let i = 1; i < raw.length; i++) {
    dists.push(dists[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]));
  }
  const totalLen = Math.max(1, dists.at(-1));
  return raw.map(([x, y], i) => {
    const prev = raw[Math.max(0, i - 1)];
    const next = raw[Math.min(raw.length - 1, i + 1)];
    let dx = next[0] - prev[0];
    let dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    return { x, y, tx: dx, ty: dy, d: dists[i], u: dists[i] / totalLen };
  });
}

function drawDragonBody(points, xmas, t) {
  const spine = sampleDragonSpine(points);
  if (spine.length < 2) return;

  // Width profile: sculpted neck -> sleek serpentine body -> sharp calligraphic tail tip
  const widthAt = u => {
    if (u < 0.08) return 12.2 + (u / 0.08) * 1.4;
    return Math.max(1.2, 13.6 * Math.pow(1 - u, 0.72));
  };

  // Subtle lateral sinuous shimmer along the tail (pure visual life, never alters collision!)
  const shifted = spine.map(s => {
    const wave = reduced ? 0 : Math.sin(t * 7.5 - s.d * 0.075) * (1.2 + s.u * 2.8) * Math.min(1, s.u * 3);
    const nx = -s.ty;
    const ny = s.tx;
    return { ...s, x: s.x + nx * wave, y: s.y + ny * wave };
  });

  // Pass 1: Soft celestial mist aura along spine
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(shifted[0].x, shifted[0].y);
  for (let i = 1; i < shifted.length; i++) ctx.lineTo(shifted[i].x, shifted[i].y);
  ctx.strokeStyle = xmas ? 'rgba(244, 63, 94, 0.22)' : 'rgba(56, 232, 180, 0.22)';
  ctx.lineWidth = 30;
  ctx.stroke();

  // Pass 2: Tapered continuous armored dragon ribbon polygon
  const leftEdge = [];
  const rightEdge = [];
  for (const s of shifted) {
    const w = widthAt(s.u);
    const nx = -s.ty;
    const ny = s.tx;
    leftEdge.push([s.x + nx * w, s.y + ny * w]);
    rightEdge.push([s.x - nx * w, s.y - ny * w]);
  }
  const headPt = shifted[0];
  const tailPt = shifted.at(-1);
  const bodyGrad = ctx.createLinearGradient(headPt.x, headPt.y, tailPt.x, tailPt.y);
  if (xmas) {
    bodyGrad.addColorStop(0, '#e11d48');
    bodyGrad.addColorStop(0.45, '#be123c');
    bodyGrad.addColorStop(0.85, '#881337');
    bodyGrad.addColorStop(1, '#fde68a');
  } else {
    bodyGrad.addColorStop(0, '#32d8aa');
    bodyGrad.addColorStop(0.45, '#15987c');
    bodyGrad.addColorStop(0.85, '#0c5c56');
    bodyGrad.addColorStop(1, '#d9f99d');
  }
  ctx.beginPath();
  ctx.moveTo(leftEdge[0][0], leftEdge[0][1]);
  for (let i = 1; i < leftEdge.length; i++) ctx.lineTo(leftEdge[i][0], leftEdge[i][1]);
  // Tapered wispy tail plume tip
  ctx.lineTo(tailPt.x + tailPt.tx * 12, tailPt.y + tailPt.ty * 12);
  for (let i = rightEdge.length - 1; i >= 0; i--) ctx.lineTo(rightEdge[i][0], rightEdge[i][1]);
  ctx.closePath();
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  ctx.strokeStyle = xmas ? 'rgba(253, 224, 138, 0.72)' : 'rgba(186, 248, 220, 0.62)';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Pass 3: Overlapping scalloped chevron dragon scales & golden dorsal fins along the spline
  let nextScaleDist = 14;
  let scaleIndex = 0;
  for (const s of shifted) {
    if (s.d < nextScaleDist || s.u > 0.92) continue;
    nextScaleDist = s.d + Math.max(8, 13 * (1 - s.u * 0.4));
    const w = widthAt(s.u);
    const angle = Math.atan2(s.ty, s.tx);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(angle);

    // Scalloped chevron dragon scale plate
    ctx.beginPath();
    ctx.moveTo(-w * 0.35, -w * 0.72);
    ctx.quadraticCurveTo(w * 0.55, 0, -w * 0.35, w * 0.72);
    ctx.strokeStyle = xmas ? 'rgba(254, 240, 138, 0.55)' : 'rgba(167, 255, 224, 0.5)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Inner bright metallic shimmer accent
    ctx.beginPath();
    ctx.moveTo(w * 0.25, 0);
    ctx.lineTo(-w * 0.32, -w * 0.32);
    ctx.lineTo(-w * 0.14, 0);
    ctx.lineTo(-w * 0.32, w * 0.32);
    ctx.closePath();
    ctx.fillStyle = scaleIndex % 2 === 0
      ? (xmas ? 'rgba(254, 215, 170, 0.75)' : 'rgba(246, 232, 162, 0.68)')
      : (xmas ? 'rgba(251, 113, 133, 0.65)' : 'rgba(110, 247, 203, 0.55)');
    ctx.fill();

    // Side spirit flame wisps on every 3rd plate
    if (scaleIndex % 3 === 1 && s.u > 0.12 && s.u < 0.8) {
      const side = (scaleIndex % 2 === 0 ? 1 : -1);
      ctx.beginPath();
      ctx.moveTo(0, side * w * 0.85);
      ctx.quadraticCurveTo(-w * 0.7, side * (w + 6), -w * 1.45, side * (w + 3));
      ctx.strokeStyle = xmas ? 'rgba(253, 224, 138, 0.58)' : 'rgba(167, 243, 208, 0.52)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
    scaleIndex++;
  }

  // Pass 4: Radiant golden dorsal spine line + flaring celestial tail plume
  ctx.beginPath();
  ctx.moveTo(shifted[0].x, shifted[0].y);
  for (let i = 1; i < shifted.length; i++) ctx.lineTo(shifted[i].x, shifted[i].y);
  ctx.strokeStyle = xmas ? 'rgba(254, 240, 138, 0.55)' : 'rgba(240, 230, 168, 0.45)';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Elegant twin-flame celestial tail plume
  const tailAngle = Math.atan2(tailPt.ty, tailPt.tx);
  ctx.save();
  ctx.translate(tailPt.x, tailPt.y);
  ctx.rotate(tailAngle);
  const plumeGrad = ctx.createLinearGradient(0, 0, 22, 0);
  plumeGrad.addColorStop(0, xmas ? '#fde68a' : '#a7f3d0');
  plumeGrad.addColorStop(1, xmas ? 'rgba(244, 63, 94, 0)' : 'rgba(56, 232, 180, 0)');
  ctx.fillStyle = plumeGrad;
  ctx.beginPath();
  ctx.moveTo(-2, 0);
  ctx.quadraticCurveTo(8, -11, 22, -4);
  ctx.quadraticCurveTo(13, 0, 24, 0);
  ctx.quadraticCurveTo(13, 0, 22, 4);
  ctx.quadraticCurveTo(8, 11, -2, 0);
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

function draw() {
  const xmas = isXmas();
  const now = performance.now();
  const t = now * 0.001;

  // 1. Starry sky backdrop
  const bg = ctx.createRadialGradient(BOARD_PX / 2, BOARD_PX * 0.4, 36, BOARD_PX / 2, BOARD_PX / 2, BOARD_PX * 0.74);
  if (xmas) {
    bg.addColorStop(0, '#2a0f20');
    bg.addColorStop(0.56, '#160814');
    bg.addColorStop(1, '#0b050d');
  } else {
    bg.addColorStop(0, '#0f2f3c');
    bg.addColorStop(0.58, '#081d26');
    bg.addColorStop(1, '#041118');
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, BOARD_PX, BOARD_PX);

  for (const s of STARS) {
    const twinkle = reduced ? 0.55 : 0.35 + 0.45 * Math.sin(t * 2.1 + s.phase);
    ctx.fillStyle = xmas
      ? `rgba(255, 226, 172, ${twinkle * 0.5})`
      : `rgba(182, 245, 224, ${twinkle * 0.45})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Subtle 17x17 celestial grid
  ctx.strokeStyle = xmas ? 'rgba(255, 212, 152, 0.08)' : 'rgba(130, 224, 194, 0.075)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < RULES.cols; i++) {
    const p = i * CELL + 0.5;
    ctx.moveTo(p, 0); ctx.lineTo(p, BOARD_PX);
    ctx.moveTo(0, p); ctx.lineTo(BOARD_PX, p);
  }
  ctx.stroke();

  ctx.strokeStyle = xmas ? 'rgba(251, 191, 130, 0.24)' : 'rgba(134, 232, 200, 0.2)';
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, BOARD_PX - 4, BOARD_PX - 4);

  // 2. Obstacles (translucent ghost sprite + converging ritual seal -> solid stele sprite)
  for (const obs of state.obstacles) {
    const cx = (obs.x + 0.5) * CELL;
    const cy = (obs.y + 0.5) * CELL;
    if (obs.warn > 0) {
      const progress = 1 - obs.warn / RULES.obstacleWarnTicks;
      const pulse = reduced ? 0.65 : 0.45 + 0.4 * Math.abs(Math.sin(t * 7));
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = xmas
        ? `rgba(125, 211, 252, ${0.1 + progress * 0.14})`
        : `rgba(240, 118, 92, ${0.1 + progress * 0.15})`;
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, 18 - progress * 2.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - progress));
      ctx.strokeStyle = xmas
        ? `rgba(186, 230, 253, ${0.5 + pulse * 0.45})`
        : `rgba(255, 198, 152, ${0.5 + pulse * 0.45})`;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.restore();
      // Draw translucent ghost of the actual stele scaling into reality!
      const ghostSize = 30 + progress * 20;
      drawSprite(3, cx, cy - 2, ghostSize, 0, 0.28 + progress * 0.45);
    } else {
      ctx.save();
      ctx.fillStyle = xmas ? 'rgba(56, 189, 248, 0.22)' : 'rgba(235, 92, 72, 0.22)';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 8, 18, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      if (!drawSprite(3, cx, cy - 2, 52)) {
        ctx.fillStyle = xmas ? '#38bdf8' : '#b8423a';
        ctx.beginPath();
        ctx.arc(cx, cy, 14, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // 3. Regular Spirit Pearl (quad 1)
  if (state.orb) {
    const ox = (state.orb.x + 0.5) * CELL;
    const oy = (state.orb.y + 0.5) * CELL;
    const bob = reduced ? 0 : Math.sin(t * 4.5) * 2.2;
    const glowR = reduced ? 24 : 23 + Math.sin(t * 5) * 3;
    ctx.save();
    ctx.translate(ox, oy + bob);
    const halo = ctx.createRadialGradient(0, 0, 3, 0, 0, glowR);
    if (xmas) {
      halo.addColorStop(0, 'rgba(255, 240, 200, 0.72)');
      halo.addColorStop(0.5, 'rgba(244, 63, 94, 0.42)');
      halo.addColorStop(1, 'rgba(244, 63, 94, 0)');
    } else {
      halo.addColorStop(0, 'rgba(220, 255, 240, 0.76)');
      halo.addColorStop(0.5, 'rgba(56, 232, 180, 0.42)');
      halo.addColorStop(1, 'rgba(56, 232, 180, 0)');
    }
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, glowR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (!drawSprite(1, ox, oy + bob, 50, reduced ? 0 : Math.sin(t * 2) * 0.08)) {
      ctx.fillStyle = xmas ? '#fb7185' : '#6ef7cb';
      ctx.beginPath();
      ctx.arc(ox, oy, 11, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 4. Timed Bonus (quad 2: 金丹 / 圣诞礼盒) with live countdown ring
  if (state.bonus) {
    const bx = (state.bonus.x + 0.5) * CELL;
    const by = (state.bonus.y + 0.5) * CELL;
    const frac = Math.max(0, state.bonus.ttl / RULES.bonusTicks);
    const scale = reduced ? 1 : 1 + Math.sin(t * 7.5) * 0.07;
    ctx.save();
    ctx.translate(bx, by);
    ctx.beginPath();
    ctx.arc(0, 0, 21, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.strokeStyle = frac < 0.3 ? '#fb7185' : '#fde68a';
    ctx.lineWidth = 2.6;
    ctx.stroke();
    const aura = ctx.createRadialGradient(0, 0, 2, 0, 0, 24);
    aura.addColorStop(0, 'rgba(254, 240, 138, 0.72)');
    aura.addColorStop(0.55, 'rgba(245, 158, 11, 0.35)');
    aura.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (!drawSprite(2, bx, by, 52 * scale)) {
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(bx, by, 12, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 5. Celestial Dragon (Spline-Scaled Body + Regal Dragon Head Sprite!)
  const stepMs = tickMsFor(state.score);
  const alpha = !playing || state.done || reduced
    ? 1
    : Math.max(0, Math.min(1, (Date.now() - startedAt - state.elapsedMs) / stepMs));

  const points = state.body.map((seg, i) => {
    const from = prevBody[Math.min(i, prevBody.length - 1)] || seg;
    const x = (from[0] + (seg[0] - from[0]) * alpha + 0.5) * CELL;
    const y = (from[1] + (seg[1] - from[1]) * alpha + 0.5) * CELL;
    return [x, y];
  });

  if (points.length) {
    drawDragonBody(points, xmas, t);

    const [hx, hy] = points[0];
    const [cdx, cdy] = DIRS[state.dir];
    const curAngle = Math.atan2(cdy, cdx);
    let headAngle = curAngle;
    if (turnQueue.length) {
      const [qdx, qdy] = DIRS[turnQueue[0]];
      const targetAngle = Math.atan2(qdy, qdx);
      let diff = targetAngle - curAngle;
      if (diff > Math.PI) diff -= Math.PI * 2;
      if (diff < -Math.PI) diff += Math.PI * 2;
      headAngle = curAngle + diff * 0.48;

      // Subtle glowing directional chevron confirming queued turn (<16ms visual response)
      ctx.save();
      ctx.translate(hx + qdx * 28, hy + qdy * 28);
      ctx.rotate(targetAngle);
      ctx.strokeStyle = xmas ? 'rgba(253, 224, 138, 0.88)' : 'rgba(155, 251, 224, 0.88)';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(-4, -6);
      ctx.lineTo(4, 0);
      ctx.lineTo(-4, 6);
      ctx.stroke();
      ctx.restore();
    }

    // Flip sprite vertically when heading Left so the side-profile dragon head stays upright & regal!
    const flipY = Math.cos(headAngle) < -0.25;
    const drawX = hx + Math.cos(headAngle) * 4;
    const drawY = hy + Math.sin(headAngle) * 4;
    if (!drawSprite(0, drawX, drawY, 68, headAngle, 1, flipY)) {
      ctx.fillStyle = xmas ? '#f43f5e' : '#32d8aa';
      ctx.beginPath();
      ctx.arc(hx, hy, 16, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 6. Particles & popups
  particles = particles.filter(p => now - p.born < p.life);
  for (const p of particles) {
    const age = (now - p.born) / p.life;
    ctx.save();
    ctx.globalAlpha = 1 - age;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x + p.vx * age * 18, p.y + p.vy * age * 18, p.r * (1 - age * 0.6), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  popups = popups.filter(p => now - p.born < p.life);
  for (const p of popups) {
    const age = (now - p.born) / p.life;
    ctx.save();
    ctx.globalAlpha = 1 - age;
    ctx.fillStyle = p.color;
    ctx.font = 'bold 20px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.text, p.x, p.y - age * 34);
    ctx.restore();
  }
}

atlasClassic.onload = atlasXmas.onload = () => { if (!playing) draw(); };

function hud() {
  $('score').innerHTML = `${Math.min(RULES.goal, state.score)}<span> / ${RULES.goal}</span>`;
  $('length').innerHTML = `${state.body.length}<span> 节</span>`;
  const sec = (state.elapsedMs / 1000).toFixed(1);
  $('elapsed').innerHTML = `${sec}<span>s</span>`;
  const phase = phaseOf(state);
  $('phase').textContent = PHASE_NAMES[phase] || PHASE_NAMES[0];
  arena.dataset.phase = phase >= 4 ? 'finale' : phase >= 2 ? 'intense' : 'normal';
}

function show(title, description, button = '再试一局 →') {
  $('screen-title').textContent = title;
  $('screen-description').textContent = description;
  startBtn.textContent = button;
  startBtn.hidden = false;
  startBtn.disabled = false;
  screen.hidden = false;
  $('loss-taunt').hidden = true;
  $('oath-detour').hidden = true;
}

function lossSummary() {
  const collected = Math.min(RULES.goal, state.score);
  const left = Math.max(0, RULES.goal - collected);
  const seconds = (state.elapsedMs / 1000).toFixed(1);
  const cause = {
    wall: '神龙撞上了星盘边界',
    self: '神龙一头撞进了自己龙身',
    obstacle: '神龙撞上了实体剑碑',
    timeout: '时间耗尽，灵阵散去',
  }[state.reason] || '试炼中断';
  return `${cause}（坚持 ${seconds} 秒，已集 ${collected} / ${RULES.goal} 珠）。\n还差 ${left} 珠，再来一把稳稳拿下！`;
}

function tick() {
  if (!playing) return;
  advance();
  if (!playing) return;
  draw();
  hud();
  if (state.done) {
    void end();
    return;
  }
  animation = requestAnimationFrame(tick);
}

function syncClock() {
  if (!playing) return;
  cancelAnimationFrame(animation);
  tick();
}

function updateCountdown() {
  if (!countdownDeadline) return;
  const remaining = Math.ceil((countdownDeadline - Date.now()) / 600);
  if (remaining > 0) {
    $('countdown').textContent = String(Math.min(3, remaining));
    return;
  }
  clearInterval(countdownTimer);
  startedAt = countdownDeadline;
  countdownDeadline = 0;
  $('countdown').hidden = true;
  playing = true;
  busy = false;
  progressTimer = setInterval(() => {
    if (!playing) return;
    advance();
    if (playing && state.tick - committedTick >= 8) {
      flushProgress().catch(connectionLost);
    }
  }, 220);
  canvas.focus({ preventScroll: true });
  syncClock();
}

async function end() {
  playing = false;
  cancelAnimationFrame(animation);
  clearInterval(progressTimer);
  turnQueue = [];
  if (!state.won) {
    const title = state.reason === 'obstacle' ? '剑碑拦路！' : state.reason === 'self' ? '龙身缠结了？' : '撞出星盘啦！';
    show(title, lossSummary(), '不服，再来一局 →');
    $('loss-taunt').textContent = SNAKE_TAUNTS[Math.floor(Math.random() * SNAKE_TAUNTS.length)];
    $('loss-taunt').hidden = false;
    $('oath-detour').hidden = false;
    $('announcement').textContent = '挑战失败。可以重试，或去叫义父领礼。';
    return;
  }
  arena.classList.add('victory');
  show('衔珠渡劫成功', `集齐 ${state.score} 枚灵珠，历时 ${(state.elapsedMs / 1000).toFixed(1)} 秒。正在核验本局并准备奖励…`, '正在领取…');
  startBtn.disabled = true;
  await claimReward();
}

function showRewardSteps() {
  $('reward-steps').hidden = false;
  $('reward-secret').hidden = true;
  $('reward-error').textContent = '';
  $('reward').showModal();
}

function showRewardResult(data) {
  rewardData = data;
  $('base-url').value = data.baseUrl;
  $('api-key').value = data.apiKey;
  $('reward-title').textContent = data.existing ? '欢迎回来' : data.replaced ? '密钥已升级' : '奖励已到账';
  $('reward-result-note').textContent = data.existing
    ? '已凭邮箱找回原来的 API Key。'
    : data.replaced
      ? '旧版共享密钥已换成你的专属 API Key。'
      : '这是与你的邮箱绑定的专属 API Key，请妥善保存。';
  $('copy-status').textContent = '请复制保存。以后可用同一邮箱找回。';
  $('reward-steps').hidden = true;
  $('reward-secret').hidden = false;
  if (!$('reward').open) $('reward').showModal();
  const reopen = document.createElement('button');
  reopen.type = 'button';
  reopen.className = 'secondary';
  reopen.textContent = '查看通关奖励';
  reopen.id = 'reopen-reward';
  reopen.addEventListener('click', () => { if (rewardData) showRewardResult(rewardData); });
  $('reopen-reward')?.remove();
  screen.append(reopen);
}

async function claimReward() {
  if (busy) return;
  busy = true;
  startBtn.disabled = true;
  try {
    await flushProgress(true);
    const data = await api('finish', { id: run.id, receipt: run.receipt });
    if (!data.won && !data.claimable) throw new Error('奖励暂时未准备好，请稍后重试。');
    rewardData = undefined;
    $('score-note').textContent = `${data.score} 枚灵珠 · 龙身 ${data.length} 节 · 用时 ${data.seconds} 秒`;
    showRewardSteps();
    show('衔珠渡劫成功', '验证邮箱即可领取专属 API Key，以后也能凭同一邮箱找回。', '再挑战一局 →');
  } catch (error) {
    const expired = [400, 403, 409, 410].includes(error.status);
    show('通关已达成，领取未完成', error.message, expired ? '重新挑战 →' : '重试领取 →');
    if (!expired) startBtn.dataset.retryClaim = 'true';
  } finally {
    busy = false;
    startBtn.disabled = false;
  }
}

async function begin() {
  if (busy) return;
  sound.unlock();
  if (startBtn.dataset.retryClaim === 'true') {
    delete startBtn.dataset.retryClaim;
    await claimReward();
    return;
  }
  busy = true;
  startBtn.disabled = true;
  startBtn.textContent = '正在开盘…';
  $('notice').textContent = '';
  $('reopen-reward')?.remove();
  rewardData = undefined;
  $('base-url').value = $('api-key').value = '';
  try {
    const humanToken = await verifyHuman('game_start');
    run = await api('start', { humanToken });
    if (run.protocol !== 'snake-live-v1' || run.rules.version !== RULES.version) {
      throw new Error('游戏已更新，请刷新页面。');
    }
    committedTick = 0;
    committedDir = 1;
    progressPromise = undefined;
    clearInterval(progressTimer);
    state = createGame(run.seed);
    prevBody = [[4, 8], [3, 8], [2, 8], [1, 8]];
    particles = [];
    popups = [];
    trace = [];
    turnQueue = [];
    lastRecordedDir = -1;
    startedAt = 0;
    arena.classList.remove('victory');
    draw();
    hud();
    screen.hidden = true;
    $('countdown').hidden = false;
    $('countdown').textContent = '3';
    countdownDeadline = Date.now() + 1800;
    countdownTimer = setInterval(updateCountdown, 100);
    updateCountdown();
  } catch (error) {
    busy = false;
    show('暂时未能开盘', error.message, '重新开盘 →');
  }
}

startBtn.addEventListener('click', begin);

const CODE_MAP = {
  ArrowUp: 0, KeyW: 0,
  ArrowRight: 1, KeyD: 1,
  ArrowDown: 2, KeyS: 2,
  ArrowLeft: 3, KeyA: 3,
};
const KEY_MAP = {
  ArrowUp: 0, w: 0, W: 0,
  ArrowRight: 1, d: 1, D: 1,
  ArrowDown: 2, s: 2, S: 2,
  ArrowLeft: 3, a: 3, A: 3,
};
window.addEventListener('keydown', event => {
  if ($('reward').open) return;
  const dir = event.code in CODE_MAP ? CODE_MAP[event.code] : KEY_MAP[event.key];
  if (dir === undefined) return;
  if (playing || countdownDeadline) {
    event.preventDefault();
    if (!event.repeat) queueDirection(dir);
  }
});

let swipeState = null;
fieldWrap.addEventListener('pointerdown', event => {
  if (!playing && !countdownDeadline) return;
  if (event.target.closest('button, a')) return;
  swipeState = { x: event.clientX, y: event.clientY, id: event.pointerId, lastDir: -1 };
  try { fieldWrap.setPointerCapture(event.pointerId); } catch {}
});
fieldWrap.addEventListener('pointermove', event => {
  if (!swipeState || event.pointerId !== swipeState.id) return;
  const dx = event.clientX - swipeState.x;
  const dy = event.clientY - swipeState.y;
  const ax = Math.abs(dx), ay = Math.abs(dy);
  const threshold = swipeState.lastDir === -1 ? 12 : 22;
  if (Math.max(ax, ay) < threshold) return;
  if (Math.max(ax, ay) < Math.min(ax, ay) * 1.25) return;
  const dir = ax > ay ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
  if (dir !== swipeState.lastDir) {
    queueDirection(dir, true);
    swipeState.lastDir = dir;
  }
  swipeState.x = event.clientX;
  swipeState.y = event.clientY;
});
function finishSwipe(event) {
  if (!swipeState || (event && event.pointerId !== swipeState.id)) return;
  if (event && swipeState.lastDir === -1) {
    const dx = event.clientX - swipeState.x;
    const dy = event.clientY - swipeState.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) >= 10) {
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
      queueDirection(dir, true);
    }
  }
  swipeState = null;
}
fieldWrap.addEventListener('pointerup', finishSwipe);
fieldWrap.addEventListener('pointercancel', () => { swipeState = null; });

for (const [dir, btn] of dpadButtons.entries()) {
  btn.addEventListener('pointerdown', event => {
    event.preventDefault();
    queueDirection(dir, true);
  });
}

window.addEventListener('lmg-skin-change', () => {
  syncSkinLegend();
  if (!playing) draw();
});

document.addEventListener('visibilitychange', () => {
  updateCountdown();
  advance();
  syncClock();
});
window.addEventListener('pageshow', () => {
  if (countdownDeadline) {
    clearInterval(countdownTimer);
    countdownTimer = setInterval(updateCountdown, 100);
    updateCountdown();
  }
  if (playing) syncClock();
  else if (!busy && !rewardData) {
    show('准备御龙？', '集齐 30 枚灵珠即通关。限时金丹 +2 分并缩尾 1 节。\n6 珠起渐落最多 8 座流转剑碑，切勿撞壁或缠身。', '御龙 · 开始试炼 →');
  }
});
window.addEventListener('pagehide', () => {
  advance();
  cancelAnimationFrame(animation);
  clearInterval(countdownTimer);
  rewardData = undefined;
  $('base-url').value = $('api-key').value = '';
  $('reward').close();
});

$('close-reward').addEventListener('click', () => $('reward').close());
$('reward').addEventListener('close', () => {
  $('base-url').value = $('api-key').value = '';
  $('copy-status').textContent = '';
});
$('send-code').addEventListener('click', async () => {
  if (busy) return;
  busy = true;
  $('reward-error').textContent = '';
  $('send-code').disabled = true;
  $('send-code').textContent = '正在发送…';
  try {
    await startEmailVerification({
      email: $('player-email').value,
      source: 'game',
      returnPath: '/free-token/snake/',
      humanHost: $('claim-human'),
    });
  } catch (error) {
    $('reward-error').textContent = error instanceof TypeError ? '网络有些波动，请再试一次。' : error.message;
  } finally {
    busy = false;
    $('send-code').disabled = false;
    $('send-code').textContent = '发送验证码';
  }
});

async function copy(kind) {
  if (!rewardData) return;
  const text = kind === 'url'
    ? rewardData.baseUrl
    : kind === 'key'
      ? rewardData.apiKey
      : `Base URL: ${rewardData.baseUrl}\nAPI Key: ${rewardData.apiKey}`;
  try {
    await navigator.clipboard.writeText(text);
    $('copy-status').textContent = '已复制。';
  } catch {
    const field = kind === 'url' ? $('base-url') : $('api-key');
    field.focus();
    field.select();
    $('copy-status').textContent = '请长按或使用 Ctrl+C 复制。';
  }
}
$('copy-url').addEventListener('click', () => copy('url'));
$('copy-key').addEventListener('click', () => copy('key'));
$('copy-all').addEventListener('click', () => copy('all'));

const returnedReward = takeResult('game');
if (returnedReward) {
  $('score-note').textContent = '邮箱验证成功 · 通关奖励';
  showRewardResult(returnedReward);
  show('奖励已到账', '专属 API Key 已与邮箱绑定，以后可凭同一邮箱找回。', '再挑战一局 →');
} else if (location.hash === '#verify-email') {
  history.replaceState(null, '', location.pathname);
  $('score-note').textContent = '重新填写邮箱';
  showRewardSteps();
}

draw();
hud();

installCcSwitch({
  button: $('open-ccswitch'),
  agyButton: $('open-ccswitch-agy'),
  ownerDialog: $('reward'),
  readCredentials: () => ({ baseUrl: $('base-url').value, apiKey: $('api-key').value }),
});
