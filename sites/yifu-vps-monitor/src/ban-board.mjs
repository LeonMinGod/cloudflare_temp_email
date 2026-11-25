import { createHmac } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';

const DEFAULT_BAN_FILE = '/var/lib/yifu-prompt-guard/ip_bans.json';
const CACHE_TTL_MS = 60_000;
const STRIKE_LIMIT = 3;

const RULE_CATALOG = {
  'manual-ban-relay-abuse': {
    category: 'relay_abuse',
    badge: '中转滥用',
    title: '挂中转站二次分发 / 高频刷量',
  },
  'jailbreak-personas-and-tags': {
    category: 'jailbreak',
    badge: '破限攻击',
    title: '破限人设 / 开发者模式越权注入',
  },
  'jailbreak-compound-directives': {
    category: 'jailbreak',
    badge: '越狱注入',
    title: '复合越狱指令 / 强行绕过安全护栏',
  },
  'system-prompt-extraction': {
    category: 'prompt_extraction',
    badge: '提示词注入',
    title: '尝试窃取系统提示词 / 覆写上下文',
  },
};

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function expandIpv6(address) {
  const clean = address.toLowerCase().split('%')[0];
  if (!clean.includes(':')) return null;
  let working = clean;
  // Convert embedded IPv4 tail (e.g. ::ffff:192.0.2.1)
  const lastColon = working.lastIndexOf(':');
  const tail = working.slice(lastColon + 1);
  if (tail.includes('.')) {
    const m = tail.match(IPV4_RE);
    if (!m) return null;
    const nums = m.slice(1).map(Number);
    if (nums.some(n => n > 255)) return null;
    const hi = ((nums[0] << 8) | nums[1]).toString(16);
    const lo = ((nums[2] << 8) | nums[3]).toString(16);
    working = `${working.slice(0, lastColon + 1)}${hi}:${lo}`;
  }
  const parts = working.split('::');
  if (parts.length > 2) return null;
  const left = parts[0] ? parts[0].split(':') : [];
  const right = parts[1] ? parts[1].split(':') : [];
  if (parts.length === 1 && left.length !== 8) return null;
  const missing = 8 - (left.length + right.length);
  if (missing < 0) return null;
  const groups = parts.length === 2 ? [...left, ...Array(missing).fill('0'), ...right] : left;
  if (groups.length !== 8 || groups.some(g => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map(g => g.replace(/^0+/, '') || '0');
}

export function maskIp(raw) {
  const text = String(raw || '').trim();
  if (!text) return { masked: '未知网段', family: 'unknown' };
  const slashIdx = text.indexOf('/');
  const host = (slashIdx >= 0 ? text.slice(0, slashIdx) : text).trim();
  const hasCidr = slashIdx >= 0;

  const v4 = host.match(IPV4_RE);
  if (v4) {
    const nums = v4.slice(1).map(Number);
    if (nums.every(n => n >= 0 && n <= 255)) {
      return { masked: `${nums[0]}.${nums[1]}.*.*`, family: hasCidr ? 'ipv4_subnet' : 'ipv4' };
    }
  }

  const v6 = expandIpv6(host);
  if (v6) {
    // Handle IPv4-mapped IPv6 (::ffff:a.b.c.d)
    if (v6.slice(0, 5).every(g => g === '0') && v6[5] === 'ffff') {
      const hi = parseInt(v6[6], 16);
      const a = (hi >> 8) & 0xff;
      const b = hi & 0xff;
      return { masked: `${a}.${b}.*.*`, family: 'ipv4' };
    }
    return { masked: `${v6[0]}:${v6[1]}:*:*`, family: hasCidr ? 'ipv6_subnet' : 'ipv6' };
  }

  return { masked: '未知网段', family: 'unknown' };
}

export function normalizeTimestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || ms < Date.parse('2020-01-01T00:00:00Z')) return null;
  return new Date(ms).toISOString();
}

export function sanitizeEvidence(value) {
  const raw = String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const scrubbed = raw
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, 'sk-***')
    .replace(/\b(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}\b/g, '$1.$2.*.*')
    .replace(/\b([0-9a-fA-F]{1,4}):([0-9a-fA-F]{1,4})(?::[0-9a-fA-F]{0,4}){2,}(?:\/\d{1,3})?\b/g, '$1:$2:*:*')
    .replace(/\b([A-Za-z0-9._%+-]{1,3})[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g, '$1***@$2');
  return scrubbed.length > 120 ? scrubbed.slice(0, 117) + '...' : scrubbed;
}

export function classifyRule(ruleId) {
  const id = String(ruleId || '').trim();
  if (RULE_CATALOG[id]) return RULE_CATALOG[id];
  if (id.includes('relay') || id.includes('abuse')) {
    return { category: 'relay_abuse', badge: '滥用封禁', title: '恶意刷量 / 违规分发' };
  }
  if (id.includes('jailbreak')) {
    return { category: 'jailbreak', badge: '破限攻击', title: '越狱 / 破限指令拦截' };
  }
  if (id.includes('prompt')) {
    return { category: 'prompt_extraction', badge: '提示词注入', title: '尝试注入或提取系统提示词' };
  }
  return { category: 'policy_violation', badge: '风控拦截', title: '触发 Prompt Guard 安全规则' };
}

function stableId(secret, key) {
  return createHmac('sha256', String(secret || 'lmg-shame-salt'))
    .update(`lmg-shame-ip-v1\n${key}`)
    .digest('hex')
    .slice(0, 10);
}

const STATUS_RANK = { permanent_ban: 0, temp_ban: 1, warning: 2 };

export function sanitizeBanStore(rawData, { secret = '', now = Date.now() } = {}) {
  const rows = Array.isArray(rawData?.records)
    ? rawData.records
    : (rawData?.records && typeof rawData.records === 'object' ? Object.values(rawData.records) : []);

  const records = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const sourceKey = String(row.ban_key || row.last_ip || '').trim();
    if (!sourceKey) continue;

    const ipInfo = maskIp(sourceKey);
    const maskedIp = ipInfo.masked !== '未知网段' ? ipInfo.masked : maskIp(row.last_ip).masked;
    const ipFamily = ipInfo.masked !== '未知网段' ? ipInfo.family : maskIp(row.last_ip).family;

    const strikes = Math.max(0, Math.floor(Number(row.strikes) || 0));
    const blockedHits = Math.max(0, Math.floor(Number(row.blocked_hits) || 0));
    const bannedAt = normalizeTimestamp(row.banned_at);
    const banExpiresAt = normalizeTimestamp(row.ban_expires_at);
    const firstStrikeAt = normalizeTimestamp(row.first_strike_at);
    const lastStrikeAt = normalizeTimestamp(row.last_strike_at);

    const permanent = Boolean(row.permanent);
    const activeTempBan = Boolean(row.banned && !permanent && (!banExpiresAt || Date.parse(banExpiresAt) > now));
    const banned = Boolean(row.banned && (permanent || activeTempBan));

    // Skip stale entries with zero strikes and no active ban
    if (!banned && strikes <= 0 && blockedHits <= 0) continue;

    const status = permanent && banned ? 'permanent_ban' : (banned ? 'temp_ban' : 'warning');
    const ruleId = String(row.last_rule_id || 'unknown').trim().slice(0, 64);
    const rule = classifyRule(ruleId);

    records.push({
      id: stableId(secret, sourceKey),
      masked_ip: maskedIp,
      ip_family: ipFamily,
      status,
      banned,
      permanent: Boolean(permanent && banned),
      strikes,
      strike_limit: STRIKE_LIMIT,
      blocked_hits: blockedHits,
      rule_id: ruleId,
      category: rule.category,
      rule_badge: rule.badge,
      rule_title: rule.title,
      evidence: sanitizeEvidence(row.last_evidence),
      first_strike_at: firstStrikeAt,
      last_strike_at: lastStrikeAt,
      banned_at: banned ? bannedAt : null,
      ban_expires_at: activeTempBan ? banExpiresAt : null,
    });
  }

  records.sort((a, b) => {
    const sr = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);
    if (sr !== 0) return sr;
    if (a.status === 'permanent_ban') {
      const ta = Date.parse(a.banned_at || a.last_strike_at || '') || 0;
      const tb = Date.parse(b.banned_at || b.last_strike_at || '') || 0;
      if (tb !== ta) return tb - ta;
      return b.blocked_hits - a.blocked_hits;
    }
    if (b.strikes !== a.strikes) return b.strikes - a.strikes;
    const la = Date.parse(a.last_strike_at || '') || 0;
    const lb = Date.parse(b.last_strike_at || '') || 0;
    return lb - la;
  });

  const totals = {
    permanent_bans: records.filter(r => r.status === 'permanent_ban').length,
    temp_bans: records.filter(r => r.status === 'temp_ban').length,
    active_strikes: records.filter(r => r.status === 'warning').length,
    total_records: records.length,
    total_blocked_hits: records.reduce((sum, r) => sum + r.blocked_hits, 0),
  };

  return {
    schema: 1,
    source: 'prompt-guard',
    updated_at: normalizeTimestamp(rawData?.updated_at) || new Date(now).toISOString(),
    observed_at: new Date(now).toISOString(),
    totals,
    records,
  };
}

export function createBanBoardReader({ filePath = DEFAULT_BAN_FILE, secret = '', clock = () => Date.now(), cacheTtlMs = CACHE_TTL_MS } = {}) {
  let cached = null;
  let cachedAt = 0;
  let cachedMtime = -1;

  return async function readBanBoard() {
    const now = clock();
    let mtime = -1;
    try {
      const info = await stat(filePath);
      mtime = info.mtimeMs;
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return sanitizeBanStore({ records: [] }, { secret, now });
      }
      throw error;
    }

    if (cached && mtime === cachedMtime && now - cachedAt < cacheTtlMs) {
      return cached;
    }

    const text = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(text);
    cached = sanitizeBanStore(parsed, { secret, now });
    cachedAt = now;
    cachedMtime = mtime;
    return cached;
  };
}
