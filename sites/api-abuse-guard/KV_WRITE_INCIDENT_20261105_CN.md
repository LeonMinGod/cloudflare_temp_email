# 2026-11-05 KV写入告警与修复

北京时间15:15排查：账号KV写入507/每日1000，读取约1138/每日100000，删除3；尚未超限或出现KV429。
其中主站/个人Key共用的`leonmingod-home-kv`写入506，邮件访客验证写入1，其他namespace未见该窗口流量。
主站当天验证码发送计数6，重复预算信号是明显的可避免写入来源。
官方限额及UTC每日重置规则见 [KV pricing](https://developers.cloudflare.com/kv/platform/pricing/)。

## 原因

`AbuseState.publishBudget()`用实例内`lastBudgetSignal`去重；对象回收或重建后丢失该值，
第一次请求会再次向KV写`ops:do-write-budget:v1`。它在请求的check/observe/authorize路径上使用，
因此冷启动次数可以放大这类写入。旧实现也会在KV写成功前设置缓存，导致写失败无法立即重试。

Plus后台用本机RESP订阅与SQLite，公开号池采集也在VPS；本次没有把这些采集迁回CF或改变刷新频率。
问题在仍位于CF的个人Key/风控控制面。

## 修改

- 在原`control`表`id=2`保存成功发布的UTC日期和等级，`id=1`继续保存原IP策略。
- 新实例先读持久标记；同一天同等级不再重复写KV。每次正常请求不会为该标记再写SQLite。
- 并发发布共用一个进行中的Promise，不把KV网络I/O放入存储事务，不阻塞其他请求的配额核算。
- KV写入及持久标记成功后才缓存成功；失败保留可重试状态。
- Key注册表、撤销检查、HMAC、持久化分钟/日限额、IP策略及原namespace保留；没有延长鉴权缓存或开放失败放行。
- 没有清零今日已消耗KV次数，也没有把保守的DO预留上界当作账单或重置额度。

同一正常等级在对象重建后可继续复用标记；跨UTC日或升级等级仍正常发布。
KV写成功和SQLite标记之间的极端故障仍可能导致一次补发，两者不是跨系统原子事务。

## 发布与验收

发布工作流`yifu-vps.yaml / publish-guard`，运行41986362066成功。它只测试、上传并发布Guard Worker，
不连接或重启VPS/CPA，不运行旧Render/InstaBox部署。旧函数所在模块名是历史命名，不代表恢复旧后端。
现版本 `616ff1c7-9019-42d5-8ed4-5753be0708d1`；回滚点 `2a78e1ae-ed5b-4aec-8b05-4c024527dd3a`。
四个绑定、STATE namespace `73670c63f6e64753b5402345406cd140`保留，cron继续为空。
配置基线与发布记录随Actions artifact保留90天，未导出Secret值。

24项测试全部通过，包括Cloudflare runtime集成、实例重建100次只写KV1次、50个并发发布只写1次、
UTC换日/等级升级、失败重试，以及原签名/配额/撤销/异常证据测试。

临时个人Key在更新前后读取43模型HTTP200；更新后真实`gpt-6.1-sol`非流式/流式生成200且流式收到DONE。
测试Key只在注册表临时存在，已有用户Key不动；验证后已删除记录和本地测试密钥，另有30分钟TTL兜底。
没有向真实邮箱发测试邮件，也没有重置OAuth或改动Plus数据库。

15:23的延迟统计约526次写入；发布发生在07:19:28 UTC。07:20和07:21两个完整分钟里仍有KV读取，
尚未观察到新增KV写入。该短窗口和模拟压测不是全天账号用量保证；正常领Key/邮件/其他业务仍会产生合法操作。
今日额度在2026-11-06 00:00 UTC（北京时间08:00）重置，历史消耗不会因发布下降。

证据位于网站 `verification/kv-write-before.json`、`kv-write-after.json`、`kv-write-release.json`。
