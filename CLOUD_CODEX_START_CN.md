# 云端 Codex 最新接手说明

更新于 **2026-11-06（北京时间）**。公益站已迁到 RAKsmart，Komari 已替代 Beszel；此前“迁移取消”“等待安装”和“无聊云仍是生产机”均为历史状态。完整验收、备份和回滚记录见：

https://github.com/LeonMinGod/RAKsmart/blob/main/PRODUCTION_20261106_CN.md

可直接复制以下接手指令；没有密钥值：

```text
请使用简体中文，先读取 LeonMinGod/RAKsmart 的 README 和 PRODUCTION_20261106_CN.md，再核对真实状态。

当前生产主机为 RAKsmart 198.247.1.206，Debian13，SSH root:22881；固定主机指纹 SHA256:6t5F8SKhmAzQJE2/kVCcDiDwGlFeJaEGGibJml7QbVk。仓库 LeonMinGod/RAKsmart，main。SSH 凭据通过该仓库 Actions Secrets 使用，不在聊天、Git 或日志输出。

RAK 当前运行个人 Hysteria2 UDP443、Reality TCP443、原 VLESS/WS/TLS TCP 链、HTTPS 订阅、DoH、Caddy、Komari Hub/Agent，以及公益 CPA、并发网关、号池监控、CPA Manager Plus、Tunnel。不得修改 root 密码/SSH 端口、重置节点认证、覆盖原订阅 URL。Reality 持有 TCP443，普通 TLS 回落至 Caddy127.0.0.1:8443；不能用旧两节点模板覆盖。三节点和 Windows Mihomo 已在迁移后实测出口198.247.1.206。

公益域名不变：yifu.leonmingod.com/v1；网关8319→CPA8317，/_pool/*→监控8318，yifuplus.leonmingod.com→Plus18317。沿用原 Tunnel de798c3f-002c-4a28-8e7f-baa9780cfe6b，当前 connector 在RAK，不依赖无聊云。cpa.leonmingod.com 是用户本机 CPA，禁止修改或借用凭据。

原13份OAuth凭据及9份禁用状态、4把静态APIKey、号池SQLite、Plus数据库及配套data.key已保留。实际Gemini普通与SSE生成通过，模型接口当时返回44模型。旧Codex额度耗尽、xAI invalid_grant 是迁移前已存在的问题，不可把模型目录当成全部上游可调用，也不可擅自恢复旧OAuth/bootstrap、启用停用账号或借用用户本机账号。

原CF网站、邮箱领Key、个人Key注册/鉴权/严格限流、游戏校验和KV/DO/Secrets仍按原架构在CF。四个关键Worker版本核对未变，主页和www返回200。网站/CF代码仍在LeonMinGod/cloudflare_temp_email维护分支codex/free-token-home-20261024；main只作交接/发现入口，不能据此直接发布网站。CPA源码仍为LeonMinGod/cpa。保留原ASSETS/KV/DO和安全限制，不用临时Node重写替换CF身份系统。

公益业务限制CPU60%、内存768MiB、Nice10；网关全局4/每Key2并发、队列4。Plus可选数据预算已调到256MiB；不得恢复旧机32MiB的预算去裁剪新机历史。yifu-health.timer每分钟检查，生产服务已设置开机启动和故障恢复。不要在小鸡上编译大型程序或做大流量测速。

私有面板https://vps.leonmingod.com是Komari1.6.1，管理员账号leonming0107@gmail.com，沿用现有密码，不要重置或公开。当前用户选择Bocchi主题，保留其选择；两机Agent在线，CPU/内存/硬盘/网速/月流量/历史/三网延迟丢包都有数据，手机375/390竖屏验收通过。每台1TB上传+下载，日历月UTC1日重置（北京时间1日08:00）；三网每分钟单包，小流量。RAK价格US$3.21/月、2026-11-05购买；无聊云¥10/年、2026-11-04购买。价格是用户提供，监控续费日期按购买日推算。

原无聊云23.94.180.2:55014仅保留KomariAgent和离线恢复数据；五个公益业务和预算定时器停止/禁用。旧源站部署/备份、旧仓库RAK写入工作流均退役，不要直接重新启用，也不要启动第二个同Tunnel生产connector。不要取消VPS订阅、销毁源机或删除最后备份。

RAK每日04:30北京时间通过Actions加密备份，服务器21天、artifact30天。首份新业务备份和最新完整Debian/VPN/Komari状态均已异机解密复核；具体分支、SHA和位置见验收报告。恢复凭据使用所有者RSA、备份生成时RAKSSHSecret包装或源机恢复RSA，不能仅依赖一次会话临时私钥。

跨机回滚必须先停止/禁用RAK业务并导出最新OAuth和一致性SQLite，再恢复源机，最后启源机服务/Tunnel。source-migration-committed.json会阻止旧rollback-source.sh直接运行；临时受限通道会过期，需核对并重新建立，禁止关闭SSH主机验证。不要把旧备份覆盖到仍运行的新实例。

网站发布和Key业务仍遵守原LEONMINGOD_HANDOFF_CN.md的保护条件：保留所有Key/邮箱绑定、鉴权HMAC和持久限额，不恢复仅内存去重/故障放行，不擅自恢复旧Render/InstaBox后端。KV写入事故保护继续保留。旧主机地址和资源说明仅作历史参考。
```
