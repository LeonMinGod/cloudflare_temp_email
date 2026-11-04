import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteStorage } from '../src/storage.mjs';
import { createCollector, signature } from '../src/service.mjs';
import { relayPoolToVps } from '../../leonmingod-star-night/src/pool-vps.js';

const now = Date.parse('2026-11-04T14:00:00Z'), secret = 'test-ops-secret';
function request(body, time = now, path = '/_pool/status') {
  const text = JSON.stringify(body), stamp = String(time);
  return new Request('https://yifu.leonmingod.com' + path, { method: 'POST', headers: { 'X-Yifu-Pool': stamp + ':' + signature(secret, stamp, path, text) }, body: text });
}
function fixture(storage = new SqliteStorage(':memory:')) {
  const calls = [];
  const app = createCollector({ storage, secret, managementKey: 'dummy-management', clock: () => now, fetcher: async (url, init) => {
    calls.push(url);assert(url.startsWith('http://127.0.0.1:8317/v8/management/'));assert.equal(init.headers.Authorization, 'Bearer dummy-management');
    if (url.endsWith('/credentials')) return Response.json({ files: [{ name: 'private-test@example.invalid.json', id: 'private-test@example.invalid', provider: 'codex', status: 'active' }] });
    if (url.includes('/credentials/models?')) return Response.json({ models: [{ id: 'real-registered-model' }] });
    return Response.json({ schema: 1, scope: 'upstream_executions', instance_id: '11111111-1111-4111-8111-111111111111', started_at: new Date(now).toISOString(), enabled: true, models: [] });
  } });
  return { app, storage, calls };
}

test('SQLite storage transactions roll back and isolate pool/registry namespaces', async () => {
  const storage = new SqliteStorage(':memory:');
  try {
    await storage.put('one', { value: 1 });
    await assert.rejects(storage.transaction(async tx => { await tx.put('one', { value: 2 }); throw new Error('rollback'); }));
    assert.deepEqual(await storage.get('one'), { value: 1 });
    const second = new SqliteStorage(storage.db, 'other');assert.equal(await second.get('one'), undefined);
  } finally { storage.close(); }
});

test('collector rejects missing, forged and expired signatures before upstream access', async () => {
  const f = fixture();
  try {
    assert.equal((await f.app.fetch(new Request('https://yifu.leonmingod.com/_pool/status', { method: 'POST', body: '{}' }))).status, 403);
    assert.equal((await f.app.fetch(request({ kind: 'snapshot' }, now - 31000))).status, 403);
    const forged = request({ kind: 'snapshot' });forged.headers.set('X-Yifu-Pool', String(now) + ':' + '0'.repeat(64));
    assert.equal((await f.app.fetch(forged)).status, 403);assert.equal(f.calls.length, 0);
  } finally { await f.app.close();f.storage.close(); }
});

test('collector reads CPA locally, publishes sanitized status and reuses SQLite after reload without CF storage', async () => {
  const f = fixture();
  try {
    const response = await f.app.fetch(request({ kind: 'snapshot' }));assert.equal(response.status, 200);
    const text = await response.text();assert.doesNotMatch(text, /private-test|example\.invalid|dummy-management/);
    const data = JSON.parse(text);assert.equal(data.totals.total, 1);assert.equal(data.models[0].id, 'real-registered-model');
    const count = f.calls.length;await f.app.fetch(request({ kind: 'snapshot' }));assert.equal(f.calls.length, count);
    await f.app.close();const reloaded = fixture(f.storage);
    try { assert.equal((await reloaded.app.fetch(request({ kind: 'snapshot' }))).status, 200);assert.equal(reloaded.calls.length, 0); }
    finally { await reloaded.app.close(); }
  } finally { await f.app.close();f.storage.close(); }
});

test('Worker relay and VPS agree on the signed contract and stream the sanitized response', async () => {
  const f = fixture();
  try {
    const response = await relayPoolToVps({ VPS_POOL_ENDPOINT: 'https://yifu.leonmingod.com/_pool/status', FREE_TOKEN_OPS_SECRET: secret }, { kind: 'snapshot' },
      (url, options) => { assert.equal(options.redirect, 'manual');return f.app.fetch(new Request(url, options)); }, now);
    assert.equal(response.status, 200);assert.equal((await response.json()).totals.ready, 1);
    await assert.rejects(relayPoolToVps({ VPS_POOL_ENDPOINT: 'https://cpa.leonmingod.com/_pool/status', FREE_TOKEN_OPS_SECRET: secret }, {}, undefined, now));
  } finally { await f.app.close();f.storage.close(); }
});
