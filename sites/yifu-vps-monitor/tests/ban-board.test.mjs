import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { maskIp, sanitizeEvidence, sanitizeBanStore, createBanBoardReader } from '../src/ban-board.mjs';
import { SqliteStorage } from '../src/storage.mjs';
import { createCollector, signature } from '../src/service.mjs';

test('maskIp masks IPv4, IPv6, CIDR subnets and IPv4-mapped IPv6 without leaking host bits', () => {
  assert.deepEqual(maskIp('154.219.121.102'), { masked: '154.219.*.*', family: 'ipv4' });
  assert.deepEqual(maskIp('58.220.188.8/32'), { masked: '58.220.*.*', family: 'ipv4_subnet' });
  assert.deepEqual(maskIp('2607:5300:205:200::/64'), { masked: '2607:5300:*:*', family: 'ipv6_subnet' });
  assert.deepEqual(maskIp('2607:5300:0205:0200::a2a3'), { masked: '2607:5300:*:*', family: 'ipv6' });
  assert.deepEqual(maskIp('::ffff:154.219.121.102'), { masked: '154.219.*.*', family: 'ipv4' });
  assert.deepEqual(maskIp('not-an-ip'), { masked: '未知网段', family: 'unknown' });
});

test('sanitizeEvidence scrubs raw IPs, emails, and API keys from evidence strings', () => {
  const dirty = 'from 154.219.121.102 user victim@example.com key sk-lm-abcdef1234567890 ipv6 2607:5300:205:200::a2a3';
  const clean = sanitizeEvidence(dirty);
  assert.doesNotMatch(clean, /121\.102|victim@example\.com|abcdef1234567890|205:200|a2a3/);
  assert.match(clean, /154\.219\.\*\.\*/);
  assert.match(clean, /vic\*\*\*@example\.com/);
  assert.match(clean, /sk-\*\*\*/);
});

test('sanitizeBanStore drops raw IPs, converts Go zero timestamps, and orders permanent bans first', () => {
  const now = Date.parse('2026-11-25T12:20:00Z');
  const raw = {
    version: 1,
    updated_at: '2026-11-25T12:07:19.630150Z',
    records: [
      {
        ban_key: '154.40.35.159',
        last_ip: '154.40.35.159',
        strikes: 2,
        first_strike_at: '2026-11-25T09:12:28Z',
        last_strike_at: '2026-11-25T09:55:27Z',
        banned: false,
        permanent: false,
        banned_at: '0001-01-01T00:00:00Z',
        ban_expires_at: '0001-01-01T00:00:00Z',
        last_rule_id: 'jailbreak-compound-directives',
        last_evidence: '[user] 禁止+道德说教+拒绝',
      },
      {
        ban_key: '2607:5300:205:200::/64',
        last_ip: '2607:5300:205:200::a2a3',
        strikes: 3,
        first_strike_at: '2026-11-23T14:32:01Z',
        last_strike_at: '2026-11-24T03:37:19Z',
        banned: true,
        permanent: true,
        banned_at: '2026-11-24T03:37:19Z',
        ban_expires_at: '0001-01-01T00:00:00Z',
        last_rule_id: 'jailbreak-personas-and-tags',
        last_evidence: '[system] developermodeenabled',
        blocked_hits: 5737,
      },
      {
        ban_key: '154.219.121.102',
        last_ip: '154.219.121.102',
        strikes: 3,
        first_strike_at: '2026-11-25T12:07:19Z',
        last_strike_at: '2026-11-25T12:07:19Z',
        banned: true,
        permanent: true,
        banned_at: '2026-11-25T12:07:19Z',
        ban_expires_at: '0001-01-01T00:00:00Z',
        last_rule_id: 'manual-ban-relay-abuse',
        last_evidence: 'windking 45-UA relay resale abuse (8617x 429)',
        blocked_hits: 0,
      },
    ],
  };

  const out = sanitizeBanStore(raw, { secret: 'unit-secret', now });
  const text = JSON.stringify(out);
  assert.doesNotMatch(text, /121\.102|35\.159|205:200|a2a3|ban_key|last_ip/);
  assert.equal(out.totals.permanent_bans, 2);
  assert.equal(out.totals.active_strikes, 1);
  assert.equal(out.totals.total_blocked_hits, 5737);
  assert.equal(out.records[0].masked_ip, '154.219.*.*');
  assert.equal(out.records[0].status, 'permanent_ban');
  assert.equal(out.records[1].masked_ip, '2607:5300:*:*');
  assert.equal(out.records[1].ip_family, 'ipv6_subnet');
  assert.equal(out.records[2].status, 'warning');
  assert.equal(out.records[2].banned_at, null);
});

test('collector exposes signed kind:shame endpoint reading ip_bans.json safely', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'yifu-shame-'));
  const filePath = join(dir, 'ip_bans.json');
  const now = Date.parse('2026-11-25T12:20:00Z');
  const secret = 'test-shame-secret';
  writeFileSync(filePath, JSON.stringify({
    version: 1,
    updated_at: '2026-11-25T12:07:19Z',
    records: [
      {
        ban_key: '58.220.188.8',
        last_ip: '58.220.188.8',
        strikes: 3,
        banned: true,
        permanent: true,
        banned_at: '2026-11-24T09:31:53Z',
        last_rule_id: 'jailbreak-compound-directives',
        last_evidence: '[user] disable+all+safety+filters',
        blocked_hits: 8,
      },
    ],
  }));

  const storage = new SqliteStorage(':memory:');
  const readShameBoard = createBanBoardReader({ filePath, secret, clock: () => now });
  const app = createCollector({
    storage,
    secret,
    managementKey: 'dummy',
    clock: () => now,
    readShameBoard,
    fetcher: async () => Response.json({ files: [] }),
  });

  try {
    const bodyText = JSON.stringify({ kind: 'shame' });
    const stamp = String(now);
    const req = new Request('https://yifu.leonmingod.com/_pool/status', {
      method: 'POST',
      headers: { 'X-Yifu-Pool': `${stamp}:${signature(secret, stamp, '/_pool/status', bodyText)}` },
      body: bodyText,
    });
    const res = await app.fetch(req);
    assert.equal(res.status, 200);
    const jsonText = await res.text();
    assert.doesNotMatch(jsonText, /188\.8|ban_key|last_ip/);
    const data = JSON.parse(jsonText);
    assert.equal(data.totals.permanent_bans, 1);
    assert.equal(data.records[0].masked_ip, '58.220.*.*');
    assert.equal(data.records[0].blocked_hits, 8);
  } finally {
    await app.close();
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
