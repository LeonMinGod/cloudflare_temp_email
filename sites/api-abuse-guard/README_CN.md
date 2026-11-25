# CPA 异常请求防护

> 2026-11-04当前公益CPA已迁到 `https://yifu.leonmingod.com/v1`，不再使用Render。
> 风控当前版本 `2a78e1ae-ed5b-4aec-8b05-4c024527dd3a`，鉴权/限流与IP策略及存储保留，保活cron已清空。
> 下文Render版本是历史记录；运维以[根交接](../../YIFU_VPS_HANDOFF_CN.md)为准。

当前生产版本：Cloudflare Worker `aa5ad0b9-61a2-4411-bba6-c7d9678a3304`；Render
部署 `dep-dbgcpsuk1f9s73c08pg0`，CPA 提交
`194c48ee7f8d8fd05b15bda6a0b1e5836251689e`。发布与真实阈值验收见
[Actions 40538198918](https://github.com/928886540/cloudflare_temp_email/actions/runs/40538198918)。

## 范围

本防护只覆盖 `https://cpa-dhke.onrender.com` 的 CPA 模型 API。网站首页、免费
Token 页面和其他 Cloudflare Worker 不进入这套计数。Render 仍直接承载模型流量；
Cloudflare Worker 只保存封禁状态并作签名判定，不代理请求体或模型流。

Render 中间件只接受经过验证的代理链：本地 Render 入口、Cloudflare 官方边缘网段、
以及与 `CF-Connecting-IP` 一致的真实公网地址。链路不明确时保持 API 可用并跳过
封禁，绝不把 Cloudflare 边缘地址当成客户端。

## 生效策略

- 滚动 5 分钟内 20 次明确异常：封禁 1 小时。
- 滚动 10 分钟内 40 次明确异常：封禁 24 小时。
- 滚动 24 小时内 30 次低频探测：封禁 24 小时。
- 24 小时内第三次独立触发封禁：升级为 7 天。
- 所有封禁都会自动到期，没有永久封禁。

计入异常的事件包括未知 API 路径 404、已知路径持续使用错误方法产生的 404/405、
确认鉴权失败的 401/403、明确的畸形请求，以及在服务端给出退避后仍高频触发的
429。状态码分开记录。5xx 只作观测，不作为自动封禁证据；单次 404、单次 429、
不存在的模型名和 User-Agent 也不会触发封禁。

合法 `/healthz`、首页、管理接口、登录回调和 CORS 预检免计数。已验证 API Key
所在的共享公网 IP 不执行长时间整 IP 封禁；若某个 Key 自身持续异常，只隔离该
Key，同一出口的其他合法 Key 仍可使用。

## 状态与日志

封禁状态保存在 Cloudflare Durable Object 的 SQLite 存储中，Render 重启或重新
部署不会丢失。Worker 保存 IP、滚动窗口、分状态计数、触发依据、到期时间和最近
30 天封禁记录。普通运行日志不输出原始 IP、请求体、查询参数、API Key 或请求头；
管理状态输出也只在 GitHub Actions 中显示不可逆 IP 指纹。

Worker 与 CPA 使用独立 HMAC 服务密钥；管理操作使用另一把密钥。签名包含时间戳、
随机 nonce、路径和完整 RPC 请求体，允许 30 秒时钟偏差并防止 60 秒内重放。
控制面超时或不可达时 CPA 保持可用，模型请求和流式响应本身不加控制面超时。

Worker 每 10 分钟请求一次 `/healthz`，用于避免免费 Render 因无业务流量休眠。该
请求属于免计数健康检查。

## 运维

所有操作使用 `.github/workflows/leonmingod-security.yaml`：

- `guard-status`：查看策略、窗口、封禁指纹和记录。
- `guard-disable` / `guard-enable`：全局观察模式与执行模式切换。
- `guard-allow` / `guard-unallow`：添加或移除 IP 白名单。
- `guard-unban`：立即解封；默认保留 24 小时重复触发历史，勾选
  `reset_history` 才同时清除历史。

`POST /v1/authorize` 用同一把服务 HMAC 校验客户端 key 的 SHA-256。命中
`KEYS` 绑定里的 `key:<hash>` 且 `status` 为 `active` 才允许；否则失败即拒绝。
限流计数在 Durable Object 里，不按请求写 KV。排行榜 `stats:` 和
`leaderboard:top` 由定时刷新写回，默认每 3 小时、每天最多 120 次 KV 写。
`KEYS` 必须绑定现有命名空间 `leonmingod-home-kv`
（`1b02d139375045f7a7d5ce2d994abd2c`）。未设置时该路由返回 503，原有 `/rpc`
封禁逻辑不变。`guard-disable` 只关闭 IP 封禁，不关闭这条 key 校验。

回滚时先执行 `guard-disable`，CPA 会立即恢复为只观察、不中断流量。删除 Render 的
`CPA_ABUSE_URL` 和 `CPA_ABUSE_SECRET` 后重新部署即可完全撤下中间件；Worker 和
Durable Object 可保留以便审计。发布前的 Render Secret File、环境变量和登录凭证
使用 AES-256-GCM 加密后保存在对应 GitHub Actions artifact 30 天。
