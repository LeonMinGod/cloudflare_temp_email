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

## 权限补足后切换成功（2026-11-12 北京时间15:05）

所有者为原令牌补足DNS权限后，重跑43171575661（attempt 2）成功。
两个原代理CNAME已先备份，再按原记录ID改为A 198.247.1.206、TTL300、proxied=false并回读验证。
凭据仍只在runner内使用，没有更换原Secret，没有修改其他DNS、Worker、Tunnel或Access配置。
工作流415662917再次手动停用，未新增定时任务，分支未合并主分支。

本机直接SSH重启既有Caddy以结束旧ACME退避，配置未改；两域名证书签发成功。
外部TLS1.3实际连接IP为198.247.1.206、信任链和SAN通过，后台本地登录、兑换、查询200，
客户域名访问后台404，无CF响应头和Access跳转。原主页200、其余11个受保护服务PID未变。
DNS备份/report另存VPS /var/backups/leonkey/dns-cutover-20261112T070559Z/。

严格巡检因Web历史累计memory.max=24未通过，事件时间不明，无OOM或重启；随后30秒没有新增max/oom事件。
该告警保留，不能把入口可用等同于全部巡检或实际业务容量通过。
应用没有变更，本次未重跑回归；实际未来证书续期和付款验收仍待完成。
