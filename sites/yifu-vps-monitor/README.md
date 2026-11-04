# Yifu VPS pool monitor

Node 24 standard-library service; no runtime npm dependencies. Reuses the current
website pool coordinator, quota sanitizer, metrics merger and ordering modules.
`src/storage.mjs` adapts persistent records and alarms to SQLite WAL transactions.

Run `node --test sites/yifu-vps-monitor/tests/*.test.mjs` from the repository root.
Production is deployed by `.github/workflows/yifu-vps.yaml` mode `deploy-monitor`.
It runs on 127.0.0.1:8318, reads CPA at 127.0.0.1:8317 and stores state at
`/opt/yifu-cpa/data/pool.sqlite`. `YIFU_ROOT` can override the root for an isolated
installation; private runtime.env and pool-runtime.json must exist there.

POST /_pool/status requires the signed X-Yifu-Pool header, a 30-second timestamp
window and snapshot/quota input. POST /_pool/seed imports owner-exported history;
do not repeat it after collecting newer history. Do not expose either secret or
raw import/export data to browsers. Public status remains sanitized on the site.

See [VPS operations and backup/recovery](../../YIFU_VPS_HANDOFF_CN.md). Personal-key
authentication and game state remain in Cloudflare; this service only moves monitoring.
