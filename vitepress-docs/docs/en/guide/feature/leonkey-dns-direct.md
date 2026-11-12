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
