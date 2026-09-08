# 续跑后的媒体与用量报告

搭建工作流的隔离 `dispatch-reports` Job 在 prepare、agent、verify-final、publish
及失败标记结束后，显式使用内置 `GITHUB_TOKEN` 调用 `workflow_dispatch`。
这包括由 bot 发起的 Handoff continuation，不再只依赖 `workflow_run` 完成事件。

- 每个已接单的 Run attempt 都请求用量统计，包括 Handoff、失败和超时。
- 只有 `publish` 成功才请求媒体发布，不能把中间 checkpoint 当成业务交付。
- 两个调度请求独立重试，最多各三次；失败留下 Warning 和补发参数。
- 调度 Job 不执行应用代码，不读取模型或媒体 Secret；调度失败不改变业务结果。

报告可能在来源 Run 被标记为 `completed` 之前启动，因此接收方最多等待五分钟，
固定 `run_id` 和 `attempt`，不在等待中切换到更新的重跑。超时明确报错而非静默跳过。
媒体还会拒绝已被新 attempt 替代的结果；用量统计仍可补采旧 attempt。
这只是报告等候收尾的预算，不限制 Code Agent 的正常工作时长。

原有 `workflow_run` 保留为补充入口；来源 Run/attempt 的并发组和评论标记负责去重。
用量继续按 Agent/job ID 去重，短统计工作流串行回写，业务搭建仍可并发。
如果人工强制取消导致收尾 Job 无法执行，可以使用独立报告的手动入口补发。

## 补发已有产物，不重新搭建

Actions → **Publish Task Visual Report** 或 **Report Task Usage** → Run workflow，
选择默认分支，填写搭建 **Run ID** 和 `attempt`（留空取最新）。
也可以用 `gh workflow run <workflow>.yml --repo owner/repo --ref develop`
加上 `--field run_id=... --field attempt=...`。

补发只读取已有 Artifact 和作业时间，不调用模型。媒体上传继续使用已配置的
`FACTORY_MEDIA_TOKEN`，无需新 Secret。媒体和用量的详细约束分别见
[VISUAL_REPORTS.md](VISUAL_REPORTS.md) 和 [TASK_USAGE.md](TASK_USAGE.md)。
