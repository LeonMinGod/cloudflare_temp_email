// Deterministic dual-side engine for 「灵龙衔珠」 (shared by browser & Cloudflare Worker).
export const DIRS = Object.freeze([
  Object.freeze([0, -1]), // 0: Up
  Object.freeze([1, 0]),  // 1: Right
  Object.freeze([0, 1]),  // 2: Down
  Object.freeze([-1, 0]), // 3: Left
]);

export const RULES = Object.freeze({
  version: 1,
  cols: 18,
  rows: 18,
  goal: 26,
  initialLength: 4,
  minLength: 4,
  bonusEvery: 5,
  bonusPoints: 2,
  bonusTrim: 2,
  bonusTicks: 44,
  obstacleWarnTicks: 18,
  obstacleStartScore: 12,
  obstacleMidScore: 18,
  maxObstacles: 3,
  segmentTicks: 30,
  maxTicks: 1200,
});

export function tickMsFor(score) {
  if (score >= 22) return 90;
  if (score >= 18) return 100;
  if (score >= 12) return 112;
  if (score >= 6) return 126;
  return 142;
}

export function phaseOf(state) {
  if (state.score >= 22) return 4;
  if (state.score >= 18) return 3;
  if (state.score >= 12) return 2;
  if (state.score >= 6) return 1;
  return 0;
}

export function isOppositeDir(a, b) {
  return Number.isInteger(a) && Number.isInteger(b) && (a ^ 2) === b;
}

function nextU32(state) {
  let x = (state.random >>> 0) || 1;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.random = (x >>> 0) || 1;
  return state.random;
}

function occupiedSet(state) {
  const used = new Set();
  for (const [x, y] of state.body) used.add(y * RULES.cols + x);
  if (state.orb) used.add(state.orb.y * RULES.cols + state.orb.x);
  if (state.bonus) used.add(state.bonus.y * RULES.cols + state.bonus.x);
  for (const obs of state.obstacles) used.add(obs.y * RULES.cols + obs.x);
  return used;
}

function pickCell(state, predicate) {
  const used = occupiedSet(state);
  const preferred = [];
  const fallback = [];
  for (let y = 0; y < RULES.rows; y++) {
    for (let x = 0; x < RULES.cols; x++) {
      if (used.has(y * RULES.cols + x)) continue;
      if (!predicate || predicate(x, y)) preferred.push([x, y]);
      else fallback.push([x, y]);
    }
  }
  const pool = preferred.length ? preferred : fallback;
  if (!pool.length) return null;
  const pick = pool[nextU32(state) % pool.length];
  return { x: pick[0], y: pick[1] };
}

function pickStrictCell(state, predicate) {
  const used = occupiedSet(state);
  const candidates = [];
  for (let y = 0; y < RULES.rows; y++) {
    for (let x = 0; x < RULES.cols; x++) {
      if (used.has(y * RULES.cols + x)) continue;
      if (predicate(x, y)) candidates.push([x, y]);
    }
  }
  if (!candidates.length) return null;
  const pick = candidates[nextU32(state) % candidates.length];
  return { x: pick[0], y: pick[1] };
}

function spawnOrb(state) {
  const [hx, hy] = state.body[0];
  return pickCell(state, (x, y) => Math.abs(x - hx) + Math.abs(y - hy) >= 3);
}

function spawnBonus(state) {
  const [hx, hy] = state.body[0];
  const cell = pickCell(state, (x, y) => Math.abs(x - hx) + Math.abs(y - hy) >= 4);
  return cell ? { ...cell, ttl: RULES.bonusTicks } : null;
}

function targetObstacles(score) {
  if (score >= RULES.obstacleMidScore) return RULES.maxObstacles;
  if (score >= RULES.obstacleStartScore) return 2;
  return 0;
}

function inFrontRay(hx, hy, dir, x, y, range) {
  const [dx, dy] = DIRS[dir];
  for (let i = 1; i <= range; i++) {
    if (hx + dx * i === x && hy + dy * i === y) return true;
  }
  return false;
}

function spawnObstacle(state) {
  const [hx, hy] = state.body[0];
  const cell = pickStrictCell(state, (x, y) => {
    if (x < 2 || x > RULES.cols - 3 || y < 2 || y > RULES.rows - 3) return false;
    if (Math.abs(x - hx) + Math.abs(y - hy) < 5) return false;
    if (inFrontRay(hx, hy, state.dir, x, y, 5)) return false;
    for (const obs of state.obstacles) {
      if (Math.max(Math.abs(obs.x - x), Math.abs(obs.y - y)) < 3) return false;
    }
    return true;
  });
  return cell ? { ...cell, warn: RULES.obstacleWarnTicks } : null;
}

export function createGame(seed) {
  const initial = (seed >>> 0) || 1;
  const state = {
    tick: 0,
    elapsedMs: 0,
    random: initial,
    entropy: { 0: initial },
    dir: 1,
    body: [[6, 9], [5, 9], [4, 9], [3, 9]],
    orb: null,
    bonus: null,
    obstacles: [],
    score: 0,
    orbsEaten: 0,
    bonusesEaten: 0,
    lastObstacleTick: -99,
    done: false,
    won: false,
    reason: '',
    events: [],
  };
  state.orb = spawnOrb(state);
  return state;
}

export function installEntropy(state, chunks) {
  for (const chunk of chunks || []) {
    if (
      !Number.isInteger(chunk.tick) ||
      chunk.tick < 0 ||
      chunk.tick >= RULES.maxTicks ||
      chunk.tick % RULES.segmentTicks !== 0 ||
      !Number.isInteger(chunk.seed) ||
      chunk.seed < 1 ||
      chunk.seed > 0xffffffff
    ) {
      throw new Error('Invalid live encounter');
    }
    if (state.entropy[chunk.tick] && state.entropy[chunk.tick] !== chunk.seed) {
      throw new Error('Encounter already committed');
    }
    state.entropy[chunk.tick] = chunk.seed;
  }
}

export function step(state, inputDir = state.dir) {
  if (state.done) return state;
  state.events = [];

  if (state.tick % RULES.segmentTicks === 0) {
    const segSeed = state.entropy[state.tick];
    if (!segSeed) throw new Error('阵法连接中断，请重新开局。');
    state.random = segSeed;
  }

  if (Number.isInteger(inputDir) && inputDir >= 0 && inputDir <= 3 && !isOppositeDir(inputDir, state.dir)) {
    state.dir = inputDir;
  }

  state.elapsedMs += tickMsFor(state.score);

  const [dx, dy] = DIRS[state.dir];
  const [hx, hy] = state.body[0];
  const nx = hx + dx;
  const ny = hy + dy;

  // Wall collision
  if (nx < 0 || nx >= RULES.cols || ny < 0 || ny >= RULES.rows) {
    state.done = true;
    state.won = false;
    state.reason = 'wall';
    state.tick += 1;
    state.events.push({ kind: 'hit', reason: 'wall', x: hx, y: hy });
    return state;
  }

  // Solid obstacle collision (warning obstacles are completely harmless until warn === 0)
  for (const obs of state.obstacles) {
    if (obs.warn === 0 && obs.x === nx && obs.y === ny) {
      state.done = true;
      state.won = false;
      state.reason = 'obstacle';
      state.tick += 1;
      state.events.push({ kind: 'hit', reason: 'obstacle', x: nx, y: ny });
      return state;
    }
  }

  const ateOrb = Boolean(state.orb && state.orb.x === nx && state.orb.y === ny);
  const ateBonus = Boolean(state.bonus && state.bonus.x === nx && state.bonus.y === ny);

  // Self-collision: if not growing this tick, the vacating tail tip is safe to enter.
  const checkLen = ateOrb ? state.body.length : state.body.length - 1;
  for (let i = 0; i < checkLen; i++) {
    if (state.body[i][0] === nx && state.body[i][1] === ny) {
      state.done = true;
      state.won = false;
      state.reason = 'self';
      state.tick += 1;
      state.events.push({ kind: 'hit', reason: 'self', x: nx, y: ny });
      return state;
    }
  }

  state.body.unshift([nx, ny]);
  if (!ateOrb) state.body.pop();

  if (ateBonus) {
    state.score += RULES.bonusPoints;
    state.bonusesEaten += 1;
    const trim = Math.min(RULES.bonusTrim, Math.max(0, state.body.length - RULES.minLength));
    for (let i = 0; i < trim; i++) state.body.pop();
    state.bonus = null;
    state.events.push({ kind: 'bonus', x: nx, y: ny, trimmed: trim });
  }

  if (ateOrb) {
    state.score += 1;
    state.orbsEaten += 1;
    state.orb = null;
    state.events.push({ kind: 'orb', x: nx, y: ny });
  }

  // Bonus timer
  if (state.bonus) {
    state.bonus.ttl -= 1;
    if (state.bonus.ttl <= 0) state.bonus = null;
  }

  // Obstacle telegraph countdown — never solidifies underneath any dragon segment.
  for (const obs of state.obstacles) {
    if (obs.warn > 0) {
      const covered = state.body.some(([bx, by]) => bx === obs.x && by === obs.y);
      if (!covered) {
        obs.warn -= 1;
        if (obs.warn === 0) state.events.push({ kind: 'solid', x: obs.x, y: obs.y });
      }
    }
  }

  state.tick += 1;

  if (state.score >= RULES.goal) {
    state.done = true;
    state.won = true;
    state.reason = 'won';
    state.events.push({ kind: 'win', x: nx, y: ny });
    return state;
  }

  if (state.tick >= RULES.maxTicks) {
    state.done = true;
    state.won = false;
    state.reason = 'timeout';
    state.events.push({ kind: 'hit', reason: 'timeout', x: nx, y: ny });
    return state;
  }

  if (!state.orb) {
    state.orb = spawnOrb(state);
    if (!state.orb) {
      state.done = true;
      state.won = true;
      state.reason = 'won';
      state.events.push({ kind: 'win', x: nx, y: ny });
      return state;
    }
  }

  if (ateOrb && !state.bonus && state.orbsEaten % RULES.bonusEvery === 0) {
    const bonus = spawnBonus(state);
    if (bonus) {
      state.bonus = bonus;
      state.events.push({ kind: 'bonus_spawn', x: bonus.x, y: bonus.y });
    }
  }

  const wanted = targetObstacles(state.score);
  if (state.obstacles.length < wanted && state.tick - state.lastObstacleTick >= 6) {
    const obs = spawnObstacle(state);
    if (obs) {
      state.obstacles.push(obs);
      state.lastObstacleTick = state.tick;
      state.events.push({ kind: 'warn', x: obs.x, y: obs.y });
    }
  }

  return state;
}
