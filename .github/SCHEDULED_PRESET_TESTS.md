# 自动评测与预置案例手动搭建

自动每日搭建已迁移到有预算的 **Evaluation batches**。详见
[评测可靠性与迁移说明](EVALUATION_RELIABILITY.md#每日调度迁移)。

## 每日评测

唯一的自动搭建 cron 在 `evaluation-batches.yml`：UTC 01:23（新加坡/中国时间 09:23）。
计划来自 `evaluations/plans.json`，默认启动 F00 三样本串行批次。
`FACTORY_EVALUATION_PLANS_ENABLED=false` 暂停新批次；已启动批次仍会推进。
预置 Issue 的 `factory:daily` 标签不再自动启动每日任务。

添加或调整每日案例应修改计划、样本数和预算，提交 PR 审查后生效。
[批次协议](EVALUATION_INTEGRATION.md)说明冻结输入、终态、取消和重试。

## 预置案例手动搭建

**Actions → Preset build tests → Run workflow** 仍读取同时带
`factory:preset` 和 `factory:daily` 的人工案例（包含已关闭的预置）。
`dry_run=true` 仅预览；默认创建独立执行 Issue 并显式派发搭建。
该入口没有 cron，也不修改来源案例、自动合并 PR 或刷新模板。

该入口是普通搭建，不带评测批次的全链预算；正式评测建议使用计划。
保留同案例在途跳过、同 Run 幂等、标签初始化和失败重试。
手动额外启动不会消耗批次槽位，因此可能与每日批次并行。

## 验证

专项覆盖标签选择和幂等、预览、唯一自动调度入口、批次预算与全链续跑：

```bash
node --test .github/scripts/tests/scheduled-preset-tests.test.mjs \
  .github/scripts/tests/evaluation-batch.test.mjs \
  .github/scripts/tests/evaluation-workflow-policy.test.mjs
```

不通过启动真实付费搭建验证调度器。

## Issue 专用一次性入口清理

2026-09-27 已停用以下 GitHub Actions 注册项。它们只服务于固定 Issue 的一次性操作，
工作流文件已不在默认分支中，但 GitHub 仍将历史注册项标记为 active；因此通过
Actions API 停用，保留历史运行、日志和产物。

| Workflow                               | 固定任务                | Workflow ID |
| -------------------------------------- | ----------------------- | ----------- |
| Dispatch PR 190 smoke Issue 191        | PR #190 / Issue #191    | `364931480` |
| Issue 182 recovery validation          | Issue #182              | `364742981` |
| Restore retained M02 candidate once    | Issue #252              | `365940211` |
| Resume three saved factory checkpoints | Issues #299、#301、#303 | `366665276` |

通用的搭建、队列协调、评审、报告和源码基线验证入口继续保留。
清理不删除 Issue、任务分支或历史证据。
