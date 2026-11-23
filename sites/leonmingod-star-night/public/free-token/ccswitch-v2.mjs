import { normalizeBaseUrl } from './api-endpoint-v1.mjs';
const APPS = Object.freeze({
  claude: { title: 'Claude', format: 'anthropic' },
  codex: { title: 'Codex', format: 'openai_responses' },
  gemini: { title: 'Gemini', format: 'gemini_native' },
  agy: { title: '反重力', format: 'gemini_native' },
});
const API_ORIGIN = 'https://yifu.leonmingod.com';
const AGY_MODEL_RE = /^(?:(?:models|antigravity)\/)?(?:gemini-4-|(?:argon|carbon|hydrogen|neon)(?:-(?:high|xhigh|medium|low))?$)/i;
const AGY_PREFERRED = ['gemini-4-neon-high', 'gemini-4-carbon-high', 'gemini-4-argon-high', 'gemini-4-hydrogen-high', 'gemini-4-neon', 'gemini-4-carbon', 'gemini-4-argon', 'gemini-4-hydrogen', 'neon-high', 'carbon-high', 'argon-high', 'hydrogen-high'];

function sortModelsForApp(ids, targetApp) {
  if (targetApp !== 'agy') return ids;
  const rank = id => {
    const lower = id.toLowerCase();
    const idx = AGY_PREFERRED.indexOf(lower);
    if (idx >= 0) return idx;
    if (AGY_MODEL_RE.test(lower)) return AGY_PREFERRED.length;
    return AGY_PREFERRED.length + 1;
  };
  return [...ids].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'en'));
}

function defaultModelForApp(orderedIds, targetApp) {
  if (targetApp !== 'agy') return '';
  return orderedIds.find(id => AGY_MODEL_RE.test(id)) || '';
}

export function apiEndpoints(baseUrl) {
  const url = new URL(normalizeBaseUrl(baseUrl));
  if (url.origin !== API_ORIGIN || url.username || url.password || url.search || url.hash || !/^\/v1\/?$/.test(url.pathname)) {
    throw new Error('接口地址不正确，请重新打开领取结果。');
  }
  return { root: url.origin, openai: `${url.origin}/v1`, models: `${url.origin}/v1/models` };
}

export function buildImportLink({ app, name, model, baseUrl, apiKey }) {
  if (!Object.hasOwn(APPS, app)) throw new Error('请选择应用。');
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) throw new Error('请填写 1–80 字的配置名称。');
  if (typeof model !== 'string' || !model.trim() || model.length > 256 || /[\u0000-\u001f\u007f]/u.test(model)) throw new Error('请先选择主模型。');
  if (typeof apiKey !== 'string' || !apiKey.trim() || /[\s\u0000-\u001f\u007f]/u.test(apiKey)) throw new Error('请先领取或找回你的 API Key。');
  const endpoints = apiEndpoints(baseUrl);
  const params = new URLSearchParams({
    resource: 'provider', app, name: name.trim(), model,
    endpoint: app === 'codex' ? endpoints.openai : endpoints.root,
    apiKey, apiFormat: APPS[app].format, homepage: 'https://leonmingod.com',
    iconUrl: 'https://leonmingod.com/assets/favicon-v2-32.png', enabled: 'false',
  });
  return `ccswitch://v1/import?${params}`;
}

export async function fetchModels({ baseUrl, apiKey }, { signal, fetcher = globalThis.fetch } = {}) {
  const endpoint = apiEndpoints(baseUrl).models;
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new Error('请先领取或找回你的 API Key。');
  const response = await fetcher(endpoint, {
    method: 'GET', headers: { Authorization: `Bearer ${apiKey}` },
    credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', redirect: 'error', signal,
  });
  if (!response.ok) {
    if ([401, 403].includes(response.status)) throw new Error('这把 Key 暂时无法读取模型，请先确认 Key 可用。');
    if (response.status === 429) throw new Error('模型接口请求较多，请稍后点「重新读取」。');
    throw new Error('模型列表暂时读取失败，请点「重新读取」。');
  }
  let body;
  try { body = await response.json(); } catch { throw new Error('模型接口返回格式不正确，请稍后再试。'); }
  if (!Array.isArray(body?.data)) throw new Error('模型接口返回格式不正确，请稍后再试。');
  const ids = [...new Set(body.data.map(item => item?.id).filter(id => typeof id === 'string' && id.trim() && id.length <= 256 && !/[\u0000-\u001f\u007f]/u.test(id)))];
  if (!ids.length) throw new Error('这把 Key 暂无可用模型。');
  return ids.sort((a, b) => a.localeCompare(b, 'en'));
}

export function installCcSwitch({ button, agyButton, ownerDialog, readCredentials, document: doc = globalThis.document, navigate = link => globalThis.location.assign(link), fetcher = globalThis.fetch }) {
  if ((!button && !agyButton) || !ownerDialog) return;
  const dialog = doc.createElement('dialog');
  dialog.className = 'ccswitch-dialog';
  dialog.setAttribute('aria-labelledby', 'ccswitch-title');
  dialog.innerHTML = `<form class="ccswitch-form">
    <header class="ccswitch-header"><div><p class="ccswitch-eyebrow">连接你的 AI 工具</p><h2 id="ccswitch-title">接入 CC Switch</h2></div><button class="ccswitch-close" type="button" aria-label="关闭 CC Switch 配置">×</button></header>
    <fieldset class="ccswitch-apps"><legend>应用</legend><div class="ccswitch-segments">${Object.entries(APPS).map(([value, app]) => `<label><input type="radio" name="app" value="${value}" ${value === 'codex' ? 'checked' : ''}><span>${app.title}</span></label>`).join('')}</div></fieldset>
    <label class="ccswitch-label" for="ccswitch-name">配置名称</label><input class="ccswitch-input" id="ccswitch-name" name="name" maxlength="80" required autocomplete="off">
    <div class="ccswitch-model-heading"><label class="ccswitch-label" for="ccswitch-model">主模型 <span aria-hidden="true">*</span></label><button class="ccswitch-reload" type="button">重新读取</button></div>
    <select class="ccswitch-input" id="ccswitch-model" name="model" required disabled><option value="">正在读取模型…</option></select>
    <p class="ccswitch-model-note" role="status" aria-live="polite">读取这把 Key 当前可用的模型。</p><p class="ccswitch-error" role="alert" hidden></p>
    <footer class="ccswitch-actions"><button class="ccswitch-cancel" type="button">取消</button><button class="ccswitch-launch" type="submit" disabled>打开 CC Switch <span aria-hidden="true">↗</span></button></footer>
    <p class="ccswitch-help">已安装 CC Switch 时，浏览器会询问是否打开。<a href="https://github.com/farion1231/cc-switch/releases" target="_blank" rel="noopener noreferrer">下载 CC Switch</a><br>导入后由你确认是否启用；手机可复制 Key 后在电脑配置。</p>
  </form>`;
  doc.body.append(dialog);
  const form = dialog.querySelector('form');
  const name = dialog.querySelector('#ccswitch-name');
  const model = dialog.querySelector('#ccswitch-model');
  const error = dialog.querySelector('.ccswitch-error');
  const note = dialog.querySelector('.ccswitch-model-note');
  const launch = dialog.querySelector('.ccswitch-launch');
  const reload = dialog.querySelector('.ccswitch-reload');
  let app = 'codex', current, controller, generation = 0, modelIds = [], sent = false;

  function showError(message = '') { error.textContent = message; error.hidden = !message; }
  function ready() { launch.disabled = !current || !name.value.trim() || !modelIds.includes(model.value) || sent; }
  function option(text, value = '') { const item = doc.createElement('option'); item.textContent = text; item.value = value; return item; }
  function clear() {
    generation++;controller?.abort();controller = undefined;current = undefined;modelIds = [];sent = false;
    model.replaceChildren(option('请选择主模型'));model.disabled = true;name.value = '';launch.disabled = true;
    launch.textContent = '打开 CC Switch ↗';showError();
  }
  function renderModels({ autoSelect = false } = {}) {
    if (!modelIds.length) return;
    const ordered = sortModelsForApp(modelIds, app);
    const prev = model.value;
    model.replaceChildren(option('请选择主模型'), ...ordered.map(id => option(id, id)));
    model.disabled = false;
    const preferred = autoSelect ? defaultModelForApp(ordered, app) : (ordered.includes(prev) ? prev : '');
    model.value = preferred;
    note.textContent = app === 'agy'
      ? `${ordered.length} 个可用模型 · 反重力（agy cli）原生 Gemini 协议，已自动配好根地址（不含 /v1）`
      : `${ordered.length} 个可用模型 · 来自当前 API`;
    ready();
  }
  async function load() {
    const expected = ++generation;
    controller?.abort();controller = new AbortController();modelIds = [];sent = false;
    launch.textContent = '打开 CC Switch ↗';model.disabled = true;launch.disabled = true;reload.disabled = true;
    model.replaceChildren(option('正在读取模型…'));note.textContent = '正在读取这把 Key 的实时模型列表…';showError();
    try {
      const ids = await fetchModels(current, { signal: controller.signal, fetcher });
      if (expected !== generation || !dialog.open) return;
      modelIds = ids;
      renderModels({ autoSelect: app === 'agy' });
    } catch (failure) {
      if (expected !== generation || failure.name === 'AbortError') return;
      model.replaceChildren(option('暂未读取到模型'));note.textContent = '可点「重新读取」重试。';
      showError(failure instanceof TypeError ? '网络连接失败，请稍后重新读取。' : failure.message);
    } finally { if (expected === generation) reload.disabled = false; }
  }
  function openFor(initialApp) {
    if (dialog.open) return;
    clear();current = readCredentials();
    try { apiEndpoints(current?.baseUrl);if (!current?.apiKey) throw new Error('请先领取或找回你的 API Key。'); }
    catch { current = undefined;return; }
    app = Object.hasOwn(APPS, initialApp) ? initialApp : 'codex';
    dialog.querySelectorAll('input[name="app"]').forEach(input => { input.checked = input.value === app; });
    name.value = `义父公益 · ${APPS[app].title}`;dialog.showModal();load();
  }
  if (button) button.addEventListener('click', event => { event.stopPropagation(); openFor('codex'); });
  if (agyButton) agyButton.addEventListener('click', event => { event.stopPropagation(); openFor('agy'); });
  dialog.querySelectorAll('input[name="app"]').forEach(input => input.addEventListener('change', () => {
    if (!input.checked) return;
    const wasDefault = name.value === `义父公益 · ${APPS[app].title}`;
    app = input.value;if (wasDefault) name.value = `义父公益 · ${APPS[app].title}`;
    model.value = '';sent = false;launch.textContent = '打开 CC Switch ↗';showError();
    if (modelIds.length) renderModels({ autoSelect: app === 'agy' });
    else ready();
  }));
  reload.addEventListener('click', load);name.addEventListener('input', ready);
  model.addEventListener('change', () => { sent = false;launch.textContent = '打开 CC Switch ↗';showError();ready(); });
  form.addEventListener('submit', event => {
    event.preventDefault();if (launch.disabled) return;
    try {
      const latest = readCredentials();
      if (latest?.apiKey !== current?.apiKey || latest?.baseUrl !== current?.baseUrl) throw new Error('领取结果已变化，请关闭后重新打开。');
      const link = buildImportLink({ ...current, app, name: name.value, model: model.value });
      navigate(link);sent = true;launch.textContent = '已请求打开 CC Switch';ready();
      note.textContent = '请在浏览器弹窗选择「打开」，再在 CC Switch 中确认导入。';
    } catch (failure) { showError(failure.message || '暂时无法打开，请保留 Key 后重试。'); }
  });
  dialog.querySelector('.ccswitch-close').addEventListener('click', () => dialog.close());
  dialog.querySelector('.ccswitch-cancel').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => event.stopPropagation());
  dialog.addEventListener('close', clear);
  ownerDialog.addEventListener('close', () => { if (dialog.open) dialog.close();clear(); });
  return { dialog };
}
