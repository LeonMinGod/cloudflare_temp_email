const $ = id => document.getElementById(id);

let data = null;
let activeFilter = 'all';

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = String(text);
  if (className) node.className = className;
  return node;
}

function fmtBeijing(iso) {
  const ms = Date.parse(iso || '');
  if (!Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function relativeAgo(iso) {
  const ms = Date.parse(iso || '');
  if (!Number.isFinite(ms)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSec < 60) return '刚刚';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days} 天前`;
  return fmtBeijing(iso);
}

function applyTheme(theme) {
  const isLight = theme === 'light';
  document.documentElement.dataset.theme = isLight ? 'light' : 'dark';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = isLight ? '#f6f4ef' : '#090d16';
  try { localStorage.setItem('lmg_shame_theme', isLight ? 'light' : 'dark'); } catch {}
}

function initTheme() {
  let saved = '';
  try { saved = localStorage.getItem('lmg_shame_theme') || ''; } catch {}
  applyTheme(saved === 'light' ? 'light' : 'dark');
  $('theme').addEventListener('click', () => {
    const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    applyTheme(current === 'light' ? 'dark' : 'light');
  });
}

function isPermanentEntry(entry) {
  return entry.status === 'permanent_ban' || entry.status === 'key_revoked' || entry.status === 'temp_ban';
}

function matchesControls(entry) {
  if (activeFilter === 'permanent' && !isPermanentEntry(entry)) return false;
  if (activeFilter === 'revoked' && !entry.key_revoked) return false;
  if (activeFilter === 'warning' && entry.status !== 'warning') return false;

  const q = $('search').value.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    entry.username,
    entry.masked_email,
    entry.masked_ip,
    entry.rank_title,
    entry.rule_badge,
    entry.rule_title,
    entry.detail,
    entry.evidence,
    entry.punishment,
  ].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q);
}

function sortEntries(entries) {
  const mode = $('sort').value;
  const rank = e => (e.key_revoked && e.ip_banned ? 0 : e.status === 'permanent_ban' ? 1 : e.status === 'key_revoked' ? 2 : e.status === 'temp_ban' ? 3 : 4);
  const ts = e => Date.parse(e.banned_at || e.last_strike_at || '') || 0;
  return [...entries].sort((a, b) => {
    if (mode === 'recent') return ts(b) - ts(a) || rank(a) - rank(b);
    if (mode === 'hits') return (b.blocked_hits || 0) - (a.blocked_hits || 0) || rank(a) - rank(b);
    if (mode === 'strikes') return (b.strikes || 0) - (a.strikes || 0) || ts(b) - ts(a);
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    if (a.status === 'warning') {
      return (b.strikes || 0) - (a.strikes || 0) || ts(b) - ts(a);
    }
    return (b.blocked_hits || 0) - (a.blocked_hits || 0) || ts(b) - ts(a);
  });
}

function buildStrikePips(strikes, limit, tone) {
  const wrap = el('span', undefined, 'strike-pips');
  const max = Math.max(1, limit || 3);
  const count = Math.min(max, Math.max(0, strikes || 0));
  for (let i = 0; i < max; i++) {
    const pip = el('i', undefined, i < count ? `pip filled ${tone}` : 'pip');
    wrap.append(pip);
  }
  wrap.append(el('span', `${strikes || 0}/${max}`));
  return wrap;
}

function renderPermanentCard(entry) {
  const isDual = Boolean(entry.key_revoked && entry.ip_banned);
  const card = el('article', undefined, 'shame-card');
  if (isDual) card.dataset.dual = 'true';

  const top = el('div', undefined, 'card-top');
  const idBox = el('div', undefined, 'identity');
  if (entry.rank_title) {
    idBox.append(el('p', entry.rank_title, 'rank-kicker'));
  }

  const title = el('h3', entry.username || entry.masked_email || entry.masked_ip || '匿名违规主体', entry.username ? 'subject-name' : 'subject-name mono');
  idBox.append(title);

  const pills = el('div', undefined, 'id-pills');
  if (entry.masked_ip) {
    const familyLabel = entry.ip_family === 'ipv6_subnet' ? 'IPv6/64' : entry.ip_family === 'ipv6' ? 'IPv6' : 'IP';
    pills.append(el('span', `${familyLabel} ${entry.masked_ip}`, 'id-pill ip'));
  }
  if (entry.masked_email) {
    pills.append(el('span', entry.masked_email, 'id-pill'));
  }
  if (pills.childElementCount) idBox.append(pills);

  const stampText = isDual ? '双封 · 密钥+IP' : entry.key_revoked ? '密钥永封' : entry.permanent ? 'IP 永封' : '临时封禁';
  const stamp = el('span', stampText, 'seal-stamp');
  if (isDual) stamp.dataset.dual = 'true';

  top.append(idBox, stamp);
  card.append(top);

  const offense = el('div', undefined, 'offense-box');
  const offHead = el('div', undefined, 'offense-head');
  offHead.append(el('span', entry.rule_badge || '违规封禁', 'rule-chip'), el('span', entry.rule_title || '触发安全封禁策略', 'rule-title'));
  offense.append(offHead);

  if (entry.detail) {
    offense.append(el('p', entry.detail, 'offense-detail'));
  }
  if (entry.evidence) {
    offense.append(el('code', `触发特征：${entry.evidence}`, 'evidence-chip'));
  }
  card.append(offense);

  const punish = el('div', undefined, 'punishment-row');
  punish.append(el('span', `处置：${entry.punishment || '永久封禁'}`));
  if (entry.highlight_metric) {
    punish.append(el('span', entry.highlight_metric, 'highlight-metric'));
  } else if (entry.blocked_hits > 0) {
    punish.append(el('span', `累计拦截 ${entry.blocked_hits.toLocaleString('zh-CN')} 次`, 'highlight-metric'));
  }
  card.append(punish);

  const foot = el('div', undefined, 'card-foot');
  const leftFoot = el('span');
  leftFoot.append(buildStrikePips(entry.strikes || (entry.ip_banned ? 3 : 0), entry.strike_limit || 3, 'crimson'));
  const whenStamp = entry.banned_at || entry.last_strike_at;
  const rightFoot = el('span', whenStamp ? `封禁于 ${fmtBeijing(whenStamp)}（北京时间）` : '封禁时间已记录');
  const normalizedMetric = String(entry.highlight_metric || '').replace(/,/g, '');
  if (entry.blocked_hits > 0 && entry.highlight_metric && !normalizedMetric.includes(String(entry.blocked_hits))) {
    rightFoot.textContent += ` · 盾牌拦截 ${entry.blocked_hits.toLocaleString('zh-CN')} 次`;
  }
  foot.append(leftFoot, rightFoot);
  card.append(foot);

  return card;
}

function renderWarningCard(entry, bannedUsers) {
  const card = el('article', undefined, 'warn-card');

  const head = el('div', undefined, 'warn-head');
  const idBox = el('div', undefined, 'warn-identity');
  const hasName = Boolean(entry.username);
  const label = entry.username || entry.masked_email || '未关联落款';
  idBox.append(el('h3', label, hasName ? 'warn-subject' : 'warn-subject anonymous'));

  const pills = el('div', undefined, 'id-pills');
  if (entry.masked_ip) {
    pills.append(el('span', `IP ${entry.masked_ip}`, 'id-pill ip'));
  }
  if (entry.masked_email && entry.masked_email !== label) {
    pills.append(el('span', entry.masked_email, 'id-pill'));
  }
  if (entry.username && bannedUsers.has(entry.username)) {
    pills.append(el('span', '关联永封落款', 'id-pill linked-ban'));
  }
  if (pills.childElementCount) idBox.append(pills);

  head.append(idBox, el('span', `黄牌 ${entry.strikes}/${entry.strike_limit}`, 'warn-badge'));
  card.append(head);

  const rule = el('p', undefined, 'warn-rule');
  rule.append(el('span', entry.rule_badge || '破限拦截', 'warn-tag'), el('span', entry.rule_title || '触发安全规则'));
  card.append(rule);

  if (entry.evidence) {
    card.append(el('code', entry.evidence, 'evidence-chip'));
  }

  const foot = el('div', undefined, 'warn-foot');
  const remaining = Math.max(1, (entry.strike_limit || 3) - (entry.strikes || 0));
  const left = el('span');
  left.append(buildStrikePips(entry.strikes, entry.strike_limit, 'amber'));
  const right = el('span', `${remaining === 1 ? '再犯 1 次即永封' : `余 ${remaining} 次机会`} · ${relativeAgo(entry.last_strike_at) || fmtBeijing(entry.last_strike_at)}`);
  right.title = `最近触发：${fmtBeijing(entry.last_strike_at)}（北京时间）`;
  foot.append(left, right);
  card.append(foot);

  return card;
}

function renderRules(rules) {
  const grid = $('rules-grid');
  grid.replaceChildren(...(rules || []).map(rule => {
    const card = el('article', undefined, 'rule-card');
    card.append(el('h3', rule.title), el('p', rule.penalty));
    return card;
  }));
}

function render() {
  if (!data) return;

  const entries = data.entries || [];
  const permanentAll = entries.filter(isPermanentEntry);
  const revokedAll = entries.filter(e => e.key_revoked);
  const warningAll = entries.filter(e => e.status === 'warning');
  const bannedUsers = new Set(permanentAll.map(e => e.username).filter(Boolean));

  $('stat-permanent').textContent = String(data.totals?.permanent_bans ?? permanentAll.length);
  $('stat-permanent-note').textContent = `含 ${data.totals?.revoked_keys ?? revokedAll.length} 个永久吊销密钥账号`;

  $('stat-warning').textContent = String(data.totals?.active_strikes ?? warningAll.length);
  const nearBan = warningAll.filter(e => (e.strike_limit || 3) - (e.strikes || 0) <= 1).length;
  $('stat-warning-note').textContent = nearBan > 0 ? `其中 ${nearBan} 条已达 2/3 劫，再犯即永封` : '累计 3 次触发自动永封';

  $('stat-hits').textContent = (data.totals?.total_blocked_hits ?? 0).toLocaleString('zh-CN');
  $('stat-hits-note').textContent = 'Prompt Guard 边缘盾累计拦截';

  const vpsOk = Boolean(data.sources?.vps_guard);
  $('stat-source').textContent = '每日一更';
  $('stat-updated').textContent = `更新于 ${fmtBeijing(data.observed_at)}（北京时间）`;
  $('sync-stamp').textContent = `今日快照 · ${fmtBeijing(data.observed_at)}（北京时间）`;

  $('count-all').textContent = String(entries.length);
  $('count-permanent').textContent = String(permanentAll.length);
  $('count-revoked').textContent = String(revokedAll.length);
  $('count-warning').textContent = String(warningAll.length);

  const visible = sortEntries(entries.filter(matchesControls));
  const visiblePerm = visible.filter(isPermanentEntry);
  const visibleWarn = visible.filter(e => e.status === 'warning');

  $('permanent-section').hidden = visiblePerm.length === 0;
  $('warning-section').hidden = visibleWarn.length === 0;
  $('permanent-grid').replaceChildren(...visiblePerm.map(renderPermanentCard));
  $('warning-grid').replaceChildren(...visibleWarn.map(e => renderWarningCard(e, bannedUsers)));
  $('board-empty').hidden = visible.length > 0;

  renderRules(data.rules);

  const note = $('status-note');
  const dot = $('live-dot');
  if (vpsOk) {
    note.dataset.error = 'false';
    dot.dataset.error = 'false';
    note.textContent = `今日榜单已归档：永久封神 ${permanentAll.length} 席，天劫预警 ${warningAll.length} 席。每日按北京时间自动更新一次，IP 与邮箱均已在服务端脱敏。`;
  } else {
    note.dataset.error = 'true';
    dot.dataset.error = 'true';
    note.textContent = '风控节点暂未响应，当前展示已归档吊销记录，将于次日自动重试同步。';
  }
}

async function load() {
  try {
    const res = await fetch('/api/hall-of-shame', {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
    render();
  } catch {
    $('live-dot').dataset.error = 'true';
    $('status-note').dataset.error = 'true';
    $('status-note').textContent = '封神榜今日快照暂未就绪，请稍后刷新页面重试。';
  }
}

function bindEvents() {
  for (const tab of document.querySelectorAll('.view-tabs [role="tab"]')) {
    tab.addEventListener('click', () => {
      activeFilter = tab.dataset.filter || 'all';
      for (const other of document.querySelectorAll('.view-tabs [role="tab"]')) {
        other.setAttribute('aria-selected', String(other === tab));
      }
      render();
    });
  }
  $('search').addEventListener('input', render);
  $('sort').addEventListener('change', render);
}

initTheme();
bindEvents();
load();
