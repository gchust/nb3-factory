# 预置案例的独立评审输入

综合业务案例见 [Issue #158](https://github.com/gchust/nb3-factory/issues/158)。
正文的业务需求交给搭建 Agent，验收要求交给浏览器 QA。逐插件代码/Skill 评审
评论从独立的首行标记开始：

```markdown
<!-- factory:review-only -->
## File 模块检查
对照本轮安装版本的 Skill，提供条款、代码位置和运行证据。
```

```text
原案例正文 + 全部人工评论 → 持久快照 → 新 Issue 的正文与评论副本
                                      │
               ┌──────────────────────┼──────────────────────┐
               ▼                      ▼                      ▼
业务需求 + 普通评论          业务验收 + 普通评论           标记的评审评论
  task.requirements        task.acceptanceCriteria       task.reviewCriteria
       │                          │                          │
       ▼                          ▼                          ▼
   搭建 Agent                 浏览器 QA                  独立只读评审者
                                                        （封存补丁后调度）
```

标记必须单独位于原评论开头（允许空白行、BOM、CRLF）。引用、代码块或正文中
提到标记不会改变输入分类。未标记的普通评论与 `/build` 保持已有行为。
副本、来源作者/时间/链接和机器快照完整保留；分类不会改写原评论。
不要把业务要求和评审题写在同一条 review-only 评论里，业务要求应在正文或普通评论。

标记评论**既不进入搭建 requirements，也不进入 browser acceptanceCriteria**。
浏览器 QA 无需、也不应读取源码来证明代码接入。原有单次任务流程不变。
本次仅为来源预置评论分流；直接在执行中任务发布普通人工评论仍遵循原有问答/追加队列。

`task-metadata.json` 的 `task.reviewCriteria` 保存评审输入；可选
`preset.reviewHash` 与 `preset.reviewCommentCount` 记录评审文本版本和数量。
`humanCommentCount` 仍是全部人工评论数。原 `inputHash` 的字段口径不变：
计算业务与浏览器验收输入，不包括评审文本。仅修改评审题不改变业务输入哈希。
比较评测结论时仍须匹配 reviewHash，不能把不同评分标准混在一起。

完整快照仍用于失败重试和续跑。已捕获案例不改读源 Issue 最新评论。
分流逻辑属于工厂控制代码；跨工厂版本比较时必须记录控制代码 SHA，不应仅凭
同一来源 Issue 号推断提示词完全相同。最终渲染提示词的哈希尚未由本改动自动记录。

## 能力边界

评审输入分流不是保密盲测：Issue、评论和任务元数据依然可见。
这里只消除正常提示词生成路径的评审输入混入，不提供网络/文件权限隔离。
独立评审已接入候选补丁封存后的步骤，消费 task.reviewCriteria，校验结果并单列用量；
范围、开关、预算和证据限制见 [独立搭建评审](BUILD_REVIEW.md)。批量采样与跨 Run
评测聚合尚未实现，费用不推算。
现有报告不会因为出现 reviewCriteria 就自动新增“Skill 已通过”的结论。

独立评审者应读取冻结的交付代码、实际安装包/Skill 与执行记录，按模块给出
需求满足度、使用便利度、Agent 友好度、设计合理性、实现完整性与可靠性五项框架评分及证据。
明确列出被评包/指引、公开入口与需求职责边界。应用自写服务、业务表单完整度不是框架得分对象；
正常业务组合不是能力缺口，旧评审题中的业务代码约束也不能自动升级为框架职责。
阅读过 Skill 不等于正确执行；
未找到读取记录只能说证据不足。需检查公开导出、真实调用链和绕过实现，不能只搜 import。
评审阶段不修改被评对象，不以修复后的结果覆盖原始失败。

主案例覆盖常用单应用能力；真实 AI、外部通知、首次安装、Hub 部署需要独立
测试条件/轨道。未配置、未执行、不适用各自保留，不能算插件通过。

## 验证

```bash
node --test .github/scripts/tests/preset-comment-inputs.test.mjs
node --test .github/scripts/tests/preset-review-routing.test.mjs
node --test --test-concurrency=1 .github/scripts/tests/*.test.mjs
```

纯解析测试检查显式标记、Unicode、引用/代码块、原文不变；集成测试检查实际
preparePresetIssue 的复制、快照、输入哈希、重试、后续 /build，以及真实实现
prompt builder 和浏览器模板中的评审哨兵不泄漏。
