# Agent 交互历史

`Publish Agent History` 在每个 `Code Agent NocoBase Task` Run 结束后自动运行，
包括成功、失败、超时、取消（跳过）和 5 小时 Handoff。它把该 Run 的 agent 交互记录
打包上传到一个固定的 `factory-history` Release，并在来源 Issue 回复一条可更新的评论。

它不改变业务搭建结果，不调用模型，不使用媒体 Token：只读取已有 Artifact，
使用内置 `GITHUB_TOKEN` 写入 Release 和 Issue 评论。重复执行同一个 Run 只会更新
自己的评论，并覆盖同名 Release 资产。

## 收录内容

只收录 agent 自己产生的记录，不含截图和录像（那些由 `Publish Task Visual Report` 发布）：

| 阶段       | 文件                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 初始实现   | `agent-implement.jsonl`                                                                                                        |
| 应用修复   | `agent-repair-<n>.jsonl`                                                                                                       |
| 浏览器验收 | `verify-<n>/browser-acceptance/agent-browser-*.jsonl`、`report.json`、`showcase.json`、`media-health.json`、`media-parts.json` |
| 验证日志   | `verify-<n>.log`、`verify-final.log`                                                                                           |
| 变更摘要   | `agent.patch`、`change-summary.json`、`repair-summary.json`、`task-metadata.json`、`handoff.json`                              |

其他文件（截图、录像、evidence 目录）不会进入压缩包，即使它们在 Artifact 里。
打包结果是 `agent-history-issue-<n>-run-<id>-attempt-<a>.tar.gz`，内含 `manifest.json`
列出每个文件的大小和阶段。JSONL 压缩比约 14–16 倍，一个完整任务通常 3–6 MB。

## 为什么放 Release 资产

GitHub 评论附件只接受图片和视频（视频还有 10 MB 的免费 plan 上限），压缩包不能
作为评论附件；评论正文又有 65,536 字符上限。Release 资产接受任意文件类型、
单个最大 2 GiB、长期保存，并且用内置 Token 就能写入，所以历史存到这里，评论里
只放摘要和下载链接。

原始未压缩记录仍保留在本次 Run 的 Actions Artifact 中（14 天）。Artifact 过期后
无法补发，Release 上的副本不受影响。

## 脱敏

- Agent runner 在写 JSONL 记录和实时控制台输出时，会把 API Key、endpoint 和管理员/
  测试密码替换为 `[REDACTED]`（控制台输出同时进入 Actions 日志和 `verify-<n>.log`）。
- 打包前再按模式清洗一次：`Factory-QA-…` 形式的一次性密码，以及
  `*_PASSWORD=`、`*_TOKEN=`、`*_SECRET=`、`*_API_KEY=` 形式的值。
- 仓库是公开的，Issue 评论和 Release 资产公开可读；记录里不应出现真实业务数据。

## 补发

Actions → **Publish Agent History** → Run workflow，选择默认分支，填写搭建 **Run ID**
和 `attempt`（留空取最新）。也可以用：

```bash
gh workflow run publish-agent-history.yml --repo gchust/nb3-factory --ref develop \
  --field run_id=<run id> --field attempt=<attempt>
```

补发只读取已有 Artifact 和 Job 时间，不重新搭建、不调用模型。已经跑完但缺少记录
评论的 Run 可以这样补上；Artifact 已过期时只会留下说明，不会伪造记录。
