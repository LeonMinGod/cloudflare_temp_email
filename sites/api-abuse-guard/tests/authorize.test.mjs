import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, createHmac, randomBytes} from 'node:crypto';
import {Miniflare} from 'miniflare';
import {authorizeQuota, limitsFromEnv, planFlush, responseHeader} from '../src/authorize.mjs';

const hash = createHash('sha256').update('sk-lm-test').digest('hex');
const secret = 'service-test-secret';
const now = 1_800_000_000_000;

test('active key allows once and then rate limits without counting the denial', () => {
  const limits = { ...limitsFromEnv({}), keyPerMinute: 2, keyPerDay: 5, emailPerMinute: 2, emailPerDay: 5 };
  let keyRow = null;
  let emailRow = null;
  const first = authorizeQuota({ keyRow, emailRow, hasEmail: true, limits, now });
  assert.equal(first.public.allow, true);
  assert.deepEqual(first.public.remaining, { minute: 1, day: 4 });
  keyRow = first.keyRow;
  emailRow = first.emailRow;
  const second = authorizeQuota({ keyRow, emailRow, hasEmail: true, limits, now: now + 1000 });
  assert.equal(second.public.allow, true);
  assert.equal(second.keyRow.allowed, 2);
  const denied = authorizeQuota({ keyRow: second.keyRow, emailRow: second.emailRow, hasEmail: true, limits, now: now + 2000 });
  assert.equal(denied.public.allow, false);
  assert.equal(denied.public.reason, 'rate_limited');
  assert.ok(denied.public.retry_after >= 1 && denied.public.retry_after <= 60);
  assert.equal(denied.keyRow.allowed, 2);
});

test('flush plan writes stats and a public leaderboard without the key hash', () => {
  const entries = [{ username: 'Ada', key_sha256: hash, created_at: '2026-10-28T00:00:00.000Z', email: 'ada@example.com' }];
  const quotas = new Map([[hash, { allowed: 4, flushed: 0 }]]);
  const plan = planFlush(entries, quotas, new Map(), now, 120, false);
  assert.equal(plan.stats.length, 1);
  assert.equal(plan.stats[0].value.requests, 4);
  assert.deepEqual(plan.top.entries, [{ username: 'Ada', score: 4 }]);
  const encoded = JSON.stringify(plan.top);
  assert.equal(encoded.includes(hash), false);
  assert.equal(encoded.includes('email'), false);
  assert.equal(encoded.includes('ada@example.com'), false);
  const skipped = planFlush(entries, new Map([[hash, { allowed: 4, flushed: 4 }]]), new Map(), now, 120, false);
  assert.equal(skipped.stats.length, 0);
  assert.equal(skipped.top, null);
});

test('authorize route fails closed and signs allow, unknown, and rate-limited decisions', async () => {
  const mf = new Miniflare({
    modules: true,
    scriptPath: 'dist/index.js',
    compatibilityDate: '2025-04-01',
    compatibilityFlags: ['nodejs_compat'],
    bindings: { SERVICE_SECRET: secret, ADMIN_SECRET: 'admin-test-secret', KEY_LIMIT_PER_MINUTE: '2', KEY_LIMIT_PER_DAY: '5' },
    kvNamespaces: ['KEYS'],
    durableObjects: { STATE: { className: 'AbuseState', useSQLite: true } },
  });
  const kv = await mf.getKVNamespace('KEYS');
  await kv.put(`key:${hash}`, JSON.stringify({ username: 'Ada', email: 'ada@example.com', status: 'active', created_at: '2026-10-28T00:00:00.000Z' }));
  await kv.put('leaderboard:index', JSON.stringify({ entries: [{ username: 'Ada', key_sha256: hash, created_at: '2026-10-28T00:00:00.000Z' }] }));
  const body = { key_sha256: hash, ip: '8.8.8.8', path: '/v1/chat/completions', model: 'demo' };
  try {
    const missing = await post(mf, { ...body, key_sha256: 'a'.repeat(64) });
    assert.equal(missing.status, 200);
    const missingBody = await verify(missing);
    assert.deepEqual(missingBody, { allow: false, reason: 'unknown_key', retry_after: 0 });
    const first = await verify(await post(mf, body));
    assert.equal(first.allow, true);
    assert.equal(first.reason, 'ok');
    assert.deepEqual(first.remaining, { minute: 1, day: 4 });
    assert.equal(await verify(await post(mf, body)).then(value => value.allow), true);
    const limited = await verify(await post(mf, body));
    assert.equal(limited.allow, false);
    assert.equal(limited.reason, 'rate_limited');
    assert.equal(await kv.get(`stats:${hash}`), null);
    await kv.put(`key:${hash}`, JSON.stringify({ username: 'Ada', email: 'ada@example.com', status: 'revoked', created_at: '2026-10-28T00:00:00.000Z' }));
    assert.equal((await verify(await post(mf, body))).reason, 'revoked');
    assert.equal((await post(mf, body, 'wrong-secret')).status, 403);
    assert.equal((await post(mf, { key_sha256: 'zz', path: '/v1/models' })).status, 400);
    const bare = new Miniflare({
      modules: true,
      scriptPath: 'dist/index.js',
      compatibilityDate: '2025-04-01',
      compatibilityFlags: ['nodejs_compat'],
      bindings: { SERVICE_SECRET: secret },
      durableObjects: { STATE: { className: 'AbuseState', useSQLite: true } },
    });
    try {
      assert.equal((await post(bare, body)).status, 503);
    } finally {
      await bare.dispose();
    }
  } finally {
    await mf.dispose();
  }
});

async function post(mf, body, macSecret = secret) {
  const text = JSON.stringify(body);
  const stamp = String(Date.now());
  const nonce = randomBytes(16).toString('hex');
  const signature = createHmac('sha256', macSecret).update(`${stamp}\n${nonce}\nPOST\n/v1/authorize\n${text}`).digest('hex');
  const response = await mf.dispatchFetch('https://guard.example/v1/authorize', {
    method: 'POST',
    headers: { 'X-CPA-Guard': `${stamp}:${nonce}:${signature}` },
    body: text,
  });
  response.nonce = nonce;
  return response;
}

async function verify(response) {
  const text = await response.text();
  assert.equal(response.status, 200, text);
  const header = response.headers.get('X-CPA-Guard') || '';
  const [stamp, nonce, mac] = header.split(':');
  const expected = createHmac('sha256', secret).update(`${stamp}\n${nonce}\n200\n/v1/authorize\n${text}`).digest('hex');
  assert.equal(mac, expected);
  assert.equal(nonce, response.nonce);
  const signed = await responseHeader(secret, nonce, '/v1/authorize', 200, text, Number(stamp));
  assert.equal(signed, header);
  return JSON.parse(text);
}
