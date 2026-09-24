# Agent 交互历史

每次搭建、修复、浏览器 QA 和评论问答使用同一个调用记录入口。`Publish Agent History`
在任务完成后归档本轮可观察的输入、CLI 输出与终验诊断，并在执行 Issue 发布链接。
归档不调用模型，不改变业务验收或触发重新搭建。

## 留存链路

```text
统一 run-agent → 脱敏 Prompt + invocation + JSONL + result
                         │
实现/修复/QA → agent Artifact    评论问答 → reply Artifact
任务输入     → task Artifact     独立终验 → final Artifact
                         │
                 按 run / attempt 的 Job 时间选 Artifact ID
                         │
                 task/ agent/ final/ reply/ 分目录打包
                         │
              factory-history Release → Issue 记录 + 历史索引
```

每次调用在启动 CLI 前保存 `*.jsonl.prompt.md` 和 `*.jsonl.invocation.json`。
后者含调用 ID、阶段、执行器、实际版本、模型、启动参数、控制面 SHA，以及本轮可用的
AGENTS.md、锁文件、模板记录和 Skills 文件哈希。设置失败记 `invoked: false`；异常结束
仍保留已生成文件。`*.jsonl.result.json` 沿用原有执行器结果与用量契约。

**范围是工厂可观察输入和 CLI 暴露输出。** CLI 内部系统提示词、未暴露的子 Agent
上下文或用量不在保证范围内。Skill 哈希说明当时可用的内容版本，不证明 Agent 阅读或
正确使用了它。终验是确定性验证，不是另一个 Agent 对话。

## 归档内容

| 目录 | 内容 |
| --- | --- |
| `task/` | 任务输入和基线元数据 |
| `agent/` | 初始实现、实际发生的修复、浏览器 QA / 报告修复的 JSONL、Prompt、调用记录、结果；验证日志、patch 和摘要 |
| `final/` | `verify-final.log` 与阶段耗时 |
| `reply/` | 评论 Agent 的 JSONL、Prompt、调用记录、结果、最终或部分回复与任务元数据 |

只收录明确允许的文件；截图、录像、依赖、配置和工作区不会整包公开。截图和录像仍由
Visual Report 发布。评论问答在成功和失败路径均上传诊断；失败的部分回答不会作为
成功回复发布。归档采用普通和评论专用的完成后派发，重复派发只更新同一记录。

## 完整性与补发

`manifest.json` 记录来源 Artifact、文件 SHA-256、调用和缺失原因。
`captured` 表示识别到的工厂可观察调用文件齐全，`partial` 表示缺失、旧格式、下载失败
或中断，`unknown` 表示无法确认调用。仅有最终回复不算保留了评论交互。
缺失日志不能伪造，未调用模型不等于调用失败，留存完整不等于业务验收通过。

Artifact 只从请求的 run/attempt 对应 Job 时间范围选择，并通过明确 ID 下载；同名
文件在四个目录中独立保存。文件过大、旧 Artifact 过期或下载失败均保留缺失说明。
新归档的文件名包含内容摘要，不覆盖不同内容的旧副本；补发失败不会移除上次成功链接。
打包或上传失败后仍尝试回写 Issue，并保持历史发布工作流失败，不重跑业务搭建。
无法确认来源 Issue、GitHub 写入失败或 Runner 被直接销毁时，不能保证生成 Issue 提示。

Issue 保留每个 run/attempt 的评论和一个最近 100 轮的索引；更多旧记录仍留在讨论中。
索引链接已发布的用量报告和媒体评论，晚于历史索引发布的报告仍可从 Issue 查看。

Actions 原始产物保留 14 天。Release 副本不随 Artifact 过期；人工删除仍会移除它。
在 Actions → Publish Agent History 填搭建 Run ID（不是 Issue 编号）和 attempt 可补发：

```bash
gh workflow run publish-agent-history.yml --repo gchust/nb3-factory --ref develop \
  --field run_id=<run-id> --field attempt=<attempt>
```

补发只处理仍存在的产物。旧任务没有 Prompt/调用旁车文件时会明确标为不完整，不可通过
重新渲染当前 Prompt 冒充当时的实际输入。

## 脱敏与验证

调用记录使用工厂已知凭据脱敏；评论 always 路径再次清洗，发布前对允许文件做结构化
JSON/JSONL 与模式清洗。不要向公开仓库提供真实业务数据；已知凭据清洗不是任意敏感
信息检测。归档发布 Job 不持有模型密钥、不运行 Artifact 内的代码。

```bash
node --test .github/scripts/tests/agent-history*.test.mjs .github/scripts/tests/agent-recovery.test.mjs
node --test --test-concurrency=1 .github/scripts/tests/*.test.mjs
```

真实工作流验收需在合并后覆盖普通搭建、评论问答、评论调用失败、补发与缺失产物；
模拟测试通过不等于五家模型供应商均已完成真实调用验证。

## 模块评审与补跑

自动模块评审也进入正常历史包：`agent-review.jsonl`、脱敏 Prompt、调用记录、
统一结果，以及 `build-review.json`、实际评审输入和文件哈希目录。指标单列“模块评审”，
不并入实现或评论。旧记录缺调用侧车时仍归档可用日志/用量，但标为部分缺失。

`Reassess Build Quality` 的独立补跑完成后，由 `Publish Build Review History` 归档到
原执行 Issue。归档按新的评审 run/attempt 计量，原搭建/发布 attempt 仅作为来源保存；
只读取已有产物，不再调用模型、不重搭应用。维护者可在 `factory:manual` Issue 补发：

```text
/factory-review-history <评审补跑 Run ID> <attempt>
```

此命令不是原业务搭建 Run ID。旧 Artifact 未包含的 Prompt/调用信息不可补造；原产物
已过期时明确失败。发布失败不会改写业务通过状态，已有有效历史链接继续保留。
