const $ = id => document.getElementById(id);
const labels = { ready: '可用', cooldown: '冷却中', error: '暂不可用', disabled: '已停用', unknown: '未观测' };
let data, view = 'models', busy = false, nextRefresh = 0, controller;
const modelState = row => row.ready ? 'ready' : row.cooldown ? 'cooldown' : row.error ? 'error' : row.disabled ? 'disabled' : 'unknown';
const date = value => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—';
function element(tag, text, className) { const node = document.createElement(tag);if(text !== undefined)node.textContent = text;if(className)node.className = className;return node; }
function badge(state) { const node = element('span', labels[state] || labels.unknown, 'badge');node.dataset.state = state;return node; }
function cell(row, value, className) { const td = element('td', undefined, className);td.append(value instanceof Node ? value : document.createTextNode(String(value)));row.append(td); }
function filter(row) {
  const provider = $('provider').value, search = $('search').value.trim().toLowerCase(), state = $('state-filter').value;
  return (!provider || (Array.isArray(row.providers) ? row.providers.includes(provider) : row.provider === provider)) && (!search || `${row.id} ${row.provider || ''}`.toLowerCase().includes(search)) && (!state || (view === 'models' ? modelState(row) : row.state) === state);
}
function render() {
  if (!data) return;
  $('total').textContent = data.totals.total;$('ready').textContent = data.totals.ready;
  $('cooldown').textContent = data.totals.cooldown + data.totals.error;$('model-count').textContent = data.models.length;
  $('model-coverage').textContent = data.models_partial ? '部分账号模型列表暂不可用' : '来自账号模型列表';
  $('updated').textContent = `更新时间：${date(data.updated_at)}`;
  const models = data.models.filter(filter), accounts = data.accounts.filter(filter);
  const modelRows = models.map(item => { const tr = element('tr');cell(tr, item.id);cell(tr, badge(modelState(item)));cell(tr, `${item.ready} / ${item.total}`);cell(tr, item.providers.join(' · '), 'muted');cell(tr, date(item.retry_at), 'muted');return tr; });
  const accountRows = accounts.map(item => {
    const tr = element('tr');cell(tr, `#${item.id}`);cell(tr, item.provider);cell(tr, badge(item.state));cell(tr, item.models ?? '未读取');
    const values = [];
    if (typeof item.quota?.primary_remaining === 'number') values.push(`窗口一 ${item.quota.primary_remaining}%`);
    if (typeof item.quota?.secondary_remaining === 'number') values.push(`窗口二 ${item.quota.secondary_remaining}%`);
    cell(tr, values.length ? values.join(' / ') : '未观测', values.length ? 'quota' : 'muted');cell(tr, date(item.retry_at), 'muted');return tr;
  });
  $('models-body').replaceChildren(...modelRows);$('accounts-body').replaceChildren(...accountRows);
  $('models-empty').hidden = models.length > 0;$('models-empty').textContent = '没有符合筛选条件的模型。';$('accounts-empty').hidden = accounts.length > 0;
  $('result-count').textContent = view === 'models' ? `${models.length} 个模型` : `${accounts.length} 个匿名账号`;
}
function updateData(snapshot) {
  const selected = $('provider').value;
  $('provider').replaceChildren(element('option', '全部提供方'));
  $('provider').firstElementChild.value = '';
  for (const provider of snapshot.providers) { const item = element('option', provider.provider);item.value = provider.provider;$('provider').append(item); }
  $('provider').value = selected;
  $('provider-summary').replaceChildren(...snapshot.providers.map(item => { const node = element('span', undefined, 'provider-chip');node.append(document.createTextNode(item.provider), element('b', `${item.ready}/${item.total}`));return node; }));
  data = snapshot;render();
}
async function refresh() {
  if (busy || document.hidden) return;
  busy = true;$('refresh').disabled = true;controller?.abort();controller = new AbortController();
  try {
    const response = await fetch('/api/pool-status', { cache: 'no-store', credentials: 'omit', signal: controller.signal });
    let snapshot;
    try { snapshot = await response.json(); } catch { throw new Error('网络暂时不可用，请稍后刷新。'); }
    if (!response.ok) throw new Error(snapshot.error || '暂时无法读取号池。');
    if (snapshot.schema !== 1 || !Array.isArray(snapshot.models) || !Array.isArray(snapshot.accounts)) throw new Error('状态返回格式不正确，请稍后刷新。');
    updateData(snapshot);$('status-note').dataset.error = String(Boolean(snapshot.stale));
    $('status-note').textContent = snapshot.stale ? 'CPA 暂未响应，正在展示上次成功读取的状态。' : `● 已连接 CPA · ${snapshot.totals.disabled} 个已停用 · ${snapshot.successful} 次成功 / ${snapshot.failed} 次失败记录`;
  } catch (error) {
    if (error.name !== 'AbortError') { $('status-note').dataset.error = 'true';$('status-note').textContent = error instanceof TypeError ? '网络连接暂时失败，可稍后刷新。' : error.message;if(!data)$('models-empty').textContent = '暂未读取到状态。'; }
  } finally { busy = false;$('refresh').disabled = false;nextRefresh = Date.now() + 30000; }
}
for (const mode of ['models', 'accounts']) $(mode + '-tab').addEventListener('click', () => {
  view = mode;
  for (const type of ['models', 'accounts']) { $(type + '-tab').setAttribute('aria-selected', String(type === mode));$(type + '-view').hidden = type !== mode; }
  $('search').placeholder = mode === 'models' ? '搜索模型名称…' : '搜索账号编号或提供方…';render();
});
for (const field of ['provider', 'state-filter']) $(field).addEventListener('change', render);
$('search').addEventListener('input', render);$('refresh').addEventListener('click', refresh);
setInterval(() => { if(document.hidden)return;if(busy){$('refresh-countdown').textContent='正在更新…';return;}const remaining=Math.max(0,Math.ceil((nextRefresh-Date.now())/1000));$('refresh-countdown').textContent=`${remaining} 秒后更新`;if(!remaining)refresh(); },1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden && Date.now()>=nextRefresh)refresh();});
window.addEventListener('pagehide',()=>controller?.abort());
refresh();
