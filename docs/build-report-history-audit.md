# 已完成搭建报告的 Agent 历史证据审查

审查日期：2026-09-26。线上报告目录快照取得于 15:49:26（UTC+08:00）。
本地与远端 develop 均为 `17ef6d0acc3e27b585aaa880a5d541f1126cdd23`。

## 结论

当前不能把这些 report 当成“已参考完整 Agent 搭建历史后形成的问题诊断”。
历史留存、进入评审快照、评审实际阅读，以及证据足以支持结论，是四个不同状态。
现有流水线对前两个状态有部分校验，没有对所有过程记录的实际阅读建立完整覆盖证明。

已取得报告目录中 58 个 Issue 的最新 report.json，其中 44 份业务结果为 delivered。
44 份中：23 份独立评审 completed，2 份 failed，11 份明确关闭评审，8 份较早报告没有 buildReview 字段。
23 份完成评审中，22 份没有新原始历史接入标识；唯一带 historyHash 的 #352，其实现 JSONL 因单文件超限被整个排除，history.coverage 为 partial。
因此，这批已交付报告里没有一份具备“完整搭建过程已进入评审并被完整核对”的可验证证据。
这不意味着已有源码/Skill/QA 支持的发现全部无效，而是它们不能承担完整试错过程复盘的证明责任。

统计按报告的 delivered 状态判断已交付，不按 Issue 的 closed 或 agent:needs-input 标签判断。
范围是每个 Issue 在报告目录中的最新快照，不声称遍历了所有历史 Run/attempt，也不把正在搭建且尚未发布报告的任务纳入。

来源：[报告索引](https://gchust.github.io/nb3-factory/reports/manifest.json)。所有 58 个索引指向的 report.json 均已成功读取。

## 线上样本与直接证据

### #352：接入了新机制，但最重要的实现过程被丢掉

- [任务](https://github.com/gchust/nb3-factory/issues/352)：办公设备借用与归还管理。
- [报告快照](https://gchust.github.io/nb3-factory/reports/issues/352/runs/36215705637/attempt-1/report.json)。
- [原始归档入口](https://github.com/gchust/nb3-factory/issues/352#issuecomment-5843336427)。
- 报告：业务 delivered，buildReview.state=completed；controlSha=fda3240b4f65451240ec334b3e834d5f1b743735。
- 归档确实包含 agent/agent-implement.jsonl：57,398,410 字节，约 54.74 MiB。不是上游没有保留该文件。
- 归档的 build-review-input.json 明确记录 history.coverage=partial、invocations=2，并将 agent-implement.jsonl 列为未采集。
- build-review-files.json 中有实现调用的 prompt、invocation、result，以及浏览器 QA JSONL 的分块；没有实现 JSONL 分块。
- 报告 60 条 evidence 中只有 E49、E50 属于 agent-history；二者都引用 agent-implement.jsonl.invocation.json 的文件清单，不是实现工具调用及返回。
- 评审自身 agent-review.jsonl 可核实它查看过索引、实现 prompt、result 的头尾和 invocation 清单。定向检查其 bash/read 调用，没有发现直接打开 QA 原始分块的调用；不能把目录中存在分块解释为已读。
- 报告 limitations 已披露原始历史 partial、无法确认发现过程与首轮是否一次写对。这个限制是真实的，但 completed 只代表评审流程完成，不能表示历史覆盖完整。

根因是 [review-history.mjs:9](../.github/scripts/review-history.mjs#L9) 的单文件 32 MiB 上限，以及 [recordsAt:149–155](../.github/scripts/review-history.mjs#L149) 在分块前整文件排除的逻辑。
本次 archive 原始日志完整存在，而进入评审的副本缺失，因此页面笼统写“实现日志缺失”会混淆留存缺失与评审输入排除。

### #355：同样排除了实现日志，而且评审最终失败

- [任务](https://github.com/gchust/nb3-factory/issues/355)：基础数据系统：客户备忘录。
- [报告快照](https://gchust.github.io/nb3-factory/reports/issues/355/runs/36222741186/attempt-1/report.json)。
- [原始归档入口](https://github.com/gchust/nb3-factory/issues/355#issuecomment-5844111734)。
- 原始实现 JSONL 为 49,665,443 字节，约 47.37 MiB；history.coverage=partial，同样因 32 MiB 门槛没有进入评审。
- 业务 delivered，但 buildReview.state=failed，evaluation=null。原因是 upstream stream closed before [DONE]。
- 因而它有已完成搭建与 HTML report，但没有成功发布的独立框架诊断。

### #338、#339 及更早的完成评审：旧链路没有原始搭建历史输入

- [#338 报告](https://gchust.github.io/nb3-factory/reports/issues/338/runs/36149979159/attempt-1/report.json) 与 [#339 报告](https://gchust.github.io/nb3-factory/reports/issues/339/runs/36151903756/attempt-1/report.json) 均为 completed。
- 两者 controlSha 均为 08430b4d5ad2aa42b6d597487815a6bb0bb6ca3f，早于原始历史接入改动。
- 实际下载其交互归档核对：build-review-input.json 没有 history，build-review-files.json 没有任何 agent-history 文件。
- #338 的 artifacts 输入是 patch、change-summary、repair-summary、retro、QA report，以及截图；#339 相似但没有 retro。另有冻结应用代码、包与 Skill。
- 它们的实现日志虽然分别有约 41.07 MiB、49.32 MiB，并已归档，却不在当时的评审快照中。
- [#299 报告](https://gchust.github.io/nb3-factory/reports/issues/299/runs/36095613913/attempt-1/report.json) 的 limitations 也明确承认，试错过程只能从 changedFiles、retro 与验收报告间接推断，未逐条核对日志时间线。

不能把这些旧报告中源码证据充分的静态发现否定掉；但它们不能证明 Agent 实际如何发现 API、遇到多少次错误、是否读过特定指引，或哪些业务绕行由真实失败触发。

### #357、#359、#361：明确关闭独立评审

三份流程冒烟任务均已 delivered，但 buildReview.state=not-reviewed，reason 为“本轮已明确关闭独立评审；只展示流水线事实”。
有完整交互归档及报告链接，不表示这些任务做过框架问题诊断。

## 发现了一处具体的证据解释过度

#352 的 E50 把 invocation.context 中列出 nocobase-db/SKILL.md 解释为“DB 指引被注入”。
数据库模块的 Agent 友好度 92 分理由，也使用了相关 Skill“均被注入实现上下文”的表述，并引用 E49/E50。

但 invocation 文件自己的 boundary 明确限制为工厂 prompt、调用配置与可用 Skill 哈希，不能证明 Skill 使用。
采集程序只是递归枚举 .agents/skills 下的文件并计算 SHA-256，见 [agent-invocation-record.mjs:17–40](../.github/scripts/agent-invocation-record.mjs#L17)。
因此 E49/E50 足以证明文件当时可用及其版本，不能单独证明注入、阅读或按该指引行事。

为避免反向误判，我又核对了原始实现日志：第 1832、4464、11509 行等确有对 nocobase-db/SKILL.md 的实际读取工具调用。
所以这里的问题是评审引用的证据不足，不是断言实现 Agent 没读 Skill；恰好说明把真正的读取轨迹排除后，评审会拿文件清单代替行为证据。

## 机制上的覆盖边界

1. [PR #351](https://github.com/gchust/nb3-factory/pull/351) 于 2026-09-26 11:43:41（UTC+08:00）合并，才把原始实现/修复/QA 历史纳入现有评审。旧报告不会自动重新评审。
2. [输入生成](../.github/scripts/run-build-review.mjs#L364) 提供历史索引、范围、调用数与限制；完整日志不直接灌入 prompt，而是让评审 Agent 自行检索只读快照。
3. [评审 prompt:5](../.github/prompts/build-review-history.md#L5) 要求核对相关实现原始片段，但明确写“无需全文读取所有日志或所有依赖”。这从设计上就是选择性查阅，不是全量审计。
4. [历史上限](../.github/scripts/review-history.mjs#L9)：单原文件 32 MiB、总历史 64 MiB、块 1 MiB、文件 2000、历史轮次 50。超过 1 MiB 的单行整行跳过，见 [207 行](../.github/scripts/review-history.mjs#L207)。
5. coverage=available 只表示扫描识别到的材料在这些限制内可用，不表示所有应有调用都已经被发现，更不表示评审读过全部文件。调用整体都没有任何文件时，扫描本身不能发现这次调用。见 [scan](../.github/scripts/review-history.mjs#L34) 与 [coverage](../.github/scripts/review-history.mjs#L214)。
6. [验证器](../.github/scripts/build-review.mjs#L129) 校验引用路径、行号、类型、文件与哈希，[historyHash](../.github/scripts/build-review.mjs#L269) 防止来源变化；没有强制每个实现/修复调用必须有真实工具事件引用，也不验证“所有失败都被审阅”。
7. [输出处理](../.github/scripts/run-build-review.mjs#L543) 将 partial 写进 limitations 后，仍可将评审设为 completed。assessment 的模块完成状态与历史覆盖是两个维度。
8. 续跑只保留通过身份验证的 Handoff/恢复祖先，不扫描同一 Issue 的所有独立 Run；CLI 未暴露的内部上下文与子 Agent 记录不在覆盖承诺内。见 [REVIEW_HISTORY.md](../.github/REVIEW_HISTORY.md)。
9. HTML 是已有 build-review、QA、retro 与流水线事实的固定渲染，不会再读取完整历史重新诊断。补发 HTML 与重新执行独立评审应严格区分。见 [报告说明](../.github/reports/README.md)。

## 建议的修正顺序

以下是建议，本次未修改流水线、重跑任务或发布任何 GitHub 评论。

1. 优先修正大日志整份排除：按流读取并保留可索引的真实消息、工具参数/返回、失败与修复事件，或者把大原文件分块后再施加总量策略；所有省略必须独立计数。不能只提高 prompt 文案要求。
2. 分别显示“留存覆盖”“评审输入覆盖”“实际阅读/引用覆盖”，列明缺失的是实现、修复还是 QA，及原始字节数、纳入字节数、排除原因。不要让一个 completed 吞掉这些差异。
3. 过程判断必须引用真实工具调用与返回；可用 Skill 哈希只能支持版本可用性。静态源码结论与真实搭建摩擦应分开标注。
4. 对失败事件先做确定性的全量索引，再要求评审标记已分析、重复、无关或证据不足，保留原始位置；不能把文件已存在当作阅读覆盖。
5. 修复输入后优先重评 #352，再补跑 #355；更早报告选择有多轮修复/续跑的复杂案例补评。单纯重发 HTML 不会补齐过程证据。

补充观察：#352 实现 JSONL 共 57,398,410 字节，其中 message_update 流式事件占 40,022,222 字节，约 69.7%。
这说明可研究按事件类型进行可追溯规范化，而不是把大量流式增量直接当作文件体积后整份丢弃。
但这只是优化方向，不能未验证就假定所有增量都可无损删除；须保留最终消息、工具输入输出、错误、时间线与原始偏移映射。

## 核查范围与未验证项

- 实际读取全部 58 份最新公开 report.json，并检查报告 identity、buildReview.state、basis.historyHash、limitations 与 evidence.path。
- 读取 15 个相关 Issue 的全部分页评论；下载并核对 #338、#339、#352、#355 四份交互历史归档。
- 检查 #352、#355 评审自身的工具调用记录；检查 #352 原始实现事件统计及 DB Skill 读取调用。
- 只做本研究文档的格式与本地链接检查，不运行应用测试、全项目类型检查或构建。
- 未逐条重新判定所有 report findings，也未穷尽 58 个任务的完整原始工具时间线；无法推断已经遗漏的具体问题总数。
- 未重新核对最新 NocoBase 上游代码；现有发现仍是相应冻结依赖版本的判断。

## 最新报告清单

以下每行使用审查时索引指向的固定快照，避免之后的 Issue 最新入口更新造成混淆。
“历史引用”统计 evaluation.evidence 中路径包含 agent-history/ 的条数，仅代表显式引用，不代表全部实际阅读。

| Issue | 业务状态  | 独立评审              | historyHash | 历史引用 | 固定报告                                                                                                              |
| ----- | --------- | --------------------- | ----------- | -------: | --------------------------------------------------------------------------------------------------------------------- |
| #361  | delivered | not-reviewed          | 无          |        0 | [Run 36224358618 / 1](https://gchust.github.io/nb3-factory/reports/issues/361/runs/36224358618/attempt-1/report.json) |
| #359  | delivered | not-reviewed          | 无          |        0 | [Run 36223704234 / 1](https://gchust.github.io/nb3-factory/reports/issues/359/runs/36223704234/attempt-1/report.json) |
| #357  | delivered | not-reviewed          | 无          |        0 | [Run 36223045221 / 1](https://gchust.github.io/nb3-factory/reports/issues/357/runs/36223045221/attempt-1/report.json) |
| #355  | delivered | failed                | 有          |        0 | [Run 36222741186 / 1](https://gchust.github.io/nb3-factory/reports/issues/355/runs/36222741186/attempt-1/report.json) |
| #352  | delivered | completed             | 有          |        2 | [Run 36215705637 / 1](https://gchust.github.io/nb3-factory/reports/issues/352/runs/36215705637/attempt-1/report.json) |
| #342  | failure   | not-reviewed          | 无          |        0 | [Run 36226447711 / 1](https://gchust.github.io/nb3-factory/reports/issues/342/runs/36226447711/attempt-1/report.json) |
| #339  | delivered | completed             | 无          |        0 | [Run 36151903756 / 1](https://gchust.github.io/nb3-factory/reports/issues/339/runs/36151903756/attempt-1/report.json) |
| #338  | delivered | completed             | 无          |        0 | [Run 36149979159 / 1](https://gchust.github.io/nb3-factory/reports/issues/338/runs/36149979159/attempt-1/report.json) |
| #333  | delivered | failed                | 无          |        0 | [Run 36132776150 / 1](https://gchust.github.io/nb3-factory/reports/issues/333/runs/36132776150/attempt-1/report.json) |
| #330  | failure   | failed                | 无          |        0 | [Run 36123359574 / 1](https://gchust.github.io/nb3-factory/reports/issues/330/runs/36123359574/attempt-1/report.json) |
| #322  | cancelled | completed             | 无          |        0 | [Run 36114924151 / 1](https://gchust.github.io/nb3-factory/reports/issues/322/runs/36114924151/attempt-1/report.json) |
| #320  | failure   | completed             | 无          |        0 | [Run 36114915913 / 1](https://gchust.github.io/nb3-factory/reports/issues/320/runs/36114915913/attempt-1/report.json) |
| #319  | cancelled | not-reviewed          | 无          |        0 | [Run 36114911898 / 1](https://gchust.github.io/nb3-factory/reports/issues/319/runs/36114911898/attempt-1/report.json) |
| #316  | cancelled | not-reviewed          | 无          |        0 | [Run 36114899399 / 1](https://gchust.github.io/nb3-factory/reports/issues/316/runs/36114899399/attempt-1/report.json) |
| #315  | delivered | not-reviewed          | 无          |        0 | [Run 36114609788 / 1](https://gchust.github.io/nb3-factory/reports/issues/315/runs/36114609788/attempt-1/report.json) |
| #303  | delivered | completed             | 无          |        0 | [Run 36095617049 / 1](https://gchust.github.io/nb3-factory/reports/issues/303/runs/36095617049/attempt-1/report.json) |
| #302  | failure   | completed             | 无          |        0 | [Run 36083799374 / 1](https://gchust.github.io/nb3-factory/reports/issues/302/runs/36083799374/attempt-1/report.json) |
| #301  | delivered | completed             | 无          |        0 | [Run 36095615652 / 1](https://gchust.github.io/nb3-factory/reports/issues/301/runs/36095615652/attempt-1/report.json) |
| #300  | delivered | completed             | 无          |        0 | [Run 36083791971 / 1](https://gchust.github.io/nb3-factory/reports/issues/300/runs/36083791971/attempt-1/report.json) |
| #299  | delivered | completed             | 无          |        0 | [Run 36095613913 / 1](https://gchust.github.io/nb3-factory/reports/issues/299/runs/36095613913/attempt-1/report.json) |
| #298  | failure   | completed             | 无          |        0 | [Run 36083784621 / 1](https://gchust.github.io/nb3-factory/reports/issues/298/runs/36083784621/attempt-1/report.json) |
| #297  | delivered | completed             | 无          |        0 | [Run 36083780549 / 1](https://gchust.github.io/nb3-factory/reports/issues/297/runs/36083780549/attempt-1/report.json) |
| #296  | delivered | completed             | 无          |        0 | [Run 36083777325 / 1](https://gchust.github.io/nb3-factory/reports/issues/296/runs/36083777325/attempt-1/report.json) |
| #295  | delivered | completed             | 无          |        0 | [Run 36083773382 / 1](https://gchust.github.io/nb3-factory/reports/issues/295/runs/36083773382/attempt-1/report.json) |
| #294  | delivered | not-reviewed          | 无          |        0 | [Run 36083769481 / 1](https://gchust.github.io/nb3-factory/reports/issues/294/runs/36083769481/attempt-1/report.json) |
| #293  | failure   | completed             | 无          |        0 | [Run 36083765404 / 1](https://gchust.github.io/nb3-factory/reports/issues/293/runs/36083765404/attempt-1/report.json) |
| #292  | delivered | completed             | 无          |        0 | [Run 36083761251 / 1](https://gchust.github.io/nb3-factory/reports/issues/292/runs/36083761251/attempt-1/report.json) |
| #289  | delivered | not-reviewed          | 无          |        0 | [Run 36080629632 / 1](https://gchust.github.io/nb3-factory/reports/issues/289/runs/36080629632/attempt-1/report.json) |
| #285  | delivered | not-reviewed          | 无          |        0 | [Run 36023095983 / 1](https://gchust.github.io/nb3-factory/reports/issues/285/runs/36023095983/attempt-1/report.json) |
| #284  | delivered | completed             | 无          |        0 | [Run 36017771111 / 1](https://gchust.github.io/nb3-factory/reports/issues/284/runs/36017771111/attempt-1/report.json) |
| #278  | delivered | completed             | 无          |        0 | [Run 35996374638 / 1](https://gchust.github.io/nb3-factory/reports/issues/278/runs/35996374638/attempt-1/report.json) |
| #277  | delivered | completed             | 无          |        0 | [Run 35996341913 / 1](https://gchust.github.io/nb3-factory/reports/issues/277/runs/35996341913/attempt-1/report.json) |
| #276  | failure   | completed             | 无          |        0 | [Run 35996323858 / 1](https://gchust.github.io/nb3-factory/reports/issues/276/runs/35996323858/attempt-1/report.json) |
| #275  | delivered | completed             | 无          |        0 | [Run 35996299745 / 1](https://gchust.github.io/nb3-factory/reports/issues/275/runs/35996299745/attempt-1/report.json) |
| #274  | delivered | not-reviewed          | 无          |        0 | [Run 35996277254 / 1](https://gchust.github.io/nb3-factory/reports/issues/274/runs/35996277254/attempt-1/report.json) |
| #269  | delivered | not-reviewed          | 无          |        0 | [Run 35985164279 / 1](https://gchust.github.io/nb3-factory/reports/issues/269/runs/35985164279/attempt-1/report.json) |
| #264  | delivered | not-reviewed          | 无          |        0 | [Run 35975290366 / 1](https://gchust.github.io/nb3-factory/reports/issues/264/runs/35975290366/attempt-1/report.json) |
| #256  | delivered | not-reviewed          | 无          |        0 | [Run 35968107683 / 1](https://gchust.github.io/nb3-factory/reports/issues/256/runs/35968107683/attempt-1/report.json) |
| #254  | delivered | completed             | 无          |        0 | [Run 35966684490 / 1](https://gchust.github.io/nb3-factory/reports/issues/254/runs/35966684490/attempt-1/report.json) |
| #253  | delivered | completed             | 无          |        0 | [Run 35966665643 / 1](https://gchust.github.io/nb3-factory/reports/issues/253/runs/35966665643/attempt-1/report.json) |
| #252  | delivered | completed             | 无          |        0 | [Run 35985523766 / 1](https://gchust.github.io/nb3-factory/reports/issues/252/runs/35985523766/attempt-1/report.json) |
| #251  | delivered | completed             | 无          |        0 | [Run 35966623377 / 1](https://gchust.github.io/nb3-factory/reports/issues/251/runs/35966623377/attempt-1/report.json) |
| #250  | delivered | completed             | 无          |        0 | [Run 35966607785 / 1](https://gchust.github.io/nb3-factory/reports/issues/250/runs/35966607785/attempt-1/report.json) |
| #244  | delivered | completed             | 无          |        0 | [Run 35950597846 / 1](https://gchust.github.io/nb3-factory/reports/issues/244/runs/35950597846/attempt-1/report.json) |
| #239  | failure   | completed             | 无          |        0 | [Run 35947585403 / 1](https://gchust.github.io/nb3-factory/reports/issues/239/runs/35947585403/attempt-1/report.json) |
| #232  | failure   | completed             | 无          |        0 | [Run 35934425542 / 1](https://gchust.github.io/nb3-factory/reports/issues/232/runs/35934425542/attempt-1/report.json) |
| #231  | delivered | completed             | 无          |        0 | [Run 35937838278 / 1](https://gchust.github.io/nb3-factory/reports/issues/231/runs/35937838278/attempt-1/report.json) |
| #224  | delivered | completed             | 无          |        0 | [Run 35881009045 / 2](https://gchust.github.io/nb3-factory/reports/issues/224/runs/35881009045/attempt-2/report.json) |
| #222  | failure   | not-reviewed          | 无          |        0 | [Run 35880390370 / 1](https://gchust.github.io/nb3-factory/reports/issues/222/runs/35880390370/attempt-1/report.json) |
| #216  | delivered | legacy/no-buildReview | 无          |        0 | [Run 35874919352 / 1](https://gchust.github.io/nb3-factory/reports/issues/216/runs/35874919352/attempt-1/report.json) |
| #198  | delivered | legacy/no-buildReview | 无          |        0 | [Run 35867866586 / 1](https://gchust.github.io/nb3-factory/reports/issues/198/runs/35867866586/attempt-1/report.json) |
| #195  | delivered | legacy/no-buildReview | 无          |        0 | [Run 35846040277 / 1](https://gchust.github.io/nb3-factory/reports/issues/195/runs/35846040277/attempt-1/report.json) |
| #193  | delivered | legacy/no-buildReview | 无          |        0 | [Run 35837293079 / 1](https://gchust.github.io/nb3-factory/reports/issues/193/runs/35837293079/attempt-1/report.json) |
| #188  | delivered | legacy/no-buildReview | 无          |        0 | [Run 35820974260 / 1](https://gchust.github.io/nb3-factory/reports/issues/188/runs/35820974260/attempt-1/report.json) |
| #184  | delivered | legacy/no-buildReview | 无          |        0 | [Run 35740540302 / 1](https://gchust.github.io/nb3-factory/reports/issues/184/runs/35740540302/attempt-1/report.json) |
| #182  | failure   | legacy/no-buildReview | 无          |        0 | [Run 35739961291 / 1](https://gchust.github.io/nb3-factory/reports/issues/182/runs/35739961291/attempt-1/report.json) |
| #177  | delivered | legacy/no-buildReview | 无          |        0 | [Run 35717386420 / 1](https://gchust.github.io/nb3-factory/reports/issues/177/runs/35717386420/attempt-1/report.json) |
| #165  | delivered | legacy/no-buildReview | 无          |        0 | [Run 35715353279 / 1](https://gchust.github.io/nb3-factory/reports/issues/165/runs/35715353279/attempt-1/report.json) |
