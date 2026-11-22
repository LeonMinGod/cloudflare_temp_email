import { relativeWait as when } from './time-v1.mjs?v=2';
import { providerKey, compareProviders, compareModels, compareAccounts, stateRank } from './order-v1.mjs?v=2';

const $ = id => document.getElementById(id);
const API_BASE_URL = 'https://yifu.leonmingod.com/v1';
const MATRIX_SLOTS = 48; // Past 4 hours at 5 minutes per bar

const KNOWN_BRANDS = {
  all: { name: '全部厂商', icon: '◈' },
  codex: { name: 'Codex', icon: '◉' },
  openai: { name: 'OpenAI', icon: '◉' },
  claude: { name: 'Claude', icon: '✳' },
  gemini: { name: 'Gemini', icon: '✦' },
  antigravity: { name: 'Antigravity', icon: '▲' },
  xai: { name: 'Grok', icon: '𝕏' },
  deepseek: { name: 'DeepSeek', icon: '◈' },
  qwen: { name: '通义千问', icon: '◇' },
  siliconflow: { name: '硅基流动', icon: '⚡' },
  openrouter: { name: 'OpenRouter', icon: '⇄' },
  moonshot: { name: 'Kimi', icon: '☾' },
  kimi: { name: 'Kimi', icon: '☾' },
  glm: { name: 'GLM', icon: '◈' },
  zhipu: { name: 'GLM', icon: '◈' },
  minimax: { name: 'MiniMax', icon: 'M' },
  groq: { name: 'Groq', icon: '⚡' },
  mistral: { name: 'Mistral', icon: 'M' },
  volcengine: { name: '火山引擎', icon: '▲' },
  iflow: { name: 'iFlow', icon: '≈' },
  kiro: { name: 'Kiro', icon: 'K' },
  copilot: { name: 'Copilot', icon: '⌘' },
  other: { name: '其他', icon: '◌' },
};

const STATE_LABELS = {
  ready: '正常在线',
  degraded: '连续失败',
  cooldown: '冷却中',
  error: '连接异常',
  disabled: '已停用',
  archived: '历史归档',
  unknown: '未观测',
};

const PERIOD_LABELS = {
  today: '今天',
  yesterday: '昨天',
  week: '本周',
  month: '本月',
  all: '累计',
};

const RANK_EXT = {
  ready: 0,
  degraded: 1,
  cooldown: 2,
  error: 3,
  unknown: 4,
  disabled: 5,
  archived: 6,
};

function brand(raw) {
  const key = providerKey(raw);
  if (KNOWN_BRANDS[key]) return KNOWN_BRANDS[key];
  const label = String(raw || key || '未知').trim();
  const mono = label.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '').slice(0, 1).toUpperCase() || '◈';
  return { name: label, icon: mono };
}

const fmtDate = value => {
  const t = Date.parse(value || '');
  return Number.isFinite(t)
    ? new Date(t).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '未上报';
};

const selectedPeriod = () => $('usage-period').value;

let data = null;
let view = 'models';
let layout = 'matrix';
let onlineOnly = true;
let provider = 'all';
let busy = false;
let controller = null;
let timer = null;
let nextRefresh = 0;
let toastTimer = null;
const quotaBusy = new Set();

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function waitText(at, prefix = '', tag = 'span', className = '') {
  const node = el(tag, prefix + when(at), className);
  node.dataset.waitAt = at;
  node.dataset.waitPrefix = prefix;
  return node;
}

function relativeAgo(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSec < 45) return '刚刚';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return fmtDate(new Date(ms).toISOString());
}

function agoText(ms, prefix = '最近 ', tag = 'span', className = 'channel-hint') {
  const node = el(tag, prefix + relativeAgo(ms), className);
  node.dataset.agoMs = String(ms);
  node.dataset.agoPrefix = prefix;
  node.title = `最近调用时间：${fmtDate(new Date(ms).toISOString())}`;
  return node;
}

function badge(state) {
  const node = el('span', STATE_LABELS[state] || STATE_LABELS.unknown, 'badge');
  node.dataset.state = state === 'archived' ? 'disabled' : state;
  return node;
}

function notify(message) {
  const t = $('toast');
  t.textContent = message;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}

async function copyText(text, label) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const area = el('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.append(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    notify(`✓ 已复制${label}：${text}`);
    return true;
  } catch {
    notify(`复制失败，请手动复制：${text}`);
    return false;
  }
}

function isModelOnline(row) {
  if (typeof row.online === 'boolean') return row.online;
  return (row.total || 0) - (row.disabled || 0) > 0;
}

function isAccountOnline(row) {
  return row.state !== 'disabled';
}

function displayProviderKeys(row) {
  const base = row.providers?.length ? row.providers : row.provider ? [row.provider] : [];
  const extra = view === 'models' ? (row.recorded_usage || []).map(x => x.provider) : [];
  const keys = [...new Set([...base, ...extra].filter(Boolean).map(providerKey))];
  return keys.length ? keys : ['other'];
}

function parseMs(isoStr) {
  const t = Date.parse(isoStr || '');
  return Number.isFinite(t) && t > 0 ? t : 0;
}

function usageFor(row, providerFilter = provider) {
  const rows = (row.usage || []).filter(x => providerFilter === 'all' || providerKey(x.provider) === providerFilter);
  const sum = { success: 0, failed: 0, ttft_ms: 0, ttft_samples: 0, output_tokens: 0, output_ms: 0 };
  const buckets = new Map();
  let lastUsedMs = 0;

  for (const x of rows) {
    for (const field of ['ttft_ms', 'ttft_samples', 'output_tokens', 'output_ms']) {
      sum[field] += x.recent_summary?.[field] || 0;
    }
    for (const bucket of x.recent || []) {
      const b = buckets.get(bucket.at) || { at: bucket.at, success: 0, failed: 0 };
      b.success += bucket.success;
      b.failed += bucket.failed;
      buckets.set(bucket.at, b);
      if ((bucket.success || 0) + (bucket.failed || 0) > 0) {
        lastUsedMs = Math.max(lastUsedMs, parseMs(bucket.at));
      }
    }
  }

  let recentSuccess = 0, recentFailed = 0;
  for (const b of buckets.values()) {
    recentSuccess += b.success;
    recentFailed += b.failed;
  }

  const period = selectedPeriod();
  if (data?.recorded_usage) {
    for (const usage of (row.recorded_usage || []).filter(x => providerFilter === 'all' || providerKey(x.provider) === providerFilter)) {
      const counts = usage.windows[period] || { success: 0, failed: 0 };
      sum.success += counts.success;
      sum.failed += counts.failed;
      const winStamp = parseMs(usage.last_used_windows?.[period]) || parseMs(usage.last_used_at);
      if (winStamp > lastUsedMs) lastUsedMs = winStamp;
    }
    if (providerFilter === 'all' && !lastUsedMs) {
      lastUsedMs = Math.max(lastUsedMs, parseMs(row.last_used_at));
    }
  } else {
    for (const x of rows) {
      sum.success += x.success || 0;
      sum.failed += x.failed || 0;
    }
  }

  const end = Math.floor(Date.parse(data?.model_metrics_updated_at || data?.updated_at || new Date().toISOString()) / 300000) * 300000;
  const recent = Array.from({ length: MATRIX_SLOTS }, (_, i) => {
    const stamp = new Date(end - (MATRIX_SLOTS - 1 - i) * 300000).toISOString();
    const b = buckets.get(stamp);
    return { time: fmtDate(stamp), success: b?.success || 0, failed: b?.failed || 0 };
  });

  return {
    ...sum,
    total: sum.success + sum.failed,
    recentSuccess,
    recentFailed,
    lastUsedMs,
    recent,
  };
}

function effectiveModelState(row, metric, providerFilter = provider) {
  if (!isModelOnline(row)) {
    return (row.total || 0) > 0 && row.disabled === row.total ? 'disabled' : 'archived';
  }
  const m = metric || usageFor(row, providerFilter);
  if (row.ready > 0) {
    if (m.recentFailed >= 2 && m.recentSuccess === 0) return 'degraded';
    if (selectedPeriod() === 'today' && m.failed >= 3 && m.success === 0) return 'degraded';
    return 'ready';
  }
  if (row.cooldown > 0) return 'cooldown';
  if (row.error > 0) return 'error';
  return 'unknown';
}

function accountPeriodCounts(row) {
  const period = selectedPeriod();
  if (row.recorded_windows?.[period]) return row.recorded_windows[period];
  if (row.recorded_requests) return row.recorded_requests;
  return { success: row.success || 0, failed: row.failed || 0 };
}

function accountLastUsedMs(row) {
  const period = selectedPeriod();
  let latest = parseMs(row.last_used_windows?.[period]) || parseMs(row.last_used_at);
  for (const b of row.recent_requests || []) {
    if ((b.success || 0) + (b.failed || 0) > 0) {
      latest = Math.max(latest, parseMs(b.at || b.time));
    }
  }
  return latest;
}

function effectiveOnlineFilter() {
  const sf = $('state-filter').value;
  if (sf === 'disabled') return false;
  return onlineOnly;
}

function matchesProvider(row) {
  return provider === 'all' || displayProviderKeys(row).includes(provider);
}

function matchesSearchAndState(row, mode) {
  const q = $('search').value.trim().toLowerCase();
  const sf = $('state-filter').value;
  if (!matchesProvider(row)) return false;

  if (mode === 'models') {
    const st = effectiveModelState(row);
    if (effectiveOnlineFilter() && (st === 'disabled' || st === 'archived')) return false;
    if (sf) {
      if (sf === 'disabled' && st !== 'disabled' && st !== 'archived') return false;
      if (sf !== 'disabled' && st !== sf) return false;
    }
    if (q) {
      const hay = `${row.id} ${displayProviderKeys(row).map(k => `${k} ${brand(k).name}`).join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  // accounts mode
  if (effectiveOnlineFilter() && !isAccountOnline(row)) return false;
  if (sf) {
    if (sf === 'degraded' && row.state !== 'error') return false;
    if (sf !== 'degraded' && row.state !== sf) return false;
  }
  if (q) {
    const hay = `${row.id} ${row.channel_name || ''} ${row.masked_email || ''} ${row.provider} ${brand(row.provider).name} ${(row.preview_models || []).join(' ')}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function renderProviders() {
  const counts = new Map();
  const bestRank = new Map();
  const onlyOnline = effectiveOnlineFilter();

  if (view === 'models') {
    for (const model of data.models) {
      if (onlyOnline && !isModelOnline(model)) continue;
      for (const key of displayProviderKeys(model)) {
        const st = effectiveModelState(model, null, key);
        counts.set(key, (counts.get(key) || 0) + 1);
        bestRank.set(key, Math.min(bestRank.get(key) ?? 99, RANK_EXT[st] ?? 4));
      }
    }
  } else {
    for (const acc of data.accounts) {
      if (onlyOnline && !isAccountOnline(acc)) continue;
      const key = providerKey(acc.provider);
      counts.set(key, (counts.get(key) || 0) + 1);
      bestRank.set(key, Math.min(bestRank.get(key) ?? 99, RANK_EXT[acc.state] ?? 4));
    }
  }

  if (provider !== 'all' && provider !== 'other' && !counts.has(provider)) {
    provider = 'all';
  }

  const totalItems = view === 'models'
    ? data.models.filter(m => !onlyOnline || isModelOnline(m)).length
    : data.accounts.filter(a => !onlyOnline || isAccountOnline(a)).length;

  // Fixed, deterministic tab order: never reorders when clicking tabs or as request counts fluctuate.
  const namedKeys = [...counts.entries()]
    .filter(([k]) => k !== 'other')
    .sort((a, b) => compareProviders(a[0], b[0]));

  const rankToState = r => r === 0 ? 'ready' : r === 1 ? 'degraded' : r === 2 ? 'cooldown' : r === 3 ? 'error' : 'disabled';
  const otherCount = counts.get('other') || 0;
  const otherDot = otherCount > 0 ? rankToState(bestRank.get('other')) : null;
  const tabs = [
    ['all', totalItems, null],
    ...namedKeys.map(([k, n]) => [k, n, rankToState(bestRank.get(k))]),
    ['other', otherCount, otherDot],
  ];

  const nav = $('provider-tabs');
  const prevScroll = nav.scrollLeft;
  nav.replaceChildren(...tabs.map(([key, count, dotState]) => {
    const b = brand(key);
    const btn = el('button', undefined, 'provider-tab');
    btn.type = 'button';
    btn.dataset.provider = key;
    btn.setAttribute('aria-pressed', String(provider === key));
    btn.append(el('span', b.icon, 'provider-monogram'));
    if (dotState) {
      const dot = el('span', undefined, 'provider-dot');
      dot.dataset.state = dotState;
      btn.append(dot);
    }
    btn.append(el('span', b.name), el('span', String(count), 'provider-count'));
    btn.addEventListener('click', () => {
      if (provider === key) return;
      provider = key;
      for (const child of nav.children) {
        child.setAttribute('aria-pressed', String(child.dataset.provider === provider));
      }
      render();
    });
    return btn;
  }));
  nav.scrollLeft = prevScroll;
}

function buildHeatmap(rows, slots, isRequestBuckets = true) {
  const line = el('div', undefined, 'history');
  line.setAttribute('role', 'img');
  line.setAttribute('aria-label', '近期可用性热力条');
  const values = rows.slice(-slots);
  const pad = slots - values.length;
  for (let i = 0; i < slots; i++) {
    const tick = el('i');
    const row = values[i - pad];
    if (row) {
      let state = row.state;
      if (isRequestBuckets) {
        const total = row.success + row.failed;
        state = total ? (row.failed ? (row.success ? 'mixed' : 'error') : 'ready') : 'unknown';
        if (state === 'mixed') tick.style.setProperty('--failure', `${(row.failed / total) * 100}%`);
        const pct = total ? `${((row.success / total) * 100).toFixed(0)}%` : '无调用';
        tick.title = `${row.time} · 成功 ${row.success} / 失败 ${row.failed} (${pct})`;
      } else {
        tick.title = `${fmtDate(row.at)} · ${STATE_LABELS[row.state] || row.state}`;
      }
      tick.dataset.state = state;
    } else {
      tick.title = '暂无记录';
    }
    line.append(tick);
  }
  return line;
}

function rateTier(rate) {
  if (rate === null) return 'none';
  if (rate >= 90) return 'good';
  if (rate >= 60) return 'warn';
  return 'bad';
}

function makeCopyableModelButton(modelId) {
  const btn = el('button', undefined, 'model-name-btn');
  btn.type = 'button';
  btn.title = `点击复制模型 ID：${modelId}`;
  const idSpan = el('span', modelId);
  const hint = el('span', '⧉ 复制', 'copy-hint');
  btn.append(idSpan, hint);
  btn.addEventListener('click', async () => {
    const ok = await copyText(modelId, '模型 ID');
    if (ok) {
      btn.dataset.copied = 'true';
      hint.textContent = '✓ 已复制';
      setTimeout(() => {
        btn.dataset.copied = 'false';
        hint.textContent = '⧉ 复制';
      }, 1800);
    }
  });
  return btn;
}

function renderMatrixRow(row) {
  const metric = usageFor(row);
  const st = effectiveModelState(row, metric);
  const tr = el('tr');
  tr.dataset.model = row.id;

  // 1. Model ID + Provider tags
  const th = el('th');
  th.scope = 'row';
  const idRow = el('div', undefined, 'model-id-row');
  idRow.append(makeCopyableModelButton(row.id));
  th.append(idRow);

  const sub = el('div', undefined, 'sub-tags');
  for (const pk of displayProviderKeys(row)) {
    sub.append(el('span', `${brand(pk).icon} ${brand(pk).name}`, 'provider-pill'));
  }
  if (isModelOnline(row)) {
    sub.append(el('span', `可用 ${row.ready}/${row.total - (row.disabled || 0)}`, 'channel-hint'));
  }
  if (metric.lastUsedMs > 0) {
    sub.append(agoText(metric.lastUsedMs, '最近 ', 'span', 'channel-hint'));
  }
  if (row.retry_at && st === 'cooldown') {
    sub.append(waitText(row.retry_at, '冷却 ', 'span', 'channel-hint'));
  }
  th.append(sub);
  tr.append(th);

  // 2. Status badge
  const tdState = el('td');
  tdState.dataset.label = '当前状态';
  tdState.append(badge(st));
  tr.append(tdState);

  // 3. 4h Heatmap
  const tdPulse = el('td', undefined, 'pulse-cell');
  tdPulse.append(buildHeatmap(metric.recent, MATRIX_SLOTS, true));
  const cap = el('div', undefined, 'pulse-caption');
  cap.append(el('span', '4 小时前'), el('span', metric.recentSuccess + metric.recentFailed > 0 ? `近4h ${metric.recentSuccess}成/${metric.recentFailed}败` : '近4h 静默'), el('span', '现在'));
  tdPulse.append(cap);
  tr.append(tdPulse);

  // 4. Period rate & volume
  const tdRate = el('td');
  tdRate.dataset.label = `${PERIOD_LABELS[selectedPeriod()]}调用`;
  const rWrap = el('div', undefined, 'rate-wrap');
  const rateVal = metric.total ? (metric.success / metric.total) * 100 : null;
  const rPill = el('span', rateVal !== null ? `${rateVal.toFixed(1)}%` : '—', 'rate-pill');
  rPill.dataset.tier = rateTier(rateVal);
  rWrap.append(
    rPill,
    el('span', `${metric.total.toLocaleString('zh-CN')} 次 (${metric.success}成 / ${metric.failed}败)`, 'rate-sub')
  );
  tdRate.append(rWrap);
  tr.append(tdRate);

  // 5. Speed & TTFT
  const tdPerf = el('td');
  tdPerf.dataset.label = '响应速度';
  const pWrap = el('div', undefined, 'perf-wrap');
  const tps = metric.output_ms ? `${((metric.output_tokens / metric.output_ms) * 1000).toFixed(1)} tok/s` : '—';
  const ttft = metric.ttft_samples ? `首字 ${(metric.ttft_ms / metric.ttft_samples / 1000).toFixed(2)} s` : '暂无流式样本';
  pWrap.append(el('span', tps, 'perf-main'), el('span', ttft, 'perf-sub'));
  tdPerf.append(pWrap);
  tr.append(tdPerf);

  return tr;
}

function renderModelCard(row) {
  const metric = usageFor(row);
  const st = effectiveModelState(row, metric);
  const card = el('article', undefined, 'card model-card');
  card.dataset.model = row.id;

  const heading = el('div', undefined, 'card-heading');
  const titleBox = el('div');
  const cardMeta = el('p', `提供商：${displayProviderKeys(row).map(p => brand(p).name).join(' / ')} · ${PERIOD_LABELS[selectedPeriod()]} ${metric.total.toLocaleString('zh-CN')} 次`, 'card-meta');
  if (metric.lastUsedMs > 0) {
    cardMeta.append(document.createTextNode(' · '), agoText(metric.lastUsedMs, '最近 ', 'span', ''));
  }
  titleBox.append(makeCopyableModelButton(row.id), cardMeta);
  heading.append(titleBox, badge(st));
  card.append(heading);

  const rateVal = metric.total ? `${((metric.success / metric.total) * 100).toFixed(1)}%` : '—';
  const numbers = el('div', undefined, 'model-numbers');
  for (const [label, val] of [['成功率', rateVal], ['成功', metric.success.toLocaleString('zh-CN')], ['失败', metric.failed.toLocaleString('zh-CN')]]) {
    const col = el('div');
    col.append(el('span', label), el('strong', val));
    numbers.append(col);
  }
  card.append(numbers, buildHeatmap(metric.recent, MATRIX_SLOTS, true));
  const note = el('div', undefined, 'history-note');
  note.append(el('span', '过去 4 小时 · 每格 5 分钟'), el('span', '现在'));
  card.append(note);

  const perf = el('div', undefined, 'model-performance');
  const pLine = (k, v) => { const p = el('p'); p.append(el('span', k), el('strong', v)); return p; };
  perf.append(
    pLine('近期平均首字延迟', metric.ttft_samples ? `${(metric.ttft_ms / metric.ttft_samples / 1000).toFixed(2)} s` : '暂无样本'),
    pLine('近期平均输出速度', metric.output_ms ? `${((metric.output_tokens / metric.output_ms) * 1000).toFixed(1)} tok/s` : '暂无样本')
  );
  card.append(perf);

  const foot = el('div', undefined, 'model-foot');
  foot.append(el('p', `可用渠道 ${row.ready} · 冷却 ${row.cooldown} · 总关联 ${row.total}`));
  if (row.retry_at) foot.append(waitText(row.retry_at, `最早冷却恢复：${fmtDate(row.retry_at)} · `, 'p'));
  card.append(foot);
  return card;
}

function renderQuotaWindow(w) {
  const box = el('div', undefined, 'quota-window');
  const head = el('div', undefined, 'window-heading');
  head.append(el('span', w.label), el('span', '剩余配额'));
  box.append(head);

  const val = el('div', undefined, 'window-value');
  val.append(el('strong', `${w.remaining}%`));
  if (w.reset_at) val.append(el('span', `${fmtDate(w.reset_at)} 重置 ·`), waitText(w.reset_at));
  box.append(val);

  const meter = el('div', undefined, 'meter');
  meter.dataset.level = w.remaining <= 5 ? 'empty' : w.remaining < 35 ? 'low' : 'normal';
  meter.style.setProperty('--value', `${Math.min(100, Math.max(0, w.remaining))}%`);
  meter.append(el('span'));
  box.append(meter);
  return box;
}

const quotaErrorText = code =>
  code === 'authorization_unavailable' ? '上游额度授权失效，已暂停自动探测。' :
  code === 'upstream_busy' ? '上游暂时限流，稍后自动恢复。' :
  code === 'not_observed' ? '上游未返回量化配额。' : '额度暂未响应，保留上次记录。';

function renderAccountCard(row) {
  const card = el('article', undefined, 'card account-card');
  card.dataset.account = row.id;
  const isApi = row.kind === 'api_key';
  const b = brand(row.provider);

  const heading = el('div', undefined, 'card-heading');
  const titleWrap = el('div');
  const title = el('h2', undefined, 'card-title account-title');
  title.append(
    el('span', b.icon, 'provider-monogram'),
    el('span', isApi ? (row.channel_name || b.name) : (row.masked_email || `${b.name} · ${row.id.toUpperCase()}`)),
    el('span', isApi ? 'API 渠道' : 'OAuth', 'kind-tag')
  );
  const metaParts = [b.name, `ID ${row.id.toUpperCase()}`, `${row.models ?? 0} 个模型`];
  if (isApi && row.keys_count) metaParts.push(`${row.keys_count} 把密钥`);
  if (isApi && row.prefix) metaParts.push(`前缀 ${row.prefix}/*`);
  titleWrap.append(title, el('p', metaParts.join(' · '), 'card-meta'));
  heading.append(titleWrap, badge(row.state));
  card.append(heading);

  const counts = accountPeriodCounts(row);
  const totalReq = (counts.success || 0) + (counts.failed || 0);
  const rateStr = totalReq ? `成功率 ${((counts.success / totalReq) * 100).toFixed(1)}%` : '该周期暂无调用';
  const lastMs = accountLastUsedMs(row);
  const reqLine = el('div', undefined, 'request-line');
  const leftReqSpan = el('span', `${PERIOD_LABELS[selectedPeriod()]}请求 · ${rateStr}`);
  if (lastMs > 0) {
    leftReqSpan.append(document.createTextNode(' · '), agoText(lastMs, '最近 ', 'span', ''));
  }
  const totalsNode = el('span');
  totalsNode.append(el('b', `成功 ${(counts.success || 0).toLocaleString('zh-CN')}`), el('em', `失败 ${(counts.failed || 0).toLocaleString('zh-CN')}`));
  reqLine.append(leftReqSpan, totalsNode);
  card.append(reqLine);

  if (!isApi) {
    card.append(buildHeatmap(row.recent_requests || [], 20, true));
    const hNote = el('div', undefined, 'history-note');
    hNote.append(el('span', '近期 10 分钟/格'), el('span', '现在'));
    card.append(hNote);
  }

  const box = el('div', undefined, 'quota-box');
  if (isApi) {
    const planLine = el('p', undefined, 'plan-line');
    planLine.append(el('strong', '自定义 API 接入渠道'), el('span', row.state === 'disabled' ? '当前已在后台停用' : '实时参与负载均衡调度'));
    box.append(planLine);
    if (row.preview_models?.length) {
      const chips = el('div', undefined, 'model-chips');
      for (const mid of row.preview_models) {
        const chip = el('button', mid, 'model-chip');
        chip.type = 'button';
        chip.title = `点击复制模型 ID：${mid}`;
        chip.addEventListener('click', () => copyText(mid, '模型 ID'));
        chips.append(chip);
      }
      box.append(chips);
    }
  } else {
    const quota = row.quota || {};
    const planLine = el('p', undefined, 'plan-line');
    const pSpan = el('span');
    pSpan.append(document.createTextNode('套餐 '), el('strong', quota.plan || '标准订阅'));
    planLine.append(pSpan);
    if (quota.renew_at) planLine.append(waitText(quota.renew_at, `续期 ${fmtDate(quota.renew_at)} · `));
    if (typeof quota.credits === 'number') planLine.append(el('span', `Credits ${quota.credits}`));
    if (quota.pay_as_you_go) planLine.append(el('span', quota.pay_as_you_go.enabled ? `按量封顶 $${quota.pay_as_you_go.cap_usd}` : '按量未开启'));
    box.append(planLine);

    if (quota.windows?.length) {
      for (const w of quota.windows) box.append(renderQuotaWindow(w));
    } else {
      box.append(el('p', row.state === 'disabled' ? '已停用凭证不主动查询上游配额。' : quota.supported ? '暂未读取到量化剩余百分比，可点击下方刷新。' : '该类型凭证暂无公开配额接口。', 'unobserved'));
    }

    if (quota.product_usage?.length) {
      const bd = el('div', undefined, 'quota-breakdown');
      bd.append(el('p', '共享配额明细'));
      for (const u of quota.product_usage) {
        const l = el('div');
        l.append(el('span', u.product), el('strong', `已用 ${u.used_percent}%`));
        bd.append(l);
      }
      box.append(bd);
    }

    if (row.retry_at) box.append(waitText(row.retry_at, `冷却至 ${fmtDate(row.retry_at)} · `, 'p', 'card-meta'));
    if (quota.error) box.append(el('p', quotaErrorText(quota.error), 'quota-error'));

    const footer = el('div', undefined, 'quota-footer');
    footer.append(el('span', quota.observed_at ? `观测于 ${fmtDate(quota.observed_at)}` : '尚未探测配额', 'quota-age'));
    const qBtn = el('button', undefined, 'quota-refresh');
    qBtn.type = 'button';
    qBtn.dataset.quotaId = row.id;
    qBtn.dataset.next = quota.next_refresh_at || '';
    qBtn.dataset.supported = String(Boolean(quota.supported));
    qBtn.addEventListener('click', () => refreshQuota(row.id));
    footer.append(qBtn);
    box.append(footer);
  }

  card.append(box);
  return card;
}

function sortRows(rows, mode) {
  const order = $('sort').value;
  const fallback = mode === 'models' ? compareModels : compareAccounts;
  return [...rows].sort((a, b) => {
    const rankA = mode === 'models' ? (RANK_EXT[effectiveModelState(a)] ?? 4) : (RANK_EXT[a.state] ?? 4);
    const rankB = mode === 'models' ? (RANK_EXT[effectiveModelState(b)] ?? 4) : (RANK_EXT[b.state] ?? 4);

    if (order === 'name') return a.id.localeCompare(b.id, undefined, { numeric: true });
    if (order === 'latest') {
      const la = mode === 'models' ? usageFor(a).lastUsedMs : accountLastUsedMs(a);
      const lb = mode === 'models' ? usageFor(b).lastUsedMs : accountLastUsedMs(b);
      return lb - la || rankA - rankB || fallback(a, b);
    }
    if (order === 'speed' && mode === 'models') {
      const ma = usageFor(a), mb = usageFor(b);
      const sa = ma.output_ms ? ma.output_tokens / ma.output_ms : -1;
      const sb = mb.output_ms ? mb.output_tokens / mb.output_ms : -1;
      return sb - sa || rankA - rankB || fallback(a, b);
    }
    if (order === 'rate') {
      const ca = mode === 'models' ? usageFor(a) : accountPeriodCounts(a);
      const cb = mode === 'models' ? usageFor(b) : accountPeriodCounts(b);
      const ta = (ca.success || 0) + (ca.failed || 0), tb = (cb.success || 0) + (cb.failed || 0);
      const ra = ta ? ca.success / ta : -1, rb = tb ? cb.success / tb : -1;
      return rankA - rankB || rb - ra || tb - ta || fallback(a, b);
    }
    if (order === 'requests') {
      const volA = mode === 'models' ? usageFor(a).total : ((accountPeriodCounts(a).success || 0) + (accountPeriodCounts(a).failed || 0));
      const volB = mode === 'models' ? usageFor(b).total : ((accountPeriodCounts(b).success || 0) + (accountPeriodCounts(b).failed || 0));
      return rankA - rankB || volB - volA || fallback(a, b);
    }
    if (order === 'quota' && mode === 'accounts') {
      return (a.quota?.windows?.[0]?.remaining ?? 101) - (b.quota?.windows?.[0]?.remaining ?? 101) || fallback(a, b);
    }
    return rankA - rankB || fallback(a, b);
  });
}

function render() {
  if (!data) return;

  const onlyOnline = effectiveOnlineFilter();
  const providerAccounts = data.accounts.filter(matchesProvider);
  const providerModels = data.models.filter(matchesProvider);

  const onlineAccs = providerAccounts.filter(isAccountOnline);
  const readyAccs = providerAccounts.filter(a => a.state === 'ready');
  const cooldownAccs = providerAccounts.filter(a => a.state === 'cooldown');
  const apiReadyCount = readyAccs.filter(a => a.kind === 'api_key').length;
  const oauthReadyCount = readyAccs.length - apiReadyCount;

  $('ready').textContent = `${readyAccs.length} / ${onlineAccs.length || providerAccounts.length}`;
  const readyParts = [];
  if (apiReadyCount) readyParts.push(`${apiReadyCount} API 渠道`);
  if (oauthReadyCount) readyParts.push(`${oauthReadyCount} OAuth`);
  if (cooldownAccs.length) readyParts.push(`${cooldownAccs.length} 冷却`);
  const disabledAccCount = providerAccounts.length - onlineAccs.length;
  if (disabledAccCount) readyParts.push(`${disabledAccCount} 停用`);
  $('ready-note').textContent = readyParts.join(' · ') || '当前筛选无渠道';

  const onlineModels = providerModels.filter(isModelOnline);
  const archivedModelsCount = providerModels.length - onlineModels.length;
  $('model-count').textContent = String(onlineModels.length);
  $('model-coverage').textContent = archivedModelsCount > 0
    ? `在线可用 · 另有 ${archivedModelsCount} 个历史归档`
    : '全部关联渠道实时汇总';

  // Period success rate & live speed across providerModels
  const activeMetrics = (onlyOnline ? onlineModels : providerModels).map(m => usageFor(m));
  const sumOk = activeMetrics.reduce((n, m) => n + m.success, 0);
  const sumBad = activeMetrics.reduce((n, m) => n + m.failed, 0);
  const sumAll = sumOk + sumBad;
  $('success-rate').textContent = sumAll ? `${((sumOk / sumAll) * 100).toFixed(1)}%` : '—';
  $('success-note').textContent = `${PERIOD_LABELS[selectedPeriod()]} ${sumAll.toLocaleString('zh-CN')} 次调用 (${sumOk.toLocaleString('zh-CN')} 成功)`;

  const totalOutTokens = activeMetrics.reduce((n, m) => n + m.output_tokens, 0);
  const totalOutMs = activeMetrics.reduce((n, m) => n + m.output_ms, 0);
  const totalTtftMs = activeMetrics.reduce((n, m) => n + m.ttft_ms, 0);
  const totalTtftSamples = activeMetrics.reduce((n, m) => n + m.ttft_samples, 0);
  $('perf-speed').textContent = totalOutMs > 0 ? `${((totalOutTokens / totalOutMs) * 1000).toFixed(1)} tok/s` : '—';
  $('perf-ttft').textContent = totalTtftSamples > 0
    ? `平均首字 ${(totalTtftMs / totalTtftSamples / 1000).toFixed(2)} s (${totalTtftSamples} 样本)`
    : '等待近期流式推理样本';

  const visibleModels = sortRows(data.models.filter(r => matchesSearchAndState(r, 'models')), 'models');
  const visibleAccounts = sortRows(data.accounts.filter(r => matchesSearchAndState(r, 'accounts')), 'accounts');

  $('models-count').textContent = String(onlyOnline ? onlineModels.length : providerModels.length);
  $('accounts-count').textContent = String(onlyOnline ? onlineAccs.length : providerAccounts.length);
  $('updated').textContent = `更新于 ${fmtDate(data.updated_at)}`;

  $('layout-switch').hidden = view !== 'models';
  $('sort').querySelector('[value="quota"]').disabled = view === 'models';
  $('sort').querySelector('[value="speed"]').disabled = view !== 'models';

  if (view === 'models') {
    const isMatrix = layout === 'matrix';
    $('models-matrix-wrap').hidden = !isMatrix || visibleModels.length === 0;
    $('models-cards').hidden = isMatrix || visibleModels.length === 0;
    if (isMatrix) {
      $('models-tbody').replaceChildren(...visibleModels.map(renderMatrixRow));
      $('models-cards').replaceChildren();
    } else {
      $('models-cards').replaceChildren(...visibleModels.map(renderModelCard));
      $('models-tbody').replaceChildren();
    }
    $('models-empty').hidden = visibleModels.length > 0;
    $('result-count').textContent = `显示 ${visibleModels.length} 个模型`;
  } else {
    $('accounts-cards').replaceChildren(...visibleAccounts.map(renderAccountCard));
    $('accounts-empty').hidden = visibleAccounts.length > 0;
    $('result-count').textContent = `显示 ${visibleAccounts.length} 个渠道 / 凭证`;
  }

  const hiddenCount = view === 'models' ? archivedModelsCount : disabledAccCount;
  const banner = $('archive-banner');
  if (onlyOnline && hiddenCount > 0) {
    banner.hidden = false;
    banner.textContent = view === 'models'
      ? `已自动折叠 ${hiddenCount} 个历史下线/已停用模型 · 点击展开全部记录`
      : `已自动折叠 ${hiddenCount} 个已停用渠道/旧凭证 · 点击展开全部记录`;
  } else {
    banner.hidden = true;
  }

  const coverage = data.recorded_usage;
  const beijing = value => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
  let note = '全渠道（OAuth 凭证 + 自定义 API 提供商）每 5 分钟自动同步，零额外探针 Token 消耗。';
  if (coverage?.since) note += ` 历史计数按北京时间统计（起自 ${beijing(coverage.since)}）。`;
  $('method-note').textContent = note;

  updateCountdown();
}

function updateCountdown() {
  if (document.hidden) return;
  for (const node of document.querySelectorAll('[data-wait-at]')) {
    node.textContent = (node.dataset.waitPrefix || '') + when(node.dataset.waitAt);
  }
  for (const node of document.querySelectorAll('[data-ago-ms]')) {
    node.textContent = (node.dataset.agoPrefix || '') + relativeAgo(Number(node.dataset.agoMs));
  }
  const remaining = Math.max(0, Math.ceil((nextRefresh - Date.now()) / 1000));
  $('refresh').disabled = busy || remaining > 0;
  $('refresh-countdown').textContent = busy ? '正在同步…' : remaining ? `${remaining}s 后可手动刷新` : '可立即刷新 · 5m 自动同步';

  for (const button of document.querySelectorAll('[data-quota-id]')) {
    const left = Math.max(0, Math.ceil((Date.parse(button.dataset.next || '') - Date.now()) / 1000)) || 0;
    const id = button.dataset.quotaId;
    button.disabled = quotaBusy.has(id) || left > 0 || button.dataset.supported !== 'true';
    button.textContent = quotaBusy.has(id) ? '查询中…' : left ? `${left}s 后可查` : button.dataset.supported === 'true' ? '↻ 刷新额度' : '无配额接口';
  }
}

async function refreshQuota(id) {
  if (quotaBusy.has(id)) return;
  const row = data?.accounts.find(x => x.id === id);
  if (!row || Date.parse(row.quota?.next_refresh_at || '') > Date.now()) return;
  quotaBusy.add(id);
  updateCountdown();
  try {
    const response = await fetch(`/api/pool-status/quota?id=${encodeURIComponent(id)}`, { credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(25000) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || '额度暂时查询失败。');
    if (body.id !== id || !Array.isArray(body.quota?.windows)) throw new Error('额度返回格式异常。');
    row.quota = body.quota;
    notify(body.quota.error ? quotaErrorText(body.quota.error) : '✓ 账号实时额度已更新');
    render();
  } catch (error) {
    notify(error.name === 'TimeoutError' ? '上游额度查询超时，请稍后再试。' : error.message);
  } finally {
    quotaBusy.delete(id);
    updateCountdown();
  }
}

async function refresh() {
  if (busy || document.hidden || Date.now() < nextRefresh) return;
  busy = true;
  updateCountdown();
  controller?.abort();
  controller = new AbortController();
  const timeout = setTimeout(() => controller?.abort(), 25000);
  try {
    const response = await fetch('/api/pool-status', { credentials: 'omit', cache: 'no-store', signal: controller.signal });
    const snapshot = await response.json();
    if (!response.ok) {
      nextRefresh = Date.now() + Math.max(60, Number(snapshot.retry_after) || 300) * 1000;
      throw new Error(snapshot.error || '暂时无法连接号池监控。');
    }
    if (!Array.isArray(snapshot.models) || !Array.isArray(snapshot.accounts) || !Array.isArray(snapshot.providers)) {
      throw new Error('号池数据格式异常。');
    }
    data = snapshot;
    nextRefresh = Date.now() + Math.max(60, Number(snapshot.refresh_after) || 300) * 1000;
    renderProviders();
    render();
    const onlineChannels = snapshot.accounts.filter(isAccountOnline).length;
    const onlineModels = snapshot.models.filter(isModelOnline).length;
    $('live-dot').dataset.error = String(Boolean(snapshot.stale));
    $('status-note').dataset.error = String(Boolean(snapshot.stale));
    $('status-note').textContent = snapshot.stale
      ? '监控节点连接短暂波动，当前展示最近一次快照。'
      : `已同步全量渠道 · ${onlineChannels} 个活跃渠道 · ${onlineModels} 个在线模型 · 点击模型名即可复制 ID`;
  } catch (error) {
    if (error.name !== 'AbortError' || !document.hidden) {
      $('live-dot').dataset.error = 'true';
      $('status-note').dataset.error = 'true';
      $('status-note').textContent = error instanceof TypeError ? '网络连接失败，稍后自动重试。' : error.name === 'AbortError' ? '读取超时，稍后自动重试。' : error.message;
    }
    nextRefresh = Math.max(nextRefresh, Date.now() + 120000);
  } finally {
    clearTimeout(timeout);
    busy = false;
    updateCountdown();
  }
}

// Event bindings
for (const mode of ['models', 'accounts']) {
  $(mode + '-tab').addEventListener('click', () => {
    view = mode;
    for (const type of ['models', 'accounts']) {
      $(type + '-tab').setAttribute('aria-selected', String(type === mode));
      $(type + '-view').hidden = type !== mode;
    }
    $('search').placeholder = mode === 'models' ? '搜索模型 ID（点击模型名可一键复制）或提供商…' : '搜索渠道名称、脱敏邮箱或模型…';
    if (data) { renderProviders(); render(); }
  });
}

function setLayout(next) {
  layout = next === 'cards' ? 'cards' : 'matrix';
  $('layout-matrix').setAttribute('aria-pressed', String(layout === 'matrix'));
  $('layout-cards').setAttribute('aria-pressed', String(layout === 'cards'));
  try { localStorage.setItem('lmg-pool-layout', layout); } catch {}
  if (data) render();
}

$('layout-matrix').addEventListener('click', () => setLayout('matrix'));
$('layout-cards').addEventListener('click', () => setLayout('cards'));

$('online-only').addEventListener('click', () => {
  onlineOnly = !onlineOnly;
  $('online-only').setAttribute('aria-pressed', String(onlineOnly));
  if (data) { renderProviders(); render(); }
});

$('archive-banner').addEventListener('click', () => {
  onlineOnly = false;
  $('online-only').setAttribute('aria-pressed', 'false');
  if (data) { renderProviders(); render(); }
});

$('copy-endpoint').addEventListener('click', () => copyText(API_BASE_URL, ' API 接口地址'));

for (const field of ['state-filter', 'sort']) {
  $(field).addEventListener('change', () => { if (data) { renderProviders(); render(); } });
}
$('usage-period').addEventListener('change', () => { if (data) { renderProviders(); render(); } });
$('search').addEventListener('input', () => { if (data) render(); });
$('refresh').addEventListener('click', refresh);

try {
  if (localStorage.getItem('lmg-pool-theme') === 'dark') document.documentElement.dataset.theme = 'dark';
  if (localStorage.getItem('lmg-pool-layout') === 'cards') setLayout('cards');
} catch {}

$('theme').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme !== 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  try { localStorage.setItem('lmg-pool-theme', dark ? 'dark' : 'light'); } catch {}
});

function startTimer() {
  clearInterval(timer);
  timer = setInterval(() => {
    if (document.hidden) return;
    updateCountdown();
    if (!busy && Date.now() >= nextRefresh) void refresh();
  }, 1000);
}

startTimer();
document.addEventListener('visibilitychange', () => {
  if (document.hidden) controller?.abort();
  else { updateCountdown(); if (Date.now() >= nextRefresh) void refresh(); }
});
window.addEventListener('pagehide', () => { clearInterval(timer); controller?.abort(); });
window.addEventListener('pageshow', startTimer);
void refresh();
