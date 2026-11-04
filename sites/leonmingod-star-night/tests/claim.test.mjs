import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import {
  CODE_TTL_MS, MAX_ATTEMPTS, RESEND_COOLDOWN_MS, beginCode, completeClaim as rawComplete,
  emailKey, importEncKey, keyRecordKey, normalizeEmail, sha256Hex,
} from '../src/claim-store.js';
import { clearClaimGrant, issueClaimGrant, readClaimGrant } from '../src/claim-grant.js';

const TEST_ENC_SECRET = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i)));
const ENC = await importEncKey(TEST_ENC_SECRET);
const completeClaim = (kv, args) => rawComplete(kv, { encKey: ENC, grantId: 'grant-a', ...args });

function memoryKv(clock = () => Date.now()) {
  const rows = new Map();
  return {
    async get(key) {
      const row = rows.get(key);
      if (!row) return null;
      if (row.exp && clock() >= row.exp) { rows.delete(key); return null; }
      return row.value;
    },
    async put(key, value, options = {}) {
      rows.set(key, { value: String(value), exp: options.expirationTtl ? clock() + options.expirationTtl * 1000 : 0 });
    },
    async delete(key) { rows.delete(key); },
    entries() { return [...rows]; },
  };
}

const issue = (kv, email, now, code = '123456', grantId = 'grant-a') => beginCode(kv, { email, now, ipHash: 'ip', code, grantId });

test('email normalization and the two-minute resend window are consistent', async () => {
  assert.equal(RESEND_COOLDOWN_MS, 120_000);
  assert.equal(normalizeEmail('  Ada@Example.COM '), 'ada@example.com');
  for (const bad of ['', 'ada', 'ada@', 'ada@example', 'a b@example.com', `${'a'.repeat(250)}@b.co`]) assert.equal(normalizeEmail(bad), null);
  let now = 1_000_000;
  const kv = memoryKv(() => now), email = 'ada@example.com';
  assert.equal((await issue(kv, email, now)).ok, true);
  const cooling = await issue(kv, email, now + 1_000, '654321', 'grant-b');
  assert.equal(cooling.status, 429);
  assert.equal(cooling.cooldown, true);
  assert.equal(cooling.retry_after, 119);
  assert.equal(JSON.parse(await kv.get(`code:${email}`)).grant_id, 'grant-b');
  assert.equal((await completeClaim(kv, { email, code: '123456', now, grantId: 'grant-a' })).status, 403);
  assert.equal((await completeClaim(kv, { email, code: '123456', now, grantId: 'grant-b' })).ok, true);
});

test('codes expire and lock after five wrong guesses', async () => {
  let now = 2_000_000;
  const kv = memoryKv(() => now), email = 'lock@example.com';
  await issue(kv, email, now);
  for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
    const wrong = await completeClaim(kv, { email, code: '000000', now });
    assert.equal(wrong.wrong_code, true);
    assert.equal(wrong.attempts_left, MAX_ATTEMPTS - attempt);
  }
  assert.equal((await completeClaim(kv, { email, code: '000000', now })).resend, true);
  assert.equal((await completeClaim(kv, { email, code: '123456', now })).resend, true);
  now += RESEND_COOLDOWN_MS;
  await issue(kv, email, now, '654321');
  now += CODE_TTL_MS + 1;
  assert.match((await completeClaim(kv, { email, code: '654321', now })).error, /失效/);
});

test('one email keeps one encrypted key and new claims do not create leaderboard entries', async () => {
  let now = 1_700_000_000_000;
  const kv = memoryKv(() => now), email = 'same@example.com';
  await issue(kv, email, now, '111111');
  const first = await completeClaim(kv, { email, code: '111111', now });
  assert.match(first.apiKey, /^sk-lm-[A-Za-z0-9_-]{32,}$/);
  const pointer = JSON.parse(await kv.get(emailKey(email)));
  assert.equal(pointer.key_sha256, await sha256Hex(first.apiKey));
  assert.ok(pointer.key_enc?.ct);
  assert.equal(pointer.username, undefined);
  assert.equal(await kv.get('leaderboard:index'), null);
  const stored = kv.entries().map(([, row]) => row.value).join('\n');
  assert.equal(stored.includes(first.apiKey), false);
  assert.equal(stored.includes('111111'), false);

  now += RESEND_COOLDOWN_MS;
  await issue(kv, email, now, '222222');
  const again = await completeClaim(kv, { email, code: '222222', now });
  assert.equal(again.existing, true);
  assert.equal(again.apiKey, first.apiKey);
  assert.equal(kv.entries().filter(([key]) => key.startsWith('key:')).length, 1);
});

test('legacy records rotate once while preserving their historical name and disabled keys stay disabled', async () => {
  let now = 1_800_000_000_000;
  const kv = memoryKv(() => now), email = 'legacy@example.com';
  await issue(kv, email, now, '111111');
  const first = await completeClaim(kv, { email, code: '111111', now });
  const oldHash = await sha256Hex(first.apiKey);
  const legacy = JSON.parse(await kv.get(emailKey(email)));
  delete legacy.key_enc;
  legacy.username = '旧名';
  await kv.put(emailKey(email), JSON.stringify(legacy));
  await kv.put('leaderboard:index', JSON.stringify({ entries: [{ username: '旧名', key_sha256: oldHash, created_at: legacy.created_at }] }));
  await kv.put('leaderboard:top', JSON.stringify({ updated_at: legacy.created_at, entries: [{ username: '旧名', score: 0 }] }));

  now += RESEND_COOLDOWN_MS;
  await issue(kv, email, now, '222222');
  const second = await completeClaim(kv, { email, code: '222222', now });
  assert.equal(second.replaced, true);
  assert.notEqual(second.apiKey, first.apiKey);
  assert.equal(JSON.parse(await kv.get(keyRecordKey(oldHash))).status, 'revoked');
  const newHash = await sha256Hex(second.apiKey);
  assert.equal(JSON.parse(await kv.get(keyRecordKey(newHash))).username, '旧名');
  assert.deepEqual(JSON.parse(await kv.get('leaderboard:index')).entries[0].prior_hashes, [oldHash]);

  await kv.put(keyRecordKey(newHash), JSON.stringify({ ...JSON.parse(await kv.get(keyRecordKey(newHash))), status: 'revoked' }));
  now += RESEND_COOLDOWN_MS;
  await issue(kv, email, now, '333333');
  const disabled = await completeClaim(kv, { email, code: '333333', now });
  assert.equal(disabled.status, 403);
  assert.equal(disabled.apiKey, undefined);
});

test('claim grants are signed, browser-scoped, expiring and clearable', async () => {
  const env = { KEY_ENC_SECRET: TEST_ENC_SECRET }, now = 1_900_000_000_000;
  const request = new Request('https://leonmingod.com/api/free-token/claim', { headers: { 'User-Agent': 'test-browser' } });
  const issued = await issueClaimGrant(request, env, 'oath', now);
  assert.equal(issued.grant.source, 'oath');
  for (const part of ['HttpOnly', 'SameSite=Strict', 'Secure', 'Path=/api/free-token/claim', 'Max-Age=1200']) assert.match(issued.cookie, new RegExp(part));
  const cookie = issued.cookie.split(';')[0];
  const read = at => readClaimGrant(new Request(request.url, { headers: { Cookie: cookie, 'User-Agent': 'test-browser' } }), env, at);
  assert.equal((await read(now)).id, issued.grant.id);
  assert.equal(await read(now + 1_200_000), null);
  assert.equal(await readClaimGrant(new Request(request.url, { headers: { Cookie: cookie, 'User-Agent': 'other-browser' } }), env, now), null);
  assert.equal(await readClaimGrant(new Request(request.url, { headers: { Cookie: cookie + 'x', 'User-Agent': 'test-browser' } }), env, now), null);
  assert.match(clearClaimGrant(request), /Max-Age=0/);
});

test('the pages use one clean email step, a dedicated auto-verify page, and no public leaderboard', async () => {
  const [claim, game, verify, claimScript, gameScript, verifyScript, flow, home] = await Promise.all([
    readFile('public/free-token/claim/index.html', 'utf8'), readFile('public/free-token/game/index.html', 'utf8'),
    readFile('public/free-token/verify/index.html', 'utf8'), readFile('public/free-token/claim-v11.mjs', 'utf8'),
    readFile('public/free-token/game/app-v18.mjs', 'utf8'), readFile('public/free-token/verify-v3.mjs', 'utf8'),
    readFile('public/free-token/verify-flow-v3.mjs', 'utf8'), readFile('public/index.html', 'utf8'),
  ]);
  assert.match(claim, /claim-v11\.mjs/);
  assert.equal((claim.match(/id="send-code"/g) || []).length, 1);
  assert.doesNotMatch(claim, /claim-code|claim-name|leaderboard/);
  assert.match(game, /app-v18\.mjs/);
  assert.doesNotMatch(game, /player-name|player-code|reveal-key|id="leaderboard"/);
  assert.match(verify, /maxlength="6"/);
  assert.match(verify, /autocomplete="one-time-code"/);
  assert.match(verify, /120 秒后可重新发送/);
  assert.match(verifyScript, /digits\.length === 6/);
  assert.match(flow, /resendAfter: Math\.max\(1, Number\(resendAfter\) \|\| 120\)/);
  assert.doesNotMatch(claimScript + gameScript, /leaderboard|claim\/verify/);
  assert.match(home, /home-hero-desktop-v7\.webp/);
  assert.match(home, /home-hero-mobile-v7\.webp/);
});

test('the Worker enforces eligibility before email and returns the same key to a verified email', async () => {
  const sent = [];
  const mf = new Miniflare({
    modules: true, scriptPath: 'dist/index.js', compatibilityDate: '2025-04-01',
    bindings: {
      FREE_TOKEN_RENDER_KEY: 'test-reward-placeholder', RESEND_API_KEY: 'test-resend-not-a-secret',
      CLAIM_MAIL_FROM: 'noreply@leonmingod.com', FREE_TOKEN_TURNSTILE_SECRET: 'turnstile',
      FREE_TOKEN_LOCAL_TEST: 'local-test-only', KEY_ENC_SECRET: TEST_ENC_SECRET,
    },
    kvNamespaces: { KV: 'claim-flow-test' },
    durableObjects: { GAME_RUNS: { className: 'GameRun', useSQLite: true } },
    serviceBindings: { ASSETS: () => new Response('missing', { status: 404 }) },
    outboundService: async request => {
      assert.equal(request.url, 'https://api.resend.com/emails');
      sent.push(await request.json());
      return Response.json({ id: 'email_test' });
    },
  });
  const origin = 'http://localhost', ua = 'claim-flow-browser';
  const post = (path, body, cookie = '', userAgent = ua) => mf.dispatchFetch(origin + path, {
    method: 'POST', body: JSON.stringify(body),
    headers: { Origin: origin, 'Content-Type': 'application/json', 'User-Agent': userAgent, ...(cookie ? { Cookie: cookie } : {}) },
  });
  try {
    assert.equal((await post('/api/free-token/claim/code', { email: 'ada@example.com', humanToken: 'local-test' })).status, 403);
    assert.equal((await post('/api/free-token/claim/verify', { email: 'ada@example.com', code: '123456' })).status, 403);
    assert.equal((await post('/api/free-token/claim', { oath: 'wrong', confirmed: true })).status, 400);

    assert.equal((await post('/api/free-token/claim', { oath: '义父', confirmed: true, username: ' ' })).status, 400);
    const oath = await post('/api/free-token/claim', { oath: '义父', confirmed: true, username: ' 青玉客 ' });
    assert.equal(oath.status, 200);
    const oathData = await oath.json();
    assert.equal(oathData.ok, true);
    assert.equal(oathData.next, 'email');
    assert.ok(oathData.expires_in >= 1195 && oathData.expires_in <= 1200);
    const grant = oath.headers.getSetCookie().find(value => value.startsWith('lmg_claim_local=')).split(';')[0];
    assert.equal((await post('/api/free-token/claim/code', { email: 'ada@example.com', humanToken: 'local-test' }, grant, 'other-browser')).status, 403);

    const mail = await post('/api/free-token/claim/code', { email: 'Ada@Example.com', humanToken: 'local-test' }, grant);
    assert.equal(mail.status, 200);
    assert.deepEqual(await mail.json(), { sent: true, resend_after: 120 });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].from, 'LeonMinGod <noreply@leonmingod.com>');
    assert.match(sent[0].text, /10 分钟内有效/);
    assert.match(sent[0].html, /邮箱验证码|FREE TOKEN/);
    const emailedLink = new URL(sent[0].text.match(/https:\/\/leonmingod\.com\/free-token\/verify\/#[^\s]+/)[0]);
    assert.equal(emailedLink.search, '');
    const emailedParams = new URLSearchParams(emailedLink.hash.slice(1));
    assert.equal(emailedParams.get('email'), 'ada@example.com');
    assert.match(emailedParams.get('code'), /^\d{6}$/);
    assert.doesNotMatch(JSON.stringify(sent[0]), /returning|existing|新用户|老用户/);

    const kv = await mf.getKVNamespace('KV');
    const pending = JSON.parse(await kv.get('code:ada@example.com'));
    assert.equal(pending.code_sha256, await sha256Hex(`lmg-claim-code-v1\nada@example.com\n${emailedParams.get('code')}`));
    assert.ok(pending.grant_id);
    assert.equal(pending.username, undefined);
    const code = '246810';
    pending.code_sha256 = await sha256Hex(`lmg-claim-code-v1\nada@example.com\n${code}`);
    await kv.put('code:ada@example.com', JSON.stringify(pending));
    const wrong = await post('/api/free-token/claim/verify', { email: 'ada@example.com', code: '000000' }, grant);
    assert.equal((await wrong.json()).attempts_left, 4);
    const verified = await post('/api/free-token/claim/verify', { email: 'ada@example.com', code, username: '伪造落款' }, grant);
    assert.equal(verified.status, 200);
    assert.match(verified.headers.get('Set-Cookie'), /Max-Age=0/);
    const first = await verified.json();
    assert.match(first.apiKey, /^sk-lm-/);
    assert.equal(first.username, '青玉客');
    assert.equal(JSON.parse(await kv.get(emailKey('ada@example.com'))).username, '青玉客');
    assert.equal(JSON.parse(await kv.get(keyRecordKey(await sha256Hex(first.apiKey)))).username, '青玉客');
    assert.equal(first.baseUrl, 'https://cpa.leonmingod.com/v1');

    const oathAgain = await post('/api/free-token/claim', { oath: '义父', confirmed: true });
    const grantAgain = oathAgain.headers.getSetCookie().find(value => value.startsWith('lmg_claim_local=')).split(';')[0];
    assert.equal((await post('/api/free-token/claim/code', { email: 'ada@example.com', humanToken: 'local-test' }, grantAgain)).status, 200);
    const pendingAgain = JSON.parse(await kv.get('code:ada@example.com'));
    const secondCode = '135790';
    pendingAgain.code_sha256 = await sha256Hex(`lmg-claim-code-v1\nada@example.com\n${secondCode}`);
    await kv.put('code:ada@example.com', JSON.stringify(pendingAgain));
    const returning = await post('/api/free-token/claim/verify', { email: 'ada@example.com', code: secondCode }, grantAgain);
    const second = await returning.json();
    assert.equal(second.existing, true);
    assert.equal(second.apiKey, first.apiKey);
    assert.equal(second.username, '青玉客');
    assert.equal(await kv.get('leaderboard:index'), null);
    for (const row of (await kv.list()).keys) assert.equal((await kv.get(row.name)).includes(first.apiKey), false);
  } finally { await mf.dispose(); }
});
