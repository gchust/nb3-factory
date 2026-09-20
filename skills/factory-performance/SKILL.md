---
name: factory-performance
description: Maintain factory timing, build reuse, dependency caching and incremental QA reporting.
---

工厂控制流程维护指南见 [PERFORMANCE.md](../../.github/PERFORMANCE.md)。业务 Agent 不得自行修改这些流程。
构建脚本的工厂扩展由 `.github/scripts/optimize-template-build.mjs` 在模板刷新时重新应用；修改扩展时同步修改应用脚本与 overlay，并运行 factory:test 和应用检查。
最终独立验收始终保留；不得将 Agent 产物缓存作为独立验证的可信输入。
