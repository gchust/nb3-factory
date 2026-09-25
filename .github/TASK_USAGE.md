# 搭建 Token 与耗时

`Report Task Usage` 在每个 `Code Agent NocoBase Task` Run 结束后自动回复来源
Issue，包括成功、失败、取消、超时和 5 小时 Handoff。独立统计工作流不会改变
业务搭建的结果，不需要额外 Secret，只使用内置 `GITHUB_TOKEN`。

每个 Run attempt 对应一条可更新的评论，同时展示此 Issue 的已采集累计值。
重复执行统计不会重复计数；下游 Job 重跑复用的 Agent job 也只计算一次。
不同 Issue 的统计彼此独立，短统计工作流串行回写，搭建任务仍可并发。

- **已记录总 Token**：所有实现、应用修复、浏览器验收、报告修复日志中完成响应的
  `usage`（CodeBuddy 为每次调用累计一次的 `result.usage`），另加 Pi 上下文压缩的
  `compaction_end.result.usage`。失败修复轮次也计入。
- 分项为非缓存输入、输出（包含模型计入输出的思考）、缓存读取和缓存写入。
  不重复计算流式更新、`turn_end` / `agent_end` 中的消息快照或上下文长度。
  不把 reasoning 分项再次加到输出。total 缺失时才使用四个类别之和。
- **搭建执行时间**：prepare、agent（含验收）、verify-final、publish 的唯一
  Job 执行时长之和，不含排队、媒体和统计工作流；不是 GitHub 计费分钟数。
- **端到端时间**：从已采集首轮触发到最后结束，包含排队、Handoff 和手工重试间隔。
  长时间未重试也会计入这个指标，请与执行时间一起阅读。

旧格式日志支持两个执行器：Pi 的 `message_end` 逐条响应与压缩事件，CodeBuddy
每次调用累计一次的 `result` 事件（它之前的 assistant 消息不会被重复计入）。供应商未
返回 usage、零填充错误响应、请求中断、日志丢失或过期时会标记未知/不完整，不视作零
消耗；供应商未暴露的缓存命中不猜测。
这些数字用于比较搭建效率，不等同供应商账单，也不根据零值 cost 字段猜测费用。
统计只输出数值和固定说明，不把模型内容、工具输出或密钥复制到 Issue。

外部评测结果按唯一来源键复用本口径，不另行估算 Token，见 [评测结果导出](EVALUATION_INTEGRATION.md#用量)。

## 给已完成的任务补统计

Actions → Report Task Usage → Run workflow，选择默认分支，输入搭建 **Run ID**。
`attempt` 留空取最新尝试；填写数字可回补特定旧尝试。
只读取日志和 GitHub Job 时间，不重新搭建、不调用模型。
统计启用前的 Run 不会自动回补，Issue 累计只包含已采集的运行。
已存入 bot 评论的数值可在原日志 Artifact 过期后继续累计；没有采集过的过期日志
无法恢复 token。不要删除评论中的隐藏结构化数值标记。

## 阅读报告

评论先展示已采集的非缓存输入、输出和执行时间，完整口径折叠。统计工作流的 Artifact 同时包含 `report.json` 与固定模板生成的 `report.html`，后者离线打开，无需模型生成页面或重新计算数据。

新增分项为完整业务 QA、失败路径复测、QA 补报告。历史评论未拆分的数据仍保留在 QA 总项，不能事后推算细分值。统计状态由实际发布与交接步骤决定，与复盘共用判断；Workflow success 本身不代表交付。费用未知时明确显示未知。问答、媒体发布不属于当前搭建用量口径。

阶段耗时来自本轮已完成的 timing 记录，嵌套阶段不可相加为总执行时间；没有完成记录时不当作零。原始数值标记保持兼容。

新调用优先读取 `*.jsonl.result.json`，支持五种执行器；原有 Pi/CodeBuddy 原始日志解析
只用于无结果文件的历史记录。缓存、思考、缺失字段和子任务统计边界见
[Code Agent 执行器](AGENT_ADAPTERS.md#统一结果与用量)。
