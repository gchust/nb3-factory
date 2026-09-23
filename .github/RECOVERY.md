# 模型故障与失败任务恢复

模型请求失败不等于业务验收失败。Factory 不通过放宽验收、无限重跑整个 Agent、自动换模型来掩盖外部服务故障。

## 请求重试

Pi 适配器显式配置原生请求级重试：最多 6 次，退避等待为 5、10、20、40、60、60 秒；SDK/provider 重试保持 0，避免两层重试相乘。正常请求没有额外等待。此上限按 Pi 的一次可重试请求计算，不是整个任务只能重试六次，也不是把整轮搭建执行六次。Runner 预算与 idle watchdog 继续生效。

配置依据：固定版本 [Pi 0.86.1 settings / Retry](https://github.com/earendil-works/pi/blob/v0.86.1/packages/coding-agent/docs/settings.md#retry)。其他引擎沿用各自原生重试策略，不冒充支持 Pi 参数。

`agent*.jsonl.result.json` 保留最终状态，并增加：

```json
{
  "retryAttempts": 6,
  "failure": {
    "category": "provider_unavailable",
    "retryable": true
  }
}
```

`retryAttempts` 是当前 Pi invocation 中已观察到的原生重试事件总数，不是业务修复轮数；其他未报告该信息的引擎不填零。成功恢复后的 invocation 不保留最终失败分类。缺少旧版计数时，报告显示“未采集”。

分类包括 provider_unavailable、rate_limited、network_error、auth_configuration、quota_exhausted、agent_failure。只解释 Agent 协议中的最终调用错误，不扫描业务工具输出给任务定性。`503 auth_unavailable` 表示服务链路当前没有可用认证资源，不能据此断言调用者的 API Key 配错。`retryable` 是排查与恢复提示，不触发无限重跑。

失败 Issue 评论与 HTML 报告直接使用脚本采集的诊断，不依赖 Agent 写出 `retro.json`；公开摘要不复制原始 provider 错误正文。

## 从已有改动继续

在 **Actions → Code Agent NocoBase Task → Run workflow** 填写：

| 输入 | 含义 |
| --- | --- |
| `issue_number` | 原任务 Issue 编号，Issue 需要保持打开 |
| `recovery_run_id` | 需要恢复的已失败任务 Run ID；留空沿用普通搭建行为 |
| `recovery_base_sha` | 仅旧版 checkpoint 需要：原应用工作区的完整基线 SHA |

恢复前先排除服务/配置问题。仅支持仍存在 `factory-task-N` 与 `factory-handoff-N` 产物、并保存失败/阻塞阶段的任务。Artifact 的默认保留期为 14 天。取消、成功交付、已经进入 done 的终验/发布失败不走此恢复入口。旧版且未记录运行身份的多 attempt 产物不猜测归属。

```text
手动指定失败 Run
  → 核对来源 Run、Issue、输入、patch hash、control SHA
  → 核对原应用 base SHA 与当前分支，拒绝覆盖后续工作
  → 为旧失败产物补齐交接协议（不修改原 Artifact）
  → 固定原版本的 Factory 执行代码
  → 应用已有 patch，恢复 implementation / repair / QA 阶段和计数
  → 继续实现或修复 → 完整 QA → 独立 verify-final → PR
```

新增任务将原应用 `applicationBase.ref/sha` 和 Run/attempt 写入任务元数据，恢复通常只需前两个输入。旧版没有记录应用基线时必须显式填写，不从 `run.head_sha` 猜测；那个 SHA 可能只表示工厂控制代码，和应用分支不同。可在原 Agent Job 的 **Check out application base** 步骤确认其 checkout commit。

例如 #182 的来源 Run 是 `35739961291`，其旧产物没有 `applicationBase`，还需按原 checkout 日志提供 `recovery_base_sha`。本改动本身不会触发 #182 重跑或修改其业务代码。

恢复不会升级原任务固定的 control SHA。因此，旧任务恢复仍沿用原版 Agent 配置（包括原版 Pi 的重试次数）；新建任务才自动采用本次新重试默认值。工作流入口中的恢复协议可补齐旧失败产物缺少的 `handoff.json`，但不会替换其实现、修复或 QA 脚本。

恢复的是代码和阶段，不是原生 Agent 会话、SQLite 数据库、浏览器或已通过的截图结论。恢复后的实现提示仅说明已有未验收的改动，不注入旧日志全文或独立 QA 用例。验收阶段按既有规则重建环境，最终仍须全量 QA 与独立验证。输入、分支或校验值不一致时明确停止，不能静默升级、覆盖分支或跳过检查。

## 回归测试

```bash
node --test --test-concurrency=1 .github/scripts/tests/*.test.mjs
python3 .github/scripts/tests/browser-fixtures.test.py
python3 .github/scripts/tests/preview-dns-sync.test.py
```

专项测试使用真实本地子进程和 Git 仓库模拟临时/持续 503、401、模型错误但 CLI exit 0、重试后的成功、旧 checkpoint、版本固定、输入/分支变更、恢复后的验收阶段与报告。它们不调用真实模型，不代表外部模型服务已经恢复。
