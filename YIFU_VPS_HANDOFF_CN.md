# 义父公益 CPA：VPS 运维交接

> 最新决定：迁往 RAKsmart 的公益站迁移已取消。继续使用原无聊云和 Cloudflare；RAK 只用于个人 VPN。先读 [取消记录](MIGRATION_CANCELLED_CN.md)，不得自行恢复迁移。


更新于 2026-11-05（北京时间）。本文不含密钥值。公益 CPA 已迁到新 LXD VPS，Render 与 InstaBox 都不是生产后端。

## 入口与隔离

- 公益 API：<https://yifu.leonmingod.com/v1>
- 公益管理：<https://yifu.leonmingod.com/management.html>，原管理密码保留。
- 独立扩展后台：<https://yifuplus.leonmingod.com/>，官方CPA Manager Plus v1.14.10，密码同公益CPA；保留原管理页。
- 公益号池：<https://leonmingod.com/model-status/>
- **`cpa.leonmingod.com` 是用户本机 CPA，禁止改 DNS、绑定、配置或借用其凭证。**
- `public-cpa.leonmingod.com` 是本次迁移中临时使用的旧入口，已撤下。
- `yifu-origin.leonmingod.com` 是同一 VPS 的诊断别名，不是另一套账号池。

## 实际资源与拓扑

SSH `root@23.94.180.2 -p 55014`；Debian 13 amd64，LXD 容器 `lxd1145150976763`。
实测内存 488 MiB、swap 488 MiB、根盘约 1.2 GiB；本轮验收约 824 MiB 磁盘可用。
CPA、隧道、监控与网关的cgroup内存合计约75MiB，系统可用内存约412MiB；这是当时快照，不代表生产高并发容量测试。

```text
模型客户端 → yifu.leonmingod.com → Cloudflare Tunnel → 127.0.0.1:8319 并发网关 → 8317 CPA
网站 /api/pool-status → 签名 RPC /_pool/status → 127.0.0.1:8318 监控 → 本地 CPA
                                                         ↕
                                              /opt/yifu-cpa/data/pool.sqlite
网站静态资源、邮箱领 Key、真人验证、游戏实时校验 → 原 Cloudflare 服务
个人 Key 注册表、鉴权与严格限流 → 原 KV / cpa-abuse-guard / Durable Object
扩展管理后台 → yifuplus.leonmingod.com → 同一Tunnel → 127.0.0.1:18317 CPAMP → 本机8317
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
| `bin/yifu-gateway` | 小型Go并发网关，源码 `sites/yifu-vps-gateway/` |
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
| `systemd/` | 四份 unit 和 journal 限额的留档 |
| `yifu-cpa.service` | CPA，仅监听 `127.0.0.1:8317` |
| `yifu-tunnel.service` | 受管理 Cloudflare Tunnel |
| `yifu-monitor.service` | 监控，仅监听 `127.0.0.1:8318`，Node heap 上限 64 MiB |
| `yifu-gateway.service` | 仅监听 `127.0.0.1:8319`，转8317，`GOMEMLIMIT=32MiB` |
| `private/safety-baseline-v1.json` | 保护安装前的日志和Tunnel配置，仅供定向回滚 |
| `private/safety-staged-v1.json` | 安装基线校验记录，不得公开其中凭证文件名 |
| `yifu-plus.service`、`plus/` | 可选扩展后台及独立SQLite/data.key，监听18317 |
| `private/plus-config.json`、`private/plus-admin.key` | Plus配置及0600管理员初始化输入；不输出内容 |
| `yifu-plus-budget.timer` | 每五分钟检查本机磁盘预算，必要时仅暂停可选Plus |

**新 VPS 已删除 `CPA_OAUTH_BOOTSTRAP_FILE` 环境变量。不要恢复它，否则旧 Render 快照可能在重启后复活已删凭证。**
不要重新运行历史迁移或 restore；用户后续重新授权的文件只能留在当前持久目录，并在更新前做新备份。

部署 CPA 代码提交 `bf86b75181a2fff5b74a5345cf1e1057da3e45d3`；迁移没有改 Go 业务代码。
二进制 SHA256 `0bb9b4db2fcb742f44e0a37283001d6db6800874094f8a973d2560c1d23700b6`。
新增网关二进制 SHA256 `788a3388ed840d78607271d61bd96353ee72b5b46ba468772d5110271e799e17`，本轮未重新部署CPA二进制。
cloudflared 2026.10.7，SHA256 `1f99fb518b83dec2ba8d870a7cc991d82a77e6196295a3d2754ba17ab9f91872`。
SSH 主机指纹 `SHA256:8l68r+SGZt/kjBcHESsbnkpkGk2AsFaBwgJqXiAeF98`，工作流严格校验 known_hosts。

## Cloudflare 配置

账号 `855d4f34079c0fa88e70628ff65be84a`；zone `4f078f06b815a404337c3b5387c45275`。
Tunnel `yifu-cpa-lxd-20261104` / `de798c3f-002c-4a28-8e7f-baa9780cfe6b`。
`yifu` 与诊断别名是 proxied CNAME 到该 Tunnel 的 `cfargotunnel.com` 地址。
两原域名下 `^/_pool/.*$` 先路由到8318，其余到8319再转8317；新增yifuplus单域名到18317，末尾catchall404。
Tunnel配置当前version=4；新CNAME `beaf6158321f51fde46e28beddb8ecaf` 仅为yifuplus，原路由/DNS/token保留。

### 域名如何连到新 VPS

新 VPS 已安装 `/opt/yifu-cpa/bin/cloudflared`，由 `yifu-tunnel.service` 管理，开机自启、异常自动重启。
DNS 的完整目标是 `de798c3f-002c-4a28-8e7f-baa9780cfe6b.cfargotunnel.com`。
cloudflared 主动向 Cloudflare 建立连接，公网请求经 Tunnel 到本地服务，无需额外公开8317、8318、8319或18317。
这是远程托管的 Tunnel，ingress 由 Cloudflare 配置；私密 token 位于 `private/cloudflared.token`，禁止输出其内容。
更新网站或 CPA 时应保留此 Tunnel、DNS 和 token，不必另建隧道或把域名改到用户本机。

SSH 登录后可先进行以下只读检查：

```sh
systemctl is-active yifu-cpa yifu-tunnel yifu-monitor yifu-gateway
systemctl is-enabled yifu-tunnel
curl -fsS http://127.0.0.1:8317/healthz
curl -fsS http://127.0.0.1:8319/_gateway/healthz
curl -fsS https://yifu.leonmingod.com/healthz
```

本地 healthz 正常但公网失败时先检查 Tunnel 连接和 DNS；公网 healthz 正常但网站号池失败时，
先检查8318监控和签名转发，不要直接重启CPA、覆盖凭证或改用户本机域名。

网站主 Worker v63：`fe123ce3-a104-43df-a4b8-abbf8ff07322`，可回滚到仍使用VPS的v62 `8419c16f-c7c5-4b90-aa89-21e087b26b8c`。
入口 `leonmingod-free-token`：`51a33be8-6ca4-4b4f-886f-613bfea996b0`，保留 `SITE` → 主站命名入口 `Site`。
主站保留原 11 个绑定，新增一个普通配置 `VPS_POOL_ENDPOINT=https://yifu.leonmingod.com/_pool/status`。
`GAME_RUNS` namespace `2dffacc2783647f0bec81263501de5e1` 与 KV `1b02d139375045f7a7d5ce2d994abd2c` 均保留。
风控 Worker 当前 `616ff1c7-9019-42d5-8ed4-5753be0708d1`，原鉴权/IP 策略及存储保留，cron 已清空。
2026-11-05修复KV预算信号随DO冷启动重复写入，成功发布标记存在原control表id=2，id=1仍为原IP策略。
原个人Key、HMAC、持久化限额不变；详情见 [KV写入事故记录](sites/api-abuse-guard/KV_WRITE_INCIDENT_20261105_CN.md)。

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

GitHub Secrets 的值不会随 clone 自动进入云端会话，也不能通过普通 GitHub API 读取明文。
新会话应优先触发已有受保护 Actions；需要直接 SSH 时，使用云端环境已配置的凭据，
不要把“看不到 Secrets 明文”误判为缺少部署信息。可复制的接手话术见 [CLOUD_CODEX_START_CN.md](CLOUD_CODEX_START_CN.md)。

```sh
gh workflow run yifu-vps.yaml --repo LeonMinGod/cloudflare_temp_email --ref main -f mode=verify
gh workflow run yifu-vps.yaml --repo LeonMinGod/cloudflare_temp_email --ref main -f mode=status
gh workflow run yifu-vps.yaml --repo LeonMinGod/cloudflare_temp_email --ref main -f mode=backup
gh workflow run yifu-vps.yaml --repo LeonMinGod/cloudflare_temp_email --ref main -f mode=verify-safety
```

该 workflow 会显式 checkout 维护分支。`deploy-monitor` 更新监控文件并重启监控，**不更新 CPA 二进制**。
`seed-pool` 已执行，不能当作日常刷新：重跑会覆盖更近的 VPS 历史。
`configure-pool` 只读核对配置；binding 变更走网站受保护 stage/publish。
网站发布继续使用 `leonmingod-star-night.yaml` 的 stage，再核对版本后 publish。不得直接部署不完整 public 镜像。

CPA 后续更新：在 CI 构建目标 Linux amd64 二进制、跑对应测试，再通过已校验 SSH 更新。
更新前 `backup`；只替换二进制，保留 config、runtime.env、auths 和 SQLite。停止 CPA 后保护最新 auths，
保留上一个二进制再原子替换，启动后核对服务、凭证停用状态、四把静态 Key 与个人 Key。
失败时恢复旧二进制；不要用旧 OAuth 快照覆盖刷新后的 auths。部署目录不是 Git 工作树，不能直接 git pull。

## 并发与日志保护

网关保护`/v1/`、`/v1beta/`、`/v1alpha/`生成POST及升级连接：全局4并发、每个呈现Key最多2并发，
最多4个排队、等待2秒；繁忙429带`Retry-After: 2`，请求体最大16MiB。模型列表、健康检查、管理和OAuth回调不占生成槽位。
HTTP流式与WebSocket连接保持到完成/取消，没有推理或流式截止时间；保留原Host、HTTPS与CF真实客户端头。
原CPA/CF身份校验及持久化分钟/日限额继续生效；网关只在内存记录当前活跃连接，不新增IP封禁。

日志配置热更新仅三项：`logs-max-total-size-mb: 50`、`error-logs-max-files: 5`、`request-log: false`。
`/etc/systemd/journald.conf.d/60-yifu-budget.conf`限制持久32MiB、运行时16MiB、7天，保留盘空间256M/64M。
首次安装只新增网关、重载systemd并重启journal，原CPA/Tunnel/monitor PID保持不变。未清除凭证、Key或历史。

`apply-safety`先新备份、安装本地网关/日志、保留原路由；成功后才通过已连接CF插件把两条普通路由8317改8319。
池路由8318、DNS、Tunnel ID/token均不改，再跑`verify-safety`检查真实非流式/流式与原数据。
GitHub旧`CLOUDFLARE_API_TOKEN`访问Tunnel配置API返回401，不能让CI自动切换或回滚Tunnel。
回滚顺序：用CF插件/控制台只把两条普通路由恢复8317，再执行`rollback-safety`恢复日志/journal。
网关保持运行让已有流完成；不要恢复旧auths或整份旧config。安装器拒绝直接替换不同SHA的已有网关，后续更新要单独安排排空。

## CPA Manager Plus（可选独立后台）

已安装官方原生v1.14.10，`yifu-plus.service`开机自启，使用本机8317公益CPA；不替换原management.html，
不经过CF用量采集链。实际collector为subscribe长连接；auto降级本机HTTP队列时30秒轮询，避免超过队列默认60秒保留期。
自动巡检、自动冷却/停用/删除保持关闭。完整请求历史从安装后开始，旧公开监控历史保留。

`GOMEMLIMIT=64MiB`、MemoryHigh96M/Max128M、CPUQuota35%、Nice10；测试时内存约32MiB。
Plus目录超过32MiB或盘空闲少于200MiB时，五分钟预算检查仅停止可选Plus并保留文件，CPA继续运行；
需整理/导出Plus历史并核对空间后手动启动。不是文件系统硬配额，不自动删除历史。

使用`yifu-vps.yaml`的`verify-plus`复验，`deploy-plus`只用于首次安装并拒绝覆盖已有数据库。
回滚只撤yifuplus新增DNS/单条Tunnel规则，再停Plus及其budget.timer；保留Plus文件，不碰原业务。
同密码已验证；以后修改CPA管理密码时，必须按上游文件输入方式重置Plus管理员凭证，并同步加密连接。
完整文件路径、安装包校验值和公开证据见 [Plus运维](sites/yifu-cpa-manager-plus/README.md)。

## 备份与恢复

最近保护安装/复验备份 [41892644325](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/41892644325)。
`yifu-vps-backup.yaml`每天20:30 UTC（北京时间次日04:30）备份，可手动触发，调度可能延迟；
artifact `yifu-daily-backup-<run_id>`保留14天。手动运维artifact `yifu-vps-<run_id>`保留90天。
新定时工作流已手动首跑验收 [41892900083](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/41892900083)，
34份文件、加解密回读、SQLite一致性和临时副本清理通过，artifact实际到期时间核对为14天。
备份文件为`backup.enc.json`或更新前后的`backup-before.enc.json`、`backup-after.enc.json`，用AES-256-GCM加密。
包含 private、auths、systemd，以及通过 Node SQLite backup API 获取的一致性数据库副本；不含可重新取得的运行二进制。
Plus安装后还包含`plus/usage.sqlite`的一致性副本和`plus/data.key`；两者必须成对，解密验证会拒绝缺失一项的Plus备份。
Plus管理密码输入和配置已随private一起加密备份，不能把新后台数据和原pool.sqlite混在一起恢复。
密钥为 `SHA256(YIFU_BACKUP_SECRET + "\nyifu-vps-backup-v1")`，AAD 为 `yifu-vps-backup-v1`。
明文 schema=1，files 映射为相对路径到 base64 内容。恢复时必须验证 AEAD、路径白名单和目标目录，不能盲解压外来路径。
每次加密后立即解密回读比对、检查凭证JSON和路径；SQLite副本执行quick_check。
数据库临时副本使用随机私密路径、0600权限，在finally中删除。测试包含篡改、越界路径及不完整凭证的拒绝。

恢复前停止 CPA 与监控；还原到 `/opt/yifu-cpa`、设置 cpa 所有权和私密文件 0600，
替换 SQLite 时处理停服后的旧 WAL/SHM，再启动服务并检查。整机丢失还须重装校验过的运行二进制及 unit，
并检查 Tunnel token 与 SSH 主机身份。备份仅为执行时快照，已有每日自动备份，**尚未进行整机灾难恢复演练**。
重新授权及每次升级前后都应再备份；artifact 到期前需要另行保存。

## 本次验收与未完成项

- v63 [stage 41891235425](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/41891235425)、[publish 41892132895](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/41892132895)成功；66项网站测试通过，分钟/秒显示、手机/电脑及apex/www内容核对通过。
- 网关9项Go测试和race、5项Python安全/备份测试通过；[安装 41891715566](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/41891715566)、[切换复验 41892644325](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/41892644325)成功。
- 新每日备份工作流手动验收41892900083成功，公开证据 `sites/leonmingod-star-night/verification/v63-daily-backup.json`；尚未等待第一次cron触发或进行整机恢复演练。
- 切换前后真实`gpt-6.1-sol`非流式和流式生成200、流式有DONE；当前模型列表51项。Key、停用状态保留，原CPA/Tunnel/monitor PID未变。不是全部模型的可用性保证。
- 早期只读资源检查因VPS无Python失败，已改用现有Node；首次安装在CF Tunnel权限检查处401停止，未切业务路由，已改为分开安装/插件激活/复验。不得盲重跑部署以消除历史红灯。

以下为v62迁移时历史验收，启用凭证状态此后可能被用户更新，必须重新查询：

- 网站 65 项、监控 4 项、风控 22 项测试通过。
- [stage 41853618316](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/41853618316)；[publish 41854967863](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/41854967863)。
- [VPS verify 41854092824](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/41854092824)：health200、13 凭证/10 停用、4 把静态 Key 各列出35模型。
- [移除 Render 环境依赖后复验 41858538648](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/41858538648)：2026-11-04通过，仍为13凭证/10停用、4把静态Key各35模型。这是当时快照，接手时重新查询实时状态。
- [历史导入 41855170914](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/41855170914)：35 模型快照及历史 modelUsage 保留。
- 公网 apex/www 号池 API200、`X-Pool-Backend: vps`、13账号/35模型、非 stale、无私密字段。
- 临时个人 `sk-lm-` canary 的 `/v1/models`200/35，验证远程鉴权链；临时 KV 记录已删除，另有15分钟过期兜底。
- 手机浏览器号池显示35张模型卡，无横向溢出；14项新脚本源码匹配（统一换行符）。详见 `verification/v62-*.json`。
- 这些检查**不等于模型推理成功**。恢复的2份启用 Codex 和1份启用 xAI 凭证刷新失败，xAI 为 invalid_grant；用户已明确答复迁移后自行重新授权，无更新备份。10份停用不动，不借用本机账号。

旧 InstaBox 仅停用本项目 `leonmingod-cpa.service` 并撤掉8317发布端口，保留文件；共享机器和8787等其他项目未动。
旧 gateway cron、临时域名和 `INSTABOX_API_KEY` binding 已移除；旧迁移及 Render/共享 Key 工作流已禁用。
Render 服务 `srv-d9c4kkvavr4c73ab3sfg` 仍因账单暂停，autoDeploy=no；未付费重启或删除。
未来独立静态 Key 增删需要适配 VPS 配置并备份，旧 Render 中文 Key 工作流不能直接使用。
