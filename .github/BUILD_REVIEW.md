# 独立搭建评审

每次具备候选补丁的非 Handoff 搭建，在 `agent.patch` 封存后、独立最终验证前，
使用全新 Code Agent 会话评审本次实际使用的 NocoBase3 能力。它不修改应用，
不代替业务 QA，不因评分或评审失败触发业务修复。最终验证和发布仍使用原封存补丁。

```text
实现 / 修复 → 验证与浏览器 QA → 封存候选补丁 → 独立最终验证 → 发布 PR
                                  │
                  代码 + 安装包/Skill + 原始 QA/复盘
                                  ↓
                       一次独立评审调用（有预算）
                                  ↓
                 身份 / 字段 / 引用 / 文件指纹校验
                                  ↓
                     build-review.json + 独立用量
                                  ↓
                现有 Report Task Usage → 统一 HTML / Pages
```

评审读取本次 `task.reviewCriteria`，没有自定义要求时使用内置评分标准。
实现与浏览器 QA 的提示词不增加评审要求。评审文件留在 Artifact，不进入业务补丁。

## 报告内容

| 部分 | 来源与含义 |
| --- | --- |
| 模块评分 | 每个实际使用的基础模块，分别评设计合理性、开发完整性、Agent 使用友好度、Agent 产出质量；0–100 整数或 `null`，附理由、覆盖范围及证据 |
| 首轮 / 最终轮 QA | 评审者只提供模块与原始 criterion ID 的映射；状态从原始全量 QA 读取，focused 不算全量，首轮失败不会被最终通过覆盖 |
| 验证 / 修复过程 | 从本 Run 的 `repair-summary.json` 和各轮报告采集；不是 Agent 自报统计，也不等于 Agent 开发中所有自测和修正次数 |
| NocoBase3 的帮助 | 具体能力、接入位置、避免重复实现的职责及验证证据；不估算节省时间或 Token |
| 问题、误导与改进 | 区分内核、插件、模板、文档/Skill、业务实现、工厂、环境；提供影响、改法、严重程度及确认程度 |
| 界面一致性 | 评审者实际审阅至少两张不同页面/状态截图后才可评价；无图像能力或证据不足显示未评估 |
| 基线与证据 | 原始源码片段、截图、文件哈希、安装版本、候选补丁哈希、控制代码 SHA、评审输入指纹和引擎/模型 |

分数是评审意见，不是客观测量，不生成 NocoBase3 全局评分或默认平均分。
未使用、未覆盖、证据不足不按零分或满分处理。`confirmed` 表示评审者认为有证据，
不是人工确认；实现者的根因自述未经核验只算线索。文档误导必须对照 `claimed`
与 `observed`；应用 workaround 不能自动标成上游缺陷已解决。

## 配置与成本

GitHub Repository Variables：

| 变量 | 默认值 | 含义 |
| --- | --- | --- |
| `FACTORY_BUILD_REVIEW` | `full` | `full` 调用独立评审；`off` 只保留过程事实，适合纯流水线 smoke 测试 |
| `FACTORY_BUILD_REVIEW_TIMEOUT_SECONDS` | `300` | 单次调用上限，30–600 秒；同时受 Runner 剩余预算限制 |

复用本次已安装的 Code Agent、模型及该引擎的凭据，不增加服务或新的 Secret。
只调用一次，不另开评审修复循环，不因缺分重试模型；适配器本身的协议重试规则不变。
`agent-review.jsonl` 和规范化结果单独统计到 `review` 阶段，计时为 `agent:review`。
老用量回执没有该阶段时按没有调用兼容，不补造历史费用。费用仍未知，不等同供应商账单。

评审增加一次有上限的 Agent 调用，且位于上传 Artifact 前，因此会增加本轮交付等待时间。
模型错误、超时、JSON/引用不合法只标评审未完成；`continue-on-error` 不改变业务结果。
Handoff、取消、没有封存补丁或剩余预算不足时不调用模型。历史报告没有评审时明确显示
“未评估”；补发报告只重渲染已有材料，不会回填历史评分或再次调用评审模型。

## 证据与范围

`run-build-review.mjs` 把应用源文件、同步的 Skill、实际安装的 `@nocobase/*` 包文件、
封存补丁、复盘及各轮 QA/验证日志复制到临时目录。源码/Skill 和原始验证证据优先，
总计最多 48 MiB；文本每文件 1 MiB，截图每张 4 MiB；首轮与最终全量 QA 各最多 24 张。
超限或无法读取项记录为覆盖限制，不扫描整个上游仓库，不再运行应用或浏览器。

输入绑定 repository / issue / run / attempt、基线提交、候选补丁、依赖锁文件、安装包版本、
评审要求及文件清单。它评的是封存候选状态，不是 PR 后续最新 head。Handoff 没有恢复
首轮证据时只展示现有轮次，不推断首轮通过，也不冒充跨 Run 完整评测。

文本引用必须对应快照中的真实文件与有效行号，原文由脚本提取，不能由模型伪造 excerpt。
评审后检查所有已捕获文件哈希；被修改则整份评分不采用。图像引用必须对应原 PNG；
HTML 在既有 15 MiB 总图片预算内复用或内嵌，缺图明确提示，不删除原始验收记录。
评审无效时不会以缺失结果覆盖已归档的完整评审。

这是任务与产物隔离，不是操作系统级沙箱：副本不会链接到交付源码，评审会话移除
GitHub token 和测试账号密码，指令禁止修改/执行应用及联网，但并未限制 Runner 的全部
文件和网络权限。文件和哈希验证只证明引用来自捕获输入，不能机械证明推理正确或模型
确实理解了截图；报告因此保留原文与确认程度供人工核对。

## 输出与验证

字段契约和约束见 `.github/scripts/build-review.mjs`，模型指令及 JSON 结构见
`.github/prompts/build-review.md`。`build-review.json` 使用 version 1，状态为
`completed / not-reviewed / failed`，只有 completed 可以包含已校验的 evaluation。

```bash
node --test .github/scripts/tests/build-review.test.mjs
node --test .github/scripts/tests/delivery-report.test.mjs .github/scripts/tests/task-usage.test.mjs .github/scripts/tests/report-pages.test.mjs
node --test --test-concurrency=1 .github/scripts/tests/*.test.mjs
node .github/reports/render-review-example.mjs /tmp/report.example.html
```

样例数据完全虚构，仅展示评分、首轮失败、待确认误导及未知项的版式，不代表真实案例成绩。
回归测试用可控 CLI 验证真实 runner → 证据校验 → 用量 → HTML 链路，不调用收费模型。
真实模型与业务任务的联调需要合并到默认分支后执行新的搭建；模型输出质量仍需人工抽查。
