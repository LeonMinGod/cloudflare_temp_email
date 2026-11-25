# LeonMinGod 网站更新记录

## v63：分钟级冷却倒计时与 VPS 资源保护

主站 `fe123ce3-a104-43df-a4b8-abbf8ff07322`，入口版本保持不变，12个绑定及原存储保留。
`status-v8.mjs` / `time-v1.mjs` 同时用于模型冷却、凭证冷却、额度重置和续期倒计时。
小于一小时显示具体分钟，小于一分钟显示秒，过期显示待更新。浏览器本地每秒更新，
不额外查询；五分钟共享刷新、十五分钟历史存档、状态优先和同状态调用量排序保持不变。

66项网站测试通过；手机/电脑线上页面及6项apex/www源码核对通过。使用已发布脚本和
模拟五分钟冷却验证5分钟→4分钟→30秒，270秒只有一次API读取，未出现横向溢出或脚本错误。
Stage 41891235425、Publish 41892132895成功，证据见 `verification/v63-*.json`。

VPS新增8319并发网关后转原8317；号池8318不变。全局4、单Key2并发，最多4排队、等待2秒，
繁忙返回429与Retry-After:2；16MiB请求体上限，无推理/流式截止时间，不增加IP封禁。
CPA日志上限50MiB、错误日志最多5份、详细请求日志关闭；journal持久32MiB/运行时16MiB、最多7天。
每日北京时间04:30加密备份保留14天，手动升级产物90天；加解密回读和SQLite一致性检查通过，
尚未进行整机灾难恢复演练。实际资源、备份运行与回滚步骤以根目录VPS交接为准。

安装41891715566、切换后验证41892644325通过，原CPA/Tunnel/monitor进程未重启，Key和停用状态保留。
前后gpt-6.1-sol非流式/流式生成均200、流式收到DONE，模型列表51项；不代表全部模型可用。
早期资源探测因VPS无Python失败，改用现有Node；第一次安装在Tunnel API权限检查处停止，
未切业务路由，随后改为Actions本地安装、CF插件切换、Actions验证。没有为得到绿灯重复部署CPA。

## v62：公益 CPA 迁到 VPS，号池采集和历史改用 SQLite

生产主站 `8419c16f-c7c5-4b90-aa89-21e087b26b8c`，入口不变。公益 API 为
`https://yifu.leonmingod.com/v1`，与用户本机 `cpa.leonmingod.com` 严格隔离。
恢复的13份公益凭证（10停用）、四把静态Key和管理密码保留；移除启动时旧bootstrap恢复，
失效的三份启用凭证由用户迁移后重新授权，不借本机账号。

号池五分钟采集、十五分钟历史存档改在VPS运行，SQLite WAL持久化；网站只签名转发脱敏结果。
原CF历史与modelUsage受保护导入，CF监控alarm退休。旧InstaBox保活、临时域名和8317发布端口撤下，
本项目服务停用，其他共享项目未动。网站、邮箱Key注册表、鉴权限流及游戏仍在CF。

旧Render和临时public-cpa地址在现有保存Key中自动迁为yifu，Key本身及本机地址不变。
当前脚本claim-v11/app-v18/verify-v3/verify-flow-v3/saved-key-v2/ccswitch-v2，旧不可变资源保留。
CC Switch默认名包含“义父公益”，模型仍用当前Key实时读取/v1/models。
原11个绑定和存储命名空间保留，增加普通URL配置VPS_POOL_ENDPOINT。

网站65项、监控4项、风控22项通过；stage41853618316、publish41854967863。
apex/www真实号池200、backend=vps、13账号/35模型、非stale且脱敏；14个新脚本内容匹配（换行符归一）。
四把静态Key与临时个人Key各返回35模型，临时记录已删除。手机浏览器35模型卡无横向溢出。
导入41855170914与加密备份41855698933成功。推理未验收成功，仍待用户重新授权。
运维详见根目录YIFU_VPS_HANDOFF_CN.md，证据verification/v62-*.json。
旧Render更新记录属于历史，不能照下文旧流程重新部署。尚未配置自动备份。


## v61：状态优先，同状态按调用次数排序

默认顺序为正常、冷却中、异常、未观测、已停用，再按同状态内的调用次数从多到少。
应用于凭证卡、模型卡及厂商标签；停用凭证历史次数保留，空厂商继续隐藏。下拉文案
同步为“可用优先 · 调用次数↓”，使用新脚本 status-v7.mjs。五分钟共享刷新、隐藏暂停、
脱敏和真实额度均保留，仅改前端；没有发布 Render 或改动用户 Key/OAuth。

主站 `de1909dc-78c8-4df2-9735-c3d3aaa225c0`，回滚 v60
`366eeb9c-ce76-4ba5-a695-11fc702a9724`。11 个绑定、原 KV/GAME_RUNS、入口均保留。
61 项测试通过，手机/电脑模拟数据验证排序、筛选、停用历史保留和刷新间隔。
Stage 41602642773、Publish 41602849241 均成功；发布流程真实号池接口检查200，
已移除旧事故的限时放行开关。apex/www HTML、新脚本与排序模块六项源码比对一致。
上线后手机/电脑真实浏览器均 API200，验证冷却凭证658/375次在停用凭证3584次之前，
14个模型依状态和调用量排列，无脚本错误或横向溢出。验收初次出现既有503，等待共享
刷新间隔后通过；本次排序修复不宣称消除了该间歇故障。见 verification/v61-*.json。

## v60：五分钟监控、十五分钟存档与写入保护

主站 `366eeb9c-ce76-4ba5-a695-11fc702a9724`，入口不变。全站状态/模型统计/额度
统一五分钟采集，前端隐藏停轮询，错误五分钟退避；缓存快照十五分钟一次，独立小
控制记录维持共享闸门，每日监控缓存预留上限一万行。风控正常成功请求不逐条写 IP
历史；50k/70k/90k 的风控预留预算分级预警并暂停可选写入，主站读取共享 KV 保护信号。
它是保守预算，不是全账户账单，也不能恢复今天已经耗尽的额度。

网站 61 项、风控 17 项测试通过；手机/电脑验证五分钟轮询、错误退避和隐藏暂停。
公网静态资源四项比对一致，动态号池仍因已有 DO 限额返回503，发布记录明确未通过
动态 API 健康检查，不能宣称已恢复。原 Key、OAuth、背景、游戏与排序保留。

CPA bf86b75 消除同请求在风控/路由中的重复鉴权；Go 全量、race 和编译通过。
受保护部署增加白名单模型统计快照，使用 CF 插件补写 KV（GitHub 该接口返回401）。
Render 已上线 dep-dbiukprbc2fs73bc85e0；13份 OAuth、4把静态Key保留，切换探测13/13
返回200，healthz200。21模型统计快照已补写KV并读回核对，详见 v60-cpa-release.json。
个人Key依赖的DO日额度仍受限，未把静态接口探测写成个人Key已恢复。


## v59：按真实调用次数排序，隐藏空厂商

厂商、模型和凭证均默认按累计调用次数降序；厂商零凭证标签隐藏，进入页面默认
“全部厂商”。实际数据当前 Grok 在 Codex 前，Antigravity 无调用排后，Claude/Gemini
无凭证不再展示。保留手选排序，切换厂商/视图与刷新沿用当前排序；同次数才按原有
常用/状态次序稳定排列。旧固定 GPT/Codex 优先只作为同次数或手选常用的规则。

主站版本 `401ac7d3-59af-4c00-81fa-cc6a7b6d020b`，回滚 v58
`169531c7-97bf-43d7-b8fd-f0fed62c3153`；入口、11 个绑定、KV/GAME_RUNS 与
全部 Key 保留，Render 未部署。57 项测试通过；手机/电脑验证模型与凭证降序，
厂商筛选无额外状态查询。代码 d636451，阶段固定 eb4fc1b。
[Stage](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/41077695189) ·
[Publish](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/41077902764)。


## v57/v58：本地 Key 查看、xAI 原生额度与管理误封修复

当前主站 `169531c7-97bf-43d7-b8fd-f0fed62c3153`，前一版 v57
`3453ed6c-697c-4174-9a16-14cd4c377e9b`；入口仍是
`51a33be8-6ca4-4b4f-886f-613bfea996b0`，11 个绑定、KV/GAME_RUNS 保留。
[本地 Key Stage](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/41071012306) ·
[本地 Key Publish](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/41071501187) ·
[xAI Stage](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/41072746984) ·
[xAI Publish](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/41073674810)。

选择页说明下、游戏胜利画面和通关邮箱弹窗均新增本浏览器 Key 入口，共用旧领取页的
本地记录。支持看/复制地址和 Key 及 CC Switch；有记录才显示，无记录或清除会隐藏，
storage/pageshow 同步。浏览器验证使用虚构本地 Key，没有新建/换发或真实发邮件；
查看 Key 不发 API、Turnstile、邮件或模型请求。游戏规则/服务器领奖机制未修改，
选择页的旧“三十秒”描述纠正为实际四十五秒。

xAI 与 CPA 当前原生面板同源，从固定 billing（credits/常规）、user、settings 四个
GET 读取真实套餐和用量。服务端白名单解析 Heavy、周剩余/重置、按量付费开关及
GrokBuild/Cursor/GrokBot 共享明细，完整邮箱/上游 ID/令牌不公开。四个 GET 组成
一次五分钟刷新组，多人合并，自动不查停用账户，不复制原生管理 UI 的生成 ping
fallback。实时核对 Heavy、周剩 88%，北京时间 11/04 21:58 重置，产品 5%/4%/3%；
这些数字随实际使用变化。57 项测试通过，三尺寸本地和公网核对通过。

另修复 CPA 原生管理登录把 Render 入口 IP 当成客户端造成的连带误封。原生五次失败/
三十分钟保留，只修真实 IP；新增鉴权的单 IP 查询/清理接口。用户 IP 在外层 API
风控没有活动封禁，没有新增永久白名单，也没有修改模型 API 封禁规则。旧锁到期后
先恢复访问，再做保护发布。GitHub username 已更新为 LeonMinGod，脚本兼容旧地址。

CPA 新提交 97fbbcd / 部署 dep-dbiabbdg1s2s73eelarg。新增启动前 OAuth 快照恢复
和完整加载就绪门槛，13 份登录和四把静态 Key 保留，原 config.yaml 与其他 env 不变；
只增加 bootstrap Secret File/env，自动部署保持 no，后续手动 management-safe-deploy。
本次切换的 60 次探测有 1 次失败，原因未被旧监控捕获，流程因此失败但部署已 live；
随后只读验证 20/20 返回 200。不能宣称全程零中断，未为了刷绿再次切换后端，后续
监控已补详细错误记录。完整依据与操作步骤见根交接文档和 verification/。


## v56 号池缓存减少重复写入已上线

主站 `a767d9be-e5e3-4701-b117-77206ad6390c`，可直接回滚到兼容格式的 v55
`2b31bdc4-5d08-4716-8589-411b49f0017c`。入口、11 个绑定、邮箱 KV 和原
GAME_RUNS 保留；未部署 Render，原模型计数与起算时间经公网检查保留。
[Stage](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40979061456) ·
[Publish](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40979321483)。

全站每分钟统计与每凭证五分钟额度闸门不变。持久化事务只更新变化的分片，数量
不变时不重写 manifest；数据缩小时删除旧分片。冷启动恢复分片基线。缓存命中的
额度请求不再重写快照；对象类型标记只初次写入。原历史上限就为 60 条，本次没有
无限增长修复，早前口头判断已更正。

35 模型/13 账号的同等代码模拟中，活跃查看基础写行由 2,760/小时降为 900/小时；
无人查看时由 1,440/小时降到 240/小时，约减少 67% / 83%。100 次内存缓存命中
读取没有新增数据写入。此为模拟应用写行调用，不是 CF 实测账单；未包含额度探测、
其他业务、冷启动和平台索引/缓存计费差异。55 项测试通过；公网统计仍正常，Render
healthz 为 200。证据 `verification/v56-write-budget.json` 与 `v56-release.json`。


## v55 单模型真实调用统计、性能与常用排序已上线

主站 `2b31bdc4-5d08-4716-8589-411b49f0017c`，入口仍为
`51a33be8-6ca4-4b4f-886f-613bfea996b0`，11 个绑定、原 KV/GAME_RUNS 保留。
[Stage](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40971792221) ·
[Publish](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40972514083)。

模型视图成为默认入口。GPT/Codex 厂商和 `gpt-6.1-sol` 常用模型置前，
`gpt-6.1-terra`、`gpt-6-astra` 随后，内部 auto-review 靠后。凭证按状态、厂商、
真实调用量排序；提供请求次数、状态和名称的显式排序选项，模型视图不能选额度排序。

模型卡片展示每个请求别名的真实执行成功/失败/总次数、成功率、五小时五分钟桶、
近期成功流式 TTFT 和按输出耗时加权的 token/s；不是将账号总数分给模型。
默认静态排序与手动“请求数从多到少”彼此独立；完整邮箱继续在服务端脱敏。

CPA 新增不消费队列的鉴权汇总接口 `/v8/management/observability/usage/models`，
提交 `6b7dc9b34f1da0171ce8004dc1ba031e27cd1d21`，当前部署
`dep-dbht8a9srm7s73dt3a30`。先 guard-hold 再推送，保护部署恢复 13 份 OAuth；
真实验收发现原 `usage-statistics-enabled` 为 false，使用新 `pool-enable-stats`
只将该值开启，四把静态 Key、其他配置和环境变量经比对保留，autoDeploy 最终 yes。
前后两份配置/OAuth 的加密备份都在该配置 run 的 artifact 中。

独立池对象每分钟 alarm 收集一次模型聚合计数，无访客时也继续；不生成测试调用、
不自动查询停用凭证额度。按实例高水位合并，重复读取不重计，进程换代不清除已保存
总计。缓存原子分片防止超出 DO KV 单值 128 KiB 上限，兼容旧缓存。游戏 alarm 仍
清理独立游戏局，不与池共用数据。管理错误十五分钟退避，原刷新限频/白名单继续。

历史记录没有模型维度，不能回填；网页展示起算时间。口径为含重试的上游执行次数。
突然重启可能漏掉最后一次分钟检查点后的记录。回滚旧 v54 前注意旧 alarm 会清除此
独立池缓存，保留统计时优先当前源码前滚修复，详见主交接文档。

54 项网站测试、Go 全量测试/编译及模型计数 race 测试通过。真实
`gpt-6.1-sol` HTTP 200 验证将计数从 0 加到 1，重复读取保留计数；手机/电脑
浏览器分别核对常用与请求次数排序、真实数字/性能、双视图、脱敏和刷新闸门。


## v54 号池按厂商分组的模型与凭证双视图已上线

主站 `f1872be0-f97d-4890-9800-0f2f3eb19cf5`，可回滚到 v53
`71cc78b8-48bc-4d9a-ac7b-a5cd73b20386`；入口保持
`51a33be8-6ca4-4b4f-886f-613bfea996b0`，11 个绑定及原 GAME_RUNS/KV 不变。
[Stage](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40915716462) ·
[Publish](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40915906456)。

按用户指定参考站的白色卡片方式重做 `/model-status/`，保留手动深色切换。
顶部为厂商标签，下面可切换“凭证与额度 / 模型状态”；厂商、视图、搜索和状态筛选
均在当前数据上完成，不额外请求 CPA。凭证显示服务端脱敏邮箱、稳定匿名编号、真实
累计成功/失败、20 个十分钟请求桶、套餐、续期、Credit、额度进度及重置时间。
用户本轮明确允许显示脱敏邮箱，覆盖此前只显示编号的约束；完整邮箱、文件名、路径、
管理密钥与上游账号 ID 仍不下发浏览器。

Codex 额度由 CPA v8 `requests/api-call` 代理固定 GET `wham/usage` 获取；支持
Claude/Antigravity 固定额度读取，未提供接口的厂商明确提示。浏览器只传匿名账号 ID，
无法指定上游 URL、auth_index 或 Header。禁用凭证不会自动探测；手动只读查询不启停
账号。模型卡片显示凭证可用性及实际采样历史；当前未接入单模型请求次数、TTFT、
输出速度，明确标注未采集，不把账号统计或其他站的数字冒充单模型结果。

刷新：页面最少间隔 60 秒、隐藏即暂停；服务端使用现有 GAME_RUNS 中独立命名对象
`pool-status-cache-v2` 协调同一 CPA 号池的 60 秒共享缓存与并发合并，原游戏对象
不受影响，无新迁移。模型清单与每凭证主动额度缓存 5 分钟。失败递增退避；管理
401/403 全局退避 15 分钟，避免重复错误登录引发 CPA 自身封禁。旧快照最多用
10 分钟并标 stale。号池快照不再逐次写 KV，避免 30 秒刷新耗尽免费 KV 写额度。

Cloudflare Free zone 新增只读路径 skip 白名单，规则
`8ff6e55df6f04e189212bef11389cadc`，ruleset `06e73eeed2ba48e5bcaba19d606bddbc`。
只匹配主域名/www 的 GET/HEAD `/model-status`、`/model-status/*`、
`/api/pool-status`、`/api/pool-status/quota`，跳过自定义后续规则、受管 WAF/限流及
BIC/securityLevel/uaBlock。其他路径、POST、领取与模型 API 不在本规则范围。
CPA 的 v8 管理读取原已由异常 IP 中间件豁免；页面请求不进入领取/游戏限频。
WAF 修改前后备份在 `verification/v54-waf-*.json`。回滚白名单时仅停用/删除此条规则，
不要覆盖其后新增的业务规则。

49 项测试通过，含真实 Workers 并发、重定向阻断、隐私脱敏、5 分钟额度闸门和
15 分钟鉴权退避。320/393 手机与 1440 电脑模拟数据浏览器交互通过；公网 393/1440
真实数据双视图、厂商切换及额度窗口通过，无脚本异常；切换过程中只读一次状态。
公网连续 30 次读取全部 200、无挑战、共用一份快照。真实 Codex 5 小时与周额度及
重置时间均取得；主域名/www 新页面/脚本/样式匹配，Render healthz 200。
源码与证据见 `src/pool-status.js`、`src/pool-quota.js`、`verification/v54-*.json`。

本轮未重部署 Render、未启停凭证、未轮换客户端 Key。首页 v7、令牌 v5、默认流光、
CC Switch、邮箱/落款和游戏 v8 全部保留。新增手动 `pool-audit` 仅输出脱敏额度契约
与汇总，成功记录 [40912892424](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40912892424)。


## 2026-10-29：v53 CC Switch、真实号池与星海四幅背景已上线

北京时间 23:48 发布：主站 `71cc78b8-48bc-4d9a-ac7b-a5cd73b20386`；入口仍为
`51a33be8-6ca4-4b4f-886f-613bfea996b0`，保留 SITE → 主站命名入口 Site。
[Stage](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40904919911) ·
[Publish](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40905233018)。
稳定旧版回滚参考为带状态 Secret 的 v52 `8f82f2d1-4a50-4d5f-be05-2ac71c7e484d`。

领取结果、保存 Key 和游戏奖励增加「接入 CC Switch」：Claude/Codex/Gemini、配置名、
必选主模型。模型使用当前 Key 读取真实 `/v1/models`，保留别名；用户点击才生成导入
协议，默认不自动启用。弹窗适配手机短屏，关闭会终止模型读取，旧响应不能覆盖新 Key。

令牌入口新增「号池状态」，公开页 `/model-status/` 可切换模型/匿名账号、筛选提供方、
搜索并每 30 秒更新。服务端只读 CPA v8 元数据；本轮读到 13 个账号、3 可用、10 停用、
35 个模型，完整覆盖且非过期数据。只发布匿名编号与已观测额度，不泄露邮箱、文件名、
路径、OAuth 文件或管理凭据。`pool-setup` 仅增加服务端 Secret，11 个绑定均保留，
Render 配置、部署、客户端 Key 与 OAuth 文件均未修改。

首页 v7、令牌 v5 的桌面/手机四张图全部换为原生 image_gen 星海观星台/月门天阙。
图中文字改为 HTML，透明玉球独立上下浮动，删除球下标签与重复掌心图片层。流光按
用户最新要求默认开启并增强，仍保留手动关闭与减少动态效果。令牌挂绳、切页动画、
邮箱专属 Key、落款、120 秒重发、两小时真人凭证和游戏 v8 规则保留。

首次发布因 Cloudflare 注入统计脚本时增加空行而触发严格比对回滚，验证器现只忽略
`</body>` 前的空白差异，其余页面内容仍严格检查。一次发布还遇到 Cloudflare 500，
重试后成功。号池首次连接暴露 Workers 不支持 `redirect: 'error'`；已复现并改为
`manual`，拒绝非 2xx，新增真实 Workers 运行测试确认成功读取及拒绝重定向泄露凭据。

最终 45 项测试通过；主域名/www 共 46 项页面、脚本、样式与图片比对通过，号池 API
均为 200 且无私人字段，Render healthz 200，领取仍开放。公网浏览器覆盖首页/令牌
横竖布局、CC Switch 桌面及 393×580 手机弹窗、实时号池桌面/手机与账号筛选，整页
无横向溢出。CC Switch 使用虚构 Key 和模拟模型，未实际唤起本地应用；未发送真实
验证邮件。证据：`verification/v53-*.json`、`v53-*.jpg`；生图提示词、尺寸和原文件
记录：`verification/star-sea-v53-artwork.json`。截图为降低传输体积缩放，不代表原图尺寸。


## 2026-10-29：v52 邮箱便利性、落款与 v6 首页已上线

发布于 2026-10-29 08:15 UTC：主站 `968904cd-207b-4691-863c-d63cc4487640`，
可回滚到 v51 `76953781-1d5b-43ff-a91c-d3f01ace76f8`；入口仍为
`51a33be8-6ca4-4b4f-886f-613bfea996b0`。10 个绑定与原 GAME_RUNS/KV 均保留。
[Stage](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40840633936) ·
[Publish](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40840812582)

按用户要求恢复电脑和手机首页的 v6 图。此前 v51 沿用 v5，并禁止直接访问 v6；本轮
同时恢复 v6 资源路由、首页两层图片引用，以及发布脚本对 v6 原图的逐字节校验。

移除结果弹窗“换个邮箱领取”及其清除本地 Key 的行为。保留本浏览器已保存 Key 的
查看、复制与同一邮箱找回。邮箱地址单独保存到本地，不必完成验证才记住；叫义父与
游戏奖励的邮箱输入框都会预填，并提供浏览器 email 自动填充与移动端发送键。

叫义父页面恢复 1–20 字落款（用户名）：填落款、输入义父、二次确认时展示落款；称呼
会随领取资格签名，邮箱验证通过后写入邮箱及 Key 记录。已有落款保留，缺失时补齐，
不换 Key。旧版在途请求继续兼容。新名字不写排行榜，也不重新开放排行榜 UI。

验证码输入保留单个 one-time-code 输入框，增加标准 form/name、整段邮件粘贴提取、
全角数字归一化与输入完成自动校验。邮件主题和正文明确展示连续六位数字，并提供
“填入验证码”HTTPS 按钮。验证码与邮箱只置于链接片段，不进入站点请求参数或
HTTP Referer；页面读取后立即移除片段。相同浏览器的新标签页可从本地短期流程元数据
恢复；服务端仍要求原 HttpOnly 资格、邮箱和验证码匹配，链接本身不授予领取资格。
其他浏览器或不同邮箱只展示可用的复制按钮，不发起校验、不消耗错误次数。

iPhone 键盘验证码建议取决于 iOS 与接收邮件的 App；网页已提供标准识别标记，但
不能保证 QQ/Gmail 等每种 App 都弹系统建议。邮件客户端不能可靠运行剪贴板脚本，
因此邮件按钮用于填码，跨浏览器复制由站内页面处理，没有放失效的假复制按钮。
重发仍统一为 120 秒，验证码仍有效 10 分钟，真人凭证仍复用两小时。

本地 37 项后端/存储/邮件测试通过，覆盖签名落款不能被领奖请求覆盖、同邮箱原 Key
找回和旧记录兼容；8 项浏览器场景通过（含 393×580 短屏与 1440×900 首页）。
浏览器验证码与 Key 使用模拟值，未宣称已在真实 iPhone Mail 中验证系统键盘建议。
公网复测同样通过 8 项浏览器场景（领取接口使用模拟响应，未发送真实验证邮件），
主域名与 www 的 24 项新页面/脚本/图片逐字节一致；无资格发码与校验仍为 403，
空落款 400、正常落款确认 200 且签名凭证包含名字、不返回共享 Key；Render healthz 200。
证据：`verification/email-convenience-v52-*.json`。
本轮未部署 Render、未更换 Key、未修改 OAuth 文件或生产绑定。


## 2026-10-29：GitHub Actions 降噪与发布边界

失效的 `Codium PR Agent` 已在仓库 Actions 中手动停用，并在 `main` 改为仅允许手动
触发。它此前没有可用的模型凭据，会以 `dummy_key` 调用后失败、自动留言并重复发送
PR 失败邮件；该失败与网站、Cloudflare 或 Render 发布状态无关。

通用 `End-to-End Tests` 继续用于主项目 PR，但纯 `sites/leonmingod-star-night/`、旧
`sites/free-token-home/` 及其专用运维脚本变更不再启动这套无关的临时邮箱 E2E，避免
机器人连续推送时产生旧任务取消通知。旧版 `Connect Free Token to Render`、
`Deploy Free Token entrance`、`Inspect homepage Cloudflare deployment`、
`Issue and publish Yifu Token key`、`Stage new Render Free Token key` 已全部移除
push 自动触发，只保留手动入口。

当前应使用的生产入口不变：网站发布用 `Deploy current LeonMinGod star-night website`
的 stage/publish；风控与 Render guard 用 `Configure LeonMinGod human verification`；
义父 Key 用中文 `添加义父 Key` / `移除义父 Key`。这些生产运维工作流仍为手动触发，
没有停用。本次只改 GitHub 工作流触发条件，没有部署 Cloudflare 或 Render。

## 2026-10-29：v51 独立邮箱验证与专属 Key 流程已上线

当前主 Worker `leonmingod-home` 版本为
`76953781-1d5b-43ff-a91c-d3f01ace76f8`；发布前版本 v50
`f88d3dde-4134-4542-974f-1c7da29c7e62` 可回滚。入口 Worker
`leonmingod-free-token` 仍为 `51a33be8-6ca4-4b4f-886f-613bfea996b0`，转发源码、
`SITE → Site` binding 和具体路由均未改变。首页保持线上 v5 封面，发布文件 SHA-256
为 `3c5575de1347…`，未改首页图片、美术和导航。

领取流程现分成明确的三步：叫义父并二次确认，或真实完成御剑破阵；填写邮箱并发送；
进入独立 `/free-token/verify/` 页面输入六位验证码。输满六位自动校验，验证码 10 分钟
有效，重新发送统一为 **120 秒**。发送按钮只出现在邮箱步骤；验证码页只做验证码校验、
重发和更换邮箱。Resend 使用已验证的 `leonmingod.com` 发信域名，同时发送品牌 HTML
和纯文本邮件；邮件不泄露该邮箱是否领取过。

叫义父或通关后，服务端签发 20 分钟、HttpOnly/Secure/SameSite 的领取资格，并绑定
浏览器与本次流程。发码和校验接口都要求该资格，KV 中的待验证记录还会绑定资格 ID；
没有叫义父或通关，直接请求 `/claim/code`、`/claim/verify` 均返回 403。义父确认接口
只返回下一步，不再返回共享 Key。Turnstile 放在实际发信和游戏开局处；已有两小时真人
凭证会复用，减少重复 Cloudflare 验证。五次错误验证码锁定、邮箱/IP/全局发信限额继续
生效。

新用户每个邮箱创建一把 `sk-lm-` 专属 Key；同一邮箱以后验证后返回原来的同一把 Key。
KV 只保存 Key 哈希和 AES-GCM 密文，不保存明文。旧版没有密文的记录首次找回时只换发
一次并撤销旧 Key；已停用 Key 不会被恢复。姓名输入和排行榜从领取页、游戏页移除，新的
领取不再写排行榜；历史排行榜接口和已有数据暂留，避免不可逆删除。

本轮没有部署 Render、没有新增或删除 Render Key，也没有修改 OAuth 登录文件。
CPA 仍为 `https://cpa-dhke.onrender.com/v1`，`sk-lm-` Key 继续由现有
`CPA_REMOTE_KEY_AUTH=1` 远程校验。Cloudflare 的 10 个现有绑定全部保留，包括 ASSETS、
KV `1b02d139375045f7a7d5ce2d994abd2c`、GAME_RUNS
`2dffacc2783647f0bec81263501de5e1`、Resend/Turnstile/加密 Secret 及旧配置。

本地和 GitHub 阶段共 34 项测试全过。公网逐字节核验首页、领取页、验证码页、游戏页及
三个当前脚本；公开状态为 open，无资格发码/校验 403，义父确认 200 且不含共享 Key，
带资格的无效邮箱 400，Render `/healthz` 200。
[Stage](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40810252737) ·
[Publish](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40810369882)

## 2026-10-27：Render CPA 异常 IP 防护已上线

只保护 `https://cpa-dhke.onrender.com` 的模型 API，网站页面、游戏与义父 Key 均未
改动。Render 部署 `dep-dbgcpsuk1f9s73c08pg0`，源码提交
`194c48ee7f8d8fd05b15bda6a0b1e5836251689e`；Cloudflare 控制 Worker
`cpa-abuse-guard`，当前活动版本 `49297ea0-0b4c-44ac-904e-b6a9c381d767`。持久封禁状态使用
Durable Object SQLite，Render 重启不丢失；Worker 每 10 分钟探活 `/healthz`，避免
免费实例无流量休眠。

生效阈值为 5 分钟 20 次异常封 1 小时、10 分钟 40 次封 24 小时、24 小时 30 次
低频探测封 24 小时、24 小时内第三次封禁升级 7 天；没有永久封禁。401、403、
404、405、429 和 5xx 分开统计，5xx 不作为自动封禁证据，单次 404/429 不封。
健康检查、管理接口和登录回调免计数；共享公网出口按具体合法 Key 隔离，避免误伤
同 IP 的其他用户。

公网验收：前 20 次 `POST /api/show` 保持原始 404，第 21 次返回 403；记录为
`20_in_5m`、自动到期 1 小时。测试 IP 随后已解封并清除重复封禁历史。25 次健康
检查未计入；正常义父 Key 的 models 200 / 35，12 份登录全部备份恢复，自动部署已
恢复。加密配置/登录备份 artifact 保留 30 天。Render 本身一直在线；当时 GPT 不可用
来自两份上游 Plus 账号的真实配额冷却，重启 Render 不会增加上游额度。

[发布与公网验收](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40538198918) ·
[独立状态复核](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40539773887) ·
[运维说明](../api-abuse-guard/README_CN.md)

## 2026-10-26：v8 金刚罩范围与操作反馈

已发布并验收：主站/代码版本 `98a305ea-8544-45ec-809a-3c1f26ccaf5e`，转发入口仍 `51a33be8-6ca4-4b4f-886f-613bfea996b0`。发布前实时基线为 `7018e442-e644-4bdf-a38f-ca8cf9e31e8e`。27 项检查、4 种布局的特效/失败按钮/音效开关、3 种手机触控实时提交均通过；主域名/www 各 48 项资源与源码一致，真实手机验证控件正常加载。公网管理签名开局后，连续提交 45 段操作完成 v8 通关：24 玉、2 盾，吃到 2 次金令、弹开 20 把红剑、6 次险避事件。并发领奖 200/409/409；整局补交、一次性批量提交和匿名/假验证仍被拒绝。游戏与原领取返回同一把现有 Key（指纹 `a6bbe9c75913e4ec`），models 200 / 33。未部署 Render、未改 Key、保留两小时验证和 v7 在途局。

[Stage](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40349972406) · [Publish](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40350193310) · [Live acceptance](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40350258134)

新局使用 v8 / app-v12：剑墙来向先亮起 0.4 秒剑光再发射，稳定缺口的保护时间同步后移；不增加安全方框、标签或机制剧透。金刚罩生效期间，青玉和金令使用半径 108 的圆形护罩接触范围拾取，红剑接触后由服务端移除威胁、客户端播放向外弹飞和金色火花；五秒到期恢复普通剑尖拾取与受伤判定。重复金令刷新五秒不叠加、不回血。

增加轻量吸收光线、擦边剑光与限频“险过”反馈，短音效可关闭并记住选择。失败先显示已坚持时间、已收集数量与还差多少，再显示原十句随机调侃和两条出口。特效最多 48 个，无全屏模糊或额外图片下载；保留 45 秒、24 玉、两盾、无暂停、两小时验证凭证和 live-v1 实时领奖校验。已开始的 v7 局按原规则完成，旧 v1–v6 漏洞通道继续关闭。

## 2026-10-26：验证后 2 小时免打扰

已于北京时间 2026-10-26 23:07 发布：主站/代码版本 `7018e442-e644-4bdf-a38f-ca8cf9e31e8e`，入口仍 `51a33be8-6ca4-4b4f-886f-613bfea996b0`。发布前只读核对实时基线 `0c98caa6-334b-4b4c-ac1f-694ec95e8879`。20 项检查、两种手机尺寸刷新/重开/切换领取实测通过；主域名/www 各 43 项资源与源码一致。公网管理方临时签名凭证验证连续开局 200、相同奖励领取 200、固定两小时有效期；缺失/过期/篡改凭证均 403。该公网验收使用管理权限签名，不是自动通过真人挑战；真实手机验证控件另行加载检查通过。

[Stage](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40345932586) · [Publish](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40346185218) · [Acceptance](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40346269266)

验证通过后由服务器签发固定 2 小时的 HttpOnly/Secure 签名凭证，同一浏览器刷新、重开游戏、切换义父领取及主域名/www 不再重复弹 Turnstile。凭证不绑定 IP，手机切网不会因此重验；访问不续期，过期、清除 Cookie、签名或浏览器不匹配时重新验证。服务端独立核验凭证，CF 原 token 仍单次使用，实时游戏、领奖条件、限频、关闭状态与私密运维验收继续生效。

客户端 human-v2 / claim-v3 / app-v11。无需修改 Render、Key 或验证 Secret；沿用现有发布流程，发布前读取 CF 当前版本。

## 最终发布：弱网跨局响应隔离（北京时间 2026-10-26 16:19）

当前 CF 主站/代码版本均为 `0c98caa6-334b-4b4c-ac1f-694ec95e8879`，入口仍 `51a33be8-6ca4-4b4f-886f-613bfea996b0`。客户端 app-v10.mjs，实时协议仍为 v7。旧局迟到的成功响应、错误及清理回调均与新局隔离，不覆盖新凭证、不结束新游戏、不清空新局正在提交的请求。
两个针对性浏览器场景均通过，新局持续实时提交 200、无脚本异常。[阶段](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40291321848) 18 项检查通过，[发布](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40291450251)通过；主域名/www 40 项资源与源码一致，匿名领取/开局和假凭证仍为 403。
新义父 Key 仍为指纹 `a6bbe9c75913e4ec`，models 200；旧 `69ba11c6809909d7` 已撤销 401。Render 仍 `dep-dbfglagae00c73819490`、4 把 Key、12 份登录，Karl 保留；本补丁未变更奖励或后端游戏规则，也未再部署 Render。下方完整 45 秒实时通关验收仍适用于未改变的协议/规则。
证据 `verification/security-v7-stale-responses.json`、`verification/security-v7-client-v10-release.json`。刷新旧页面后使用新客户端。

## 当前状态：修复已上线，暴露的义父 Key 已撤销（北京时间 2026-10-26 16:09）

新义父 Key 指纹 `a6bbe9c75913e4ec`（非凭据）已在 Render 验证 models 200 并同步网页；旧 `69ba11c6809909d7` 已删除并验证 models 401。网页仍开放，两条领取使用同一把新 Key，地址仍为 https://cpa-dhke.onrender.com/v1；匿名直接领取须先过真人验证。
主站当前版本 `d93ec9bd-702c-4379-9ac3-922b7919130d`，代码版本 `c6a5209a-d283-4a12-ab4a-a02d9b6f9f2a`；入口仍 `51a33be8-6ca4-4b4f-886f-613bfea996b0`。Render 部署 `dep-dbfglagae00c73819490`。网页本次轮换只切 Secret，未再改代码/美术/游戏。
[新增并同步](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40290134078)、[撤销旧 Key](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40290264958)均成功。最终保留 4 把 Key：唯一义父发放 Key、2 把原有 Key、独立 Karl Key；当前全部 12 份登录均备份恢复（已不是早前的 10 份）。运维检查现为 15 项，包括延迟轮换的旧指纹保护。
CPA 管理接口一度触发错误登录封禁，两次预检均在任何修改前停止；等解封后才备份、轮换，没有重启去赌丢失账号。不得为绕过临时封禁而跳过最新登录备份。脱敏记录 `.github/operations/render-client-keys/yifu-security-rotation-20261026.json`；实时游戏修复的完整验收见下方记录。

## 实时校验 v7 已发布：公网绕过复验通过（北京时间 2026-10-26 15:47）

主站代码版本 `c6a5209a-d283-4a12-ab4a-a02d9b6f9f2a`，入口仍 `51a33be8-6ca4-4b4f-886f-613bfea996b0`。保留 GAME_RUNS 命名空间、原 ASSETS、其他绑定和所有美术；客户端 app-v9.mjs / engine-v7.mjs，玩法参数不变。发布前已重新读取 CF 实时版本，新增验证配置后的保护基线为 `468396f7-8023-4ed8-8339-f835610dabd3`。
[构建阶段](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40287641432) 18 项检查通过，[发布](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40287743435)通过，14 项密钥运维测试通过。3 种本地手机尺寸实时提交和原领取流程通过；主域名/www 共 39 项资源与源码一致，原图片与游戏参数未改。
[真实公网 API 验收](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40287817328)：使用仅管理方持有的签名开局，持续提交 45 段实时操作，24 玉/2 盾通关；领奖并发 200/409/409，与签名原领取相同 Key，models 200 / 34 模型。签名只跳过人机验证，不跳过实时游戏校验，这不是声称自动化通过了真人验证。
无真人凭证的开局/领取、假 token 在主域名/www 均为 403；等待时间后才提交整局 trace、一次性补交 2700 帧均被拒绝。公网手机真人验证控件实际加载且不超出 393×580 屏幕，未代替用户解答挑战。旧 v1–v6 游戏须刷新重新开局。
后续客户端版本不要恢复完整种子/最终 trace 领奖通道。持续在线自动化和领到共享 Key 后转发不能由本次机制彻底消除。

## 防离线解题与批量领取：实时协议 v7

修复原先公开整局种子、45 秒后提交整局 trace 即可领奖的问题。新局使用 live-v1：服务端保存权威状态，每秒接收不可回改的操作前缀，每三秒剑阵使用新的服务端随机数；后续随机数只有提交当前操作后才逐段下发，不公开完整未来种子。服务端检查帧数与实际时间、提交顺序、短时断联、浏览器会话及单次领奖；同一丢失响应可原样重试，不能换一份操作。
旧 v1–v6 领奖协议退出使用，正在旧页面游玩的用户须刷新重新开局，不能保留旧漏洞到新服务端。45 秒、24 灵玉、两盾、金刚罩、美术与无暂停规则不改。网络中断结束本局，不暂停计时。
Cloudflare Turnstile 同时校验开局与原义父领取，严格验证 hostname/action/单次 token；没有验证凭证的直接调用不发 Key，失败不降级放行。每个来源加开局/领取频率限制。仅 localhost 且显式测试绑定允许本地测试令牌；生产域名不能使用此通道。
配置为 CF Secrets：FREE_TOKEN_TURNSTILE_SITEKEY、FREE_TOKEN_TURNSTILE_SECRET、FREE_TOKEN_OPS_SECRET。管理验收使用 30 秒有效、绑定方法/路径/原始请求体的私密 HMAC 签名，供现有 Actions 校验发放值；不向前端返回签名密钥，也不跳过游戏实时校验。签名由现有 Render 管理凭据派生，变更该管理凭据后需重新运行 security setup 同步。
这是防离线预计算与脚本批量领取的改进，不声称能证明每次操作一定来自真人；持续在线的自动化仍有可能，合法领取后的共享 Key 也能被转发。发布与验收结果见上方当前记录。

## 当前状态：新义父 Key 已同步，网页重新开放（北京时间 2026-10-26 15:00）

已新建并验证义父客户端 Key，识别指纹为 `69ba11c6809909d7`（非凭据）；同一把 Key 已写入 CF `FREE_TOKEN_RENDER_KEY`。主域名/www 领取均返回 `https://cpa-dhke.onrender.com/v1` 和该 Key，models 200 / 34 模型。
令牌入口已恢复原转场与 `/free-token/choose/`；手机 393×580 的主域名/www 实际点击通过，无脚本异常。网页状态为 open，未修改页面、图片、游戏规则或 Worker 模块。
主站当前版本 `fd79879f-4dbc-43c9-b5fa-d9cf240b9b59`；入口仍为 `51a33be8-6ca4-4b4f-886f-613bfea996b0`。Render 部署 `dep-dbffl1cs728c73f95fqg`，沿用原代码。
Render 共 4 把 Key：本次唯一的义父发放 Key、2 把原有 Key、独立 Karl Key（`162618109a2dc43b`，再次验证 models 200）。10 份登录保留。已撤销的旧义父 Key 不恢复；以后更新义父 Key 仍须撤销被替换的那把，Karl 不参与网页轮换。
[操作与验收](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40283102427)成功。脱敏结果 `.github/operations/render-client-keys/yifu-open-20261026.json`；不记录 Key 原值。以下为历史记录。

## 当前状态：暂未开放，义父 Key 已撤销（2026-10-26 04:16 UTC）

用户要求固定两种点击形态，本轮已实现并关闭：当前义父 Key `01db29c9e73f5fba` 从 Render 删除，models 401；CF `FREE_TOKEN_RENDER_KEY` 已移除。
主站当前版本 `096277f9-58f3-4671-a137-b4cb2cdcd21b`（关闭 Secret），代码版本 `51310ec6-e00b-4308-b729-bcfc7af6f111`；入口仍 `51a33be8-6ca4-4b4f-886f-613bfea996b0`。Render 部署 `dep-dbfd805g1s2s73fbrr7g`，其余 2 把客户端 Key、10 份登录保留。

- 未开放：令牌仍可点，只显示“暂未开放”，不转场、不进入选择页；原领取与游戏发放均 503 且不返回 Key。
- 开放：用默认 `yifu-add-key.yaml` 新建并发布有效新 Key 后，下一次点击自动恢复原转场及选择页，不用重新部署页面，也不必刷新已打开的令牌页。
- 关闭：默认 `yifu-remove-key.yaml` 移除当前 Key，入口自动关闭。不设置自动开放时间，不用恢复旧 Key/旧 Worker 版本来开放。

`GET /api/free-token/status` 不返回 Key、no-store；状态只跟随当前发放 Secret。添加/删除流程已校验此状态，网站发布流程支持 Secret 缺失并保持关闭。历史 inspect 假定领取开放，关闭后用默认 add/remove 的 dry_run 检查。
[入口发布](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40268031184)通过，18 项后端检查及 10 项 Key 运维测试通过；[撤销记录](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40268141055)成功。
主域名/www 实际开放点击与实际关闭点击分别验收；关闭时两条发放接口均 503。五种布局/交互用模拟状态验证关闭不跳转、原页无需刷新重新开放、触屏、键盘及减少动画模式。图片、游戏 v6/金刚罩、实际通道保护和转发结构均保留。
证据：`verification/availability-release-and-close.json`、`availability-live-*.json`、`availability-browser-*.json`。以下为历史记录。


## 令牌入口开放 / 未开放两种状态

新增 `GET /api/free-token/status`，只返回开放布尔值和提示，不返回 Key，并禁止缓存。它仅由当前 `FREE_TOKEN_RENDER_KEY` 是否存在决定，不新增独立开关。
`token-passage-v2.js` 每次点击都读取新状态：未开放时留在完整令牌页，显示“暂未开放”；开放时保持原转场和 `/free-token/choose/` 入口。减少动画、触屏和键盘同样受控；重新开放无需刷新旧页面即可再次点击进入。
当前 Key 移除流程删除 Render 当前义父 Key 和 CF 发放 Secret，入口自动关闭，原领取与游戏发放返回 503；新增并发布新 Key 后自动恢复原入口。其他 Key、登录和页面素材保留。
添加/删除 Key 流程增加入口状态核验；网站发布脚本同时支持开放和关闭状态，不要求为了发布页面恢复 Secret。未来开放必须登记新 Key，不回滚旧的已撤销 Key。


## 已发布：剑尖拾取与生图金刚罩 v6（2026-10-26 02:02 UTC）

主站 `0e79d9a0-048b-46d8-b109-0b4cde0a76aa`；入口仍 `51a33be8-6ca4-4b4f-886f-613bfea996b0`，客户端 `app-v8.mjs`，共享规则 v6。
[发布验收](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40257121629)通过，17 项后端检查通过，包括剑尖/剑身拾取、受击范围不扩大、同帧金令挡伤害、五秒到期、刷新不叠加及 v1-v5 在途回放。
金令和透明金色符纹护罩均由原生 image_gen 生成（约 152KB / 442KB WebP）；收集反馈跟随剑尖触点。金令独立于灵玉计数，授予 5 秒金刚罩，HUD 倒计时；不恢复已损失的护盾。
公网真实 v6 回放吃到 2 次金令、护罩挡住 17 把剑，24 玉/剩 1 盾通关，领奖并发 409/200/409。仍发当前 `01db29c9e73f5fba`，models 200（本次 22 模型）。未改 Render 或 Key，已撤销旧 Key 不恢复。
33 个发布资源与源码一致，原 8 个图/脚本不变，主域名/www 对齐。公网手机/短屏/横屏浏览器用模拟开局验证剑尖先于剑柄拾取、同帧挡剑、5 秒到期、两张生图资源显示与透明度，无脚本错误；真实领奖另由公网 API 检查。
保留无暂停、v5 公平剑阵、自然空位、无缺口方框、仅通关条件和十句台词。证据见 `verification/release-v6.json`、`production-v6.json`、`tip-ward-browser-*.json`、`golden-ward-art.json`、`difficulty-v6-fixture.json`；以下为历史记录。


## v6：剑尖拾取与金令五秒金刚罩

修正灵玉要落到剑柄才触发的问题：拾取范围沿剑尖到剑身延伸 70 单位，并把收集光效放在实际触点；普通受击小判定不扩大。
新金色令牌与透明符纹金刚罩均由原生 image_gen 生成，仅做 WebP 编码，原 PNG 保留。金令不会计入 24 枚灵玉，拾取后获得 5 秒无敌，金色护罩包围玉剑并在 HUD 倒计时；同帧吃金令优先于受击，重复拾取刷新为 5 秒而不叠加。每局两次出场机会，吃满灵玉后仍可拾取。
前后端共用 `engine-v6.mjs`，客户端 `app-v8.mjs`；旧 v1-v5 局保持原回放。45 秒、24 玉、两盾、无暂停、稳定通道保护、十句台词和无悬浮方框保持。
素材来源及校验在 `verification/golden-ward-art.json`。手机测试覆盖剑尖触发、同帧挡剑、倒计时到期恢复受击及透明护罩画面；不预告隐藏难度阶段。


## 已发布：删除悬浮方框和缺口文字（2026-10-26 01:30 UTC）

主站 `190a247f-8f89-4437-b41d-137cf2760145`，入口仍 `51a33be8-6ca4-4b4f-886f-613bfea996b0`；客户端 `app-v7.mjs`。
仅删除随剑墙下落的虚线透明方框和“缺口 ↓”文字，让玩家观察自然空位。v5 引擎、实际缺口保护、难度、不可暂停、通关条件和十句台词均未修改。
[发布验收](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40254536775)通过，固定阶段构建的 12 项测试通过。主域名/www 客户端与源码一致，均已删除方框/文字；v5 引擎字节相同。
公网 320×480、393×580、844×390 浏览器与剑墙画面检查通过；开局 API 为测试夹具，本轮未重复真实游戏领奖。发布校验旧领取/models 200、相同当前 Key、GAME_RUNS 与转发结构均保留，未改 Render。
证据：`verification/no-gap-marker-*.json`、`release-no-gap-markers.json`。用户拒绝此类调试风格的安全提示，后续不得恢复；以下为历史记录。


## 界面更正：删除剑墙缺口方框与文字

用户明确拒绝随剑阵飘下来的透明方框、虚线和“缺口 ↓”标签，认为出戏。客户端 `app-v7.mjs` 仅删除这段绘制，让玩家自行观察剑阵空位。
不增加替代提示素材。v5 的三格实际缺口、通道保护、直线剑路、难度、领奖与按真实时间推进全部保留。
后续不要恢复此类方框/文字安全区提示；如确需新增提示美术，需与现有仙侠画面融合。


## 已发布：v5 公平剑阵与简洁通关说明（2026-10-26 01:16 UTC）

主站 `8a812fa0-2aec-4ebb-ba29-bff5442ff8d0`，入口仍 `51a33be8-6ca4-4b4f-886f-613bfea996b0`。
[发布验收](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40253418901)通过；12 项后端测试全部通过，含 90 组剑墙缺口可达且不被封住、边缘不反弹、v1-v4 兼容和 SQLite 并发防重复领取。
游戏已用 v5 / app-v6：减轻中后段密度和速度，三格稳定受保护缺口并标记位置；保留 45 秒、24 灵玉、两盾、不暂停和十句调侃。
对外只写通关条件，开局与 HUD 不预告最后五颗、狂暴或后续躲避机制。用户明确要求有挑战但不能设计无路可躲或强制死亡；后续调整保留此原则。

公网真实 v5 领奖成功（24 玉、2 盾），并发 409/200/409。仍发当前 `01db29c9e73f5fba`，models 200 / 34 模型；未改 Render、Key 或人物图片。
28 个发布资源与源码一致，8 个原图/脚本保留，主域名/www 对齐。320×480、393×580、844×390 公网浏览器用固定开局验证无机制剧透、拖动/后台不暂停、失败双入口和实际阶段标记，无脚本异常；该浏览器模拟开局，真实领奖另用公网 API 核验。
`GAME_RUNS`、ASSETS、SITE/Site 转发与旧局均保留；已撤销的昨天 Key 不恢复。证据见 `verification/release-v5.json`、`production-v5.json`、`fairness-v5.json`、`fairness-browser-*.json`；以下为历史记录。


## v5 调整：减轻密度，消除缺口被封和突然折返

用户实玩反馈 v4 中段/尾段不合理，目标是有挑战且可躲避，不是强制失败。
新 `engine-v5.mjs` / `app-v6.mjs`：剑煞保持生成时的直线轨迹，出界离场，不再边缘反弹；剑墙留三格稳定缺口，按玩家位置选择可达区域，缺口通过期间阻止其他剑的预测轨迹封路，并显示随剑墙移动的小缺口标记。
普通段间隔略放缓、双剑概率降低；后段双剑间隔 20/14 帧改为 28/24 帧，剑墙间隔 108/72 改为 180/156 帧，速度与斜向幅度降低，受击保护由 48 增至 60 帧。
45 秒、24 灵玉、两盾、最后五颗升级和吃满后生存保留。保留 v1/v2/v3/v4 在途回放、不可暂停、十句嘲讽和退出回选择页。
**对外页面只说明通关条件，不预告最后五颗、狂暴或吃满后的机制。** 原领取页的游戏说明也对齐 45 秒/24 灵玉。
90 组种子/阶段测试通过，覆盖至少 900 次剑墙和 30000 帧缺口保护，检查缺口在 300ms 反应预算后可达且不被斜剑封住；桌面/手机原美术和当前 Key 不改。


## 昨天的义父 Key 已撤销（2026-10-26 00:46 UTC）

用户明确要求更新即替换并撤销旧义父 Key，已完成：[撤销与验证](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40250878059)。
昨天的 `7fa19b84ca57a2ba` 已从 Render 删除，调用 models 返回 401；当前网站仍只发新 Key `01db29c9e73f5fba`，models 200。
Render 剩 3 把客户端 Key：当前义父 Key 和另外 2 把原有 Key；10 份登录均已恢复。部署 `dep-dbfa5eq9lscs739btcq0`，代码提交不变。
CF 主站仍 `c6a75a10-b1bd-4a93-ba54-8d4ba2236408`、入口仍 `51a33be8-6ca4-4b4f-886f-613bfea996b0`，网页/游戏与新 Key 发放均未改动。
后续“更新/换义父 Key”必须完成新 Key 验证与网页切换后撤销旧义父 Key，不能只新增。脱敏证据 `verification/key-revocation-20261026.json`；以下为历史记录。


## 当前发放 Key 已更新（2026-10-26 00:39 UTC）

按用户“换个新的义父 key”要求，使用默认分支 `yifu-add-key.yaml`，`publish=true` 完成。
新客户端 Key 指纹 `01db29c9e73f5fba`（非凭据），Render 共 4 把 Key，原 3 把全部保留；10 份登录凭证全部备份并恢复。
Render 部署 `dep-dbfa25cs728c73elg030`，仍为原代码提交 `f9cee393e5360db6b47dd18d6c2747a2e6c6cbb7`。新旧 Key 均经 models 验证，新 Key models 200 / 34 模型。
网站 `FREE_TOKEN_RENDER_KEY` 已同步同一把新 Key，领奖地址仍为 `https://cpa-dhke.onrender.com/v1`。
主站当前版本 `c6a75a10-b1bd-4a93-ba54-8d4ba2236408`；入口仍 `51a33be8-6ca4-4b4f-886f-613bfea996b0`。本轮仅切 Secret，全部 Worker 模块、页面/动效、游戏 v4 规则、其他绑定和 Render 环境配置不变。
[操作与验收记录](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40250335029)，脱敏结果 `verification/key-rotation-20261026.json`。后续换 Key 继续用此固定流程，重新读取实时版本；以下为历史记录。


## 已发布：v4 最后五颗狂暴与十句嘲讽（2026-10-26 00:24 UTC）

主站版本 `ad78a420-ae8e-4df3-86b4-8b2f3d3edca3`，入口保留 `51a33be8-6ca4-4b4f-886f-613bfea996b0` 和 SITE → Site 绑定。
[发布验收](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40249180162)通过，阶段构建 9 项后端测试全部通过。
新局 v4 / app-v5：45 秒、24 枚灵玉、两点护盾；累计 19 枚即还差 5 枚时狂暴，不按剩余时间触发。吃满后不再掉玉，纯躲避至 45 秒。
失败随机显示 10 句带 emoji 的嘲讽，保留用户给出的三句、“车到山前必有路，赶紧回头叫义父！”及诗词谐改；可重试或直达义父领取。仍然不准暂停，退出回选择页。

公网真实 v4 领奖通过：24 枚灵玉、剩 1 盾，并发三次仅一次成功（409/409/200）；与原领取 Key 相同，models 200 / 34 个模型。
26 个发布资源与源码一致，8 个原图/脚本保留，主域名/www 对齐。320×480、393×580、844×390 公网浏览器用模拟开局验证短屏、拖动不暂停、后台时间结算、嘲讽/双入口首屏可见，以及第 19/24 枚状态，无脚本异常；真实领奖另用公网 API 核验。
密钥、Render 配置、星夜人物素材、原 ASSETS、GAME_RUNS 命名空间和 v1/v2/v3 在途局均保留。证据在 `verification/production-v4.json`、`rage-browser-*.json`、`release-v4.json`；以下为历史记录。


## v4 调整：最后五颗狂暴与失败嘲讽（2026-10-26）

新局使用 `engine-v4.mjs` / `app-v5.mjs`：45 秒、24 枚灵玉、两点护盾，不允许暂停。
**累计吃到第 19 枚（还差最后 5 枚）起进入狂暴，与剩余秒数无关。**
狂暴增加瞄准双剑、对向交叉与缺口剑墙；吃满 24 枚后停止掉玉并清除场上余玉，进入更密集纯躲避，必须活到第 45 秒。
失败随机展示 10 句带 emoji 的嘲讽，含用户指定的三句、“车到山前必有路，赶紧回头叫义父！”及诗词谐改。
提供再次挑战与直达 `/free-token/claim/` 的入口；游戏退出仍回独立选择页。嘲讽只是趣味文案，不改变 Key 或奖励期限。
服务端按逐局规则版本执行 45 秒最低实际用时校验，保留 v1/v2/v3 在途局的原回放和 30 秒校验；不新增迁移，不改密钥与人物素材。
离线验证控制器仅在 `scripts/planner.mjs`，不进入前端和 Worker。固定可通关轨迹见 `verification/difficulty-v4-fixture.json`，不宣称真实玩家通过率。


## 已发布：彻底取消暂停（2026-10-25 23:50 UTC）

主站版本 `423d9f41-8557-4716-92d1-9b0035f63719`，入口仍为 `51a33be8-6ca4-4b4f-886f-613bfea996b0`。
页面改用 `app-v4.mjs`；暂停/继续按钮、空格/ESC 暂停、失焦及后台自动暂停均已移除。
游戏按实际经过时间推进，后台/BFCache 返回时补算；手机拖动和焦点变化不会停止游戏。
用户明确要求不准暂停，后续不要从历史客户端恢复此功能。规则仍为 v3，两点护盾、30 秒、16 灵玉。

[发布验收](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40246534213)通过。
主域名/www 的游戏 HTML 与 app-v4 均和源码一致，均无暂停/继续按钮。公网 393×580 浏览器
使用固定开局测试夹具验证连续拖动、反复失焦、空格/ESC 和冻结回调后跳时返回；无暂停和脚本异常。
该浏览器用例模拟开局 API，不代表本轮重新完成真实领奖；发布检查真实旧领取/models 200，奖励未变。
本轮未改规则引擎、密钥、人物图片或 GAME_RUNS；阶段构建的原 6 项后端验收仍通过。证据见
`verification/no-pause-browser*.json`、`no-pause-public-source.json`。

## 取消暂停：客户端 app-v4

用户反馈手机拖动频繁触发暂停，并明确要求彻底移除。新客户端移除暂停/继续按钮、空格/ESC 暂停和失焦/后台自动暂停。开局倒计时、战斗均按实际经过时间推进；后台恢复或 BFCache 返回时补算完整时间，新的触屏位置只影响之后的操作，不改写此前帧。规则仍为 v3、两点护盾、30 秒、16 灵玉，退出仍回选择页。新脚本 `app-v4.mjs`，旧缓存脚本保留但页面不再引用。

验证：393×580 触屏连续拖动并反复触发失焦，游戏仍推进；空格/ESC 不停止；冻结回调后将时间推进 45 秒再返回，游戏按实际经过时间结算而非续停。测试无浏览器异常，证据 `verification/no-pause-browser.json`。

## v3 已发布：2026-10-25 17:05 UTC（北京时间 10 月 26 日 01:05）

- 主站：`168571b3-3eab-46c8-89f4-310b62491bf4`；转发仍为 `51a33be8-6ca4-4b4f-886f-613bfea996b0`，SITE / Site 绑定和路由不变。
- 发布：https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40214794565 。
- 6 项服务端测试通过，覆盖第二次受击即结束、v1/v2 在途局、回放一致性、会话与真实 SQLite 并发领奖保护。
- 公网新局确认规则版本 3、初始 2 点护盾；25 灵玉、剩余 1 点护盾通关领奖成功，并发返回 409/409/200。与原领取发出同一 Key，models 200/22 个模型。
- 全部 21 个发布资源与源码一致，包括四张新海报；主域名/www 对齐、手机公网浏览器和短屏操作检查通过。原图/旧脚本保留，Render Key 和 GAME_RUNS 命名空间未改。
- 证据：`verification/production-v3.json`、`public-browser-v3.json`、`art-browser-v3.json`、`flow-v3.json`、`difficulty-v3.json`、`artwork-v6.json`。

## 本轮：v3 两点护盾、难度加码与成人星夜人物美术

- 用户追加要求人物更性感。四张首页/令牌横竖海报均使用原生 image_gen 局部修改，加强成年人丰满身形、深 V 衣领和露肩，保留不透明衣料、星夜、字体、手腕和手指；使用 v6/v4 新图片地址，原图保留。
- 用户反馈旧版首次就通关。新局改为两点护盾，第二次有效受击立即结束。
- 剑煞刷新间隔由 70/55/43 帧改为 68/53/41 帧，速度由 7.7+阶段×0.85 提升为 8.1+阶段×0.9；中后段双剑概率由 15%/35% 提升为 17%/38%，受击保护由 66 帧缩至 63 帧。
- 30 秒、16 枚灵玉不变。客户端 HUD、说明与服务端均同步为两点护盾；新脚本/共享规则使用 v3 URL，避免旧缓存。
- 新局规则版本为 3，已经开始的 v1/v2 局继续按原规则核验，三分钟会话和重复领奖保护保留。
- 同配置 160 局普通机器人通过率从 52.5% 降到 20%；这不等于真实玩家的通过率。

## 已发布：2026-10-25 16:40 UTC（北京时间 10 月 26 日 00:40）

- 主站版本：`f9576720-5c7f-4909-a685-5e145fc25001`。
- 转发版本：`51a33be8-6ca4-4b4f-886f-613bfea996b0`。转发 JS/映射字节保持不变，`SITE` binding 指向主站的命名入口 `Site`，让更新页面先经过主站处理；保留原更具体路由。
- 发布与验收：https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/40212806612 。
- 14 个新增/更新资源与源码一致，8 个受保护的原图/脚本不变；主域名/www 四个页面一致。公网手机浏览器 393×580 检查通过。
- 原领取 200，现有 Key 指纹仍为 `7fa19b84ca57a2ba`；`/v1/models` 200、22 个模型。未修改 Render 配置/Key。
- 公网 v2 游戏领奖成功（27 枚灵玉、2 点护盾），并发返回 200/409/409，奖励与原领取完全相同。`GAME_RUNS` 原命名空间保留，无新迁移。
- 脱敏证据见 `verification/`。不包含 Key 原值、会话 Cookie 或登录文件。

保留已有 ASSETS 时，其原路由行为也会保留，命名入口 `Site` 绑定对当前页面覆盖至关重要。不要移除或改回默认入口。覆盖静态资源时使用本次的版本化新 URL；不要上传本目录不完整的公开镜像覆盖原资产集。HTML 对比只排除 CF 统计脚本及其插入的一行空白；此前该空白曾误触发自动回退，现已修正。回滚须先恢复转发，再恢复主站。

## 2026-10-25 · 手机布局、独立选择页与御剑破阵 v2

本目录的服务端与转发代码从当前 Cloudflare 发布版本的 source map 恢复；公开页面、脚本、样式和关键素材从线上收回。不是用户 Windows 目录的完整拷贝，原 `WEBSITE_UPDATE_CN.md`、原配置与历史 `.review-20261025/` 未取得。

恢复基线：主站 `2bc44ccd-b647-483b-aca7-256ea46ad69c`；转发 `69575cec-ac2c-416f-81b9-b64030e87651`。

### 本轮变更

- 首页移除灵球下被手机导航遮挡的提示，通过更清楚的青金光环与约 7px 浮动提示可点击；全屏流光仍默认关闭。
- `/free-token/` 恢复只有完整令牌的入口，移除人情/实力文案、两个路线按钮和触摸提示。
- 令牌保留切页动画，点击后到 `/free-token/choose/`，独立展示「叫声义父」「御剑破阵」两张图文卡片。
- 原领取页收紧头图、说明、间距；提供返回选择页入口。
- 游戏退出及其他返回入口指向选择页。手机游戏画布按可视高度布局，避免底部超出屏幕。
- 游戏新规则：30 秒、3 点护盾、16 枚灵玉；剑煞逐段加速、增加双剑、斜移剑和带缺口的剑阵，命中无敌时间缩短。前后端共用 `engine-v2.mjs`。
- 发布前已开始的旧局继续按 v1 规则重放，新局记录 `rulesVersion`，保留三分钟会话与重复领奖保护。
- 用原生 image_gen 生成玉剑/灵玉/剑煞/护盾图集及独立星夜山谷背景；仅做 WebP 编码压缩，画布使用图片精灵。图集约 235KB、背景约 230KB，避免逐帧大模糊和满屏粒子。

### 难度校准

160 个种子的普通反应模拟：通过率 52.5%；较慢反应 18.75%。这是离线机器人校准，不能声称真实玩家失败率恰好一半，后续依据实际试玩反馈调整。

### 本轮验证

- 共享规则的回放一致性及无效操作记录检查。
- 会话、超时、提前领奖、未通关和重复领奖检查。
- v1 在途局向后兼容。
- 本地真实 SQLite Durable Object 并发六次领取：一次 200、其余五次 409。
- 浏览器布局覆盖 320×480、393×580、393×664、844×390、1440×900。
- 触屏点击、令牌转场、两条路线、原领取弹窗、游戏拖动、暂停/继续、退出与减少动画模式。

本次生成图原件位于云端 `/workspace/generated_images/`；公开检查基线位于 `/workspace/scratch/leonmingod-production-baseline/` 和 `/workspace/scratch/leonmingod-handoff-20261025/`。本轮截图/校验位于本目录 `test-results/`（不入 Git）。

### 发布方式

`release.json` 只列本轮新增/更新文件。构建将这些文件随 Worker 打包并优先响应，其他路径继续交给原有 `ASSETS`。部署使用 `keep_assets`、保留 Secret 与已有 `GAME_RUNS` 命名空间，不重建 Durable Object、不重新上传不完整的历史静态资产集。

固定工作流：`.github/workflows/leonmingod-star-night.yaml`，先 `stage` 上传未激活版本，再 `publish` 发布已验证版本。每次读实时版本；基线变化时须重新检查。源目录与旧 `sites/free-token-home/` 分开，避免触发旧部署。失败自动恢复原主站版本。
