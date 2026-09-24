# 每日自动使用预设案例做搭建测试

给想测试的预设 Issue 加上 `factory:daily` 标签，之后每天自动搭建一次。移除标签就退出后续调度。**不需要填写编号、配置仓库变量或每天手动运行 Action。**

Action：**Scheduled preset build tests**（`scheduled-preset-tests.yml`）。只负责选择案例、创建独立执行 Issue、派发既有搭建工作流，不另写 Agent / QA / 报告流程，不自动合并测试 PR。

```text
预设 Issue：factory:preset + factory:daily
                    ↓ 每天自动读取标签名单
              每个案例创建新 Issue
                    ↓
      原 prepare 复制正文与人工评论、固定应用基线
                    ↓
          Code Agent → QA → PR / HTML 报告
```

## 日常操作

| 预设 Issue 的标签 | 行为 |
| --- | --- |
| `factory:preset` | 保存为可重复使用的案例，不参加每日自动测试 |
| `factory:preset` + `factory:daily` | 每天自动创建独立任务重新搭建 |
| 移除 `factory:daily` | 下轮不再调度，保留原预设和历史结果；不取消已创建的任务 |

例如，给流程冒烟 #176 和客户备忘录 #155 同时加上 `factory:daily`，此后每天各执行一次。只希望跑冒烟时，从 #155 移除该标签即可。
可以在 Issue 右侧添加、移除标签，也可以在 Issues 列表批量修改。标签加在**来源预设 Issue**上，不是执行 Issue 或 PR 上。

合入默认分支后，工作流自动初始化 `factory:daily` 标签，不启动搭建，也不替你选择案例。此后只需用标签维护名单。
每次定时运行都读取最新标签，包含**已关闭的预设**；没有同时带两个标签的案例时，正常结束，不创建任务、不调用 Agent。
仅有 `factory:daily` 而没有 `factory:preset` 不会被选中。误标的 PR、机器人案例或 `factory:manual` 任务会被明确报错，不执行，也不阻止其他有效案例。
案例维护方式见 [预置搭建案例](ISSUE_PRESETS.md)。

## 时间与结果

默认每天 **03:17 UTC（北京时间 11:17）** 自动运行。修改工作流中的 `cron: '17 3 * * *'` 可调整时间。
GitHub 定时任务只在默认分支执行，可能延迟；工作流需先合入默认分支。加标签不会立即搭建，从下一次每日扫描生效。

每轮可执行案例都会创建独立 Issue，从既有默认分支基线受理，不复用上次生成的业务代码、旧分支或 PR。
本 Action **不自动 Refresh 模板、不构建 NocoBase 上游源码、不切换源码基线**；要改变被测版本，使用现有基线更新流程。各任务继续由既有 prepare 记录实际应用 SHA。

Action Summary 展示每个案例的**已派发 / 已有任务 / 因在途任务跳过 / 失败**，并链接到执行 Issue。
“已派发”不等于测试通过；业务验收结果仍查看对应 Issue、PR 和 HTML 报告。不同案例沿用现有并行机制。

## 避免重复与积压

同一预设上一轮的未关闭自动测试 Issue 仍带 `agent:pending`、`agent:queued`、`agent:running`、`agent:verifying` 或 `agent:waiting` 时，跳过本轮，避免积压。
`agent:review` / 失败 / 已关闭的任务不阻止下一轮；**待评审测试 PR 不需要先合并**。

执行 Issue 只带运行状态和 `factory:test-preset-<编号>` 来源标签，不继承 `factory:preset` 或 `factory:daily`，不会再次被选为预设。
同一调度 Run 重跑复用已创建的 Issue；持久回执丢失时查询真实搭建 Run，避免重复派发。不要删除调度来源评论或执行 Issue 的来源标签。
单个案例出错会保留错误及已有 Issue，继续其他案例，并将调度 Job 标记失败。

正常每日运行无需人工操作。派发失败时可重跑对应调度 Run；取消任务后若残留在途标签，确认没有活动搭建后关闭该执行 Issue，恢复后续自动测试。不要通过合并测试 PR 来解除等待。

只使用内置 `GITHUB_TOKEN`（`contents: read`、`issues: write`、`actions: write`），无需新增 PAT 或模型配置。
创建 Issue 后显式调用原 `code-agent-task.yml` 的 `workflow_dispatch`，不依赖机器人创建 Issue 自动触发工作流。

## 可选的维护入口

**Run workflow** 仅用于即时检查或排障：`dry_run` 默认开启，预览当前标签名单且不写入；取消勾选则立即执行一轮。
它不是启用每日任务的前置步骤。定时触发始终实际派发，不受手动表单默认值影响，也不会记住上一次手动预览状态。

```bash
node --test .github/scripts/tests/scheduled-preset-tests.test.mjs
```

专项覆盖标签增删、开放和关闭预设、分页、独立次日任务、来源隔离、重跑恢复、在途去重、标签初始化和工作流触发边界。现有 **Factory regression tests** 自动收集这些测试。

参考：[GitHub 定时事件](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)、[工作流触发规则](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#triggering-a-workflow-from-a-workflow)。
