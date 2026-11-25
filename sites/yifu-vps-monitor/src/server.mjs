import { readFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { SqliteStorage } from './storage.mjs';
import { createCollector } from './service.mjs';
import { createRecordedUsageReader } from './recorded-usage.mjs';
import { createBanBoardReader } from './ban-board.mjs';

const root = process.env.YIFU_ROOT || '/opt/yifu-cpa';
const values = Object.fromEntries(readFileSync(root + '/private/runtime.env', 'utf8').split('\n').filter(Boolean).map(line => { const at = line.indexOf('='); return [line.slice(0, at), JSON.parse(line.slice(at + 1))]; }));
const secrets = JSON.parse(readFileSync(root + '/private/pool-runtime.json', 'utf8'));
mkdirSync(root + '/data', { recursive: true, mode: 0o700 });
const storage = new SqliteStorage(root + '/data/pool.sqlite');
const readRecordedUsage = createRecordedUsageReader(root + '/plus/usage.sqlite', root + '/data/usage-coverage.json');
const readShameBoard = createBanBoardReader({
  filePath: process.env.YIFU_PROMPT_GUARD_BANS || '/var/lib/yifu-prompt-guard/ip_bans.json',
  keyMapPath: process.env.YIFU_PROMPT_GUARD_KEY_MAP || '/var/lib/yifu-prompt-guard/ip_key_map.json',
  secret: secrets.ops_secret,
});
const app = createCollector({ storage, secret: secrets.ops_secret, managementKey: values.MANAGEMENT_PASSWORD,
  cpaOrigin: process.env.YIFU_CPA_ORIGIN, readRecordedUsage, readShameBoard });
const server = createServer(async (incoming, outgoing) => {
  try {
    const request = new Request('http://127.0.0.1:8318' + incoming.url, { method: incoming.method, headers: incoming.headers,
      body: ['GET', 'HEAD'].includes(incoming.method) ? undefined : Readable.toWeb(incoming), duplex: 'half' });
    const response = await app.fetch(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(outgoing); else outgoing.end();
  } catch (error) { outgoing.writeHead(503, { 'Content-Type': 'application/json' }); outgoing.end('{"error":"Status temporarily unavailable"}'); }
});
server.listen(8318, '127.0.0.1', () => console.log(JSON.stringify({ event: 'pool_monitor_started', storage: 'sqlite', interval_seconds: 300 })));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { server.close(async () => { await app.close(); storage.close(); process.exit(0); }); });
