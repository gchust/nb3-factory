# Code Agent 执行器

Factory 支持 `pi`（默认）、`codebuddy`、`claude-code`、`codex`、`opencode`。
选择仓库 Variable `CODE_AGENT_ENGINE`；未配置时仍用 Pi，原有 Pi/CodeBuddy
变量及 `PI_*` 工作流兼容映射保持不变。只会安装所选执行器。

## 职责与调用路径

```text
GitHub Actions（同一份执行环境配置）
  │
  ├─ install-agent.mjs ─ registry ─ adapter.install(version)
  │                                  └─ 安装、--version 核验、记录实际版本
  │
  └─ run-agent.mjs ─ registry ─ adapter.createInvocation(context)
                                  │ 配置、凭据、模型、参数、QA hook
                                  ▼
                            agent-harness.mjs
                                  │ 启动 / 日志 / 超时 / 终止 / Handoff
                                  ▼
                       pi / codebuddy / claude / codex / opencode
                                  │ 原生 JSON 事件
                                  ▼
                           adapter.parseEvent(event)
                                  │ 完成、失败、去重标识、规范化 usage
                                  ▼
                   原始 .jsonl + 统一 .jsonl.result.json
                                  │
                    task-usage / Agent History / 现有报告

Factory 独立负责：业务验证 → 修复 → 浏览器验收 → 最终验证 → 发布
CLI 调用完成 ≠ 业务验收通过。
```

模块导入没有运行副作用；读取注册表不会启动 CLI、读取凭据或写配置。
保持 `.mjs` 和 Node 内置模块，不引入 SDK、常驻服务或新 Agent 框架。

## 配置

| CODE_AGENT_ENGINE | 必需 Secret | 必需 Variable | 可选模型配置 |
| --- | --- | --- | --- |
| `pi` | `CODE_AGENT_API_KEY`、`CODE_AGENT_API_ENDPOINT` | `CODE_AGENT_MODEL` | 原有 `CODE_AGENT_API_TYPE`、`CODE_AGENT_THINKING` 等 |
| `codebuddy` | `CODEBUDDY_AUTH_TOKEN` 或 `CODEBUDDY_API_KEY` | `CODEBUDDY_MODEL` | `CODEBUDDY_BASE_URL`、`CODEBUDDY_THINKING`、`CODEBUDDY_INTERNET_ENVIRONMENT` |
| `claude-code` | `ANTHROPIC_API_KEY` 或 `CLAUDE_CODE_OAUTH_TOKEN` | `CLAUDE_CODE_MODEL` | `ANTHROPIC_BASE_URL`、`CLAUDE_CODE_EFFORT` |
| `codex` | `CODEX_API_KEY` | `CODEX_MODEL` | `CODEX_BASE_URL`（Responses API）、`CODEX_REASONING_EFFORT` |
| `opencode` | `OPENCODE_API_KEY` | `OPENCODE_MODEL`（内置 `provider/model`） | `OPENCODE_BASE_URL`、`OPENCODE_VARIANT` |

例如使用 Codex：设置 `CODE_AGENT_ENGINE=codex`、`CODEX_MODEL=<可用模型 ID>`，
添加 Secret `CODEX_API_KEY`。更换执行器不要求重建应用分支，也不改变任务的验收流程。
模型 ID 由账户可用模型决定，Factory 不在后台自动换模型或降级到其他执行器。
OpenCode 首版使用其内置 Provider；自定义 Provider 的 npm SDK 定义不在本次范围内。

原有 `FACTORY_QA_THINKING` 继续作用于 Pi/CodeBuddy。新增执行器使用自己的 QA 覆盖：
`CLAUDE_CODE_QA_EFFORT`、`CODEX_QA_REASONING_EFFORT`、`OPENCODE_QA_VARIANT`；
未配置时沿用各执行器的普通配置或 CLI 默认值，不把 Pi 的 `max` 强塞给其他 CLI。

公共超时仍为 `CODE_AGENT_INVOCATION_TIMEOUT_SECONDS`（默认 0，不限制单次调用）、
`CODE_AGENT_IDLE_TIMEOUT_SECONDS`（默认 600 秒）；五小时工作流预算和退出码 75 的
跨 Run Handoff 保持原样。空闲退出保留已有“交回部分工作区验证”的行为，结果标记
`stalled`，不伪装成完整调用。评论回复保持 900 秒上限。

## 安装与运行边界

各适配器声明自己的安装策略与固定版本：Pi `0.86.1`、CodeBuddy `2.150.0`、
Claude Code `2.1.278`、Codex `0.155.1`、OpenCode `1.18.32`。
对应覆盖变量为 `CODE_AGENT_VERSION` / `PI_VERSION`、`CODEBUDDY_VERSION`、
`CLAUDE_CODE_VERSION`、`CODEX_VERSION`、`OPENCODE_VERSION`。
覆盖必须为明确版本号；不同版本的 CLI 协议变化需要重新验证。

这些版本都使用 npm 分发，但通用安装器只执行适配器返回的安装步骤，不假设所有
执行器都是 npm 包。Claude Code/OpenCode 的固定 npm 包需要 postinstall 链接原生
可执行文件，因此只为这两个包启用安装脚本；Pi/CodeBuddy/Codex 继续忽略脚本。
安装后必须以 CLI `--version` 验证实际版本，工作流通过
`FACTORY_AGENT_INSTALL_RECORD` 把实际版本交给执行阶段。

工作流仅向选中的执行器提供凭据；子进程再次清除其他执行器的认证变量。
CLI 配置写到 runner 临时目录，不覆盖应用的 `AGENTS.md` 或复制整套 Skill。
公共 Prompt 要求按需阅读 `AGENTS.md` 和相关 Skill，而不是注入所有参考文档。
OpenCode 禁用项目配置自动加载，因此这条显式阅读指令同样重要。

此工厂在一次性 GitHub runner 上允许 Agent 编辑文件和执行开发命令，不弹交互
授权框。QA 防误杀沿用共享 `qa-guard-rules.mjs`：Pi extension、CodeBuddy hook、
Claude/Codex PreToolUse、OpenCode plugin。它防止 QA 意外执行 kill/pkill 等破坏
监督进程，不是操作系统安全沙箱。Codex 标记应用项目配置不可信，仅为 Factory
生成的 hook 显式启用本次运行的 hook trust；不能取消这个项目配置边界。

## 统一结果与用量

每次调用保留原始、脱敏的 `agent-*.jsonl`，另写同名 `.jsonl.result.json`：

```json
{
  "version": 1,
  "engine": "codex",
  "configuredVersion": "0.155.1",
  "actualVersion": "0.155.1",
  "model": "<selected-model>",
  "phase": "implementation",
  "status": "completed",
  "exitCode": 0,
  "measurements": [{"usage": {"input": 100, "output": 40, "cacheRead": 20, "totalTokens": 160}}]
}
```

状态为 `completed` / `failed` / `stalled` / `timed_out` / `handoff`；另外记录起止
时间、终止事件、解析不完整标志。上例仅说明结构，不代表真实调用。

规范口径：`input` 不含缓存，`output` 包含思考，`reasoning` 是 output 的子集。
Pi 按完成响应及压缩计数；CodeBuddy/Claude 按最终累计 result 计数，不叠加 assistant
快照；Codex 从 input 扣除缓存；OpenCode 把独立 reasoning 加回 output，以 part ID
去重，工具步骤完成不会提前终止整个调用。

不填不存在的 usage，不把未知当 0。Codex 未提供的 cacheWrite 等字段保持缺失；
OpenCode 的原生 CLI 不转发子任务的全部用量，检测到 task 工具时标记不完整。
所有数字是 CLI 已报告的用量，不是账单承诺。

统计优先读取统一结果，不再需要为新引擎增加分支；没有结果文件的历史 Pi/CodeBuddy
日志仍走原有解析。损坏结果不能静默回退为“完整统计”。原始记录和统一结果都进入
Agent History。已有报表和失败/交接流程继续使用原有 Factory 状态。

## 添加执行器

新增 `agents/<name>.mjs`，导出：

```js
export const installation = { version, versionEnv, command /* 安装元信息 */ };
export const credentials = ['THIS_ENGINE_API_KEY'];
export const install = (version) => [{ command, args }];
export function createInvocation({ workspace, prompt, agentDir, env }) {
  return { command, args, cwd: workspace, env, model, standardInput };
}
export function parseEvent(event) {
  return { complete, failure, measurements: [{ id, usage }] };
}
```

完成事件能可靠表示整次调用结束时返回 `complete`；失败是非空字符串，成功恢复可返回
`failure: null`。新一轮活动可返回 `active: true`。不要把工具步骤结束当调用结束。
以正常进程退出为结束依据的执行器声明 `completion = 'exit'`。
usage 的 `id` 标识同一累计样本，后续同 ID 替换而非相加；省略 ID 时按原始事件去重。
只有上下文压缩测量需要 `phase: 'compaction'`。

然后注册到 `agent-registry.mjs`，补充工作流共享 Secret 映射、QA guard、配置文档、
协议样本测试及 CLI 安装矩阵。不需要复制业务工作流或修改新格式的用量汇总器。

## 验证

```bash
node --test --test-concurrency=1 .github/scripts/tests/*.test.mjs
CODE_AGENT_ENGINE=codex node .github/scripts/install-agent.mjs
CODE_AGENT_ENGINE=codex node .github/scripts/agent-cli-smoke.mjs
```

`Factory regression tests` 跑完整控制面测试；`Agent CLI compatibility` 在 GitHub
runner 上分别安装五种固定 CLI 并检查真实 headless 参数，不提供 Secret、不调用模型。
协议测试使用模拟子进程，因此通过测试不等于已完成五家付费模型的真实业务搭建验收。

参考：
[Codex 非交互执行](https://developers.openai.com/codex/noninteractive/)、
[Codex Hooks](https://developers.openai.com/codex/hooks/)、
[Claude Code CLI](https://code.claude.com/docs/en/cli-reference)、
[OpenCode CLI](https://opencode.ai/docs/cli/)、
[OpenCode Plugins](https://opencode.ai/docs/plugins/)。
