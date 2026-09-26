# 搭建复盘

每个 `Code Agent NocoBase Task` Run 结束后（成功、失败、超时或 handoff 都会跑），独立的
**Publish Task Retrospective** 工作流会在来源 Issue 留下一条可更新的复盘评论，并把摘要追加到
一个固定的「搭建复盘台账」Issue。它不改变搭建结果：没有复盘文件、JSON 解析失败或
GitHub 写入失败，都不会让已经通过验收的业务 PR 失败。

本页描述实现/修复 Agent 的过程自述。封存候选补丁后的独立模块评审另见
[独立搭建评审](BUILD_REVIEW.md)，其评分、正向帮助、框架问题与误导记录统一展示在 HTML 中，
不把自述自动当作已证实的框架缺陷，也不改变这些复盘评论。

## 评论里有什么

| 部分              | 来源                                         |
| ----------------- | -------------------------------------------- |
| 一句话总结        | Agent 写的 `retro.json`                      |
| 验证轮次/修复轮次 | 流水线读 `repair-summary.json`               |
| 一、问题与解法    | Agent 写的 `retro.json` → `blockers`         |
| 二、基线优化建议  | Agent 写的 `retro.json` → `improvements`     |
| 原始复盘          | 只在 JSON 解析失败时出现，原文照录在折叠块里 |

也就是说：**定性部分由 Agent 自述，定量部分由流水线补**，两者在同一条评论里对齐。

## Agent 怎么产出复盘

- 实现轮：`.github/prompts/implement.md` 里的「收尾复盘」要求 Agent 把 JSON 写到
  `--retro-path` 注入的路径，即 `$RUNNER_TEMP/agent-artifacts/retro.json`。
- 修复轮：`.github/prompts/repair.md` 要求 Agent 读取同一个文件、追加一条 `phase: "repair"`
  的卡点再写回，而不是另起一份。
- 路径在应用工作区之外，所以复盘永远不会进入业务补丁。

`retro.json` 的结构：

```json
{
  "version": 1,
  "summary": "一句话：这次顺不顺利，主要时间花在哪",
  "blockers": [
    {
      "phase": "implementation | verify | qa | repair",
      "title": "卡点一句话",
      "symptom": "具体报错或现象",
      "rootCause": "根因",
      "resolution": "最终怎么解决的",
      "cost": "代价，例如「多跑 2 轮修复 / 约 20 分钟」"
    }
  ],
  "improvements": [
    {
      "category": "template-overlay | skills-docs | scaffold-defaults | verification | tooling",
      "title": "NocoBase 3 基线应该改什么",
      "detail": "为什么现在会踩到，改完之后怎么避免",
      "suggestedChange": "具体到文件、脚本或配置项的改法",
      "mechanizable": true
    }
  ]
}
```

`category` 的含义：

| 分类                | 落到哪里                                                |
| ------------------- | ------------------------------------------------------- |
| `template-overlay`  | 模板 overlay 脚本、`factory-template.json` 的 `tooling` |
| `skills-docs`       | `skills/nocobase-app-development/` 文档缺失或误导       |
| `scaffold-defaults` | `@nocobase/create-app` 脚手架默认值不合适               |
| `verification`      | 工厂验证脚本误报或漏报                                  |
| `tooling`           | 本地命令、依赖或构建                                    |

## 台账

`publish-retro.mjs` 会找一个带 `factory:retro-log` 标签、标题为「搭建复盘台账」的 Issue，
找不到就创建它。每次 Run 追加一条评论（用 marker 去重，重复执行只更新自己那条），
内容是该轮的建议分布 + 指向完整复盘评论的链接。

台账存在的意义：单个 Issue 的复盘会随 Issue 关闭而沉下去，台账是按时间累积的索引，
方便定期把 `mechanizable: true` 的条目一次性合并进 NocoBase 3 基线和 Skill 文档。

## 补发

Actions → **Publish Task Retrospective** → Run workflow，填搭建 **Run ID**，`attempt` 留空取最新。
也可以用：

```bash
gh workflow run publish-retro.yml --repo gchust/nb3-factory --ref develop \
  --field run_id=<run id> --field attempt=<attempt>
```

补发只读取已有 Artifact 和 Issue 评论，不重新搭建、不调用模型。Artifact 过期（14 天）后
`retro.json` 无法取回，评论会只剩流水线统计并标注未产出复盘。

回归检查：`pnpm factory:test`。工厂作业从默认分支签出控制面，所以控制面改动必须先合到
默认分支，Issue 驱动的集成测试才开始生效。
