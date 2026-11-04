import test from 'node:test';
import assert from 'node:assert/strict';
import { maintain, proxy } from '../src/index.mjs';

const env = { INSTABOX_MACHINE_ID: 'm_agqzojclrfglcpkfj43t7npojy', INSTABOX_API_KEY: 'dummy-platform-secret', CPA_ORIGIN: 'https://8317-agqzojclrfglcpkfj43t7npojy.instabox.tech', AUTO_RESUME: '1' };
const now = Date.parse('2026-11-04T12:00:00Z');
const machine = { id: env.INSTABOX_MACHINE_ID, state: 'suspended', runtime: { ready: true } };

test('platform cooldown is honored without resume or execution', async () => {
  let calls = 0;
  const result = await maintain(env, async () => { calls++; return Response.json({ ...machine, cooldownUntil: '2026-11-04T13:00:00Z' }); }, now);
  assert.equal(calls, 1); assert.equal(result.state, 'cooldown');
});

test('resuming uses authenticated platform API and unique idempotency without exposing secrets', async () => {
  const calls = [];
  const result = await maintain(env, async (url, options) => { calls.push({ url, options }); return Response.json(calls.length === 1 ? machine : { state: 'queued' }); }, now);
  assert.equal(result.state, 'resume_requested'); assert.equal(calls.length, 2);
  assert.equal(calls[1].options.method, 'POST'); assert.equal(calls[1].options.headers['X-API-Key'], env.INSTABOX_API_KEY);
  assert(calls[1].options.headers['Idempotency-Key']); assert(!JSON.stringify(result).includes(env.INSTABOX_API_KEY));
});

test('healthy service needs no recovery command; stopped machines stay stopped', async () => {
  let calls = 0;
  assert.equal((await maintain(env, async () => { calls++; return calls === 1 ? Response.json({ ...machine, state: 'running' }) : new Response('ok'); }, now)).state, 'healthy');
  assert.equal(calls, 2);
  assert.equal((await maintain(env, async () => Response.json({ ...machine, state: 'stopped' }), now)).state, 'stopped');
});

test('proxy preserves body, authorization, query and streaming without forwarding platform credentials', async () => {
  let received;
  const response = await proxy(new Request('https://public-cpa.leonmingod.com/v1/chat/completions?stream=1', { method: 'POST', headers: { Authorization: 'Bearer dummy-client-key', 'CF-Connecting-IP': '192.0.2.2' }, body: '{"stream":true}' }), env, { waitUntil() {} }, async request => {
    received = request;
    assert.equal(await request.text(), '{"stream":true}');
    return new Response('data: hello\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
  });
  assert.equal(received.url, env.CPA_ORIGIN + '/v1/chat/completions?stream=1');
  assert.equal(received.headers.get('Authorization'), 'Bearer dummy-client-key');
  assert.equal(received.headers.get('X-API-Key'), null);
  assert.equal(received.redirect, 'manual'); assert.equal(response.headers.get('Content-Type'), 'text/event-stream');
  assert.equal(response.headers.get('X-LeonMinGod-Backend'), 'instabox');
  assert.match(await response.text(), /\[DONE\]/);
});

test('proxy never replays a failed generation request during recovery', async () => {
  let generated = 0; const pending = [];
  const response = await proxy(new Request('https://public-cpa.leonmingod.com/v1/responses', { method: 'POST', body: '{}' }), { ...env, AUTO_RESUME: '0' }, { waitUntil(p) { pending.push(p); } }, async () => { generated++; throw new TypeError('network'); });
  await Promise.all(pending); assert.equal(response.status, 503); assert.equal(generated, 1);
  assert(!JSON.stringify(await response.json()).includes(env.INSTABOX_API_KEY));
});
