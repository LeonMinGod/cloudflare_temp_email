export async function relayPoolToVps(env, payload, fetcher = (url, init) => fetch(url, init), now = Date.now()) {
  const endpoint = new URL(env.VPS_POOL_ENDPOINT);
  if (endpoint.href !== 'https://yifu.leonmingod.com/_pool/status') throw new Error('Invalid pool endpoint');
  const body = JSON.stringify(payload), stamp = String(now);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.FREE_TOKEN_OPS_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const message = `lmg-vps-pool-v1\n${stamp}\nPOST\n${endpoint.pathname}\n${body}`;
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  const signature = Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
  return fetcher(endpoint.href, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/json', 'X-Yifu-Pool': `${stamp}:${signature}` }, body });
}
