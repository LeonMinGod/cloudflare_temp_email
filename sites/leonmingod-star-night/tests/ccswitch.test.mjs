import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { apiEndpoints, buildImportLink, fetchModels, installCcSwitch } from '../public/free-token/ccswitch-v2.mjs';

const credentials = { baseUrl: 'https://yifu.leonmingod.com/v1', apiKey: 'sk-lm-local-test-placeholder' };
const tick = () => new Promise(resolve => setImmediate(resolve));

test('CC Switch imports use the native app format and exact live model alias without switching existing configuration', () => {
  for (const [app, endpoint, format] of [['claude', 'https://yifu.leonmingod.com', 'anthropic'], ['codex', credentials.baseUrl, 'openai_responses'], ['gemini', 'https://yifu.leonmingod.com', 'gemini_native']]) {
    const link = new URL(buildImportLink({ ...credentials, app, name: 'Leon · 自选', model: '哈基米/gemini-3.8-flash-high' }));
    assert.equal(link.protocol, 'ccswitch:');assert.equal(link.hostname, 'v1');assert.equal(link.pathname, '/import');
    assert.equal(link.searchParams.get('endpoint'), endpoint);assert.equal(link.searchParams.get('apiFormat'), format);
    assert.equal(link.searchParams.get('model'), '哈基米/gemini-3.8-flash-high');assert.equal(link.searchParams.get('apiKey'), credentials.apiKey);
    assert.equal(link.searchParams.get('enabled'), 'false');assert.equal(link.searchParams.get('name'), 'Leon · 自选');
    assert.equal(link.searchParams.has('configUrl'), false);
  }
  assert.throws(() => apiEndpoints('https://unrelated.invalid/v1'));
  assert.throws(() => apiEndpoints('https://yifu.leonmingod.com/v1?key=test'));
  assert.throws(() => buildImportLink({ ...credentials, app: 'unknown', name: 'x', model: 'x' }));
  assert.throws(() => buildImportLink({ ...credentials, app: 'codex', name: ' ', model: 'x' }));
});

test('models come from authenticated GET /v1/models with no cookies, query key or redirects', async () => {
  let called = 0;
  const models = await fetchModels(credentials, { fetcher: async (url, options) => {
    called++;assert.equal(url, credentials.baseUrl + '/models');assert.equal(options.headers.Authorization, `Bearer ${credentials.apiKey}`);
    assert.equal(options.credentials, 'omit');assert.equal(options.redirect, 'error');assert.equal(options.cache, 'no-store');
    return Response.json({ data: [{ id: '哈基米/gemini-test' }, { id: 'gpt-test' }, { id: 'gpt-test' }, { id: '' }, { id: 1 }] });
  } });
  assert.equal(called, 1);assert.deepEqual(models, ['gpt-test', '哈基米/gemini-test']);
  await assert.rejects(fetchModels(credentials, { fetcher: async () => new Response('secret upstream error', { status: 401 }) }), /Key/);
  await assert.rejects(fetchModels(credentials, { fetcher: async () => Response.json({ data: [] }) }), /暂无可用模型/);
});

function fixture(fetcher) {
  const { document, window } = parseHTML('<html><body><dialog id="owner" open><button id="entry">CC Switch</button></dialog></body></html>');
  const selectPrototype = Object.getPrototypeOf(document.createElement('select'));
  if (!Object.getOwnPropertyDescriptor(selectPrototype, 'value')?.set) Object.defineProperty(selectPrototype, 'value', {
    configurable: true,
    get() { return [...this.options].find(item => item.hasAttribute('selected'))?.value ?? this.firstElementChild?.value ?? ''; },
    set(value) { for (const item of this.options) item.toggleAttribute('selected', item.value === value); },
  });
  let current = { ...credentials };const navigations = [];
  const owner = document.querySelector('#owner'), button = document.querySelector('#entry');
  const { dialog } = installCcSwitch({ button, ownerDialog: owner, readCredentials: () => current, document, fetcher, navigate: link => navigations.push(link) });
  for (const item of [owner, dialog]) {
    Object.defineProperty(item, 'open', { get: () => item.hasAttribute('open') });
    item.showModal = () => item.setAttribute('open', '');
    item.close = () => { item.removeAttribute('open');item.dispatchEvent(new window.Event('close')); };
  }
  const fire = (node, type) => node.dispatchEvent(new window.Event(type, { bubbles: true, cancelable: true }));
  return { document, dialog, owner, button, fire, navigations, setCredentials: value => { current = value; } };
}

test('the reward button opens a live picker and only a selected model launches CC Switch; no key is embedded in HTML', async () => {
  const f = fixture(async () => Response.json({ data: [{ id: 'gpt-live' }, { id: 'gemini-live' }] }));
  let documentClicks = 0;f.document.addEventListener('click', () => documentClicks++);
  f.fire(f.button, 'click');await tick();
  assert(f.dialog.open);assert(f.owner.open);assert.equal(documentClicks, 0);
  assert(!f.dialog.innerHTML.includes(credentials.apiKey));assert.equal(f.dialog.querySelectorAll('a[href^="ccswitch:"]').length, 0);
  const select = f.dialog.querySelector('select'), launch = f.dialog.querySelector('.ccswitch-launch');
  assert.equal(select.options.length, 3);assert(launch.disabled);
  select.value = 'gpt-live';f.fire(select, 'change');assert.equal(launch.disabled, false);
  f.fire(f.dialog.querySelector('form'), 'submit');assert.equal(f.navigations.length, 1);
  assert.equal(new URL(f.navigations[0]).searchParams.get('model'), 'gpt-live');assert(launch.disabled);
  f.fire(f.dialog.querySelector('.ccswitch-cancel'), 'click');assert.equal(f.dialog.open, false);assert(f.owner.open);
  assert.equal(f.dialog.querySelector('select').options.length, 1);
});

test('closing a reward cancels model loading and late responses cannot overwrite a newly opened picker', async () => {
  const pending = [];
  const f = fixture((url, options) => new Promise(resolve => pending.push({ resolve, signal: options.signal })));
  f.fire(f.button, 'click');f.dialog.close();assert(pending[0].signal.aborted);
  f.fire(f.button, 'click');pending[1].resolve(Response.json({ data: [{ id: 'new-model' }] }));await tick();
  pending[0].resolve(Response.json({ data: [{ id: 'old-model' }] }));await tick();
  assert.equal(f.dialog.querySelector('select').options[1].value, 'new-model');
  f.owner.close();assert.equal(f.dialog.open, false);
});

test('changing credentials while the picker is open prevents importing a stale key', async () => {
  const f = fixture(async () => Response.json({ data: [{ id: 'gpt-live' }] }));
  f.fire(f.button, 'click');await tick();const select=f.dialog.querySelector('select');select.value='gpt-live';f.fire(select,'change');
  f.setCredentials({ ...credentials, apiKey: 'sk-lm-changed-placeholder' });f.fire(f.dialog.querySelector('form'),'submit');
  assert.equal(f.navigations.length,0);assert.match(f.dialog.querySelector('.ccswitch-error').textContent,/已变化/);
});
