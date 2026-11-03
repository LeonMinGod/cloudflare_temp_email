# LeonMinGod 网站与 CPA 运维交接

截至 **v60 本轮线上核对**。本文是当前维护入口；旧交接中的共享 Key、页面版本和部署编号属于历史记录。本文只记录密钥名称、用途与资源 ID，不包含任何凭据值。

接手先读本文、`sites/leonmingod-star-night/README.md` 和 `WEBSITE_UPDATE_CN.md`，再读取 Cloudflare 与 Render 的实时状态。源码已经在 GitHub；不要重新从旧 Windows 目录或旧首页镜像覆盖生产。

## 1. 项目与当前线上状态

网站仓库：<https://github.com/LeonMinGod/cloudflare_temp_email>

用户已将 GitHub username 从 928886540 改为 LeonMinGod。当前 Git remote、运维命令与链接使用新名；Render 源仓库校验同时兼容旧名重定向。**Cloudflare 的 928886540.workers.dev 子域、Worker/服务/存储 ID、邮箱地址没有随 GitHub 改名，不要全局替换数字。**

- **维护与发布分支：`codex/free-token-home-20261024`。** `main` 与线上网站不同，不能直接从 main 发布。
- 网站源码：`sites/leonmingod-star-night/`。`sites/free-token-home/` 是历史实现。
- 本轮调用量排序：`d636451` / 阶段固定 `eb4fc1b`；本地 Key 入口：`00636f7`；xAI 额度：`8147926`，固定发布：`3f7c460`；CPA 管理真实 IP/启动前凭据保护：`97fbbcd`。验收见 `verification/v57-*.json`、`v58-*.json`、`management-recovery-*.json`。
- 当前云端工作树：`/workspace/cf-notification-fix-site`，本地分支 `codex/pool-dashboard-v54-20261030`，修改已推到维护分支。此前 Windows CC Switch 工作树属于 v53；后续以 GitHub 为准。
- `/workspace/cloudflare_temp_email`、`/workspace/leonmingod-home` 和原 Windows `D:\apiWorkSpace\leonmingod-home` 不能仅凭目录名视为最新代码。

| 项目 | 当前状态 |
| --- | --- |
| 网站功能版本 | v60，五分钟监控、十五分钟存档、每日缓存预算与风控节流 |
| 主 Worker | `leonmingod-home` |
| 主 Worker 活动版本 | `366eeb9c-ce76-4ba5-a695-11fc702a9724`，100% 流量 |
| 直接回滚版本 | v59：`401ac7d3-59af-4c00-81fa-cc6a7b6d020b`；会恢复每分钟监控，写入压力下优先向前修复 |
| 入口 Worker | `leonmingod-free-token` |
| 入口活动版本 | `51a33be8-6ca4-4b4f-886f-613bfea996b0` |
| 图片版本 | 首页 **v7**、令牌入口 **v5**，各有电脑与手机独立构图 |
| 游戏规则版本 | v8，实时协议 live-v1；与网站 v60、图片 v7 是不同编号 |
| 网站领取状态 | open；点击令牌进入原动画与选择页 |
| 未完成 PR | 本次核对为 0；旧 PR #6 已关闭，PR #7 已合并到维护分支 |

线上入口：

- 首页：<https://leonmingod.com/>
- 令牌入口：<https://leonmingod.com/free-token/>
- 两条领取路线的选择页：<https://leonmingod.com/free-token/choose/>
- 叫义父：<https://leonmingod.com/free-token/claim/>
- 独立验证码页：<https://leonmingod.com/free-token/verify/>
- 御剑破阵：<https://leonmingod.com/free-token/game/>
- 号池状态：<https://leonmingod.com/model-status/>
- CPA Base URL：<https://cpa-dhke.onrender.com/v1>

`www.leonmingod.com` 也已验收。浏览器本地保存的邮箱、落款、Key 和领取流程按 origin 隔离，不能假定主域名与 www 自动共享 localStorage。

## 2. 现在的产品流程

### 号池状态优先、同状态按调用量排序（v61）

默认排序改为：正常 → 冷却中 → 异常 → 未观测 → 已停用，同一状态里按成功+失败
的真实调用次数降序排列。凭证卡、模型卡、厂商标签都使用状态优先；厂商取其凭证的
最佳状态，再比较已有模型调用量（统计不可用时仍回退到账号调用量）。全部厂商仍置顶，
空厂商仍隐藏。停用凭证保留历史次数和额度记录，移至末尾，不隐藏、不清零。
前端入口 `model-status/status-v7.mjs`，默认选项文案“可用优先 · 调用次数↓”。其他手动
排序方式保留。只修改显示排序，没有改服务端鉴权、风控、Key、OAuth 或监控频率；
仍五分钟共享刷新、隐藏页面暂停，切换厂商和状态筛选不增加请求。61 项既有测试通过，
393×852 和 1440×1000 浏览器验证涵盖多状态卡片、同状态调用量、厂商/模型次序、
停用筛选与五分钟轮询。移除 release.json 中过期的 11 月 1 日事故放行开关，发布恢复
要求真实号池 API 验证成功。线上发布结果另见 verification/v61-release.json。

### 2026-10-31 夜间个人 Key 应急恢复（已发布）

10 月 31 日的减写部署没有解除当天已经耗尽的 DO 配额，个人 Key 仍在进入模型前
失败。此次增加仅供本事故使用的开关 `ops:auth-recovery:v1`，必须同时匹配 schema=1、
scope=`do-write-quota-20261031`、mode=`registered_keys_memory_limits` 和固定 expires=
`2026-11-01T00:00:00Z`。代码硬截止北京时间 11 月 1 日 08:00，KV 中延长日期无效。
届时不再读此开关，恢复原 DO 配额流程；这不等于提前保证 CF 已恢复。

应急模式继续要求 CPA 服务请求 HMAC、KV 中 active 的 Key 记录和签名响应。每次均查
注册表，未知/撤销 Key 仍拒绝；KV 故障也拒绝。正常模式的 DO 故障不会自动开启应急。
应急期间仅对有效 Key 跳过 DO 写入，使用有容量上限的内存 Key/邮箱限流与 nonce 去重。
**内存计数按 Worker 实例隔离，实例重载会丢失，不能当作全局精确的 60/min、2000/day
额度保证；集中计数/排行榜不记录此段调用。** 此取舍只用于已确认的免费配额事故，不能
作为长期生产鉴权设计。临时模式不产生逐请求 KV/DO 写入，过期后完全不读应急 KV 开关。

本次仅发布风控 Worker，不重启 Render，不改用户 Key、OAuth、网站和已有 IP 规则。
22 项风控测试通过。风控版本 `8adadc8e-05d3-442a-bf60-7c4f5531edc1` 已承接 100% 流量。
临时 canary 的 /v1/models 从 503 恢复为 200，返回 22 模型；未知 Key 返回 401。
Grok-4.7 实际流式请求 HTTP200、44 个 SSE 片段并收到 DONE，13.38 秒正常结束。
不能据此宣称所有 Grok 上游问题或主站 DO 游戏/监控接口也已修复。线上验证使用
15 分钟自动过期的临时 canary Key，不借用用户 Key；完成后主动删除记录与本地凭据。
证据：`sites/api-abuse-guard/verification/auth-recovery-20261031.json`。
需要提前回滚时删除应急 KV 开关即可（留意 KV 约 60 秒的缓存），或回滚风控版本到
`1f389ed5-c6da-454c-9e59-86bc64a1c76f`；这两种做法在额度仍耗尽时都会恢复个人鉴权 503。

### 写入预算与五分钟监控（v60，覆盖此前一分钟频率）

下文 v54～v59 段落中的一分钟频率均为历史；当前以本节的五分钟配置为准。

前端 `status-v6.mjs`、服务端 REFRESH_MS 和后台模型采集都改为 **300 秒**，额度仍为
300 秒。多人/重试共享一次采集，隐藏页面停止轮询，503 也按五分钟退避。历史与模型
累计缓存最多 **900 秒**落盘一次；刷新闸门/鉴权错误退避使用独立小控制记录，避免每次
改一个时间戳就重写整份快照。控制与完整快照提交保持原子。监控缓存每天最多预留
10000 次行写入（保守估计，定时器/其他 DO 业务另计），跨 DO 重载保留预算。

风控的 `guard_write_budget` 使用 SQLite 游标报告的写入行数消费预留块，块在消费前
持久化；实例重载丢失未使用块只会更保守。**它是风控范围的预留上界，不是全账户
Cloudflare 账单，也不是免费额度绝不会再满的保证。** 预留 50000/70000/90000 行时
分别 warning/conserve/critical，70k 起停非必要 5xx 诊断与存量统计清理，仍保留真正
异常证据、封禁和 Key/邮箱限额的实时持久化。普通成功请求不逐条写 IP 历史，可信 IP
保护延长合并，至少保留 24 小时；无状态变化探测不写入。

控制信号在共享 KV 的 `ops:do-write-budget:v1`，每个 UTC 日/等级最多写一次。主站
看到 conserve/critical 时暂停完整统计存档和后台采集，定时器推迟到下个 UTC 日；
可见页面仍能按共享五分钟读取。事件信号会到期，不能长期套用旧告警。此处不会取消
个人 Key 的严格校验、撤销或请求限额。新风控版本 `1f389ed5-c6da-454c-9e59-86bc64a1c76f`，
前一版 `6600a783-146f-40db-a963-10311045a884`，仍是原 namespace / 四个绑定。

CPA 提交 `bf86b75181a2fff5b74a5345cf1e1057da3e45d3` 修复重复鉴权：Guard 与路由
复用同一 HTTP 请求内的结果，管理器、方法、URL、Host 或 Header 改变即失效，不跨
请求缓存；远程拒绝/Retry-After 原样保留。Go 全量测试、race 与编译通过。

受保护部署在产物保存白名单模型统计 `model-usage-before-deploy.json`，再由已连接 CF
插件复制到 `ops:cpa-model-usage-before-deploy:v1`；下次采集按进程高水位只合并一次。
GitHub 的 CF 凭据对 KV 写返回 401，因此这一步明确不能假设 GitHub 能写 KV。
统计快照只能覆盖采样时刻，切换前后的少量未采样调用不承诺完整；不会把模拟统计或
健康检查写成真实个人 Key 已恢复。常规模型流量探测降为每十秒一把静态 Key 轮换。

最终保护部署 run 41204870819 成功，`dep-dbiukprbc2fs73bc85e0` 已 live，13 份 OAuth 与
4 把静态 Key 保留，切换监测 13/13 模型列表 HTTP200，healthz 200；不等于全模型推理/
所有长连接零中断保证。21 模型统计快照已由 GitHub 插件下载，只提取白名单数据，
经 CF 插件复制 KV 并读回核对。旧流程 Artifact 下载在执行器遇到403，不能再打印临时
签名下载 URL；优先使用 GitHub 插件下载再用 download_file，其他加密备份未解密。

网站 61 项测试、风控 17 项测试通过；手机/电脑模拟时钟验证五分钟轮询与隐藏页面暂停。
公网因今日 DO 限额仍返回 503，已核对错误页也不会高频重试。发布脚本仅在发布前已503、
且明确的 2026-11-01T00:00:00Z 到期前允许这项既有故障；仍检查全部页面/绑定/命名空间，
发布结果明确 `pool_api_verified=false`，不能把网页成功发布说成动态服务恢复。下一轮
正常发布应移除 `known_pool_outage_until`，不可常态跳过 API 检查。


### 默认按真实调用次数排序（v59）

厂商标签、模型列表和凭证列表都以累计调用次数降序为默认。厂商按模型用量汇总；
模型统计不可用时才回退账号请求汇总。厂商同次数按可用账号数量，再用原有顺序稳定
排序；模型/凭证同次数保留常用/状态等稳定次序。零凭证厂商不展示，不再补 Claude、
Gemini 等空标签。初始选中“全部厂商”，保留手动筛选和其他排序选项；切换视图与刷新
会保留当前排序。此要求覆盖 v55 的默认固定 GPT/Codex 优先，只在同次数/手选常用
时采用旧偏好。当前真实数据为 Grok 排在 Codex 前，停用且无调用的 Antigravity 在后。

前端入口改为 `status-v5.mjs`，继续用 `status-v4.css`。只利用已有快照计算，不新增
上游查询、计数写入、绑定或 Render 部署。刷新仍为全站状态每分钟、凭证额度五分钟。
本地反向调用量样本验证与公网真实接口验证覆盖手机/电脑、模型/凭证/厂商筛选。


### xAI 套餐/余额与本地 Key 入口（v57/v58）

选择页 `/free-token/choose/` 的说明下方、游戏胜利画面和通关邮箱弹窗中，都已添加
“查看本浏览器保存的 API Key”。与叫义父页面共用 `lmg-claim-v1` / `readSavedKey()`，
有有效的 `sk-lm-` 本地记录才显示；支持查看、复制地址/Key/两者及 CC Switch 导入。
仅查看不会发 API、邮件、Turnstile 或生成请求，也不会发新 Key / 消耗通关资格。
无记录或清除记录会隐藏入口；跨标签 storage / pageshow 更新可见性。新组件为
`public/free-token/saved-key-v1.mjs` / `.css`。游戏引擎、奖励核验和难度未变。

xAI 额度与当前 CPA 原生管理页面同源，由服务端 `requests/api-call` 代理四个固定 GET：
`https://cli-chat-proxy.grok.com/v1/billing?format=credits`、`/v1/billing`、
`/v1/user?include=subscription`、`/v1/settings`。没有复制其生成 ping 的 fallback；
只读套餐和用量，不调用 `chat/completions`。使用原生面板的固定 xAI CLI 请求头与
`$TOKEN$`，凭据索引和令牌不进入浏览器。套餐优先 settings 的显示名称，避免 user
中 `SuperGrokPro` 内部标签覆盖实际 `SuperGrok Heavy`。

周额度以 `creditUsagePercent` 计算剩余，按 `currentPeriod.end` 显示重置时间。
按量付费开关、预付余额、GrokBuild/Cursor/GrokBot 共享配额明细均经过白名单提取。
未知/无总额度不伪造 100%；邮箱持续服务端脱敏。全站状态 60 秒；每凭证最多 5 分钟
一次额度组查询，四个只读请求算同一刷新组，重复/并发访客合并。自动只查启用凭证，
停用凭证保持停用，可显式手动查询其额度。不是每个访客各查一次，也不自动生成模型
请求来试额度。只读接口继续走现有白名单。

实际原生合同验收：Heavy，周剩余 88%，北京时间 11/04 21:58 重置，GrokBuild/
Cursor/GrokBot 已用 5%/4%/3%；数字会随真实使用变化。57 项网站测试通过，本地
320/393/1440 和公网同尺寸验证无整页横向溢出、字段真实、共享限频及脱敏。

### CF 写入预算与分片增量持久化（v56）

模型调用逐条计数发生在 Render 内存；CF 全站每分钟读取一次汇总并保存检查点。
统计写入的是独立 DO 的 SQLite 存储，不写保存邮箱 Key 的 Workers KV，不能把
Workers KV 的免费写入限额直接套到这里。游戏、邮件、风控等仍共用账户的相关额度。

本轮只优化 Worker：事务中仅写发生变化的缓存分片，分片数量未变时不重写 manifest，
缩小时清理多余分片；冷启动读缓存后也能识别未变化内容。缓存命中的额度请求不再
保存整份快照；池对象身份标识只首次写入，alarm 继续每分钟重设。统计口径、刷新
频率、KV/DO 命名空间、Key 与 Render/OAuth 均不变。历史缓存原来就限制 60 条，
不存在此前口头误判的无限增长问题，本轮没有声称修复此类问题。

相同 35 模型、13 账号、已填满 60 条历史的代码模拟：有人持续查看时基础写行调用
由 2,760/小时降到 900/小时；无人访问的背景收集从 1,440/小时降到 240/小时。
按 24 小时外推约 21,600 / 5,760 行，减少约 67% / 83%；100 次内存缓存命中读取
没有新增写入。这不是 CF 实测账单，未包含额度探测、游戏/邮箱/风控、冷启动或
平台索引与缓存计费差异；不要把它说成账户总用量或费用保证。官方 DO SQLite
免费档参考是每天 100,000 写行，访问人数仍会增加 Worker/DO 的读取请求。
依据：`verification/v56-write-budget.json`、
<https://developers.cloudflare.com/durable-objects/platform/pricing/>。55 项测试通过。

### 单模型调用统计与统一排序（v55）

默认展示模型卡片。厂商顺序固定为 GPT/Codex、OpenAI API、Claude、Gemini、
Antigravity、xAI/Grok 等；“全部厂商”放在筛选入口首位。默认“常用优先”将
`gpt-6.1-sol`、`gpt-6.1-terra`、`gpt-6-astra` 放在前面，内部 auto-review 模型靠后。
可选按真实请求次数、可用状态、名称排序。凭证视图按状态、厂商、真实请求量排序。

CPA 新增鉴权 GET `/v8/management/observability/usage/models`，独立订阅 usage
发布器，按客户端请求的模型别名记录执行成功/失败；不会弹出原队列，也不保存提示词、
IP、客户端 Key 或邮箱。计数口径是上游执行次数（包含重试），不是独立访客数。
最近五小时、每五分钟的真实请求桶构成状态条；成功的流式请求提供 TTFT 样本和
`output_tokens / (latency - TTFT)` 的加权输出速度，无样本明确显示“暂无样本”。

原 Render 用量开关为关闭，本轮只将
Secret File 现有顶层 `usage-statistics-enabled` 开启（v8 API 中对应 `observability.usage.usage-statistics-enabled`），其余
YAML 语义、四把静态 Key、13 份 OAuth 登录及环境变量保留。通过
`pool-enable-stats` 模式备份并保护部署；旧配置与 OAuth 保存在该 run 的加密 artifact。

CF 现有独立对象 `pool-status-cache-v2` 保存分实例高水位和累计总数，重复读取不会
重复相加。对象 alarm 每分钟只读取模型计数，即使无人打开网页也继续收集，不查询
额度、不生成模型请求。管理鉴权错误退避十五分钟。快照使用事务和小于 128 KiB 的
分片保存（`pool-status-v3-manifest` / `pool-status-v3-part-*`），兼容读取旧 v2 缓存。
GameRun.alarm 通过独立存储标识区分号池对象和游戏局，后者仍按原流程清理。

统计从本轮开启时开始，旧账号总计不能拆成历史单模型次数，不能伪造补齐。
CPA 进程内计数由 CF 最多一分钟一次检查点持久化；突然崩溃仍可能丢失最后一个
检查点后的执行。原始完整邮件/Key/客户端 IP 不进入统计 DTO。白名单和五分钟额度
闸门继续生效。

**回滚注意：** v54 没有新的 pool alarm 分支，直接回滚可能在旧 alarm 执行时清理
该独立统计对象；不会清理其他游戏局或邮箱 Key KV。需要保留 v55 新累计时优先
在当前代码上修复并前滚，或先导出统计/分片、暂停该对象 alarm，再回滚。不要盲目
切回旧版本后声称模型历史仍然保留。

### 号池双视图与刷新规则（v54 历史基础）

`/model-status/` 已按参考站重做为白色卡片（可切深色），按厂商标签切换，支持
“模型状态 / 凭证与额度”两种视图。凭证邮箱在服务端脱敏后返回，并显示真实套餐、
5 小时/周额度进度条、重置时间、成功/失败与最近请求记录。完整邮箱、auth_index、
文件名、路径和管理凭据均不公开。v54 模型视图只展示真实可调度性；v55 已补单模型次数与性能，见上方。

页面每 60 秒更新、后台暂停。现有 GAME_RUNS 命名空间中独立的
`pool-status-cache-v2` 对象统一缓存并合并请求，未改游戏规则或存储命名空间。
模型清单/主动额度最少 5 分钟查一次，自动额度只查启用的受支持凭证；管理鉴权错误
全局退避 15 分钟，失败快照可用 10 分钟并显示过期状态。不再用 KV 每 30 秒写快照。
`GET /api/pool-status/quota?id=匿名编号` 只能触发固定厂商只读额度请求，客户端不能
指定上游 URL、凭证索引或请求头。

CF Free zone 已新增只读 skip 白名单：规则 `8ff6e55df6f04e189212bef11389cadc`，
ruleset `06e73eeed2ba48e5bcaba19d606bddbc`。仅主域名/www 的 GET/HEAD 看板路径
`/model-status`、`/model-status/*`、`/api/pool-status` 和 `/api/pool-status/quota`。
跳过相关 WAF/限流/安全挑战，其他业务和 POST 不在例外内；CPA 管理读取本来就不计
入异常 IP 统计。备份与回滚依据：`verification/v54-waf-before.json`、
`v54-waf-after.json`。只停用这条白名单，不要覆盖其他规则。

49 项测试、本地三尺寸交互、公网两尺寸真实双视图及 30 次连续读取通过；未部署
Render、未启停账号、未换 Key。不要读取 `/observability/usage/queue` 充当无副作用
统计接口：该 GET 会弹出队列记录。v55 已新增独立的不消费队列的汇总接口。

### CC Switch 与号池状态（v53）

领取结果、已保存 Key 与游戏奖励弹窗均有「接入 CC Switch」。选择 Claude/Codex/Gemini、配置名称与必填主模型；模型使用当前展示的个人 Key 实时读取 CPA `/v1/models`，保留完整别名。提交才创建 `ccswitch://v1/import`，默认不自动启用。必须安装 CC Switch；本轮用模拟模型和虚构 Key 验证弹窗及协议，未在桌面实际唤起原生应用。

令牌入口的「号池状态」进入 `/model-status/`，无需登录 CPA。`/api/pool-status` 在服务端只读 CPA v8 凭证元数据和模型注册列表，返回匿名账号、状态、冷却及已观测额度；不返回完整邮箱、文件名、路径、管理密钥或凭据内容；v54 仅返回脱敏邮箱。v53 最多缓存 30 秒；当前已改为上方 v54 的统一 60 秒缓存和五分钟额度闸门。注册/调度状态不等于实测每个模型生成成功，未上报额度显示「未观测」。

v53/v54 当时验收：13 个账号、3 可用、10 停用、35 个模型，完整覆盖、非旧缓存；数字随运行变化。新增 `CPA_STATUS_MANAGEMENT_KEY` 只通过 `pool-setup` 安装于 Cloudflare，Render 配置、部署和 OAuth 文件未修改。Workers 服务端 fetch 必须用 `redirect: 'manual'` 并拒绝非 2xx；`redirect: 'error'` 不受支持。已有真实 Workers 运行回归测试防止再次退回该配置。

### 叫义父路线

填写 **1–20 字落款/用户名** → 输入“义父” → 二次确认（显示落款）→ 填写邮箱 → 发送验证码 → 独立验证码页 → 验证成功后返回领取页展示专属 Key。

落款随服务端领取资格签名，验证邮箱后保存到邮箱记录及 Key 记录。已有落款保留，原来没有落款的记录可补齐；落款变化不会轮换 Key。新页面要求落款，后端保留旧版在途客户端未传落款的兼容路径，不能误称“所有 API 请求都强制落款”。

### 游戏路线

令牌 → 独立选择页 → 御剑破阵 → 服务端核验通关 → 填邮箱 → 独立验证码页 → 返回游戏奖励弹窗。

两条路线统一使用邮箱归属机制。**现在不是所有人领取同一把共享 Key**：每个邮箱有一把 `sk-lm-` 专属 Key，同一邮箱重新验证后找回同一把。旧版没有加密 Key 的记录首次找回会换发一次并撤销旧 Key；已停用的 Key 不会恢复。

### 本地记忆与验证码便利性

- 邮箱和落款单独在当前浏览器保存，不必领取成功才记住；下次预填。游戏奖励邮箱也预填。
- 成功领取的 Key 保存在当前浏览器，可直接查看、复制。源码没有写入生产 Key。
- 已删除结果弹窗的 **“换个邮箱领取”**，也删除了该入口清除本地 Key 的行为；不要自行恢复这个引导。
- 验证码页保留“邮箱填错了？返回修改”，只用于纠错。
- 单个验证码输入框使用 `autocomplete="one-time-code"`，支持六位自动验证、整段邮件粘贴提取、全角数字归一化。
- 邮件主题与正文显示连续六位数字，并有 **“填入验证码”** 按钮。链接把验证码与邮箱放在 `#fragment`，页面读取后立即移除，不放入站点 HTTP 查询参数。
- 相同 origin、同一浏览器的新标签页可恢复短期流程；服务端仍检查原 HttpOnly 领取资格。不同浏览器或不同邮箱只展示站内复制按钮，不发起校验、不消耗错误次数。
- iPhone 键盘建议取决于 iOS 和接收邮件的 App；网页标准适配不等于保证所有 QQ/Gmail 客户端都弹建议。邮件客户端不能可靠运行剪贴板脚本，因此没有放假复制按钮。
- 清理浏览器数据、换设备、无痕窗口不能保证保留上述本地记忆，需要重新验证原邮箱。

### 已确定的时间与限额

| 设置 | 当前值 |
| --- | --- |
| 验证码重发间隔 | **120 秒**，前后端与文案一致 |
| 验证码有效期 | 10 分钟 |
| 单个验证码错误上限 | 5 次 |
| 领取资格 | 20 分钟，HttpOnly、Secure、SameSite、签名并绑定浏览器 |
| Turnstile 真人凭证 | 固定 2 小时，复用且不因访问续期 |
| 邮箱发信上限 | 每小时 3 次、每天 5 次 |
| IP 发信上限 | 每小时 8 次、每天 20 次 |
| 全站发信上限 | 每天 80 次 |

限额源码在 `src/claim-store.js`。Turnstile 位于实际发信、游戏开局；验证码校验不再单独弹挑战。修改间隔时要同时改后端常量、返回值、前端倒计时与邮件/页面文案。

## 3. Cloudflare 架构与绑定

网站由 **Cloudflare Workers 托管**；Render 承载 CPA 模型 API。

当前 GitHub Actions 已有 `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`、`RENDER_API_KEY` 等 Secrets，发布优先复用现有受保护工作流，不必重新配 CF 凭据。本会话 Cloudflare/Render 插件与 gh 可用；新会话仍要确认自己的连接和权限。不要把 Render 管理 API Key 与对外模型客户端 Key 混淆。

Resend 发信代码在 Worker 的 `src/claim-email.js`，通过 `RESEND_API_KEY` 调用；默认发件人为 `LeonMinGod <noreply@leonmingod.com>`。邮件模板随网站发布，不是一个必须另行在 Resend Dashboard 编辑的模板。

`leonmingod-free-token` 保留更具体路由，通过服务绑定 `SITE → leonmingod-home` 的命名入口 **`Site`** 转发。不能改成普通默认入口，不能删除转发 Worker 或用旧页面覆盖路由。

当前主 Worker 共 11 个绑定：

| 绑定 | 类型与用途 |
| --- | --- |
| `ASSETS` | 保留的线上静态资源集合 |
| `GAME_RUNS` | Durable Object `GameRun`；命名空间 `2dffacc2783647f0bec81263501de5e1` |
| `KV` | KV `1b02d139375045f7a7d5ce2d994abd2c`，邮箱、加密 Key 等 |
| `KEY_ENC_SECRET` | Key 的 AES-GCM 加密及领取资格签名相关 Secret |
| `RESEND_API_KEY` | Resend 发信 Secret |
| `FREE_TOKEN_TURNSTILE_SITEKEY` | 当前真人验证组件配置 |
| `FREE_TOKEN_TURNSTILE_SECRET` | 服务端 Turnstile 校验及真人凭证相关 Secret |
| `FREE_TOKEN_OPS_SECRET` | 私有运维验收用途，不能暴露给前端 |
| `CPA_STATUS_MANAGEMENT_KEY` | 服务端只读号池使用；不能下发浏览器或用于公开管理入口 |
| `FREE_TOKEN_RENDER_KEY` | 旧共享 Key/当前入口开放状态仍引用的遗留 Secret |
| `FREE_TOKEN_CPA_KEY` | 遗留 Secret，按用户要求保留 |

同一 KV 在 `cpa-abuse-guard` 中绑定名为 **`KEYS`**。服务端只存 `sk-lm-` Key 的 SHA-256 与 AES-GCM 密文，不存明文；本地浏览器保存 Key 是用户便利功能。

`wrangler.jsonc` 是本地描述，不是完整生产资产镜像。**不能直接 `wrangler deploy` 上传 public 替换线上 ASSETS**，否则可能丢失只有线上保留的素材。发布脚本使用 `keep_assets`、保留 Secret 和原存储命名空间。

## 4. Render CPA 与 Key 类型

本次通过 Render 插件实时核对：

- Workspace：My Workspace，`tea-d779tahr0fns73e1h3lg`，用户已确认可使用。
- Service：`srv-d9c4kkvavr4c73ab3sfg`，服务名 `cpa`，Singapore，free 计划，Docker。
- 实际绑定仓库：**`https://github.com/LeonMinGod/cpa`，分支 `main`**，不是公开的 CLIProxyAPI 仓库。
- 当前 live deploy：`dep-dbiukprbc2fs73bc85e0`。
- 当前提交：`bf86b75181a2fff5b74a5345cf1e1057da3e45d3`。
- 启动命令：`./CLIProxyAPI --config /etc/secrets/config.yaml`；Secret File 为 `/etc/secrets/config.yaml`。
- 健康检查：`/healthz`。自动部署目前为 **no/off**；用户要求更新不要影响现有 Token 调用，当前只走下方保护发布。

### 免费实例时长与已停用的旧服务（2026-10-31）

Render 每工作区每自然月共享 750 个免费实例小时，按服务运行时长累计，不是连接数或
请求数。用户邮件当时用量为 696/750，不能把该数当作实时账单。单台连续运行 31 天
为 744 小时；多台同时运行分别计时，休眠/暂停期间不消耗免费实例小时。

用户明确授权暂停旧 `grok2api`，服务 `srv-d779u3mdqaus73blfk2g`，地址
`https://grok2api-07gc.onrender.com`，状态已核对 `suspended`，未删除服务。
CPA `srv-d9c4kkvavr4c73ab3sfg` 保持免费套餐、未暂停，部署与配置均未改变，前后
`/healthz` 均 200；没有升级付费或修改现有 Key。以后不要为了“恢复所有服务”自动
启动这个旧 grok2api。需要恢复时在它的 Dashboard Resume，恢复前先核对免费余量。

暂停入口是维护分支手动工作流 `leonmingod-security.yaml` 的 `grok2api-suspend` 模式，
脚本只允许该固定服务，并验证 CPA 配置/部署没有改变；不是通用任意服务暂停接口。
[执行记录](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/41152117748)，
安全结果 `verification/grok2api-suspend-20261031.json`。
官方规则 <https://render.com/docs/free#free-instance-hours>。

### 管理后台 IP 误封与恢复

旧登录保护每 IP 失败 5 次封 30 分钟，检查封禁先于密钥验证。线上 trusted-proxies=[]，
旧管理端只用 Gin.ClientIP，导致把 Render 内部入口当成访客，共享入口一起锁定。
诊断中用户公网 IP 在外层 API 风控没有活动封禁，维护接口却同样返回 native 403；
自然到期后恢复 200。日志平台当时 503、应用文件日志未开，无法归因到某个具体操作者
输错密码，不能把它说成用户一定输错。

CPA 97fbbcd 的管理端使用现有 abuseguard.RealIP 校验过的 Render/CF 代理链；匹配
失败才回退 Gin 配置，不信任任意 XFF/CF-Connecting-IP。原生 5 次/30 分钟政策保留，
只作用管理登录，不作用正常模型调用；没有给共享代理节点设置永久白名单。
新增鉴权 `GET /v8/management/security/login-attempts?ip=...` 与
`DELETE /v8/management/security/login-attempts`（JSON {ip}）查询/清理单个记录。
工作流模式 `management-inspect` / `management-unban` / `management-verify-current`
配合 ip 输入；这些与外层 `guard-status` / `guard-unban` 是两套机制，不能搞混。
验收确认管理端识别的是公网客户端，目标 inactive；未修改 API 自动封禁规则。

### 个人 Key 与静态 Key

`CPA_REMOTE_KEY_AUTH=1` 已上线：`sk-lm-` 个人 Key 通过风控 Worker 的 HMAC 授权接口校验，只传 Key 哈希；远程授权失败时拒绝，控制面不可用通常返回 503。

`sk-karl-…` 等静态客户端 Key 保留本地配置校验，与网页领取独立。新增个人 Key 不需要逐把写入 Render 的静态 `api-keys`。**不能恢复成把一个共享 Key 写进前端，也不能把所有静态 Key 当作义父 Key 删除。**

用户术语：

- “义父 Token”就是这个免费 Token 网站。
- “打开义父 Token 给别人用”指开放网页入口。
- 历史“更新义父 Key”要求替换旧义父 Key 并撤销旧值，不能只新增留下旧值；现在已迁移到每邮箱专属 Key，先区分用户要撤销哪个个人 Key、旧共享 Key，还是新增独立静态 Key。
- Karl Key 是独立永久用途，不参与网页轮换。未获明确指令不删登录凭据、其他 Key 或数据库。

### CPA 部署必须保护 OAuth 登录

Render 重新部署有丢失运行时 OAuth 文件的风险。**不得再采用上线后才上传 OAuth 的普通发布。**
用户明确要求不影响已有 Token 调用。自动部署已暂停，保留 no/off，避免 push 绕过保护。

1. 在推送/合并 CPA main 前执行 `guard-hold`（只暂停自动部署，不关闭风控）。
2. 源码测试/编译通过后推送，执行 `management-safe-deploy`，传完整 expected_commit。
3. 脚本读取最新登录状态，备份为加密 artifact；将完整凭据及 disabled 标志保存到 Render
   私有 Secret File `cpa-oauth-bootstrap.json`，设置新 env `CPA_OAUTH_BOOTSTRAP_FILE`。
   原 `config.yaml`、其他 env、所有静态 Key、CF 密钥/KV 和外层风控策略均保留。
4. 新版 cmd 在监听 HTTP 前恢复缺失文件，保留已存在的更新文件；服务在 auth store
   加载后逐一核对快照文件均在池中，未完整加载就不通过就绪检查。凭据权限为 600。
5. Render 正常就绪后才切流量；脚本验证原 OAuth 数量/启停状态与全部静态 Key，持续
   探测模型列表。保持自动部署 no。下次部署前必须更新最新快照，不可盲用旧 artifact。

本轮 13 份 OAuth / 4 把静态 Key 保留，管理 IP 定点清理后检查 inactive。
**实际限制如实记录：** 本次安全发布 run 41069688318 最终失败，因为 60 次切换探测
有 1 次失败；旧监控未保存该次详细原因，不能断言是网络还是服务切换，也不能声称
零中断。部署本身已 live、凭据齐全、发布后四把静态 Key 均通过；随后只读复核 run
41071018022 为 20/20 HTTP 200。没有为刷绿再次部署或关闭风控，后续监控已增加
时间、状态/错误类型与明细保存。正常模型列表检查不等于完整推理/长流零中断保证。

快照能保护部署前的登录状态，不能替代持续的持久化存储；将来需要更强的重启恢复，
应设计刷新后 OAuth 的持久化同步，不能默默依赖永久旧快照。

登录文件数量以部署前实时快照为准，不能把早期 10/12/13 份当作永久基线，更不能用旧快照覆盖新账号。现有环境变量、Secret File 的其他配置、Karl Key 与其他静态 Key 都要保留。

区分健康与上游额度：`healthz=200` 不代表每个模型都有可用配额。GPT 429/冷却可能来自上游 Plus 账号；重启 Render 不会补额度。先看健康、模型响应和账号状态，再决定是否需要部署。

## 5. 游戏与美术约束

- **45 秒、24 枚灵玉、2 点护盾、无暂停**。不要恢复拖动失焦暂停、空格/ESC 暂停或后台暂停。
- 收集到 19 枚，即最后 5 枚开始时提高难度；不是最后 5 秒。满 24 枚后仍需存活至结算。
- 剑墙有预兆和可到达的稳定通路，红剑不突然反向封死；不要回到必死阵。
- 拾取范围从剑尖/剑身判断，伤害体积独立，不能退回剑柄才算拾取。
- 金令触发 5 秒金刚罩：范围内可拾取青玉/金令，红剑被服务端移除并播放弹飞；不叠时、不回血、不算作灵玉。
- 游戏退出返回选择页。失败保留十句带 emoji/诗句的调侃与重试/叫义父两个出口。
- 公共说明只写通关条件，不剧透“最后五颗狂暴”；不添加“缺口一”等方框或安全区文字。
- 服务器实时接收不可回改操作前缀、逐段提供后续随机性；不允许恢复“本地解题、等待 45 秒、一次性提交完整 trace”的旧漏洞。
- 排行榜 UI 已移除，新领取不再写排名。历史接口/数据保留，不要未经需求重做排名。
- 保持星夜、成人女性、首页 v7/令牌 v5 横竖四张图、玉牌导航、完整挂绳和切页动画。**用户最新要求流光默认开启并增强，覆盖早先默认关闭的偏好。** 保留手动关闭和减少动态效果适配。球下文字条与重复掌心图片层已移除，独立透明球体上下浮动，手机无需 hover。
- 改图只用原生 `image_gen`；放大检查手指、手腕、挂绳及文字，手机功能不能依赖 hover。

## 6. 主要文件

下表的相对路径除特别注明外，均在 `sites/leonmingod-star-night/` 内。

| 文件 | 用途 |
| --- | --- |
| `public/index.html`、`public/home-scene-v6.js`、`public/star-sea-v1.css` | 首页、默认流光、独立浮动球体与品牌字样 |
| `public/home-hero-desktop-v7.webp`、`public/home-hero-mobile-v7.webp` | 当前首页原图 |
| `public/free-token/claim/index.html`、`public/free-token/claim-v10.mjs`、`public/free-token/claim-compact-v5.css` | 义父、落款、邮箱、已存 Key 与 CC Switch |
| `public/free-token/ccswitch-v1.mjs`、`public/free-token/ccswitch-v1.css` | 实时模型选择及 CC Switch 导入 |
| `public/model-status/`、`src/pool-status.js`、`src/pool-quota.js`、`src/pool-metrics.js`、`src/pool-storage.js` | 厂商、双视图、脱敏额度、模型计数与性能、统一限频和持久化 |
| `public/free-token/verify/index.html`、`public/free-token/verify-v2.mjs`、`public/free-token/verify-v2.css` | 独立验证码与跨浏览器复制页 |
| `public/free-token/verify-flow-v2.mjs` | 本地记忆、跨标签流程、邮件片段、验证码请求 |
| `public/free-token/game/app-v17.mjs`、`public/free-token/game/engine-v8.mjs`、`public/free-token/game/physics-v8.mjs` | 当前游戏客户端及共享规则 |
| `public/free-token/human-v3.mjs` | 邮箱发信真人凭证复用 |
| `src/claim.js`、`src/claim-email.js` | 领取 API、Resend HTML/纯文本邮件 |
| `src/claim-store.js`、`src/claim-grant.js` | Key/邮箱存储、限额、领取资格与落款签名 |
| `src/game.js`、`src/security.js` | 游戏权威核验、真人验证与限频 |
| `src/index.js`、`src/static.js` | Worker 路由、`Site` 入口、嵌入静态资源 |
| `release.json`、`scripts/build.mjs` | 发布基线、文件清单与构建 |
| 仓库 `.github/scripts/leonmingod_release.py` | 带版本保护的 stage/publish 发布 |
| 仓库 `sites/api-abuse-guard/` | 异常 IP 统计、临时封禁、个人 Key 授权 |

历史脚本保留以兼容缓存，**以当前 HTML import/src 为准**。新改 JS/CSS 应使用新版本 URL，并加入 `release.json.files`，避免一年的 immutable 缓存继续加载旧内容。

浏览器存储键：`lmg-claim-v1`（已领 Key）、`lmg-claim-email-v1`（邮箱）、`lmg-claim-name-v1`（落款）、`lmg-email-verify-v1`（短期流程）、`lmg-claim-result-v2`（返回结果）。不要把这些测试或导出到公开日志。

## 7. 网站修改与发布步骤

1. 更新维护分支并检查工作树。先核对生产三个 Worker 的活动版本、绑定；仓库中的历史版本号不能直接重跑。
2. 本地在 `sites/leonmingod-star-night/` 运行 `npm ci`、`npm run build`、`npm test`。按变更做手机短屏与电脑浏览器验证。
3. 新资源加入 `release.json.files`；把 `baseline_parent`、`baseline_entrance` 设置为**刚读取的实时版本**，更新 message，清除或替换上一轮 staged_version。
4. 推送到维护分支，手动执行 stage。不要只推 main，也不要为每次例行修改新增无用 PR 或触发旧部署。

```sh
gh workflow run leonmingod-star-night.yaml \
  --repo LeonMinGod/cloudflare_temp_email \
  --ref codex/free-token-home-20261024 -f mode=stage
```

5. 查看阶段测试与 `WEBSITE_RELEASE`：确认 `production_unchanged=true`，比对构建哈希和全部绑定。将新 version_id 写入 `release.json.staged_version`，提交并推送。
6. 手动 publish 已审核的同一个版本；发布脚本会再次读实时基线，保留 ASSETS、Secret、KV、GAME_RUNS，并在验收失败时尝试回滚。

```sh
gh workflow run leonmingod-star-night.yaml \
  --repo LeonMinGod/cloudflare_temp_email \
  --ref codex/free-token-home-20261024 \
  -f mode=publish -f version_id=新阶段返回的版本ID
```

7. 确认 run 真正 success 与活动版本一致；核对主域名/www 的页面、版本化脚本、图片和必要 API。记录版本、回滚点、验证范围，避免把模拟领取写成真实邮件端到端验收。

当前 `release.json.baseline_parent` 仍是发布前 `401ac7d3-59af-4c00-81fa-cc6a7b6d020b`，这是 v60 发布清单，不是下次直接重跑的保护值。下次必须重新读取活动版本；不能删除断言强行发布。

回滚优先把主 Worker 切回已知版本，保留当前存储和凭据。若同时修改过转发，则按原流程先恢复入口、再恢复主站。回滚会同时恢复旧代码/图片/流程；不要为单独改一张图回滚整个系统。任何 Secret 更新也可能生成新的 Worker 版本，后续发布要重新读取。

## 8. 风控与异常 IP 运维

### 2026-10-31 每日 DO 写入耗尽事故与减写补丁

补充现场核对（北京时间 2026-10-31 22:21）：用户提供的
`503 API key validation is temporarily unavailable` 与 Render 22:01～22:09 的鉴权日志一致，
不是 Grok 的拒答/模型限流。远程鉴权代码会将非签名/HTML/异常上游响应收敛成固定
503，不会把原始整页 HTML 透传给客户端。因此另一张 CSS/网页源码截图不能仅凭外观
归因于同一个鉴权故障，需要完整状态码、Content-Type、接口地址和时间（删除 Key）。
同期另有 Grok-4.7 在 21:56:12、22:08:42 出现 empty_stream（首个载荷前断流），是
独立的上游连接异常；没有请求 ID/地址不能直接归属到该反馈用户。

纠正此前过强推断：旧 remote-key provider 在 b93eefd 已有按请求上下文的 memo，不能
只凭 Guard 与路由都调用 Manager.Authenticate 就认定所有请求原来必然重复远程扣额度。
bf86b75 的 SDK 级复用是统一/加固防重，不据此宣称全站远程鉴权或写入必然减少一半。
事故中已证实的主要放大点仍是风控多次持久化与每请求扫描/清理 replay。


当天免费限额 100000 rows_written 已超出；官方 GraphQL 实测先为主站/游戏 4808、
风控 94013，稍后为主站/游戏 4817、风控 97587，合计 102404。10:00 UTC 的风控
写入暴增，最后非零分钟约 10:59，之后被额度拦截。**主要来源是风控/Key 校验，不能
把它归咎于号池页面。** 官网首页/Render healthz 200 不能证明个人 Key 鉴权正常。

减写源码 f068990，16 项测试通过。11:03:59 UTC 主站不动，只把风控从
`05fc1f57-a27b-4fbf-9836-5259321d4eca` 切到 `6600a783-146f-40db-a963-10311045a884`，
4 个绑定/原 STATE namespace、KEYS、密钥与配置保留；没有重启 Render 或替换 Key。
改动：未知/撤销 Key 直接从权威 KV 拒绝；未消费额度的拒绝不重写 quota；无状态变化
的检查不重写 peer；只读/无害观察不持久化 replay；异常证据/管理员变更/真实额度消费
继续持久化并去重。重放过期清理从每请求全表扫描改为每分钟限批清理；小时清理保留。
无害 replay 使用 DO 实例内有界 60 秒缓存，跨实例不承诺诊断计数精确去重；gatewayDenied/
exempt 的 suppressed 诊断计数不逐请求落库。原封禁阈值与 Key/邮箱限额未修改。

**补丁晚于免费限额封锁，不是已经恢复服务。** 现网后续 rowsWritten=0 反映封锁，
不能写成优化后的测量节省率。审计 run 41195500037 停在 `/admin` HTTP 500，后续静态 models/个人 Key 检查尚未执行，未把它刷成成功；新模式
`guard-write-audit` 做一次静态 models 和一次已有个人记录的签名授权验证，不发推理、
不新建 Key、不做在线封禁试验。当前额度未恢复时审计失败是预期风险，恢复后再运行。
证据 `sites/api-abuse-guard/verification/write-quota-incident-20261031.json`。

重置北京时间 **2026-11-01 08:00**（UTC 00:00）。代码优化不会退回已消耗额度。
Workers Paid 官方月最低 USD 5、超量另计；用户尚未确认开通，未产生这项付费变更。
Cloudflare OAuth 插件不含 Billing 权限，读取 subscriptions 就返回 403，需要用户到
Workers 套餐页手动开通或单独连接账单权限。不要关闭个人 Key 鉴权、默默解除请求限额、
删除 DO/KV、换 namespace、重启 CPA 或继续把缓存/健康检查 200 宣称为调用恢复。


Cloudflare `cpa-abuse-guard` 当前活动版本：`8adadc8e-05d3-442a-bf60-7c4f5531edc1`；前一版为 `1f389ed5-c6da-454c-9e59-86bc64a1c76f`。地址 <https://cpa-abuse-guard.928886540.workers.dev>。

`KEYS` 绑定同一个邮箱 Key KV；`STATE` 为 `AbuseState`，DO 命名空间 `73670c63f6e64753b5402345406cd140`，另有 `SERVICE_SECRET`、`ADMIN_SECRET`。`POST /v1/authorize` 是 HMAC 服务间接口，不是浏览器可裸调用的公共管理入口。

仓库策略：5 分钟 20 次明确异常封 1 小时；10 分钟 40 次封 24 小时；24 小时 30 次低频探测封 24 小时；24 小时第三次独立封禁升级 7 天。全部自动到期，记录保留 30 天。401/403/404/405/429/5xx 分别记录，5xx 不作为封禁证据，单次 404/429 不封；合法健康检查、管理与回调免计数。共享公网出口优先按合法 Key 隔离，避免整 IP 误伤。

**区分两个故障策略**：异常 IP 控制面故障可以保持业务可用；个人 Key 远程授权故障默认拒绝授权。唯一临时例外为第 2 节本次事故的显式 KV 开关与代码硬截止；注册表验证/HMAC 仍强制，不等于关闭鉴权。`guard-disable` 只停止 IP 封禁，不关闭个人 Key 授权。

Render 直连 API 已由后端中间件接入风控；仅修改自有域名 Cloudflare WAF 不能保护 `onrender.com` 直连。定时任务每 10 分钟请求健康检查，但免费服务休眠、上游额度和应用故障仍要分别判断。

使用维护分支的 `leonmingod-security.yaml`：

| mode | 用途 |
| --- | --- |
| `guard-status` | 实时策略、封禁指纹与记录，不能仅靠旧文档猜已封 IP |
| `guard-allow` / `guard-unallow` | IP 白名单添加/移除，配合 `ip` 参数 |
| `guard-unban` | 立即解封；`reset_history=true` 才同时清掉重复触发历史 |
| `guard-disable` / `guard-enable` | 观察/执行模式切换 |
| `guard-hold` / `management-safe-deploy` | 暂停自动发布、OAuth 在就绪前加载；替代常规 guard-deploy |
| `management-inspect` / `management-unban` / `management-verify-current` | 原生管理登录锁的定点诊断/清理/只读验收 |
| `pool-xai-audit` | 固定 xAI 只读额度合同检查，不生成模型请求 |

封禁情况属于实时状态，本文不复制一份很快过时的 IP 名单。日志和普通交接只保留不可逆 IP 指纹，不记录原始凭据或请求体。

## 9. GitHub Actions 与旧 Key 工具

为解决反复发失败邮件：

- `Codium PR Agent` 已全局设为 `disabled_manually`，主分支和维护分支都改成仅手动触发。旧模型凭据为空导致 dummy_key 鉴权失败；不要未经修复重新开启。
- 通用 E2E 保留，纯网站目录/专用脚本改动已排除。
- 五个旧网站工作流已去掉 push 触发：Connect Free Token to Render、Deploy Free Token entrance、Inspect homepage Cloudflare deployment、Issue and publish Yifu Token key、Stage new Render Free Token key。
- 当前网站 stage/publish、风控工作流、中文“添加义父 Key / 移除义父 Key”仍为手动入口。真实发布失败通知保留；不要通过关掉所有检查掩盖失败。

**中文 Key 工具保留不代表完全适配个人 Key 模式。** `.github/scripts/yifu_keys.py` 已识别 `{ok:true,next:'email'}`，但 add 且 publish=true 的路径仍要求领取接口返回相同共享 apiKey；不能直接把该模式当作当前“给所有邮箱同步一把 Key”的正确方案。当前个人 Key 的新增/撤销应围绕 KV 授权记录并验证 CPA 行为，不能仅改 Render 静态 Key 列表。

独立静态 Key 可参考中文添加工具的 `publish=false`、`use_custom_key=true`、`key_prefix`、`suffix_digits`。实际执行前先 dry_run、检查当前分支实现及配置快照，遵循完整登录备份、保留其他 Key 的保护流程。不要执行旧版本保护值或一键清空整个 api-keys。

## 10. 验证证据与后续事项

v60 [Stage](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/41204150320) ·
[Publish](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/41204511276)。
证据 `verification/v60-*.json`；公网接口 503 是发布前已有的每日额度故障，未声称已恢复。
受保护 CPA 首次 run 41204622438 在 KV 写备份 401 时中止，尚未部署；重试 run
41204870819 已成功，13 次探测全200；统计快照 KV 补写成功，证据 `v60-cpa-release.json`。不要把失败隐藏或反复重新部署刷绿。


v59 [Stage](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/41077695189) ·
[Publish](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/41077902764)。
57 项测试通过；浏览器验证见 `verification/v59-browser-local.json` 与
`v59-browser-public.json`，发布与资源依据见 `v59-release.json` / `v59-public-source.json`。
厂商、模型与凭证都按次数降序；无额外查询，未部署 Render 或轮换 Key。


v58 [Stage](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/41072746984) ·
[Publish](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/41073674810) ·
[原生 xAI 只读核对](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/41071829805)。
57 项网站测试通过；公网三尺寸使用真实接口核对 Heavy、额度与脱敏，主域名/www 的
8 个新增版本化资源逐字节一致。证据 `verification/v58-*.json`。

v57 [Stage](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/41071012306) ·
[Publish](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/41071501187)。
本地 Key 入口三尺寸浏览器验证，使用虚构本地记录，没有真实发信或领取新 Key。
CPA 管理 IP 与保护发布证据为 `verification/management-recovery-20261030.json`；
保留失败探测记录，详细限制见上方部署说明。

v56 [Stage](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40979061456) ·
[Publish](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40979321483)。
55 项测试通过；公网模型计数和起算时间保留，Render 未部署且 healthz=200。
证据 `verification/v56-*.json`。写入预算为明确标注的代码模拟，不是账单实测。

v55 [Stage](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40971792221) ·
[Publish](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40972514083) ·
[统计配置与登录保护](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40972135000) ·
[真实模型调用验收](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40971772148)。
54 项网站测试，Go 全量测试/编译、计数 race 测试通过；公网三尺寸浏览器默认模型顺序、
真实计数/性能、脱敏额度及本地筛选通过。实测 gpt-6.1-sol 调用 HTTP 200，计数 0→1；
十二次看板读取均正常，六个主域名/www 版本化资源与源码完全一致。证据
`verification/v55-*.json`。未真实发送验证码邮件，未轮换用户 Key。

v54 [Stage](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40915716462) ·
[Publish](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40915906456)：49 项
测试、公网真实额度/双视图及 30 次读取验证通过。证据 `verification/v54-*.json`。

以下 v53、v52 为此前验收记录：

v53 [Stage](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40904919911) · [Publish](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40905233018)：45 项测试通过，包括真实 Workers fetch；7 个页面上线、主域名/www 共 46 项资源比对通过；号池 API 均 200，无私人字段，Render healthz 200，领取仍开放。公网桌面/手机检查覆盖首页、令牌页、CC Switch 和号池；393×580 短屏无整页横向溢出。未发送真实邮件、未轮换 Key、未部署 Render。证据见 `verification/v53-public-resources.json`、`v53-browser-layout.json`、`v53-*.jpg`；原生生图提示词、尺寸与文件见 `verification/star-sea-v53-artwork.json`。

以下为上轮 v52 邮箱流程验收记录：

本轮网站 stage：<https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40840633936>

本轮 publish：<https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40840812582>

- 本地与 GitHub 阶段 **37 项测试通过**，包括真实 SQLite、领取资格、签名落款、防覆盖、同邮箱同 Key、旧记录、错误次数与限额。
- 本地及公网各 8 项浏览器场景通过，覆盖 393×580 手机与 1440×900 电脑、邮箱/落款记忆、整段粘贴、邮件链接、新标签页和跨浏览器复制。
- 主域名/www 的 24 项页面、新脚本与 v6 图片和源码一致；无资格发码/校验 403、空落款 400、正常签名落款确认 200 且无共享 Key；Render healthz 200。
- 浏览器领取响应使用模拟值；邮件服务用测试替身验证模板与请求。**本轮没有发送真实验证邮件、没有在真实 iPhone Mail 上验证系统键盘建议，也没有新增/轮换生产 Key。**
- 证据在 `sites/leonmingod-star-night/verification/email-convenience-v52-*.json`；历史更新在同目录 `WEBSITE_UPDATE_CN.md`。

后续重点：

1. 个人 Key 模式下重做管理工具，清晰区分入口开放、暂停新发放、撤销指定个人 Key、轮换旧共享 Key。当前 `/status` 依赖遗留 `FREE_TOKEN_RENDER_KEY`，但邮箱发码/校验函数未直接按它拒绝；**删该 Secret 不能视为已经完整关闭个人 Key 领取，更不等于撤销已领 Key**。本次仅交接记录，未替用户关站或改该策略。
2. v52 后端对无落款旧客户端兼容；若要全量强制，先设计旧流程迁移和相应运维探针，不能直接改坏现有 preflight。
3. 先前报告的 grok 模型映射、max_tokens 不生效、Gmail 加号别名多领、私有运维凭证权限边界、排行榜旧数据，尚未在本轮修复；按具体需求分别复验。
4. 旧共享 Secret/Key 和独立 Karl Key按用户原要求保留；数据库 `leonmingod-db` 没有收到删除决定。
5. `mail.leonmingod.com` 临时邮箱验证是另一条业务线。其独立 KV/Turnstile 等配置不能套用到本免费 Token 站，也不要在本网站发布时覆盖。

## 11. 给新会话的接手话术

```text
请接手 LeonMinGod 项目，先读维护分支 codex/free-token-home-20261024 根目录的 LEONMINGOD_HANDOFF_CN.md，再读 sites/leonmingod-star-night/WEBSITE_UPDATE_CN.md，并核对线上状态。
网站源码在 sites/leonmingod-star-night/，网站由 Cloudflare 托管；CPA 在 Render 私库 LeonMinGod/cpa。当前网站 v60，监控五分钟刷新/十五分钟存档且预算紧张暂停可选写入；厂商/模型/凭证默认调用次数降序、零凭证厂商隐藏，选择与胜利页可查看本地 Key，xAI 套餐/周额度/共享用量已接原生只读源；统计缓存采用变化分片写入；默认显示真实单模型调用次数并按次数降序排序；首页图片 v7、令牌图 v5、游戏规则 v8，各自编号不要混淆。流光默认开启；保留 CC Switch 实时模型导入、按厂商分组的模型/凭证双视图、服务端脱敏邮箱、真实额度及统一刷新限频。
保留邮箱专属 sk-lm- Key、落款、本地记忆、独立验证码页、120 秒重发和两小时真人凭证；不要恢复共享 Key 发放、“换个邮箱领取”、排行榜或暂停。
先确认实际需求，再直接修改和验证；授权范围内的例行修复不必重复请求许可。发布用维护分支的手动 stage/publish，先读取 CF 实时版本，保护所有绑定、Key 和 OAuth 登录。
用简体中文沟通，简洁直接。不要新增无用 PR 或恢复失效的自动审查机器人。
```
