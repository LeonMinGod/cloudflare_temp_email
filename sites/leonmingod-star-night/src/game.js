import * as current from '../public/free-token/game/engine-v8.mjs';
import * as previous from '../public/free-token/game/engine-v7.mjs';
const { RULES, createGame, installEntropy } = current;
const engineFor = run => run.rulesVersion === 7 ? previous : run.rulesVersion === 8 ? current : null;
import { json, hash, sessionIdentity, verifyHuman, rateLimit } from './security.js';
import { issueClaimGrant } from './claim-grant.js';
import { PoolStatusCoordinator } from './pool-status.js';
export { json } from './security.js';
export const MAX_AGE = 180000;
const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0] || 1;
const error = (status, message) => ({ status, error: message });

export function verifyRun(run, body, now) {
  if (!run || now > run.expires) return error(410, '这一局已过期，重新开局即可。');
  if (run.protocol !== 'live-v1' || !engineFor(run)) return error(410, '阵法已更新，请刷新后重新挑战。');
  if (body.sessionHash !== run.sessionHash) return error(403, '这一局与当前浏览器不匹配，请重新开局。');
  if (run.claimed) return error(409, '这一局已经领取过奖励。');
  if (body.trace !== undefined) return error(400, '请在游戏中实时完成挑战。');
  if (body.receipt !== run.receipt) return error(409, '本局操作记录不完整，请重新挑战。');
  if (now - run.started < 44750 || now - run.lastSeen > 7000) return error(400, '请连续完成整局挑战后再领取。');
  const state = run.state;
  if (!state?.won || state.frame !== RULES.frames || state.shields <= 0 || state.jade < RULES.goal) return error(400, '尚未破阵成功，再挑战一次吧。');
  return { status: 200, result: { won: true, jade: state.jade, shields: state.shields, frames: state.frame } };
}

// Validate each immutable input prefix against server time and server-owned state.
export function verifyProgress(run, body, now) {
  if (!run || now > run.expires) return error(410, '这一局已过期，重新开局即可。');
  if (run.protocol !== 'live-v1' || !engineFor(run)) return error(410, '阵法已更新，请重新开局。');
  if (body.sessionHash !== run.sessionHash) return error(403, '这一局与当前浏览器不匹配。');
  if (run.claimed) return error(409, '这一局已经领取过奖励。');
  if (body.receipt !== run.receipt) return error(409, '操作顺序不匹配，请重新开局。');
  const from = run.state.frame, frame = body.frame;
  if (!Number.isInteger(frame) || frame <= from || frame > RULES.frames || frame - from > 180 || (frame - from < 30 && frame !== RULES.frames)) return error(400, '操作记录不完整，请重新挑战。');
  const elapsed = now - run.started;
  if (now - run.lastSeen > 7000 || frame * 1000 / 60 > elapsed + 250 || elapsed - frame * 1000 / 60 > 5000) return error(400, '阵法连接已中断，请保持页面打开重新挑战。');
  const trace = body.trace;
  if (!Array.isArray(trace) || trace.length < 1 || trace.length > frame - from || trace[0]?.[0] !== from) return error(400, '本局操作记录无效。');
  let previous = from - 1;
  for (const entry of trace) {
    if (!Array.isArray(entry) || entry.length !== 2 || !Number.isInteger(entry[0]) || entry[0] <= previous || entry[0] < from || entry[0] >= frame || !Number.isInteger(entry[1]) || entry[1] < 0 || entry[1] > 1000) return error(400, '本局操作记录无效。');
    previous = entry[0];
  }
  const state = structuredClone(run.state);
  let index = 0;
  try {
    while (state.frame < frame && !state.done) {
      if (trace[index]?.[0] === state.frame) state.target = trace[index++][1];
      engineFor(run).step(state);
    }
  } catch { return error(409, '后续阵法尚未下发，请重新挑战。'); }
  if (state.frame !== frame || index !== trace.length) return error(400, '本局操作记录与阵法不符。');
  return { status: 200, state };
}

export class GameRun {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/pool-status') {
      this.pool ||= new PoolStatusCoordinator(this.ctx, this.env);
      return this.pool.fetch(request);
    }
    const body = await request.json();
    if (path === '/mutex') {
      const now = Date.now();
      const current = await this.ctx.storage.get('mutex');
      if (body.op === 'end') {
        if (current?.token === body.token) await this.ctx.storage.delete('mutex');
        return json(200, { ok: true });
      }
      if (current && current.token !== body.token && now - current.at < 15000) return json(409, { error: 'busy' });
      await this.ctx.storage.put('mutex', { at: now, token: body.token });
      return json(200, { ok: true });
    }
    if (path === '/limit') {
      const now = Date.now();
      const response = await this.ctx.storage.transaction(async txn => {
        const key = 'rate:' + body.action;
        const times = ((await txn.get(key)) || []).filter(t => now - t < 3600000);
        const minute = times.filter(t => now - t < 60000).length;
        const max = body.action === 'start' ? [20, 200] : [10, 60];
        if (minute >= max[0] || times.length >= max[1]) return json(429, { error: 'Too many requests' });
        times.push(now); await txn.put(key, times);
        return json(200, { ok: true });
      });
      await this.ctx.storage.setAlarm(now + 3600000);
      return response;
    }
    if (path === '/init') {
      const now = Date.now(), initial = seed();
      const run = { protocol: 'live-v1', rulesVersion: RULES.version, sessionHash: body.sessionHash, started: now + 1800, expires: now + MAX_AGE, lastSeen: now + 1800, claimed: false, receipt: crypto.randomUUID(), state: createGame(initial) };
      const created = await this.ctx.storage.transaction(async txn => {
        if (await txn.get('run')) return false;
        await txn.put('run', run); return true;
      });
      if (!created) return json(409, { error: '请重新开局。' });
      await this.ctx.storage.setAlarm(run.expires + 60000);
      return json(200, { protocol: run.protocol, seed: initial, receipt: run.receipt, expires: run.expires, rules: RULES });
    }
    if (!['/progress', '/finish'].includes(path)) return json(404, { error: 'Not found' });
    const digest = path === '/progress' ? await hash(JSON.stringify(body)) : null;
    return this.ctx.storage.transaction(async txn => {
      const run = await txn.get('run'), now = Date.now();
      if (path === '/finish') {
        const checked = verifyRun(run, body, now);
        if (checked.status !== 200) return json(checked.status, { error: checked.error });
        await txn.put('run', { ...run, claimed: true });
        return json(200, checked.result);
      }
      if (run && now <= run.expires && body.sessionHash === run.sessionHash && body.receipt === run.previousReceipt && digest === run.previousDigest) return json(200, run.previousResponse);
      const checked = verifyProgress(run, body, now);
      if (checked.status !== 200) return json(checked.status, { error: checked.error });
      const state = checked.state, entropy = [];
      // Reveal only the next block, after an irreversible live input commitment.
      const boundary = Math.ceil((state.frame + 1) / RULES.segmentFrames) * RULES.segmentFrames;
      if (!state.done && boundary < RULES.frames && state.frame >= boundary - 120 && !state.entropy[boundary]) {
        const next = { frame: boundary, seed: seed() }; installEntropy(state, [next]); entropy.push(next);
      }
      const receipt = crypto.randomUUID();
      const response = { frame: state.frame, receipt, entropy, done: state.done, won: state.won };
      await txn.put('run', { ...run, state, receipt, lastSeen: now, previousReceipt: body.receipt, previousDigest: digest, previousResponse: response });
      return json(200, response);
    });
  }
  async alarm() {
    if (await this.ctx.storage.get('pool-status-kind') === 'pool') {
      this.pool ||= new PoolStatusCoordinator(this.ctx, this.env);
      await this.pool.alarm();
      return;
    }
    await this.ctx.storage.deleteAll();
  }
}

export async function handleGame(request, env) {
  const url = new URL(request.url), action = url.pathname.split('/').at(-1);
  if (request.method !== 'POST') return json(405, { error: '请通过游戏页面发起挑战。' }, { Allow: 'POST' });
  if (request.headers.get('Origin') !== url.origin) return json(403, { error: '请在本站完成挑战。' });
  if (!request.headers.get('Content-Type')?.toLowerCase().includes('application/json')) return json(415, { error: '请求格式不正确。' });
  if (!env.FREE_TOKEN_RENDER_KEY || !env.GAME_RUNS) return json(503, { error: '暂未开放，请稍后再来。' });
  const verificationRequest = request.clone();
  const text = await request.text();
  if (text.length > 12000) return json(413, { error: '操作记录过长，请重新挑战。' });
  let body;
  try { body = JSON.parse(text); } catch { return json(400, { error: '请求格式不正确。' }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json(400, { error: '请求格式不正确。' });
  if (action === 'start') {
    const limited = await rateLimit(verificationRequest, env, 'start'); if (limited) return limited;
    const headers = new Headers();
    const denied = await verifyHuman(verificationRequest, env, body.humanToken, 'game_start', headers); if (denied) return denied;
    const id = crypto.randomUUID(), secret = crypto.randomUUID() + crypto.randomUUID();
    const sessionHash = await hash(secret + ':' + await sessionIdentity(request));
    const response = await env.GAME_RUNS.get(env.GAME_RUNS.idFromName(id)).fetch('https://game.internal/init', { method: 'POST', body: JSON.stringify({ sessionHash }) });
    const challenge = await response.json();
    if (!response.ok) return json(response.status, challenge, headers);
    headers.append('Set-Cookie', `lmg_game=${secret}; HttpOnly; SameSite=Strict; Path=/api/free-token/game; Max-Age=180${url.protocol === 'https:' ? '; Secure' : ''}`);
    return json(200, { id, ...challenge }, headers);
  }
  if (!ID.test(body.id || '') || !['progress', 'finish'].includes(action)) return json(400, { error: '这一局的信息无效，请重新开局。' });
  const secret = request.headers.get('Cookie')?.match(/(?:^|;\s*)lmg_game=([a-f0-9-]{72})(?:;|$)/)?.[1];
  if (!secret) return json(403, { error: '挑战凭证已失效，请重新开局。' });
  const response = await env.GAME_RUNS.get(env.GAME_RUNS.idFromName(body.id)).fetch('https://game.internal/' + action, { method: 'POST', body: JSON.stringify({ sessionHash: await hash(secret + ':' + await sessionIdentity(request)), receipt: body.receipt, frame: body.frame, trace: body.trace }) });
  const result = await response.json();
  if (!response.ok || action === 'progress') return json(response.status, result);
  const issued = await issueClaimGrant(request, env, 'game');
  if (!issued) return json(503, { error: '通关已记录，但领取暂时不可用，请稍后重试。' });
  const headers = new Headers();
  headers.append('Set-Cookie', issued.cookie);
  headers.append('Set-Cookie', `lmg_game=; HttpOnly; SameSite=Strict; Path=/api/free-token/game; Max-Age=0${url.protocol === 'https:' ? '; Secure' : ''}`);
  return json(200, { ...result, claimable: true }, headers);
}
