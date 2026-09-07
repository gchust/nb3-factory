# 搭建 Token 与耗时

`Report Task Usage` 在每个 `Code Agent NocoBase Task` Run 结束后自动回复来源
Issue，包括成功、失败、取消、超时和 5 小时 Handoff。独立统计工作流不会改变
业务搭建的结果，不需要额外 Secret，只使用内置 `GITHUB_TOKEN`。

每个 Run attempt 对应一条可更新的评论，同时展示此 Issue 的已采集累计值。
重复执行统计不会重复计数；下游 Job 重跑复用的 Agent job 也只计算一次。
不同 Issue 的统计彼此独立，短统计工作流串行回写，搭建任务仍可并发。

- **已记录总 Token**：所有实现、应用修复、浏览器验收、报告修复日志中完成响应的
  `usage`，另加 `compaction_end.result.usage`。失败修复轮次也计入。
- 分项为非缓存输入、输出（包含模型计入输出的思考）、缓存读取和缓存写入。
  不重复计算流式更新、`turn_end` / `agent_end` 中的消息快照或上下文长度。
  不把 reasoning 分项再次加到输出。total 缺失时才使用四个类别之和。
- **搭建执行时间**：prepare、agent（含验收）、verify-final、publish 的唯一
  Job 执行时长之和，不含排队、媒体和统计工作流；不是 GitHub 计费分钟数。
- **端到端时间**：从已采集首轮触发到最后结束，包含排队、Handoff 和手工重试间隔。
  长时间未重试也会计入这个指标，请与执行时间一起阅读。

当前解析内置 Pi 的规范化 JSONL。供应商未返回 usage、零填充错误响应、请求中断、
日志丢失或过期时会标记未知/不完整，不视作零消耗；供应商未暴露的缓存命中不猜测。
这些数字用于比较搭建效率，不等同供应商账单，也不根据零值 cost 字段猜测费用。
统计只输出数值和固定说明，不把模型内容、工具输出或密钥复制到 Issue。

## 给已完成的任务补统计

Actions → Report Task Usage → Run workflow，选择默认分支，输入搭建 **Run ID**。
`attempt` 留空取最新尝试；填写数字可回补特定旧尝试。
只读取日志和 GitHub Job 时间，不重新搭建、不调用模型。
统计启用前的 Run 不会自动回补，Issue 累计只包含已采集的运行。
已存入 bot 评论的数值可在原日志 Artifact 过期后继续累计；没有采集过的过期日志
无法恢复 token。不要删除评论中的隐藏结构化数值标记。
