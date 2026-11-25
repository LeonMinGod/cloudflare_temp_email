import { clearPending, maskEmail, normalizeCode, persistPending, readEmailLink, readPending, requestCode, saveResult, verifyEmailCode } from './verify-flow-v2.mjs';

// A fragment stays out of HTTP requests and referrers. Remove it from the address
// bar before doing anything else; the link grants no authority of its own.
const emailLink = readEmailLink(location.hash);
if (location.hash) history.replaceState(null, '', location.pathname);
const pending = readPending(emailLink?.email);
const code = document.getElementById('verify-code');
const shell = document.getElementById('code-shell');
const status = document.getElementById('verify-status');
const resend = document.getElementById('resend');
const humanHost = document.getElementById('claim-human');
const change = document.getElementById('change-email');
const copyButton = document.getElementById('copy-code');
const form = document.getElementById('verify-form');

function show(message, success = false) {
  status.textContent = message;
  status.classList.toggle('success', success);
}

if (emailLink && (!pending || pending.email !== emailLink.email)) {
  // Mail apps can open a different browser with no original session. Offer a
  // real, user-initiated copy action without sending any verification request.
  document.getElementById('verify-title').textContent = '复制验证码';
  document.getElementById('masked-email').textContent = maskEmail(emailLink.email);
  document.getElementById('verify-hint').textContent = '当前窗口没有对应的领取流程。请复制后，返回刚才领取的页面粘贴。';
  code.value = emailLink.code;
  code.readOnly = true;
  code.removeAttribute('autofocus');
  code.autocomplete = 'off';
  resend.hidden = change.hidden = true;
  copyButton.hidden = false;
  form.addEventListener('submit', event => event.preventDefault());
  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(emailLink.code);
      show('已复制，请返回刚才领取的页面粘贴。', true);
      copyButton.textContent = '验证码已复制';
    } catch {
      code.focus();
      code.select();
      show('已选中验证码，请长按复制后返回领取页。');
    }
  });
} else if (!pending) {
  location.replace('/free-token/choose/');
} else {
  document.getElementById('masked-email').textContent = maskEmail(pending.email);
  let busy = false;
  let sentAt = pending.sentAt;
  let resendAfter = pending.resendAfter;
  let timer;

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
    change.disabled = value;
    shell.dataset.state = value ? 'busy' : 'idle';
    updateCountdown();
  }

  async function verify() {
    if (busy || !/^\d{6}$/.test(code.value)) return;
    setBusy(true);
    show('正在验证…', true);
    try {
      const result = await verifyEmailCode(pending.email, code.value);
      if (!result.apiKey || !result.baseUrl) throw new Error('API Key 还没准备好，请稍后重试。');
      saveResult(result, pending);
      show('验证成功，正在返回…', true);
      location.replace(pending.returnPath);
    } catch (error) {
      code.value = '';
      const attempts = Number(error.data?.attempts_left);
      show(error.data?.wrong_code && attempts > 0 ? `验证码不正确，还可尝试 ${attempts} 次。` : error.message);
      if (error.data?.resend || error.status === 403) {
        if (error.status === 403) resend.dataset.return = 'true';
        else resend.dataset.force = 'true';
      }
      setBusy(false);
      shell.dataset.state = 'error';
      requestAnimationFrame(() => code.focus({ preventScroll: true }));
    }
  }

  function acceptInput() {
    const digits = normalizeCode(code.value);
    if (code.value !== digits) code.value = digits;
    if (digits.length === 6) void verify();
    else show('');
  }
  code.addEventListener('input', acceptInput);
  code.addEventListener('change', acceptInput);
  code.addEventListener('paste', event => {
    const text = event.clipboardData?.getData('text');
    if (!text) return;
    event.preventDefault();
    code.value = normalizeCode(text);
    acceptInput();
  });
  form.addEventListener('submit', event => { event.preventDefault(); void verify(); });

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
      persistPending(pending);
      code.value = '';
      show(result.already_sent ? '验证码已经发送，请查看邮箱。' : '新的验证码已发送，请查收邮箱。', true);
    } catch (error) {
      show(error.message);
    } finally {
      setBusy(false);
      code.focus({ preventScroll: true });
    }
  });

  change.addEventListener('click', () => {
    if (busy) return;
    clearPending();
    location.assign(`${pending.returnPath}#verify-email`);
  });

  function resume() {
    clearInterval(timer);
    timer = setInterval(updateCountdown, 250);
    updateCountdown();
  }
  resume();
  window.addEventListener('pagehide', () => clearInterval(timer));
  window.addEventListener('pageshow', resume);
  code.focus({ preventScroll: true });
  if (emailLink) {
    code.value = emailLink.code;
    void verify();
  }
}
