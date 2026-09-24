# 评测结果导出、归档与接收端对接

工厂在每个已接单的搭建 Run 结束后，把**已有**事实与独立评审转换成版本化的外部结果
（Evaluation Report v1），独立归档，并可选投递给实现同一协议的接收端（例如 Test Manager 3）。
这是本项目拟定的最小协议，不是行业标准，也不代表任何接收端已经实现。

```text
搭建 Run 结束 → Report Task Usage（原有：用量 / HTML / report.json）
                   │ 纯数据转换，不调用模型
                   ▼
            evaluation.json + 证据截图 + report.html
                   │ 按 run.key 分配修订（CAS）
                   ▼
   gh-pages evaluations/（原始字节 + 清单 + 修订索引）   Artifact：evaluation-bundle.zip（90 天）
                   │ 仅当 FACTORY_EVALUATION_DELIVERY=true
                   ▼
   Deliver Evaluation Results → POST <EVALUATION_ENDPOINT> → 回执（脱敏）写回 outbox
```

## 边界

- **不新增评分或复盘模型调用。** 框架评分、发现与证据来自已通过校验的 `build-review.json`
  （含只补跑评审的 `build-review.supplement.json`）；缺失就标记未知或受限，不重新总结。
  重评只能走现有 **Reassess Build Quality**；补发与重渲染没有模型用量。
- 结果协议是归一化公共 DTO；接收端不需要解析 `verify-*` 目录、工厂日志、Issue 模板或 Agent 事件。
- 工厂不输出、不调用管理端的 `featurePointId`、`problemId`、负责人或状态变更；不创建、指派或关闭管理端问题。
- 投递失败或接收端下线不改变业务验收、PR、QA 或修复，也不阻止评测批次推进。
- 两个仓库不共享数据库或业务源码；Schema 使用本仓库固定文件，不在运行时下载。

## 运行身份与修订

| 操作 | `run.key` | 执行记录 `executions` | 报告修订 `revision` |
| --- | --- | --- | --- |
| 新 Issue 从干净基线搭建（含批次样本） | 新 key | 新实现链 | 从 1 开始 |
| 同一 Issue 的 Handoff / 失败恢复 | 不变 | 追加 `continuation` / `recovery` | 新事实形成后增加 |
| Actions 重跑同一 Run（attempt+1） | 不变 | 追加 `rerun-attempt`，同一 Agent 作业不重复计量 | 同上 |
| 重新派发同一 Issue 的普通搭建 | 不变 | 追加 `restart`；需要独立样本请新建 Issue | 同上 |
| 原 Issue 追加 `/build` | 新 key，`kind=incremental` | 独立历史 | 从 1 开始 |
| 对冻结业务只补跑评审 | 不变 | 追加 `review`（独立用量） | 新修订；旧评审保留 |
| 原包补发 | 不变 | **不新增** | **保持原修订与原字节** |

键空间（在受信任 prepare 阶段写入 `task-metadata.json` 的 `evaluation`，由后续阶段校验）：

```text
<owner>/<repo>/issues/<Issue>/initial
<owner>/<repo>/issues/<Issue>/build/<buildCommentId>
<owner>/<repo>/batches/<batchKey>/<caseKey>/<sampleIndex>
```

旧任务没有记录时只由已校验的仓库、Issue 与 `/build` 评论推导（`run.identity=legacy-derived`）；
缺少任务元数据时为 `unresolved`，只描述该次执行，不与其他执行合并。每条用量回执另存
`evaluation` 事实（run.key、控制 SHA、应用基线、输入哈希、上一 Run），用于在 Artifact 过期后关联执行链；
早于该字段的回执计入 `legacy-executions-unresolved`，控制代码、输入或基线不一致的同键回执计入 `chain-mismatch`，二者都不合并。

**修订分配**：导出器对归一化事实、所选评审身份和证据附件的逻辑哈希计算指纹（排除修订号、创建时间、
导出器 Run、HTML 渲染）。受信任的 `evaluation` 作业读取 `gh-pages` 的
`evaluations/subjects/<sha256(key)[:32]>/index.json`：相同指纹复用已登记修订与**原始字节**
（`createdAt` 不变），不同内容取下一个连续编号，以非强制 ref 更新（CAS）提交；竞争失败会重新读取，
同一修订号出现不同内容时拒绝写入。结果包在登记前先上传，登记只引用已存在的 Artifact。

**当前视图不是最大修订号。** 修订号只是归档顺序；`precedence` 给出比较事实：

1. `producer`（产出执行的开始时间、Run、attempt）更晚者优先；`knownLaterExecutions > 0` 表示更晚的执行已存在。
2. 同一产出执行：`reviewRubric` 高者优先（v2 > v1），再比较评审完整性（completed > partial > failed > not-reviewed）与 `qaCoverage`。
3. 以上相同时取较大修订号。

迟到的旧产出（例如先交付的续跑报告之后才补发的第一段报告）会得到新修订号但不成为当前视图，
见 [`report-late-older.json`](contracts/examples/report-late-older.json)。工厂在修订索引中记录 `current`，
接收端应按同一规则自行判断。

## Evaluation Report v1

Schema：[`contracts/evaluation-report.v1.schema.json`](contracts/evaluation-report.v1.schema.json)。
`schemaVersion` 是协议主版本，与评分口径版本无关；未知字段一律拒绝，新增可选字段需先更新本文档与 Schema 的次版本说明，
语义冲突必须升主版本。所有未知事实为 `null`，真实的零才是 `0`。

| 字段 | 含义与来源 |
| --- | --- |
| `source` | `producer=nb3-factory`，`instance`/`project` 为仓库标识；`exporter` 记录导出器版本、控制 SHA 与报告 Run（不参与指纹） |
| `run` | `key`、`kind`（initial / incremental / batch-sample）、`identity`（recorded / legacy-derived / unresolved）、批次与案例键、任务 Issue / `/build` 评论、冻结预置输入的 `inputHash` / `reviewHash` |
| `revision` / `createdAt` | 同一 `run.key` 的归档修订与该修订首次形成时间；补发不刷新 |
| `baseline` | 应用基线与候选补丁哈希 / 交付 head、实际 `controlSha` 与入口工作流 `entrySha`（二者可以不同）、模板与创建器版本、锁文件、已安装 `@nocobase/*` 包、Skill 指纹、源码快照、输入与各次调用的**提示词指纹**、评分口径、引擎 / 模型、浏览器夹具 |
| `executions` | 关联执行，有稳定 `key`、`kind`、顺序、事件与上一 Run；只补跑评审为 `kind=review` |
| `outcome` | 分开表示：`execution`（running / completed / cancelled / timed-out / budget-exhausted / blocked / unknown）、`acceptance`（passed / failed / blocked / not-run / unknown）、`delivery`（published / not-published / unknown）；`completed` 只表示执行终结 |
| `qa` | 各轮全量 / 定向记录与逐项状态、`firstFull` / `finalFull`、逐条验收的首轮与终轮、`firstPassWithoutRepair`、本执行与跨链累计的验证 / 修复次数 |
| `reviews` | 每次真实评审一条；可同时有 v2 与旧口径 v1、被替代或未通过校验的评审（无分数） |
| `processNotes` | 可选 `retro.json`，明确为实现者自述；`absent` 不代表没有问题 |
| `metrics` | 按唯一来源键（`agent-job:<id>`、`review-run:<run>:<attempt>`）的用量、作业时长与端到端时长、业务搭建数（恒为 1）、评审执行数 |
| `evidence` | 标准化证据：带作用域的 id、原始出处、行号、文件哈希、脚本提取的摘录（再经密钥清洗）、附件路径或仅引用说明 |
| `links` | Issue、Run、PR、gh-pages 固定报告路径；辅助信息，不作身份 |
| `limitations` | 受限说明，`code` 为稳定机器码（如 `first-round-unavailable`、`review-partial`、`evidence-omitted`、`legacy-executions-unresolved`、`later-executions`、`usage-incomplete`、`baseline-unknown`） |

### 评审、模块与发现

- `reviews[].key` 形如 `review/<评审 Run>.<attempt>/v<口径>-<输入哈希前 12 位>`，是该次真实评审的身份；
  `modules[].key`、`findings[].id`、`evidence[].id` 都带这个前缀（QA 截图为 `qa/<轮次>/<文件>`），两次评审同为 `F1`、`E1` 也不会互相覆盖。
- `rubric` 给出口径 id（`nb3-framework`）、版本、实际维度与满分 100。v2 为五项：`requirementFit`、`usability`、
  `agentFriendliness`、`design`、`reliability`；v1 四项原样保留（`design`、`completeness`、`agentFriendliness`、`outputQuality`），
  不改名、不映射、不跨口径平均。非空分数都有理由和证据；`null` 表示未使用、未执行、不适用或证据不足。
- 业务界面观察在 `ui`，`framework=false`，不属于框架维度。
- `modules[].subjectKeys` 只来自已校验 targets：`pkg:@nocobase/<包>`、`guide:@nocobase/<包>/<docs|skills 路径>`、
  `skill:<同步 Skill 名>`、`guide:app/AGENTS.md`。无法规范化时 `mapping=pending` 并保留原始 targets；不要用中文模块名当身份，也不要猜功能点。
- `findings[].confidence=confirmed` 只表示**评审者**认为证据充分，导出为 `confirmedBy: "reviewer"`，不是人工确认；
  `reviewerStatus` 是评审时的看法（open / resolved / unknown / not-applicable），不能直接当成管理端问题已关闭。
  发现只通过共享的已校验证据 id 关联模块与 `subjectKeys`，关联不到就留空。
- 工厂只对同一来源去重展示；跨运行根因归并与正式问题生命周期由接收端负责。

### 首轮与计数

“首轮 QA 通过”只来自第一次实际全量 QA。Handoff 续跑的产物不含第 1 轮时 `firstFull=unknown` 且 `qa.coverage=partial`；
只有失败路径复测时不推断全量通过。`firstPassWithoutRepair=yes` 还要求第 1 轮即全量通过且整条链没有工厂修复；
它不代表 Agent 开发中没有自测试错。`qa.counts.execution` 来自本执行的 `repair-summary.json`，
`qa.counts.chain` 来自跨 Handoff 的累计检查点 `pipeline-state.json`，二者不相加。

### 用量

复用 `task-usage` 口径：同一 Agent 作业被下游重跑复用只算一次，不相加已含逐调用记录的汇总，
思考 Token 不再加到输出；后补评审是独立来源 `review-run:*`，不增加业务搭建数。缺失为 `null` 并保留
`incomplete`，不等同供应商账单，不推算费用。

## 结果包

```text
evaluation-bundle.zip
├── evaluation.json      # 公共 DTO（evaluation-report 或 evaluation-batch）
├── manifest.json        # 其余每个文件的路径、用途、大小、SHA-256；不含自身
├── report.html          # 现有统一 HTML（可选）
└── evidence/verify-N/browser-(acceptance|focused)/*.png
```

清单 Schema：[`contracts/evaluation-bundle.v1.schema.json`](contracts/evaluation-bundle.v1.schema.json)。
ZIP 由工厂确定性生成：路径排序、固定时间戳（1980-01-01）、不压缩；相同内容字节相同。ZIP 自身的 SHA-256 在
`X-Evaluation-Bundle-SHA256` 与投递回执中，不写进包内。

| 上限 | 值 | 超出时 |
| --- | --- | --- |
| `evaluation.json` | 4 MiB | 导出失败并说明，不静默截断证据 |
| 单张截图 / 截图合计 | 10 MiB / 48 MiB | 以路径与哈希引用（`availability=reference-only`），并写 `evidence-omitted` |
| `report.html` | 32 MiB | 不随包附带，写 `report-html-omitted` |
| ZIP / 解包 / 文件数 | 64 MiB / 128 MiB / 2048 | 读取即拒绝 |

包内只有 DTO、清单、统一 HTML 与验收截图。不打包 `.env`、`config.yml`、Cookie、私钥、API Key、测试账号密码、
`node_modules`、完整插件源码或原始模型日志；源码证据是评审校验过的有限摘录（每条不超过 100 行）。
证据不可公开不等于问题不存在：未附带的证据保留原始路径与哈希，供有权限者在内部 Artifact 核对。
读取方拒绝绝对路径、`..`、反斜杠、盘符、重复路径、符号链接 / 特殊文件、加密、伪造大小、校验和不符与超限解压。

`gh-pages` 的 `evaluations/` 只保存脱敏元数据、每个修订的 `evaluation.json` / `manifest.json` 原始字节与修订索引，
与现有 `reports/` 同一分支、同样的非强制更新；它随 Pages 一起公开，内容不超过已公开的 `report.json`。
结果包本身只在 Actions Artifact（90 天，受仓库设置上限约束）。

## 工厂配置

| 配置 | 默认 | 用途 |
| --- | --- | --- |
| Variable `FACTORY_EVALUATION_EXPORT` | 未设置 = 导出 | 设为 `false` 即关闭导出与登记；原报告、Pages、用量不受影响 |

导出发生在 `Report Task Usage` 的 `report` 作业末尾（`continue-on-error`，只读权限），登记在独立的 `evaluation` 作业
（`contents: write`），与 Pages 作业并行、互不依赖；Pages 失败不影响登记，登记失败也不影响 Pages 与原评论。
每种已接单结束状态（交付、失败、取消、超时、Handoff）都会导出现有事实；只补跑评审经由同一可复用工作流形成新修订。

## 验证

```bash
node --test .github/scripts/tests/evaluation-report.test.mjs .github/scripts/tests/evaluation-bundle.test.mjs \
  .github/scripts/tests/evaluation-registry.test.mjs .github/scripts/tests/evaluation-contracts.test.mjs \
  .github/scripts/tests/evaluation-workflow-policy.test.mjs
node .github/contracts/render-examples.mjs --check
node --test --test-concurrency=1 .github/scripts/tests/*.test.mjs
```

样例完全虚构（`owner/factory`、零 SHA 等），由测试同一套夹具生成并在测试中逐字节比对，不代表真实案例成绩。
