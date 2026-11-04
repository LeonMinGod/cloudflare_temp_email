# CLAUDE.md

## Current production authority: v62 / Yifu VPS (2026-11-04)

Read [LEONMINGOD_HANDOFF_CN.md](LEONMINGOD_HANDOFF_CN.md) and
[YIFU_VPS_HANDOFF_CN.md](YIFU_VPS_HANDOFF_CN.md) before operations.
Public CPA is https://yifu.leonmingod.com/v1 on the dedicated LXD VPS, NOT Render
or InstaBox. cpa.leonmingod.com belongs to the user's local CPA; never modify it
or borrow its credentials. Public OAuth needs the user to reauthorize after migration.
Preserve all existing static keys, credential disabled flags, and persistent auths.
Never restore the old Render bootstrap over newly authorized files.

Website source: sites/leonmingod-star-night; maintenance/publish branch:
codex/free-token-home-20261024. Main is not the website release source.
Production Worker v62 is 8419c16f-c7c5-4b90-aa89-21e087b26b8c; forwarder remains
51a33be8-6ca4-4b4f-886f-613bfea996b0 with SITE bound to named entrypoint Site.
The 12 bindings preserve original KV/GameRun state and add VPS_POOL_ENDPOINT.
Use protected stage/publish, preserve assets; never directly deploy the partial mirror.

The pool monitor now runs on the VPS with local CPA reads and SQLite: five-minute
refresh, fifteen-minute history checkpoints. Its source is sites/yifu-vps-monitor.
Personal-key auth/rate limits, email issuance and live game validation still use CF.
Use yifu-vps.yaml for verify/status/backup/deploy-monitor. Old Render/standalone key
and InstaBox workflows are disabled; do not reenable them for routine operations.
The VPS workflow does not update CPA binaries. Follow the handoff for CI builds,
backup and binary-only updates preserving private/auths/SQLite.

Keep per-email sk-lm- keys, signatures, saved keys, separate verification page,
120-second resend and fixed two-hour human passes. Do not restore shared rewards,
leaderboards, another-email prompts or game pause. Keep v8 rules, 45 seconds,
24 jade/two shields, immutable live inputs, no gap boxes or final-five spoilers.
Home v7/token v5 art, default-ON flow, independent floating orb and live-model
CC Switch imports stay intact. Current clients: claim-v11/app-v18/verify-v3,
saved-key-v2/ccswitch-v2; pool status-v7 uses state then request count ordering.

Old Render/shared-key instructions are archived in Git history. Existing API keys,
Secrets and account IDs must not be printed, rotated or deleted by incidental edits.

## Project Structure

- **Backend**: `worker/` — Cloudflare Workers API using Hono framework. Entry: `worker/src/worker.ts`, APIs under `worker/src/*_api/`.
- **Frontend**: `frontend/` — Vue 3 + Naive UI app deployed to Cloudflare Pages. Routes in `frontend/src/router/`.
- **Pages middleware**: `pages/functions/_middleware.js` — Routes API calls to Worker backend.
- **Mail parser**: `mail-parser-wasm/` — Rust WASM email parser.
- **SMTP/IMAP proxy**: `smtp_proxy_server/` — Python proxy server.
- **DB schema/migrations**: `db/` — SQLite via Cloudflare D1, dated migration patches.
- **Docs**: `vitepress-docs/` — VitePress documentation site (zh + en).
- **E2E tests**: `e2e/` — Playwright tests in Docker Compose (API, browser, SMTP proxy).
- **Changelogs**: `CHANGELOG.md` (中文) + `CHANGELOG_EN.md` (English).

## Build & Dev Commands

Run inside each subfolder with `pnpm`:

| Folder | Dev | Build | Lint | Deploy |
|--------|-----|-------|------|--------|
| `worker/` | `pnpm dev` | `pnpm build` | `pnpm lint` | `pnpm deploy` |
| `frontend/` | `pnpm dev` | `pnpm build` | — | `pnpm deploy` |
| `vitepress-docs/` | `pnpm dev` | `pnpm build` | — | — |
| `mail-parser-wasm/` | — | `wasm-pack build --release` | — | — |

SMTP proxy: `pip install -r smtp_proxy_server/requirements.txt` then `python smtp_proxy_server/main.py`.

## E2E Tests

Tests run in Docker Compose with Playwright. From `e2e/`:

```bash
npm test              # Build, run all tests, exit
npm run test:down     # Clean up containers
```

Test categories: `tests/api/` (API tests), `tests/browser/` (UI tests with Chromium), `tests/smtp-proxy/` (SMTP/IMAP proxy tests).

The Docker frontend serves over **HTTPS** (self-signed cert) with Vite proxy to worker — required for WebAuthn (`navigator.credentials`) and `crypto.subtle` which need a secure context. Browser tests use `ignoreHTTPSErrors: true`.

Key patterns for browser tests:
- Frontend hashes passwords with SHA-256 (`crypto.subtle`) before sending — API test registration must use pre-hashed passwords if UI login is needed.
- VueUse `useStorage('key', '')` with string default uses **raw string** serialization — set localStorage with raw value, not `JSON.stringify()`.
- WebAuthn browser tests use CDP virtual authenticator (`WebAuthn.enable` + `WebAuthn.addVirtualAuthenticator`).

## Architecture

### Worker Auth Flow (`worker/src/worker.ts`)

Three auth layers applied via Hono middleware, each using different headers:

| Path prefix | Header | Purpose |
|-------------|--------|---------|
| `/api/*` | `Authorization: Bearer <jwt>` | Address (mailbox) credential |
| `/user_api/*` | `x-user-token` | User account JWT |
| `/admin/*` | `x-admin-auth` | Admin password |
| (any) | `x-user-access-token` | User role-based access token |
| (any) | `x-custom-auth` | Optional global access password |
| (any) | `x-lang` | Language preference (`en`/`zh`) |

Public endpoints (no auth): `/open_api/*`, `/user_api/login`, `/user_api/register`, `/user_api/passkey/authenticate_*`, `/user_api/oauth2/*`.

### Worker Email Flow (`worker/src/email/`)

Cloudflare Email Worker entry: `email()` in `worker/src/email/index.ts`. Processing pipeline:
1. Parse raw email → check junk → check address exists
2. Auto-reply if configured → forward if configured → webhook if enabled
3. Store in D1 database

### Frontend State (`frontend/src/store/index.js`, `frontend/src/api/index.js`)

Global state via VueUse `useStorage` for persistence. The `api` module wraps axios with auto-attached auth headers and fingerprinting. API base URL comes from `VITE_API_BASE` env var (empty = same origin).

## Coding Style

- `worker/` uses TypeScript + ESLint; `frontend/` uses Vue SFCs.
- Keep existing naming patterns: `*_api/` folders, `utils/`, `models/`.
- ESM imports only (`type: module`).

## Commits & PRs

- Use Conventional Commits: `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `perf:`.
- PRs should explain scope; add screenshots for UI changes.
- Use squash merge for PRs.

## Post-Task Checklist (IMPORTANT)

After completing any feature, bug fix, or improvement, **always check**:

1. **CHANGELOG.md** (中文) and **CHANGELOG_EN.md** (English) — both must be updated under the current `(main)` version section with the change entry. Follow the existing format: `- feat/fix/docs: |模块| 描述`.
2. **Documentation** — if the change involves new environment variables, new API endpoints, or configuration changes, update the corresponding docs in `vitepress-docs/docs/zh/` and `vitepress-docs/docs/en/`. Key files:
   - `guide/worker-vars.md` — Worker environment variables
   - `guide/ui/` — Frontend deployment docs
   - `guide/feature/` — Feature-specific docs
   - `api/` — API reference docs
3. **Both languages** — docs and changelogs exist in Chinese and English; always update both.

## Config

- Worker settings in `worker/wrangler.toml` (see `wrangler.toml.template` for bindings).
- Frontend uses `VITE_*` env vars. Don't commit secrets.
