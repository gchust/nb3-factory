# 独立评审与条件验收

## 运行独立代码 / Skill 评审

在带 `factory:manual` 标签的维护 Issue 中，由仓库 owner 发一条独立命令：

```text
/factory-review <执行 Issue 号> <已交付的搭建 Run ID> <attempt>
```

或在 Actions 手动运行 **Independent code and Skill review**。不能在普通业务 Issue
发这个命令；不会从每个 F00/S01 自动调用模型。复用当前选择的 Code Agent 执行器，
但使用独立调用、独立上下文、只读任务及独立计量，不宣称换了另一模型提供商。

```text
固定来源 Run/attempt 的 task + agent + final 产物
  → 冻结 reviewCriteria + 真实交付 PR head SHA + 评审器 SHA
  → 独立评审 Job，只读取应用/相关 Skill/原运行证据
  → 另一个干净 Job 重新验证原始输入、源码行号和文件/Skill 哈希
  → Issue 逐项结论 + Release 长期交互归档 + Actions 诊断
```

业务要求、浏览器验收和 review-only 仍分流。评审者不得修改应用、安装依赖、执行应用
脚本、启动服务、重搭业务或用新版本 Skill 替换原输入。检查到工作区变化或未完成调用
会失败。该限制不是 OS 沙箱：发布 Job 仍以原始输入与新的可信 checkout 校验数据，
不执行评审产物，也不给评审进程 GitHub 写权限。

评审 JSON 每个稳定 ID 恰好一项，分别记录 functionality、code、skillStatus、evidence；
允许 passed/failed/blocked/not_run/not_applicable/unknown。功能通过需要运行证据，
代码通过需要真实源文件与行号，Skill 通过需要对应文件 SHA-256 和条款。只有 import、
菜单或作者自述不构成模块使用证据。哈希/行号校验通过只说明引用存在，不保证评审者
的语义判断正确。缺读取日志只能说证据不足，不能推断作者未读。

无法绑定原交付、缺冻结评审标准、证据过期或 PR 已经改变时明确失败，不改读最新内容。
独立评审失败不重跑业务，不改写业务验收结果。评论只展示已校验的评审者结论。
每次评审的规范化 `.result.json` 和 timing 单独留存，旧业务总量不会被混入。长期归档
失败会留下 Artifact 退路与明确发布失败，不能标成日志已全部长期保存。

## 独立 HTTP 验收

已由 `required-checks.mjs` 接入任务前置门禁与独立终验。预置 #206/#207/#208 的必需检查来自受信任目录；缺夹具时不执行付费搭建。边界和扩展方法见 [评测可靠性](EVALUATION_RELIABILITY.md)。

`integration-checks.mjs api <plan.json> <result.json>` 是不调用模型的独立执行器。
plan 必须由测试准备提供，并绑定当前被测应用 SHA；浏览器 QA 不能临时造接口或密钥。
准备器在隔离、一次性数据库中创建两个设备记录和只读集成密钥，通过环境变量注入
`FACTORY_TEST_API_KEY`、`FACTORY_TEST_ADMIN_KEY`，密钥不写 plan 或公开输出。

```json
{
  "version": 1,
  "kind": "api-key",
  "authentication": "x-api-key",
  "applicationSha": "<40 位实际被测提交，由准备器核验>",
  "baseUrl": "http://127.0.0.1:13000",
  "read": {
    "path": "/<本轮实际设备列表接口>",
    "itemsPath": ["data"],
    "idField": "id",
    "expectedIds": ["<准备记录 ID>"]
  },
  "write": {
    "path": "/<本轮实际设备创建接口>",
    "method": "POST",
    "body": { "name": "isolated-test" }
  },
  "revoke": {
    "path": "/<本轮实际撤销该测试密钥接口>",
    "method": "POST",
    "body": {}
  }
}
```

这是契约示例，不是 NocoBase 固定路由。准备器必须按本轮实际模块/API 填写，不能猜测。
执行器只允许 loopback 目标，先验证全部请求计划，再执行 A01 有效密钥读取预置记录、
A02 同一密钥写入被拒绝、A03 管理员实际撤销后原密钥读取被拒绝。HTML 200、无效密钥
导致所有请求失败、或仅返回撤销成功但密钥仍可用均不能通过。输出含时间、HTTP 状态、
响应哈希，不回显密钥和业务正文。HTTP 墙钟计时独立于模型用量，结果注明未调用模型。

测试准备与应用启动由显式选择该专项的调用方提供；缺正确计划/运行应用/密钥时不得
把模块标成通过。原来的 M05 浏览器检查只证明密钥页面操作和结构页面，不能覆盖 A01–A03。
执行器自测的 HTTP 服务是检查器夹具，不是 NocoBase API Keys 模块端到端通过证明。

## 条件测试环境

```bash
node .github/scripts/integration-checks.mjs preflight ai ai-preflight.json
node .github/scripts/integration-checks.mjs preflight notification notification-preflight.json
```

AI 要求独立 `FACTORY_BUSINESS_MODEL`、`FACTORY_BUSINESS_API_KEY`、
`FACTORY_BUSINESS_MODEL_ENDPOINT`，已知搭建凭据不得重用。外部通知要求
`FACTORY_TEST_CHANNEL` 和隔离接收端 `FACTORY_TEST_RECEIVER_URL`。
预检只返回 ready/blocked，ready 不是实调/实投成功。未配置不发请求，退出 20 并记录
缺失的变量名；不影响普通搭建。真实 AI/外部接收证据由该测试环境独立返回并归档，
不能靠固定文字或一次 send 返回值替代。现有确定性 PNG/DOCX/损坏文件夹具继续复用。

```bash
node --test .github/scripts/tests/independent-review.test.mjs \
 .github/scripts/tests/integration-checks.test.mjs \
 .github/scripts/tests/reply-completion.test.mjs
```
