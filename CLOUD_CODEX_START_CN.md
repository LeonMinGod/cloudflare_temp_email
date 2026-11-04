# 复制给云端 Codex 的接手话术

更新于2026-11-04。以下文本可直接复制；没有密钥值。迁移后的验证记录是当时快照，接手时需重新查询。

```text
请接手我的 LeonMinGod 公益 Token 网站和 CPA，先读：
https://github.com/LeonMinGod/cloudflare_temp_email/blob/codex/free-token-home-20261024/LEONMINGOD_HANDOFF_CN.md
https://github.com/LeonMinGod/cloudflare_temp_email/blob/codex/free-token-home-20261024/YIFU_VPS_HANDOFF_CN.md

网站/运维仓库：LeonMinGod/cloudflare_temp_email，维护发布分支 codex/free-token-home-20261024；main 只用于发现交接和运维入口，不能直接发布网站。
CPA 私库：LeonMinGod/cpa，main 已包含部署交接；当前生产二进制来自 bf86b75181a2fff5b74a5345cf1e1057da3e45d3。文档提交不代表重新部署了二进制。

公益 API 固定 https://yifu.leonmingod.com/v1，管理页 https://yifu.leonmingod.com/management.html。cpa.leonmingod.com 是我的本机 CPA，禁止修改 DNS、配置或借用凭证。
生产已迁到 Debian13 LXD VPS，SSH 23.94.180.2:55014，根目录 /opt/yifu-cpa。实际约488MiB内存、1.2GiB盘，不要在上面编译Go或安装多套数据库。
域名通过 Cloudflare Tunnel 连接：cloudflared 由 yifu-tunnel.service 开机自启，普通请求到127.0.0.1:8317，/_pool/到8318；保留现有Tunnel、DNS和token。

网站当前v62，源码 sites/leonmingod-star-night；号池采集和SQLite历史已迁到VPS，源码 sites/yifu-vps-monitor，五分钟共享刷新、十五分钟存档。网站静态资源、邮箱领Key、个人Key鉴权/严格限流和游戏实时校验仍在CF，不要当成全部已迁走。
保留所有现有Key、auths、停用状态和SQLite。原13份公益凭证中10份停用；此前启用的2份Codex和1份xAI失效，我已同意迁移后重新授权。先查当前状态，不要覆盖我随后授权的新文件；不得恢复旧bootstrap或借用本机账号。

运维优先使用网站库默认分支 yifu-vps.yaml 的 verify/status/backup/deploy-monitor；该工作流自动checkout维护分支。deploy-monitor只更新监控，不更新CPA二进制；seed-pool已执行，禁止当作日常刷新覆盖新历史。
GitHub Secrets已配置，应通过受保护Actions使用；它们不会随clone自动注入云端会话，普通API也不能读取明文，不要索取或输出私密值。
网站发布使用维护分支 leonmingod-star-night.yaml，先stage、核对绑定和产物、再publish；保留ASSETS、原KV/DO和全部Secrets，不要直接wrangler覆盖不完整静态镜像。
旧Render/InstaBox/共享Key工作流已禁用，不要恢复旧后端。CPA更新须在CI构建并测试、先备份、只替换二进制并保留旧版及当前持久化数据。

保留每邮箱专属Key、落款和本地记忆、120秒重发、固定两小时真人凭证、CC Switch实时模型导入、45秒24玉两盾且无暂停的实时游戏。
2026-11-04验收曾通过：4把静态Key和临时个人Key读取35模型、号池200；不等于实际生成成功。先做只读验收，后续在我完成重新授权后，再测真实非流式/流式生成。
重新授权及更新前后执行加密backup；目前未配置自动定时备份。用简体中文简洁沟通，按我后续明确需求完成修改、验证、提交和授权范围内发布，不要顺手重构或迁走其他业务。
```
