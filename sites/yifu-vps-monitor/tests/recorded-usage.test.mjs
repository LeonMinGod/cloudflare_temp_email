import assert from 'node:assert/strict';
import test from 'node:test';
import { accountIds, extractApiKeyChannels, summarizePool } from '../../leonmingod-star-night/src/pool-status.js';
import { mergeModelUsage, attachModelUsage } from '../../leonmingod-star-night/src/pool-metrics.js';
import { attachRecordedUsage, dayRanges } from '../src/recorded-usage.mjs';

const current = { id: 'renamed.json', name: 'renamed.json', auth_index: 'new', provider: 'codex',
  email: 'someone@example.test', id_token: { chatgpt_account_id: 'example-account-id' } };
const previous = { ...current, id: 'original.json', name: 'original.json', auth_index: 'old' };
const historical = { provider: 'codex', model: 'example', auth_provider: 'codex',
  account: 'someone@example.test', upstream_id: 'example-account-id', auth_index: 'old', success: 4, failed: 1 };

test('renaming a credential preserves its public ID and attaches earlier usage', async () => {
  const [a] = await accountIds([previous], 'test-secret');
  const [b] = await accountIds([current], 'test-secret');
  assert.notEqual(a.legacy, b.legacy);
  assert.equal(a.id, b.id);
  const [first, second] = await accountIds([previous, current], 'test-secret');
  assert.notEqual(first.id, second.id);

  const now = Date.parse('2026-11-02T01:30:00+08:00');
  const { today, yesterday } = dayRanges(now);
  const snapshot = { models: [], accounts: [{ id: b.id }] };
  attachRecordedUsage(snapshot, [current], [b], { since: now - 86400000, latest: now, rows: [
    { ...historical, day: yesterday[0] },
    { ...historical, day: today[0], auth_index: 'new', success: 2, failed: 0 },
    { ...historical, day: today[0], account: 'other@example.test', auth_index: 'new', success: 1, failed: 0 },
  ] }, now, null);
  assert.deepEqual(snapshot.accounts[0].recorded_requests, { success: 6, failed: 1 });
  const windows = snapshot.models[0].recorded_usage[0].windows;
  assert.deepEqual(windows, {
    today: { success: 3, failed: 0 },
    yesterday: { success: 4, failed: 1 },
    week: { success: 3, failed: 0 },
    month: { success: 7, failed: 1 },
    all: { success: 7, failed: 1 },
  });
  assert.equal(JSON.stringify(snapshot).includes('example.test'), false);
});

test('custom API-key providers (linli, x2api, solid) auto-discover models, prefixes, metrics, and scrub secrets', async () => {
  const now = Date.parse('2026-11-23T01:00:00+08:00');
  const { today } = dayRanges(now);
  const channels = extractApiKeyChannels({
    'openai-compatibility': [
      {
        name: 'linli',
        prefix: 'linli',
        'base-url': 'https://secret-upstream.example/v1',
        keys: [{ 'api-key': 'sk-secret-linli-key', auth_index: 'idx-linli-1' }],
        models: [
          { name: 'deepseek-v4-flash', alias: '' },
          { name: 'gemma-4-31b-it', alias: '' },
        ],
      },
      {
        name: 'x2api',
        'base-url': 'https://secret-x2.example/v1',
        keys: [{ 'api-key': 'sk-secret-x2-key', auth_index: 'idx-x2-1' }],
        models: [{ name: 'antigravity/gemini-4-hydrogen-high', alias: 'hydrogen-high' }],
      },
      {
        name: 'solid',
        disabled: true,
        'base-url': 'https://secret-solid.example/v1',
        keys: [{ 'api-key': 'sk-secret-solid-key' }],
        models: [{ name: 'deepseek/deepseek-v4.1-flash', alias: 'deepseek-v4.1-flash' }],
      },
    ],
  });

  assert.equal(channels.length, 3);
  const ids = await accountIds(channels, 'ops-secret');
  const summary = await summarizePool(channels, channels.map(c => c.inline_models), 'ops-secret', now, ids);

  // Providers linli and x2api are ready, solid is disabled
  assert.equal(summary.totals.ready, 2);
  assert.equal(summary.totals.disabled, 1);
  assert.deepEqual(summary.providers.map(p => p.provider).sort(), ['linli', 'solid', 'x2api']);

  // Prefix expansion produced both deepseek-v4-flash and linli/deepseek-v4-flash, online=true
  const ds = summary.models.find(m => m.id === 'deepseek-v4-flash');
  const dsPrefixed = summary.models.find(m => m.id === 'linli/deepseek-v4-flash');
  const solidModel = summary.models.find(m => m.id === 'deepseek-v4.1-flash');
  assert(ds?.online && ds.ready === 1);
  assert(dsPrefixed?.online && dsPrefixed.ready === 1);
  assert.equal(solidModel.online, false);

  // Attach live CPA model metrics with openai-compatible-* provider names
  const metricsState = mergeModelUsage(null, {
    schema: 1,
    scope: 'upstream_executions',
    instance_id: '11111111-1111-4111-8111-111111111111',
    started_at: new Date(now - 60000).toISOString(),
    enabled: true,
    models: [
      { id: 'deepseek-v4-flash', provider: 'openai-compatible-linli', success: 100, failed: 5, recent: [{ at: Math.floor(now / 1000), success: 10, failed: 0, ttft_ms: 5000, ttft_samples: 5, output_tokens: 400, output_ms: 8000 }] },
    ],
  }, now);
  attachModelUsage(summary, metricsState, now);
  assert.equal(ds.usage[0].provider, 'linli');
  assert.equal(ds.usage[0].output_tokens_per_second, 50);

  // Attach recorded SQLite usage
  attachRecordedUsage(summary, channels, ids, {
    since: now - 86400000,
    latest: now,
    rows: [
      { day: today[0], provider: 'openai-compatible-linli', model: 'deepseek-v4-flash', auth_provider: 'openai-compatible-linli', account: '', upstream_id: '', auth_index: 'idx-linli-1', success: 80, failed: 4, last_used_ms: now - 15000 },
      { day: today[0] - 5, provider: 'openai-compatible-solid', model: 'deepseek-v4.1-flash', auth_provider: 'openai-compatible-solid', account: '', upstream_id: '', auth_index: 'old-solid-idx', success: 500, failed: 10, last_used_ms: now - 5 * 86400000 },
    ],
  }, now, null);

  const linliAcc = summary.accounts.find(a => a.provider === 'linli');
  const solidAcc = summary.accounts.find(a => a.provider === 'solid');
  assert.deepEqual(linliAcc.recorded_windows.today, { success: 80, failed: 4 });
  assert.equal(linliAcc.last_used_at, new Date(now - 15000).toISOString());
  assert.equal(ds.last_used_at, new Date(now - 15000).toISOString());
  assert.deepEqual(solidAcc.recorded_requests, { success: 500, failed: 10 });

  // Strict privacy check: no upstream URLs, API keys, or auth_indexes leaked
  const serialized = JSON.stringify(summary);
  assert.doesNotMatch(serialized, /sk-secret|secret-upstream|secret-x2|secret-solid|idx-linli|idx-x2/);
});

test('named native gemini API-key channel matches usage logged under provider=gemini by auth_index', async () => {
  const now = Date.parse('2026-11-23T20:20:00+08:00');
  const { today } = dayRanges(now);
  const channels = extractApiKeyChannels({
    gemini: [
      {
        name: 'x2api',
        'base-url': 'https://secret-x2.example/agy',
        keys: [{ 'api-key': 'sk-secret-x2', auth_index: '300e6fb85fb340e7' }],
        models: [
          { name: 'gemini-4-neon-high', alias: 'gemini-4-neon' },
          { name: 'gemini-4-neon-high', alias: 'gemini-4-neon-high' },
        ],
      },
    ],
  });
  const ids = await accountIds(channels, 'ops-secret');
  const summary = await summarizePool(channels, channels.map(c => c.inline_models), 'ops-secret', now, ids);

  attachRecordedUsage(summary, channels, ids, {
    since: now - 86400000,
    latest: now,
    rows: [
      { day: today[0], provider: 'openai-compatible-x2api', model: 'gemini-4-neon-high', auth_provider: 'openai-compatible-x2api', account: '', upstream_id: '', auth_index: 'bbd13d1f785feb21', success: 44, failed: 47, last_used_ms: now - 8 * 3600_000 },
      { day: today[0], provider: 'gemini', model: 'gemini-4-neon', auth_provider: 'gemini', account: '', upstream_id: '', auth_index: '300e6fb85fb340e7', success: 3157, failed: 702, last_used_ms: now - 60_000 },
    ],
  }, now, null);

  const x2 = summary.accounts.find(a => a.provider === 'x2api');
  assert.deepEqual(x2.recorded_windows.today, { success: 3201, failed: 749 });
  assert.equal(x2.last_used_at, new Date(now - 60_000).toISOString());
  const neon = summary.models.find(m => m.id === 'gemini-4-neon');
  assert.equal(neon.recorded_usage.length, 1);
  assert.equal(neon.recorded_usage[0].provider, 'x2api');
  assert.deepEqual(neon.recorded_usage[0].windows.today, { success: 3157, failed: 702 });
});

test('Beijing midnight advances the day and month while Sunday stays in the prior week', () => {
  const before = dayRanges(Date.parse('2026-10-31T15:59:59Z'));
  const after = dayRanges(Date.parse('2026-10-31T16:00:00Z'));
  assert.equal(after.today[0], before.today[0] + 1);
  assert.equal(after.yesterday[0], before.today[0]);
  assert.equal(after.month[0], after.today[0]);
  assert.equal(after.week[0], before.week[0]);
});
