# 固定源码与应用基线

`Refresh NocoBase Template` 仍负责已发布模板的默认路径，不把源码 develop 等同于
npm latest。`Verify pinned NocoBase source baseline` 是独立、显式选择的源码验证轨道，
不会更新 develop、合并业务 PR、调用模型或向生产 Hub 部署。

## 源码轨道

在 Actions 选择工作流并填写 40 位上游源码 SHA。测试此工作流的 PR 使用仓库中明确的
固定测试 SHA，不跟随上游分支移动。执行顺序：

```text
固定 nocobase/nocobase3 SHA
  → 安装源码依赖
  → 上游 local-registry:prepare（仅临时 loopback Verdaccio）
  → 上游 local-registry:verify（固定版本创建、开发启动、生产构建和产物启动）
  → 无配置启动早失败 → config:init → config:check → 重复 init 不覆盖
  → config:set → 真实浏览器登录
  → 安全基线/验收/截图 Artifact → 清理临时仓库与凭据
```

2026-09-23 上游 #396 移除了 app-plugin-install 和浏览器安装模式。新源码初次使用
检查的是 config:init/set/check，不能继续要求 /install。旧包轨道的旧安装测试只能
标明对应旧版本；不反向修改正在执行的旧包样本。

这条工作流只证明基线产物与首次配置。它不证明 Agent 能搭好业务系统、所有模块按
Skill 接入、Hub 发布或第三方模型与通知服务可用。失败的源码基线不可作为绿色样本。

## 元数据

`baseline-record.mjs <workspace> <output> [source-sha]` 收集实际安装的 NocoBase
直接依赖版本及 manifest 哈希、锁文件 SHA-256、模板版本、AGENTS 与同步 Skill 哈希。
模板写着 creator@latest 时实际生成器版本为未知；源码轨道读取固定源码的真实版本。
符号链接只读取工作区内部的 Skill；缺失、外部链接和循环明确列出。配置和密钥内容不
进入记录。锁文件本身来自已固定的应用提交，其 resolution.integrity 是包完整性依据。

同一输出文件第二次记录只能接受相同 fingerprint；变化时失败，不能覆盖已捕获来源。
重试与续跑的代码基线继续由原有 task-metadata.applicationBase/controlSha 保证，不因
上游或默认分支推进重新选最新。测试新基线必须创建新样本。

当前源码验证的临时 registry 只在本 Job 存活；不能把包含 loopback URL 的锁文件直接
交给另一个 Runner 并声称可重放。跨 Runner 使用源码产物需要把源码构建包按 SHA 和
完整性封装，恢复本地仓库后再安装与同步 Skill。未准备这样的可重用产物时，普通搭建
任务仍使用它固定的已发布模板基线，不暗中回退或混装其他版本。

## 验证

```bash
node --test .github/scripts/tests/baseline-record.test.mjs
```

CI 真实源码任务需要 Docker、Node 24、pnpm 11.7 和网络；没有上述环境时不能用
本地单元测试代替源码创建、配置和登录验收。安全 Artifact 中不包含完整应用配置、
本地 registry 认证或 node_modules；运行日志仍由 Actions 保留。
