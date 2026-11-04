# Yifu public CPA on a VPS

The public base URL is `https://yifu.leonmingod.com/v1`. The user's local
`cpa.leonmingod.com` is independent and must never be changed or used as an OAuth source.
As of 2026-11-04, a Debian 13 LXD VPS replaces Render/InstaBox. Three systemd services
run CPA, Cloudflare Tunnel and a Node 24 monitor. CPA/monitor bind only to loopback
ports 8317/8318; Tunnel supplies the public ingress.

The monitor source is `sites/yifu-vps-monitor/`, reusing the site's sanitization,
quota and usage code with SQLite WAL storage. Five-minute shared refresh and
fifteen-minute history checkpoints remain. Existing CF usage history was imported.
The site adds the plain binding `VPS_POOL_ENDPOINT=https://yifu.leonmingod.com/_pool/status`
and signs POST requests using the existing operations secret. `/_pool/status`
accepts snapshot/quota; `/_pool/seed` is an owner-only history import, not routine refresh.
Public GET `/api/pool-status` and `/api/pool-status/quota` remain, adding
`X-Pool-Backend: vps`. No management credentials reach browsers.

Personal-key registration/authentication/strict rate limits, game validation, email
verification and static resources remain on CF. This does not eliminate all CF usage.
All 13 public credentials (10 disabled) and four static keys remain. Three enabled
credentials were already invalid; the user will reauthorize them after migration.
`CPA_OAUTH_BOOTSTRAP_FILE` is removed to prevent stale snapshots restoring deleted files.

Maintenance branch: `codex/free-token-home-20261024`. Operations: `yifu-vps.yaml`.
Secrets: YIFU_SSH_HOST/PORT/USER/PRIVATE_KEY/KNOWN_HOSTS, YIFU_BACKUP_SECRET and
YIFU_OPS_SECRET. Verify/status/backup/deploy-monitor no longer require Render;
deploy-monitor does not replace the CPA binary. Backups encrypt private/auths/systemd
and a consistent SQLite backup with AES-256-GCM, retained as artifacts for 90 days.
Automatic backup scheduling and a full disaster-recovery rehearsal are not configured.
Old Render/shared-key and InstaBox workflows are disabled and must not be reused.

See the [current operational handoff](https://github.com/LeonMinGod/cloudflare_temp_email/blob/codex/free-token-home-20261024/YIFU_VPS_HANDOFF_CN.md)
for host verification, paths, versions, evidence and recovery steps.
