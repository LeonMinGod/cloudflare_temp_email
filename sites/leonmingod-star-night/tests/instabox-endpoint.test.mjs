import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE_URL, normalizeBaseUrl } from '../public/free-token/api-endpoint-v1.mjs';
import { apiEndpoints, buildImportLink } from '../public/free-token/ccswitch-v2.mjs';
import { readSavedKey, takeResult, SAVED_KEY, RESULT_KEY } from '../public/free-token/verify-flow-v3.mjs';

test('old saved credentials and in-flight results move endpoint while preserving the same key and metadata', () => {
  const old = { key: 'sk-lm-local-migration-test', email: 'test@example.invalid', baseUrl: 'https://cpa-dhke.onrender.com/v1', username: 'existing', saved_at: 123 };
  const storage = new Map([[SAVED_KEY, JSON.stringify(old)], [RESULT_KEY, JSON.stringify({ source: 'oath', apiKey: old.key, baseUrl: old.baseUrl })]]);
  const local = globalThis.localStorage, session = globalThis.sessionStorage;
  const stub = { getItem: key => storage.get(key) ?? null, removeItem: key => storage.delete(key) };
  globalThis.localStorage = stub; globalThis.sessionStorage = stub;
  try {
    assert.deepEqual(readSavedKey(), { ...old, baseUrl: BASE_URL });
    assert.deepEqual(JSON.parse(storage.get(SAVED_KEY)), old);
    assert.equal(takeResult('oath').baseUrl, BASE_URL);
    assert.equal(storage.has(RESULT_KEY), false);
    assert.equal(storage.has(SAVED_KEY), true);
  } finally { globalThis.localStorage = local; globalThis.sessionStorage = session; }
});

test('CC Switch resolves the old CPA endpoint to the stable new domain without opening arbitrary origins', () => {
  assert.equal(normalizeBaseUrl('https://cpa-dhke.onrender.com/v1/'), BASE_URL);
  assert.equal(apiEndpoints('https://cpa-dhke.onrender.com/v1').models, BASE_URL + '/models');
  const link = new URL(buildImportLink({ app: 'codex', name: 'Migrated', model: 'alias/model', apiKey: 'sk-lm-local-migration-test', baseUrl: 'https://cpa-dhke.onrender.com/v1' }));
  assert.equal(link.searchParams.get('endpoint'), BASE_URL);
  assert.throws(() => apiEndpoints('https://cpa-dhke.onrender.com/v1?key=value'));
  assert.throws(() => apiEndpoints('https://unrelated.invalid/v1'));
});
