# 定时使用预设案例做搭建测试

Action：**Scheduled preset build tests**（`scheduled-preset-tests.yml`）。

只负责选择案例、创建独立执行 Issue、派发既有搭建工作流。不另写 Agent / QA / 报告流程，也不自动合并测试 PR。

```text
定时名单 / 手动选择预设 Issue 编号
  → 校验 factory:preset 案例
  → 每个案例创建新 Issue
  → 原 prepare 复制正文与人工评论、固定应用基线
  → Code Agent → QA → PR / 报告
```

## 选择与启用

**定时运行**：在仓库 **Settings → Secrets and variables → Actions → Variables** 添加：

| Repository variable | 示例 | 含义 |
| --- | --- | --- |
| `FACTORY_PRESET_TEST_ISSUES` | `176,155` | 每轮要测试的预设 Issue 编号；留空或删除即停止定时搭建 |

例如 `176` 只测试流程冒烟；`176,155` 同时选择流程冒烟和客户备忘录。可填写任意已有的人工预设，支持逗号、中文逗号、空格或换行分隔，允许 `#176` 写法；重复编号只执行一次。
来源必须有 `factory:preset` 标签，已关闭的案例也能用；PR、机器人创建的案例、`factory:manual` 任务和不存在的编号会明确报错。完整名单校验成功前不创建任何任务。
案例维护方式见 [预置搭建案例](ISSUE_PRESETS.md)。

**默认不启动定时搭建**，因为没有预设名单。配置变量后，在每次定时运行时读取最新名单；不需要修改脚本或维护第二份模板目录。

**手动运行**：进入 **Actions → Scheduled preset build tests → Run workflow**：

| 输入 | 用法 |
| --- | --- |
| `preset_issues` | 填写本次要测试的编号，如 `176,155`；留空使用仓库变量 |
| `dry_run` | 默认勾选，只预览名单和跳过原因；取消勾选才真正创建 Issue 并调用 Agent |

选择方式是**输入编号列表，支持多个预设**，不是写死的模板下拉列表。新增预设不需要修改此 Action。
手动输入只影响本次，不会修改后续定时名单。定时触发会实际派发，不受手动表单的 `dry_run` 默认值影响。

## 时间与结果

默认每天 **03:17 UTC（北京时间 11:17）**。修改工作流中的 `cron: '17 3 * * *'` 可调整频率，例如 `17 */6 * * *` 为每六小时一次。
GitHub 定时任务只在默认分支执行，可能延迟；工作流需先合入默认分支。未选择案例时定时 Job 会跳过。

每次可执行的案例都会创建独立 Issue，从既有默认分支基线受理；不会复用上次生成的业务代码、旧分支或 PR。
本 Action **不自动 Refresh 模板、不构建 NocoBase 上游源码、不切换源码基线**；要改变被测版本，应先用现有基线流程更新默认分支，再启动测试。各任务继续由既有 prepare 记录实际应用 SHA。

Action 的 Summary 展示每个案例的**已派发 / 已有任务 / 因在途任务跳过 / 失败**，并链接到执行 Issue。
“已派发”只表示搭建工作流已受理，不表示测试通过；业务验收结果仍查看对应 Issue、PR 和 HTML 报告。
不同 Issue 的搭建沿用现有并行机制，调度入口串行不等于业务测试串行。

## 重跑与异常

同一预设存在带 `agent:pending`、`agent:queued`、`agent:running`、`agent:verifying` 或 `agent:waiting` 标签的未关闭自动测试 Issue 时，跳过本轮，避免积压。
`agent:review` / 失败 / 已关闭的任务不阻止下一轮；**待评审的测试 PR 不需要先合并**。

执行 Issue 带 `factory:test-preset-<编号>` 标签和调度来源评论。不要移除这些关联标记，否则去重和在途检测会失效。
同一调度 Run 的重跑复用已创建的 Issue，读取持久回执；回执写入失败时再查询真实搭建 Run，避免再次派发已受理任务。
单个派发失败会在 Summary 中保留已有 Issue 和错误，其他已校验案例仍会尝试派发，调度 Job 最终标记失败。

若派发失败，重跑对应调度 Action；若任务取消后仍残留在途标签，先确认没有在运行的搭建，再关闭该执行 Issue，下一轮才会重新测试。不要通过合并测试 PR 来解除等待。

只使用内置 `GITHUB_TOKEN`（`contents: read`、`issues: write`、`actions: write`），无需新增 PAT 或模型配置。
创建 Issue 后显式调用原 `code-agent-task.yml` 的 `workflow_dispatch`，不依赖机器人创建 Issue 自动触发工作流。

## 验证

```bash
node --test .github/scripts/tests/scheduled-preset-tests.test.mjs
```

新增测试会被现有 **Factory regression tests** 自动收集。首次合并后，先以 `176` + `dry_run=true` 检查名单，再取消只预览执行真实闭环；最后配置定时名单。

参考：[GitHub 定时事件](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)、[工作流触发规则](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#triggering-a-workflow-from-a-workflow)。
