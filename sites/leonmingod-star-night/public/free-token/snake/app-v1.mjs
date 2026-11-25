import { installCcSwitch } from '../ccswitch-v2.mjs?v=3';
import { DIRS, RULES, createGame, installEntropy, isOppositeDir, phaseOf, step, tickMsFor } from './engine-v1.mjs';
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
  '这弯拐得太急啦，义父牌 Token 就在隔壁等你。😂',
];

const PHASE_NAMES = [
  '第一境 · 游龙戏珠',
  '第二境 · 破雾衔珠',
  '第三境 · 剑碑落阵',
  '第四境 · 龙腾星海',
  '终境 · 衔珠成圣',
];

const canvas = $('game');
const ctx = canvas.getContext('2d');
const arena = $('arena');
const screen = $('screen');
const startBtn = $('start');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const CELL = 720 / RULES.cols; // 40px per grid cell

// Lightweight synthesized Web Audio feedback (zero external audio files).
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
    if (kind !== 'win' && kind !== 'hit' && now - lastAt < 0.06) return;
    lastAt = now;
    const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
    if (kind === 'orb') {
      const base = scale[score % scale.length];
      tone(base, base * 1.25, 0.14, 0.038, 'sine');
    } else if (kind === 'bonus') {
      tone(659.25, 880, 0.12, 0.042, 'triangle', 0);
      tone(880, 1318.5, 0.18, 0.042, 'triangle', 0.075);
    } else if (kind === 'warn') {
      tone(420, 340, 0.16, 0.026, 'triangle');
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

// Deterministic background star positions for crisp procedural board.
const STARS = Array.from({ length: 42 }, (_, i) => ({
  x: ((i * 197 + 41) % 700) + 10,
  y: ((i * 313 + 73) % 700) + 10,
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
let prevBody = state.body.map(p => [p[0], p[1]]);
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
  if (state.tick <= committedTick || (!final && state.tick - committedTick < 10)) return;
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

function queueDirection(dir) {
  if (!playing && !countdownDeadline) return;
  if (!Number.isInteger(dir) || dir < 0 || dir > 3) return;
  const reference = turnQueue.length ? turnQueue.at(-1) : state.dir;
  if (dir === reference || isOppositeDir(dir, reference)) return;
  if (turnQueue.length >= 2) turnQueue[1] = dir;
  else turnQueue.push(dir);
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
      r: 2 + Math.random() * 2.6,
      color,
      born: now,
      life: 420 + Math.random() * 220,
    });
  }
  if (particles.length > 96) particles.splice(0, particles.length - 96);
}

function spawnPopup(gx, gy, text, color) {
  popups.push({
    x: Math.max(76, Math.min(644, (gx + 0.5) * CELL)),
    y: Math.max(48, (gy + 0.35) * CELL),
    text,
    color,
    born: performance.now(),
    life: 820,
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
      } else if (ev.kind === 'warn') {
        sound.play('warn', state.score);
      } else if (ev.kind === 'hit') {
        spawnParticles(ev.x, ev.y, '#fb7185', 18);
        sound.play('hit', state.score);
        if (!reduced) {
          arena.classList.remove('shake');
          void canvas.offsetWidth;
          arena.classList.add('shake');
        }
      } else if (ev.kind === 'win') {
        spawnParticles(ev.x, ev.y, '#fde68a', 26);
        sound.play('win', state.score);
      }
    }
  }
}

function drawRoundedRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function draw() {
  const xmas = isXmas();
  const now = performance.now();
  const t = now * 0.001;

  // 1. Background sky gradient
  const bg = ctx.createRadialGradient(360, 290, 40, 360, 360, 520);
  if (xmas) {
    bg.addColorStop(0, '#2b0f21');
    bg.addColorStop(0.55, '#170915');
    bg.addColorStop(1, '#0c050e');
  } else {
    bg.addColorStop(0, '#0e2d39');
    bg.addColorStop(0.58, '#081d26');
    bg.addColorStop(1, '#041118');
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 720, 720);

  // 2. Subtle starfield
  for (const s of STARS) {
    const twinkle = reduced ? 0.55 : 0.35 + 0.45 * Math.sin(t * 2.1 + s.phase);
    ctx.fillStyle = xmas
      ? `rgba(255, 226, 172, ${twinkle * 0.55})`
      : `rgba(182, 245, 224, ${twinkle * 0.48})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. Starlight grid lines + delicate corner frame
  ctx.strokeStyle = xmas ? 'rgba(255, 212, 152, 0.085)' : 'rgba(130, 224, 194, 0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < RULES.cols; i++) {
    const p = i * CELL + 0.5;
    ctx.moveTo(p, 0); ctx.lineTo(p, 720);
    ctx.moveTo(0, p); ctx.lineTo(720, p);
  }
  ctx.stroke();

  // Inner boundary sheen
  ctx.strokeStyle = xmas ? 'rgba(251, 191, 130, 0.24)' : 'rgba(134, 232, 200, 0.2)';
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, 716, 716);

  // 4. Obstacles (warning telegraph or solid stele / ice pine obelisk)
  for (const obs of state.obstacles) {
    const cx = (obs.x + 0.5) * CELL;
    const cy = (obs.y + 0.5) * CELL;
    if (obs.warn > 0) {
      const progress = 1 - obs.warn / RULES.obstacleWarnTicks;
      const pulse = reduced ? 0.7 : 0.45 + 0.45 * Math.abs(Math.sin(t * 8));
      ctx.save();
      ctx.fillStyle = xmas
        ? `rgba(125, 211, 252, ${0.14 + pulse * 0.16})`
        : `rgba(240, 118, 92, ${0.14 + pulse * 0.18})`;
      drawRoundedRect(obs.x * CELL + 4, obs.y * CELL + 4, CELL - 8, CELL - 8, 8);
      ctx.fill();
      ctx.strokeStyle = xmas ? `rgba(186, 230, 253, ${0.55 + pulse * 0.4})` : `rgba(255, 166, 132, ${0.55 + pulse * 0.4})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      // Converging warning countdown arc
      ctx.beginPath();
      ctx.arc(cx, cy, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - progress));
      ctx.strokeStyle = '#fde68a';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = '#fef3c7';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', cx, cy + 1);
      ctx.restore();
    } else {
      ctx.save();
      ctx.translate(cx, cy);
      if (xmas) {
        // Frosted crystalline pine-ice obelisk
        const grad = ctx.createLinearGradient(0, -16, 0, 16);
        grad.addColorStop(0, '#e0f2fe');
        grad.addColorStop(0.5, '#38bdf8');
        grad.addColorStop(1, '#1e3a5f');
        ctx.fillStyle = 'rgba(125, 211, 252, 0.22)';
        ctx.beginPath();
        ctx.arc(0, 0, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(0, -16);
        ctx.lineTo(13, -3);
        ctx.lineTo(9, 15);
        ctx.lineTo(-9, 15);
        ctx.lineTo(-13, -3);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#f0f9ff';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -10); ctx.lineTo(0, 10);
        ctx.moveTo(-7, 0); ctx.lineTo(7, 0);
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      } else {
        // Forged crimson-iron sword stele
        ctx.fillStyle = 'rgba(235, 108, 86, 0.2)';
        ctx.beginPath();
        ctx.arc(0, 0, 18, 0, Math.PI * 2);
        ctx.fill();
        const grad = ctx.createLinearGradient(-12, -16, 12, 16);
        grad.addColorStop(0, '#f8a58e');
        grad.addColorStop(0.45, '#b8423a');
        grad.addColorStop(1, '#4c1b22');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(0, -17);
        ctx.lineTo(12, -7);
        ctx.lineTo(10, 15);
        ctx.lineTo(-10, 15);
        ctx.lineTo(-12, -7);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#ffd5be';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -11); ctx.lineTo(0, 9);
        ctx.moveTo(-6, -3); ctx.lineTo(6, -3);
        ctx.strokeStyle = '#ffe6cc';
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // 5. Regular Spirit Pearl (灵珠 / 圣诞星珠)
  if (state.orb) {
    const ox = (state.orb.x + 0.5) * CELL;
    const oy = (state.orb.y + 0.5) * CELL;
    const bob = reduced ? 0 : Math.sin(t * 4.5) * 2.2;
    const glowR = reduced ? 20 : 19 + Math.sin(t * 5) * 3;
    ctx.save();
    ctx.translate(ox, oy + bob);
    const halo = ctx.createRadialGradient(0, 0, 2, 0, 0, glowR);
    if (xmas) {
      halo.addColorStop(0, 'rgba(255, 240, 200, 0.9)');
      halo.addColorStop(0.45, 'rgba(244, 63, 94, 0.55)');
      halo.addColorStop(1, 'rgba(244, 63, 94, 0)');
    } else {
      halo.addColorStop(0, 'rgba(235, 255, 245, 0.92)');
      halo.addColorStop(0.45, 'rgba(72, 232, 184, 0.52)');
      halo.addColorStop(1, 'rgba(72, 232, 184, 0)');
    }
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, glowR, 0, Math.PI * 2);
    ctx.fill();

    // Orbit ring
    ctx.strokeStyle = xmas ? 'rgba(253, 224, 150, 0.6)' : 'rgba(220, 246, 185, 0.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, 14, t * 2, t * 2 + Math.PI * 1.35);
    ctx.stroke();

    // Core pearl
    const core = ctx.createRadialGradient(-3, -4, 1, 0, 0, 11);
    if (xmas) {
      core.addColorStop(0, '#fff7ed');
      core.addColorStop(0.45, '#fb7185');
      core.addColorStop(1, '#9f1239');
    } else {
      core.addColorStop(0, '#ffffff');
      core.addColorStop(0.45, '#6ef7cb');
      core.addColorStop(1, '#12826c');
    }
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, 10.5, 0, Math.PI * 2);
    ctx.fill();

    if (xmas) {
      // Gold ornament crown cap
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(-3.5, -13, 7, 3.2);
    }
    // Specular highlight
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.beginPath();
    ctx.arc(-3.5, -3.5, 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 6. Timed Bonus (金丹 / 圣诞礼盒) with live circular countdown arc
  if (state.bonus) {
    const bx = (state.bonus.x + 0.5) * CELL;
    const by = (state.bonus.y + 0.5) * CELL;
    const frac = Math.max(0, state.bonus.ttl / RULES.bonusTicks);
    const pulse = reduced ? 1 : 1 + Math.sin(t * 7.5) * 0.08;
    ctx.save();
    ctx.translate(bx, by);

    // Countdown ring
    ctx.beginPath();
    ctx.arc(0, 0, 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.strokeStyle = frac < 0.3 ? '#fb7185' : '#fde68a';
    ctx.lineWidth = 2.6;
    ctx.stroke();

    ctx.scale(pulse, pulse);
    const aura = ctx.createRadialGradient(0, 0, 2, 0, 0, 18);
    aura.addColorStop(0, 'rgba(254, 240, 138, 0.85)');
    aura.addColorStop(0.55, 'rgba(245, 158, 11, 0.42)');
    aura.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();

    if (xmas) {
      // Christmas Gift Box
      drawRoundedRect(-10, -8, 20, 17, 3);
      ctx.fillStyle = '#dc2626';
      ctx.fill();
      ctx.strokeStyle = '#fde68a';
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(-2, -8, 4, 17);
      ctx.fillRect(-10, -1, 20, 3.6);
      // Ribbon bow
      ctx.beginPath();
      ctx.ellipse(-4, -10, 4, 2.3, -0.35, 0, Math.PI * 2);
      ctx.ellipse(4, -10, 4, 2.3, 0.35, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Radiant Golden Elixir Pill (金丹)
      const pill = ctx.createRadialGradient(-3, -3, 1, 0, 0, 11.5);
      pill.addColorStop(0, '#fffbeb');
      pill.addColorStop(0.45, '#fcd34d');
      pill.addColorStop(1, '#b45309');
      ctx.fillStyle = pill;
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fef3c7';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = '#78350f';
      ctx.font = 'bold 11px "KaiTi", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('丹', 0, 0.5);
    }
    ctx.restore();
  }

  // 7. Smoothly interpolated Celestial Dragon (青玉灵龙 / 红金雪龙)
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
    // Soft luminous dragon aura
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.strokeStyle = xmas ? 'rgba(244, 63, 94, 0.24)' : 'rgba(64, 232, 184, 0.22)';
    ctx.lineWidth = 30;
    ctx.stroke();

    // Draw overlapping tapered dragon scales from tail to neck
    const total = points.length;
    for (let i = total - 1; i >= 1; i--) {
      const ratio = i / Math.max(1, total - 1);
      const radius = 15.2 - ratio * 6.8;
      const [px, py] = points[i];
      const [nx, ny] = points[i - 1];
      const midX = (px + nx) * 0.5;
      const midY = (py + ny) * 0.5;

      // Connector fill between segments for silky smooth silhouette
      ctx.fillStyle = xmas
        ? (i % 2 === 0 ? '#be123c' : '#9f1239')
        : (i % 2 === 0 ? '#1b9e82' : '#147d6c');
      ctx.beginPath();
      ctx.arc(midX, midY, radius * 0.94, 0, Math.PI * 2);
      ctx.fill();

      // Segment body orb with dorsal sheen
      const segGrad = ctx.createRadialGradient(px - 3, py - 3, 1, px, py, radius);
      if (xmas) {
        segGrad.addColorStop(0, '#fda4af');
        segGrad.addColorStop(0.5, '#e11d48');
        segGrad.addColorStop(1, '#881337');
      } else {
        segGrad.addColorStop(0, '#9bfbe0');
        segGrad.addColorStop(0.52, '#22b591');
        segGrad.addColorStop(1, '#0c5c52');
      }
      ctx.fillStyle = segGrad;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();

      // Golden dorsal scale diamond
      ctx.fillStyle = xmas ? 'rgba(254, 240, 138, 0.72)' : 'rgba(240, 224, 158, 0.58)';
      ctx.beginPath();
      ctx.arc(px, py, Math.max(2.2, radius * 0.28), 0, Math.PI * 2);
      ctx.fill();
    }

    // Articulated Dragon Head
    const [hx, hy] = points[0];
    const [dx, dy] = DIRS[state.dir];
    const angle = Math.atan2(dy, dx);
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(angle);

    // Flowing dragon whiskers
    const sway = reduced ? 0 : Math.sin(t * 9) * 3.5;
    ctx.strokeStyle = xmas ? '#fde68a' : '#e6d8a2';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(8, -9);
    ctx.quadraticCurveTo(2, -19 + sway, -9, -22 + sway);
    ctx.moveTo(8, 9);
    ctx.quadraticCurveTo(2, 19 - sway, -9, 22 - sway);
    ctx.stroke();

    // Horns / Christmas antlers
    ctx.strokeStyle = xmas ? '#fef08a' : '#d6c88e';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-5, -8); ctx.lineTo(-16, -15);
    ctx.moveTo(-5, 8); ctx.lineTo(-16, 15);
    if (xmas) {
      ctx.moveTo(-11, -12); ctx.lineTo(-12, -18);
      ctx.moveTo(-11, 12); ctx.lineTo(-12, 18);
    }
    ctx.stroke();

    // Head crest
    const headGrad = ctx.createRadialGradient(4, -3, 2, 0, 0, 20);
    if (xmas) {
      headGrad.addColorStop(0, '#ffe4e6');
      headGrad.addColorStop(0.4, '#f43f5e');
      headGrad.addColorStop(1, '#881337');
    } else {
      headGrad.addColorStop(0, '#c8fff0');
      headGrad.addColorStop(0.45, '#32d4a8');
      headGrad.addColorStop(1, '#0e695c');
    }
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.ellipse(2, 0, 18, 14.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = xmas ? '#fde68a' : '#d9f7dc';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Snout crest & luminous eyes
    ctx.fillStyle = '#fff9db';
    ctx.beginPath();
    ctx.arc(6, -6.2, 3.3, 0, Math.PI * 2);
    ctx.arc(6, 6.2, 3.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = xmas ? '#4c0519' : '#052b29';
    ctx.beginPath();
    ctx.arc(7.1, -6.2, 1.5, 0, Math.PI * 2);
    ctx.arc(7.1, 6.2, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Forehead pearl gem
    ctx.fillStyle = xmas ? '#fde047' : '#a7f3d0';
    ctx.beginPath();
    ctx.arc(-2, 0, 3.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  // 8. Particle bursts & floating score popups
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
    wall: '灵龙撞上了星盘边界',
    self: '灵龙一头咬住了自己尾巴',
    obstacle: '灵龙撞上了实体剑碑',
    timeout: '时间耗尽，灵阵散去',
  }[state.reason] || '试炼中断';
  return `${cause}（坚持 ${seconds} 秒，已集 ${collected} / ${RULES.goal} 珠）。\n只差 ${left} 珠，下次走位再稳半拍！`;
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
    if (playing && state.tick - committedTick >= 10) {
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
    const title = state.reason === 'obstacle' ? '剑碑拦路！' : state.reason === 'self' ? '龙尾打结了？' : '撞出星盘啦！';
    show(title, lossSummary(), '不服，再来一局 →');
    $('loss-taunt').textContent = SNAKE_TAUNTS[Math.floor(Math.random() * SNAKE_TAUNTS.length)];
    $('loss-taunt').hidden = false;
    $('oath-detour').hidden = false;
    $('announcement').textContent = '挑战失败。可以重试，或去叫义父领礼。';
    return;
  }
  arena.classList.add('victory');
  show('衔珠成圣', `集齐 ${state.score} 枚灵珠，历时 ${(state.elapsedMs / 1000).toFixed(1)} 秒。正在核验本局并准备奖励…`, '正在领取…');
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
    show('衔珠成圣', '验证邮箱即可领取专属 API Key，以后也能凭同一邮箱找回。', '再挑战一局 →');
  } catch (error) {
    const expired = [400, 403, 409, 410].includes(error.status);
    show('衔珠成圣，领取未完成', error.message, expired ? '重新挑战 →' : '重试领取 →');
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
    prevBody = state.body.map(p => [p[0], p[1]]);
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

// Keyboard steering (Arrow keys + WASD)
const KEY_MAP = {
  ArrowUp: 0, w: 0, W: 0,
  ArrowRight: 1, d: 1, D: 1,
  ArrowDown: 2, s: 2, S: 2,
  ArrowLeft: 3, a: 3, A: 3,
};
window.addEventListener('keydown', event => {
  if (!(event.key in KEY_MAP)) return;
  if ($('reward').open) return;
  if (playing || countdownDeadline) {
    event.preventDefault();
    queueDirection(KEY_MAP[event.key]);
  }
});

// Canvas swipe steering (continuous responsive swipe with 18px threshold)
let swipeOrigin = null;
canvas.addEventListener('pointerdown', event => {
  if (!playing && !countdownDeadline) return;
  swipeOrigin = { x: event.clientX, y: event.clientY, id: event.pointerId };
  try { canvas.setPointerCapture(event.pointerId); } catch {}
});
canvas.addEventListener('pointermove', event => {
  if (!swipeOrigin || event.pointerId !== swipeOrigin.id) return;
  const dx = event.clientX - swipeOrigin.x;
  const dy = event.clientY - swipeOrigin.y;
  if (Math.hypot(dx, dy) < 18) return;
  const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
  queueDirection(dir);
  swipeOrigin.x = event.clientX;
  swipeOrigin.y = event.clientY;
});
const clearSwipe = () => { swipeOrigin = null; };
canvas.addEventListener('pointerup', clearSwipe);
canvas.addEventListener('pointercancel', clearSwipe);

// On-screen D-pad controls (instant pointerdown response)
for (const btn of document.querySelectorAll('.dpad-btn')) {
  btn.addEventListener('pointerdown', event => {
    event.preventDefault();
    const dir = Number(btn.dataset.dir);
    queueDirection(dir);
    btn.classList.add('is-pressed');
    setTimeout(() => btn.classList.remove('is-pressed'), 120);
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
    show('准备御龙？', '集齐 26 枚灵珠即通关。限时金丹 +2 分并缩尾 2 节。\n12 珠后将降下预警剑碑，切勿撞壁或咬尾。', '御龙 · 开始试炼 →');
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
