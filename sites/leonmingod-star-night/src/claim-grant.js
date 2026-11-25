const GRANT_SECONDS = 20 * 60;
const SOURCES = new Set(['oath', 'game']);
const encoder = new TextEncoder();

const bytesToBase64Url = bytes => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
};
const base64UrlToBytes = value => {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
};
const cookieName = request => new URL(request.url).protocol === 'https:' ? '__Secure-lmg_claim' : 'lmg_claim_local';

async function signingKey(env) {
  if (typeof env.KEY_ENC_SECRET !== 'string') return null;
  let raw;
  try { raw = Uint8Array.from(atob(env.KEY_ENC_SECRET.trim()), character => character.charCodeAt(0)); } catch { return null; }
  if (raw.length !== 32) return null;
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function browserScope(request) {
  const url = new URL(request.url);
  const ua = await crypto.subtle.digest('SHA-256', encoder.encode(request.headers.get('User-Agent') || ''));
  return `${url.hostname}\n${bytesToBase64Url(new Uint8Array(ua)).slice(0, 22)}`;
}

async function signature(request, env, payload) {
  const key = await signingKey(env);
  if (!key) return null;
  const message = encoder.encode(`lmg-claim-grant-v1\n${await browserScope(request)}\n${payload}`);
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, message)));
}

export async function issueClaimGrant(request, env, source, now = Date.now(), username = '') {
  if (!SOURCES.has(source)) return null;
  const grant = {
    v: 1,
    source,
    id: crypto.randomUUID(),
    issued_at: now,
    expires_at: now + GRANT_SECONDS * 1000,
    ...(username ? { username } : {}),
  };
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify(grant)));
  const signed = await signature(request, env, payload);
  if (!signed) return null;
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return {
    grant,
    cookie: `${cookieName(request)}=${payload}.${signed}; HttpOnly; SameSite=Strict; Path=/api/free-token/claim; Max-Age=${GRANT_SECONDS}${secure}`,
  };
}

export async function readClaimGrant(request, env, now = Date.now()) {
  const prefix = cookieName(request) + '=';
  const values = (request.headers.get('Cookie') || '').split(';').map(value => value.trim()).filter(value => value.startsWith(prefix));
  if (values.length !== 1) return null;
  const match = values[0].slice(prefix.length).match(/^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
  if (!match) return null;
  const expected = await signature(request, env, match[1]);
  if (!expected || expected.length !== match[2].length) return null;
  let different = 0;
  for (let index = 0; index < expected.length; index++) different |= expected.charCodeAt(index) ^ match[2].charCodeAt(index);
  if (different) return null;
  let grant;
  try { grant = JSON.parse(new TextDecoder().decode(base64UrlToBytes(match[1]))); } catch { return null; }
  if (grant?.v !== 1 || !SOURCES.has(grant.source) || typeof grant.id !== 'string' ||
      !Number.isFinite(grant.issued_at) || !Number.isFinite(grant.expires_at) ||
      grant.issued_at > now + 30_000 || grant.expires_at <= now || grant.expires_at - grant.issued_at !== GRANT_SECONDS * 1000) return null;
  return grant;
}

export function clearClaimGrant(request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${cookieName(request)}=; HttpOnly; SameSite=Strict; Path=/api/free-token/claim; Max-Age=0${secure}`;
}
