# Yifu bounded admission gateway

Standard-library Go reverse proxy for the dedicated public VPS. It listens only
on 127.0.0.1:8319 and forwards to the unchanged CPA on 127.0.0.1:8317. The monitor
stays on 8318. Deploy with the protected `yifu-vps.yaml` `apply-safety` mode.

Generation POSTs under v1/v1beta/v1alpha and upgraded API connections have four
global active slots, two per presented key, four bounded waiters and a two-second
admission wait. Busy responses use 429 and Retry-After: 2. Request bodies are
bounded at 16 MiB. Models, health, management and callbacks bypass generation
admission. The existing CPA/CF validation and persistent minute/day quotas remain
authoritative; gateway memory tracks only currently active requests.

The proxy streams bodies and flushes responses, supports WebSocket upgrades,
retains CF client identity and public Host/HTTPS information, and has no response
or stream deadline. SIGTERM drains HTTP and tracked upgraded connections. Existing
CPA, Tunnel and monitor processes are not restarted for the first installation.
Tunnel DNS, ID and token stay unchanged; only the two public API origin rules
move from 8317 to 8319. Pool routes remain on 8318.

The operator takes fresh encrypted before/after backups and keeps current auths,
disabled states, static keys and SQLite. Failure restores routes/log settings
without restoring old OAuth. The gateway stays alive so existing streams can
finish. `rollback-safety` returns to the previous route without stopping CPA.
Updating an already running gateway to a different binary requires a separately
drained update; the installer refuses to replace it silently.

Run `go test -race ./...` here. No compilation or Docker is needed on the VPS.
