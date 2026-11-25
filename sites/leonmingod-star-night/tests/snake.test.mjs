import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { DIRS, RULES, createGame, installEntropy, phaseOf, step, tickMsFor } from '../public/free-token/snake/engine-v1.mjs';
import { verifySnakeProgress, verifySnakeRun } from '../src/snake-game.js';
import { storePending, readPending } from '../public/free-token/verify-flow-v4.mjs';

const TEST_ENC_SECRET = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i)));

test('snake engine is deterministic, ignores 180-degree reversals, and allows safe tail-chasing', () => {
  const a = createGame(424242);
  const b = createGame(424242);
  const inputs = [1, 3, 2, 0, 3, 1, 0, 2, 1, 1];
  for (const dir of inputs) {
    step(a, dir);
    step(b, dir);
  }
  assert.deepEqual(a, b);
  assert.equal(a.done, false);

  // Explicit 180-degree reversal check (moving right=1, input left=3 must keep right=1)
  const rev = createGame(77);
  rev.orb = { x: 17, y: 17 };
  step(rev, 3);
  assert.equal(rev.done, false);
  assert.equal(rev.dir, 1);
  assert.deepEqual(rev.body[0], [7, 9]);

  // Tail-chase check: 4-segment square loop moving into vacating tail tip succeeds
  const loop = createGame(99);
  loop.orb = { x: 17, y: 17 };
  loop.dir = 0;
  loop.body = [[5, 5], [6, 5], [6, 4], [5, 4]];
  step(loop, 0); // moves head (5,5) -> (5,4), which is current tail tip vacating
  assert.equal(loop.done, false);
  assert.deepEqual(loop.body[0], [5, 4]);
});

test('snake bonus orb grants +2 score and trims 2 tail segments down to minimum length', () => {
  const state = createGame(12345);
  state.body = [[8, 9], [7, 9], [6, 9], [5, 9], [4, 9], [3, 9], [2, 9]];
  state.dir = 1;
  state.orb = { x: 17, y: 17 };
  state.bonus = { x: 9, y: 9, ttl: 20 };

  step(state, 1);
  assert.equal(state.score, 2);
  assert.equal(state.body.length, 5);
  assert.equal(state.bonus, null);
  assert.ok(state.events.some(e => e.kind === 'bonus' && e.trimmed === 2));

  // Bonus spawns automatically after every 5th regular orb
  const s2 = createGame(54321);
  s2.orbsEaten = 4;
  s2.score = 4;
  s2.dir = 1;
  s2.orb = { x: s2.body[0][0] + 1, y: s2.body[0][1] };
  step(s2, 1);
  assert.equal(s2.orbsEaten, 5);
  assert.ok(s2.bonus && s2.bonus.ttl === RULES.bonusTicks);
});

test('snake obstacles telegraph safely, never solidify under dragon body, and block once solid', () => {
  const state = createGame(9876);
  state.score = 12;
  state.orbsEaten = 12;
  state.orb = { x: 17, y: 17 };
  state.dir = 1;
  state.body = [[6, 9], [5, 9], [4, 9], [3, 9]];
  step(state, 1);
  assert.equal(state.obstacles.length, 1);
  const obs = state.obstacles[0];
  assert.equal(obs.warn, RULES.obstacleWarnTicks);
  assert.ok(obs.x >= 2 && obs.x <= RULES.cols - 3);
  assert.ok(obs.y >= 2 && obs.y <= RULES.rows - 3);
  assert.ok(Math.abs(obs.x - state.body[0][0]) + Math.abs(obs.y - state.body[0][1]) >= 5);

  // Warning obstacle at warn=1 does NOT kill when stepped onto, and stays warn=1 while body occupies it
  const safe = createGame(222);
  safe.orb = { x: 17, y: 17 };
  safe.obstacles = [{ x: 7, y: 9, warn: 1 }];
  step(safe, 1);
  assert.equal(safe.done, false);
  assert.deepEqual(safe.body[0], [7, 9]);
  assert.equal(safe.obstacles[0].warn, 1, 'Obstacle delays solidifying while covered by dragon');

  // Solid obstacle (warn=0) ends the run
  const hit = createGame(333);
  hit.orb = { x: 17, y: 17 };
  hit.obstacles = [{ x: 7, y: 9, warn: 0 }];
  step(hit, 1);
  assert.equal(hit.done, true);
  assert.equal(hit.won, false);
  assert.equal(hit.reason, 'obstacle');
});

test('snake live entropy is required at segment boundaries and cannot be overwritten', () => {
  const state = createGame(1111);
  // Circle safely inside the 18x18 grid for 30 ticks without hitting walls
  const path = [1, 1, 1, 2, 2, 2, 3, 3, 3, 0, 0, 0];
  for (let i = 0; i < RULES.segmentTicks; i++) {
    state.orb = { x: 0, y: 0 };
    step(state, path[i % path.length]);
    assert.equal(state.done, false);
  }
  assert.equal(state.tick, RULES.segmentTicks);
  assert.throws(() => step(state, state.dir), /连接中断/);

  installEntropy(state, [{ tick: RULES.segmentTicks, seed: 987654321 }]);
  step(state, path[RULES.segmentTicks % path.length]);
  assert.equal(state.tick, RULES.segmentTicks + 1);
  assert.throws(() => installEntropy(state, [{ tick: RULES.segmentTicks, seed: 123 }]), /committed/);
});

test('snake speed ramps monotonically with score and reaching goal wins immediately', () => {
  assert.ok(tickMsFor(0) > tickMsFor(6));
  assert.ok(tickMsFor(6) > tickMsFor(12));
  assert.ok(tickMsFor(12) > tickMsFor(18));
  assert.ok(tickMsFor(18) > tickMsFor(22));
  assert.equal(phaseOf({ score: 0 }), 0);
  assert.equal(phaseOf({ score: 25 }), 4);

  const state = createGame(555);
  state.score = RULES.goal - 1;
  state.orb = { x: 7, y: 9 };
  step(state, 1);
  assert.equal(state.done, true);
  assert.equal(state.won, true);
  assert.equal(state.score, RULES.goal);
});

test('verifySnakeProgress and verifySnakeRun enforce timing, receipt, session and trace integrity', () => {
  const now = 100000;
  const run = {
    game: 'snake',
    protocol: 'snake-live-v1',
    rulesVersion: RULES.version,
    sessionHash: 'browser-snake',
    started: now,
    expires: now + 240000,
    lastSeen: now,
    claimed: false,
    receipt: 'r-0',
    state: createGame(7777),
  };
  run.state.orb = { x: 0, y: 0 };
  const packet = { sessionHash: 'browser-snake', receipt: 'r-0', tick: 8, trace: [[0, 1], [3, 2], [6, 3]] };
  const expectedMs = 8 * tickMsFor(0);

  assert.equal(verifySnakeProgress(run, packet, now + expectedMs).status, 200);
  assert.equal(verifySnakeProgress(run, packet, now + 100).status, 400, 'Rejects speedup');
  assert.equal(verifySnakeProgress(run, packet, now + expectedMs + 7000).status, 400, 'Rejects delayed batch');
  assert.equal(verifySnakeProgress(run, { ...packet, receipt: 'stale' }, now + expectedMs).status, 409);
  assert.equal(verifySnakeProgress(run, { ...packet, sessionHash: 'other' }, now + expectedMs).status, 403);
  for (const badTrace of [[], [[1, 1]], [[0, 4]], [[0, -1]], [[0, 1], [0, 2]], [[0, 1], [8, 2]]]) {
    assert.equal(verifySnakeProgress(run, { ...packet, trace: badTrace }, now + expectedMs).status, 400);
  }
  assert.equal(run.state.tick, 0, 'Verification never mutates stored run state');

  const wonRun = {
    ...run,
    started: now - 45000,
    lastSeen: now,
    state: { ...run.state, tick: 360, elapsedMs: 44000, score: RULES.goal, done: true, won: true },
  };
  assert.equal(verifySnakeRun(wonRun, { sessionHash: 'browser-snake', receipt: 'r-0' }, now).status, 200);
  assert.equal(verifySnakeRun(wonRun, { sessionHash: 'browser-snake', receipt: 'r-0', trace: [[0, 1]] }, now).status, 400);
  assert.equal(verifySnakeRun({ ...wonRun, claimed: true }, { sessionHash: 'browser-snake', receipt: 'r-0' }, now).status, 409);
  assert.equal(verifySnakeRun({ ...wonRun, started: now - 2000 }, { sessionHash: 'browser-snake', receipt: 'r-0' }, now).status, 400);
  assert.equal(verifySnakeRun({ ...wonRun, state: { ...wonRun.state, score: 25, won: false } }, { sessionHash: 'browser-snake', receipt: 'r-0' }, now).status, 400);
});

test('real SQLite Durable Object locks snake runs, streams entropy, supports idempotent retries and grants single-use claim', async () => {
  const fixtureClass = `export {default, Site} from './src/index.js';import {GameRun} from './src/game.js';export class TestGameRun extends GameRun { async fetch(request) { const path=new URL(request.url).pathname; if(path==='/test-read')return Response.json(await this.ctx.storage.get('run')); if(path==='/test-put'){await this.ctx.storage.put('run',await request.json());return Response.json({ok:true});}return super.fetch(request); }};`;
  const bundled = await build({
    stdin: { contents: fixtureClass, resolveDir: process.cwd() },
    bundle: true,
    format: 'esm',
    target: 'es2022',
    external: ['cloudflare:workers'],
    write: false,
  });
  const mf = new Miniflare({
    modules: true,
    script: bundled.outputFiles[0].text,
    compatibilityDate: '2025-04-01',
    bindings: {
      FREE_TOKEN_RENDER_KEY: 'test-reward-placeholder',
      FREE_TOKEN_LOCAL_TEST: 'local-test-only',
      KEY_ENC_SECRET: TEST_ENC_SECRET,
    },
    durableObjects: { GAME_RUNS: { className: 'TestGameRun', useSQLite: true } },
    serviceBindings: { ASSETS: () => new Response('Not found', { status: 404 }) },
  });
  const origin = 'http://localhost';
  const headers = { 'Content-Type': 'application/json', Origin: origin, 'User-Agent': 'snake-test-browser' };
  const send = (action, body, cookie) => mf.dispatchFetch(`${origin}/api/free-token/snake/${action}`, {
    method: 'POST',
    headers: { ...headers, ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });

  try {
    const startRes = await send('start', { humanToken: 'local-test' });
    assert.equal(startRes.status, 200);
    const setCookie = startRes.headers.get('set-cookie');
    assert.match(setCookie, /lmg_snake=/);
    assert.match(setCookie, /Path=\/api\/free-token\/snake/);
    const cookie = setCookie.split(';')[0];
    const challenge = await startRes.json();
    assert.equal(challenge.protocol, 'snake-live-v1');
    assert.equal(challenge.rules.goal, 26);

    const ns = await mf.getDurableObjectNamespace('GAME_RUNS');
    const stub = ns.get(ns.idFromName(challenge.id));
    const stored = await (await stub.fetch('https://game.internal/test-read')).json();
    stored.started = Date.now() - 1600;
    stored.lastSeen = stored.started;
    stored.state.orb = { x: 0, y: 0 };
    await stub.fetch('https://game.internal/test-put', { method: 'POST', body: JSON.stringify(stored) });

    // 10 safe ticks -> should unlock entropy chunk for tick 30
    const packet = { id: challenge.id, receipt: challenge.receipt, tick: 10, trace: [[0, 1], [3, 2], [6, 3], [9, 0]] };
    const progRes = await send('progress', packet, cookie);
    assert.equal(progRes.status, 200);
    const prog = await progRes.json();
    assert.equal(prog.tick, 10);
    assert.deepEqual(prog.entropy.map(e => e.tick), [30]);

    // Idempotent retry
    assert.deepEqual(await (await send('progress', packet, cookie)).json(), prog);
    // Tampered retry with same receipt fails 409
    assert.equal((await send('progress', { ...packet, trace: [[0, 2]] }, cookie)).status, 409);

    // Prepare authoritative won state and verify single-use concurrent finish
    const ready = await (await stub.fetch('https://game.internal/test-read')).json();
    ready.started = Date.now() - 48000;
    ready.lastSeen = Date.now();
    ready.state = { ...ready.state, tick: 380, elapsedMs: 46500, score: 26, done: true, won: true };
    await stub.fetch('https://game.internal/test-put', { method: 'POST', body: JSON.stringify(ready) });

    const responses = await Promise.all(Array.from({ length: 6 }, () => send('finish', { id: challenge.id, receipt: prog.receipt }, cookie)));
    assert.equal(responses.filter(r => r.status === 200).length, 1);
    assert.equal(responses.filter(r => r.status === 409).length, 5);
    const winner = responses.find(r => r.status === 200);
    const reward = await winner.json();
    assert.equal(reward.won, true);
    assert.equal(reward.claimable, true);
    assert.equal(reward.apiKey, undefined);
    const cookies = winner.headers.getSetCookie().join('; ');
    assert.match(cookies, /lmg_claim_local=/);
    assert.match(cookies, /lmg_snake=;.*Max-Age=0/);
  } finally {
    await mf.dispose();
  }
});

test('choose page, snake page, and verify-flow-v4 wire the new 3-path experience cleanly', async () => {
  const [chooseHtml, snakeHtml, verifyHtml] = await Promise.all([
    readFile('public/free-token/choose/index.html', 'utf8'),
    readFile('public/free-token/snake/index.html', 'utf8'),
    readFile('public/free-token/verify/index.html', 'utf8'),
  ]);
  assert.match(chooseHtml, /choose-v4\.css/);
  assert.match(chooseHtml, /\/free-token\/snake\//);
  assert.match(chooseHtml, /灵龙衔珠/);
  assert.match(snakeHtml, /\/free-token\/snake\/style-v1\.css/);
  assert.match(snakeHtml, /\/free-token\/snake\/app-v1\.mjs/);
  assert.match(snakeHtml, /\/theme-xmas-v2\.css/);
  assert.match(snakeHtml, /\/theme-xmas-v2\.js/);
  assert.match(verifyHtml, /verify-v4\.mjs/);

  const mem = new Map();
  globalThis.sessionStorage = { getItem: k => mem.get('s:' + k) ?? null, setItem: (k, v) => mem.set('s:' + k, v), removeItem: k => mem.delete('s:' + k) };
  globalThis.localStorage = { getItem: k => mem.get('l:' + k) ?? null, setItem: (k, v) => mem.set('l:' + k, v), removeItem: k => mem.delete('l:' + k) };
  try {
    storePending({ email: 'dragon@example.com', source: 'game', returnPath: '/free-token/snake/', resendAfter: 120 });
    const pending = readPending('dragon@example.com');
    assert.equal(pending?.returnPath, '/free-token/snake/');
    assert.equal(pending?.source, 'game');
  } finally {
    delete globalThis.sessionStorage;
    delete globalThis.localStorage;
  }
});
