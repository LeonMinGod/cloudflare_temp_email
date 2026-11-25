import { clearPending, maskEmail, readPending, requestCode, saveResult, verifyEmailCode } from './verify-flow-v1.mjs';

const pending = readPending();
if (!pending) {
  location.replace('/free-token/choose/');
  await new Promise(() => {});
}

const code = document.getElementById('verify-code');
const shell = document.getElementById('code-shell');
const status = document.getElementById('verify-status');
const resend = document.getElementById('resend');
const humanHost = document.getElementById('claim-human');
const change = document.getElementById('change-email');
document.getElementById('masked-email').textContent = maskEmail(pending.email);

let busy = false;
let sentAt = pending.sentAt;
let resendAfter = pending.resendAfter;
let timer;

function show(message, success = false) {
  status.textContent = message;
  status.classList.toggle('success', success);
}

function updateCountdown() {
  if (resend.dataset.return === 'true') {
    resend.disabled = busy;
    resend.textContent = '返回重新领取';
    return;
  }
  if (resend.dataset.force === 'true') {
    resend.disabled = busy;
    resend.textContent = '重新发送验证码';
    return;
  }
  const left = Math.max(0, Math.ceil((sentAt + resendAfter * 1000 - Date.now()) / 1000));
  resend.disabled = busy || left > 0;
  resend.textContent = left > 0 ? `${left} 秒后可重新发送` : '重新发送验证码';
}

function setBusy(value) {
  busy = value;
  code.readOnly = value;
  shell.dataset.state = value ? 'busy' : 'idle';
  updateCountdown();
}

async function verify() {
  if (busy || code.value.length !== 6) return;
  setBusy(true);
  show('正在验证…', true);
  try {
    const result = await verifyEmailCode(pending.email, code.value);
    if (!result.apiKey || !result.baseUrl) throw new Error('API Key 还没准备好，请稍后重试。');
    show('验证成功，正在返回…', true);
    saveResult(result, pending);
    location.replace(pending.returnPath);
  } catch (error) {
    code.value = '';
    shell.dataset.state = 'error';
    const attempts = Number(error.data?.attempts_left);
    show(error.data?.wrong_code && attempts > 0 ? `验证码不正确，还可尝试 ${attempts} 次。` : error.message);
    if (error.data?.resend || error.status === 403) {
      if (error.status === 403) resend.dataset.return = 'true';
      else resend.dataset.force = 'true';
    }
    setBusy(false);
    requestAnimationFrame(() => { shell.dataset.state = 'idle'; code.focus(); });
  }
}

code.addEventListener('input', () => {
  const digits = code.value.replace(/\D/g, '').slice(0, 6);
  if (code.value !== digits) code.value = digits;
  if (digits.length === 6) verify();
  else show('');
});

resend.addEventListener('click', async () => {
  if (resend.dataset.return === 'true') {
    clearPending();
    location.replace(pending.returnPath);
    return;
  }
  if (busy || resend.disabled) return;
  setBusy(true);
  show('正在重新发送…', true);
  try {
    const result = await requestCode(pending.email, humanHost);
    delete resend.dataset.force;
    delete resend.dataset.return;
    sentAt = Date.now();
    resendAfter = Number(result.resend_after) || 120;
    pending.sentAt = sentAt;
    pending.resendAfter = resendAfter;
    sessionStorage.setItem('lmg-email-verify-v1', JSON.stringify(pending));
    code.value = '';
    show('新的验证码已发送，请查收邮箱。', true);
    code.focus();
  } catch (error) {
    show(error.message);
  } finally {
    setBusy(false);
  }
});

change.addEventListener('click', () => {
  clearPending();
  location.assign(`${pending.returnPath}#verify-email`);
});

timer = setInterval(updateCountdown, 250);
updateCountdown();
code.focus();
window.addEventListener('pagehide', () => clearInterval(timer));
