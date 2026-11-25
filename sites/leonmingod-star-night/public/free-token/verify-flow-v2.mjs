import { humanToken } from './human-v3.mjs';

export const PENDING_KEY = 'lmg-email-verify-v1';
export const RESULT_KEY = 'lmg-claim-result-v2';
export const SAVED_KEY = 'lmg-claim-v1';
export const EMAIL_KEY = 'lmg-claim-email-v1';
export const NAME_KEY = 'lmg-claim-name-v1';

export function rememberName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || [...name].length > 20) return;
  try { localStorage.setItem(NAME_KEY, name); } catch {}
}

export function readRememberedName() {
  try {
    const name = JSON.parse(localStorage.getItem(SAVED_KEY) || 'null')?.username || localStorage.getItem(NAME_KEY);
    return typeof name === 'string' && [...name].length <= 20 ? name : '';
  } catch { return ''; }
}
const SOURCES = new Set(['oath', 'game']);
const RETURNS = new Set(['/free-token/claim/', '/free-token/game/']);

export const validEmail = value => typeof value === 'string' && value.trim().length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());

export function rememberEmail(email) {
  if (!validEmail(email)) return;
  try { localStorage.setItem(EMAIL_KEY, email.trim().toLowerCase()); } catch {}
}

export function readRememberedEmail() {
  try {
    const email = localStorage.getItem(EMAIL_KEY);
    if (validEmail(email)) return email.trim().toLowerCase();
    const saved = JSON.parse(localStorage.getItem(SAVED_KEY) || 'null');
    if (validEmail(saved?.email)) return saved.email.trim().toLowerCase();
  } catch {}
  return '';
}

export function rememberEmailInput(input) {
  if (!input.value) input.value = readRememberedEmail();
  input.addEventListener('input', () => rememberEmail(input.value));
  input.addEventListener('change', () => rememberEmail(input.value));
}

export function normalizeCode(value) {
  const text = String(value).normalize('NFKC');
  const match = text.match(/(?:^|\D)(\d{6})(?!\d)/);
  return match ? match[1] : text.replace(/\D/g, '').slice(0, 6);
}

export function readEmailLink(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const email = params.get('email');
  const code = params.get('code');
  if (!validEmail(email) || !/^\d{6}$/.test(code || '')) return null;
  return { email: email.trim().toLowerCase(), code };
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
  if (!response.ok) {
    const error = new Error(data.error || '操作没有完成，请稍后再试。');
    error.status = response.status;
    error.data = data;
    error.retryAfter = Number(data.retry_after || response.headers.get('Retry-After')) || 0;
    throw error;
  }
  return data;
}

export async function requestCode(email, humanHost) {
  if (!validEmail(email)) throw new Error('请填写有效的邮箱地址。');
  rememberEmail(email);
  const token = await humanToken('claim_email', humanHost);
  try {
    return await post('/api/free-token/claim/code', { email: email.trim(), humanToken: token });
  } catch (error) {
    if (error.status === 429 && error.data?.cooldown) {
      return { sent: true, resend_after: error.retryAfter || 120, already_sent: true };
    }
    throw error;
  }
}

export function storePending({ email, source, returnPath, resendAfter }) {
  if (!SOURCES.has(source) || !RETURNS.has(returnPath) || !validEmail(email)) throw new Error('验证流程无效，请返回后重试。');
  const pending = {
    email: email.trim().toLowerCase(),
    source,
    returnPath,
    sentAt: Date.now(),
    resendAfter: Math.max(1, Number(resendAfter) || 120),
  };
  persistPending(pending);
  return pending;
}

export async function startEmailVerification(options) {
  const result = await requestCode(options.email, options.humanHost);
  storePending({ ...options, resendAfter: result.resend_after });
  location.assign('/free-token/verify/');
}

export function persistPending(pending) {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  // Email apps commonly open a new tab in the same browser. Share only the
  // non-secret flow metadata; the server's HttpOnly grant remains mandatory.
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(pending)); } catch {}
}

export function readPending(email = null) {
  for (const read of [() => sessionStorage.getItem(PENDING_KEY), () => localStorage.getItem(PENDING_KEY)]) {
    try {
      const pending = JSON.parse(read() || 'null');
      if (pending && validEmail(pending.email) && (!email || pending.email === email) &&
          SOURCES.has(pending.source) && RETURNS.has(pending.returnPath) &&
          Number.isFinite(pending.sentAt) && Number.isFinite(pending.resendAfter) &&
          Date.now() - pending.sentAt < 20 * 60 * 1000) return pending;
    } catch {}
  }
  return null;
}

export function clearPending() {
  sessionStorage.removeItem(PENDING_KEY);
  try { localStorage.removeItem(PENDING_KEY); } catch {}
}

export function maskEmail(email) {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const shown = local.length <= 2 ? local[0] : `${local[0]}${'*'.repeat(Math.min(5, local.length - 2))}${local.at(-1)}`;
  return `${shown}@${domain}`;
}

export async function verifyEmailCode(email, code) {
  return post('/api/free-token/claim/verify', { email, code });
}

export function saveResult(result, pending) {
  rememberEmail(pending.email);
  rememberName(result.username);
  const payload = { ...result, email: pending.email, source: pending.source, returnPath: pending.returnPath, saved_at: Date.now() };
  sessionStorage.setItem(RESULT_KEY, JSON.stringify(payload));
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify({ email: pending.email, key: result.apiKey, baseUrl: result.baseUrl, username: result.username || '', saved_at: Date.now() }));
  } catch {}
  clearPending();
  return payload;
}

export function takeResult(source) {
  let result;
  try { result = JSON.parse(sessionStorage.getItem(RESULT_KEY) || 'null'); } catch { return null; }
  if (!result || result.source !== source || typeof result.apiKey !== 'string' || !result.apiKey.startsWith('sk-lm-')) return null;
  sessionStorage.removeItem(RESULT_KEY);
  return result;
}

export function readSavedKey() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_KEY) || 'null');
    return saved && typeof saved.key === 'string' && saved.key.startsWith('sk-lm-') ? saved : null;
  } catch { return null; }
}

export function forgetSavedKey() {
  try { localStorage.removeItem(SAVED_KEY); } catch {}
}
