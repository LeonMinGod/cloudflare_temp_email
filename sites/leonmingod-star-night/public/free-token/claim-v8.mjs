import { forgetSavedKey, readSavedKey, startEmailVerification, takeResult } from './verify-flow-v1.mjs';

const $ = id => document.getElementById(id);
const form = $('oath-form');
const input = $('oath-input');
const openButton = $('open-confirm');
const confirmDialog = $('confirm-dialog');
const refuseDialog = $('refuse-dialog');
const emailDialog = $('email-dialog');
const credentialsDialog = $('credentials-dialog');
const accept = $('accept');
const reject = $('reject');
const claimError = $('claim-error');
const emailError = $('email-error');
const emailInput = $('claim-email');
const sendCode = $('send-code');
const humanHost = $('claim-human');
const baseUrl = $('base-url');
const apiKey = $('api-key');
const copyStatus = $('copy-status');
const title = $('credentials-title');
const description = $('credentials-description');
const showSaved = $('show-saved-key');
let busy = false;

function showError(element, message) {
  element.textContent = message;
  element.hidden = !message;
}

async function postGrant() {
  const response = await fetch('/api/free-token/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify({ oath: input.value.trim(), confirmed: true }),
  });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(data.error || '暂时无法进入领取流程，请稍后重试。');
  return data;
}

function presentCredentials(data, saved = false) {
  baseUrl.value = data.baseUrl || 'https://cpa-dhke.onrender.com/v1';
  apiKey.value = data.apiKey || data.key || '';
  if (saved) {
    title.textContent = '本浏览器保存的 API Key';
    description.textContent = '这是之前保存在当前浏览器里的 Key。';
  } else if (data.existing) {
    title.textContent = '欢迎回来';
    description.textContent = '邮箱验证成功，已找回原来的 API Key。';
  } else if (data.replaced) {
    title.textContent = '密钥已升级';
    description.textContent = '旧版 Key 已失效；以后用同一邮箱找回的就是这把新 Key。';
  } else {
    title.textContent = '领取成功';
    description.textContent = '这把 API Key 已与邮箱绑定，可用同一邮箱找回。';
  }
  copyStatus.textContent = saved ? '' : 'API Key 已保存在本浏览器；请勿公开分享。';
  credentialsDialog.showModal();
}

input.addEventListener('input', () => {
  const ready = input.value.trim() === '义父';
  openButton.disabled = !ready;
  form.dataset.ready = String(ready);
});

form.addEventListener('submit', event => {
  event.preventDefault();
  if (input.value.trim() !== '义父') return;
  showError(claimError, '');
  confirmDialog.showModal();
});

reject.addEventListener('click', () => {
  if (busy) return;
  confirmDialog.close();
  refuseDialog.showModal();
});
$('close-refuse').addEventListener('click', () => refuseDialog.close());

accept.addEventListener('click', async () => {
  if (busy || input.value.trim() !== '义父') return;
  busy = true;
  accept.disabled = true;
  accept.textContent = '正在确认…';
  showError(claimError, '');
  try {
    await postGrant();
    confirmDialog.close();
    showError(emailError, '');
    emailDialog.showModal();
    emailInput.focus();
  } catch (error) {
    showError(claimError, error.message);
  } finally {
    busy = false;
    accept.disabled = false;
    accept.textContent = '确认，拜义父';
  }
});

sendCode.addEventListener('click', async () => {
  if (busy) return;
  busy = true;
  sendCode.disabled = true;
  sendCode.textContent = '正在发送…';
  showError(emailError, '');
  try {
    await startEmailVerification({ email: emailInput.value, source: 'oath', returnPath: '/free-token/claim/', humanHost });
  } catch (error) {
    showError(emailError, error instanceof TypeError ? '网络有些波动，请再试一次。' : error.message);
    busy = false;
    sendCode.disabled = false;
    sendCode.textContent = '发送验证码';
  }
});

function resetForAnotherEmail() {
  credentialsDialog.close();
  forgetSavedKey();
  showSaved.hidden = true;
  input.value = '';
  openButton.disabled = true;
  form.dataset.ready = 'false';
  emailInput.value = '';
  input.focus();
}

$('claim-again').addEventListener('click', resetForAnotherEmail);
$('close-credentials').addEventListener('click', () => credentialsDialog.close());
credentialsDialog.addEventListener('close', () => { baseUrl.value = ''; apiKey.value = ''; copyStatus.textContent = ''; });

async function copy(text, message, field) {
  try {
    await navigator.clipboard.writeText(text);
    copyStatus.textContent = message;
  } catch {
    field.focus();
    field.select();
    copyStatus.textContent = '已选中，请长按或使用 Ctrl+C 复制。';
  }
}
$('copy-url').addEventListener('click', () => copy(baseUrl.value, '接口地址已复制。', baseUrl));
$('copy-key').addEventListener('click', () => copy(apiKey.value, 'API Key 已复制。', apiKey));
$('copy-all').addEventListener('click', () => copy(`Base URL: ${baseUrl.value}\nAPI Key: ${apiKey.value}`, '接口地址与 API Key 已复制。', apiKey));

const result = takeResult('oath');
if (result) {
  presentCredentials(result);
} else {
  const saved = readSavedKey();
  if (saved) {
    showSaved.hidden = false;
    showSaved.addEventListener('click', () => presentCredentials(saved, true));
  }
  if (location.hash === '#verify-email') {
    history.replaceState(null, '', location.pathname);
    emailDialog.showModal();
    emailInput.focus();
  }
}

for (const dialog of [confirmDialog, emailDialog]) dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
