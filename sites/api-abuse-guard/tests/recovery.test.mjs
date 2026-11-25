import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { authorizeRoute } from '../src/index.mjs';
import { limitsFromEnv } from '../src/authorize.mjs';
import { RECOVERY_END, RECOVERY_KEY, RecoveryLimiter, recoveryEnabled } from '../src/recovery.mjs';

const hash = 'a'.repeat(64), secret = 'recovery-test-service-secret';
const enabled = { schema: 1, scope: 'do-write-quota-20261031', mode: 'registered_keys_memory_limits', expires: RECOVERY_END };
const now = RECOVERY_END - 600000;

function setup({ record = { status: 'active', email: 'test@example.com' }, config = enabled, kvDown = false } = {}) {
  let calls = 0;
  return {
    calls: () => calls,
    env: {
      SERVICE_SECRET: secret,
      KEY_LIMIT_PER_MINUTE: '2', KEY_LIMIT_PER_DAY: '3',
      KEYS: { async get(key) {
        if (kvDown) throw new Error('KV down');
        return JSON.stringify(key === RECOVERY_KEY ? config : record);
      } },
      STATE: { idFromName() { calls++; throw new Error('DO daily writes exhausted'); } },
    },
  };
}

async function request(env, limiter, { clock = now, nonce = randomBytes(16).toString('hex'), macSecret = secret } = {}) {
  const text = JSON.stringify({ key_sha256: hash, path: '/v1/chat/completions', model: 'grok-4.7' });
  const stamp = Date.now();
  const mac = createHmac('sha256', macSecret).update(`${stamp}\n${nonce}\nPOST\n/v1/authorize\n${text}`).digest('hex');
  const response = await authorizeRoute(new Request('https://guard.example/v1/authorize', {
    method: 'POST', body: text, headers: { 'X-CPA-Guard': `${stamp}:${nonce}:${mac}` },
  }), env, { now: clock, limiter });
  const body = await response.text();
  if (response.status === 200) {
    const [time, responseNonce, signature] = response.headers.get('X-CPA-Guard').split(':');
    assert.equal(responseNonce, nonce);
    assert.equal(signature, createHmac('sha256', secret).update(`${time}\n${nonce}\n200\n/v1/authorize\n${body}`).digest('hex'));
    assert.equal(body.includes('test@example.com'), false);
  }
  return { status: response.status, value: JSON.parse(body) };
}

test('explicit recovery signs valid registry keys without touching unavailable DO', async () => {
  const { env, calls } = setup();
  const result = await request(env, new RecoveryLimiter());
  assert.equal(result.status, 200);
  assert.equal(result.value.allow, true);
  assert.equal(calls(), 0);
});

test('recovery still denies missing/revoked registry entries and wrong service signatures', async () => {
  for (const [record, reason] of [[null, 'unknown_key'], [{ status: 'revoked' }, 'revoked']]) {
    const { env, calls } = setup({ record });
    assert.equal((await request(env, new RecoveryLimiter())).value.reason, reason);
    assert.equal(calls(), 0);
  }
  assert.equal((await request(setup().env, new RecoveryLimiter(), { macSecret: 'wrong' })).status, 403);
  assert.equal((await request(setup({ kvDown: true }).env, new RecoveryLimiter())).status, 503);
});

test('normal failures remain closed and hard expiry restores DO even if KV switch is stale', async () => {
  for (const [config, clock] of [[null, now], [enabled, RECOVERY_END], [{ ...enabled, expires: RECOVERY_END + 1 }, now]]) {
    const { env, calls } = setup({ config });
    assert.equal((await request(env, new RecoveryLimiter(), { clock })).status, 503);
    assert.equal(calls(), 1);
  }
  assert.equal(recoveryEnabled(enabled, Date.parse('2026-10-30T00:00:00Z')), false);
});

test('recovery limits and replay work without persisting or resetting denial counters', async () => {
  const { env } = setup(), limiter = new RecoveryLimiter(), nonce = randomBytes(16).toString('hex');
  assert.equal((await request(env, limiter, { nonce })).value.allow, true);
  assert.equal((await request(env, limiter, { nonce })).value.allow, true);
  assert.equal((await request(env, limiter)).value.allow, true);
  assert.equal((await request(env, limiter)).value.reason, 'rate_limited');
  assert.equal((await request(env, limiter, { clock: now + 60001 })).value.allow, true);
  assert.equal((await request(env, limiter, { clock: now + 60002 })).value.reason, 'rate_limited');
});

test('recovery shares email limits across keys and refuses capacity overflow', () => {
  const limiter = new RecoveryLimiter({ capacity: 4 });
  const limits = { ...limitsFromEnv({}), emailPerMinute: 1 };
  const body = { hash, email: 'same@example.com', nonce: '1', limits, now };
  assert.equal(limiter.decide(body).allow, true);
  assert.equal(limiter.decide({ ...body, hash: 'b'.repeat(64), nonce: '2' }).reason, 'rate_limited');
  const tiny = new RecoveryLimiter({ capacity: 2 });
  assert.equal(tiny.decide(body).allow, true);
  assert.equal(tiny.decide({ ...body, hash: 'c'.repeat(64), nonce: '3' }), null);
});
