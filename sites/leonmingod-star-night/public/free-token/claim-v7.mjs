import { humanToken } from './human-v3.mjs';
(() => {
  'use strict';
  const form = document.getElementById('oath-form');
  const input = document.getElementById('oath-input');
  const openButton = document.getElementById('open-confirm');
  const confirmDialog = document.getElementById('confirm-dialog');
  const refuseDialog = document.getElementById('refuse-dialog');
  const emailDialog = document.getElementById('email-dialog');
  const credentialsDialog = document.getElementById('credentials-dialog');
  const accept = document.getElementById('accept');
  const reject = document.getElementById('reject');
  const error = document.getElementById('claim-error');
  const emailError = document.getElementById('email-error');
  const baseUrl = document.getElementById('base-url');
  const apiKey = document.getElementById('api-key');
  const copyStatus = document.getElementById('copy-status');
  const nameInput = document.getElementById('claim-name');
  const emailInput = document.getElementById('claim-email');
  const codeInput = document.getElementById('claim-code');
  const sendCode = document.getElementById('send-code');
  const codeStatus = document.getElementById('code-status');
  const humanHost = document.getElementById('claim-human');
  const claimAgain = document.getElementById('claim-again');
  const CODE_LENGTH = 6;
  let busy = false;
  let timer = 0;
  let codeEmail = '';
  let returning = false;
  const STORE = 'lmg-claim-v1';
  // The plaintext key is kept only in this browser's localStorage, never on the server.
  const remembered = () => { try { return JSON.parse(localStorage.getItem(STORE) || 'null') || {}; } catch { return {}; } };
  const remember = patch => { try { localStorage.setItem(STORE, JSON.stringify({ ...remembered(), ...patch, saved_at: Date.now() })); } catch {} };
  const forget = () => { try { localStorage.removeItem(STORE); } catch {} };

  input.addEventListener('input', () => {
    const ready = input.value.trim() === '义父';
    openButton.disabled = !ready;
    form.dataset.ready = String(ready);
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (input.value.trim() !== '义父') return;
    error.hidden = true;
    confirmDialog.showModal();
  });
  reject.addEventListener('click', () => {
    if (busy) return;
    confirmDialog.close();
    refuseDialog.showModal();
  });
  document.getElementById('close-refuse').addEventListener('click', () => refuseDialog.close());
  confirmDialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  emailDialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });

  function showEmailError(message) {
    emailError.textContent = message;
    emailError.hidden = !message;
  }
  function showStatus(message) {
    codeStatus.textContent = message;
    codeStatus.hidden = !message;
  }
  const validEmail = value => value.trim().length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
  const nameLength = value => [...value.replace(/[\u0000-\u001F\u007F\u2028\u2029]/g, '').trim()].length;

  // The send button is the only button. While a countdown runs it stays disabled.
  function stopCountdown(label) {
    clearInterval(timer); timer = 0;
    sendCode.textContent = label;
    sendCode.disabled = busy;
  }
  function startCountdown(seconds) {
    clearInterval(timer);
    const endsAt = Date.now() + Math.max(1, Math.ceil(seconds)) * 1000;
    const tick = () => {
      const left = Math.ceil((endsAt - Date.now()) / 1000);
      if (left <= 0) return stopCountdown('重新发送');
      sendCode.disabled = true;
      sendCode.textContent = `${left}s 后重发`;
    };
    timer = setInterval(tick, 250);
    tick();
  }
  function enableCode() {
    codeInput.disabled = false;
    codeInput.focus();
  }

  async function post(path, payload) {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify(payload),
    });
    let data = {};
    try { data = await response.json(); } catch {}
    const retryAfter = Number(data.retry_after || response.headers.get('Retry-After')) || 0;
    return { ok: response.ok, status: response.status, data, retryAfter };
  }

  accept.addEventListener('click', () => {
    if (busy || input.value.trim() !== '义父') return;
    error.hidden = true;
    confirmDialog.close();
    showEmailError('');
    emailDialog.showModal();
    nameInput.focus();
  });

  emailInput.addEventListener('input', () => {
    // A different email has its own cooldown on the server; let the user send to it.
    if (codeEmail && emailInput.value.trim().toLowerCase() !== codeEmail) {
      codeEmail = '';
      codeInput.value = '';
      codeInput.disabled = true;
      showStatus('');
      stopCountdown('发送验证码');
    }
  });

  sendCode.addEventListener('click', async () => {
    if (busy || timer) return;
    showEmailError('');
    const length = nameLength(nameInput.value);
    if (length < 1 || length > 20) { showEmailError('名字需要 1 到 20 个字。'); nameInput.focus(); return; }
    if (!validEmail(emailInput.value)) { showEmailError('请填写有效的邮箱地址。'); emailInput.focus(); return; }
    busy = true;
    sendCode.disabled = true;
    sendCode.textContent = '发送中…';
    const email = emailInput.value.trim().toLowerCase();
    let countdown = 0;
    try {
      const token = await humanToken('claim_email', humanHost);
      const result = await post('/api/free-token/claim/code', { username: nameInput.value, email: emailInput.value, humanToken: token });
      const again = '这个邮箱已领取过，验证后显示你的密钥。';
      if (result.ok) {
        codeEmail = email;
        returning = Boolean(result.data.returning);
        countdown = Number(result.data.resend_after) || 60;
        remember({ username: nameInput.value.trim(), email });
        showStatus(returning ? `验证码已发送。${again}` : '验证码已发送到邮箱，填入 6 位数字即可自动领取。');
        enableCode();
      } else if (result.status === 429 && result.data.cooldown) {
        codeEmail = email;
        returning = Boolean(result.data.returning);
        countdown = result.retryAfter || 60;
        showStatus(`验证码已发送，请查收邮箱。${countdown} 秒后可重新发送。${returning ? again : ''}`);
        enableCode();
      } else {
        countdown = result.status === 429 ? result.retryAfter : 0;
        showEmailError(countdown ? `${result.data.error || '操作有点频繁。'}（${countdown} 秒后可再试）` : (result.data.error || '发送失败，请稍后重试。'));
      }
    } catch (failure) {
      showEmailError(failure instanceof TypeError ? '网络有些波动，请再试一次。' : failure.message);
    } finally {
      busy = false;
      if (countdown > 0) startCountdown(countdown);
      else stopCountdown(codeEmail ? '重新发送' : '发送验证码');
    }
  });

  codeInput.addEventListener('input', () => {
    const digits = codeInput.value.replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (codeInput.value !== digits) codeInput.value = digits;
    if (digits.length === CODE_LENGTH) verify(digits);
    else if (digits.length) showEmailError('');
  });

  async function verify(code) {
    if (busy) return;
    if (!validEmail(emailInput.value)) { showEmailError('请填写有效的邮箱地址。'); return; }
    busy = true;
    codeInput.readOnly = true;
    sendCode.disabled = true;
    showEmailError('');
    showStatus('正在验证…');
    let issued = false;
    try {
      const result = await post('/api/free-token/claim/verify', { email: emailInput.value, code });
      if (result.ok) {
        if (!result.data.baseUrl || !result.data.apiKey) throw new Error('见面礼还没准备好，请稍后重试。');
        issued = true;
        baseUrl.value = result.data.baseUrl;
        apiKey.value = result.data.apiKey;
        remember({ username: result.data.username || nameInput.value.trim(), email: emailInput.value.trim().toLowerCase(), key: result.data.apiKey, baseUrl: result.data.baseUrl });
        claimAgain.hidden = true;
        copyStatus.textContent = result.data.existing ? '这是你之前领取的密钥，已保存在本浏览器。' : result.data.replaced ? '已为你换发新密钥，旧密钥已失效。以后用这个邮箱找回的就是这把，已保存在本浏览器。' : '密钥已保存在本浏览器。丢了可用同一邮箱找回。';
        clearInterval(timer); timer = 0;
        showStatus('');
        emailDialog.close();
        credentialsDialog.showModal();
        return;
      }
      showStatus('');
      codeInput.value = '';
      if (result.data.resend) {
        codeEmail = '';
        codeInput.disabled = true;
        clearInterval(timer); timer = 0;
        showEmailError(result.data.error || '验证码已失效，请重新发送。');
      } else if (result.data.wrong_code) {
        showEmailError('验证码错误，请重新输入');
      } else {
        const wait = result.status === 429 ? result.retryAfter : 0;
        showEmailError(wait ? `${result.data.error || '操作有点频繁。'}（${wait} 秒后再试）` : (result.data.error || '验证失败，请稍后重试。'));
      }
    } catch (failure) {
      showStatus('');
      codeInput.value = '';
      showEmailError(failure instanceof TypeError ? '网络有些波动，请再输一次。' : failure.message);
    } finally {
      busy = false;
      codeInput.readOnly = false;
      if (!issued) {
        if (!timer) stopCountdown('重新发送');
        if (!codeInput.disabled) codeInput.focus();
      }
    }
  }

  document.getElementById('close-credentials').addEventListener('click', () => credentialsDialog.close());
  credentialsDialog.addEventListener('close', () => { baseUrl.value = ''; apiKey.value = ''; copyStatus.textContent = ''; codeInput.value = ''; });

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
  document.getElementById('copy-url').addEventListener('click', () => copy(baseUrl.value, '接口地址已复制。', baseUrl));
  document.getElementById('copy-key').addEventListener('click', () => copy(apiKey.value, '贵宾密钥已复制。', apiKey));
  document.getElementById('copy-all').addEventListener('click', () => copy(`Base URL: ${baseUrl.value}\nAPI Key: ${apiKey.value}`, '接口地址与贵宾密钥已复制。', apiKey));

  function openForm() {
    const saved = remembered();
    if (saved.username && !nameInput.value) nameInput.value = saved.username;
    if (saved.email && !emailInput.value) emailInput.value = saved.email;
    showEmailError('');
    emailDialog.showModal();
    (nameInput.value ? emailInput.value ? sendCode : emailInput : nameInput).focus();
  }
  claimAgain.addEventListener('click', () => {
    forget();
    credentialsDialog.close();
    nameInput.value = ''; emailInput.value = ''; codeInput.value = ''; codeInput.disabled = true;
    codeEmail = ''; showStatus(''); stopCountdown('发送验证码');
    openForm();
  });
  const saved = remembered();
  if (typeof saved.key === 'string' && saved.key.startsWith('sk-lm-')) {
    baseUrl.value = saved.baseUrl || 'https://cpa-dhke.onrender.com/v1';
    apiKey.value = saved.key;
    copyStatus.textContent = saved.username ? `${saved.username}，这是你保存在本浏览器里的密钥。` : '这是你保存在本浏览器里的密钥。';
    claimAgain.hidden = false;
    credentialsDialog.showModal();
  } else {
    if (saved.username) nameInput.value = saved.username;
    if (saved.email) emailInput.value = saved.email;
  }
})();
