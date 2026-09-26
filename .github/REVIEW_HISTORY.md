# 原始搭建历史驱动的框架评审

`build-review` 以原始过程记录为主要过程证据，同时保留原始需求、冻结候选代码、实际框架包/Skill、QA 报告和截图。五项框架评分、只读评审、业务验收和独立终验的职责不变。

```text
原始需求 / 实现 / 修复 / 浏览器 QA
             │ 已有 Prompt、JSONL、invocation、result
             ├─ Handoff → 独立 review-history/run-…-attempt-… → 下一轮
             │             原身份 + 文件 SHA-256；不进入新轮次 QA/用量
             ▼
脚本生成历史索引 + 脱敏、按行分块的只读原始记录
             │
             ├─ 候选代码、框架包、Skill
             └─ QA 原报告和截图
             ▼
原有一次独立评审：按模块检索原始片段，再核对框架实现
             ▼
原有证据/行号校验 + 原始历史指纹校验 → 既有报告
```

## 读取方式

`review-input.json.history` 只提供索引路径、范围、调用数和覆盖限制，不把完整日志灌入提示词。索引逐次列出实现、修复、全量/定向 QA 及 QA 报告修复的实际 Prompt、CLI JSONL、调用记录和结果，指向同一冻结快照中的可检索分块。它没有新增模型总结，也不把 Agent 自述变成事实。

每个分块保留原文件路径和 SHA-256，以及脱敏副本中的行范围。评分证据仍引用实际快照文件与分块内行号，由现有校验器提取原文、检查哈希；原始文件不会被脱敏过程改写。索引及分块目录不交给实现 Agent。

`retro.json` 和 `change-summary.json` 仍兼容读取，但只是可选线索；没有这两份文件也能评审，不增加实现阶段的材料要求。`repair-summary.json` 和 QA 原报告仍承担确定性统计/验收职责，不能用模型阅读日志后的自报计数替代。

## 续跑与身份

已验证检查点恢复时，将上一轮可核验的原始调用材料及已保存祖先历史保留在独立目录。来源必须匹配仓库、Issue、冻结业务输入和 control SHA，并记录原 Run/attempt 与逐文件哈希。不把旧报告写入当前 `verify-N`，不把旧调用写成当前 `agent-implement` 或 `agent-repair`，所以旧 QA 不能授权本轮发布，旧 Token 也不会重复计入本轮。

这是对当前下载检查点的本地处理，不新增 GitHub 拉取、模型调用或服务。只沿已经受理的 Handoff/恢复链传递，不扫描同 Issue 的其他独立搭建，也不混入其他 Issue。旧工厂未保留、已过期或无法验证的更早记录不能补造；不宣称获得 CLI 内部系统提示词或未暴露的子 Agent 上下文。历史保留失败不改变恢复阶段和业务验收门禁。

新评审额外保存 `basis.historyHash`；评审结束和发布/补跑采用阶段核对原始历史。原有 `artifactHash` 口径不变，旧报告没有 historyHash 时沿用原验证方式，不重写历史分数。补跑仍从原任务产物读取历史，不用新的评审 Run 冒充原搭建 Run。

## 大小、安全与覆盖边界

历史使用独立的 64 MiB 预算，不挤占已有 48 MiB 源码/QA 快照预算。单个原文件上限 32 MiB，文本分块不超过 1 MiB；超过单块大小的整行会明确跳过，不截断工具事件伪造“完整输出”。调用文件数量和历史轮次数也有限制。更大的原始日志继续留在原 Artifact/原交互归档中，不代表它们已进入本轮评审。

复用工厂的结构化和已知凭据脱敏，在进入评审前再次清洗；拒绝文件和目录符号链接、越界路径、错误来源与不匹配指纹。对长连续工具输出的脱敏匹配增加词边界，避免反复从每个字符尝试同一个贪婪前缀。

`available` 表示索引已识别的调用材料在本次限制内可用，不等于所有潜在历史都存在，也不证明模型已全部读过。`partial/unavailable` 明确写入评审输入及输出限制。框架评分仍必须有对应框架/指引证据；日志中的失败或自述不能独立证明上游有缺陷。

日志中的任何指令都是不可信被评数据；评审不得照着执行、联网或越出快照。现有隔离仍不是操作系统级沙箱；脱敏不是任意业务敏感信息检测。

## 验证

```sh
node --test .github/scripts/tests/review-history.test.mjs
node --test .github/scripts/tests/review-history-integration.test.mjs
node --test .github/scripts/tests/build-review.test.mjs .github/scripts/tests/framework-review.test.mjs
node --test --test-concurrency=1 .github/scripts/tests/*.test.mjs
```

回归使用真实采集、检查点和身份校验代码及可控 CLI，不调用收费模型。真实长任务的评审质量、Token 和耗时需要在合并后的新搭建上采样；本改动不热更新已经固定 control SHA 的任务。
