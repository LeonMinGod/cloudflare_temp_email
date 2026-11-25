# Cloudflare 请求额度排查 / Request quota operations

2026-11-06 UTC 的额度事故已定位：无聊云两个 Komari Agent 共用同一配置与节点，持续互相断开、重连。监控 Worker 占账户请求约 95%。多余的 `komari-source-agent.service` 已备份、停止并禁用；保留 `komari-agent.service`，配置与令牌不变。

The quota incident was caused by two old-VPS Komari Agent services sharing a node/configuration and repeatedly replacing each other's connection. The monitor Worker accounted for about 95% of account requests. The redundant `komari-source-agent.service` was backed up, stopped and disabled; the canonical Agent and its credentials were preserved.

完整证据、用量、备份和回滚方式见 [RAKsmart 事故复盘](https://github.com/LeonMinGod/RAKsmart/blob/main/CF_REQUEST_AUDIT_20261106_CN.md)。

Full evidence, usage figures, backup location and rollback details are in the [RAKsmart incident report](https://github.com/LeonMinGod/RAKsmart/blob/main/CF_REQUEST_AUDIT_20261106_CN.md).

## 只读诊断 / Read-only diagnostics

所有请求文件均提交到 `codex/free-token-home-20261024`，使用唯一 `request_id`。公开文件只放接收方公钥和非敏感查询参数，不放私钥、密码或 Cookie。新会话使用自己的传递密钥，并妥善保管私钥；不能假设旧云会话的私钥已迁移。

Commit request files only to `codex/free-token-home-20261024`, using a unique `request_id`. Include only a recipient public key and nonsensitive query parameters. Generate and retain your own delivery private key for a new session; do not assume an old cloud session's key is available.

| 请求文件 / Request file | 工作流 / Workflow | 用途 / Purpose |
| --- | --- | --- |
| `.github/cf-usage-audit-request.json` | `cf-usage-audit.yaml` | CF 账户日用量、时序及状态 / Account Worker usage, time series and statuses |
| `.github/source-agent-audit-request.json` | `source-agent-quota-audit.yaml` | 源机 Agent 进程、服务、脱敏配置摘要和日志 / Source Agent processes, units, sanitized config summary and logs |

CF 请求参数：`days`（最多三天，UTC）、`focus_day`、可选的 `detail_worker`、`detail_minutes`（1～30分钟）。`detail_host` 的 Zone 路径统计需要额外的 Zone Analytics Read 权限；现有 Token 没有该权限时保留错误证据，不要重复查询或为此关闭 WAF。

CF parameters: `days` (up to three UTC dates), `focus_day`, optional `detail_worker` and `detail_minutes` (1–30). Zone path analytics via `detail_host` requires Zone Analytics Read permission. The existing token lacks it; retain the permission error rather than retrying or disabling WAF.

两种诊断都需要 `session` 与 Base64 PEM 格式的 `owner_public_key`。CF 审计只使用现有 `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`；源机审计只使用既有 `YIFU_SSH_*` Secrets、固定主机校验及服务器已有 Node。它们不改生产配置、不访问业务 Worker URL。

Both diagnostics require `session` and `owner_public_key` (Base64-encoded PEM). The CF audit uses the existing account/token Secrets; the source audit uses existing `YIFU_SSH_*` Secrets, pinned host verification and the installed Node runtime. Neither changes production configuration or visits business Worker URLs.

结果在 `production-results/<request_id>`：先核对 `manifest.json` 的请求、源提交和 SHA256，再用匹配的接收方私钥解密 `owner.enc.json`。`report.json` 是脱敏摘要。CF 分析有采样与延迟，不能当成精确配额账单。

Results are published to `production-results/<request_id>`. Verify the manifest's request, source commit and SHA256 before decrypting `owner.enc.json` with the matching recipient private key. `report.json` is a sanitized summary. CF analytics may be sampled or delayed and is not an exact quota ledger.

## 去重修复与防复发 / Repair and prevention

`source-agent-quota-repair.yaml` 是**生产变更工作流**，不属于只读诊断。只有 `.github/source-agent-repair-request.json` 变化才执行。脚本只在两个已确认的服务均 active、两个进程共用已知配置时继续；先私有备份，停止旧服务，观察45秒，核对现用 PID/配置未变，再禁用旧服务。异常恢复旧服务，结果加密。已去重的环境再次执行会拒绝，不能盲目重试。

`source-agent-quota-repair.yaml` **changes a production monitor service** and is separate from the read-only diagnostics. It runs only when its request file changes. It requires the two known active units sharing the expected configuration, backs up privately, stops the redundant unit, observes for 45 seconds, verifies the canonical PID/configuration, then disables the old unit. Failures restore the old service. An already repaired environment fails this preflight; do not blindly retry.

`production_komari.source_agent` 已增加旧服务 active/enabled 检查，防止再次启动同节点第二套 Agent。后续上线先清点所有 Agent 服务与进程，观察至少五分钟的稳定连接、最新报告和分钟请求量。

`production_komari.source_agent` now refuses deployment while the old unit is active or enabled. Inventory all Agent units/processes and verify stable connections, fresh reports and minute-level requests for at least five minutes after a monitor deployment.

共享预算：账户免费上限100,000次/日，按 `实例数 × 86,400 / 请求间隔秒数` 估算常驻 HTTP/重连请求，至少预留40%余量。稳定 WebSocket 消息不会逐条成为新 HTTP 请求。Worker 内部401/429已经消耗调用，不能用它来声称节省配额。本次没有安装自动告警、改 CF 路由或升级收费计划。

Budget against the account-wide 100,000 requests/day limit. Estimate persistent polling/reconnects as `instances × 86,400 / interval_seconds` and reserve at least 40% headroom. Messages on a stable WebSocket do not each create a new HTTP invocation. Returning 401/429 inside a Worker still incurs an invocation. This repair does not install automatic alerts, change CF routes or upgrade the plan.
