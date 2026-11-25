# CC Switch 接入与号池状态

维护源码位于 `codex/free-token-home-20261024` 分支的 `sites/leonmingod-star-night/`。

## 导入已经领取的 Key

叫义父领取结果、本地保存 Key 弹窗与游戏奖励均有「接入 CC Switch」。可选择 Claude、Codex、Gemini，编辑配置名称，选择主模型。模型使用当前个人 Key 实时请求 `https://cpa-dhke.onrender.com/v1/models`，不写死模型名称。读取失败或列表为空时禁用导入，并提供重试。

仅在用户提交时生成 `ccswitch://v1/import`：Codex 使用 `/v1` 与 Responses，Claude 使用根地址与 Anthropic，Gemini 使用根地址与原生格式。完整保留模型 ID 和别名。含 Key 的链接不写入 HTML 或 HTTP 查询参数；不会自动启用并替换用户当前配置。实际唤起仍需要安装 CC Switch 并由用户确认。

实现为 `ccswitch-v1.mjs`、`ccswitch-v1.css`，协议参考 [CC Switch 官方接入说明](https://github.com/farion1231/cc-switch/blob/main/docs/guides/deeplink-site-integration-guide-en.md)。

## 查看真实号池

令牌页新增 `/model-status/` 入口。`GET /api/pool-status` 在服务端读取 CPA v8 凭据状态和账号注册模型，只返回状态数量、匿名账号编号、模型可用情况、已经观测到的余量百分比。邮箱、文件名、路径、凭据内容、API Key、管理密钥、上游错误原文均不返回浏览器。

Worker 新增仅服务端使用的 `CPA_STATUS_MANAGEMENT_KEY` Secret，并复用 `FREE_TOKEN_OPS_SECRET`、`KV`。通过 `leonmingod-security.yaml` 的 `pool-setup` 初始化：利用 GitHub 既有 Render 凭据读取配置、核实管理接口，只在 Cloudflare 安装 Secret。不会修改 Render 配置、部署、客户端 Key 或 OAuth 文件。初始化会产生主 Worker 新版本，必须重新读取版本作为阶段发布基线。

脱敏快照在 KV 缓存 30 秒，最多加载 24 个账号的模型列表、并行度为 4；覆盖不完整会明确标记。上游暂时失败时，最多保留十分钟旧快照并标注过期。没有观测到的额度显示「未观测」。网页可见时每 30 秒更新；不发起模型生成、额度重置或凭据刷新。

## 本轮美术与交互

已于 2026-10-29 发布为 v53：主站 `71cc78b8-48bc-4d9a-ac7b-a5cd73b20386`，保留全部 11 个绑定。Stage 40904919911 的 45 项测试、Publish 40905233018 与公网 46 项资源比对均通过。真实 Workers 运行测试覆盖成功读取与拒绝重定向：服务端使用 `redirect: 'manual'` 并拒绝非 2xx，不向重定向目标发送凭据；浏览器的 `error` 模式不受支持。验收时真实返回 13 个匿名账号与 35 个注册模型，数量会随运行变化。CC Switch 浏览器验收使用虚构 Key 与独立模拟模型，未测试本地原生应用唤起。

用户最新要求为流光默认开启，覆盖早先默认关闭的偏好。`home-scene-v6.js` 增强青玉轨迹，仍保留手动关闭及减少动态效果适配。四张原生生图分别为观星台首页和月门令牌页的横竖构图，首页图 v7、令牌图 v5。品牌字样由 HTML 显示；删除球下文字条和重复掌心图片层，玉球改为独立透明素材 `jade-orb-v4.webp` 并上下浮动。保留玉牌导航、完整令牌挂绳、转场、邮箱流程与游戏规则。
