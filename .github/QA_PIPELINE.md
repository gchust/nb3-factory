# 工厂 QA、修复与续跑

本流程只控制 `.github/**`。不降低应用验收标准，不用测试环境故障驱动业务代码补丁。

```text
prepare：解析任务、固定整条 Handoff 链的 control SHA
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

`acceptance-criteria.mjs` 是 Prompt、报告覆盖检查、失败项复测及报告展示的共同解析入口。支持 `1.`、`1)`、`-`、`*`、`B01.`、`WF-01.` 和多行正文。字母编号原样保留；普通列表生成 C01/C02。非列表正文完整保留为一项，不截取首行。条目编号不能重复。Issue 未填写验收要求时，解析任务阶段按同一规则从业务需求生成条目并写入任务元数据，后续报告和复测与手写要求一致。

报告按 `id` 更新。兼容旧报告的唯一原文匹配，但不按数组位置猜测；全量验收要求每个 ID 恰好出现一次。定向复测使用原始要求中的 `qaCriteriaIds`，不重编号、不扩大范围。必要的登录和数据准备不是另一轮全量 QA。

| 状态 / 退出码 | 含义与下一步 |
| --- | --- |
| passed / 0 | 本轮所有必要项通过；focused 不能单独授权发布 |
| failed / 10 | 有实际操作与证据的应用缺陷，进入应用修复 |
| 报告无效或必要项 not_run / 2 | QA 补报告或缺失操作，不启动应用修复 |
| blocked / 20 | 环境受阻，或两轮补报告后仍不完整；保留诊断，停止本次自动执行 |
| 75 | Runner 预算到达，正常保存检查点续跑，不是基础设施或业务失败 |

blocked/not_run 必须给出原因；无法启动浏览器时不要求伪造截图。默认每项都必要。只有原始输入明确标记 `[optional]` / `[可选]` 的独立条目，才允许 not_run 不阻塞主干通过；必要条目里部分子能力不可用不等于整项可跳过。未配置提示本身仍可作为业务操作验收。

应用修复受 `.github/scripts/task-policy.mjs` 的统一上限约束：最多五次修复；同一验收项 / 检查的相同失败最多观察三次；最多一次五小时 Handoff；实现、修复和 QA 的累计活动时间最多十小时。评测计划只能收紧这些上限。报告重试耗尽不会伪装成应用缺陷；退出 20 不触发自动 handoff。

## 浏览器与固定样例

`browser-preflight.mjs` 通过实际的 Agent Browser 和 QA 相同的域名限制、content boundaries，验证打开页面、交互、上传、下载。普通 Worker、模块 Worker、模块 Blob Worker 与 PDF 内置查看器能力写入独立报告。缺少可选能力不自动证明应用有错，也不直接把验收判为通过；QA 仍需实际观察并说明与环境限制的关联。

`prepare-browser-fixtures.py` 仅用 Python 标准库生成固定 PNG/PDF/DOCX/XLSX/PPTX、损坏 PNG 和不支持类型。manifest 保存预期内容、字节数及 SHA-256。Office 样例含实际文本和关系，PPTX 明确形状尺寸；合法样例和损坏样例分开。环境路径通过 `FACTORY_BROWSER_PREFLIGHT`、`FACTORY_BROWSER_FIXTURES_MANIFEST` 提供，不写入应用仓库、不让 QA 临时猜测样例。

应用 format/lint 仅通过命令行排除工厂 `.github/**`，保留应用原有规则及 ignore 配置；不会改动应用的 ESLint/Prettier 配置。

## 阶段检查点

`pipeline-state.json` 保存当前阶段、累计验证/修复次数、待复测 ID、业务输入哈希、工厂 SHA、补丁哈希及最近全量 QA 耗时。待修复的精简诊断位于 `repair-context/`。

恢复前核对输入、补丁与固定工厂 SHA，拒绝串用任务或换版本；不会因为默认分支前进而清空待复测项、重置到全量 QA。旧格式阶段检查点仍从构建与全量验收开始，但必须能够确定其工厂 SHA。实现被中断时继续实现；修复被中断时先恢复诊断修复；定向 QA 被中断时只恢复待复测 ID；全量 QA 被中断时在干净环境重跑全量，不先重复已完成的定向修复。

不恢复浏览器进程、Cookie、测试数据库或旧模型日志。旧结果不能拼成新版本的全量通过。报告补齐若跨 Runner 中断，恢复其 QA 范围并重新建立实际证据，不声称恢复了浏览器内存。

同一搭建及其所有 `code-agent-continue` 的任务执行 Job 使用同一个 control SHA。软预算预留两分钟做上传；长阶段开始前检查剩余预算，全量 QA 参考上一轮耗时，但估计上限低于新 Runner 的可用时间，避免空续跑。

`progress.json` 与 Actions Step Summary 显示阶段、结果、累计轮次和待复测 ID。`repair-summary.json` 保留本 Run 的轮次，`finalVerificationAttempt` 定位累计编号的最终报告目录，避免续跑后媒体/HTML 读取错误。完整交付报告仍由原独立工作流发布；运行中的轻量进度由下述独立上报链路提供。

## 跨 Run 的工厂版本

首次搭建固定触发工作流的提交，将 `controlSha` 写入任务元数据、`pipeline-state.json` 与 `handoff.json`；派发下一轮时传递 `client_payload.control_sha`。续跑的 prepare 先下载来源 Run 的小型 `factory-task-<Issue>` 产物核对 SHA，再 checkout 固定版本的任务脚本。Agent 下载完整检查点后，在应用补丁前再次核对 Issue、来源 Run、续跑序号及 SHA。

没有 `control_sha` 的旧续跑会额外下载一次来源检查点，使用其中实际记录的工厂 SHA（优先兼容旧 `pipeline-state.json`），不是最早 Run 的 SHA，也不是当前 develop。下一轮即使用新的传递协议，不再在 prepare 重复下载大型检查点。缺少来源 SHA、字段冲突或提交不可取得时明确失败，不回退到最新工厂、不自动重做 QA。需要使用新版工厂时启动新搭建；本 PR 不提供隐式升级/降级或热修改运行中任务。

`repository_dispatch` 的入口 YAML 仍由 GitHub 从默认分支加载，因此 Run 页的 `head_sha` **不是任务脚本实际版本**。只有两个轻量 Handoff 协议脚本从该入口版本的 `bootstrap/` 执行；prepare、Agent、QA、终验及 PR 发布使用 `control/` 的固定 SHA。bootstrap 负责旧协议兼容与下一轮派发，不执行任务逻辑；下一轮派发每次请求限时 30 秒，只在 GitHub 肯定没有受理时最多重试 3 次：429 响应（遵守 `Retry-After`，最多等 30 秒，没有该头时按 1/3/8 秒退避；要求更久则直接失败），或请求发出前的连接失败（`ECONNREFUSED`、`ENOTFOUND`、`EAI_AGAIN` 等，按 1/3/8 秒退避）。重复的续跑要再花 5 小时，而 5xx 可能是后端已受理后前端才报错，所以 5xx、超时、连接重置（`ECONNRESET`、`UND_ERR_SOCKET`）和其他未知错误都不重试，立即失败并提示续跑可能已经派发，手动补发前先在 Actions 里核对；其他拒绝同样立即失败。独立报告器仍使用当前默认分支。本机制不冻结入口 YAML 的 Job 定义、仓库变量、Secrets、Runner 镜像或外部服务；修改入口时必须保持与固定版本任务脚本的调用协议兼容。

## 实时进度评论

`task-progress.mjs watch` 在调用模型前启动，只读取当前阶段、验收条目计数和日志文件更新时间，不读取大体积模型日志内容。阶段/验收计数变化最多每两分钟合并上报一次，无变化的长阶段约每二十分钟发送一次快照，结束时的最终快照立即发送；本地采样为十秒一次，不调用模型、不运行额外验收。每次上报都会启动一次 `Report Task Progress`，因此间隔不宜再缩短。

快照通过 `repository_dispatch: factory-progress` 交给独立的 `report-task-progress.yml`，始终更新同一条机器人进度评论。Agent Job 沿用现有 `contents: write` 以派发事件，不增加 `issues: write`，不接触评论发布凭据。没有常驻第二个 Runner；每次快照会产生一个短报告 Job（因此仍有 Actions 调度开销）。

评论区分“最近 Agent/校验输出”和“最近验收项记录”。后者是报告工具记录的时间，不是新的验收结论；没有记录就显示未知，不把心跳当作进展。QA 计数仅属于当前轮次/范围，不累加旧轮次。阶段开始时间不随心跳刷新。跨 Run/attempt 的旧快照不能覆盖新结果；最终状态从实际 Run/Job 读取，业务 QA 通过不等于 PR 已交付。

Agent 阶段结束时通过 `always()` 停止观察进程并发送末次快照。原有收尾分发器显式请求最终进度报告，`workflow_run.completed` 另外覆盖取消/硬超时；两种请求去重。上报失败只产生可诊断警告/报告 Job 失败，不改变业务验收、续跑或发布结果。进入独立终验后不再有 Agent 心跳，最终评论在 Run 收尾时刷新；时间过旧时应打开 Actions 日志核对，不能仅凭无心跳认定卡死。

新观察进程只对采用本版工厂的新 Run 生效，不热修改已经启动的任务。

## 发布基线

终验和发布都在任务固定的 `base_sha` 上应用同一个补丁。任务运行期间默认分支可能继续前进；新建 `agent/issue-N` 时，GitHub 会拒绝 workflow 文件与仓库现有内容不一致的推送（`refusing to allow a GitHub App to create or update workflow ... without workflows permission`），而任务 token 没有 `workflows` 权限，也不应为此增加。

`publication-base.mjs` 在应用补丁之后、提交之前决定发布基线：

- 已有工作分支（评论构建、后续轮次，`base_ref` 即工作分支）：不移动、不抓取，按原逻辑以 `base_sha` 为 lease 快进推送。
- 新工作分支且目标分支 head 与 `base_sha` 不同：比较两者之间变化的路径。若全部属于工厂自有文件，且都不在补丁修改范围内，就把补丁应用到最新 head 上，并确认补丁触及的每个应用文件的 mode 与 blob 和已验证的索引完全一致，然后以最新 head 为父提交发布。应用失败或不一致时回到 `base_sha`。
- 其他情况（漂移含应用文件，或与补丁重叠）保留 `base_sha`，但先把目标分支历史抓取到能看到 `base_sha` 为止（50、500 层后再完整历史）。浅克隆不知道远端已有 `base_sha`，否则会把基线提交本身连同其 workflow 修改再推送一次。若推送仍因 workflow 权限被拒，提交步骤输出 `::error::` 说明原因与人工补救：在最新目标分支上 `git apply --3way` `factory-patch-N` 中的补丁，用有 workflow 权限的凭据推送工作分支，再手动开 PR。

这里的工厂自有文件只认 `.github/**`（不含被 `eslint.config.js` 导入、会改变应用 lint 规则的 `.github/scripts/factory-eslint.mjs`）、`docs/**`，以及只追加且不含 `!` 反选规则的 `.gitignore`。终验的 lint 与格式检查都排除 `.github/**`；`docs/**` 由工厂测试保持 Prettier 干净；追加的忽略规则只会让检查少看未跟踪文件，不会改变已跟踪文件。`.npmrc`、`README.MD`、`package.json`、`eslint.config.js`、`factory-template.json` 和锁文件会影响安装或检查，或只有部分属于工厂，一律按应用文件处理。因此改基后的发布树与终验的树只在这些工厂文件上不同，终验结论仍然适用。

`agent-artifacts/publication-base.json` 记录 `verifiedBase`、`publishedBase`、是否改基和原因，并写入 Step Summary。PR 正文保留 `agent-verified-base-sha` 标记和一行说明；搭建报告与构建复盘仍以任务元数据中的原 `base_sha` 为准，因为验证是在那里完成的。

## 验证

```sh
node --test --test-concurrency=1 .github/scripts/tests/*.test.mjs
python3 .github/scripts/tests/browser-fixtures.test.py
python3 .github/scripts/tests/preview-dns-sync.test.py
```

工厂 CI 另外用固定版本 Agent Browser 在真实 Chrome 中执行自检，不调用模型、不运行或修改生成应用。核心回归覆盖 B01–B16、重复/缺失 ID、全量→定向→全量、阶段中断恢复、哈希绑定、环境/报告分流，以及续跑后报告目录。真实业务整轮耗时收益需要合并后另行采样，不能从这些工厂回归推算。
