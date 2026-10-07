# 续跑后的媒体与用量报告

搭建工作流的隔离 `dispatch-reports` Job 在 prepare、agent、verify-final、publish
及失败标记结束后，显式使用内置 `GITHUB_TOKEN` 调用 `workflow_dispatch`。
这包括由 bot 发起的 Handoff continuation，不再只依赖 `workflow_run` 完成事件。

- 每个已接单的 Run attempt 都请求用量统计和交互历史，包括 Handoff、失败和超时。
- 只有 `publish` 或 `publish-failed` 成功（即建了 PR）才请求媒体发布和预览部署，不能把中间 checkpoint 当成业务交付；
  失败任务发布的失败 PR 同样会得到预览和视觉报告，评论里标明失败状态。
- 选择交付时看 `verify-final` 与 `publish`（或 `publish-failed`）这些 Job 的结果，不看整次运行的结论：
  交付之后问答回复失败会让运行变红，但不会让已交付的构建失去预览和视觉报告。
- 每个报告工作流在 `dispatch-reports` 里有自己的 `Request <workflow>.yml` 步骤，独立重试、最多各三次；
  前一个失败不影响后面的步骤，失败留下 Warning 和补发参数。单次请求限时 15 秒，退避 2 秒、8 秒，
  评论队列也算在内共七次请求，最坏共约 490 秒（约 8 分钟），Job 超时 10 分钟，排在最后的请求也不会被 Job 超时截掉。
- `report-dispatch-gate.yml` 读取来源 Run 的 Job 列表时最多尝试三次（单次 20 秒），仍读不到才失败放行。
- 调度脚本取自工作流文件自身的版本（`github.workflow_sha` 的稀疏检出），不取任务固定的 control SHA：
  续跑、恢复和评测样本固定的旧控制面里，调度脚本不认参数，每个步骤都会各自把全部报告请求一遍。
- 调度 Job 不执行应用代码，不读取模型或媒体 Secret；调度失败不改变业务结果。

报告可能在来源 Run 被标记为 `completed` 之前启动，因此接收方最多等待 11 分钟
（`wait-for-task-run.mjs`），覆盖调度 Job 最长 10 分钟的收尾；
固定 `run_id` 和 `attempt`，不在等待中切换到更新的重跑。超时明确报错而非静默跳过。
用量报告、交互历史和预览部署各有一个不占并发组的 `wait-for-source` Job 先完成这段等待，
并把它确定的 attempt 交给持锁的 Job；持锁的 Job 随后立即读到已完成的 Run，
不会在等待期间挡住其他 Pages 发布或全局预览队列。
媒体还会拒绝已被新 attempt 替代的结果；用量统计仍可补采旧 attempt。
这只是报告等候收尾的预算，不限制 Code Agent 的正常工作时长。

原有 `workflow_run` 保留为补充入口，但先经过 `report-dispatch-gate.yml`：调用方传入自己的工作流文件名，来源 Run 的 `dispatch-reports`（问答轮为 `dispatch-reply-history`，它只请求 `publish-agent-history.yml`，同样经 `dispatch-task-reports.sh` 重试）里对应的 `Request <workflow>.yml` 步骤已成功时直接跳过，不再重复等待、下载和上传预览包。只看自己的步骤，所以一个报告调度失败只让那一个报告的 `workflow_run` 副本补做，其余照常跳过。拆分前的旧 Run 只有一个合并的调度步骤，它成功时对所有报告都算已调度；读取失败或旧 Run 没有这些步骤时照常执行。来源 Run/attempt 的并发组和评论标记负责其余去重。显式调度出的报告若失败，按下文手动补发。
用量继续按 Agent/job ID 去重，短统计工作流串行回写，业务搭建仍可并发。
如果人工强制取消导致收尾 Job 无法执行，可以使用独立报告的手动入口补发。

来源 Run 被整体跳过（非仓库成员的 Issue，结论为 `skipped`）时什么都没搭建：六个报告工作流和评论队列的 `workflow_run` 副本在第一个 Job 就按该结论跳过，不等待、不下载；`workflow_dispatch` 与 `repository_dispatch` 入口不受影响。

并发组决定被跳过的副本是否还要排队。用量报告、两个交互历史发布、评论队列、预览部署和预览回收把并发组放在做事的 Job 上，被 gate 或条件跳过的副本不进队列。复盘、视觉报告和进度报告的并发组按来源 Run 划分、放在工作流级，被跳过的副本只与同一来源 Run 的另一份排队，不与其他任务排队。

## 补发已有产物，不重新搭建

Actions → **Publish Task Visual Report**、**Publish Agent History** 或
**Report Task Usage** → Run workflow，选择默认分支，填写搭建 **Run ID** 和
`attempt`（留空取最新）。
也可以用 `gh workflow run <workflow>.yml --repo owner/repo --ref develop`
加上 `--field run_id=... --field attempt=...`。

补发只读取已有 Artifact 和作业时间，不调用模型。媒体上传继续使用已配置的
`FACTORY_MEDIA_TOKEN`，无需新 Secret。视觉报告或交互历史发布失败时，该运行以
`::error::` 失败并给出上述补发参数；业务 PR 不受影响，不重新搭建。媒体、历史和用量的详细约束分别见
[VISUAL_REPORTS.md](VISUAL_REPORTS.md)、[AGENT_HISTORY.md](AGENT_HISTORY.md) 和
[TASK_USAGE.md](TASK_USAGE.md)。

## 统一 HTML 报告与 Pages

`Report Task Usage` 现在同时生成固定 v2 模板的交付报告；其下游 Pages 作业归档、显式部署并核对报告后回贴 Issue / PR 链接。每种已接单的结束状态均可生成，不只成功交付。沿用当前调度，不新增模型调用。

核对报告时每次请求带唯一查询参数绕过 CDN 缓存，仍要求页面里的报告标识与本轮一致；Pages CDN 常在部署后数分钟才换上新页面，因此按 5、10、15、20、30、40、60 秒逐步拉长间隔重试，共约 3 分钟后才判定失败。

`factory-task-usage` 并发组只包住统计回写（`report`）和 Pages 归档与部署（`pages`）。核对 CDN 并回贴链接在其后的 `notify` 作业里进行，不占该组，只在按 Issue 区分的 `factory-report-notify-<Issue>` 组内彼此排队，避免同一 Issue 的两次回贴同时新建评论，不同 Issue 的回贴不必等彼此的 CDN 核对；之后的部署只会增加站点内容，不会撤下本轮报告。同一 Issue 已归档了更新的报告时，只有那份报告已能访问才让给它；它的部署失败、`notify` 不会运行时，本轮照常回贴，那份报告日后部署成功会按回执顺序替换评论。报告归档在比较并交换冲突时最多重试 5 次，间隔按 1、2、4、8 秒加随机抖动增长，已上传的 blob 不重复上传。评测修订登记（`evaluation`）用自己的 `factory-evaluation-registry` 组：它对 `gh-pages` 的写入都经 `commitTree` 的比较并交换重试，与 `deliver-evaluation.yml` 一样不需要全局锁。`findings` 作业在分类工作流已有排队中的 Run 时不再重复请求：那次 Run 开始时读取的站点已包含本报告。

首次配置、固定/最新入口、复盘和逐条验收展示以及补发说明见 [reports/README.md](reports/README.md)。Pages 发布失败不改变来源任务结果，原有用量回执与下载 Artifact 保留。
