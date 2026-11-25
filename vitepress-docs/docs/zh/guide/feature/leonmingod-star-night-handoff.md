# LeonMinGod 星夜版交接（2026-10-25）

> 当前v62已迁移VPS，请先读[公益VPS部署](yifu-vps.md)和根目录最新交接；下文为历史记录。

> **历史交接归档。** 当前 v52、邮箱专属 Key 与发布方式请以[最新交接文档](https://github.com/928886540/cloudflare_temp_email/blob/codex/free-token-home-20261024/LEONMINGOD_HANDOFF_CN.md)为准。下文的共享 Key 和“当前版本”均是当时状态，不可直接执行。

## v8：护罩弹剑与拾取、剑光预兆和反馈

已发布并验收：主站/代码版本 `98a305ea-8544-45ec-809a-3c1f26ccaf5e`，转发入口仍 `51a33be8-6ca4-4b4f-886f-613bfea996b0`。发布前实时基线为 `7018e442-e644-4bdf-a38f-ca8cf9e31e8e`。27 项检查、4 种布局的特效/失败按钮/音效开关、3 种手机触控实时提交均通过；主域名/www 各 48 项资源与源码一致，真实手机验证控件正常加载。公网管理签名开局后，连续提交 45 段操作完成 v8 通关：24 玉、2 盾，吃到 2 次金令、弹开 20 把红剑、6 次险避事件。并发领奖 200/409/409；整局补交、一次性批量提交和匿名/假验证仍被拒绝。游戏与原领取返回同一把现有 Key（指纹 `a6bbe9c75913e4ec`），models 200 / 33。未部署 Render、未改 Key、保留两小时验证和 v7 在途局。

[Stage](https://github.com/928886540/cloudflare_temp_email/actions/runs/40349972406) · [Publish](https://github.com/928886540/cloudflare_temp_email/actions/runs/40350193310) · [Live acceptance](https://github.com/928886540/cloudflare_temp_email/actions/runs/40350258134)

新局使用 v8 / app-v12：剑墙来向先亮起 0.4 秒剑光再发射，稳定缺口的保护时间同步后移；不增加安全方框、标签或机制剧透。金刚罩生效期间，青玉和金令使用半径 108 的圆形护罩接触范围拾取，红剑接触后由服务端移除威胁、客户端播放向外弹飞和金色火花；五秒到期恢复普通剑尖拾取与受伤判定。重复金令刷新五秒不叠加、不回血。

增加轻量吸收光线、擦边剑光与限频“险过”反馈，短音效可关闭并记住选择。失败先显示已坚持时间、已收集数量与还差多少，再显示原十句随机调侃和两条出口。特效最多 48 个，无全屏模糊或额外图片下载；保留 45 秒、24 玉、两盾、无暂停、两小时验证凭证和 live-v1 实时领奖校验。已开始的 v7 局按原规则完成，旧 v1–v6 漏洞通道继续关闭。

## 2 小时免重复验证（2026-10-26）

已于北京时间 2026-10-26 23:07 发布：主站/代码版本 `7018e442-e644-4bdf-a38f-ca8cf9e31e8e`，入口仍 `51a33be8-6ca4-4b4f-886f-613bfea996b0`。发布前只读核对实时基线 `0c98caa6-334b-4b4c-ac1f-694ec95e8879`。20 项检查、两种手机尺寸刷新/重开/切换领取实测通过；主域名/www 各 43 项资源与源码一致。公网管理方临时签名凭证验证连续开局 200、相同奖励领取 200、固定两小时有效期；缺失/过期/篡改凭证均 403。该公网验收使用管理权限签名，不是自动通过真人挑战；真实手机验证控件另行加载检查通过。

[Stage](https://github.com/928886540/cloudflare_temp_email/actions/runs/40345932586) · [Publish](https://github.com/928886540/cloudflare_temp_email/actions/runs/40346185218) · [Acceptance](https://github.com/928886540/cloudflare_temp_email/actions/runs/40346269266)

验证通过后由服务器签发固定 2 小时的 HttpOnly/Secure 签名凭证，同一浏览器刷新、重开游戏、切换义父领取及主域名/www 不再重复弹 Turnstile。凭证不绑定 IP，手机切网不会因此重验；访问不续期，过期、清除 Cookie、签名或浏览器不匹配时重新验证。服务端独立核验凭证，CF 原 token 仍单次使用，实时游戏、领奖条件、限频、关闭状态与私密运维验收继续生效。

沿用现有验证 Secret 进行用途隔离的 HMAC 签名，无需新增凭据或修改 Render。客户端 human-v2 / claim-v3 / app-v11；已有静态版本保留，避免缓存混用。

## 最终发布：弱网跨局响应隔离（北京时间 2026-10-26 16:19）

当前 CF 主站/代码版本均为 `0c98caa6-334b-4b4c-ac1f-694ec95e8879`，入口仍 `51a33be8-6ca4-4b4f-886f-613bfea996b0`。客户端 app-v10.mjs，实时协议仍为 v7。旧局迟到的成功响应、错误及清理回调均与新局隔离，不覆盖新凭证、不结束新游戏、不清空新局正在提交的请求。
两个针对性浏览器场景均通过，新局持续实时提交 200、无脚本异常。[阶段](https://github.com/928886540/cloudflare_temp_email/actions/runs/40291321848) 18 项检查通过，[发布](https://github.com/928886540/cloudflare_temp_email/actions/runs/40291450251)通过；主域名/www 40 项资源与源码一致，匿名领取/开局和假凭证仍为 403。
新义父 Key 仍为指纹 `a6bbe9c75913e4ec`，models 200；旧 `69ba11c6809909d7` 已撤销 401。Render 仍 `dep-dbfglagae00c73819490`、4 把 Key、12 份登录，Karl 保留；本补丁未变更奖励或后端游戏规则，也未再部署 Render。下方完整 45 秒实时通关验收仍适用于未改变的协议/规则。
证据 `verification/security-v7-stale-responses.json`、`verification/security-v7-client-v10-release.json`。刷新旧页面后使用新客户端。

## 当前状态：修复已上线，暴露的义父 Key 已撤销（北京时间 2026-10-26 16:09）

新义父 Key 指纹 `a6bbe9c75913e4ec`（非凭据）已在 Render 验证 models 200 并同步网页；旧 `69ba11c6809909d7` 已删除并验证 models 401。网页仍开放，两条领取使用同一把新 Key，地址仍为 https://cpa-dhke.onrender.com/v1；匿名直接领取须先过真人验证。
主站当前版本 `d93ec9bd-702c-4379-9ac3-922b7919130d`，代码版本 `c6a5209a-d283-4a12-ab4a-a02d9b6f9f2a`；入口仍 `51a33be8-6ca4-4b4f-886f-613bfea996b0`。Render 部署 `dep-dbfglagae00c73819490`。网页本次轮换只切 Secret，未再改代码/美术/游戏。
[新增并同步](https://github.com/928886540/cloudflare_temp_email/actions/runs/40290134078)、[撤销旧 Key](https://github.com/928886540/cloudflare_temp_email/actions/runs/40290264958)均成功。最终保留 4 把 Key：唯一义父发放 Key、2 把原有 Key、独立 Karl Key；当前全部 12 份登录均备份恢复（已不是早前的 10 份）。运维检查现为 15 项，包括延迟轮换的旧指纹保护。
CPA 管理接口一度触发错误登录封禁，两次预检均在任何修改前停止；等解封后才备份、轮换，没有重启去赌丢失账号。不得为绕过临时封禁而跳过最新登录备份。脱敏记录 `.github/operations/render-client-keys/yifu-security-rotation-20261026.json`；实时游戏修复的完整验收见下方记录。

## 实时校验 v7 已发布：公网绕过复验通过（北京时间 2026-10-26 15:47）

主站代码版本 `c6a5209a-d283-4a12-ab4a-a02d9b6f9f2a`，入口仍 `51a33be8-6ca4-4b4f-886f-613bfea996b0`。保留 GAME_RUNS 命名空间、原 ASSETS、其他绑定和所有美术；客户端 app-v9.mjs / engine-v7.mjs，玩法参数不变。发布前已重新读取 CF 实时版本，新增验证配置后的保护基线为 `468396f7-8023-4ed8-8339-f835610dabd3`。
[构建阶段](https://github.com/928886540/cloudflare_temp_email/actions/runs/40287641432) 18 项检查通过，[发布](https://github.com/928886540/cloudflare_temp_email/actions/runs/40287743435)通过，14 项密钥运维测试通过。3 种本地手机尺寸实时提交和原领取流程通过；主域名/www 共 39 项资源与源码一致，原图片与游戏参数未改。
[真实公网 API 验收](https://github.com/928886540/cloudflare_temp_email/actions/runs/40287817328)：使用仅管理方持有的签名开局，持续提交 45 段实时操作，24 玉/2 盾通关；领奖并发 200/409/409，与签名原领取相同 Key，models 200 / 34 模型。签名只跳过人机验证，不跳过实时游戏校验，这不是声称自动化通过了真人验证。
无真人凭证的开局/领取、假 token 在主域名/www 均为 403；等待时间后才提交整局 trace、一次性补交 2700 帧均被拒绝。公网手机真人验证控件实际加载且不超出 393×580 屏幕，未代替用户解答挑战。旧 v1–v6 游戏须刷新重新开局。
运维补充：添加流程可选 `expected_current_fingerprint`，等待后若网页 Key 已改变则停止，不覆盖其他会话的新配置。CPA 管理接口出现临时登录封禁时，流程在备份/修改前停止；保留账号并等待解封后重试。
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
[操作与验收](https://github.com/928886540/cloudflare_temp_email/actions/runs/40283102427)成功。脱敏结果 `.github/operations/render-client-keys/yifu-open-20261026.json`；不记录 Key 原值。以下为历史记录。

## 当前状态：暂未开放，义父 Key 已撤销（2026-10-26 04:16 UTC）

用户要求固定两种点击形态，本轮已实现并关闭：当前义父 Key `01db29c9e73f5fba` 从 Render 删除，models 401；CF `FREE_TOKEN_RENDER_KEY` 已移除。
主站当前版本 `096277f9-58f3-4671-a137-b4cb2cdcd21b`（关闭 Secret），代码版本 `51310ec6-e00b-4308-b729-bcfc7af6f111`；入口仍 `51a33be8-6ca4-4b4f-886f-613bfea996b0`。Render 部署 `dep-dbfd805g1s2s73fbrr7g`，其余 2 把客户端 Key、10 份登录保留。

- 未开放：令牌仍可点，只显示“暂未开放”，不转场、不进入选择页；原领取与游戏发放均 503 且不返回 Key。
- 开放：用默认 `yifu-add-key.yaml` 新建并发布有效新 Key 后，下一次点击自动恢复原转场及选择页，不用重新部署页面，也不必刷新已打开的令牌页。
- 关闭：默认 `yifu-remove-key.yaml` 移除当前 Key，入口自动关闭。不设置自动开放时间，不用恢复旧 Key/旧 Worker 版本来开放。

`GET /api/free-token/status` 不返回 Key、no-store；状态只跟随当前发放 Secret。添加/删除流程已校验此状态，网站发布流程支持 Secret 缺失并保持关闭。历史 inspect 假定领取开放，关闭后用默认 add/remove 的 dry_run 检查。
[入口发布](https://github.com/928886540/cloudflare_temp_email/actions/runs/40268031184)通过，18 项后端检查及 10 项 Key 运维测试通过；[撤销记录](https://github.com/928886540/cloudflare_temp_email/actions/runs/40268141055)成功。
主域名/www 实际开放点击与实际关闭点击分别验收；关闭时两条发放接口均 503。五种布局/交互用模拟状态验证关闭不跳转、原页无需刷新重新开放、触屏、键盘及减少动画模式。图片、游戏 v6/金刚罩、实际通道保护和转发结构均保留。
证据：`verification/availability-release-and-close.json`、`availability-live-*.json`、`availability-browser-*.json`。以下为历史记录。


## 已发布：剑尖拾取与生图金刚罩 v6（2026-10-26 02:02 UTC）

主站 `0e79d9a0-048b-46d8-b109-0b4cde0a76aa`；入口仍 `51a33be8-6ca4-4b4f-886f-613bfea996b0`，客户端 `app-v8.mjs`，共享规则 v6。
[发布验收](https://github.com/928886540/cloudflare_temp_email/actions/runs/40257121629)通过，17 项后端检查通过，包括剑尖/剑身拾取、受击范围不扩大、同帧金令挡伤害、五秒到期、刷新不叠加及 v1-v5 在途回放。
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
[发布验收](https://github.com/928886540/cloudflare_temp_email/actions/runs/40254536775)通过，固定阶段构建的 12 项测试通过。主域名/www 客户端与源码一致，均已删除方框/文字；v5 引擎字节相同。
公网 320×480、393×580、844×390 浏览器与剑墙画面检查通过；开局 API 为测试夹具，本轮未重复真实游戏领奖。发布校验旧领取/models 200、相同当前 Key、GAME_RUNS 与转发结构均保留，未改 Render。
证据：`verification/no-gap-marker-*.json`、`release-no-gap-markers.json`。用户拒绝此类调试风格的安全提示，后续不得恢复；以下为历史记录。


## 界面更正：删除剑墙缺口方框与文字

用户明确拒绝随剑阵飘下来的透明方框、虚线和“缺口 ↓”标签，认为出戏。客户端 `app-v7.mjs` 仅删除这段绘制，让玩家自行观察剑阵空位。
不增加替代提示素材。v5 的三格实际缺口、通道保护、直线剑路、难度、领奖与按真实时间推进全部保留。
后续不要恢复此类方框/文字安全区提示；如确需新增提示美术，需与现有仙侠画面融合。


## 已发布：v5 公平剑阵与简洁通关说明（2026-10-26 01:16 UTC）

主站 `8a812fa0-2aec-4ebb-ba29-bff5442ff8d0`，入口仍 `51a33be8-6ca4-4b4f-886f-613bfea996b0`。
[发布验收](https://github.com/928886540/cloudflare_temp_email/actions/runs/40253418901)通过；12 项后端测试全部通过，含 90 组剑墙缺口可达且不被封住、边缘不反弹、v1-v4 兼容和 SQLite 并发防重复领取。
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

用户明确要求更新即替换并撤销旧义父 Key，已完成：[撤销与验证](https://github.com/928886540/cloudflare_temp_email/actions/runs/40250878059)。
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
[操作与验收记录](https://github.com/928886540/cloudflare_temp_email/actions/runs/40250335029)，脱敏结果 `verification/key-rotation-20261026.json`。后续换 Key 继续用此固定流程，重新读取实时版本；以下为历史记录。


## 已发布：v4 最后五颗狂暴与十句嘲讽（2026-10-26 00:24 UTC）

主站版本 `ad78a420-ae8e-4df3-86b4-8b2f3d3edca3`，入口保留 `51a33be8-6ca4-4b4f-886f-613bfea996b0` 和 SITE → Site 绑定。
[发布验收](https://github.com/928886540/cloudflare_temp_email/actions/runs/40249180162)通过，阶段构建 9 项后端测试全部通过。
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


这是最新网站交接，优先于旧版页面、目录和部署说明。用户要求先承接已有成果，后续再按要求修改；本轮没有发布网站或更换 Key。

## 已发布：彻底取消暂停（2026-10-25 23:50 UTC）

主站版本 `423d9f41-8557-4716-92d1-9b0035f63719`，入口仍为 `51a33be8-6ca4-4b4f-886f-613bfea996b0`。
页面改用 `app-v4.mjs`；暂停/继续按钮、空格/ESC 暂停、失焦及后台自动暂停均已移除。
游戏按实际经过时间推进，后台/BFCache 返回时补算；手机拖动和焦点变化不会停止游戏。
用户明确要求不准暂停，后续不要从历史客户端恢复此功能。规则仍为 v3，两点护盾、30 秒、16 灵玉。

[发布验收](https://github.com/928886540/cloudflare_temp_email/actions/runs/40246534213)通过。
主域名/www 的游戏 HTML 与 app-v4 均和源码一致，均无暂停/继续按钮。公网 393×580 浏览器
使用固定开局测试夹具验证连续拖动、反复失焦、空格/ESC 和冻结回调后跳时返回；无暂停和脚本异常。
该浏览器用例模拟开局 API，不代表本轮重新完成真实领奖；发布检查真实旧领取/models 200，奖励未变。
本轮未改规则引擎、密钥、人物图片或 GAME_RUNS；阶段构建的原 6 项后端验收仍通过。证据见
`verification/no-pause-browser*.json`、`no-pause-public-source.json`。

## 取消暂停：客户端 app-v4

用户反馈手机拖动频繁触发暂停，并明确要求彻底移除。新客户端移除暂停/继续按钮、空格/ESC 暂停和失焦/后台自动暂停。开局倒计时、战斗均按实际经过时间推进；后台恢复或 BFCache 返回时补算完整时间，新的触屏位置只影响之后的操作，不改写此前帧。规则仍为 v3、两点护盾、30 秒、16 灵玉，退出仍回选择页。新脚本 `app-v4.mjs`，旧缓存脚本保留但页面不再引用。

## 当前 v3 发布：两点护盾与人物美术（2026-10-25 17:05 UTC）

主站版本 `168571b3-3eab-46c8-89f4-310b62491bf4`，入口仍为
`51a33be8-6ca4-4b4f-886f-613bfea996b0`。新局只有两点护盾；剑煞加速、频率和双剑概率提高。
前后端使用 `engine-v3.mjs`，旧局继续按原版本重放；30 秒、16 灵玉与选择页退出流程不变。
四张成年人物海报用原生 image_gen 加强露肩、深领与丰满身形，采用首页 v6 / 令牌 v4 新 URL。

[发布验收](https://github.com/928886540/cloudflare_temp_email/actions/runs/40214794565)通过。
公网确认初始两盾，通关领奖与旧方式的 Key 相同、models 200，并发 409/409/200。21 个资源、
主域名/www 及手机浏览器验证通过；Key、原静态资产和 GAME_RUNS 保留。脱敏证据在新源码
`verification/*v3.json` 和 `artwork-v6.json`；下文版本均为历史记录。

## v3 调整：两点护盾与星夜人物更新

用户实玩后要求再提高难度：v3 改为两点护盾，并加快剑煞、增加中后段双剑出现率。仍为 30 秒、16 灵玉，玩法与页面布局不变。共享规则新增 `engine-v3.mjs`，客户端使用新 URL `app-v3.mjs`，v1/v2 在途局按原版本重放。相同普通机器人配置的 160 局通过率由 52.5% 降到 20%，仅作离线校准。

本轮同时按用户要求，用原生 image_gen 更新四张成年人物横/竖海报：加强露肩、深领和丰满身形，保留星夜、姿态、手部与文字。新路径为首页 `home-hero-*-v6.webp`、令牌 `free-token/welcome-*-v4.webp`；选择页使用新 `choose-v2.css`，原图和旧脚本保留。

## 当前发布：独立选择页与御剑破阵 v2（2026-10-25 16:40 UTC）

当前维护源码为 `sites/leonmingod-star-night/`，由本轮线上恢复并修改。主站版本
`f9576720-5c7f-4909-a685-5e145fc25001`；转发版本
`51a33be8-6ca4-4b4f-886f-613bfea996b0`。转发源码不变，SITE 绑定主站命名入口 `Site`，
保留原具体路由、ASSETS、Secret 和 GAME_RUNS。令牌点击后进入 `/free-token/choose/`，
选择原义父领取或 v2 游戏；游戏退出回选择页。v2 为 30 秒、3 盾、16 灵玉。

[发布记录](https://github.com/928886540/cloudflare_temp_email/actions/runs/40212806612)通过。
公网两种领取 Key 完全相同，指纹仍为 `7fa19b84ca57a2ba`，models 200/22 个模型；
游戏并发领奖为 200/409/409。14 个更新资源、8 个原图/脚本和 www 对齐检查通过。
当前记录与证据在新目录的 `WEBSITE_UPDATE_CN.md` 和 `verification/`，不含密钥原值。

保留 ASSETS 时不应只设置 `assets.config.run_worker_first` 期待覆盖其旧路由；保留命名入口
绑定才能让当前页面进入主站处理。HTML 校验排除 CF 统计脚本及其多插入的一行空白。
旧版本号及旧部署说明在下文作为历史记录保留。

## 后续维护源码已恢复：单令牌入口与游戏 v2

当前云端维护源码位于 `sites/leonmingod-star-night/`，由线上 source map 恢复服务端/转发代码，并抓取关键公开资源。它不等于 Windows 目录完整拷贝；原更新记录和旧截图仍未上传。后续修改从本目录继续，不能再部署 `sites/free-token-home/`。

本轮恢复单令牌入口，点击进入 `/free-token/choose/` 再选择叫义父或御剑破阵；首页去掉遮挡提示并加强球体光晕。领取页和游戏压缩到短屏可视高度，游戏退出返回选择页。新图片图集、星夜山谷背景由原生 image_gen 生成。游戏 v2 为 30 秒、3 盾、16 灵玉与逐段剑阵；普通模拟玩家 160 局通过率 52.5%，不代表真实玩家统计。新旧引擎均保留，已开始的 v1 局继续按旧规则验奖。

部署入口为 `.github/workflows/leonmingod-star-night.yaml`，先 stage、后 publish，保留原 ASSETS、所有 Secret、原命名空间和转发结构。详见源码的 `WEBSITE_UPDATE_CN.md`。

## 源码与接手状态

- 用户本地网站：`D:\apiWorkSpace\leonmingod-home`，没有 Git 仓库。
- `D:\apiWorkSpace\cpa-render` 是另一个 CPA 后端项目，不是网站目录。
- 云端当前只有旧仓库 `928886540/cloudflare_temp_email` 的历史网站源码 `sites/free-token-home/`。
- **新版 `public/`、`src/game.js`、`edge-router/`、`wrangler.toml`、`WEBSITE_UPDATE_CN.md` 尚未上传或连接，不能声称已阅读或已同步源码。** 云端应以之后收到的实际源码为准，不把 Windows 路径当作云端路径。
- 完整接手需要网站源码包，至少包含 `public/`、`src/`、`edge-router/`、`wrangler.toml`、`WEBSITE_UPDATE_CN.md`；如有 `package.json` 和锁文件也一起保留。
- 旧工作分支 `codex/free-token-home-20261024` 保留历史与密钥运维工具，**不能用其中旧网站部署任务覆盖星夜版**。改 `sites/free-token-home/**` 会触发历史部署工作流，应先核实当前入口路由与源码。

## 线上资源与本轮复核

2026-10-25 15:50 UTC 通过现有 GitHub Actions Secrets 执行只读检查：
[检查记录](https://github.com/928886540/cloudflare_temp_email/actions/runs/40208834255)。

| 项目 | 结果 |
| --- | --- |
| 首页 | `https://leonmingod.com/`，200 |
| 令牌入口 | `https://leonmingod.com/free-token/`，200 |
| 原领取页 | `https://leonmingod.com/free-token/claim/`，200 |
| 小游戏 | `https://leonmingod.com/free-token/game/`，200，标题「御剑破阵」 |
| 主 Worker | `leonmingod-home`，版本 `2bc44ccd-b647-483b-aca7-256ea46ad69c` |
| 入口 Worker | `leonmingod-free-token`，版本 `69575cec-ac2c-416f-81b9-b64030e87651` |
| 主站绑定 | `ASSETS`、`FREE_TOKEN_CPA_KEY`、`FREE_TOKEN_RENDER_KEY`、`GAME_RUNS` |
| 旧领取接口 | POST `/api/free-token/claim`，200，返回 Render 地址与现有 Key |
| Key 验证 | Render `/v1/models` 为 200，本轮 22 个模型；指纹 `7fa19b84ca57a2ba` |
| Render 状态 | `dep-dbevs57b9u1s73b4q6pg` 为 live；3 把客户端 Key、10 份登录文件 |

入口与游戏客户端脚本、游戏样式和共享引擎均返回 200。`game/start`、`game/finish` 的 GET 返回 405、Allow: POST。首页当前脚本为 `/home-scene-v5.js?v=20261025-night`，实际初始化 `enabled = false`，全屏流光默认关闭。

本轮只检查公开页面、脚本和旧领取接口，没有重新完成游戏或复测并发领奖。模型数与版本都是检查快照，操作前重新读取。

## 最新架构与领奖约定

- 网站运行在 **Cloudflare Workers**；Render 只承担 CPA API。
- 用户交接的主站结构：`src/index.js`、`wrangler.toml`、`public/`。
- 用户交接的 `edge-router/index.js` 仅通过 `SITE` binding 转发主站，入口有更具体路由；后续保留该结构。尚待新版源码与实时路由核对，不能因旧仓库曾有 HTML 变换而重新部署旧入口。
- 游戏接口：POST `/api/free-token/game/start` 和 POST `/api/free-token/game/finish`。
- 共享规则：`public/free-token/game/engine.mjs`；服务端：`src/game.js`。
- Durable Object 类：`GameRun`；绑定：`GAME_RUNS`；SQLite migration：`v1-game-runs`。以后部署须保留已有命名空间、迁移与状态。
- 服务端重放操作记录，检查耗时、胜负、会话与重复领取。逐局凭证有效期 3 分钟，**不是客户端 API Key 的有效期**。
- 「御剑破阵」规则：30 秒、3 点护盾、至少 10 枚灵玉并存活即可领取，不必叫义父。公网共享引擎的规则值已核对。
- 原「叫声义父」方式继续保留，两种方式共用当前奖励。
- 奖励 Base URL：`https://cpa-dhke.onrender.com/v1`；密钥从服务端 `FREE_TOKEN_RENDER_KEY` 读取，保留现有 Secret，禁止写入前端、源码、聊天或日志。

现有网站仓库 GitHub Actions 已有 `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`、`RENDER_API_KEY`，本轮只读检查确认仍可用。没有必要重复配置；云端直接跑 Wrangler 才需要独立可用的授权通道。日常新增/移除 Key 继续参考[运维记录](./free-token-render.md)的固定入口，适配新站时覆盖双领奖方式并保留 `GAME_RUNS`。

## 已完成设计与后续约束

- 首页、令牌页桌面与手机均为星夜版本；星河、星座集中远处天空，呼应「一念风起，万境星垂」。
- 减少前景闪点，保持星星而避免满屏刺眼颗粒；不改成白天。
- 人物为明确成年人，保留丰满、露肩、深领方向；用户交接称多指问题已修正。
- 保留玉牌导航、球体点击跳转、完整令牌挂绳与切页动画。
- 改图后放大检查手指、手腕、挂绳连接与文字。生图和改图只用原生 `image_gen`。
- 同时兼顾桌面和手机；触屏功能不能依赖鼠标悬停，保留手机性能预算。

## 待接收的交接证据

以下为用户报告已完成的验证，文件尚未在云端收到，不当作本轮重新验证：完整浏览器游戏、公网领奖、并发只有一次成功且重复请求返回 409、主域名与 www 资源对齐、五种布局、触屏、旧领取流程与转场。

- `WEBSITE_UPDATE_CN.md`：完整更新记录。
- `.review-20261025/game-image-generation.json`：素材路径和提示词。
- `.review-20261025/production-game-api.json`：公网领奖验证。
- `.review-20261025/production-game/`：公网截图和布局验证。
- `.review-20261025/game-before/`：修改前备份。

本轮公开检查快照暂存云端 `/workspace/scratch/leonmingod-handoff-20261025/`，是检查副本，不是完整可部署源码。
