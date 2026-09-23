# 评论用量与跨阶段指标

归档内的 `metrics.json` 保存逐调用 ID、实际执行器/版本/模型、Prompt 与上下文哈希，以及规范化结果中真实报告的用量。历史索引分别展示实现、修复、QA 与评论问答；不改写已有业务 HTML 报告，问答完成也不意味着业务交付成功。

同一 Job 中按调用 ID 去重；跨 run/attempt 的复用 Job 只计一次，补发保留更完整的已报告指标。调用时长之和不是流水线墙钟时间，Token 是 CLI 已报告用量而非账单。未报告字段为未知，不补零；真实报告的零保留，未暴露的子任务用量继续标不完整。启动设置失败不算模型调用。

已发现调用数不是可以推断出的全部预期调用数；另列应调用 Agent 却没有调用记录的 Job。归档完整性、用量完整性与业务通过是独立结论。

跨轮成本累计只表示本执行 Issue 的工作量，不据此比较不同模型或基线的通过率。比较键使用已记录的预设输入/评审版本、应用起始 SHA 和工厂 SHA；来源不明时比较键为 null。细分比较还须核对逐调用模型、执行器版本、Prompt 与上下文哈希。

超过评论容积的指标只保留在归档，明确标记未纳入评论累计，不静默截断计数。旧记录没有规范化结果时不根据可疑文本猜计费；留存来源仍按 [Agent History](AGENT_HISTORY.md) 的 run/attempt/Job/Artifact ID 约束。

```bash
node --test .github/scripts/tests/agent-metrics.test.mjs .github/scripts/tests/agent-history*.test.mjs
```
