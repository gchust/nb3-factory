# 可追溯源码基线

普通任务仍使用默认分支中的已发布模板；不把它等同于上游最新源码。

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

源码快照发布与普通任务选择是两个步骤。普通任务的恢复接入与预置表单可选基线字段由配套改动提供；未接入时，不应直接在没有本地 registry 的任务中运行此分支。

基线记录保存实际模板/生成器版本、已安装包 manifest、依赖锁文件、AGENTS/Skill 哈希与明确来源；没有可靠映射时源码 SHA 保持未知。哈希不证明 Agent 阅读或遵循了 Skill。

没有归档、包校验失败或需要的版本不在快照时明确失败，不重新解析 latest。新版本测试应创建新样本，不能用新的包覆盖旧样本结果。
