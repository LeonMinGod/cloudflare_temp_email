const MACHINE = 'm_agqzojclrfglcpkfj43t7npojy';
const ROOT = '/data/workspace/leonmingod-cpa';
const PLATFORM = 'https://api.instabox.sh';

async function boundedJson(response) {
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 131072) { await reader.cancel(); throw new Error('Oversized platform response'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function origin(env) {
  const url = new URL(env.CPA_ORIGIN);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.instabox.tech') || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/') throw new Error('Invalid origin');
  return url.origin;
}

export async function maintain(env, fetcher = (url, init) => fetch(url, init), now = Date.now()) {
  if (env.AUTO_RESUME !== '1') return { state: 'automatic_resume_disabled' };
  if (env.INSTABOX_MACHINE_ID !== MACHINE || !env.INSTABOX_API_KEY) throw new Error('Missing machine configuration');
  const api = async (path = '', method = 'GET', body) => {
    const response = await fetcher(`${PLATFORM}/v1/machines/${MACHINE}${path}`, {
      method, redirect: 'manual', headers: { 'X-API-Key': env.INSTABOX_API_KEY, 'Content-Type': 'application/json', ...(method === 'POST' ? { 'Idempotency-Key': crypto.randomUUID() } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error(`Platform HTTP ${response.status}`);
    return boundedJson(response);
  };
  const machine = await api();
  if (machine.id !== MACHINE) throw new Error('Unexpected machine');
  if (Date.parse(machine.cooldownUntil || '') > now) return { state: 'cooldown', until: machine.cooldownUntil };
  if (machine.operationId || ['starting', 'resuming', 'creating', 'stopping', 'suspending'].includes(machine.state)) return { state: machine.state };
  if (machine.state === 'suspended') {
    await api('/resume', 'POST');
    return { state: 'resume_requested' };
  }
  if (machine.state !== 'running' || !machine.runtime?.ready) return { state: machine.state };
  const health = await fetcher(origin(env) + '/healthz', { redirect: 'manual', headers: { 'User-Agent': 'LeonMinGod-CPA-Health/1.0', 'Cache-Control': 'no-cache' } });
  await health.body?.cancel();
  if (health.ok) return { state: 'healthy' };
  const result = await api('/exec', 'POST', { argv: ['bash', ROOT + '/bin/ensure-running.sh'], cwd: ROOT, timeoutSeconds: 20 });
  return { state: result.exitCode === 0 ? 'service_start_requested' : 'service_start_failed' };
}

export async function proxy(request, env, ctx, fetcher = (url, init) => fetch(url, init)) {
  const target = new URL(request.url);
  const destination = new URL(target.pathname + target.search, origin(env));
  const headers = new Headers(request.headers);
  headers.delete('Host');
  headers.set('X-Forwarded-Host', target.hostname);
  headers.set('X-Forwarded-Proto', 'https');
  const remote = request.headers.get('CF-Connecting-IP');
  if (remote) headers.set('X-Forwarded-For', remote);
  let response;
  try {
    response = await fetcher(new Request(destination, { method: request.method, headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body, redirect: 'manual', duplex: 'half' }));
  } catch {
    ctx.waitUntil(maintain(env, fetcher).catch(error => console.warn(JSON.stringify({ event: 'cpa_recovery_failed', error_type: error.name }))));
    return Response.json({ error: { message: 'CPA 云主机正在恢复，请稍后重试。', type: 'service_unavailable', code: 'machine_unavailable' } }, { status: 503, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } });
  }
  if ([502, 503, 504].includes(response.status)) ctx.waitUntil(maintain(env, fetcher).catch(error => console.warn(JSON.stringify({ event: 'cpa_recovery_failed', error_type: error.name }))));
  if (response.status === 101) return response;
  const resultHeaders = new Headers(response.headers);
  resultHeaders.set('Cache-Control', 'no-store');
  resultHeaders.set('X-LeonMinGod-Backend', 'instabox');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: resultHeaders });
}

export default {
  fetch: proxy,
  async scheduled(event, env) {
    try { console.log(JSON.stringify({ event: 'cpa_machine_check', ...(await maintain(env)) })); }
    catch (error) { console.warn(JSON.stringify({ event: 'cpa_machine_check_failed', error_type: error.name })); }
  },
};
