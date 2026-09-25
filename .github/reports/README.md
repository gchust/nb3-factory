# 每个搭建任务的 NocoBase3 改进报告

每个已接单的搭建 Run（交付、失败、超时、取消或 Handoff）结束后，现有 **Report Task Usage** 工作流生成统一 HTML，并归档到 `gh-pages`。启用 Pages 后，工作流显式部署整个报告站点，核对本轮页面标识，再更新 Issue / 对应 PR 的一条报告评论。

```text
独立评测：build-review.json ────┐
实现/修复：retro.json（可选） ──┤
QA：report.json + showcase.json ├→ 固定模板 → report.html / report.json
QA：delivery-notes.json（可选） ┤                  │
工厂：状态/用量/耗时/PR ────────┘                  ▼
                               gh-pages 全量归档 → GitHub Pages → 评论链接
```

同一作业还把这些事实转换为版本化的外部结果 `evaluation.json`（不调用模型、不替换本报告），按运行身份登记修订，
并可选投递给实现同一协议的接收端，见 [评测结果导出与接收端对接](../EVALUATION_INTEGRATION.md)。

## 页面与风格

模板由 `.github/reports/report.template.html` 统一维护，使用黑白灰配色、左侧导航、首屏摘要、折叠详情与截图查看器。业务 Agent 不修改模板、不生成 HTML/CSS，不读取含图片的完整示例。

报告的首要产出是改进 NocoBase3 作为企业级 Vibe Coding 基础设施的能力：每次搭建都是一个能力验证场景，交付结果是证据背景。
固定章节：**框架改进总览、问题与改进详情、框架能力评测、框架帮助与证据、业务交付背景、验收记录、效果与证据、执行与用量**。

首屏把有证据的问题、待确认的问题、改进建议分开计数，列出框架发现的影响、建议改动和证据入口。只统计 v2 中归属 framework/plugin/template/documentation 的非 strength 发现；归因待定、应用、工厂、环境观察另列，不混为框架缺陷。按原评审 severity 排序，不生成全局修复优先级。问题数保留原评审 resolved 记录，不冒充当前未修复问题总数。

确认边界始终可见：本轮评审基于冻结依赖与指引，confirmed 是评审者的有据判断；最新 NocoBase3 源码是否仍存在该问题，当前流水线未复核。应用交付成功、业务绕行和原记录“已解决”均不等于上游已修复。没有评测时显示“尚未评估”，不显示零问题。

新评审给非 strength 发现补充 diagnosis：问题类型、触发条件、应有行为、实际观察、应用绕行与代价、改进后的验收标准。历史报告缺字段时保留原文、明确未提供，不推断或追填。问题详情先展示独立评测，再折叠保留实现者过程和运行背景。

验收逐项保留原始状态、实际操作、观察结果与截图引用；失败、未记录项及证据提示默认展开。完整原始要求和原始 QA 数据可展开核对。只读取选定轮次的记录，focused 结果不能当作全量通过。没有记录时明确标注未提供，不推断成功。

复盘保留 `blockers` 的现象、根因、处理方式、实际代价和可选状态，以及 `improvements` 的原因、具体改法、分类和可自动化标识。兼容没有 `cost/status` 的旧记录；不因后续验收通过就自动标为已解决。Handoff 续跑只恢复复盘，不复用旧验收结论或重复累计旧日志。

框架评分、具体帮助、框架问题和文档误导来自独立的 `build-review.json`。口径 v2 主表展示需求满足度、使用便利度、Agent 友好度；详情给出被评库/插件/指引、需求覆盖、推荐与实际使用，以及五项完整理由和证据。业务 QA、视觉观察和应用/环境问题是背景，不直接换算框架分数。

“问题与改进”统一读取已有独立评测的非 `strength` findings、可选过程笔记及运行/验收提示；
框架帮助区域只完整展示 `strength` 和证据。每条发现保留来源、归因、确认程度、处理状态与证据链接。
评审发现不冒充本轮实际阻塞，实现者自述不升级为已确认框架缺陷；报告不额外调用模型或重新运行应用。

只有建议的标题、说明和改法均非空且三者完全相同（忽略空白差异）时，实现者补充建议引用已有评审，不重复正文；
同名不同说明、不同处理状态或现场卡点不合并。原始复盘仍可展开核对，不改写任何原始 JSON。
缺复盘只显示简短的可选笔记说明，不再显示两个“未提供”大占位框。轻量、未执行、评测失败、
部分完成、已评测但未提出建议分别说明，不能把未知变成零问题。保留旧 `#improvements` 深链接。
模板版本为 v6；合并后新报告使用该版式，已有页面须对对应 Run 补发报告才会更新。补发仅复用原始材料，不补造诊断、不重新评审、更不等于重新核对最新上游代码。

旧口径 v1 的四项评分保留原含义并明确提示不是新框架得分，不自动转换。更新口径时同一发布 attempt 的旧页面与数据保留在 `rubric-1/` 下；迟到的旧口径回放不能覆盖新口径。

## Agent 输出

`retro.json` 是可选的实现者过程笔记，不是第二份必交评测。只在有独特排错背景时按现有 Prompt 记录，缺失不要求补写或增加模型调用。QA 继续使用原有 `report.json` schema；全量验收结束可在同目录补充：

```json
{
  "version": 1,
  "summary": "简短业务结论",
  "highlights": [{ "title": "业务能力", "detail": "实际完成情况" }],
  "flow": ["步骤一", "步骤二"]
}
```

文件名为 `delivery-notes.json`。正文约束见 `../prompts/browser-acceptance.md`。HTML 渲染本身不调用模型，不重新读取交互日志或运行应用。上游独立评审只调用一次 Code Agent，规则与预算见 [独立搭建评审](../BUILD_REVIEW.md)。说明缺失/格式错误时回退到 QA 摘要；模板故障时保留原有基础统计 HTML，不触发业务修复。

## 一次性设置

合并本 PR 后，在 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**；允许默认分支部署到 `github-pages` 环境。不需要新增模型、媒体或 Pages PAT Secret。

`gh-pages` 是报告的归档分支，不是 Pages 的分支自动构建来源。仅用 `GITHUB_TOKEN` 推送分支不会触发分支式 Pages 构建，所以工作流使用 `actions/upload-pages-artifact` / `actions/deploy-pages` 显式部署。

发布端点：

```text
https://gchust.github.io/nb3-factory/reports/                         报告目录
https://gchust.github.io/nb3-factory/reports/issues/146/              最新入口
https://gchust.github.io/nb3-factory/reports/issues/146/runs/<run>/attempt-<n>/index.html
```

这是合并并配置后的地址约定，不代表示例已经上线。程序使用 Pages 返回的实际 `page_url`，支持项目路径和自定义域名。

报告工作流使用现有串行并发组（`queue: max`），业务搭建仍可并行。归档采用非强制更新与冲突重试，保留其他 Issue 和已有站点文件。按源 Run/attempt 顺序更新最新入口；补发旧运行只写历史快照。重放时不以缺失产物覆盖已经保存的更完整报告。一个 Run/attempt 对应一份可幂等补发的快照。

Pages 未启用/配置失败时，HTML 仍保存在 Actions Artifact 和 `gh-pages` 中。启用后重跑 **Pages** 作业即可；也可在 **Report Task Usage → Run workflow** 填来源 Run ID / attempt 补发，不需要重新搭建。部署或 URL 校验失败不回贴“已发布”链接，不改变业务搭建结果。

## 媒体、用量与评论

截图内嵌为数据 URL，HTML 可离线打开。每张最多 10 MiB、整份截图最多 15 MiB；未内嵌的原始引用仍保留，并提示从来源 Artifact 查看。录像沿用已有媒体工作流，不向 Pages Git 历史反复加入长视频。Pages 总站点容量仍需要随报告数量管理。

用量与耗时复用现有 `task-usage` 计算；新报告不重新统计、不将思考 Token 相加。原有隐藏用量回执不删不改，保证跨轮累计兼容。原有媒体/历史/复盘评论和预览发布不受影响；统一报告评论由独立 marker 更新，不覆盖人工评论。

模板只执行固定交互脚本（CSP hash），所有业务字符串转义，截图路径及类型校验；不执行 artifact 内的代码，不公开原始模型日志和凭据。公开 Pages 仅用于本项目的测试资料。

## 视觉样例与验证

`example.facts.json`、`example.framework-review.json`（v2）与 `example.review.json`（历史 v1）是明确标记的虚构评审数据，不伪装成真实验收。用同一模板生成可直接打开的样例：

```bash
node .github/reports/render-review-example.mjs /tmp/report.example.html
node .github/reports/render-review-example.mjs /tmp/report.legacy.html --legacy
node --test --test-concurrency=1 .github/scripts/tests/*.test.mjs
python3 .github/scripts/tests/preview-dns-sync.test.py
```

Factory regression tests 会生成并上传 `factory-report-example` Artifact，避免手写样例和正式模板产生分歧。

参考：

- https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency
