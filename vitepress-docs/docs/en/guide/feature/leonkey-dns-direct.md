# One-time direct DNS cutover for LeonKey

On 2026-11-12 the owner explicitly authorized this operation using the existing Actions
Secret CLOUDFLARE_API_TOKEN. The credential stays in the runner process and is never exported or printed.

Scope is exactly ops.leonmingod.com and redeem.leonmingod.com: read and back up each unique
A/CNAME, switch to A 198.247.1.206 with TTL 300 and DNS-only, then verify by reading back.
Additional same-name records abort the entire operation before writes. Failed or ambiguous
writes are read back and reverted; concurrent changes are preserved and marked needs_review.
The artifact leonkey-dns-direct-<run_id> retains DNS metadata and results for 30 days, without credentials.

Only the task script/workflow push on codex/leonkey-dns-direct-20261112 triggers this operation.
No schedule or default-branch merge, website/mail/Worker/Tunnel/VPS deployment is involved.
Certificate and public-page verification follows over direct local SSH. Actual completion is
recorded in the Actions report and LeonKey's docs/31-DIRECT-VPS-ENTRY.md.

## Actual outcome (2026-11-12)

Authorized run 43171378373 failed the zone metadata preflight with 403/10000. After removing
the unnecessary Zone Read requirement, run 43171575661 failed GET dns_records with the
same 403/10000. Neither run wrote DNS or obtained a record backup. Workflow 415662917 was
manually disabled; the branch was not merged, and public traffic still goes through CF.

Continuation needs DNS read/edit access. Put a new token in the separate repository Secret
LEONKEY_DNS_API_TOKEN and preserve CLOUDFLARE_API_TOKEN for existing website deployments.
The workflow now prefers the dedicated Secret. Resume only the originally approved two-record
operation after access is ready; do not trigger other maintenance workflows.

## Successful cutover after permission update (2026-11-12 15:05 Asia/Shanghai)

The owner added DNS permissions to the existing token. Run 43171575661, attempt 2, passed.
Both original proxied CNAMEs were backed up, updated by their existing record IDs to
A 198.247.1.206, TTL 300, proxied=false, and read back. Credentials stayed in the runner;
no existing Secret, other DNS record, Worker, Tunnel or Access configuration was changed.
Workflow 415662917 was manually disabled again, with no schedule or default-branch merge.

Direct local SSH restarted the existing Caddy to end the previous ACME backoff; its
configuration was unchanged. Both certificates were issued successfully. External TLS 1.3
connections reached 198.247.1.206 with valid chains and SANs. Local admin login, redemption
and order query returned 200; admin paths on the customer domain returned 404, with no
CF headers or Access redirects. The original homepage remained 200 and 11 other protected
service PIDs were unchanged. DNS backups/report also reside on the VPS at
/var/backups/leonkey/dns-cutover-20261112T070559Z/.

The strict runtime check failed on 24 cumulative web memory.max events of unknown age,
without OOM or restarts. A subsequent 30-second observation found no new max/oom events.
This warning is retained and does not establish business capacity or a fully passing
strict check. No application changes/regression rerun; future actual renewal and payment
acceptance are still pending.
