# 义父扩展管理后台

- 地址：<https://yifuplus.leonmingod.com/>，也支持 `/management.html`。
- 上游：[seakee/CPA-Manager-Plus](https://github.com/seakee/CPA-Manager-Plus)，固定官方发布版 **v1.14.10**，MIT许可见本目录LICENSE。
- 完整原生Manager Server独立安装，不替换原 `https://yifu.leonmingod.com/management.html`。
- 登录密码与安装时的公益CPA管理密码相同；没有新建或改动用户Token。
- 只连接本机 `http://127.0.0.1:8317` 公益CPA，禁止改用用户自己的 `cpa.leonmingod.com`。

## 路由与文件

Cloudflare Tunnel `de798c3f-002c-4a28-8e7f-baa9780cfe6b` 当前配置version=4，
仅新增yifuplus域名到 `http://127.0.0.1:18317`；原yifu的8319网关/8318监控规则、DNS和token保留。
新域名是proxied CNAME到同一Tunnel，未开放公网18317。

| 路径/服务 | 用途 |
| --- | --- |
| `/opt/yifu-cpa/bin/cpa-manager-plus` | 官方原生二进制，内置Web面板 |
| `/opt/yifu-cpa/private/plus-config.json` | 监听地址、采集和CORS配置 |
| `/opt/yifu-cpa/private/plus-admin.key` | 0600、CPA管理密码副本，仅作管理员初始化/恢复输入 |
| `/opt/yifu-cpa/plus/usage.sqlite` | 独立SQLite历史和加密连接配置 |
| `/opt/yifu-cpa/plus/data.key` | AES连接配置的数据加密密钥，必须与数据库一起备份 |
| `yifu-plus.service` | 独立服务，开机自启，不重启CPA/Tunnel/监控/网关 |
| `yifu-plus-budget.timer` | 每五分钟检查本机磁盘预算，不访问Cloudflare |
| `/usr/local/libexec/yifu-plus-budget.mjs` | root拥有的磁盘保护脚本 |

原生包SHA256：`113a651af78f4dd8c5279e03348729411d964043d74bbd338147dafa2bcb8d86`。
二进制SHA256：`965c5b9b26df1eb61bbca50a14638b761bc38512e31c6ef726067fc07b9fd074`。
不在小鸡编译、安装Docker或自动跟随main升级。安装器会拒绝覆盖已有Plus数据库。

## 采集与资源边界

实际使用本机RESP **subscribe** 长连接接收真实用量；空闲不会每500毫秒轮询，不消耗CF DO写入。
auto模式允许降级到本机HTTP队列，降级轮询30秒，低于CPA默认60秒队列保留时间，避免漏记录。
这与公开号池页面五分钟共享刷新、十五分钟存档是两件事，原公开监控节奏保持不变。
完整请求历史从安装之后开始，未凭空补造旧明细；原号池SQLite及累计历史保留。

`GOMEMLIMIT=64MiB`、systemd `MemoryHigh=96M` / `MemoryMax=128M`、CPUQuota35%、Nice10，
测试时该服务cgroup内存约32MiB。不是高并发容量保证。
详细查询默认最多5000项，导入临时文件配额16MiB、最多一个会话。
自动巡检、自动冷却/停用/删除账号保持关闭；已有凭证停用状态保留。

磁盘保护每五分钟查看Plus目录总量和可用空间：Plus超过32MiB或磁盘可用少于200MiB时，
仅停止可选的 `yifu-plus`，保留数据及CPA服务。它是暂停阈值，检查之间仍可能增长，不是文件系统硬配额。
触发后需要先检查/导出/整理Plus历史并确认空间充足，再 `systemctl start yifu-plus`；不要删除 `data.key`。
不要为了扩展后台任意提高CPA并发、打开请求体日志或变更原Token鉴权。

## 发布、检查与回滚

源码运维脚本 `.github/scripts/yifu_plus.py`，工作流 `yifu-vps.yaml`，源固定checkout维护分支。
首次安装 `deploy-plus` 先加密备份、校验官方包、离线加密存储连接、启动独立服务并做本机鉴权验收。
本机通过后，用已连接CF插件只添加新域名路由/CNAME；GitHub旧CF凭据没有Tunnel编辑权限。
`verify-plus` 用相同密码验证公网接口，再实际测试一个模型非流式/流式和新增用量事件，不输出密码/请求内容。
`finalize-plus` 只补齐MIT许可、核对状态并备份，不重启服务。

```sh
gh workflow run yifu-vps.yaml --repo LeonMinGod/cloudflare_temp_email --ref main -f mode=verify-plus
gh workflow run yifu-vps.yaml --repo LeonMinGod/cloudflare_temp_email --ref main -f mode=backup
```

回滚只撤销 `yifuplus.leonmingod.com` 的新增CNAME和Tunnel单条规则，再停止/禁用
`yifu-plus` 与 `yifu-plus-budget.timer`，保留Plus文件等待排查。不得撤销yifu原路由或恢复旧OAuth快照。

CPA管理密码以后若变化，Plus数据库中的管理员凭证不会因环境文件变化自动轮换；需要使用
上游 `reset-admin-key` 的文件输入方式同步重置Plus登录，并同步CPA连接的加密记录。
不得把密码放进命令行、Git、聊天或Actions输出。

## 备份与验收

现有每日加密备份扩展为同时包含 `plus/usage.sqlite` 的一致性副本和 `plus/data.key`，
缺少其中之一会拒绝，保留原AEAD、路径验证、回读校验和临时副本清理；旧备份仍可读取。
private里的Plus配置/管理员输入及systemd文件一起备份。数据目录是持久化目录，不随更新重置。
自动备份北京时间04:30、14天；手动运维90天。没有进行整机恢复演练。

安装41945816965、验证41946117061成功；相同密码公网管理接口200、未登录401，
真实 `gpt-6.1-sol` 非流式/流式均200、收到DONE并新增2条事件；不是所有模型的可用性保证。
原CPA配置、Key、四个原有服务PID及凭证停用状态保留。手机393×852/电脑1440×1000登录页
无溢出/脚本错误，已完成首次配置，不需要用户再填上游地址。
实际密码的登录与凭证接口通过受保护Actions测试；浏览器可视测试未输入真实密码。
6项备份/安全测试和官方原生包隔离烟测通过，公开证据在本目录 `verification/`。
