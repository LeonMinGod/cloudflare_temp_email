# 复制给云端 Codex 的接手话术

更新于2026-11-05（北京时间）。以下文本可直接复制；没有密钥值。验证记录是当时快照，接手时需重新查询。

```text
请接手我的 LeonMinGod 公益 Token 网站和 CPA，先读：
https://github.com/LeonMinGod/cloudflare_temp_email/blob/codex/free-token-home-20261024/LEONMINGOD_HANDOFF_CN.md
https://github.com/LeonMinGod/cloudflare_temp_email/blob/codex/free-token-home-20261024/YIFU_VPS_HANDOFF_CN.md

网站/运维仓库：LeonMinGod/cloudflare_temp_email，维护发布分支 codex/free-token-home-20261024；main 只用于发现交接和运维入口，不能直接发布网站。
CPA 私库：LeonMinGod/cpa，main 已包含部署交接；当前生产二进制来自 bf86b75181a2fff5b74a5345cf1e1057da3e45d3。文档提交不代表重新部署了二进制。

公益 API 固定 https://yifu.leonmingod.com/v1，管理页 https://yifu.leonmingod.com/management.html。cpa.leonmingod.com 是我的本机 CPA，禁止修改 DNS、配置或借用凭证。
生产已迁到 Debian13 LXD VPS，SSH 23.94.180.2:55014，根目录 /opt/yifu-cpa。实际约488MiB内存、1.2GiB盘，不要在上面编译Go或安装多套数据库。
域名通过 Cloudflare Tunnel 连接：cloudflared 由 yifu-tunnel.service 开机自启，普通请求到127.0.0.1:8319并发网关再转原CPA8317，/_pool/到8318；保留现有Tunnel、DNS和token。
另有 https://yifuplus.leonmingod.com 独立完整扩展后台，官方CPA Manager Plus v1.14.10，yifu-plus.service监听127.0.0.1:18317、只连接本机公益8317，密码同公益CPA；原管理页保留。Tunnel当前version=4，原规则不变。详情见sites/yifu-cpa-manager-plus/README.md；安装/验证走yifu-vps.yaml的deploy-plus/verify-plus，不要用上游一键脚本覆盖CPA。实际本机subscribe采集，不增加CF监控写入，自动停用/删除账号保持关闭；MemoryMax128M、CPU35%，Plus超32MiB或磁盘少于200MiB时预算任务只暂停可选Plus。备份同时包含Plus数据库和data.key，必须成对恢复。

网站当前v63，源码 sites/leonmingod-star-night；号池status-v8/time-v1显示分钟/秒冷却倒计时，每秒本地更新不增加网络请求。号池采集和SQLite历史已迁到VPS，源码 sites/yifu-vps-monitor，五分钟共享刷新、十五分钟存档。网站静态资源、邮箱领Key、个人Key鉴权/严格限流和游戏实时校验仍在CF，不要当成全部已迁走。
保留所有现有Key、auths、停用状态和SQLite。原13份公益凭证中10份停用；此前启用的2份Codex和1份xAI失效，我已同意迁移后重新授权。先查当前状态，不要覆盖我随后授权的新文件；不得恢复旧bootstrap或借用本机账号。

运维优先使用网站库默认分支 yifu-vps.yaml 的 verify/status/backup/deploy-monitor；该工作流自动checkout维护分支。deploy-monitor只更新监控，不更新CPA二进制；seed-pool已执行，禁止当作日常刷新覆盖新历史。
网关源码sites/yifu-vps-gateway，全局4/每Key2并发、队列4/等2秒，忙时429 Retry-After:2，请求体16MiB，无流式截止时间，不增加IP封禁。日志上限50MiB/错误5份，journal持久32MiB/运行时16MiB、7天。已上线保护可用verify-safety复验，apply-safety不可当日常刷新。GitHub CF凭据无Tunnel权限，安装仅在VPS暂存，路由激活/回滚用已连接CF插件；回滚先将两条普通路由恢复8317，再rollback-safety，网关保留排空，不恢复旧OAuth。
GitHub Secrets已配置，应通过受保护Actions使用；它们不会随clone自动注入云端会话，普通API也不能读取明文，不要索取或输出私密值。
Guard现版本616ff1c7-9019-42d5-8ed4-5753be0708d1，2026-11-05修复KV预算信号在DO实例重建后重复写入；成功标记持久保存control表id=2，id=1仍是原IP策略。个人Key注册表/HMAC/持久化限额不变，不能恢复仅内存去重、随意清零预留预算或用故障放行代替鉴权。事故证据见sites/api-abuse-guard/KV_WRITE_INCIDENT_20261105_CN.md。
网站发布使用维护分支 leonmingod-star-night.yaml，先stage、核对绑定和产物、再publish；保留ASSETS、原KV/DO和全部Secrets，不要直接wrangler覆盖不完整静态镜像。
旧Render/InstaBox/共享Key工作流已禁用，不要恢复旧后端。CPA更新须在CI构建并测试、先备份、只替换二进制并保留旧版及当前持久化数据。

保留每邮箱专属Key、落款和本地记忆、120秒重发、固定两小时真人凭证、CC Switch实时模型导入、45秒24玉两盾且无暂停的实时游戏。
2026-11-05本轮验收：模型列表51项，gpt-6.1-sol非流式/流式生成在切换前后均200，原CPA/Tunnel/monitor PID、Key及停用状态保留。只代表测试时该模型可用，不能用旧失效快照覆盖新授权，接手仍需先只读验收。
重新授权及更新前后执行加密backup；另有yifu-vps-backup.yaml每天北京时间04:30自动加密备份保留14天，手动运维产物90天，加解密回读与SQLite一致性检查通过，尚未整机恢复演练。用简体中文简洁沟通，按我后续明确需求完成修改、验证、提交和授权范围内发布，不要顺手重构或迁走其他业务。
```
