# LeonKey 两条 DNS 的一次性直连切换

2026-11-12 所有者明确允许本次使用已有 Actions Secret `CLOUDFLARE_API_TOKEN`。
凭据始终只在 runner 进程内使用，不导出或打印。

操作仅限 ops.leonmingod.com、redeem.leonmingod.com：读取并备份各自唯一的 A/CNAME，
改为 A → 198.247.1.206、TTL 300、DNS only，回读验证。额外同名记录会中止整个操作。
写入失败或响应不确定时回读并恢复本次更改，遇到并发修改停止覆盖并登记 needs_review。
原记录及结果以 artifact `leonkey-dns-direct-<run_id>` 保留30天，包含DNS元数据，不包含授权凭据。

单独分支 codex/leonkey-dns-direct-20261112 的特定脚本/工作流 push 触发；没有定时任务，
不合并默认分支，不重新部署网站、邮箱、Worker、Tunnel或VPS。操作后由本机直接SSH验证证书与页面。
执行结果以该次 Actions report 和 LeonKey 仓库 docs/31-DIRECT-VPS-ENTRY.md 为准。

## 实际执行结果（2026-11-12）

所有者批准后，运行43171378373的区域信息预检返回403/10000。去掉非必要的Zone Read要求后，
运行43171575661直接GET dns_records仍返回403/10000。两次均未写入DNS，没有取得原记录备份。
工作流415662917已手动停用，分支未合并主分支，公网仍经过CF。

继续执行需要DNS读取/编辑授权。新令牌使用独立仓库Secret LEONKEY_DNS_API_TOKEN，
保留原CLOUDFLARE_API_TOKEN以免影响其他网站发布；工作流已优先选取独立Secret。
补足权限后，只按原批准的两条DNS范围恢复任务，不触发其他运维工作流。
