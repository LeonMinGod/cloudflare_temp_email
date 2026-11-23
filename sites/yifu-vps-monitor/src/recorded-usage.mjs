import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { normalizeProvider } from '../../leonmingod-star-night/public/model-status/order-v1.mjs';
import { accountIdentity } from '../../leonmingod-star-night/src/pool-status.js';

const run = promisify(execFile);
const DAY_MS = 86_400_000;
const OFFSET_MS = 8 * 3_600_000;
const periods = ['today', 'yesterday', 'week', 'month', 'all'];
const empty = () => ({ success: 0, failed: 0 });
const emptyWindows = () => Object.fromEntries(periods.map(period => [period, empty()]));
const emptyStampWindows = () => Object.fromEntries(periods.map(period => [period, null]));
const dayOf = ms => Math.floor((ms + OFFSET_MS) / DAY_MS);
const iso = ms => ms == null ? null : new Date(ms).toISOString();
const newerIso = (prevIso, nextMs) => {
  if (!Number.isFinite(nextMs) || nextMs <= 0) return prevIso || null;
  const prevMs = prevIso ? Date.parse(prevIso) : 0;
  return (!Number.isFinite(prevMs) || nextMs > prevMs) ? new Date(nextMs).toISOString() : prevIso;
};

export function dayRanges(now) {
  const today = dayOf(now);
  const date = new Date(today * DAY_MS);
  return {
    today: [today, today + 1],
    yesterday: [today - 1, today],
    week: [today - (date.getUTCDay() + 6) % 7, today + 1],
    month: [today - date.getUTCDate() + 1, today + 1],
    all: [-Infinity, Infinity],
  };
}

function addUnique(map, key, id) {
  if (!key) return;
  map.set(key, map.has(key) && map.get(key) !== id ? null : id);
}

export function attachRecordedUsage(snapshot, files, ids, data, now, gap) {
  const identities = new Map(), indexes = new Map(), authIndexes = new Map(), singleApiChannel = new Map(), apiKeyProviderById = new Map();
  files.forEach((file, i) => {
    const provider = normalizeProvider(file.provider || file.type);
    if (file.kind === 'api_key') {
      apiKeyProviderById.set(ids[i].id, provider);
      addUnique(singleApiChannel, provider, ids[i].id);
      for (const idx of Array.isArray(file.auth_indexes) ? file.auth_indexes : []) {
        addUnique(indexes, JSON.stringify([provider, idx]), ids[i].id);
        addUnique(authIndexes, idx, ids[i].id);
      }
      return;
    }
    addUnique(identities, accountIdentity(provider, file.email || file.account, file.id_token?.chatgpt_account_id), ids[i].id);
    if (file.auth_index) {
      addUnique(indexes, JSON.stringify([provider, file.auth_index]), ids[i].id);
      addUnique(authIndexes, file.auth_index, ids[i].id);
    }
  });

  const ranges = dayRanges(now), models = new Map(snapshot.models.map(row => [row.id, row]));
  const accountCounts = new Map();
  const accountWindows = new Map();
  const accountLastUsed = new Map();
  const accountLastUsedWindows = new Map();
  const usageRows = new Map();

  for (const rawRow of data.rows) {
    const provider = normalizeProvider(rawRow.provider);
    const authProvider = normalizeProvider(rawRow.auth_provider || rawRow.provider);
    const rowLastMs = Number.isFinite(rawRow.last_used_ms) ? rawRow.last_used_ms : null;

    const identity = accountIdentity(authProvider, rawRow.account, rawRow.upstream_id);
    const indexId = indexes.get(JSON.stringify([authProvider, rawRow.auth_index])) ||
      indexes.get(JSON.stringify([provider, rawRow.auth_index])) ||
      authIndexes.get(rawRow.auth_index) ||
      null;
    let id = identities.get(identity) || (!identity || identities.has(identity) ? indexId : null);
    if (!id && !identity) {
      id = singleApiChannel.get(provider) || singleApiChannel.get(authProvider) || null;
    }

    const usageProvider = (id && apiKeyProviderById.get(id)) || provider;
    const key = JSON.stringify([usageProvider, rawRow.model]);
    let usage = usageRows.get(key);
    if (!usage) {
      usage = { provider: usageProvider, windows: emptyWindows(), last_used_at: null, last_used_windows: emptyStampWindows() };
      usageRows.set(key, usage);
      if (!models.has(rawRow.model)) {
        const historical = {
          id: rawRow.model, total: 0, ready: 0, cooldown: 0, disabled: 0, error: 0, unknown: 0,
          online: false, providers: [usageProvider], retry_at: null,
        };
        models.set(rawRow.model, historical);
        snapshot.models.push(historical);
      }
      const model = models.get(rawRow.model);
      model.recorded_usage ??= [];
      model.recorded_usage.push(usage);
    }
    const model = models.get(rawRow.model);
    if (rowLastMs) {
      usage.last_used_at = newerIso(usage.last_used_at, rowLastMs);
      model.last_used_at = newerIso(model.last_used_at, rowLastMs);
    }
    for (const period of periods) {
      const [start, end] = ranges[period];
      if (rawRow.day < start || rawRow.day >= end) continue;
      usage.windows[period].success += rawRow.success;
      usage.windows[period].failed += rawRow.failed;
      if (rowLastMs) {
        usage.last_used_windows[period] = newerIso(usage.last_used_windows[period], rowLastMs);
      }
    }

    if (id) {
      const counts = accountCounts.get(id) || empty();
      counts.success += rawRow.success;
      counts.failed += rawRow.failed;
      accountCounts.set(id, counts);
      if (rowLastMs) {
        accountLastUsed.set(id, newerIso(accountLastUsed.get(id), rowLastMs));
      }

      const win = accountWindows.get(id) || emptyWindows();
      const stampWin = accountLastUsedWindows.get(id) || emptyStampWindows();
      for (const period of periods) {
        const [start, end] = ranges[period];
        if (rawRow.day < start || rawRow.day >= end) continue;
        win[period].success += rawRow.success;
        win[period].failed += rawRow.failed;
        if (rowLastMs) {
          stampWin[period] = newerIso(stampWin[period], rowLastMs);
        }
      }
      accountWindows.set(id, win);
      accountLastUsedWindows.set(id, stampWin);
    }
  }

  for (const account of snapshot.accounts) {
    const recorded = accountCounts.get(account.id);
    if (!recorded) continue;
    account.recorded_requests = recorded;
    account.recorded_windows = accountWindows.get(account.id);
    if (accountLastUsed.get(account.id)) {
      account.last_used_at = accountLastUsed.get(account.id);
      account.last_used_windows = accountLastUsedWindows.get(account.id);
    }
    if (account.success === 0 && account.failed === 0 && (recorded.success + recorded.failed > 0)) {
      account.success_rate = Math.round(recorded.success / (recorded.success + recorded.failed) * 1000) / 10;
    }
  }
  snapshot.recorded_usage = { since: iso(data.since), latest: iso(data.latest), gap };
}

export function createRecordedUsageReader(dbPath, coveragePath) {
  let gap = null;
  try {
    const value = JSON.parse(readFileSync(coveragePath, 'utf8'));
    if (Date.parse(value.start) < Date.parse(value.end)) gap = { start: value.start, end: value.end };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const script = fileURLToPath(new URL('./read-usage-db.mjs', import.meta.url));
  return async (snapshot, files, ids, now) => {
    const { stdout } = await run(process.execPath, ['--max-old-space-size=32', script, dbPath, String(now)], {
      timeout: 20_000, maxBuffer: 1_048_576, encoding: 'utf8',
    });
    const data = JSON.parse(stdout);
    data.rows = data.rows.filter(row => typeof row.model === 'string' && row.model.length > 0 &&
      row.model.length <= 256 && !/[\u0000-\u001f\u007f@]/u.test(row.model) &&
      /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(row.provider));
    attachRecordedUsage(snapshot, files, ids, data, now, gap);
  };
}
