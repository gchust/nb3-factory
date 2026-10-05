# 工厂耗时与验证

实现、修复、QA、报告修复、验证命令、归档分别记录耗时和退出码。`FACTORY_TIMINGS_FILE` 是 JSONL 输出，随 Agent / Final diagnostics 上传，并汇总到 Actions Summary。嵌套阶段不可相加为墙钟时间；排队与续跑间隔继续使用任务用量报告的端到端时间与执行时间区分。中断进程可能没有结束记录，应结合 Actions step 时间判断。

修复循环先对变更应用文件自动格式化，再执行格式检查与 Lint；修复轮优先重跑上次失败的静态检查，然后执行其余所有检查。任何失败都会阻止构建/验收，最终独立验证仍执行全套检查、迁移、Seed 和浏览器冒烟。业务 QA 仍逐项操作。完整业务 QA 失败后优先复测失败路径；复测通过后新建数据库再做完整业务验收，同一代码不重复构建。最终交付不能只依赖局部通过。

最终验证设置 `FACTORY_BUILD_TARGET=linux-x64`、`FACTORY_BUILD_NODE_VERSION=24`、`FACTORY_BUILD_ARCHIVE=1`，唯一一次构建带模板自带的 `--tar`，归档即被验收的同一份 dist；验证通过后只暂存上传，不再单独构建或调用应用内打包脚本（新版模板已不提供 `scripts/utils/pack-dist.mjs`）。

构建统一由官方 `@nocobase/app-cli` 提供。工厂只统计外层命令耗时，不修改官方构建源码，不注入依赖缓存、registry 复制或裁剪补丁。最终验证使用新 runner，不复用实现 Agent 的 dist 或生产依赖目录；安装与目标平台处理由官方 CLI 负责。

QA 使用 `$FACTORY_BROWSER_REPORT_TOOL` 的 check 子命令逐项验证字段与 PNG 并保存观察；finish 运行原有完整校验器。即时校验与最终校验共享同一检查项验证函数，不自动生成成功结论，也不省略最终独立校验。

## Runner 时间

只有 Agent Job 完整检出应用历史（`fetch-depth: 0`），供 Agent 用 `git log` 查看模板与先前轮次的变化。终验、发布（含失败发布）和失败预览打包只检出 `base_sha` 一个提交：补丁带完整 blob id，`apply-patch.mjs` 只需要基线树；发布推送的父提交远端已有，`--force-with-lease` 明确写出期望的远端值，不依赖跟踪分支。

Agent Job 照常上传完整的 `factory-agent-N`（报告、复盘、用量、历史和诊断读取它），以及交接/失败时的 `factory-handoff-N` 检查点。另外上传小的 `factory-patch-N`：`agent.patch`、`change-summary.json`、`task-metadata.json`、`pipeline-state.json` 和各次调用的 `agent*.jsonl.result.json`。verify-final、publish / publish-failed、preview-build-failed 和 report-failure 只下载它，不再下载完整日志、截图和录屏。

`framework-fix.yml` 与 `source-baseline.yml` 安装整个 nocobase3 monorepo 时，用 `actions/cache/restore` 按锁文件哈希和 pnpm 版本恢复 pnpm store，安装成功后先 `pnpm store prune` 再用 `actions/cache/save` 立即保存：框架修复保存发生在 Agent 启动前，源码基线保存发生在本地 registry 和冒烟应用写入 store 之前。应用任务的安装仍按上文由 setup-node 缓存，源码基线任务的应用安装不进共享缓存。

测量优化效果时固定同一依赖基线与任务，比较实际构建耗时、实现与 QA 修复次数和首次通过率；不要仅凭日志估算提速。

## Prompt 与输出

开发 Agent 做相关自测，固定全套检查由流水线执行；修复 Prompt 仅携带业务目标和失败诊断，不重新嵌入整套开发、复盘规则。复盘不强制凑建议。QA 报告修复使用当前报告和简短诊断继续，同一截图可兼作业务证据与展示素材。

`FACTORY_QA_THINKING` 可单独设置 QA 思考强度，留空保持现有配置。没有做真实模型对照试验前，不宣称提速或节省百分比。当前没有启用跨进程模型原生会话恢复：QA 通过保留的浏览器、报告、证据和简短续接 Prompt 恢复进度。
