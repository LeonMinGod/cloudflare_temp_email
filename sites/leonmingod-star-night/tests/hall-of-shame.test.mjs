import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import {
  SHAME_KV_KEY,
  maskEmailSafe,
  maskIpSafe,
  scrubText,
  mergeShameSources,
  handleHallOfShame,
  resetHallOfShameCache,
} from '../src/shame-board.js';

test('privacy helpers strictly mask emails, IPs, and embedded secrets', () => {
  assert.equal(maskEmailSafe('2381589547@qq.com'), '238***@qq.com');
  assert.equal(maskEmailSafe('238***@qq.com'), '238***@qq.com');
  assert.equal(maskEmailSafe('ab@qq.com'), 'a***@qq.com');
  assert.equal(maskIpSafe('154.219.121.102'), '154.219.*.*');
  assert.equal(maskIpSafe('2607:5300:205:200::/64'), '2607:5300:*:*');
  const scrubbed = scrubText('raw 154.219.121.102 2381589547@qq.com sk-lm-verysecretkey123');
  assert.doesNotMatch(scrubbed, /121\.102|2381589547|verysecretkey123/);
});

test('mergeShameSources merges KV dossiers with live Prompt Guard bans without duplicating entries', () => {
  const now = Date.parse('2026-11-25T12:30:00Z');
  const vpsData = {
    schema: 1,
    updated_at: '2026-11-25T12:07:19Z',
    records: [
      {
        id: 'id-windking',
        masked_ip: '154.219.*.*',
        ip_family: 'ipv4',
        status: 'permanent_ban',
        banned: true,
        permanent: true,
        strikes: 3,
        strike_limit: 3,
        blocked_hits: 12,
        rule_id: 'manual-ban-relay-abuse',
        category: 'relay_abuse',
        rule_badge: '中转滥用',
        rule_title: '挂中转站二次分发 / 高频刷量',
        evidence: 'windking 45-UA relay resale abuse (8617x 429)',
        banned_at: '2026-11-25T12:07:19Z',
      },
      {
        id: 'id-xigong',
        masked_ip: '2607:5300:*:*',
        ip_family: 'ipv6_subnet',
        status: 'permanent_ban',
        banned: true,
        permanent: true,
        strikes: 3,
        strike_limit: 3,
        blocked_hits: 5737,
        rule_id: 'jailbreak-personas-and-tags',
        category: 'jailbreak',
        rule_badge: '破限攻击',
        rule_title: '破限人设 / 开发者模式越权注入',
        evidence: '[system] developermodeenabled',
        banned_at: '2026-11-24T03:37:19Z',
      },
      {
        id: 'id-warn',
        masked_ip: '154.40.*.*',
        ip_family: 'ipv4',
        status: 'warning',
        banned: false,
        permanent: false,
        strikes: 2,
        strike_limit: 3,
        blocked_hits: 0,
        rule_id: 'jailbreak-compound-directives',
        category: 'jailbreak',
        rule_badge: '越狱注入',
        rule_title: '复合越狱指令 / 强行绕过安全护栏',
        evidence: '[user] 禁止+道德说教+拒绝',
        last_strike_at: '2026-11-25T09:55:27Z',
      },
    ],
  };

  const kvData = {
    updated_at: '2026-11-25T12:10:00Z',
    entries: [
      {
        id: 'windking-20261125',
        username: 'windking',
        email: '2381589547@qq.com',
        masked_ip: '154.219.121.102',
        key_revoked: true,
        ip_banned: true,
        permanent: true,
        rank_title: '天字第一号 · 中转巨蠹',
        detail: '单日 8,617 次 429，混合 45 种 UA。',
        banned_at: '2026-11-25T12:07:03Z',
      },
      {
        id: 'xigong-20261124',
        username: '西宫',
        masked_email: '206***@qq.com',
        masked_ip: '2607:5300:*:*',
        key_revoked: false,
        ip_banned: true,
        permanent: true,
        banned_at: '2026-11-24T03:37:19Z',
      },
    ],
  };

  const merged = mergeShameSources({ vpsData, kvData, now });
  const rawJson = JSON.stringify(merged);
  assert.doesNotMatch(rawJson, /2381589547|121\.102|"email"|"last_ip"|"ban_key"/);
  assert.equal(merged.entries.length, 3);
  assert.equal(merged.totals.permanent_bans, 2);
  assert.equal(merged.totals.revoked_keys, 1);
  assert.equal(merged.totals.active_strikes, 1);
  assert.equal(merged.totals.total_blocked_hits, 5749);

  const first = merged.entries[0];
  assert.equal(first.username, 'windking');
  assert.equal(first.masked_email, '238***@qq.com');
  assert.equal(first.masked_ip, '154.219.*.*');
  assert.equal(first.key_revoked, true);
  assert.equal(first.ip_banned, true);
  assert.equal(first.blocked_hits, 12);
  assert.equal(first.source, 'merged');

  const second = merged.entries[1];
  assert.equal(second.username, '西宫');
  assert.equal(second.blocked_hits, 5737);
});

test('handleHallOfShame enforces read-only methods and degrades gracefully when one source is down', async () => {
  resetHallOfShameCache();
  assert.equal((await handleHallOfShame(new Request('https://leonmingod.com/api/hall-of-shame', { method: 'POST' }), {})).status, 405);

  const env = {
    VPS_POOL_ENDPOINT: 'https://yifu.leonmingod.com/_pool/status',
    FREE_TOKEN_OPS_SECRET: 'ops-secret-test',
    KV: {
      async get(key) {
        if (key !== SHAME_KV_KEY) return null;
        return JSON.stringify({
          updated_at: '2026-11-25T12:10:00Z',
          entries: [{ id: 'only-kv', username: 'windking', masked_email: '238***@qq.com', masked_ip: '154.219.*.*', key_revoked: true, ip_banned: true }],
        });
      },
    },
  };

  const degraded = await handleHallOfShame(
    new Request('https://leonmingod.com/api/hall-of-shame'),
    env,
    { fetcher: async () => new Response('down', { status: 502 }), useCache: false }
  );
  assert.equal(degraded.status, 200);
  const body = await degraded.json();
  assert.equal(body.sources.vps_guard, false);
  assert.equal(body.sources.kv_dossier, true);
  assert.equal(body.entries.length, 1);
  assert.equal(body.entries[0].username, 'windking');
});

test('built Worker serves /free-token/ shame entry beside pool-entry, /hall-of-shame/ assets, and /api/hall-of-shame', async () => {
  const freeTokenHtml = await readFile('public/free-token/index.html', 'utf8');
  assert.match(freeTokenHtml, /token-entry-v3\.css/);
  const shameIdx = freeTokenHtml.indexOf('class="shame-entry" href="/hall-of-shame/"');
  const poolIdx = freeTokenHtml.indexOf('class="pool-entry" href="/model-status/"');
  assert.ok(shameIdx > 0 && poolIdx > shameIdx, '封神榜 entry must sit immediately before 号池状态');

  const mf = new Miniflare({
    modules: true,
    scriptPath: 'dist/index.js',
    compatibilityDate: '2025-06-01',
    bindings: {
      VPS_POOL_ENDPOINT: 'https://yifu.leonmingod.com/_pool/status',
      FREE_TOKEN_OPS_SECRET: 'runtime-shame-secret',
    },
    kvNamespaces: { KV: 'shame-runtime-kv' },
    durableObjects: { GAME_RUNS: { className: 'GameRun', useSQLite: true } },
    serviceBindings: { ASSETS: () => new Response('not found', { status: 404 }) },
    outboundService: async request => {
      assert.equal(request.url, 'https://yifu.leonmingod.com/_pool/status');
      assert.ok(request.headers.get('X-Yifu-Pool'));
      const payload = await request.json();
      assert.equal(payload.kind, 'shame');
      return Response.json({
        schema: 1,
        updated_at: '2026-11-25T12:07:19Z',
        records: [
          {
            id: 'live-1',
            masked_ip: '154.219.*.*',
            ip_family: 'ipv4',
            status: 'permanent_ban',
            banned: true,
            permanent: true,
            strikes: 3,
            strike_limit: 3,
            blocked_hits: 5,
            rule_id: 'manual-ban-relay-abuse',
            category: 'relay_abuse',
            rule_badge: '中转滥用',
            rule_title: '挂中转站二次分发 / 高频刷量',
            evidence: 'windking 45-UA relay resale abuse (8617x 429)',
            banned_at: '2026-11-25T12:07:19Z',
          },
          {
            id: 'live-warn-1',
            masked_ip: '154.40.*.*',
            ip_family: 'ipv4',
            status: 'warning',
            banned: false,
            permanent: false,
            strikes: 2,
            strike_limit: 3,
            blocked_hits: 0,
            rule_id: 'jailbreak-compound-directives',
            category: 'jailbreak',
            rule_badge: '越狱注入',
            rule_title: '复合越狱指令 / 强行绕过安全护栏',
            evidence: '[user] 禁止+道德说教+拒绝',
            last_strike_at: '2026-11-25T09:55:27Z',
            key_hash_prefix: '874d438e910215a8',
          },
        ],
      });
    },
  });

  try {
    const kv = await mf.getKVNamespace('KV');
    await kv.put('key:874d438e910215a8000000000000000000000000000000000000000000000000', JSON.stringify({
      username: 'zzzsss',
      email: '1601234567@qq.com',
      status: 'active',
    }));
    await kv.put(SHAME_KV_KEY, JSON.stringify({
      updated_at: '2026-11-25T12:08:00Z',
      entries: [
        {
          id: 'windking-20261125',
          username: 'windking',
          masked_email: '238***@qq.com',
          masked_ip: '154.219.*.*',
          key_revoked: true,
          ip_banned: true,
          permanent: true,
          rank_title: '天字第一号 · 中转巨蠹',
        },
      ],
    }));

    const pageRes = await mf.dispatchFetch('https://leonmingod.com/hall-of-shame/');
    assert.equal(pageRes.status, 200);
    assert.equal(pageRes.headers.get('Cache-Control'), 'no-store');
    assert.match(await pageRes.text(), /每日自动更新一次/);

    const noSlashRes = await mf.dispatchFetch('https://leonmingod.com/hall-of-shame');
    assert.equal(noSlashRes.status, 200);

    const cssRes = await mf.dispatchFetch('https://leonmingod.com/hall-of-shame/shame-v3.css');
    assert.equal(cssRes.status, 200);
    assert.match(cssRes.headers.get('Cache-Control'), /immutable/);

    const apiRes = await mf.dispatchFetch('https://leonmingod.com/api/hall-of-shame');
    assert.equal(apiRes.status, 200);
    assert.match(apiRes.headers.get('Cache-Control'), /s-maxage=86400/);
    const rawApiText = await apiRes.text();
    assert.doesNotMatch(rawApiText, /key_hash_prefix|874d438e910215a8|1601234567/);
    const data = JSON.parse(rawApiText);
    assert.equal(data.schema, 1);
    assert.equal(data.update_interval, 'daily');
    assert.equal(data.entries[0].username, 'windking');
    assert.equal(data.entries[0].blocked_hits, 5);
    assert.equal(data.entries[1].username, 'zzzsss');
    assert.equal(data.entries[1].masked_email, '160***@qq.com');
    assert.equal(data.sources.vps_guard, true);
    assert.equal(data.sources.kv_dossier, true);
  } finally {
    await mf.dispose();
  }
});
