# 工厂 QA、修复与续跑

本流程只控制 `.github/**`。不降低应用验收标准，不用测试环境故障驱动业务代码补丁。

```text
prepare：解析任务、固定 control SHA
  → 浏览器自检 + 固定文件样例
  → 首次实现 / 恢复中断的实现
  → 静态检查、构建、干净数据库
  → 全量 QA
       ├─ 应用缺陷 → 修复 → 必要代码检查 → 定向 QA
       │                                  ├─ 失败 → 继续修复
       │                                  └─ 通过 → 干净数据库全量 QA
       ├─ 报告不完整 → 同进程补字段/补操作（最多两轮）
       ├─ 环境受阻 → 保留诊断，不修改应用、不发布成功
       └─ 通过 → 独立 verify-final → 发布已验证的产物

达到 Runner 软预算 → patch + 阶段检查点 → 新 Runner 按阶段继续
```

## 验收条目与结果

`acceptance-criteria.mjs` 是 Prompt、报告覆盖检查、失败项复测及报告展示的共同解析入口。支持 `1.`、`1)`、`-`、`*`、`B01.`、`WF-01.` 和多行正文。字母编号原样保留；普通列表生成 C01/C02。非列表正文完整保留为一项，不截取首行。条目编号不能重复。

报告按 `id` 更新。兼容旧报告的唯一原文匹配，但不按数组位置猜测；全量验收要求每个 ID 恰好出现一次。定向复测使用原始要求中的 `qaCriteriaIds`，不重编号、不扩大范围。必要的登录和数据准备不是另一轮全量 QA。

| 状态 / 退出码 | 含义与下一步 |
| --- | --- |
| passed / 0 | 本轮所有必要项通过；focused 不能单独授权发布 |
| failed / 10 | 有实际操作与证据的应用缺陷，进入应用修复 |
| 报告无效或必要项 not_run / 2 | QA 补报告或缺失操作，不启动应用修复 |
| blocked / 20 | 环境受阻，或两轮补报告后仍不完整；保留诊断，停止本次自动执行 |
| 75 | Runner 预算到达，正常保存检查点续跑，不是基础设施或业务失败 |

blocked/not_run 必须给出原因；无法启动浏览器时不要求伪造截图。默认每项都必要。只有原始输入明确标记 `[optional]` / `[可选]` 的独立条目，才允许 not_run 不阻塞主干通过；必要条目里部分子能力不可用不等于整项可跳过。未配置提示本身仍可作为业务操作验收。

真正应用缺陷的修复次数仍不设上限。报告重试耗尽不会伪装成应用缺陷；退出 20 不触发自动 handoff。

## 浏览器与固定样例

`browser-preflight.mjs` 通过实际的 Agent Browser 和 QA 相同的域名限制、content boundaries，验证打开页面、交互、上传、下载。普通 Worker、模块 Worker、模块 Blob Worker 与 PDF 内置查看器能力写入独立报告。缺少可选能力不自动证明应用有错，也不直接把验收判为通过；QA 仍需实际观察并说明与环境限制的关联。

`prepare-browser-fixtures.py` 仅用 Python 标准库生成固定 PNG/PDF/DOCX/XLSX/PPTX、损坏 PNG 和不支持类型。manifest 保存预期内容、字节数及 SHA-256。Office 样例含实际文本和关系，PPTX 明确形状尺寸；合法样例和损坏样例分开。环境路径通过 `FACTORY_BROWSER_PREFLIGHT`、`FACTORY_BROWSER_FIXTURES_MANIFEST` 提供，不写入应用仓库、不让 QA 临时猜测样例。

应用 format/lint 仅通过命令行排除工厂 `.github/**`，保留应用原有规则及 ignore 配置；不会改动应用的 ESLint/Prettier 配置。

## 阶段检查点

`pipeline-state.json` 保存当前阶段、累计验证/修复次数、待复测 ID、业务输入哈希、工厂 SHA、补丁哈希及最近全量 QA 耗时。待修复的精简诊断位于 `repair-context/`。

恢复前核对输入与补丁，拒绝串用任务。工厂版本变化使旧 QA 进度失效；旧格式检查点从构建与全量验收开始。实现被中断时继续实现；修复被中断时先恢复诊断修复；定向 QA 被中断时只恢复待复测 ID；全量 QA 被中断时在干净环境重跑全量，不先重复已完成的定向修复。

不恢复浏览器进程、Cookie、测试数据库或旧模型日志。旧结果不能拼成新版本的全量通过。报告补齐若跨 Runner 中断，恢复其 QA 范围并重新建立实际证据，不声称恢复了浏览器内存。

同一 Run 的所有 Job 使用 prepare 捕获的 control SHA。软预算预留两分钟做上传；长阶段开始前检查剩余预算，全量 QA 参考上一轮耗时，但估计上限低于新 Runner 的可用时间，避免空续跑。

`progress.json` 与 Actions Step Summary 显示阶段、结果、累计轮次和待复测 ID。`repair-summary.json` 保留本 Run 的轮次，`finalVerificationAttempt` 定位累计编号的最终报告目录，避免续跑后媒体/HTML 读取错误。完整交付报告仍由原独立工作流发布；运行中的轻量进度由下述独立上报链路提供。

## 实时进度评论

`task-progress.mjs watch` 在调用模型前启动，只读取当前阶段、验收条目计数和日志文件更新时间，不读取大体积模型日志内容。阶段/验收计数变化最多每分钟合并上报一次，长阶段约每五分钟发送一次快照；本地采样为十秒一次，不调用模型、不运行额外验收。

快照通过 `repository_dispatch: factory-progress` 交给独立的 `report-task-progress.yml`，始终更新同一条机器人进度评论。Agent Job 沿用现有 `contents: write` 以派发事件，不增加 `issues: write`，不接触评论发布凭据。没有常驻第二个 Runner；每次快照会产生一个短报告 Job（因此仍有 Actions 调度开销）。

评论区分“最近 Agent/校验输出”和“最近验收项记录”。后者是报告工具记录的时间，不是新的验收结论；没有记录就显示未知，不把心跳当作进展。QA 计数仅属于当前轮次/范围，不累加旧轮次。阶段开始时间不随心跳刷新。跨 Run/attempt 的旧快照不能覆盖新结果；最终状态从实际 Run/Job 读取，业务 QA 通过不等于 PR 已交付。

Agent 阶段结束时通过 `always()` 停止观察进程并发送末次快照。原有收尾分发器显式请求最终进度报告，`workflow_run.completed` 另外覆盖取消/硬超时；两种请求去重。上报失败只产生可诊断警告/报告 Job 失败，不改变业务验收、续跑或发布结果。进入独立终验后不再有 Agent 心跳，最终评论在 Run 收尾时刷新；时间过旧时应打开 Actions 日志核对，不能仅凭无心跳认定卡死。

新观察进程只对采用本版工厂的新 Run 生效，不热修改已经启动的任务。

## 验证

```sh
node --test --test-concurrency=1 .github/scripts/tests/*.test.mjs
python3 .github/scripts/tests/browser-fixtures.test.py
python3 .github/scripts/tests/preview-dns-sync.test.py
```

工厂 CI 另外用固定版本 Agent Browser 在真实 Chrome 中执行自检，不调用模型、不运行或修改生成应用。核心回归覆盖 B01–B16、重复/缺失 ID、全量→定向→全量、阶段中断恢复、哈希绑定、环境/报告分流，以及续跑后报告目录。真实业务整轮耗时收益需要合并后另行采样，不能从这些工厂回归推算。
