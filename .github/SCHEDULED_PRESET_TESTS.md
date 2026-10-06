# 每日与手动预置案例搭建

唯一的每日预置搭建入口是 **Preset build tests**（`scheduled-preset-tests.yml`）。
每天 UTC 18:23，即新加坡/中国时间次日 02:23，自动扫描同时带
`factory:preset` 和 `factory:daily` 的人工案例，包含已关闭的预置。
02:23 只是计划触发时间。GitHub 的定时任务实际常常晚几个小时才启动：原 19:00 UTC
的计划曾晚 3 到 5 小时；改成非整点分钟后，同样用非整点分钟的每日问题归档仍晚
2.7 到 5 小时，所以换分钟并不能消除延迟。需要准时搭建时，在 Actions 中手动运行
本工作流（`workflow_dispatch`）。

## 选择案例与手动运行

添加 `factory:daily` 纳入下一次扫描；移除该标签停止后续选取，不取消已启动任务。
每个选中的案例创建一个独立执行 Issue，并显式派发搭建；同案例在途时跳过。
保留同 Run 重试幂等，新的手动或每日 Run 属于新一轮。

**Actions → Preset build tests → Run workflow** 可以随时手动启动。
`dry_run=true` 只预览，不创建执行 Issue 或派发；定时运行始终执行真实搭建。
手动与定时入口共用启动队列和在途检查，手动预览不会改变下次定时运行。

## 旧批次入口退役

`Evaluation batches` 工作流已移除，任务完成后的批次推进调用也已移除。
旧 `evaluations/plans.json` 不再驱动定时任务，`FACTORY_EVALUATION_PLANS_ENABLED`
不控制当前入口。保留历史批次协议、脚本和报告以读取历史结果。
当前入口使用普通任务的现有预算与质量检查，不使用旧计划的三样本串行批次。

## 验证

```bash
node --test .github/scripts/tests/scheduled-preset-tests.test.mjs \
  .github/scripts/tests/evaluation-workflow-policy.test.mjs
```

覆盖标签选择、在途跳过、重试幂等、预览、UTC 时区及退役入口。
不通过启动真实付费搭建验证调度器。

## 一次性入口清理

2026-09-27 已停用以下 GitHub Actions 注册项。它们只服务于固定 Issue 的一次性操作，
工作流文件已不在默认分支中，但 GitHub 仍将历史注册项标记为 active；因此通过
Actions API 停用，保留历史运行、日志和产物。

| Workflow                               | 固定任务                | Workflow ID |
| -------------------------------------- | ----------------------- | ----------- |
| Dispatch PR 190 smoke Issue 191        | PR #190 / Issue #191    | `364931480` |
| Issue 182 recovery validation          | Issue #182              | `364742981` |
| Restore retained M02 candidate once    | Issue #252              | `365940211` |
| Resume three saved factory checkpoints | Issues #299、#301、#303 | `366665276` |

2026-09-28 以同样方式停用以下注册项。它们是一次性或已退役的入口，工作流文件已不在
任何分支中，不会再被触发。

| Workflow                               | Workflow ID |
| -------------------------------------- | ----------- |
| Apply default PR base patch            | `364928325` |
| Apply per-Issue concurrency fix        | `351500927` |
| Validate framework-first rubric source | `365683880` |
| Validate review repair source          | `365615157` |
| Materialize tested review draft check  | `365955643` |
| Report Integration Check               | `363331064` |
| Pi PR Completed                        | `349805615` |
| Test continuation reports              | `352792800` |
| Test task usage and Chinese fonts      | `352225418` |
| Test visual evidence                   | `352086254` |
| Verify protected path fix              | `351900114` |

通用的搭建、队列协调、评审、报告和源码基线验证入口继续保留。
清理不删除 Issue、任务分支或历史证据。
