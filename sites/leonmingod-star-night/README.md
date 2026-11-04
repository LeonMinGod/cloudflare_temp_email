# LeonMinGod current star-night website

Current operational handoff: [LEONMINGOD_HANDOFF_CN.md](../../LEONMINGOD_HANDOFF_CN.md). This takes precedence over archived shared-key instructions.

Recovered from the production Worker/source maps and public assets on 2026-10-25. This is the current cloud maintenance source, not a complete copy of the user's original Windows directory. See [WEBSITE_UPDATE_CN.md](WEBSITE_UPDATE_CN.md) for provenance, changes, verification, and deployment details.

```sh
npm ci
npm run build
npm test
npm run dev
```

Preview: http://localhost:8790. It uses an explicit dummy reward value, never a production API key.

Deploy through `.github/workflows/leonmingod-star-night.yaml`, staging before publication. Updated static files are bundled according to `release.json`; existing Cloudflare assets, secrets, the forwarding Worker/routes, and the GameRun namespace remain in place. Do not replace production assets with this recovered partial mirror or run the historical entrance deploy.

The game uses native image_gen raster art, optimized as WebP. The shared v8 engine with the live-v1 protocol drives 45-second, 24-jade, two-shield browser play and server replay. Rage begins at 19 collected jade (five remaining); at 24, pure survival continues to 45 seconds. Defeats show one of ten emoji/poetic taunts with a direct oath-claim link. Old v1-v6 reward protocols are retired: refresh and restart; the three-minute credential lifetime remains a run expiry, not an API key expiry. Offline simulated win rates are calibration evidence, not measured human pass rates.

Production release v62: parent `8419c16f-c7c5-4b90-aa89-21e087b26b8c`, forwarder
`51a33be8-6ca4-4b4f-886f-613bfea996b0`. Public CPA is **https://yifu.leonmingod.com/v1**
on the dedicated VPS; the user's local `cpa.leonmingod.com` must stay independent.
Pool reads now use a signed VPS relay and SQLite, preserving five-minute refresh,
fifteen-minute checkpoints and imported history. Personal key auth/game state remain
on CF. See [VPS operations](../../YIFU_VPS_HANDOFF_CN.md). Original 11 bindings plus
VPS_POOL_ENDPOINT are retained; never directly deploy the incomplete asset mirror.
Old Render/InstaBox procedures below are historical and must not be executed.

The live game uses `app-v18.mjs`, oath claim `claim-v11.mjs`, verification
`verify-v3.mjs`, saved-key `saved-key-v2.mjs`, and CC Switch `ccswitch-v2.mjs`.
Only old Render/temporary public-cpa saved URLs normalize to yifu; local CPA stays
unchanged and cannot be imported as a public provider. No keys/storage records rotate.
Pause/resume, keyboard pause and focus/background auto-pause remain removed.

Fairness: v5 uses constant sword paths without ricochet and stable three-lane wall gaps protected from overlapping swords. Public instructions list only win conditions; do not reveal upcoming final-five mechanics.

Visual preference: do not render floating gap rectangles, dashed outlines or gap labels. The empty sword lanes provide the visual cue; actual corridor protection remains active.

Pickups use the sword tip/blade capsule while normal damage stays at the original body hitbox. The separate gold talisman grants five seconds of server-replayed invincibility, displayed with native-generated token/ring art and a HUD countdown. Gold does not count toward the jade goal.

Current issuance is OPEN. Rewards are per-email `sk-lm-` keys authorized through the existing remote guard; the oath endpoint no longer returns `FREE_TOKEN_RENDER_KEY`. KV stores each key as a hash plus AES-GCM ciphertext so a verified returning email receives the same key. Token clicks still check no-store `/api/free-token/status`; closed shows “暂未开放”, open restores the original animated choice-page entry. The legacy Render keys, Karl key and OAuth credentials remain separate and must be preserved.

Security v7 requires server-verified Turnstile for game starts and verification-email sends, immutable timed input prefixes and fresh staged server entropy. Oath confirmation or a verified game finish creates a browser-scoped 20-minute claim grant; email send and code verification both require it, and the pending code is bound to its grant ID. A full trace submitted only at the end cannot win.

Client v10 isolates stale success/error responses across weak-network restarts. Targeted browser cases and 40 public source resources passed; see verification/security-v7-client-v10-release.json.

After successful Turnstile verification, the server issues a fixed two-hour HttpOnly/Secure signed browser pass shared across restarts, refreshes, email sends and apex/www. It is not IP-bound, so mobile network changes do not force another challenge. Visits do not extend expiry; expired, cleared, tampered or browser-mismatched passes require verification again. The server checks the pass independently; raw Turnstile tokens remain single-use, and live gameplay, reward conditions, rate limits, closed-state handling and private operations probes remain enforced.

New runs use v8 / app-v17. Sword walls show a 0.4-second arrival glint before launch; protected corridor timing moves with the delay. No safety boxes, labels or mechanic spoilers. During the five-second ward, jade and gold use its radius-108 circular contact area. Red swords are removed authoritatively at ward contact and animate outward with gold sparks. Expiry restores ordinary sword-tip pickups/damage; another gold refreshes five seconds without stacking or healing.

Add capped pickup trails, near-miss sword glints/text and quiet optional audio with a remembered toggle. Defeat shows survived time, jade and remaining requirements before the original ten taunts and two exits. Effects are capped at 48, with no full-screen blur or new image downloads. Preserve 45 seconds, 24 jade, two shields, no pause, two-hour human passes and live-v1 server reward checks. In-flight v7 runs retain original physics; vulnerable v1–v6 reward paths remain retired.


v52 restores the v6 desktop/mobile home illustrations by user request. Oath claiming requires a displayed signature in the UI, carried in the server-signed claim grant and saved with the verified email/key. Existing names and keys remain stable; legacy clients without signatures stay compatible. No new leaderboard entries are added.

Email and signature are remembered separately from the saved key. Removing the “claim with another email” action never clears the saved key. The OTP form supports one-time-code autofill, six-digit auto-submit and full-message/full-width paste. Emails contain a normal HTTPS fill-code action with code/address in the fragment, cleared immediately on the page. The same browser can resume in a new tab using short-lived non-secret local metadata; the HttpOnly server grant is still required. A different browser only gets a user-initiated copy action. Native iOS Mail keyboard suggestions depend on the OS/mail app and cannot be guaranteed by web code.


v53 adds CC Switch import beside copied/saved keys with required models read live from the personal key's `/v1/models`. The token entrance links to the anonymous `/model-status/` dashboard. Its server-only status Secret is installed; all 11 existing/new bindings are retained. Four native-generated backgrounds are home v7 and token v5. Flow is ON by default by the latest user request; the transparent jade orb floats independently and the old caption is removed. Preserve reduced-motion/manual-off support.

Stage 40904919911 passed 45 tests, including real Workers requests and redirect rejection. Publish 40905233018 and 46 public resource comparisons passed. Browser layout evidence covers desktop/mobile home, token, CC Switch and live status. CC Switch used dummy credentials/mocked models; no native app launch or real verification email was performed. See `verification/v53-*.json` and the root handoff.


v54 pool status uses provider tabs and separate model / masked-credential cards. Browser polling is at least 60 seconds and pauses while hidden. A dedicated named coordinator in the existing GAME_RUNS namespace coalesces source reads; inventory/quota probes have five-minute gates and management auth errors back off for fifteen minutes. Only masked email and allowlisted quota fields leave the server. Scoped Cloudflare GET/HEAD skip rules exempt the dashboard from WAF/rate-limit challenges. That v54 reader did not collect model metrics; v55 now adds them as described below. See the handoff and verification/v54-*.json.


v55 defaults to model cards with real per-alias execution counts, success/failure, recent five-minute request buckets, streaming TTFT and weighted output speed. Provider tabs and common ordering put GPT/Codex and `gpt-6.1-sol` first; request-count/name/status ordering is optional. Credential quota cards and masking remain intact.

CPA commit `6b7dc9b34f1da0171ce8004dc1ba031e27cd1d21` exposes the authenticated, non-destructive `GET /v8/management/observability/usage/models`. Existing `usage-statistics-enabled` is now true; no other secret-file semantics, static keys or OAuth credentials were changed. `pool-enable-stats` safely backs up and redeploys this one config change; optional `pool-audit` input `verify_model_usage=true` verifies a real small streamed request.

The dedicated pool DO polls only these counters every minute even without page visitors. Per-process high-water counters prevent double addition and preserve collected totals across process restarts. Data is stored in transactional sub-128-KiB chunks. Counters begin when this feature was enabled, include upstream retries, and cannot reconstruct old per-account totals by model. Abrupt CPA loss can still omit executions after its last minute checkpoint. Recent latency/speed covers successful streaming samples from the last five hours; empty samples show honestly. Scope and timestamp travel in the public allowlisted DTO.

54 website tests passed. Go full-suite/build and the new package race test passed. Protected rollout preserved 13 OAuth files and four static client keys; a real `gpt-6.1-sol` HTTP 200 execution increased its counter from zero to one. See verification/v55-*.json and the operational handoff for release IDs and rollback caveats.


v56 persists only changed transactional cache chunks, skips unchanged manifests and cached quota result writes, and writes the pool identity marker only once. Readers retain their chunk baseline across object reloads; shrunk snapshots remove obsolete parts atomically. The existing 60-entry history limit was already correct. No Render changes or new KV writes. All 55 tests pass. A matched synthetic workload reduced application row-write calls by 67% with active viewers and 83% when idle; this is not measured Cloudflare billing or whole-account usage. See verification/v56-write-budget.json for exclusions and the handoff for production release IDs.


v57 adds a shared browser-saved-key viewer to route selection and both victory entry points. It reads the same local record as oath claim, supports copy and CC Switch, and sends no API/email/Turnstile request just to view a saved key. Missing/removed records hide the entry; game rules and issuance gates remain unchanged.

v58 adds native xAI billing, user and settings reads through fixed server-only CPA API-call probes. It shows the real Heavy plan, weekly remaining/reset, on-demand status and GrokBuild/Cursor/GrokBot shared usage. Four GETs form one globally coalesced five-minute quota refresh; only enabled accounts are automatically queried. No inference ping fallback. The public DTO keeps only allowlisted values and masked email. All 57 website tests pass, including concurrency and cooldown checks.

GitHub owner is now LeonMinGod. Operational repo validation accepts both current and redirected old CPA URLs, while Cloudflare worker subdomains/resource IDs remain unchanged.

CPA is now `bf86b75181a2fff5b74a5345cf1e1057da3e45d3`, deploy `dep-dbiukprbc2fs73bc85e0`. Management auth uses the existing validated Render/Cloudflare real-IP parser, preventing bans on a shared ingress address; authenticated v8 routes inspect/clear one native login record. Model API guard policy is unchanged. Auto-deploy is intentionally off. Hold before pushing, then use the manual `management-safe-deploy` mode to take a fresh encrypted backup and mount the OAuth bootstrap snapshot. The new instance restores and verifies the full auth pool before listening; never revert to restoring OAuth after a new empty instance goes live. Keep existing valid files and disabled state. Snapshot storage is not continuous OAuth persistence.

Rollout evidence is explicit: 13 OAuth files and four static keys remained, but 1/60 cutover probes failed and the initial monitor did not capture the reason. The workflow correctly failed, although the deploy itself is live and post-checks passed. A subsequent read-only verification returned 20/20 HTTP 200. Do not claim uninterrupted inference or rerun a deploy merely to make a check green. Future monitors retain timestamps, error types and sample detail. See the handoff and management-recovery verification.

v59 defaults providers, models and credentials to descending real request totals. Hide empty provider tabs and start in all providers; equal counts use existing stable ordering. Provider totals aggregate existing model usage, falling back to account totals only when model metrics are unavailable. The browser loads status-v5.mjs; no extra upstream calls, writes or Render deploy. The earlier fixed GPT/Codex-first default is superseded. Other manual sort choices remain.


v60 supersedes the earlier one-minute monitoring interval: frontend, status and model-metric collection share five minutes; full cache checkpoints are at most every fifteen minutes. Small durable cooldown controls stay separate, with an atomic full-checkpoint update and a conservative 10,000 daily cache-write reservation. Guard conservation signals pause optional checkpoints/background work until the next UTC day. This is not an account-wide billing guarantee. The UI loads status-v6.mjs; request-count ordering, masked credentials and real xAI quotas remain.

CPA bf86b75 reuses one authentication outcome per HTTP request across the guard and API route, invalidated by manager/request-header/URI changes. It never caches decisions across requests. The protected deploy keeps OAuth snapshots and a public-safe pre-deploy model-counter artifact, copied with the connected CF API into ops:cpa-model-usage-before-deploy:v1 because the GitHub token lacks that KV operation. Do not rotate issued keys or disable authorization to work around an exhausted free quota. The daily-quota incident remains a failed dynamic API verification until reset/paid activation and a real check.

The v60 protected deploy completed in run 41204870819: 13 OAuth files/four static keys preserved, 13/13 model-list probes HTTP200. The counter snapshot for 21 model/provider pairs was copied to KV with the connected CF API and read back. This does not establish recovery of personal-key authorization while the free DO daily quota is exhausted.

v61 changes the default dashboard ordering to availability first (ready, cooldown, error, unknown, disabled), then descending real request totals within each state. Provider tabs use their best credential state before usage totals. Disabled entries retain their historical counts and remain visible at the end; empty providers stay hidden. The page loads status-v7.mjs. Five-minute polling, privacy, quota probes and backend behavior remain unchanged. Desktop/mobile browser checks cover the reported high-usage disabled credential regression, provider/model order and unchanged polling. The expired Nov 1 release exception is removed; publication again requires a successful live pool API check.
