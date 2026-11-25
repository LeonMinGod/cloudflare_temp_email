# CC Switch and account-pool status

The website maintenance source is `sites/leonmingod-star-night/` on `codex/free-token-home-20261024`.

## Import a claimed key

The oath result, locally saved key dialog and game reward provide **Connect to CC Switch**. The dialog offers Claude, Codex and Gemini, an editable provider name and a required primary model. Models come directly from authenticated `GET https://cpa-dhke.onrender.com/v1/models` using the displayed personal key. No model IDs are hardcoded. Failed or empty model responses leave import disabled and offer retry.

Only a deliberate submit builds `ccswitch://v1/import`. Codex uses the `/v1` endpoint and Responses; Claude uses the origin and Anthropic; Gemini uses the origin and its native format. The selected model ID is preserved, including aliases. The link is not embedded in page HTML or stored in HTTP query parameters. Existing client configuration is not automatically enabled. Browser launching still requires CC Switch to be installed and the user's confirmation.

Implementation: `ccswitch-v1.mjs` and `ccswitch-v1.css`. Protocol reference: [CC Switch's integration guide](https://github.com/farion1231/cc-switch/blob/main/docs/guides/deeplink-site-integration-guide-en.md).

## Read the account pool

The token entrance links to `/model-status/`. `GET /api/pool-status` reads CPA v8 credential metadata and registered models on the server. It returns status counts, anonymous keyed account IDs, per-model availability and explicitly observed quota percentages. It never returns credential files, email addresses, names, paths, API keys, management credentials or upstream error messages.

The Worker requires the server-only `CPA_STATUS_MANAGEMENT_KEY` Secret and existing `FREE_TOKEN_OPS_SECRET` and `KV` bindings. Set it through `leonmingod-security.yaml` mode `pool-setup`; the setup reads the existing Render configuration through GitHub Secrets, verifies access, and installs only the Cloudflare Secret. It does not change Render configuration, deployments, client keys or OAuth files. Re-read the main Worker version after setup before staging a release.

The sanitized snapshot is cached in KV for 30 seconds. At most 24 account model lists are loaded with four parallel requests; incomplete coverage is labeled. On temporary upstream failure the previous snapshot can be shown for at most ten minutes with an explicit stale notice. Unknown quota stays unknown. The browser refreshes every 30 seconds while visible. No model generation or quota-reset requests are made.

## Current visual direction

Released as v53 on 2026-10-29: parent `71cc78b8-48bc-4d9a-ac7b-a5cd73b20386`, with all 11 bindings retained. Stage 40904919911 passed 45 tests; publish 40905233018 and 46 public resource comparisons passed. Runtime tests execute the actual pool code in Workers: fetch uses `redirect: 'manual'`, rejects redirects, and never forwards credentials to their destination. The browser's `error` redirect mode is unsupported at the edge. Production status returned 13 anonymous accounts and 35 registered models at verification; these counts change over time. CC Switch browser QA used dummy credentials and isolated mocked models; native app launch was not tested.

The latest user request enables flow by default, superseding older instructions that kept it off. `home-scene-v6.js` strengthens interactive jade trails, with reduced-motion and manual-off support. Four new native-image_gen backgrounds use a star-sea observatory and a celestial moongate; home art is v7 and token art is v5. Text is rendered by HTML. The old orb caption and duplicated palm layer are removed; `jade-orb-v4.webp` is an independent transparent animated sprite. Preserve the existing navigation, full token cord, transition, email flow and game rules.
