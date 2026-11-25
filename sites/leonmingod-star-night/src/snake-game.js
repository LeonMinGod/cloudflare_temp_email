import { RULES, createGame, installEntropy, step } from '../public/free-token/snake/engine-v1.mjs';

export { RULES as SNAKE_RULES, createGame as createSnakeGame, installEntropy as installSnakeEntropy };
export const SNAKE_MAX_AGE = 240000;

const error = (status, message) => ({ status, error: message });

export function verifySnakeRun(run, body, now) {
  if (!run || now > run.expires) return error(410, '这一局已过期，重新开局即可。');
  if (run.game !== 'snake' || run.protocol !== 'snake-live-v1' || run.rulesVersion !== RULES.version) {
    return error(410, '阵法已更新，请刷新后重新挑战。');
  }
  if (body.sessionHash !== run.sessionHash) return error(403, '这一局与当前浏览器不匹配，请重新开局。');
  if (run.claimed) return error(409, '这一局已经领取过奖励。');
  if (body.trace !== undefined) return error(400, '请在游戏中实时完成挑战。');
  if (body.receipt !== run.receipt) return error(409, '本局操作记录不完整，请重新挑战。');
  const state = run.state;
  if (!state?.won || !state.done || state.score < RULES.goal) {
    return error(400, '灵珠尚未集齐，再挑战一次吧。');
  }
  const elapsed = now - run.started;
  if (elapsed < state.elapsedMs - 350 || now - run.lastSeen > 8000) {
    return error(400, '请连续完成整局挑战后再领取。');
  }
  return {
    status: 200,
    result: {
      won: true,
      score: state.score,
      ticks: state.tick,
      seconds: Math.round(state.elapsedMs / 100) / 10,
      length: state.body.length,
    },
  };
}

export function verifySnakeProgress(run, body, now) {
  if (!run || now > run.expires) return error(410, '这一局已过期，重新开局即可。');
  if (run.game !== 'snake' || run.protocol !== 'snake-live-v1' || run.rulesVersion !== RULES.version) {
    return error(410, '阵法已更新，请刷新后重新开局。');
  }
  if (body.sessionHash !== run.sessionHash) return error(403, '这一局与当前浏览器不匹配。');
  if (run.claimed) return error(409, '这一局已经领取过奖励。');
  if (body.receipt !== run.receipt) return error(409, '操作顺序不匹配，请重新开局。');
  if (run.state.done) return error(409, '这一局已经结束，请重新开局。');

  const from = run.state.tick;
  const tick = body.tick;
  if (!Number.isInteger(tick) || tick <= from || tick > RULES.maxTicks || tick - from > 45) {
    return error(400, '操作记录不完整，请重新挑战。');
  }
  if (now - run.lastSeen > 8000) {
    return error(400, '阵法连接已中断，请保持页面打开重新挑战。');
  }

  const trace = body.trace;
  if (!Array.isArray(trace) || trace.length < 1 || trace.length > tick - from || trace[0]?.[0] !== from) {
    return error(400, '本局操作记录无效。');
  }
  let previous = from - 1;
  for (const entry of trace) {
    if (
      !Array.isArray(entry) ||
      entry.length !== 2 ||
      !Number.isInteger(entry[0]) ||
      entry[0] <= previous ||
      entry[0] < from ||
      entry[0] >= tick ||
      !Number.isInteger(entry[1]) ||
      entry[1] < 0 ||
      entry[1] > 3
    ) {
      return error(400, '本局操作记录无效。');
    }
    previous = entry[0];
  }

  const state = structuredClone(run.state);
  let index = 0;
  let dir = state.dir;
  try {
    while (state.tick < tick && !state.done) {
      if (trace[index]?.[0] === state.tick) dir = trace[index++][1];
      step(state, dir);
    }
  } catch {
    return error(409, '后续阵法尚未下发，请重新挑战。');
  }
  if (state.tick !== tick || index !== trace.length) {
    return error(400, '本局操作记录与阵法不符。');
  }
  if (!state.done && tick - from < 6) {
    return error(400, '操作记录不完整，请重新挑战。');
  }
  const elapsed = now - run.started;
  if (state.elapsedMs > elapsed + 350 || elapsed - state.elapsedMs > 6500) {
    return error(400, '阵法连接已中断，请保持页面打开重新挑战。');
  }
  return { status: 200, state };
}
