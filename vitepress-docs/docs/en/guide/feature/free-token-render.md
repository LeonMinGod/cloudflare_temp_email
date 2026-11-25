# Free Token integration with Render

## v8: ward deflection/pickups, arrival glints and feedback

Released and verified: parent/source `98a305ea-8544-45ec-809a-3c1f26ccaf5e`, unchanged forwarder `51a33be8-6ca4-4b4f-886f-613bfea996b0`; fresh baseline `7018e442-e644-4bdf-a38f-ca8cf9e31e8e`. All 27 checks passed, plus four presentation/layout sizes, three real local touch/live-progress sizes, 48 resources per public host and actual mobile widget loading. An owner-signed start followed by 45 live packets completed v8 with 24 jade/two shields, two gold pickups, 20 deflected swords and six near-miss events. Concurrent finishes returned 200/409/409; final-only traces, single batch progress, anonymous calls and fake verification remained rejected. Game/oath rewards match the existing key (fingerprint `a6bbe9c75913e4ec`), models 200 / 33. No Render/key changes; retain two-hour verification and in-flight v7 runs.

[Stage](https://github.com/928886540/cloudflare_temp_email/actions/runs/40349972406) · [Publish](https://github.com/928886540/cloudflare_temp_email/actions/runs/40350193310) · [Live acceptance](https://github.com/928886540/cloudflare_temp_email/actions/runs/40350258134)

New runs use v8 / app-v12. Sword walls show a 0.4-second arrival glint before launch; protected corridor timing moves with the delay. No safety boxes, labels or mechanic spoilers. During the five-second ward, jade and gold use its radius-108 circular contact area. Red swords are removed authoritatively at ward contact and animate outward with gold sparks. Expiry restores ordinary sword-tip pickups/damage; another gold refreshes five seconds without stacking or healing.

Add capped pickup trails, near-miss sword glints/text and quiet optional audio with a remembered toggle. Defeat shows survived time, jade and remaining requirements before the original ten taunts and two exits. Effects are capped at 48, with no full-screen blur or new image downloads. Preserve 45 seconds, 24 jade, two shields, no pause, two-hour human passes and live-v1 server reward checks. In-flight v7 runs retain original physics; vulnerable v1–v6 reward paths remain retired.

## Two-hour browser verification pass (2026-10-26)

Published at 23:07 Asia/Shanghai on 2026-10-26: parent/source `7018e442-e644-4bdf-a38f-ca8cf9e31e8e`, unchanged forwarder `51a33be8-6ca4-4b4f-886f-613bfea996b0`. Read-only inspection confirmed the live baseline `0c98caa6-334b-4b4c-ac1f-694ec95e8879` before publication. Twenty checks and two mobile browser sizes passed refresh/restart/cross-path reuse; 43 assets matched on both apex/www. Owner-signed temporary passes passed live repeat starts and identical reward claims (200), fixed expiry, and missing/expired/tampered rejection (403). This administrative probe does not automate a human challenge; actual mobile widgets were separately loaded and checked.

[Stage](https://github.com/928886540/cloudflare_temp_email/actions/runs/40345932586) · [Publish](https://github.com/928886540/cloudflare_temp_email/actions/runs/40346185218) · [Acceptance](https://github.com/928886540/cloudflare_temp_email/actions/runs/40346269266)

After successful Turnstile verification, the server issues a fixed two-hour HttpOnly/Secure signed browser pass shared across restarts, refreshes, oath claims and apex/www. It is not IP-bound, so mobile network changes do not force another challenge. Visits do not extend expiry; expired, cleared, tampered or browser-mismatched passes require verification again. The server checks the pass independently; raw Turnstile tokens remain single-use, and live gameplay, reward conditions, rate limits, closed-state handling and private operations probes remain enforced.

Domain-separated HMAC uses the existing verification Secret; no new credentials or Render changes. Clients are human-v2 / claim-v3 / app-v11; older immutable assets remain available.

## Final release: isolate delayed responses across runs (2026-10-26 16:19 Asia/Shanghai)

Current CF parent/source `0c98caa6-334b-4b4c-ac1f-694ec95e8879`; entrance stays `51a33be8-6ca4-4b4f-886f-613bfea996b0`. Client app-v10.mjs retains live protocol v7. Delayed success/error/cleanup from a prior run cannot overwrite a new receipt, stop the new game or clear its pending submission.
Both targeted browser cases passed with continued HTTP 200 live progress and no script errors. [Stage](https://github.com/928886540/cloudflare_temp_email/actions/runs/40291321848) passed eighteen checks; [publication](https://github.com/928886540/cloudflare_temp_email/actions/runs/40291450251) passed. All forty source resources match on apex/www; unsigned claims/starts and fake tokens still return 403.
Current Yifu fingerprint remains `a6bbe9c75913e4ec`, models HTTP 200; exposed `69ba11c6809909d7` was revoked (401). Render remains `dep-dbfglagae00c73819490`, four keys/twelve logins with Karl preserved. This patch changes neither rewards nor server game rules and does not redeploy Render; the real forty-five-second acceptance below covers the unchanged protocol/rules.
Evidence: `verification/security-v7-stale-responses.json`, `verification/security-v7-client-v10-release.json`. Refresh old pages to load the new client.

## Current state: security fix live, exposed Yifu key revoked (2026-10-26 16:09 Asia/Shanghai)

New Yifu fingerprint `a6bbe9c75913e4ec` (not a credential) returned models HTTP 200 and is synchronized to the website. Exposed `69ba11c6809909d7` was removed and returns HTTP 401. Issuance remains open, both reward paths share the new key at https://cpa-dhke.onrender.com/v1, and anonymous direct claims require human verification.
Current parent `d93ec9bd-702c-4379-9ac3-922b7919130d`, source release `c6a5209a-d283-4a12-ab4a-a02d9b6f9f2a`; entrance remains `51a33be8-6ca4-4b4f-886f-613bfea996b0`. Render deploy `dep-dbfglagae00c73819490`. Rotation changes only the issuance Secret, with no further code/art/game changes.
[Register/publish](https://github.com/928886540/cloudflare_temp_email/actions/runs/40290134078) and [revoke old key](https://github.com/928886540/cloudflare_temp_email/actions/runs/40290264958) succeeded. Four keys remain: the sole current Yifu key, two originals and standalone Karl. All twelve CURRENT login files were backed up/restored, rather than relying on the older ten-file snapshot. Fifteen operation tests include the delayed-rotation fingerprint guard.
A temporary CPA failed-login lockout stopped two preflights before any mutation. Rotation waited for expiry and fresh backups; do not clear a ban by restarting without preserving current login files. Sanitized evidence: `.github/operations/render-client-keys/yifu-security-rotation-20261026.json`. Full live-game security verification follows below.

## Live security v7 published and publicly verified (2026-10-26 15:47 Asia/Shanghai)

Source parent `c6a5209a-d283-4a12-ab4a-a02d9b6f9f2a`; entrance remains `51a33be8-6ca4-4b4f-886f-613bfea996b0`. Retain GAME_RUNS, original ASSETS, other bindings and artwork. Client app-v9.mjs / engine-v7.mjs preserves gameplay parameters. Live versions were reread; the post-configuration baseline was `468396f7-8023-4ed8-8339-f835610dabd3`.
[Stage](https://github.com/928886540/cloudflare_temp_email/actions/runs/40287641432) passed eighteen checks; [publication](https://github.com/928886540/cloudflare_temp_email/actions/runs/40287743435) and fourteen key-operation tests passed. Three local mobile sizes verified real live updates and original claims. All 39 resources match source on apex/www, including unchanged artwork and physics.
[Real public API acceptance](https://github.com/928886540/cloudflare_temp_email/actions/runs/40287817328) used private owner-signed starts, continuously submitted 45 live packets and won with 24 jade/two shields. Concurrent rewards returned 200/409/409; signed oath claims issue the same key, models HTTP 200 / 34 models. Owner signatures bypass only Turnstile, never live game checks; this is not an automated human-challenge pass claim.
Unsigned start/claim and fake tokens return 403 on apex/www. Waiting before submitting a full trace and one-shot 2700-frame progress are rejected. Actual public mobile widgets load within 393x580; challenges were not solved on the user's behalf. Old v1-v6 runs must refresh and restart.
Operations: optional `expected_current_fingerprint` stops delayed additions if another session changed issuance. A temporary CPA management login lockout stops preflight before backup/mutation; retain accounts and retry after the lockout expires.
Never restore full-seed/end-only-trace redemption. Continuous live automation and copying an issued shared key remain possible.

## Live protocol v7: block offline solved traces and automated direct claims

Replace full-seed disclosure and wait-then-submit rewards with live-v1. The server owns game state, commits immutable input prefixes about once per second and supplies fresh unpredictable encounter entropy in three-second blocks only after live commitments. Check timing, sequence, short disconnections, browser identity and single-use rewards; exact lost-response retries are idempotent and cannot rewrite input history.
Retire v1-v6 reward protocols rather than preserving the vulnerable endpoint: old pages/runs must refresh and restart. Keep 45 seconds, 24 jade, two shields, gold barriers, artwork and uninterrupted play; a lost connection ends the run rather than pausing time.
Require server-verified Cloudflare Turnstile for both starts and oath claims, checking hostname/action and single-use tokens with fail-closed behavior. Add per-source start/claim rate limits. Local test tokens require both an explicit binding and a localhost URL, never a production hostname.
CF Secrets: FREE_TOKEN_TURNSTILE_SITEKEY, FREE_TOKEN_TURNSTILE_SECRET, FREE_TOKEN_OPS_SECRET. Existing Actions verify issuance with a private 30-second HMAC signature bound to method/path/raw body. This key is never exposed to clients and does not bypass live game checks; it is derived from existing Render management credentials, so rerun security setup after changing those credentials.
These controls block the reported offline precomputation and basic direct scripts, not all live automation. An issued shared key can still be copied. Publication evidence is recorded above.

## Current state: new Yifu key synchronized, website reopened (2026-10-26 15:00 Asia/Shanghai)

Registered and verified a new Yifu client key, fingerprint `69ba11c6809909d7` (not a credential), then published the same value through CF `FREE_TOKEN_RENDER_KEY`. Apex/www claims both return `https://cpa-dhke.onrender.com/v1` with that key; models HTTP 200 / 34 models.
Actual mobile token clicks at 393x580 on both domains restore the original transition to `/free-token/choose/`, with no script errors. Availability is open; pages, artwork, game rules and Worker modules are unchanged.
Current parent `fd79879f-4dbc-43c9-b5fa-d9cf240b9b59`; entrance remains `51a33be8-6ca4-4b4f-886f-613bfea996b0`. Render deploy `dep-dbffl1cs728c73f95fqg` reuses the existing code.
Four Render keys remain: this sole Yifu issuance key, the two original keys and standalone Karl (`162618109a2dc43b`, independently reverified models HTTP 200). All ten login files are preserved. Previously revoked Yifu keys stay revoked; future refreshes must revoke the replaced key while preserving Karl.
[Operation and verification](https://github.com/928886540/cloudflare_temp_email/actions/runs/40283102427) succeeded. Sanitized evidence: `.github/operations/render-client-keys/yifu-open-20261026.json`; no raw key is recorded. Sections below are historical.

## Added: standalone long-lived Karl key (2026-10-26 13:24 Asia/Shanghai)

Created the requested `sk-karl-` plus eight random digits. The raw key is excluded from source/logs; its fingerprint is `162618109a2dc43b`.
This is a Render-only client key with no automatic expiry, unrelated to Yifu website issuance. Models returned HTTP 200 with 34 models. Render now has three keys, retaining both originals, and all ten login files were backed up/restored.
Deploy `dep-dbfe7q8473hc73crcqr0` reuses the original build. CF parent `096277f9-58f3-4671-a137-b4cb2cdcd21b`, entrance `51a33be8-6ca4-4b4f-886f-613bfea996b0`, modules and pages are unchanged. `FREE_TOKEN_RENDER_KEY` remains absent and apex/www remain closed.
[Operation/verification](https://github.com/928886540/cloudflare_temp_email/actions/runs/40273968410) succeeded; all fourteen operation tests passed. Sanitized record: `.github/operations/render-client-keys/karl-20261026.json`. The key is stored only in Render and the private local delivery file; future website toggles/Yifu rotations must preserve it. Encrypted artifact retention does not define API-key lifetime.


## Standalone long-lived client keys, separate from website issuance

The add workflow now supports `use_custom_key=true`, a prefix and 6–12 random digits, requiring `publish=false`. It writes no CF Secret, does not reopen the website and sets no automatic expiry. The recipient supplies an RSA public key; Actions retains only the encrypted key while the private key stays local. Logs/source record fingerprints only.
The user requested Karl: `sk-karl-` plus eight random digits. This standalone long-lived key must survive subsequent Yifu website toggles/rotations. Existing ordinary keys and login files are preserved.


## Current state: temporarily closed, Yifu key revoked (2026-10-26 04:16 UTC)

The requested two-state click behavior is implemented and currently CLOSED. Yifu fingerprint `01db29c9e73f5fba` was removed from Render and returns models HTTP 401; CF `FREE_TOKEN_RENDER_KEY` is absent.
Current parent `096277f9-58f3-4671-a137-b4cb2cdcd21b` is the Secret-disabled version of source release `51310ec6-e00b-4308-b729-bcfc7af6f111`. Entrance stays `51a33be8-6ca4-4b4f-886f-613bfea996b0`. Render deploy `dep-dbfd805g1s2s73fbrr7g` preserves the two other client keys and all ten login files.

- Closed: the token remains clickable, showing only “暂未开放” without transition/navigation; both reward paths return 503 without a key.
- Open: default `yifu-add-key.yaml` registers/verifies/publishes a new key; the next click restores the original animation and choice-page entry, with no page deployment or refresh needed.
- Close: default `yifu-remove-key.yaml` removes the currently issued key and closes the entrance automatically. No automatic reopening schedule; never restore a revoked key/old Worker version to reopen.

No-store `GET /api/free-token/status` contains no key and follows only the issuance Secret. Add/remove workflows verify it, and website releases preserve a missing-Secret closed state. Historical inspect assumes open claims; use default add/remove dry runs while closed.
[Entrance publication](https://github.com/928886540/cloudflare_temp_email/actions/runs/40268031184) passed, along with eighteen backend checks and ten key-operation tests. [Revocation](https://github.com/928886540/cloudflare_temp_email/actions/runs/40268141055) succeeded.
Real apex/www open clicks and subsequent real closed clicks were verified separately; both reward paths are now 503. Five layout/input scenarios with mocked availability verified closed clicks, reopening without refresh, touch, keyboard and reduced motion. Artwork, v6 game/barrier mechanics, corridor protection and forwarding remain intact.
Evidence: `verification/availability-release-and-close.json`, `availability-live-*.json`, `availability-browser-*.json`. Sections below are historical.


## Token entrance: open and temporarily closed states

New `GET /api/free-token/status` exposes only an open boolean and message, never a key, with no-store caching. Its single source of truth is whether `FREE_TOKEN_RENDER_KEY` exists; no separate toggle is added.
`token-passage-v2.js` reads fresh state on every click. Closed clicks stay on the full-token artwork and show “暂未开放”; open clicks retain the original transition and `/free-token/choose/` destination. Touch, keyboard and reduced-motion paths are gated too. Reopening works on the next click without refreshing an old page.
Removing the current Yifu key revokes it in Render and removes the CF issuance Secret, automatically closing the entrance and returning 503 for both reward paths. Adding/publishing a new key restores the original entrance. Other client keys, logins and artwork remain intact.
Key workflows verify entrance state, and website releases now preserve either open or closed state without recreating a missing Secret. Reopen by registering a new key, never restoring an old revoked key/version.


## Published: sword-tip pickup and generated golden barrier v6 (2026-10-26 02:02 UTC)

Parent `0e79d9a0-048b-46d8-b109-0b4cde0a76aa`; entrance stays `51a33be8-6ca4-4b4f-886f-613bfea996b0`; client `app-v8.mjs`, shared rules v6.
[Publication acceptance](https://github.com/928886540/cloudflare_temp_email/actions/runs/40257121629) and all seventeen backend checks passed: tip/blade pickup, unchanged damage hitbox, same-frame gold blocking, five-second expiry, refresh without stacking, and in-flight v1-v5 replay.
The token and transparent ornate gold barrier are native image_gen art (about 152KB/442KB WebP). Pickup feedback follows the actual tip contact. Gold is separate from jade, grants five seconds of invincibility and a HUD countdown, and does not heal lost shields.
A real public v6 replay collected two gold tokens and blocked seventeen swords, finishing with 24 jade/one shield. Concurrent rewards returned 409/200/409. Current fingerprint remains `01db29c9e73f5fba`, models HTTP 200 (22 models this time); Render/keys are unchanged and the revoked key stays revoked.
All 33 release resources match source, eight protected originals remain intact, and apex/www match. Public mobile/short/landscape browser fixtures verify tip-before-hilt pickup, same-frame blocking, five-second expiry and both generated transparent assets without script errors; real redemption is verified separately through public APIs.
Keep uninterrupted play, fair v5 sword patterns, natural open lanes, no floating gap boxes, win-condition-only start copy and ten taunts. Evidence: `verification/release-v6.json`, `production-v6.json`, `tip-ward-browser-*.json`, `golden-ward-art.json`, `difficulty-v6-fixture.json`. Sections below are historical.


## Published: remove floating rectangles and gap labels (2026-10-26 01:30 UTC)

Parent `190a247f-8f89-4437-b41d-137cf2760145`; entrance remains `51a33be8-6ca4-4b4f-886f-613bfea996b0`; client `app-v7.mjs`.
Only the falling dashed/transparent rectangle and gap label are removed; players read the formation's open space. The v5 engine, actual corridor protection, difficulty, uninterrupted play, win conditions and ten taunts are unchanged.
[Publication acceptance](https://github.com/928886540/cloudflare_temp_email/actions/runs/40254536775) and all twelve mandatory stage tests passed. Apex/www load the source-matching client without box/label rendering; v5 engine bytes remain identical.
Public browser/wall-scene checks at 320x480, 393x580 and 844x390 passed with a mocked start API; this visual-only change does not claim another real game redemption. Publication verified original claim/models HTTP 200, the same current key, GAME_RUNS and forwarding structure; Render is unchanged.
Evidence: `verification/no-gap-marker-*.json`, `release-no-gap-markers.json`. The user rejected debug-like safe-zone cues; do not restore them. Sections below are historical.


## Published: v5 fair sword patterns and concise win conditions (2026-10-26 01:16 UTC)

Parent `8a812fa0-2aec-4ebb-ba29-bff5442ff8d0`; entrance remains `51a33be8-6ca4-4b4f-886f-613bfea996b0`.
[Publication acceptance](https://github.com/928886540/cloudflare_temp_email/actions/runs/40253418901) passed. All twelve backend tests passed, including ninety reachable/unblocked wall-gap scenarios, no ricochets, v1-v4 compatibility and SQLite concurrent reward protection.
The game uses v5 / app-v6: lower middle/final density and speed, stable protected three-lane gaps with visible markers. Retain 45 seconds, 24 jade, two shields, uninterrupted play and ten playful taunts.
Public instructions list only win conditions. Start/HUD copy does not preannounce final-five or later mechanics. The user wants challenge without unavoidable traps or forced losses; preserve this preference.

Real public v5 redemption succeeded with 24 jade/two shields; concurrent finishes returned 409/200/409. The current key fingerprint remains `01db29c9e73f5fba`, models HTTP 200 with 34 models. Render, keys and character artwork are unchanged.
All 28 release resources match source, eight protected originals remain intact, and apex/www match. Public browser tests at 320x480, 393x580 and 844x390 mock start to verify spoiler-free copy, uninterrupted touch/background progression, failure controls and phase markers without script errors; real redemption is verified separately through public APIs.
GAME_RUNS, ASSETS, SITE/Site routing and in-flight older runs remain intact; yesterday's revoked key stays revoked. Evidence: `verification/release-v5.json`, `production-v5.json`, `fairness-v5.json`, `fairness-browser-*.json`. Sections below are historical.


## Yesterday's Yifu key revoked (2026-10-26 00:46 UTC)

The user explicitly clarified that refreshing means replacing and revoking the prior Yifu key. [Revocation and verification](https://github.com/928886540/cloudflare_temp_email/actions/runs/40250878059) passed.
Yesterday's `7fa19b84ca57a2ba` was removed from Render and returns models HTTP 401. The website still issues only new `01db29c9e73f5fba`, with models HTTP 200.
Render retains three client keys: the current Yifu key and two other original keys. All ten login files were restored. Deploy `dep-dbfa5eq9lscs739btcq0` uses unchanged code.
CF parent remains `c6a75a10-b1bd-4a93-ba54-8d4ba2236408`, entrance `51a33be8-6ca4-4b4f-886f-613bfea996b0`; website/game code and new-key issuance are unchanged.
Future Yifu key refreshes must verify/publish the new key and then revoke the prior Yifu key, never append only. Evidence: `verification/key-revocation-20261026.json`. Sections below are historical.


## User correction: refreshing Yifu keys requires revocation (2026-10-26)

“Update/replace the Yifu key” means rotation, not append-only: keep the newest Yifu issuance key.
Capture the old published fingerprint, register and verify the new key, publish it, then revoke the captured old Yifu key using an explicit fingerprint in `yifu-remove-key.yaml`. Verify old 401 and new 200.
Never remove default `current` after switching, which would delete the new key. Preserve unrelated original client keys and login files. Append-only retention requires an explicit request to add another key and keep the old Yifu key.
This correction revokes yesterday's `7fa19b84ca57a2ba` and retains current `01db29c9e73f5fba`; fingerprints contain no raw credential values.


## Current issued key refreshed (2026-10-26 00:39 UTC)

Completed the requested new Yifu client key using default-branch `yifu-add-key.yaml`, `publish=true`.
The new key fingerprint is `01db29c9e73f5fba` (not a credential). Render now has four keys: all three prior keys remain valid, and all ten login files were backed up and restored.
Render deploy `dep-dbfa25cs728c73elg030` reuses commit `f9cee393e5360db6b47dd18d6c2747a2e6c6cbb7`. Old/new key model checks passed; the new key returned models HTTP 200 with 34 models.
Website `FREE_TOKEN_RENDER_KEY` issues that same new key; the API base remains `https://cpa-dhke.onrender.com/v1`.
Current parent version is `c6a75a10-b1bd-4a93-ba54-8d4ba2236408`; entrance remains `51a33be8-6ca4-4b4f-886f-613bfea996b0`. This operation only changed the Secret: all Worker modules, pages/effects, v4 game rules, other bindings and Render environment settings remain intact.
[Operation and verification](https://github.com/928886540/cloudflare_temp_email/actions/runs/40250335029); sanitized result: `verification/key-rotation-20261026.json`. Keep using the fixed workflow and live version reads for future key changes. Sections below are historical.


## Published: v4 final-five rage and ten taunts (2026-10-26 00:24 UTC)

Parent `ad78a420-ae8e-4df3-86b4-8b2f3d3edca3`; entrance stays `51a33be8-6ca4-4b4f-886f-613bfea996b0` with SITE → Site intact.
[Publication acceptance](https://github.com/928886540/cloudflare_temp_email/actions/runs/40249180162) passed; all nine backend stage tests passed.
New v4 / app-v5 runs use 45 seconds, 24 jade and two shields. Rage starts at 19 collected (five remaining), independently of remaining time. At 24, jade stops and pure survival continues to 45 seconds.
Defeats choose one of ten emoji taunts, including the user's three lines and playful Chinese poem adaptations, with retry and direct oath claim. No pause; exit returns to choices.

A real public v4 reward succeeded with 24 jade and one shield; concurrent finishes returned 409/409/200. Original/game claims share the existing key; models returned 200 with 34 models.
All 26 release resources match source, eight protected original assets/scripts remain intact, and apex/www match. Public browser tests at 320x480, 393x580 and 844x390 mocked start to verify short screens, uninterrupted drag/background settlement, visible taunts/controls, and 19/24-jade states with no script errors. Real redemption was verified separately through public APIs.
Keys, Render configuration, star-night artwork, ASSETS, GAME_RUNS namespace and v1/v2/v3 in-flight replay are preserved. See `verification/production-v4.json`, `rage-browser-*.json` and `release-v4.json`. Sections below are historical.


## Published: all pause behavior removed (2026-10-25 23:50 UTC)

Parent: `423d9f41-8557-4716-92d1-9b0035f63719`; entrance remains `51a33be8-6ca4-4b4f-886f-613bfea996b0`.
The page loads `app-v4.mjs`, removing pause/resume controls, Space/Escape pause and automatic focus/background
pause. Countdown/combat advance by real elapsed time, catching up on background/BFCache return. Touch dragging
and focus changes do not stop play. The user explicitly forbids pause; do not restore it from historical clients.
Rules remain v3 with two shields, 30 seconds and 16 jade.

[Acceptance](https://github.com/928886540/cloudflare_temp_email/actions/runs/40246534213) passed. Apex/www game
HTML and app-v4 match source and contain no pause/resume controls. A public 393x580 browser with a deterministic
start-API fixture validated continuous drag, repeated blur, Space/Escape and time-jump return after suspended
callbacks with no pause or script errors. That browser test mocks start and does not claim a new real reward
redemption; publication checks confirmed real original claims/models HTTP 200 and unchanged rewards. Engines,
keys, artwork and GAME_RUNS are unchanged; all six backend stage checks passed. See source evidence
`verification/no-pause-browser*.json` and `no-pause-public-source.json`.

## Current v3 release: two shields and character artwork (2026-10-25 17:05 UTC)

Parent: `168571b3-3eab-46c8-89f4-310b62491bf4`; entrance remains
`51a33be8-6ca4-4b4f-886f-613bfea996b0`. New runs have two shields, faster/more frequent
hazards and increased double swords. Browser/server share `engine-v3.mjs`; older runs
retain original replay. Duration stays 30 seconds with 16 jade and exit to choices.
Native image_gen refreshed all four adult-character posters with fuller figures, deeper
necklines and bare shoulders, published as homepage v6 / token v4 URLs.

[Acceptance](https://github.com/928886540/cloudflare_temp_email/actions/runs/40214794565) passed:
public starts confirm two shields; game/original rewards share the existing key, models
returns 200, and concurrent finishes return 409/409/200. All 21 resources, apex/www parity
and mobile browser checks passed. Keys, original assets and GAME_RUNS remain intact. See
source `verification/*v3.json` and `artwork-v6.json`; versions below are historical.

## Current release: dedicated choices and trial v2 (2026-10-25 16:40 UTC)

Maintenance source is now `sites/leonmingod-star-night/`, recovered and updated during this task.
Parent: `f9576720-5c7f-4909-a685-5e145fc25001`. Forwarder:
`51a33be8-6ca4-4b4f-886f-613bfea996b0`. Forwarding source is unchanged; SITE now targets the
parent's named `Site` entrypoint. Preserve its specific routes, ASSETS, Secrets, and GAME_RUNS.
The single-token entrance leads to `/free-token/choose/`; game exit returns there. Trial v2
requires 16 jade in 30 seconds with three shields.

[Publication](https://github.com/928886540/cloudflare_temp_email/actions/runs/40212806612) passed.
Both public reward paths return the same existing key, fingerprint `7fa19b84ca57a2ba`; models
returns 200 with 22 models. Concurrent game claims return 200/409/409. All 14 updated resources,
eight protected originals, and apex/www parity checks passed. See the source directory's
`WEBSITE_UPDATE_CN.md` and sanitized `verification/` evidence.

Keeping ASSETS also retains its routing: do not expect setting `assets.config.run_worker_first`
alone to replace that behavior. Preserve the named entrypoint binding. HTML comparisons remove
only the injected CF analytics script and its extra newline. Version numbers and deployment
assumptions further below are historical.

## Latest website handoff takes precedence (2026-10-25)

Read [the star-night and game handoff](./leonmingod-star-night-handoff.md) first.
The parent is now `2bc44ccd-b647-483b-aca7-256ea46ad69c`, with `GAME_RUNS` and a game
reward path. Current source belongs to the user's separate website directory, not yet
uploaded here. Historical page deployment/source assumptions below must not overwrite
production. Both claim paths use `FREE_TOKEN_RENDER_KEY`; existing Actions credentials
were reverified and remain usable.

## Routine one-run operations: add / remove

Both operations are installed on default branch `main`; no script edits, static version
refreshes, or temporary backup private keys are needed for the next operation.

| Operation | Default behavior | Actions entry |
| --- | --- | --- |
| Add Yifu key | Append a Render client key and publish it through website claims | [添加义父 Key](https://github.com/928886540/cloudflare_temp_email/actions/workflows/yifu-add-key.yaml) |
| Remove Yifu key | Stop website issuance of the current key, remove it from Render, and verify HTTP 401 | [移除义父 Key](https://github.com/928886540/cloudflare_temp_email/actions/workflows/yifu-remove-key.yaml) |

```bash
gh workflow run yifu-add-key.yaml -R 928886540/cloudflare_temp_email
gh workflow run yifu-remove-key.yaml -R 928886540/cloudflare_temp_email
```

For add, `publish=false` changes only Render. For remove, an optional 16-character
SHA-256 `fingerprint` selects another key without changing the currently issued key;
omission targets the website's current key. `dry_run=true` is read-only. Adding retains
existing keys; removal affects only the selected key and cannot delete the final client key.

Shared implementation: `.github/scripts/yifu_keys.py` and `yifu_key_api.py`. Preparation
reads live state and uploads an authenticated encrypted recovery plan before mutation.
Apply rechecks versions, configuration, and login files, aborting on concurrent changes.
It redeploys the existing build, restores login files, and updates/deletes only the CF
Secret without uploading page code. Removing the active key makes claims return HTTP
503; adding with publication reopens issuance.

AES-GCM encryption uses a salted key derived from the existing `RENDER_API_KEY`; no extra
secret setup is needed. Recovery plans are retained for seven days; results are retained
for 90 days and written to the Actions summary. After credential rotation, old backups
still require the original management credential to decrypt. Failed apply steps attempt
login-file recovery. The fixed workflow removes manual editing and repeated preparation,
but Render redeployment still takes time. Legacy issuance/migration workflows remain
historical; use the two routine entries above.

## Current issued Yifu key — 2026-10-25 21:03 Asia/Shanghai

A new client key is registered and issued by the website. Its value stays in Render
and the CF Secret; its identifying SHA-256 prefix is `7fa19b84ca57a2ba` (not an authentication credential).
Render has three client keys, preserving both originals; all ten login files were restored.
Website claims and `/v1/models` with the issued key both return HTTP 200, with 34 models
at acceptance. Pages, effects, and source modules are unchanged.

- Parent version: `fad0e247-77a5-43c2-b708-737898d88ea4`, only `FREE_TOKEN_RENDER_KEY` updated.
- Unchanged entrance version: `69575cec-ac2c-416f-81b9-b64030e87651`.
- Render deploy: `dep-dbevs57b9u1s73b4q6pg`, using the existing build.
- [Issuance and acceptance evidence](https://github.com/928886540/cloudflare_temp_email/actions/runs/40195833941).
- Use `Issue and publish Yifu Token key`: inspect, review/refresh guards, then explicitly issue.
  Do not rerun historical migration or default to revocation. The current parent includes
  both `index.js` and `index.js.map`; the older single-module assumption no longer applies.
  New issuance updates only the CF Secret and compares all module hashes.

## Add and publish a Yifu client key

Use the working branch's `Issue and publish Yifu Token key` workflow. Its default
`inspect` mode is read-only. Explicit `issue` appends a new Render client key,
redeploys the existing build, restores login files, verifies old and new keys,
then updates only the parent Worker's `FREE_TOKEN_RENDER_KEY` Secret so the
website issues the same new key. The entrance Worker, homepage, mobile effects,
and source modules are not redeployed. SHA-256 checks cover all parent modules,
including `index.js.map`; the parent CF version changes with the Secret update.

The script is `.github/scripts/issue_yifu_key.py`, separate from historical
one-time migration and key revocation. The historical workflow now also defaults
to `inspect`, preventing automatic revocation on push. Read current parent/entrance
versions, module hashes, and Render deployment before refreshing guards. Encrypted
backups use `yifu-issue-backup-public.pem`; retain its matching private key outside
the repository. Never commit client keys or private keys. Issuance appends without
removing existing Render keys; a failed website switch restores the previous CF version.

## User-defined shorthand (confirmed 2026-10-25)

| User phrase | Meaning and action in this project |
| --- | --- |
| 义父 Token / 义父token | This Free Token website: `https://leonmingod.com/free-token/` |
| 加一个义父密钥 | Append a new client API key to Render service `cpa`, retaining existing keys and configuration |
| 打开义父 Token 给别人用 | Publish issuance of the corresponding client key through the website claim flow; synchronize the same key between the CF Secret and Render, then verify the deployment |

“义父密钥” is a client credential for API consumers, not the Render management
credential `RENDER_API_KEY`. “打开给别人用” requests website issuance, not just
browser navigation. A request to add a key alone does not replace the website's
currently issued key; enable website distribution when requested, identifying the
intended key from session context. Reuse the established repository, services,
and GitHub Secrets instead of recreating resources because a different shorthand is used.

## Mobile fluid performance fix

Deployed at 2026-10-25 01:18 Asia/Shanghai. Code commit `89de9160c60e63f6a3c937d15e461dcd79155cfa`;
entrance version `2abf9c44-faf5-4f98-80fa-e383108cca07`, parent still `8aa85754-acf1-498e-91ad-78117e40f8e5`.
[Deployment and verification](https://github.com/928886540/cloudflare_temp_email/actions/runs/40115492703) passed.
Live entrance, claim HTML, and v2 scripts match the tested preview; the homepage matches its pre-deployment state.

Touch devices use dye resolution 256, simulation resolution 64, six pressure iterations,
a 30 FPS ceiling, and a pixel ratio cap of one. Lower-power devices use 192 / 48 / 4
with a 24 FPS ceiling. Mobile rendering pauses after 2.5 seconds idle and resumes on
touch; screen/keyboard resize bursts are debounced for 150ms. Mobile token and claim
card glows remain, while costly multilayer shadows, blur, and live backdrop blur are
removed. Desktop quality and hover effects remain.

The dedicated `/free-token/fluid-v2.js` engine is served from `assets/token-fluid-v2.txt`,
retaining its MIT license. It adds frame/pixel budgets and prevents the original engine
from overriding explicit mobile dye settings back to 512. Page control uses the new
`/free-token/effects-v2.js` URL; the homepage `/vendor/fluid.js` is unchanged.
Checks cover DPR=3 normal/low-power touch profiles, desktop, actual WebGL drawing
rate limits, idle pause, resize batching, token navigation, and confirmation inputs.
Browser emulation is not a physical-device measurement on the user's iPhone.

The fix preserves subsequent repository changes including four homepage links, branding,
centered claim cards, and exit behavior. It does not change Render configuration or keys.

`https://leonmingod.com/api/free-token/claim` retains its existing confirmation request.
Successful responses return `baseUrl: https://cpa-dhke.onrender.com/v1` and the same client
key registered with Render CPA. The main Worker stores it as `FREE_TOKEN_RENDER_KEY`;
the original `FREE_TOKEN_CPA_KEY` remains in place. Homepage artwork, pill navigation,
the fullscreen Free Token layout, and token interactions are preserved.

## Latest page deployment — 2026-10-24 05:23 UTC

The entrance and claim pages now share the homepage jade/gold fluid effects. Token
motion is approximately 7px with a stronger outline and breathing glow. Mobile claim
cards are capped at 340px with reduced artwork/form spacing. The confirmation button
ends around 511px in a 393×664 viewport and remains within the first viewport at 320×480.

| Item | Current page deployment |
| --- | --- |
| Page code commit | `60af1c18e1fcc1df18086c9210fe7e4a9ab6cca4`, website working branch |
| New entrance Worker version | `5e32ed4c-a405-4e69-872d-f88526cba7d9` |
| Entrance deployment ID | `1a433adb-05de-4fd9-bee1-00c6da262e19` |
| Parent Worker version | Still `8aa85754-acf1-498e-91ad-78117e40f8e5` |
| Deployment evidence | <https://github.com/928886540/cloudflare_temp_email/actions/runs/40066068773> |
| Render operations | None; URL, key, parent source, and homepage content preserved; issued key still returns models HTTP 200 with 50 models |

`src/token-scene.js` reuses `/vendor/fluid.js`. `src/claim.js` compacts the original
claim HTML through HTMLRewriter without rewriting its application confirmation, claim,
or copy flows. The new browser script `/free-token/effects-v1.js` uses immutable caching:
future script changes must also update its URL version. Effects do not intercept links,
forms, or dialogs; reduced motion, unavailable WebGL, hidden pages, and idle pauses are supported.

Chromium rendering checks covered 320×480, 375×548, 393×664, 430×740, and 1440×900,
plus landscape token alignment, navigation, input/confirmation/refusal/credential dialogs,
reduced motion, and WebGL fallback. Deployed content matches the tested preview excluding
Cloudflare's injected analytics script; all four original images were retained. The 05:08
integration version table below is historical. Consult this newer entrance snapshot and
read actual live versions again before future changes.

## Landscape homepage navigation update (completed)

After the page release, the user reported that the three homepage navigation links
are too small at the bottom in landscape and supplied a screenshot with three red circles.
Implemented and deployed as requested by user screenshot:

- Target the homepage `https://leonmingod.com/`, editing `src/homepage.js` on the website branch.
- Move the three links below the logo/slogan on the right, matching the marked circles.
  Approximate centers in the 1920×909 reference are `(61%,72%)`, `(70%,73%)`, and `(81%,74%)`.
  These are composition references, not fixed pixel coordinates.
- Use green circular buttons approximately matching the marked 130–150px diameters at that
  reference size, with readable icons/text. Preserve left-to-right order and destinations:
  mailbox, Free Token entrance, Address Proof.
- Increase other interface text appropriately, particularly effect controls and hints.
  Preserve the current background and fluid effects.
- Validate responsive landscape placement at 1920×909 and smaller phone landscape sizes,
  avoiding overlap and clipping; also regress portrait, token entrance, and claim pages.
- The user is opening a new session. Use both the annotated screenshot and this record,
  then implement, verify in an actual browser, and deploy.

## Configuration source

Render service `cpa` uses the private repository `928886540/cpa`, branch `main`, and
starts with `./CLIProxyAPI --config /etc/secrets/config.yaml`. A client key is appended
to `api-keys` (or the newer `access.api-keys`) in that Secret File. Other settings remain unchanged.

The `Connect Free Token to Render` GitHub Actions workflow uses repository secrets
`RENDER_API_KEY`, `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_API_TOKEN`.
`RENDER_API_KEY` authorizes Render management; it must never be issued as a client key.

## Deployment and verification

Pushes run `inspect` only. Before manually choosing `connect`, review the current parent
and entrance Worker versions and Render commit, then update the script's version guards.
The script preserves existing client keys, encrypts a backup of configuration and login
files, appends a new key, and redeploys the existing build. Without a persistent disk,
it restores missing login files through CPA management, preserving disabled states.
The encrypted recovery backup is retained as an Actions artifact for two days. Its
private decryption key is kept separately in the execution workspace, outside version
control, and is not included in the Actions artifact.

Only after both new and existing keys pass `/v1/models` verification does the script
switch the claim URL and Secret reference in the parent Worker. It then verifies key
equality and compares page, image, and interaction script bytes. Failed verification
restores the previous parent version. The entrance Worker is not redeployed.

`sites/free-token-home/src/site-original.js` remains the original parent source backup.
The connection script reads, checks, and minimally edits the live source. Version guards
in the older entrance deployment script are not refreshed automatically; do not rerun it unchanged.

## Operations handoff — 2026-10-24

The integration is deployed and complete. Full acceptance at **2026-10-24 05:08 UTC**
confirmed the new claim URL, HTTP 200 from `/v1/models` with the issued key, and 50 models.
Both original client keys still worked; all eight login files were restored. Configuration
and environment variables were preserved, and pages, four images, and interaction scripts
passed byte comparisons. All versions and counts below are snapshots: read live state again
before making changes.

### Repositories and endpoints

| Purpose | Location |
| --- | --- |
| Homepage | `https://leonmingod.com/` |
| Free Token entrance | `https://leonmingod.com/free-token/` |
| Claim page | `https://leonmingod.com/free-token/claim/` |
| Claim API | `POST https://leonmingod.com/api/free-token/claim` |
| Issued API Base URL | `https://cpa-dhke.onrender.com/v1` |
| Website repository | `928886540/cloudflare_temp_email` |
| Website working branch | `codex/free-token-home-20261024` |
| Website code | `sites/free-token-home/` on the working branch |
| Integration script | `.github/scripts/free_token_render.py` on the working branch |
| Integration workflow | `.github/workflows/connect-render-free-token.yaml` on the working branch |
| Deployed integration commit | `e3d6320dcd65a9192cc705d4926aa4157e207893` |

This record and its root `AGENTS.md` index are saved on both default branch `main` and
the working branch. **Documentation on `main` does not mean the website branch has been
merged.** If a new session cannot find the website source, fetch and switch to the
working branch instead of recreating the site.

### Cloudflare

| Setting | Verified value |
| --- | --- |
| Parent Worker | `leonmingod-home`: original assets and claim API |
| Entrance Worker | `leonmingod-free-token`: homepage transformation and token entrance |
| Entrance service binding | `SITE` → `leonmingod-home` |
| Zone | `leonmingod.com`, ID `4f078f06b815a404337c3b5387c45275` |
| Post-cutover parent version | `8aa85754-acf1-498e-91ad-78117e40f8e5` |
| Entrance version, unchanged | `4fda0cc3-1bdd-4b31-a5e6-9012b933931b` |
| Pre-cutover parent version | `b3943206-85ca-4ca0-8617-951317245755` |
| Parent bindings | `ASSETS` (assets), `FREE_TOKEN_CPA_KEY`, `FREE_TOKEN_RENDER_KEY` (secret_text) |
| Active claim binding | `FREE_TOKEN_RENDER_KEY` |
| Post-cutover parent source SHA-256 | `1bfd639be2c04996d8e7fac80c2ab42e085acc5200f416b02a2904adc749562a` |

Entrance routes on the apex and www hosts cover `/`, `/index.html`, `/free-token`,
`/free-token/*`, both `home-hero-*-v4.webp` images, and `/home-scene-v4.js`. The original
parent serves the claim API. Treat these as separate deployment targets.

`src/site-original.js` is a **historical backup** containing the old URL and binding.
Never upload it directly over the production parent. The cutover changed only its two
`env.FREE_TOKEN_CPA_KEY` references and one old API URL; static assets were retained.
Use the actual live source and this record as the current production reference.

### Render

| Setting | Verified value |
| --- | --- |
| Workspace | User-selected `My Workspace`, `tea-d779tahr0fns73e1h3lg` |
| Service | `cpa`, `srv-d9c4kkvavr4c73ab3sfg` |
| Dashboard | `https://dashboard.render.com/web/srv-d9c4kkvavr4c73ab3sfg` |
| Connected repository | Private `https://github.com/928886540/cpa`, branch `main` |
| Public repository | `928886540/CLIProxyAPI` is not the connected deployment repository |
| Runtime | Docker, `./Dockerfile`, context `.` |
| Start command | `./CLIProxyAPI --config /etc/secrets/config.yaml` |
| Secret File | Filename `config.yaml`, runtime path `/etc/secrets/config.yaml` |
| Client keys | Root `api-keys` list; three keys: two originals plus the new client key |
| Management API | `/v8/management`; management and client keys serve different purposes |
| Environment variables | `MANAGEMENT_PASSWORD`, `MANAGEMENT_STATIC_PATH`; values unchanged |
| Code commit | `f9cee393e5360db6b47dd18d6c2747a2e6c6cbb7`, v8.0.22 |
| Successful deployment | `dep-dbe3q94s728c7392m8kg`; existing build, no code upgrade |
| Health check | `/healthz`, HTTP 200 |
| Region and plan | Singapore, free, one instance |
| Auto-deploy | Enabled; pushes to the private repository's `main` trigger deployment |
| Persistent disk | None; back up login files before redeploying and restore afterward |

The runtime config file is read-only. Persist configuration through the Render Secret
File instead of relying on management UI writes to that path. Avoid pushing operational
notes to private `cpa/main`: that repository automatically deploys to production.

### Secret locations and access

| Name | Location and purpose |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Website repository Actions Secret; CF account selection |
| `CLOUDFLARE_API_TOKEN` | Website repository Actions Secret; verified CF management access |
| `RENDER_API_KEY` | Website repository Actions Secret; verified Render REST management access |
| `FREE_TOKEN_RENDER_KEY` | Parent CF Worker Secret; identical value appended to Render config and issued to users |
| `FREE_TOKEN_CPA_KEY` | Original parent CF Secret; retained, no longer used by claims |

Secrets settings: `https://github.com/928886540/cloudflare_temp_email/settings/secrets/actions`.
**Never write secret values to documentation, source, chat, or logs.** Repository
secrets do not become environment variables in a new chat workspace automatically.
A locally missing `RENDER_API_KEY` does not mean GitHub lacks it; use the existing Actions
channel instead of asking the user to create it again.

The Render tools available during this operation supported service reads, environment
variable updates, and deploys, but not Secret File reads/writes. Those operations used
the Render REST API through Actions at
`/v1/services/{serviceId}/secret-files/config.yaml` (`GET` or `PUT`). Single-file PUT accepts
`{"content": "complete updated file contents"}`. Read first, append the client key,
compare all unrelated configuration, and update only that file. Do not replace entire
environment-variable or Secret File collections.

### Procedure for the next change

1. Read this record and `AGENTS.md`; identify whether the change concerns the page,
   claim logic, or Render service. Switch to the website working branch.
2. Inspect current parent/entrance versions, live source, Render deployment, and Secret
   configuration before any mutation. On the working branch, the following runs a
   read-only inspection with sanitized output:

   ```bash
   gh workflow run issue-yifu-key.yaml \
     -R 928886540/cloudflare_temp_email \
     --ref codex/free-token-home-20261024 -f mode=inspect
   gh run list -R 928886540/cloudflare_temp_email \
     --workflow issue-yifu-key.yaml -L 3
   ```

3. Page changes use the entrance Worker deployment path. Preserve artwork, pill navigation,
   fullscreen cropping, and token interactions unless requested otherwise. Changes under
   `sites/free-token-home/**`, including README edits, trigger its workflow; review and
   refresh the entrance deployment guards before pushing such changes.
4. Claim changes must minimally edit freshly read parent source, preserving `ASSETS`
   and every Secret binding. Do not rerun the old `stage-render-free-token.yaml` task.
   `connect` is a completed **one-time migration**, with pre-cutover version and URL
   checks. It is not a routine redeployment command; updating only its version constants
   is insufficient. `inspect` remains available for read-only checks.
5. Before any Render redeploy, list/download every current login JSON and make a
   recoverable encrypted backup. Verify the existing configuration and keys before writing.
   Use a new backup key pair whose private key you hold. The checked-in public key belongs
   to this operation's workspace; a new session must not assume its private key is available.
6. Restore missing login files and disabled states after deployment. Verify original and
   new keys and confirm unrelated configuration and environment values were preserved.
7. Validate `/healthz` HTTP 200, the expected claim URL/key, and `/v1/models` HTTP 200
   with the issued key. Check confirmation validation, same-origin restrictions, GET 405,
   image hashes, navigation, fullscreen token markup, and interaction scripts.
8. Record new versions, commits, deploy IDs, and acceptance evidence. Guards must use
   freshly read and reviewed versions, not historical snapshots from this document.

The claim body remains JSON `{"oath":"义父","confirmed":true}`, with same-origin
`Origin: https://leonmingod.com` and `Cache-Control: no-store` responses. Do not print
the key returned by a claim test.

### Evidence and recovery

- Deployment and full acceptance: <https://github.com/928886540/cloudflare_temp_email/actions/runs/40065013859>
- Post-deployment read-only audit: <https://github.com/928886540/cloudflare_temp_email/actions/runs/40065097553>
- The deployment run retains `encrypted-render-integration-backup` for two days. It is
  not a permanent backup and does not contain its private decryption key. Make a fresh
  backup of current state before future operations.
- Parent rollback uses CF version deployments. Future changes should use their own
  immediate pre-deployment version as the rollback target. The pre-cutover `b394...`
  version issues the old domain; it is not a routine rollback target that retains Render.
- Eight login files and their disabled states were preserved in this operation. This
  does not make login storage persistent on the diskless Render service.
