# 义父公益 CPA VPS 部署

公益入口固定为 `https://yifu.leonmingod.com/v1`，用户本机 `cpa.leonmingod.com` 不属于公益池。
2026-11-04 已从 Render/InstaBox 切到 Debian13 LXD VPS，三个 systemd 服务分别运行 CPA、Tunnel 与 Node24 监控。
CPA/监控仅监听127.0.0.1的8317/8318；Cloudflare Tunnel负责公网入口。

监控源码为 `sites/yifu-vps-monitor/`，复用网站脱敏/额度/统计逻辑，SQLite WAL持久化。
五分钟共享刷新、十五分钟存档和原CF累计用量保留。网站新增普通binding
`VPS_POOL_ENDPOINT=https://yifu.leonmingod.com/_pool/status`，用既有运维Secret签名POST转发。
`/_pool/status` 接受 snapshot/quota；`/_pool/seed` 仅供受保护的一次性历史迁移。
公开接口仍是网站GET `/api/pool-status` 与 `/api/pool-status/quota`，响应增加 `X-Pool-Backend: vps`。

个人Key注册表/鉴权/严格限流、游戏、邮箱验证和静态资源仍在CF；不能把本次迁移说成所有CF开销归零。
原13份凭证/10停用及四把静态Key保留，启用但失效的三份凭证需用户重新授权。
移除 `CPA_OAUTH_BOOTSTRAP_FILE`，禁止旧快照覆盖新授权。

维护分支 `codex/free-token-home-20261024`，运维入口 `yifu-vps.yaml`。
GitHub Secrets使用YIFU_SSH_HOST/PORT/USER/PRIVATE_KEY/KNOWN_HOSTS、YIFU_BACKUP_SECRET、YIFU_OPS_SECRET。
工作流verify/status/backup/deploy-monitor不依赖Render，deploy-monitor不更新CPA二进制。
备份包含private、auths、systemd与一致性SQLite副本，AES-256-GCM加密，artifact保留90天；尚无定时备份。
旧Render/共享Key和InstaBox流程已禁用，不得作为常规工具重新启用。

完整主机指纹、路径、版本、验收和恢复步骤见[当前VPS交接](https://github.com/LeonMinGod/cloudflare_temp_email/blob/codex/free-token-home-20261024/YIFU_VPS_HANDOFF_CN.md)。
