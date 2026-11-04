import { createHmac, timingSafeEqual } from 'node:crypto';
import { PoolStatusCoordinator } from '../../leonmingod-star-night/src/pool-status.js';
import { savePoolCache } from '../../leonmingod-star-night/src/pool-storage.js';

export function signature(secret, stamp, path, text) {
  return createHmac('sha256', secret).update(`lmg-vps-pool-v1\n${stamp}\nPOST\n${path}\n${text}`).digest('hex');
}

export function createCollector({ storage, secret, managementKey, fetcher = (url, init) => fetch(url, init), clock = () => Date.now() }) {
  const env = { FREE_TOKEN_OPS_SECRET: secret, CPA_STATUS_MANAGEMENT_KEY: managementKey, CPA_STATUS_ORIGIN: 'http://127.0.0.1:8317' };
  let coordinator = new PoolStatusCoordinator({ storage }, env, { fetcher, clock });
  let timer, closed = false;
  const arm = time => {
    clearTimeout(timer);
    if (!time || closed) return;
    timer = setTimeout(async () => { try { await coordinator.alarm(); } catch (error) { console.warn(JSON.stringify({ event: 'pool_alarm_failed', error_type: error.name })); arm(clock() + 300000); } }, Math.max(50, time - clock()));
    timer.unref();
  };
  storage.onAlarm = arm;
  const ready = coordinator.ready.then(async () => arm(await storage.getAlarm() || clock() + 1000));
  const reply = (status, body) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  return {
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (request.method !== 'POST' || !['/_pool/status', '/_pool/seed'].includes(path)) return reply(404, { error: 'Not found' });
      const header = request.headers.get('X-Yifu-Pool') || '', match = header.match(/^(\d{13}):([a-f0-9]{64})$/);
      if (!match || Math.abs(clock() - Number(match[1])) > 30000) return reply(403, { error: 'Forbidden' });
      const maximum = path === '/_pool/seed' ? 16 * 1024 * 1024 : 2048;
      const reader = request.body?.getReader(), chunks = [];let length = 0;
      if(reader)for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>maximum){await reader.cancel();return reply(413,{error:'Request too large'});}chunks.push(Buffer.from(value));}
      const text = Buffer.concat(chunks).toString('utf8');
      const expected = signature(secret, match[1], path, text);
      if (!timingSafeEqual(Buffer.from(match[2], 'hex'), Buffer.from(expected, 'hex'))) return reply(403, { error: 'Forbidden' });
      let body;
      try { body = JSON.parse(text); } catch { return reply(400, { error: 'Invalid JSON' }); }
      await ready;
      if (path === '/_pool/seed') {
        if (body.schema !== 1 || !body.cache || typeof body.cache !== 'object') return reply(400, { error: 'Invalid cache' });
        await coordinator.persistQueue;
        const cache = { ...body.cache, next: 0, metricsNext: 0, managementBlockedUntil: 0, failures: 0 };
        await savePoolCache(storage, JSON.stringify(cache));
        await storage.put('pool-status-control-v1', { ...(body.control || {}), origin: 'https://yifu.leonmingod.com', checkpointAt: 0,
          gates: { next: 0, metricsNext: 0, managementBlockedUntil: 0, quotaNext: {} } });
        coordinator = new PoolStatusCoordinator({ storage }, env, { fetcher, clock });
        await coordinator.ready;
        return reply(200, { imported: true, history_models: Object.keys(cache.modelUsage?.models || {}).length });
      }
      if (!['snapshot', 'quota'].includes(body.kind) || (body.kind === 'quota' && !/^[a-f0-9]{8}$/.test(body.id || ''))) return reply(400, { error: 'Invalid request' });
      try { return await coordinator.fetch(new Request('https://pool.internal/pool-status', { method: 'POST', body: JSON.stringify({ kind: body.kind, id: body.id, peek: Boolean(body.peek) }) })); }
      catch (error) { console.warn(JSON.stringify({ event: 'pool_read_failed', error_type: error.name })); return reply(503, { error: '号池暂时无法连接，请稍后再试。', retry_after: 300 }); }
    },
    async close() {
      closed = true;clearTimeout(timer);storage.onAlarm = null;
      await ready;
      await Promise.allSettled([coordinator.pending, coordinator.metricsPending, coordinator.persistQueue].filter(Boolean));
    },
  };
}
