# 公益站迁移已取消

用户于本会话明确叫停从无聊云/Cloudflare 向 RAKsmart 迁移公益站。
此决定优先于先前的迁移计划、请求文件和暂存代码；只有用户再次明确要求才能重启迁移。

- RAK `198.247.1.206` 专供个人 VPN，保留 Hysteria2、TCP 节点、HTTPS 订阅及代理 DNS。
- 公益 CPA、号池采集/SQLite、Plus 继续使用无聊云 `23.94.180.2:55014`，根目录 `/opt/yifu-cpa`。
- 网站、邮箱领取 Key、鉴权与游戏校验继续使用原 Cloudflare Workers/KV/DO。
- 公益入口仍为 `https://yifu.leonmingod.com/v1`、`https://leonmingod.com` 和 `https://yifuplus.leonmingod.com`。
- 新机上的运行时、加密快照与暂存文件保留；不启动公益业务，不开放对应入口。
- 关闭新机临时迁移接收器，并仅移除迁移专用 Caddy 路由；保留原 VPN、TLS、订阅和 DNS 路由。
- `.github/migration-paused.json` 阻止迁移脚本执行；收尾任务同时禁用并取消专用迁移工作流。
- 原公益站的日常运维与加密备份任务不在停用范围内。不要恢复旧 OAuth bootstrap，也不要用旧快照覆盖后来更新的账号。

收尾由 `.github/workflows/rak-closeout.yaml` 执行；安全报告存放在 `rak-migration-results/<closeout-request-id>`。
报告记录实际取消结果、服务状态、原站验收和外部 VPN 验证。以成功报告为准，不能把暂存或进程启动当作恢复验收。

## 收尾验收（UTC 2026-11-05）

- [RAK 收尾运行 42132576322](https://github.com/LeonMinGod/RAKsmart/actions/runs/42132576322)：通过。迁移工作流已禁用，无活动迁移任务；接收器已停止、迁移专用路由已关闭，没有公益业务端口监听。五个原 VPN 服务均 active，订阅仍含原两节点，口令、订阅地址、SSH 及 Hysteria 配置保持原样。
- 原生 TCP 客户端通过仅支持 TCP 的前置 SOCKS 实际访问，出口 `198.247.1.206`；同一路径的 DoH 查询通过。Hysteria2 外部客户端出口相同，可信 TLS 验证通过。这里只证明外部云客户端连通，不代表中国大陆手机网络已实测。
- [原公益站收尾运行 42132594166](https://github.com/LeonMinGod/cloudflare_temp_email/actions/runs/42132594166)：通过。两个专用迁移工作流已禁用，残余迁移任务已取消，无活动迁移任务。原无聊云五个生产服务均 active，无需重启；出口仍是 `23.94.180.2`。
- 原站 13 份凭据、9 份禁用状态保持当前值；4 把静态 Key 的模型查询均通过，模型列表各 44 项。一次小流量生成 HTTP 200、SSE 正常结束，Plus 鉴权访问 HTTP 200。不要用旧文档中的 10 份禁用快照覆盖现在的 9 份。
- 主域与 www 的首页、领取页、状态、榜单、号池接口十项均 HTTP 200；三个 Cloudflare Worker 仍是迁移前版本，没有迁移 hook、冻结或转发切换。

原订阅继续使用。在 Shadowrocket 更新原订阅后选 `RAK San Jose TCP`；如需链式连接，保留或重新选择手机端已有的“代理通过”机场节点。机密 URL、节点链接和二维码只在所有者本地交付，不写入本文或 Git。
