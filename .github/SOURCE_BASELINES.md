# 可追溯源码基线

普通任务使用默认分支中已验证的新版 NocoBase 3 模板。源码评测单独固定提交，以便复现；它不随上游分支持续漂移。

当前 PR/手动入口的默认源码提交为 `28c7522b3ddb384b05745715e94f7f985d09a67e`，对应官方 `@nocobase/app-template-default@1.0.0-beta.47` 发布标签。已移除 beta.43 默认基线。自选源码也必须使用当前 CLI 契约，旧模板在工厂 overlay 阶段直接拒绝。

源码构建与冒烟统一使用上游 `unreleased:prepare / unreleased:smoke / unreleased:clean`；导出器读取当前 `nocobase-unreleased-*` 会话，不回退到旧 registry 状态。

## 创建固定源码快照

维护者在带 `factory:manual` 的 Issue 中发送 `/factory-source <40 位上游 SHA>`，或运行 **Verify pinned NocoBase source baseline**，提供精确 `source_sha` 并明确选择 `publish`。PR 检查仅验证，不发布。

```text
固定 NocoBase SHA → 构建包 / 临时 registry → 创建并验证默认应用
                                               ↓
                                  包 tarball + 干净应用源码
                                               ↓
第二个干净 Runner → 校验包哈希 → 只读 registry → 安装 / Skill 同步 / 工厂验证
                                               ↓
只读数据发布 Job → 不可变 Release 资产 + 独立 factory-baseline/source-* 分支
```

快照只包含公开包与必要解析元数据，不包含原 registry 认证、运行配置、数据库、node_modules 或部署状态。每个包验证来源 integrity 并记录 SHA-256；整体包归档也固定摘要。只读本地 registry 对缺失的 NocoBase 包返回错误，不回退到已发布的同名版本。第三方依赖按锁文件完整性从公共 registry 获取。

生成的 `factory-source.json` 绑定本仓库、上游 SHA、生产 run/attempt、Release URL 和归档摘要。发布只创建 `factory-baseline/source-<sha12>-<run>-<attempt>`，不修改 develop；同名资产或分支已有不同内容时拒绝覆盖。

源码验证包括上游真实创建、开发/生产包、首次配置与登录；第二个 Runner 再用正常工厂验证。成功上传或创建 Git 分支不代替这两轮验证。旧 `/install` 流程不适用于已移除安装页的源码版本。

## 使用与边界

源码快照发布与普通任务选择是两个步骤。新建“从预置案例重新搭建”任务时，可在“测试基线分支”填写已发布的 `factory-baseline/source-*` 分支；留空仍使用默认分支。每个新 Issue 固定一次代码起点，重试和续跑沿用自身分支与快照，来源案例的旧分支不被继承。

实现 Job 和独立终验 Job 分别恢复同一份包归档，校验摘要后启动只读 registry；彼此不借用已安装目录或旧数据库。不同 Issue 使用同一源码基线也独立执行，不因另一条业务 PR 未合并而等待。`factory-source.json` 属于不可由搭建 Agent 改写的基线信息。

每轮在模型调用前记录 `baseline.json`，并随交互历史归档。模板刷新先解析并固定实际生成器版本，生成后记录该版本，不再用 `@latest` 冒充已执行的版本。

基线记录保存实际模板/生成器版本、已安装包 manifest、依赖锁文件、AGENTS/Skill 哈希与明确来源；没有可靠映射时源码 SHA 保持未知。哈希不证明 Agent 阅读或遵循了 Skill。

没有归档、包校验失败或需要的版本不在快照时明确失败，不重新解析 latest。新版本测试应创建新样本，不能用新的包覆盖旧样本结果。

## 批次 A/B

计划的 `baselineRef` 也接受这里发布的源码基线分支。工厂控制 SHA 与应用 SHA 分别冻结，不能让被测源码替换工厂脚本。比较方法见 [评测可靠性](EVALUATION_RELIABILITY.md#对比两个-v3-版本)。
