import { relayPoolToVps } from './pool-vps.js';

export const SHAME_KV_KEY = 'ops:hall-of-shame:v1';
const SHAME_CACHE_VERSION = 'v3';
const DAILY_TTL_SECONDS = 86_400;
const DAILY_TTL_MS = DAILY_TTL_SECONDS * 1000;
const BEIJING_OFFSET_MS = 8 * 3_600_000;
const KEY_HASH_PREFIX_RE = /^[a-f0-9]{12,64}$/;

const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
};

const PUBLIC_CACHE_HEADERS = {
  ...BASE_HEADERS,
  'Cache-Control': `public, max-age=3600, s-maxage=${DAILY_TTL_SECONDS}`,
};

const POLICY_RULES = [
  {
    code: 'NO_RELAY',
    title: '严禁挂中转站 / 二次分发 / 倒卖公益 Key',
    penalty: '永久吊销 API Key + 永久封禁 IP，邮箱不可重新领取或找回',
  },
  {
    code: 'NO_JAILBREAK',
    title: '严禁越狱破限 / 开发者模式 / 系统提示词注入',
    penalty: 'Prompt Guard 三振出局（3 次触发自动永久封禁 IP / IPv6 网段）',
  },
  {
    code: 'NO_ABUSE',
    title: '严禁恶意高频刷量与探测管理接口',
    penalty: '触发边缘限流并入录封神榜脱敏公示，保障全站正常用户流畅体验',
  },
];

let memoryCache = null;

export function resetHallOfShameCache() {
  memoryCache = null;
}

export function beijingDateKey(now = Date.now()) {
  return new Date(now + BEIJING_OFFSET_MS).toISOString().slice(0, 10);
}

export function nextBeijingMidnightIso(now = Date.now()) {
  const dayStartUtc = Date.parse(`${beijingDateKey(now)}T00:00:00Z`) - BEIJING_OFFSET_MS;
  return new Date(dayStartUtc + DAILY_TTL_MS).toISOString();
}

export function maskEmailSafe(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const at = text.indexOf('@');
  if (at < 1 || at === text.length - 1) return null;
  const local = text.slice(0, at);
  const domain = text.slice(at + 1).toLowerCase();
  if (local.includes('***')) return `${local}@${domain}`;
  const prefixLen = local.length <= 2 ? 1 : Math.min(3, local.length - 1);
  return `${local.slice(0, prefixLen)}***@${domain}`;
}

export function maskIpSafe(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  if (/^\d{1,3}\.\d{1,3}\.\*\.\*$/.test(text)) return text;
  if (/^[0-9a-fA-F]{1,4}:[0-9a-fA-F]{1,4}:\*:\*$/.test(text)) return text.toLowerCase();
  const host = text.split('/')[0].trim();
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) return `${v4[1]}.${v4[2]}.*.*`;
  if (host.includes(':')) {
    const parts = host.toLowerCase().split(':').filter(Boolean);
    if (parts.length >= 2 && /^[0-9a-f]{1,4}$/.test(parts[0]) && /^[0-9a-f]{1,4}$/.test(parts[1])) {
      return `${parts[0].replace(/^0+/, '') || '0'}:${parts[1].replace(/^0+/, '') || '0'}:*:*`;
    }
    return 'ipv6:*:*';
  }
  return null;
}

export function scrubText(raw, maxLen = 180) {
  const text = String(raw || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const safe = text
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, 'sk-***')
    .replace(/\b(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}\b/g, '$1.$2.*.*')
    .replace(/\b([0-9a-fA-F]{1,4}):([0-9a-fA-F]{1,4})(?::[0-9a-fA-F]{0,4}){2,}(?:\/\d{1,3})?\b/g, '$1:$2:*:*')
    .replace(/\b([A-Za-z0-9._%+-]{1,3})[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g, '$1***@$2');
  return safe.length > maxLen ? safe.slice(0, maxLen - 3) + '...' : safe;
}

function normalizeIso(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || ms < Date.parse('2020-01-01T00:00:00Z')) return null;
  return new Date(ms).toISOString();
}

function sanitizeDossier(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const maskedIp = maskIpSafe(raw.masked_ip);
  const maskedEmail = maskEmailSafe(raw.masked_email || raw.email);
  const username = scrubText(raw.username, 32) || null;
  if (!maskedIp && !maskedEmail && !username) return null;
  const keyRevoked = Boolean(raw.key_revoked);
  const ipBanned = Boolean(raw.ip_banned);
  const permanent = Boolean(raw.permanent ?? (keyRevoked || ipBanned));
  return {
    id: scrubText(raw.id, 40) || `dossier-${maskedIp || username || 'entry'}`,
    username,
    masked_email: maskedEmail,
    masked_ip: maskedIp,
    key_revoked: keyRevoked,
    ip_banned: ipBanned,
    permanent,
    category: scrubText(raw.category, 32) || (keyRevoked ? 'relay_abuse' : 'policy_violation'),
    rule_badge: scrubText(raw.rule_badge, 24) || (keyRevoked ? '吊销封禁' : '风控封禁'),
    rule_title: scrubText(raw.rule_title, 80) || '违反公益站使用公约',
    rank_title: scrubText(raw.rank_title, 40) || null,
    detail: scrubText(raw.detail, 220) || '',
    highlight_metric: scrubText(raw.highlight_metric, 64) || null,
    punishment: scrubText(raw.punishment, 64) || (keyRevoked && ipBanned ? '密钥永久吊销 + IP 永久拉黑' : keyRevoked ? '密钥永久吊销' : 'IP 永久拉黑'),
    banned_at: normalizeIso(raw.banned_at || raw.revoked_at),
    match_rule_id: scrubText(raw.match_rule_id, 64) || null,
  };
}

function sanitizeVpsRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const maskedIp = maskIpSafe(raw.masked_ip);
  if (!maskedIp) return null;
  const status = ['permanent_ban', 'temp_ban', 'warning'].includes(raw.status) ? raw.status : 'warning';
  const rawPrefix = typeof raw.key_hash_prefix === 'string' ? raw.key_hash_prefix.trim().toLowerCase() : '';
  return {
    id: scrubText(raw.id, 32) || maskedIp,
    masked_ip: maskedIp,
    ip_family: ['ipv4', 'ipv4_subnet', 'ipv6', 'ipv6_subnet'].includes(raw.ip_family) ? raw.ip_family : 'unknown',
    status,
    banned: status === 'permanent_ban' || status === 'temp_ban',
    permanent: status === 'permanent_ban',
    strikes: Math.max(0, Math.floor(Number(raw.strikes) || 0)),
    strike_limit: Math.max(1, Math.floor(Number(raw.strike_limit) || 3)),
    blocked_hits: Math.max(0, Math.floor(Number(raw.blocked_hits) || 0)),
    rule_id: scrubText(raw.rule_id, 64) || 'unknown',
    category: scrubText(raw.category, 32) || 'policy_violation',
    rule_badge: scrubText(raw.rule_badge, 24) || '风控拦截',
    rule_title: scrubText(raw.rule_title, 80) || '触发 Prompt Guard 安全规则',
    evidence: scrubText(raw.evidence, 120),
    first_strike_at: normalizeIso(raw.first_strike_at),
    last_strike_at: normalizeIso(raw.last_strike_at),
    banned_at: normalizeIso(raw.banned_at),
    ban_expires_at: normalizeIso(raw.ban_expires_at),
    key_hash_prefix: KEY_HASH_PREFIX_RE.test(rawPrefix) ? rawPrefix : null,
  };
}

export async function resolveKeyIdentities(kv, prefixes) {
  const result = new Map();
  if (!kv?.list || !kv?.get) return result;
  const uniquePrefixes = [...new Set((prefixes || []).filter(p => typeof p === 'string' && KEY_HASH_PREFIX_RE.test(p)))].slice(0, 30);
  if (!uniquePrefixes.length) return result;

  const matchedKeyNames = new Map(); // prefix -> full KV key name (`key:<64-hex>`)
  let cursor;
  for (let page = 0; page < 5; page++) {
    const listed = await kv.list({ prefix: 'key:', ...(cursor ? { cursor } : {}) });
    for (const item of listed?.keys || []) {
      const hash = String(item?.name || '').slice(4);
      if (!hash) continue;
      for (const prefix of uniquePrefixes) {
        if (!matchedKeyNames.has(prefix) && hash.startsWith(prefix)) {
          matchedKeyNames.set(prefix, item.name);
        }
      }
    }
    if (matchedKeyNames.size >= uniquePrefixes.length || listed?.list_complete || !listed?.cursor) break;
    cursor = listed.cursor;
  }

  const fetches = [...matchedKeyNames.entries()].map(async ([prefix, keyName]) => {
    try {
      const raw = await kv.get(keyName);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const username = scrubText(parsed?.username, 32) || null;
      const maskedEmail = maskEmailSafe(parsed?.email);
      const keyRevoked = Boolean(parsed?.status && parsed.status !== 'active' && !parsed?.replaced_by);
      if (username || maskedEmail || keyRevoked) {
        result.set(prefix, { username, masked_email: maskedEmail, key_revoked: keyRevoked });
      }
    } catch {
      // Ignore malformed KV record
    }
  });
  await Promise.all(fetches);
  return result;
}

const STATUS_ORDER = { permanent_ban: 0, key_revoked: 1, temp_ban: 2, warning: 3 };

export function mergeShameSources({ vpsData = null, kvData = null, keyIdentities = null, now = Date.now() } = {}) {
  const vpsRecords = Array.isArray(vpsData?.records) ? vpsData.records.map(sanitizeVpsRecord).filter(Boolean) : [];
  const kvEntries = Array.isArray(kvData?.entries) ? kvData.entries.map(sanitizeDossier).filter(Boolean) : [];
  const identities = keyIdentities instanceof Map ? keyIdentities : new Map();

  const matchedDossiers = new Set();
  const entries = [];

  for (const vps of vpsRecords) {
    let matchedIndex = -1;
    if (vps.banned) {
      matchedIndex = kvEntries.findIndex((d, idx) =>
        !matchedDossiers.has(idx) &&
        d.masked_ip &&
        d.masked_ip === vps.masked_ip &&
        (!d.match_rule_id || d.match_rule_id === vps.rule_id)
      );
    }
    const dossier = matchedIndex >= 0 ? kvEntries[matchedIndex] : null;
    if (matchedIndex >= 0) matchedDossiers.add(matchedIndex);

    const resolved = vps.key_hash_prefix ? identities.get(vps.key_hash_prefix) : null;
    const username = dossier?.username || resolved?.username || null;
    const maskedEmail = dossier?.masked_email || resolved?.masked_email || null;
    const keyRevoked = Boolean(dossier?.key_revoked || resolved?.key_revoked);
    const ipBanned = Boolean(vps.banned || dossier?.ip_banned);
    const status = vps.status;
    const punishment = dossier?.punishment || (
      status === 'permanent_ban'
        ? (keyRevoked ? '密钥永久吊销 + IP 永久拉黑' : 'Prompt Guard IP 永久封禁')
        : status === 'temp_ban'
          ? 'IP 临时封禁中'
          : `安全预警（${vps.strikes}/${vps.strike_limit} 次，满 ${vps.strike_limit} 次永封）`
    );

    // Note: vps.key_hash_prefix is intentionally omitted from the public payload.
    entries.push({
      id: vps.id,
      source: dossier ? 'merged' : (resolved ? 'guard_kv' : 'prompt_guard'),
      status,
      permanent: Boolean(vps.permanent || dossier?.permanent),
      key_revoked: keyRevoked,
      ip_banned: ipBanned,
      username,
      masked_email: maskedEmail,
      masked_ip: vps.masked_ip,
      ip_family: vps.ip_family,
      rank_title: dossier?.rank_title || null,
      category: dossier?.category || vps.category,
      rule_badge: dossier?.rule_badge || vps.rule_badge,
      rule_title: dossier?.rule_title || vps.rule_title,
      detail: dossier?.detail || '',
      evidence: vps.evidence,
      highlight_metric: dossier?.highlight_metric || (vps.blocked_hits > 0 ? `已拦截 ${vps.blocked_hits.toLocaleString('en-US')} 次` : null),
      punishment,
      strikes: vps.strikes,
      strike_limit: vps.strike_limit,
      blocked_hits: vps.blocked_hits,
      first_strike_at: vps.first_strike_at,
      last_strike_at: vps.last_strike_at,
      banned_at: vps.banned_at || dossier?.banned_at || null,
      ban_expires_at: vps.ban_expires_at,
    });
  }

  kvEntries.forEach((dossier, idx) => {
    if (matchedDossiers.has(idx)) return;
    const status = dossier.ip_banned && dossier.permanent ? 'permanent_ban' : (dossier.key_revoked ? 'key_revoked' : 'permanent_ban');
    entries.push({
      id: dossier.id,
      source: 'kv_dossier',
      status,
      permanent: dossier.permanent,
      key_revoked: dossier.key_revoked,
      ip_banned: dossier.ip_banned,
      username: dossier.username,
      masked_email: dossier.masked_email,
      masked_ip: dossier.masked_ip,
      ip_family: dossier.masked_ip?.includes(':') ? 'ipv6_subnet' : (dossier.masked_ip ? 'ipv4' : 'unknown'),
      rank_title: dossier.rank_title,
      category: dossier.category,
      rule_badge: dossier.rule_badge,
      rule_title: dossier.rule_title,
      detail: dossier.detail,
      evidence: '',
      highlight_metric: dossier.highlight_metric,
      punishment: dossier.punishment,
      strikes: dossier.ip_banned ? 3 : 0,
      strike_limit: 3,
      blocked_hits: 0,
      first_strike_at: dossier.banned_at,
      last_strike_at: dossier.banned_at,
      banned_at: dossier.banned_at,
      ban_expires_at: null,
    });
  });

  entries.sort((a, b) => {
    const rankDiff = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
    if (rankDiff !== 0) return rankDiff;
    if (a.key_revoked !== b.key_revoked) return a.key_revoked ? -1 : 1;
    if (a.status === 'warning') {
      if (b.strikes !== a.strikes) return b.strikes - a.strikes;
    } else if (b.blocked_hits !== a.blocked_hits) {
      return b.blocked_hits - a.blocked_hits;
    }
    const timeA = Date.parse(a.banned_at || a.last_strike_at || '') || 0;
    const timeB = Date.parse(b.banned_at || b.last_strike_at || '') || 0;
    return timeB - timeA;
  });

  const timestamps = [
    normalizeIso(vpsData?.updated_at),
    normalizeIso(kvData?.updated_at),
  ].filter(Boolean).map(t => Date.parse(t));
  const latestUpdate = timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : new Date(now).toISOString();

  const totals = {
    permanent_bans: entries.filter(e => e.status === 'permanent_ban' || e.status === 'key_revoked').length,
    revoked_keys: entries.filter(e => e.key_revoked).length,
    ip_permanent_bans: entries.filter(e => e.status === 'permanent_ban').length,
    active_strikes: entries.filter(e => e.status === 'warning').length,
    total_blocked_hits: entries.reduce((sum, e) => sum + (e.blocked_hits || 0), 0),
    total_entries: entries.length,
  };

  return {
    schema: 1,
    update_interval: 'daily',
    day_key: beijingDateKey(now),
    updated_at: latestUpdate,
    observed_at: new Date(now).toISOString(),
    next_update_at: nextBeijingMidnightIso(now),
    sources: {
      vps_guard: Boolean(vpsData),
      kv_dossier: Boolean(kvData),
    },
    totals,
    rules: POLICY_RULES,
    entries,
  };
}

export async function handleHallOfShame(request, env, { fetcher = (url, init) => fetch(url, init), clock = () => Date.now(), useCache = true } = {}) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: { ...BASE_HEADERS, 'Cache-Control': 'no-store', Allow: 'GET, HEAD' } });
  }

  const now = clock();
  const dayKey = beijingDateKey(now);
  const cacheScope = `${env.VPS_POOL_ENDPOINT || 'kv-only'}:${SHAME_CACHE_VERSION}:${dayKey}`;

  if (useCache && memoryCache && memoryCache.key === cacheScope && now - memoryCache.at < DAILY_TTL_MS) {
    return new Response(request.method === 'HEAD' ? null : memoryCache.json, {
      status: 200,
      headers: { ...PUBLIC_CACHE_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const edgeCache = useCache && typeof caches !== 'undefined' && caches?.default ? caches.default : null;
  const edgeCacheKey = new Request(`https://shame-cache.leonmingod.internal/api/hall-of-shame/${SHAME_CACHE_VERSION}?day=${dayKey}`);
  if (edgeCache) {
    try {
      const hit = await edgeCache.match(edgeCacheKey);
      if (hit) {
        const json = await hit.text();
        memoryCache = { key: cacheScope, at: now, json };
        return new Response(request.method === 'HEAD' ? null : json, {
          status: 200,
          headers: { ...PUBLIC_CACHE_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
        });
      }
    } catch {
      // Ignore edge cache errors and fall through to origin fetch
    }
  }

  const vpsTask = (env.VPS_POOL_ENDPOINT && env.FREE_TOKEN_OPS_SECRET)
    ? relayPoolToVps(env, { kind: 'shame' }, fetcher, now).then(async res => {
      if (!res.ok) throw new Error(`VPS shame HTTP ${res.status}`);
      return res.json();
    })
    : Promise.resolve(null);

  const kvTask = env.KV?.get
    ? env.KV.get(SHAME_KV_KEY).then(raw => (raw ? JSON.parse(raw) : null))
    : Promise.resolve(null);

  const [vpsResult, kvResult] = await Promise.allSettled([vpsTask, kvTask]);
  const vpsData = vpsResult.status === 'fulfilled' ? vpsResult.value : null;
  const kvData = kvResult.status === 'fulfilled' ? kvResult.value : null;

  if (!vpsData && !kvData && (vpsResult.status === 'rejected' || kvResult.status === 'rejected')) {
    if (useCache && memoryCache) {
      return new Response(request.method === 'HEAD' ? null : memoryCache.json, {
        status: 200,
        headers: { ...PUBLIC_CACHE_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
      });
    }
    return Response.json(
      { error: '封神榜数据暂时无法连接，请稍后再试。' },
      { status: 503, headers: { ...BASE_HEADERS, 'Cache-Control': 'no-store', 'Retry-After': '300' } }
    );
  }

  const prefixes = (vpsData?.records || []).map(r => r?.key_hash_prefix).filter(Boolean);
  let keyIdentities = new Map();
  if (prefixes.length && env.KV?.list && env.KV?.get) {
    try {
      keyIdentities = await resolveKeyIdentities(env.KV, prefixes);
    } catch {
      keyIdentities = new Map();
    }
  }

  const payload = mergeShameSources({ vpsData, kvData, keyIdentities, now });
  const json = JSON.stringify(payload);

  if (useCache) {
    memoryCache = { key: cacheScope, at: now, json };
    if (edgeCache && payload.sources.vps_guard) {
      try {
        await edgeCache.put(edgeCacheKey, new Response(json, {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': `public, max-age=${DAILY_TTL_SECONDS}`,
          },
        }));
      } catch {
        // Ignore edge cache write failures
      }
    }
  }

  return new Response(request.method === 'HEAD' ? null : json, {
    status: 200,
    headers: { ...PUBLIC_CACHE_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}
