# 义父公益 CPA：VPS 运维交接

更新于 2026-11-04。本文不含密钥值。公益 CPA 已迁到新 LXD VPS，Render 与 InstaBox 都不是生产后端。

## 入口与隔离

- 公益 API：<https://yifu.leonmingod.com/v1>
- 公益管理：<https://yifu.leonmingod.com/management.html>，原管理密码保留。
- 公益号池：<https://leonmingod.com/model-status/>
- **`cpa.leonmingod.com` 是用户本机 CPA，禁止改 DNS、绑定、配置或借用其凭证。**
- `public-cpa.leonmingod.com` 是本次迁移中临时使用的旧入口，已撤下。
- `yifu-origin.leonmingod.com` 是同一 VPS 的诊断别名，不是另一套账号池。

## 实际资源与拓扑

SSH `root@23.94.180.2 -p 55014`；Debian 13 amd64，LXD 容器 `lxd1145150976763`。
实测内存 488 MiB、swap 488 MiB、根盘约 1.2 GiB；迁移后约 828 MiB 可用。
CPA、隧道、监控服务的当前内存合计约 70 MiB，不代表高并发容量测试。

```text
模型客户端 → yifu.leonmingod.com → Cloudflare Tunnel → 127.0.0.1:8317 CPA
网站 /api/pool-status → 签名 RPC /_pool/status → 127.0.0.1:8318 监控 → 本地 CPA
                                                         ↕
                                              /opt/yifu-cpa/data/pool.sqlite
网站静态资源、邮箱领 Key、真人验证、游戏实时校验 → 原 Cloudflare 服务
个人 Key 注册表、鉴权与严格限流 → 原 KV / cpa-abuse-guard / Durable Object
```

Cloudflare Tunnel 不经过旧的保活 Worker。监控采集、五分钟刷新与十五分钟历史存档已迁到 VPS；
个人 Key 鉴权和游戏仍会消耗 CF 资源，不能宣称 CF 配额问题全部消除，也没有量化全账户节省比例。
暂不在这台小内存、小磁盘机器上装 Docker、多套数据库或本机编译 Go。后续若迁移鉴权，必须先设计
注册表同步、撤销即时性、全局限额和数据备份，不能用实例内存计数替代持久化限流。

## 文件、服务与凭证

部署根目录 `/opt/yifu-cpa`，运行用户 `cpa`：

| 路径或服务 | 用途 |
| --- | --- |
| `bin/CLIProxyAPI` | 公益 CPA 二进制 |
| `bin/cloudflared`、`bin/node` | Tunnel；Node v24.22.2 监控运行时 |
| `private/config.yaml` | 原配置及 4 把独立静态 Key |
| `private/runtime.env` | 管理密码、远程鉴权配置、`GOMEMLIMIT=160MiB` |
| `private/cloudflared.token` | Tunnel 私密令牌 |
| `private/pool-runtime.json` | 与网站一致的运维 HMAC Secret |
| `private/oauth-bootstrap-history.json` | 历史快照，仅留存，不在启动时恢复 |
| `auths/` | 持久化公益 OAuth 文件，共 13 份，10 份停用 |
| `static/management.html` | 保留的管理页面 |
| `data/pool.sqlite` | WAL 模式的号池缓存、控制闸门及历史用量 |
| `monitor/sites/` | 监控与复用的号池模块 |
| `systemd/` | 三份 unit 文件的留档 |
| `yifu-cpa.service` | CPA，仅监听 `127.0.0.1:8317` |
| `yifu-tunnel.service` | 受管理 Cloudflare Tunnel |
| `yifu-monitor.service` | 监控，仅监听 `127.0.0.1:8318`，Node heap 上限 64 MiB |

**新 VPS 已删除 `CPA_OAUTH_BOOTSTRAP_FILE` 环境变量。不要恢复它，否则旧 Render 快照可能在重启后复活已删凭证。**
不要重新运行历史迁移或 restore；用户后续重新授权的文件只能留在当前持久目录，并在更新前做新备份。

部署 CPA 代码提交 `bf86b75181a2fff5b74a5345cf1e1057da3e45d3`；迁移没有改 Go 业务代码。
二进制 SHA256 `0bb9b4db2fcb742f44e0a37283001d6db6800874094f8a973d2560c1d23700b6`。
cloudflared 2026.10.7，SHA256 `1f99fb518b83dec2ba8d870a7cc991d82a77e6196295a3d2754ba17ab9f91872`。
SSH 主机指纹 `SHA256:8l68r+SGZt/kjBcHESsbnkpkGk2AsFaBwgJqXiAeF98`，工作流严格校验 known_hosts。

## Cloudflare 配置

账号 `855d4f34079c0fa88e70628ff65be84a`；zone `4f078f06b815a404337c3b5387c45275`。
Tunnel `yifu-cpa-lxd-20261104` / `de798c3f-002c-4a28-8e7f-baa9780cfe6b`。
`yifu` 与诊断别名是 proxied CNAME 到该 Tunnel 的 `cfargotunnel.com` 地址。
两域名下 `^/_pool/.*$` 先路由到 8318，其余到 8317，末尾 catchall 404。

网站主 Worker v62：`8419c16f-c7c5-4b90-aa89-21e087b26b8c`。
入口 `leonmingod-free-token`：`51a33be8-6ca4-4b4f-886f-613bfea996b0`，保留 `SITE` → 主站命名入口 `Site`。
主站保留原 11 个绑定，新增一个普通配置 `VPS_POOL_ENDPOINT=https://yifu.leonmingod.com/_pool/status`。
`GAME_RUNS` namespace `2dffacc2783647f0bec81263501de5e1` 与 KV `1b02d139375045f7a7d5ce2d994abd2c` 均保留。
风控 Worker 当前 `2a78e1ae-ed5b-4aec-8b05-4c024527dd3a`，原鉴权/IP 策略及存储保留，cron 已清空。

监控 RPC 只接受签名 POST，30 秒窗口，签名覆盖时间戳、方法、路径和原始 body。
`/_pool/status` 只接受 snapshot/quota；公开 GET API 由网站转发，输出匿名账号和白名单字段。
`/_pool/seed` 是管理迁移接口，不应向浏览器暴露其签名或导出内容。
原 CF 监控 alarm 在 VPS binding 生效后删除自己的 alarm；原缓存保留供审计和历史导出。
不要把整个旧 Worker 回滚到 v61 来改页面：这会重新启用 CF 监控和旧后端地址，应优先做向前修复。

## GitHub 云端操作

运维与网站仓库 `LeonMinGod/cloudflare_temp_email`，维护分支 `codex/free-token-home-20261024`。
网站源码 `sites/leonmingod-star-night/`，监控源码 `sites/yifu-vps-monitor/`。
CPA 私库 `LeonMinGod/cpa`，部署交接分支 `codex/instabox-deploy-20261104`。
不要使用旧 Windows 工作树、旧共享 Key 工具或原 Render 部署命令覆盖当前系统。

两库已有 Secrets（仅列名称）：`YIFU_SSH_HOST`、`YIFU_SSH_PORT`、`YIFU_SSH_USER`、
`YIFU_SSH_PRIVATE_KEY`、`YIFU_SSH_KNOWN_HOSTS`、`YIFU_BACKUP_SECRET`、`YIFU_OPS_SECRET`。
网站库原 CF Secrets 保留。`YIFU_OPS_SECRET` 复用现有网站运维 Secret，未轮换用户 Key。
`RENDER_API_KEY` 仅为历史加密产物/旧工具留存，新 VPS 工作流不依赖它。

```sh
gh workflow run yifu-vps.yaml --repo LeonMinGod/cloudflare_temp_email --ref main -f mode=verify
gh workflow run yifu-vps.yaml --repo LeonMinGod/cloudflare_temp_email --ref main -f mode=status
gh workflow run yifu-vps.yaml --repo LeonMinGod/cloudflare_temp_email --ref main -f mode=backup
```

该 workflow 会显式 checkout 维护分支。`deploy-monitor` 更新监控文件并重启监控，**不更新 CPA 二进制**。
`seed-pool` 已执行，不能当作日常刷新：重跑会覆盖更近的 VPS 历史。
`configure-pool` 只读核对配置；binding 变更走网站受保护 stage/publish。
网站发布继续使用 `leonmingod-star-night.yaml` 的 stage，再核对版本后 publish。不得直接部署不完整 public 镜像。

CPA 后续更新：在 CI 构建目标 Linux amd64 二进制、跑对应测试，再通过已校验 SSH 更新。
更新前 `backup`；只替换二进制，保留 config、runtime.env、auths 和 SQLite。停止 CPA 后保护最新 auths，
保留上一个二进制再原子替换，启动后核对服务、凭证停用状态、四把静态 Key 与个人 Key。
失败时恢复旧二进制；不要用旧 OAuth 快照覆盖刷新后的 auths。部署目录不是 Git 工作树，不能直接 git pull。

## 备份与恢复

最近迁移后备份 [41855698933](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/41855698933)。
Actions artifact `yifu-vps-<run_id>` 保留 90 天，其中 `backup.enc.json` 用 AES-256-GCM 加密。
包含 private、auths、systemd，以及通过 Node SQLite backup API 获取的一致性数据库副本；不含可重新取得的运行二进制。
密钥为 `SHA256(YIFU_BACKUP_SECRET + "\nyifu-vps-backup-v1")`，AAD 为 `yifu-vps-backup-v1`。
明文 schema=1，files 映射为相对路径到 base64 内容。恢复时必须验证 AEAD、路径白名单和目标目录，不能盲解压外来路径。

恢复前停止 CPA 与监控；还原到 `/opt/yifu-cpa`、设置 cpa 所有权和私密文件 0600，
替换 SQLite 时处理停服后的旧 WAL/SHM，再启动服务并检查。整机丢失还须重装校验过的运行二进制及 unit，
并检查 Tunnel token 与 SSH 主机身份。备份仅为执行时快照，**尚未配置自动定时备份，也未进行整机灾难恢复演练**。
重新授权及每次升级前后都应再备份；artifact 到期前需要另行保存。

## 本次验收与未完成项

- 网站 65 项、监控 4 项、风控 22 项测试通过。
- [stage 41853618316](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/41853618316)；[publish 41854967863](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/41854967863)。
- [VPS verify 41854092824](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/41854092824)：health200、13 凭证/10 停用、4 把静态 Key 各列出35模型。
- [历史导入 41855170914](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/41855170914)：35 模型快照及历史 modelUsage 保留。
- 公网 apex/www 号池 API200、`X-Pool-Backend: vps`、13账号/35模型、非 stale、无私密字段。
- 临时个人 `sk-lm-` canary 的 `/v1/models`200/35，验证远程鉴权链；临时 KV 记录已删除，另有15分钟过期兜底。
- 手机浏览器号池显示35张模型卡，无横向溢出；14项新脚本源码匹配（统一换行符）。详见 `verification/v62-*.json`。
- 这些检查**不等于模型推理成功**。恢复的2份启用 Codex 和1份启用 xAI 凭证刷新失败，xAI 为 invalid_grant；用户已明确答复迁移后自行重新授权，无更新备份。10份停用不动，不借用本机账号。

旧 InstaBox 仅停用本项目 `leonmingod-cpa.service` 并撤掉8317发布端口，保留文件；共享机器和8787等其他项目未动。
旧 gateway cron、临时域名和 `INSTABOX_API_KEY` binding 已移除；旧迁移及 Render/共享 Key 工作流已禁用。
Render 服务 `srv-d9c4kkvavr4c73ab3sfg` 仍因账单暂停，autoDeploy=no；未付费重启或删除。
未来独立静态 Key 增删需要适配 VPS 配置并备份，旧 Render 中文 Key 工作流不能直接使用。
