// Key authorization for POST /v1/authorize.
// Rate limits and allowed-request totals stay in the AbuseState Durable Object.
// KV writes are planned here and flushed later so the free tier's 1,000 writes/day
// is shared with leonmingod-home instead of spent once per request.

const MINUTE = 60_000;
const DAY = 86_400_000;
const encoder = new TextEncoder();

export const DEFAULTS = Object.freeze({
  keyPerMinute: 60,
  keyPerDay: 2000,
  emailPerMinute: 60,
  emailPerDay: 2000,
  flushMs: 3 * 60 * 60 * 1000,
  minFlushMs: 60 * 60 * 1000,
  maxWritesPerDay: 120,
  writeCap: 200,
});

export function limitsFromEnv(env = {}) {
  return {
    keyPerMinute: clampInt(env.KEY_LIMIT_PER_MINUTE, DEFAULTS.keyPerMinute, 1, 10_000),
    keyPerDay: clampInt(env.KEY_LIMIT_PER_DAY, DEFAULTS.keyPerDay, 1, 100_000),
    emailPerMinute: clampInt(env.EMAIL_LIMIT_PER_MINUTE, DEFAULTS.emailPerMinute, 1, 10_000),
    emailPerDay: clampInt(env.EMAIL_LIMIT_PER_DAY, DEFAULTS.emailPerDay, 1, 100_000),
    flushMs: Math.max(clampInt(env.STATS_FLUSH_MS, DEFAULTS.flushMs, 1, 7 * DAY), DEFAULTS.minFlushMs),
    maxWritesPerDay: Math.min(clampInt(env.KV_WRITES_PER_DAY, DEFAULTS.maxWritesPerDay, 1, DEFAULTS.writeCap), DEFAULTS.writeCap),
  };
}

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min) return fallback;
  return Math.min(parsed, max);
}

export function parseAuthorizeBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid request' };
  if (typeof body.key_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(body.key_sha256)) return { error: 'Invalid request' };
  if (typeof body.path !== 'string' || !body.path.startsWith('/') || body.path.length > 512 || body.path.includes('?')) return { error: 'Invalid request' };
  if (body.model !== undefined && (typeof body.model !== 'string' || body.model.length > 256)) return { error: 'Invalid request' };
  return { hash: body.key_sha256, path: body.path, model: body.model };
}

export function classifyRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return { active: false, reason: 'unknown_key', email: '' };
  if (record.status !== 'active') return { active: false, reason: 'revoked', email: '' };
  const email = typeof record.email === 'string' ? record.email.trim().toLowerCase() : '';
  return { active: true, reason: 'ok', email: email.length > 0 && email.length <= 254 ? email : '' };
}

function roll(row, now) {
  let minuteStart = row?.minute_start ?? now;
  let minuteCount = row?.minute_count ?? 0;
  let dayStart = row?.day_start ?? now;
  let dayCount = row?.day_count ?? 0;
  if (!row || now >= minuteStart + MINUTE) {
    minuteStart = now;
    minuteCount = 0;
  }
  if (!row || now >= dayStart + DAY) {
    dayStart = now;
    dayCount = 0;
  }
  return { minuteStart, minuteCount, dayStart, dayCount, allowed: row?.allowed || 0, flushed: row?.flushed || 0 };
}

function consume(row, now, minuteLimit, dayLimit) {
  const current = roll(row, now);
  if (current.minuteCount >= minuteLimit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((current.minuteStart + MINUTE - now) / 1000)), row: current };
  }
  if (current.dayCount >= dayLimit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((current.dayStart + DAY - now) / 1000)), row: current };
  }
  const next = { ...current, minuteCount: current.minuteCount + 1, dayCount: current.dayCount + 1 };
  return {
    ok: true,
    row: next,
    remaining: { minute: minuteLimit - next.minuteCount, day: dayLimit - next.dayCount },
  };
}

function stored(row) {
  return {
    minute_start: row.minuteStart,
    minute_count: row.minuteCount,
    day_start: row.dayStart,
    day_count: row.dayCount,
    allowed: row.allowed,
    flushed: row.flushed,
  };
}

export function authorizeQuota({ keyRow, emailRow, hasEmail, limits, now }) {
  const key = consume(keyRow, now, limits.keyPerMinute, limits.keyPerDay);
  const keyStored = stored(key.row);
  if (!key.ok) {
    return { consumed: false, keyRow: keyStored, emailRow: null, public: { allow: false, reason: 'rate_limited', retry_after: key.retryAfter } };
  }
  let emailStored = emailRow;
  if (hasEmail) {
    const email = consume(emailRow, now, limits.emailPerMinute, limits.emailPerDay);
    emailStored = stored(email.row);
    if (!email.ok) {
      return { consumed: true, keyRow: keyStored, emailRow: emailStored, public: { allow: false, reason: 'rate_limited', retry_after: email.retryAfter } };
    }
  }
  keyStored.allowed += 1;
  return {
    consumed: true,
    keyRow: keyStored,
    emailRow: emailStored,
    public: { allow: true, reason: 'ok', remaining: key.remaining },
  };
}

export function readQuota(sql, kind, id) {
  return [...sql.exec('SELECT minute_start,minute_count,day_start,day_count,allowed,flushed FROM quotas WHERE kind=? AND id=?', kind, id)][0] || null;
}

export function writeQuota(sql, kind, id, row) {
  sql.exec('INSERT OR REPLACE INTO quotas (kind,id,minute_start,minute_count,day_start,day_count,allowed,flushed) VALUES (?,?,?,?,?,?,?,?)',
    kind, id, row.minute_start, row.minute_count, row.day_start, row.day_count, row.allowed || 0, row.flushed || 0);
}

function quotaChanged(previous, next) {
  return !previous || ['minute_start', 'minute_count', 'day_start', 'day_count', 'allowed', 'flushed']
    .some(field => (previous[field] || 0) !== (next[field] || 0));
}

export function applyAuthorize(sql, payload) {
  const now = Number(payload.now) || Date.now();
  const replayKey = `auth:${payload.nonce}`;
  const previous = [...sql.exec('SELECT response FROM replay WHERE nonce=? AND created>?', replayKey, now - 60000)][0];
  if (previous) return JSON.parse(previous.response);
  let result, changed = false;
  if (!payload.active) {
    result = { allow: false, reason: payload.reason === 'revoked' ? 'revoked' : 'unknown_key', retry_after: 0 };
  } else {
    const limits = payload.limits || limitsFromEnv({});
    const keyRow = readQuota(sql, 'key', payload.hash);
    const emailRow = payload.email ? readQuota(sql, 'email', payload.email) : null;
    const decision = authorizeQuota({
      keyRow,
      emailRow,
      hasEmail: Boolean(payload.email),
      limits,
      now,
    });
    if (decision.consumed && quotaChanged(keyRow, decision.keyRow)) {
      writeQuota(sql, 'key', payload.hash, decision.keyRow);
      changed = true;
    }
    if (decision.consumed && payload.email && decision.emailRow && quotaChanged(emailRow, decision.emailRow)) {
      writeQuota(sql, 'email', payload.email, decision.emailRow);
      changed = true;
    }
    result = decision.public;
  }
  // Only state-changing decisions need durable deduplication. Repeated denials
  // must not spend write quota or change the accounting they are protecting.
  if (changed) {
    sql.exec('INSERT INTO replay VALUES (?,?,?)', replayKey, JSON.stringify(result), now);
    if (![...sql.exec('SELECT next FROM key_flush WHERE id=1')][0]) sql.exec('INSERT INTO key_flush (id,next,top_dirty) VALUES (1,?,0)', now);
  }
  return result;
}

export function encodeDecision(decision) {
  const payload = { allow: decision.allow === true, reason: decision.reason };
  if (!payload.allow) payload.retry_after = Number.isInteger(decision.retry_after) ? decision.retry_after : 0;
  if (payload.allow && decision.remaining && Number.isInteger(decision.remaining.minute) && Number.isInteger(decision.remaining.day)) {
    payload.remaining = { minute: decision.remaining.minute, day: decision.remaining.day };
  }
  return JSON.stringify(payload);
}

export async function responseHeader(secret, nonce, path, status, body, now = Date.now()) {
  const stamp = String(now);
  const message = `${stamp}\n${nonce}\n${status}\n${path}\n${body}`;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
  return `${stamp}:${nonce}:${[...mac].map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function planFlush(entries, quotasByHash, statsByHash, now, budgetLeft, topDirty) {
  const stats = [];
  const ranked = [];
  let remaining = budgetLeft;
  for (const entry of (entries || []).slice(0, 20)) {
    const hash = entry?.key_sha256;
    if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) continue;
    const quota = quotasByHash.get(hash);
    let score = 0;
    if (quota) {
      score = quota.allowed || 0;
      if (quota.allowed !== quota.flushed && remaining > 0) {
        stats.push({
          hash,
          requests: quota.allowed,
          value: { requests: quota.allowed, updated_at: new Date(now).toISOString() },
        });
        remaining -= 1;
      }
    } else {
      score = statsByHash.get(hash) || 0;
    }
    ranked.push({
      username: typeof entry.username === 'string' ? entry.username : '',
      created_at: typeof entry.created_at === 'string' ? entry.created_at : '',
      score: Number.isFinite(score) && score > 0 ? Math.floor(score) : 0,
    });
  }
  ranked.sort((a, b) => (b.score - a.score) || (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  const wantTop = topDirty || stats.length > 0;
  const top = wantTop && remaining > 0
    ? { updated_at: new Date(now).toISOString(), entries: ranked.map(({ username, score }) => ({ username, score })) }
    : null;
  return { stats, top };
}
