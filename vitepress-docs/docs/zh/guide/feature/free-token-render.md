# 免费 Token 的 Render 对接

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

## 已添加：Karl 独立长期 Key（北京时间 2026-10-26 13:24）

按用户指定格式创建 `sk-karl-` 加 8 位随机数字，完整 Key 不写源码/日志；识别指纹为 `162618109a2dc43b`。
这是 Render 单独使用的客户端 Key，不设置自动过期，与义父网页发放无关。新 Key 的 models 返回 200 / 34 模型；Render 共 3 把 Key，原 2 把保留，10 份登录已备份恢复。
部署 `dep-dbfe7q8473hc73crcqr0`，沿用原构建；CF 主站 `096277f9-58f3-4671-a137-b4cb2cdcd21b`、入口 `51a33be8-6ca4-4b4f-886f-613bfea996b0`、所有模块和页面均未改，`FREE_TOKEN_RENDER_KEY` 仍缺失，主域名/www 的状态均未开放。
[操作与验收](https://github.com/928886540/cloudflare_temp_email/actions/runs/40273968410)成功；14 项运维测试通过。脱敏记录 `.github/operations/render-client-keys/karl-20261026.json`。Key 仅在 Render 与本地私密交付文件中，以后网站开关或义父 Key 轮换不能删除 Karl Key。加密交付产物的保留期不是 API Key 有效期。


## 独立长期客户端 Key：与网页发放隔离

默认添加流程现支持 `use_custom_key=true`、前缀和 6–12 位随机数字，必须 `publish=false`，不写 CF Secret、不开放网页，也不设置自动过期。接收方提供 RSA 公钥，Actions 仅保存加密 Key，私钥留在本地，日志与源码只记录指纹。
本次用户明确要求 Karl：`sk-karl-` 加 8 位随机数字。这是独立长期 Key，后续义父网页的开关/轮换不得删除它。现有普通 Key 与登录凭证保留。


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


## 令牌入口开放 / 未开放两种状态

新增 `GET /api/free-token/status`，只返回开放布尔值和提示，不返回 Key，并禁止缓存。它仅由当前 `FREE_TOKEN_RENDER_KEY` 是否存在决定，不新增独立开关。
`token-passage-v2.js` 每次点击都读取新状态：未开放时留在完整令牌页，显示“暂未开放”；开放时保持原转场和 `/free-token/choose/` 入口。减少动画、触屏和键盘同样受控；重新开放无需刷新旧页面即可再次点击进入。
当前 Key 移除流程删除 Render 当前义父 Key 和 CF 发放 Secret，入口自动关闭，原领取与游戏发放返回 503；新增并发布新 Key 后自动恢复原入口。其他 Key、登录和页面素材保留。
添加/删除 Key 流程增加入口状态核验；网站发布脚本同时支持开放和关闭状态，不要求为了发布页面恢复 Secret。未来开放必须登记新 Key，不回滚旧的已撤销 Key。


## 已发布：剑尖拾取与生图金刚罩 v6（2026-10-26 02:02 UTC）

主站 `0e79d9a0-048b-46d8-b109-0b4cde0a76aa`；入口仍 `51a33be8-6ca4-4b4f-886f-613bfea996b0`，客户端 `app-v8.mjs`，共享规则 v6。
[发布验收](https://github.com/928886540/cloudflare_temp_email/actions/runs/40257121629)通过，17 项后端检查通过，包括剑尖/剑身拾取、受击范围不扩大、同帧金令挡伤害、五秒到期、刷新不叠加及 v1-v5 在途回放。
金令和透明金色符纹护罩均由原生 image_gen 生成（约 152KB / 442KB WebP）；收集反馈跟随剑尖触点。金令独立于灵玉计数，授予 5 秒金刚罩，HUD 倒计时；不恢复已损失的护盾。
公网真实 v6 回放吃到 2 次金令、护罩挡住 17 把剑，24 玉/剩 1 盾通关，领奖并发 409/200/409。仍发当前 `01db29c9e73f5fba`，models 200（本次 22 模型）。未改 Render 或 Key，已撤销旧 Key 不恢复。
33 个发布资源与源码一致，原 8 个图/脚本不变，主域名/www 对齐。公网手机/短屏/横屏浏览器用模拟开局验证剑尖先于剑柄拾取、同帧挡剑、5 秒到期、两张生图资源显示与透明度，无脚本错误；真实领奖另由公网 API 检查。
保留无暂停、v5 公平剑阵、自然空位、无缺口方框、仅通关条件和十句台词。证据见 `verification/release-v6.json`、`production-v6.json`、`tip-ward-browser-*.json`、`golden-ward-art.json`、`difficulty-v6-fixture.json`；以下为历史记录。


## 已发布：删除悬浮方框和缺口文字（2026-10-26 01:30 UTC）

主站 `190a247f-8f89-4437-b41d-137cf2760145`，入口仍 `51a33be8-6ca4-4b4f-886f-613bfea996b0`；客户端 `app-v7.mjs`。
仅删除随剑墙下落的虚线透明方框和“缺口 ↓”文字，让玩家观察自然空位。v5 引擎、实际缺口保护、难度、不可暂停、通关条件和十句台词均未修改。
[发布验收](https://github.com/928886540/cloudflare_temp_email/actions/runs/40254536775)通过，固定阶段构建的 12 项测试通过。主域名/www 客户端与源码一致，均已删除方框/文字；v5 引擎字节相同。
公网 320×480、393×580、844×390 浏览器与剑墙画面检查通过；开局 API 为测试夹具，本轮未重复真实游戏领奖。发布校验旧领取/models 200、相同当前 Key、GAME_RUNS 与转发结构均保留，未改 Render。
证据：`verification/no-gap-marker-*.json`、`release-no-gap-markers.json`。用户拒绝此类调试风格的安全提示，后续不得恢复；以下为历史记录。


## 已发布：v5 公平剑阵与简洁通关说明（2026-10-26 01:16 UTC）

主站 `8a812fa0-2aec-4ebb-ba29-bff5442ff8d0`，入口仍 `51a33be8-6ca4-4b4f-886f-613bfea996b0`。
[发布验收](https://github.com/928886540/cloudflare_temp_email/actions/runs/40253418901)通过；12 项后端测试全部通过，含 90 组剑墙缺口可达且不被封住、边缘不反弹、v1-v4 兼容和 SQLite 并发防重复领取。
游戏已用 v5 / app-v6：减轻中后段密度和速度，三格稳定受保护缺口并标记位置；保留 45 秒、24 灵玉、两盾、不暂停和十句调侃。
对外只写通关条件，开局与 HUD 不预告最后五颗、狂暴或后续躲避机制。用户明确要求有挑战但不能设计无路可躲或强制死亡；后续调整保留此原则。

公网真实 v5 领奖成功（24 玉、2 盾），并发 409/200/409。仍发当前 `01db29c9e73f5fba`，models 200 / 34 模型；未改 Render、Key 或人物图片。
28 个发布资源与源码一致，8 个原图/脚本保留，主域名/www 对齐。320×480、393×580、844×390 公网浏览器用固定开局验证无机制剧透、拖动/后台不暂停、失败双入口和实际阶段标记，无脚本异常；该浏览器模拟开局，真实领奖另用公网 API 核验。
`GAME_RUNS`、ASSETS、SITE/Site 转发与旧局均保留；已撤销的昨天 Key 不恢复。证据见 `verification/release-v5.json`、`production-v5.json`、`fairness-v5.json`、`fairness-browser-*.json`；以下为历史记录。


## 昨天的义父 Key 已撤销（2026-10-26 00:46 UTC）

用户明确要求更新即替换并撤销旧义父 Key，已完成：[撤销与验证](https://github.com/928886540/cloudflare_temp_email/actions/runs/40250878059)。
昨天的 `7fa19b84ca57a2ba` 已从 Render 删除，调用 models 返回 401；当前网站仍只发新 Key `01db29c9e73f5fba`，models 200。
Render 剩 3 把客户端 Key：当前义父 Key 和另外 2 把原有 Key；10 份登录均已恢复。部署 `dep-dbfa5eq9lscs739btcq0`，代码提交不变。
CF 主站仍 `c6a75a10-b1bd-4a93-ba54-8d4ba2236408`、入口仍 `51a33be8-6ca4-4b4f-886f-613bfea996b0`，网页/游戏与新 Key 发放均未改动。
后续“更新/换义父 Key”必须完成新 Key 验证与网页切换后撤销旧义父 Key，不能只新增。脱敏证据 `verification/key-revocation-20261026.json`；以下为历史记录。


## 用户更正：更新义父 Key 必须撤销旧 Key（2026-10-26）

“更新义父 Key”“换个新的义父 key”是轮换，不是只新建：只保留最新的义父发放 Key。
先记录旧网页 Key 的指纹，新增并验证新 Key、同步网站成功后，必须用 `yifu-remove-key.yaml` 的明确旧指纹撤销旧义父 Key，并验证旧 Key 401、新 Key 200。
切换后不要用移除流程的默认 `current`，否则会删掉新 Key。其他原有客户端 Key 和登录凭证保留；明确要求“额外新增并保留旧义父 Key”时才追加保留。
本次需撤销昨天的 `7fa19b84ca57a2ba`，保留当前 `01db29c9e73f5fba`；指纹不含 Key 原值。


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

## 当前 v3 发布：两点护盾与人物美术（2026-10-25 17:05 UTC）

主站版本 `168571b3-3eab-46c8-89f4-310b62491bf4`，入口仍为
`51a33be8-6ca4-4b4f-886f-613bfea996b0`。新局只有两点护盾；剑煞加速、频率和双剑概率提高。
前后端使用 `engine-v3.mjs`，旧局继续按原版本重放；30 秒、16 灵玉与选择页退出流程不变。
四张成年人物海报用原生 image_gen 加强露肩、深领与丰满身形，采用首页 v6 / 令牌 v4 新 URL。

[发布验收](https://github.com/928886540/cloudflare_temp_email/actions/runs/40214794565)通过。
公网确认初始两盾，通关领奖与旧方式的 Key 相同、models 200，并发 409/409/200。21 个资源、
主域名/www 及手机浏览器验证通过；Key、原静态资产和 GAME_RUNS 保留。脱敏证据在新源码
`verification/*v3.json` 和 `artwork-v6.json`；下文版本均为历史记录。

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

## 最新网站交接优先（2026-10-25）

先读[星夜版与御剑破阵交接](./leonmingod-star-night-handoff.md)。主站已更新到
`2bc44ccd-b647-483b-aca7-256ea46ad69c`，新增 `GAME_RUNS` 与游戏领奖；新源码来自用户
尚未上传的独立网站目录。下文旧页面部署与源码位置仅供历史参考，不得用旧仓库覆盖线上。
原领取仍有效，与游戏共用 `FREE_TOKEN_RENDER_KEY`。现有 Actions 授权已重新验证可用。

## 日常一键操作：添加 / 移除

两个固定操作已安装到默认分支 `main`，下次无需修改脚本、手动刷新版本号或生成备份私钥。

| 操作 | 默认行为 | GitHub Actions 入口 |
| --- | --- | --- |
| 添加义父 Key | 在 Render 追加新客户端 Key，并同步到网站领取流程 | [添加义父 Key](https://github.com/928886540/cloudflare_temp_email/actions/workflows/yifu-add-key.yaml) |
| 移除义父 Key | 停止网页发放当前 Key，并从 Render 移除该 Key，验证其返回 401 | [移除义父 Key](https://github.com/928886540/cloudflare_temp_email/actions/workflows/yifu-remove-key.yaml) |

直接执行：

```bash
gh workflow run yifu-add-key.yaml -R 928886540/cloudflare_temp_email
gh workflow run yifu-remove-key.yaml -R 928886540/cloudflare_temp_email
```

添加时 `publish=false` 表示只加到 Render；移除时可填 `fingerprint`（16 位 SHA-256 指纹），
选择其他 Key，不影响网页当前 Key。不填则针对网页当前 Key。`dry_run=true` 仅检查，不更改线上。
新增保留已有 Key；移除只针对选中的 Key，并阻止删除最后一把 Render 客户端 Key。

共享实现：`.github/scripts/yifu_keys.py` 与 `yifu_key_api.py`。每次先读取实时状态并准备计划，
上传加密恢复计划成功后才应用；应用前再次比对版本、配置与登录文件，发生并发变化就停止。
只用原构建重新部署，保留并恢复登录文件；只更新或移除 CF Secret，不上传页面代码。
删除当前网页 Key 后，领取接口返回 503 停止发放；下次添加并同步会重新开放。

备份使用 AES-GCM 完整性加密，密钥由现有 `RENDER_API_KEY` 加随机盐派生，无需额外配置 Secrets。
加密计划保留 7 天，操作结果保留 90 天并写入 Actions 摘要；管理凭据更换后，旧备份仍需当时的
凭据原值解密。失败步骤会尝试恢复缺失登录文件。固定流程省去改代码与手工核对步骤，但 Render
重新部署仍需要等待，不能承诺瞬时完成。旧 `issue-yifu-key.yaml` 和一次性迁移脚本留作历史记录，
日常操作使用上面两个入口。

## 当前义父密钥发放记录（北京时间 2026-10-25 21:03）

已新建并开放网页领取。Key 原值只保存在 Render 与 CF Secret 中；用于识别的 SHA-256 前 16 位为
`7fa19b84ca57a2ba`，不是鉴权凭据。Render 现有 3 把客户端 Key（原 2 把保留），10 份登录凭证已恢复。
网页领取与该 Key 调用 `/v1/models` 均为 200，验收时返回 34 个模型；页面、动效与代码模块均未改变。

- 主站当前版本：`fad0e247-77a5-43c2-b708-737898d88ea4`（仅更新 `FREE_TOKEN_RENDER_KEY`）。
- 入口版本：`69575cec-ac2c-416f-81b9-b64030e87651`，本次未改。
- Render 部署：`dep-dbevs57b9u1s73b4q6pg`，仍使用原代码构建。
- [发放与验证记录](https://github.com/928886540/cloudflare_temp_email/actions/runs/40195833941)。
- 后续新增并开放 Key 使用 `Issue and publish Yifu Token key`，先 `inspect` 再审阅保护值后 `issue`。
  不重跑历史 `connect` 或默认撤销旧 Key。当前主站包含 `index.js` 与 `index.js.map` 两个模块，
  旧脚本的单模块假设已不适用；新流程通过 CF Secret API 更新绑定并核对全部模块摘要。

## 新增并开放义父密钥

使用网站工作分支的 `Issue and publish Yifu Token key` 工作流：默认 `inspect` 只读检查；
明确选择 `issue` 后，追加一把新的 Render 客户端 Key、使用原构建部署并恢复登录文件，
验证新旧 Key 后，仅更新主站 Worker 的 `FREE_TOKEN_RENDER_KEY` Secret，让网页发放同一把新 Key。
页面入口 Worker、首页、手机轻量特效和现有源代码模块不重部署；包括 `index.js.map` 在内的
主站模块均进行 SHA-256 比对。主站 CF 版本会随 Secret 更新而改变。

脚本为 `.github/scripts/issue_yifu_key.py`，与历史一次性 `connect`、旧密钥撤销任务分开。
历史工作流的默认模式也已改回 `inspect`；不再因推送自动执行撤销。
操作前重新读取并核对 CF 主站/入口版本、模块摘要与 Render 部署，更新新脚本的保护值。
加密备份使用 `yifu-issue-backup-public.pem`，必须持有其对应的私钥；不要将私钥或客户端 Key 写入仓库。
新发放只追加 Key，不删除、覆盖现有 Render Key；网页切换失败时恢复前一个 CF 版本。

## 用户固定用语（2026-10-25 确认）

| 用户说法 | 在本项目中的含义与执行目标 |
| --- | --- |
| 义父 Token / 义父token | 本免费 Token 网站：`https://leonmingod.com/free-token/` |
| 加一个义父密钥 | 去 Render 的 `cpa` 服务配置新增一把客户端 API Key，保留已有 Key 与其他配置 |
| 打开义父 Token 给别人用 | 将对应客户端 Key 挂到本网站的领取流程，让别人通过网页领取使用；同步 CF Secret 与 Render 中的同一把 Key，并验证发布 |

“义父密钥”是提供给 API 使用者的客户端 Key，不是管理 Render 的 `RENDER_API_KEY`。
“打开给别人用”是启用网页发放的操作要求，不能只打开浏览器页面就当作完成。
仅要求新增密钥时，先完成 Render 新增，不自动替换网页当前发放值；要求开放网页使用时，
再按当前会话明确的对应 Key 接入并发布。沿用已有仓库、服务和 GitHub Secrets，
不因简称不同而重新建项目或重复要求用户创建管理凭据。

## 手机流光性能修复

已于北京时间 2026-10-25 01:18 发布。代码提交 `89de9160c60e63f6a3c937d15e461dcd79155cfa`；
入口版本 `2abf9c44-faf5-4f98-80fa-e383108cca07`，主站仍为 `8aa85754-acf1-498e-91ad-78117e40f8e5`。
[发布与线上验证](https://github.com/928886540/cloudflare_temp_email/actions/runs/40115492703)通过；
线上入口、领取页和 v2 脚本与已测试预览一致，首页保持发布前内容。

触屏设备改为轻量渲染：流体纹理 256、模拟网格 64、压力迭代 6、最高 30 帧、画布像素比上限 1；
低配置设备进一步降至 192 / 48 / 4、最高 24 帧。手机闲置 2.5 秒后暂停，恢复触摸时重新启动；
屏幕/键盘引发的连续 resize 在 150ms 后合并处理。手机令牌和领取卡片保留光晕，移除多层大范围
drop-shadow、模糊及背景实时模糊；桌面保留原画质和悬停效果。

专用引擎 `/free-token/fluid-v2.js` 从 `assets/token-fluid-v2.txt` 提供，保留原 MIT 许可，
增加帧率/像素比预算，并修正原引擎会把显式手机纹理设置强制升回 512 的逻辑。
页面控制脚本升级到 `/free-token/effects-v2.js`；首页的 `/vendor/fluid.js` 未改。
验证覆盖 DPR=3 的普通/低配置触屏模式、桌面模式、实际 WebGL 绘制频率上限、闲置暂停、
resize 合并、令牌点击和确认表单。浏览器模拟验证不代表已在用户的 iPhone 上做过真机测量。

此修复保留仓库后续新增的四入口、品牌 Logo、领取卡片居中与退出行为，不修改 Render 配置或 Key。

`https://leonmingod.com/api/free-token/claim` 仍接受原有的确认请求，成功后返回
`baseUrl: https://cpa-dhke.onrender.com/v1` 和在 Render CPA 注册的同一把客户端 Key。
客户端 Key 存在主站 Worker 的 `FREE_TOKEN_RENDER_KEY` Secret 中；原 `FREE_TOKEN_CPA_KEY`
继续保留。首页图片、胶囊导航、免费 Token 满屏布局和令牌点击动效不受影响。

## 最新页面发布（2026-10-24 05:23 UTC）

免费 Token 入口和领取页现已加入首页同款青玉/淡金流光，令牌浮动约 7px，
光晕与发光轮廓增强。领取页手机卡片最大 340px，压缩插画及表单间距；
393×664 可视区域的确认按钮底边约为 511px，320×480 窄屏也可在首屏点到。

| 项目 | 当前页面发布记录 |
| --- | --- |
| 页面代码提交 | `60af1c18e1fcc1df18086c9210fe7e4a9ab6cca4`，网站工作分支 |
| 新入口 Worker 版本 | `5e32ed4c-a405-4e69-872d-f88526cba7d9` |
| 入口部署 ID | `1a433adb-05de-4fd9-bee1-00c6da262e19` |
| 主站 Worker 版本 | 仍为 `8aa85754-acf1-498e-91ad-78117e40f8e5` |
| 发布记录 | <https://github.com/928886540/cloudflare_temp_email/actions/runs/40066068773> |
| 本次 Render 操作 | 无；地址、Key、主站源码和首页内容保持不变，所发 Key 调用 models 仍为 200、50 个模型 |

`src/token-scene.js` 复用原 `/vendor/fluid.js`；`src/claim.js` 用 HTMLRewriter 收紧原领取页，
不重写原 `app.js` 的确认、领取与复制流程。新浏览器脚本地址为 `/free-token/effects-v1.js`，
使用长期缓存，未来修改脚本时必须同时更新 URL 版本。特效层不拦截链接、表单或弹窗，
支持减少动态效果偏好、WebGL 不可用回退和隐藏/闲置暂停。

Chromium 渲染检查覆盖 320×480、375×548、393×664、430×740、1440×900，
以及横屏令牌定位、点击跳转、输入/确认/拒绝/领取弹窗、减少动态效果和无 WebGL 回退。
线上页面与预览内容一致（比对时排除 Cloudflare 自动注入的统计脚本），四张原图保留。
下方 05:08 的对接版本表是历史验收快照；后续修改入口前以此节的新版本为参考并重新读线上。

## 横屏主页导航更新（已完成）

用户在本次页面发布后指出，主站横屏底部的三个入口过小，提供了画有三个红圈的位置参考。
已按照用户红圈截图与要求完成以下改动并发布：

- 页面为主站 `https://leonmingod.com/`，修改网站工作分支的 `src/homepage.js` 导航布局。
- 三个入口移到画面右侧 Logo/题字下方的红圈位置。1920×909 参考图的圆心约为
  `(61%,72%)`、`(70%,73%)`、`(81%,74%)`；这些是构图参考，不是固定像素。
- 按钮改为绿色背景的圆形，尺寸接近所画红圈（参考图直径约 130–150px），文字与图标清晰。
  顺序和目标仍为“进入灵境”→邮箱、“免费 Token”→免费 Token 入口、“地址证明”→地址证明站。
- 其他界面文字适当增大，尤其右上角流光控制与底部提示；保留当前首页背景和流光。
- 针对横屏/桌面自适应定位；检查 1920×909 和较小手机横屏，不得重叠或超出视口。
  竖屏与免费 Token 入口、领取页也要回归检查。
- 用户正在准备新开会话；新会话应同时参考其红圈截图及本记录，完成修改、真实浏览器验证和发布。

## 配置来源

Render 服务 `cpa` 绑定私库 `928886540/cpa` 的 `main` 分支，使用
`./CLIProxyAPI --config /etc/secrets/config.yaml` 启动。客户端 Key 在该 Secret File
的 `api-keys`（或新版 `access.api-keys`）列表中追加，其他配置不变。

GitHub Actions 的 `Connect Free Token to Render` 工作流使用仓库 Secrets
`RENDER_API_KEY`、`CLOUDFLARE_ACCOUNT_ID` 和 `CLOUDFLARE_API_TOKEN`。
`RENDER_API_KEY` 是管理 Render 的凭据，不能作为发给用户的客户端 Key。

## 发布与验证

工作流在推送时仅执行 `inspect`。手动选择 `connect` 前，先核对检查输出中的
主站、入口 Worker 版本和 Render 当前提交，再更新脚本里的版本保护值。
连接脚本会保留原客户端 Key，先加密备份配置与登录文件，再追加新 Key 并使用原构建部署。
没有持久化磁盘时，部署后通过 CPA 管理接口恢复缺失的登录文件，保留禁用状态。
加密恢复备份以 Actions artifact 保留两天；解密私钥由本次操作的执行工作区单独保管，
不提交到仓库。私钥不在 Actions artifact 中。

只有新旧 Key 均通过 `/v1/models` 验证后，才替换主站领取接口的地址及 Secret 引用。
发布后检查领取接口发放的 Key 与 Render 注册值一致，并逐字节校验页面、图片和交互脚本。
验证失败时恢复发布前的主站版本。入口 Worker 不参与这次切换。

`sites/free-token-home/src/site-original.js` 继续作为旧主站源码备份；连接脚本直接读取、
核对并最小修改当前线上源码。旧入口部署脚本的版本保护值不会自动刷新，不能直接重跑。

## 运维交接记录（2026-10-24）

对接已完成并发布。最后一次完整验收为 **2026-10-24 05:08 UTC**：领取接口返回新地址，
所发 Key 调用 Render `/v1/models` 返回 200，共 50 个模型；原 2 把客户端 Key 仍可用，
8 份登录凭证已全部恢复，配置和环境变量保留。页面、四张图片及交互脚本逐字节比对通过。
以下版本和数量是该次验收的快照，后续修改前必须重新读取。

### 仓库与入口

| 用途 | 位置 |
| --- | --- |
| 主站 | `https://leonmingod.com/` |
| 免费 Token 入口 | `https://leonmingod.com/free-token/` |
| 领取页 | `https://leonmingod.com/free-token/claim/` |
| 领取 API | `POST https://leonmingod.com/api/free-token/claim` |
| 发放的 API Base URL | `https://cpa-dhke.onrender.com/v1` |
| 网站仓库 | `928886540/cloudflare_temp_email` |
| 网站工作分支 | `codex/free-token-home-20261024` |
| 网站代码 | `sites/free-token-home/`（位于工作分支） |
| 部署脚本 | `.github/scripts/free_token_render.py`（位于工作分支） |
| 对接工作流 | `.github/workflows/connect-render-free-token.yaml`（位于工作分支） |
| 本次发布代码提交 | `e3d6320dcd65a9192cc705d4926aa4157e207893` |

本记录与根目录 `AGENTS.md` 的索引同时保存到默认分支 `main` 和网站工作分支。
**记录出现在 `main` 不代表网站工作分支已经合并。** 新会话在默认分支找不到网站代码时，
先获取并切换工作分支，不要据此重新建站。

### Cloudflare

| 配置 | 已核对的值 |
| --- | --- |
| 主站 Worker | `leonmingod-home`：原站静态资源与领取 API |
| 入口 Worker | `leonmingod-free-token`：主站首页变换、免费 Token 入口 |
| 入口到主站的服务绑定 | `SITE` → `leonmingod-home` |
| Zone | `leonmingod.com`，ID `4f078f06b815a404337c3b5387c45275` |
| 发布后主站版本 | `8aa85754-acf1-498e-91ad-78117e40f8e5` |
| 入口版本（本次未改） | `4fda0cc3-1bdd-4b31-a5e6-9012b933931b` |
| 切换前主站版本 | `b3943206-85ca-4ca0-8617-951317245755` |
| 主站绑定 | `ASSETS`（assets）、`FREE_TOKEN_CPA_KEY`、`FREE_TOKEN_RENDER_KEY`（secret_text） |
| 当前领取 API 使用的绑定 | `FREE_TOKEN_RENDER_KEY` |
| 发布后主站源码 SHA-256 | `1bfd639be2c04996d8e7fac80c2ab42e085acc5200f416b02a2904adc749562a` |

入口 Worker 的根域与 www 路由覆盖首页、`/index.html`、`/free-token`、`/free-token/*`、
两张 `home-hero-*-v4.webp` 和 `/home-scene-v4.js`。领取 API 由原主站处理。
不要将主站 Worker 与入口 Worker 混为一个部署目标。

`src/site-original.js` 仍包含旧地址和旧绑定，这是**历史备份**，不能直接覆盖线上主站。
本次线上修改仅替换其中的两处 `env.FREE_TOKEN_CPA_KEY` 引用及一处旧 API 地址，静态资源不变。
当前主站行为以线上源码和本记录为准。

### Render

| 配置 | 已核对的值 |
| --- | --- |
| 工作区 | `My Workspace`，`tea-d779tahr0fns73e1h3lg`，用户已指定此工作区 |
| 服务 | `cpa`，`srv-d9c4kkvavr4c73ab3sfg` |
| 控制台 | `https://dashboard.render.com/web/srv-d9c4kkvavr4c73ab3sfg` |
| 实际部署仓库 | 私库 `https://github.com/928886540/cpa`，`main` 分支 |
| 公开仓库 | `928886540/CLIProxyAPI` 不是此服务当前绑定的部署仓库 |
| 运行方式 | Docker，`./Dockerfile`，构建上下文 `.` |
| 启动命令 | `./CLIProxyAPI --config /etc/secrets/config.yaml` |
| Secret File | 文件名 `config.yaml`，运行路径 `/etc/secrets/config.yaml` |
| 客户端 Key 配置 | 当前为根级 `api-keys` 列表，共 3 把：原 2 把 + 本次新 Key |
| 管理接口 | `/v8/management`；管理口令与客户端 Key 是不同用途的凭据 |
| 环境变量 | `MANAGEMENT_PASSWORD`、`MANAGEMENT_STATIC_PATH`，本次值未改 |
| 代码提交 | `f9cee393e5360db6b47dd18d6c2747a2e6c6cbb7`，v8.0.22 |
| 本次成功部署 | `dep-dbe3q94s728c7392m8kg`，使用原构建部署，无代码升级 |
| 健康检查 | `/healthz`，200 |
| 区域与套餐 | Singapore，free，1 个实例 |
| 自动部署 | 已开启，推送到所绑定私库的 `main` 会触发部署 |
| 持久化磁盘 | 无；登录文件会因重新部署而丢失，必须先备份并在部署后恢复 |

`/etc/secrets/config.yaml` 为只读运行配置。不要依赖管理页把配置写回此路径；
持久配置应更新 Render Secret File。不要为了记录运维信息随意向私库 `cpa/main` 推送，
因为它会触发线上重新部署。

### 密钥保存位置与接入方式

| 名称 | 保存位置与用途 |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | 网站仓库 Actions Secret，CF 账户定位 |
| `CLOUDFLARE_API_TOKEN` | 网站仓库 Actions Secret，CF 管理鉴权；现有部署已验证可用 |
| `RENDER_API_KEY` | 网站仓库 Actions Secret，Render REST API 管理鉴权；本次已验证可用 |
| `FREE_TOKEN_RENDER_KEY` | CF 主站 Secret；同一值已追加进 Render `config.yaml`，用于发给用户 |
| `FREE_TOKEN_CPA_KEY` | CF 主站原 Secret，保留但领取接口已不使用 |

Secrets 设置页：`https://github.com/928886540/cloudflare_temp_email/settings/secrets/actions`。
**不要在记录、仓库、聊天或日志中写密钥原值。** GitHub 中已有 Secret 不会自动成为新会话
云环境的环境变量；本机看不到 `RENDER_API_KEY` 不等于 GitHub 没配置，不要重复要求用户创建。
可通过已经配置好的 Actions 通道使用这些 Secrets。

本次 Render 插件可以列出服务、读取服务信息、修改环境变量及触发部署，但没有 Secret File
读写工具。Secret File 操作走 Render REST API，鉴权使用 Actions 中的 `RENDER_API_KEY`：
`GET` / `PUT /v1/services/{serviceId}/secret-files/config.yaml`，单文件 PUT 的 JSON 为
`{"content": "完整的更新后文件内容"}`。先读、仅追加客户端 Key、比较其他配置，再写；
不要用覆盖全体环境变量或 Secret File 集合的操作。

### 下次修改的流程

1. 先读本记录和 `AGENTS.md`，确认用户要改页面、领取逻辑还是 Render 服务；切换到网站工作分支。
2. 先执行只读检查，读取主站、入口当前版本、线上源码、Render 当前部署和 Secret 配置。
   工作分支支持以下命令；工作流输出已脱敏：

   ```bash
   gh workflow run issue-yifu-key.yaml \
     -R 928886540/cloudflare_temp_email \
     --ref codex/free-token-home-20261024 -f mode=inspect
   gh run list -R 928886540/cloudflare_temp_email \
     --workflow issue-yifu-key.yaml -L 3
   ```

3. 仅改页面时，使用入口 Worker 的部署路径；保留原图、胶囊导航、满屏裁切和令牌点击动效，
   除非用户要求更换。修改工作分支的 `sites/free-token-home/**` 会触发入口部署工作流，
   包括修改该目录里的 README；部署前先核对并更新其版本保护值。
4. 改主站领取逻辑时，读取当前主站源码再最小修改，保留 `ASSETS` 和所有 Secret 绑定。
   `stage-render-free-token.yaml` 是旧暂存任务；不要重跑。
   `connect` 是已经执行完成的**一次性切换**，内部仍校验切换前版本和旧地址；不能当作日常重部署命令，
   也不能只刷新版本常量就盲目重跑。`inspect` 可继续用于只读核对。
5. 只要 Render 操作会重新部署，先列出并下载当前全部登录 JSON，保存可恢复的加密备份，
   核对配置和原 Key，再操作。下一次需使用自己持有私钥的新备份密钥对；仓库中的公钥
   对应本次执行工作区的私钥，不能假定新会话也有该私钥。
6. 部署后恢复缺失登录文件，保留禁用状态；检查原 Key 和新 Key，确认配置和环境变量未被误改。
7. 验收：`/healthz` 200；领取 API 返回预期地址及 Key；用所发 Key 调用 `/v1/models` 200。
   同时验证领取确认、同源限制和 GET 405，再检查图片哈希、胶囊导航、满屏令牌及交互脚本。
8. 记录本次新版本、提交、部署和验收链接。版本保护用**刚读取并审阅的版本**，不要照抄历史快照。

领取请求仍为 JSON `{"oath":"义父","confirmed":true}`，同源 Origin 为
`https://leonmingod.com`，响应设置 `Cache-Control: no-store`。测试时不要打印响应中的 Key。

### 验收证据与恢复注意

- 成功发布与完整验收：<https://github.com/928886540/cloudflare_temp_email/actions/runs/40065013859>
- 发布后只读复核：<https://github.com/928886540/cloudflare_temp_email/actions/runs/40065097553>
- 加密恢复 artifact 位于成功发布任务，名称 `encrypted-render-integration-backup`，保留两天；
  它不是长期备份，也不包含解密私钥。未来操作应重新备份当前状态。
- 主站可通过 CF 版本部署回滚；未来修改应以当时发布前版本为回滚点。上表切换前的
  `b394...` 版本会重新发放旧域名，不能当作保留 Render 对接的日常回滚版本。
- 本次保留的是 8 份登录文件及其禁用状态，不代表将来在无持久化磁盘的 Render 上自动持久保存。
