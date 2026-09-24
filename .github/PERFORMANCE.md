# 工厂耗时与缓存

实现、修复、QA、报告修复、验证命令、构建子步骤、归档分别记录耗时和退出码。`FACTORY_TIMINGS_FILE` 是 JSONL 输出，随 Agent / Final diagnostics 上传，并汇总到 Actions Summary。嵌套阶段不可相加为墙钟时间；排队与续跑间隔继续使用任务用量报告的端到端时间与执行时间区分。中断进程可能没有结束记录，应结合 Actions step 时间判断。

修复循环先对变更应用文件自动格式化，再执行格式检查与 Lint；修复轮优先重跑上次失败的静态检查，然后执行其余所有检查。任何失败都会阻止构建/验收，最终独立验证仍执行全套检查、迁移、Seed 和浏览器冒烟。业务 QA 仍逐项操作。完整业务 QA 失败后优先复测失败路径；复测通过后新建数据库再做完整业务验收，同一代码不重复构建。最终交付不能只依赖局部通过。

最终验证设置 `FACTORY_BUILD_TARGET=linux-x64`、`FACTORY_BUILD_NODE_VERSION=24`、`FACTORY_BUILD_ARCHIVE=1`，唯一一次构建带模板自带的 `--tar`，归档即被验收的同一份 dist；验证通过后只暂存上传，不再单独构建或调用应用内打包脚本（新版模板已不提供 `scripts/utils/pack-dist.mjs`）。

`FACTORY_DEPENDENCY_CACHE` 启用作业内的生产依赖安装缓存。输入包含根 lockfile、registry 配置、生成的 manifest/workspace、vendor 内容、构建脚本、Node 版本/ABI、宿主平台和目标参数及 pnpm 版本。成功构建后保存依赖指纹；下一次清理 dist 前通过目录 rename 暂存已验证的 node_modules，匹配时直接移回，避免复制大量小文件。缓存只在同一工作区、同一文件系统中复用。恢复时还原部署目标元数据，省去安装、链接转换和原生模块处理，仍执行裁剪和服务端依赖验证。应用代码不缓存。最终验证仅构建一次，不启用依赖缓存，使用新 runner，不下载实现 Agent 的缓存。不得把此目录作为跨信任边界的 Actions cache；跨作业缓存需另行设计可信生产者与完整性校验。`FACTORY_DISABLE_DEPENDENCY_CACHE=1` 可强制冷安装。

旧版内联构建模板由 optimize-template-build.mjs 重新应用计时与缓存 hooks；无法识别的旧版源码仍会使刷新失败。新版模板通过 @nocobase/app-tools 提供构建实现，工厂保留其入口原文，不注入旧版计时、依赖缓存、registry 复制或裁剪补丁，也不复制说明旧 hooks 的 factory-performance Skill。新版仍有外层命令耗时统计，但没有这些工厂内部构建子阶段统计与依赖安装缓存；不得把两种构建路径的统计能力混为一谈。

QA 使用 `$FACTORY_BROWSER_REPORT_TOOL` 的 check 子命令逐项验证字段与 PNG 并保存观察；finish 运行原有完整校验器。即时校验与最终校验共享同一检查项验证函数，不自动生成成功结论，也不省略最终独立校验。

测量优化效果时比较相同依赖和同一任务的冷/热构建，以及实现、QA、修复次数与首次通过率。缓存恢复也计时；不要仅凭命中日志宣称提速。

## Prompt 与输出

开发 Agent 做相关自测，固定全套检查由流水线执行；修复 Prompt 仅携带业务目标和失败诊断，不重新嵌入整套开发、复盘规则。复盘不强制凑建议。QA 报告修复使用当前报告和简短诊断继续，同一截图可兼作业务证据与展示素材。

`FACTORY_QA_THINKING` 可单独设置 QA 思考强度，留空保持现有配置。没有做真实模型对照试验前，不宣称提速或节省百分比。当前没有启用跨进程模型原生会话恢复：QA 通过保留的浏览器、报告、证据和简短续接 Prompt 恢复进度。
