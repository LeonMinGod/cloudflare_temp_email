# LeonMinGod 网站与公益 CPA 运维交接

截至 **2026-11-04 / 网站 v62**。本文与 [YIFU_VPS_HANDOFF_CN.md](YIFU_VPS_HANDOFF_CN.md) 是当前维护入口，优先于旧 Render / InstaBox / 共享 Key 记录。没有任何密钥值。

## 当前入口与发布状态

- 网站：<https://leonmingod.com/>，www 同样支持。
- 免费 Token：<https://leonmingod.com/free-token/>；选择页 `/free-token/choose/`。
- 号池：<https://leonmingod.com/model-status/>。
- **公益 API：<https://yifu.leonmingod.com/v1>**。
- 管理页：<https://yifu.leonmingod.com/management.html>，原密码保留。
- **`cpa.leonmingod.com` 属于用户本机，与公益池独立，禁止修改或借用凭证。**
- Render 和 InstaBox 已退出生产；临时 `public-cpa` 已撤下。

| 项目 | 当前值 |
| --- | --- |
| 网站仓库 | `LeonMinGod/cloudflare_temp_email` |
| 维护和发布分支 | `codex/free-token-home-20261024` |
| 网站源码 | `sites/leonmingod-star-night/` |
| VPS 监控源码 | `sites/yifu-vps-monitor/` |
| 主 Worker / v62 | `leonmingod-home` / `8419c16f-c7c5-4b90-aa89-21e087b26b8c` |
| 入口 Worker / 版本 | `leonmingod-free-token` / `51a33be8-6ca4-4b4f-886f-613bfea996b0` |
| 主站绑定 | 原11个保留，新增普通URL配置 `VPS_POOL_ENDPOINT`，共12个 |
| CPA 私库 / 部署代码 | `LeonMinGod/cpa` / `bf86b75181a2fff5b74a5345cf1e1057da3e45d3` |
| 当前图片 | 首页v7、令牌v5，分别有手机/电脑构图 |
| 当前游戏 | 规则v8、实时协议live-v1、客户端app-v18 |
| 当前领取脚本 | claim-v11、verify-v3、verify-flow-v3 |
| Key / CC Switch | saved-key-v2、ccswitch-v2、api-endpoint-v1 |
| 号池前端 | status-v7，状态优先、同状态调用次数降序 |

`main` 不是网站发布源；默认分支的 VPS 工作流会显式 checkout 维护分支。
GitHub 旧用户名928886540有重定向，但CF workers.dev子域、资源ID与邮箱不随改名，不得全局替换。

## 本轮迁移与架构边界

新 VPS：Debian13 / LXD，SSH `23.94.180.2:55014`；实测488MiB内存、488MiB swap、约1.2GiB盘。
CPA、Tunnel与监控常驻内存合计约70MiB，当前盘剩约828MiB；尚未做高并发容量验证。
生产根目录 `/opt/yifu-cpa`；三个 systemd 服务 `yifu-cpa`、`yifu-tunnel`、`yifu-monitor`。
CPA仅监听127.0.0.1:8317，监控8318；公网通过受管理Cloudflare Tunnel进入。

号池采集改为VPS访问本地CPA，五分钟共享刷新、十五分钟历史存档，SQLite WAL持久化。
网站 `/api/pool-status` 只签名转发脱敏结果，返回 `X-Pool-Backend: vps`。
旧CF监控alarm会退出；35模型快照与累计modelUsage已受保护导入SQLite。

网站静态资源、Turnstile、Resend邮箱领Key、个人Key注册表/鉴权/严格限流、游戏实时校验仍在CF。
**这次减少的是CPA保活与号池监控开销，不是所有CF存储和鉴权写入。** 未来迁移鉴权需要另行设计
撤销一致性、限额和恢复，不能用无持久化的进程内计数替换，也不要给小盘机器安装多套数据库。

13份公益OAuth（10停用）、4把原静态Key、配置和管理密码保留。已移除启动环境中的
`CPA_OAUTH_BOOTSTRAP_FILE`，防止旧快照复活已删除凭证。历史文件只存档，不参与启动。
**2份启用Codex和1份启用xAI凭证已失效，刷新失败，用户明确同意迁移后自行重新授权。**
不要反复刷新失效凭证、恢复旧快照，或拿本机CPA账号填充公益池。模型列表200不等于生成成功。

完整拓扑、SSH主机指纹、私密路径、密钥名称、Tunnel ID及备份恢复见 [VPS交接](YIFU_VPS_HANDOFF_CN.md)。

## 产品与安全约束

叫义父：1–20字落款 → 输入义父/确认 → 邮箱 → 发验证码 → 独立验证页 → 专属Key。
游戏：通过御剑破阵 → 服务端核验 → 同一邮箱验证流程。现在是每邮箱一把 `sk-lm-` Key，
同邮箱再次验证取回原Key，落款变化不轮换；旧无加密记录首次迁移可换发并撤销旧Key。
旧共享Key和Karl等独立静态Key按原要求保留，不应误删；不再把共享Key当成所有用户奖励。

- 保留邮箱、落款、Key本地记忆，apex/www localStorage独立。删除结果中的“换个邮箱领取”是用户要求，不要恢复。
- 验证码120秒重发、10分钟有效、最多错5次；领取资格20分钟，签名/HttpOnly/Secure并绑定浏览器。
- 真人凭证固定2小时，访问不续期，不绑定IP；真人验证不替代游戏实时或邮箱限流。
- 邮箱发信3/小时、5/天；IP8/小时、20/天；全站80/天。改规则要同步代码、返回值、前端和文案。
- 验证码支持one-time-code、六位自动提交、整段/全角粘贴；邮件HTTPS按钮放在fragment，读取后移除。
- 同浏览器同origin能恢复短期流程，仍需服务端领取资格；不保证所有iOS邮件App都弹键盘验证码建议。
- CC Switch用当前个人Key实时GET `/v1/models`，保留完整模型别名，默认不自动启用配置。
- 旧Render和临时public-cpa保存地址自动迁到yifu；用户本机cpa地址保持原值，不作为公益CC Switch入口。
- 游戏45秒、24玉、两盾、无暂停，必须实时前缀和逐段新熵校验；旧v1–v6整局回放不能恢复。
- 金令五秒护罩、范围拾取/弹剑；公开玩法只展示胜利条件，不剧透末五玉机制，不画调试缺口框。
- 首页v7、令牌v5四张图保留，原生image_gen素材；流光默认开启、玉球独立浮动且没有旧说明条。
- 号池匿名显示脱敏邮箱及白名单额度，不暴露文件名/完整邮箱/凭据；停用卡留历史并后排，空厂商隐藏。

个人Key在CPA开启 `CPA_REMOTE_KEY_AUTH=1` 后通过原风控Worker签名鉴权，只传Key哈希；未知/撤销拒绝，
控制面不可用通常503。原静态Key仍本地验证，新增个人Key不写进静态api-keys。

## Cloudflare绑定与发布

主站12个绑定：`ASSETS`、`GAME_RUNS`、`KV`、`KEY_ENC_SECRET`、`RESEND_API_KEY`、
`FREE_TOKEN_TURNSTILE_SITEKEY`、`FREE_TOKEN_TURNSTILE_SECRET`、`FREE_TOKEN_OPS_SECRET`、
`CPA_STATUS_MANAGEMENT_KEY`、`FREE_TOKEN_RENDER_KEY`、`FREE_TOKEN_CPA_KEY`、`VPS_POOL_ENDPOINT`。
旧Secret仍按要求保留；CPA监控管理密码现在在VPS本地使用，不发送给浏览器。

`GAME_RUNS` namespace `2dffacc2783647f0bec81263501de5e1`，KV `1b02d139375045f7a7d5ce2d994abd2c`。
同KV在风控中叫 `KEYS`。邮箱Key存SHA256和AES-GCM密文；加密Secret不能轮换后丢掉旧解密能力。
入口绑定保持 `SITE → leonmingod-home` 的命名入口 **Site**，不能退回普通default入口。

网站发布步骤：读取当前活动版本 → 更新release.json基线和版本化文件列表 → 手动stage → 审核产物和绑定 →
把返回的staged_version写入清单提交 → 指定同一版本publish。使用维护分支的 `leonmingod-star-night.yaml`。
当前release.json是v62发布记录，基线仍是发布前v61；下次必须读取实时版本重新准备。
禁止直接wrangler deploy不完整public镜像；需要keep_assets和原KV/DO/Secret。
**v61回滚会恢复旧Render地址和CF号池采集，故优先向前修复，不能为一张图片回滚整个系统。**

## 运维工作流、备份与旧工具

使用 `yifu-vps.yaml` 的 `verify` / `status` / `backup` / `deploy-monitor`。
默认分支能发现该工作流，实际源固定checkout维护分支。`deploy-monitor`不更新CPA二进制。
`seed-pool`已执行，不要日常重跑覆盖新历史。CPA后续CI构建、备份、只更新二进制，具体步骤见VPS交接。

SSH与备份Secrets在两库已配置，网站原CFSecrets保留；VPS流程不再依赖Render API Key。
备份是AES-256-GCM加密的private/auths/systemd与一致性SQLite副本，Actions artifact留90天；
**尚无定时备份和整机恢复演练**，重新授权后和每次升级前后执行backup。

旧 `cpa-instabox.yaml`、Render connect/stage/issue、Render中文添加/移除Key、历史入口发布工作流已禁用。
原文件与历史加密备份保留，只用于考古恢复。不要重新启用它们当作当前VPS发Key工具。
个人Key增删应围绕注册表并核对撤销行为；独立静态Key增删还需适配VPS配置，不能用旧Render脚本。
删除 `FREE_TOKEN_RENDER_KEY` 不能视为完整关闭个人Key发放，更不等于撤销已发Key，关闭策略需单独设计。

旧InstaBox仅停用本项目服务并取消8317发布；共享机器其他项目和8787未动，文件留存。
旧gateway cron和临时域名、InstaBox Secret已撤下。Render保持账单暂停和autoDeploy=no，未付费或删除。
`mail.leonmingod.com`临时邮箱是独立业务，不能借迁移覆盖其CF配置、数据库或邮箱存储。

## 验证与已知限制

网站65项、监控4项、风控22项通过。v62 stage41853618316，publish41854967863。
最终域名verify41854092824：health200、管理页200、13凭证/10停用、4把静态Key各35模型。
历史导入41855170914、导入后加密备份41855698933成功。
apex/www号池200、backend=vps、13账号/35模型、非stale、无私密字段。
临时个人Key模型200/35，临时注册表记录已删除；未向真实邮箱发测试信或动用户Key。
新脚本14项内容比对一致（统一CRLF/LF）；手机浏览器显示35模型卡且无横向溢出。
证据 [v62-public.json](sites/leonmingod-star-night/verification/v62-public.json) 及 v62发布产物。

**推理尚未恢复验收：失效公益OAuth需要用户重新授权。** 不得把health、models或额度缓存200说成所有模型可用。
此前模型映射/max_tokens、Gmail加号别名多领、旧排行榜数据、运维权限边界仍须按后续具体任务复验。
原DO写入事故应作为历史参考，不能用旧日期的临时开关绕过长期鉴权或把预留预算当作全账户账单。

历史v61详录见Git历史 [f0c2295版本](https://github.com/LeonMinGod/cloudflare_temp_email/blob/f0c2295/LEONMINGOD_HANDOFF_CN.md)。

## 可复制给云端Codex的接手话术

```text
请接手LeonMinGod项目，先读维护分支codex/free-token-home-20261024的LEONMINGOD_HANDOFF_CN.md和YIFU_VPS_HANDOFF_CN.md，再核对实时状态。
公益CPA已从Render/InstaBox迁到新LXD VPS，唯一对外Base URL是https://yifu.leonmingod.com/v1；cpa.leonmingod.com是我本机，禁止修改或混用凭证。
网站v62仍在Cloudflare，源码sites/leonmingod-star-night；号池五分钟采集和SQLite历史已在VPS，源码sites/yifu-vps-monitor。个人Key鉴权/限流和游戏仍在CF，不要声称已全部迁移。
运维使用默认分支yifu-vps.yaml，网站发布用维护分支leonmingod-star-night.yaml的stage/publish。不要重新启用Render/旧共享Key工具，不要直接wrangler覆盖不完整静态素材。
保留邮箱专属Key、原静态Key、auths停用状态、落款/本地记忆、120秒重发、两小时真人凭证和实时游戏。失效公益OAuth由我迁移后重新授权，禁止借用本机账号或恢复旧bootstrap覆盖新文件。
Secrets已在GitHub，无需在聊天中索取或输出。重新授权/更新前后做加密backup；当前还没有自动备份。
按我的后续需求直接修改、验证、提交并发布授权范围内变更；用简体中文简洁沟通。
```
