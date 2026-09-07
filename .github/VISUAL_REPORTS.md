# PR 界面截图与操作录像

搭建任务完成 `verify-final` 和 `publish` 后，独立的 **Publish Task Visual Report**
工作流会将最终通过验收的界面截图、核心流程 WebM 录像回复到业务 PR。
它不会改变搭建结果：没有媒体 Token、录像失败、附件太大或上传失败，都不会让
已经通过验收的业务 PR 失败。

## 配置一个 Secret

1. 在 GitHub 个人设置 → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token 创建专用 Token。
2. Resource owner 选择 `gchust`；Repository access 选择 **Only select repositories**，
   只勾选 `nb3-factory`。设置合理有效期，例如 90 天。
3. Repository permissions 设置 **Contents: Read and write**、
   **Pull requests: Read and write**；Metadata 的只读权限自动包含。
   不需要 Workflows、Actions、Secrets 或 Administration 的写权限。
4. 在本仓库 Settings → Secrets and variables → Actions → New repository secret
   中添加 `FACTORY_MEDIA_TOKEN`，值为新生成的 Token。

也可以在已经登录 GitHub CLI 的本机运行：

```bash
gh secret set FACTORY_MEDIA_TOKEN --repo gchust/nb3-factory
```

在交互提示中粘贴 Token，不要把 Token 写进命令参数、Issue、PR 或聊天。
Token 只传给受信任的媒体发布步骤，不会传给实现 Agent 或 QA Agent。

原生附件使用固定版本 GitHub CLI 2.100.0 的 `gh pr comment --attach`。
该上传能力不接受 Actions 的内置 `GITHUB_TOKEN`（installation token）；
需要 OAuth/PAT 类型的用户凭据，且用户对目标仓库拥有写入权限。
未配置 Secret 时，仍会使用内置 Token 在 PR 留下媒体清单和 Artifact 下载入口。

参考：[CLI 评论附件](https://cli.github.com/manual/gh_pr_comment)、
[上传凭据校验](https://github.com/cli/cli/blob/v2.100.0/internal/attachments/client.go)、
[GitHub Secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)。

## 截图和录像的范围

QA 在原有业务验收时逐个访问本次新增/修改的主要业务界面，包含列表、详情、
新增/编辑表单、关键弹窗和不同角色视图。媒体清单 `showcase.json` 独立于严格的
`report.json`；未覆盖界面如实列出，不把几张验收截图视为覆盖整个系统。

QA 成功登录后录制 1–3 个核心场景，尽量每段不超过两分钟；登录、注册和密码
填写不录制。实际录制使用已有 agent-browser 0.36.0，不额外调用模型生成视频。
Wrapper 限制录制命令自身的等待时间，QA 返回或关闭浏览器时由 Factory 兜底保存录像。
录像不可用时继续必要的截图验收，不会为录制失败开启业务修复循环。

只展示 `repair-summary.json` 指定的最后一轮通过验收的媒体，失败轮次只保留
在原始诊断 Artifact。新发布的 PR 会记录交付 commit；过期运行不会覆盖已经
更新的 PR。旧的成功运行可补发已有验收截图，但不会凭空补出录像或全界面截图。

每条评论最多内嵌 40 张 PNG 和 6 段 WebM，单文件最多 9.5 MB、总计最多 100 MB。
超出预算的文件留在原始 Artifact，并在评论中说明。媒体包保留 14 天，包含
截图、录像和 Markdown 清单；不把图片或视频提交到业务代码分支，不依赖图床。
公开仓库的附件是公开内容，所以只能使用一次性测试数据，不能包含真实业务
数据、密码或密钥。这里的文件校验不等于自动内容脱敏。

## 配置后补发，不重新搭建

进入 Actions → **Publish Task Visual Report** → **Run workflow**，选择默认分支
`develop`，填写成功搭建的 **Actions run ID**。不要填写 Issue 或 PR 编号。
该流程只下载已有证据并发布评论，不调用 Code Agent，不重新运行应用。

同一个 source run 的重复触发不会重复创建已成功上传的报告；缺少 Token 时的
机器人占位评论会在原生附件发布成功后被替换，不编辑或删除人工评论。
如果该 run 没有成功完成业务发布、属于五小时 handoff、Artifact 已过期，或 PR
已被后续搭建更新，则跳过或明确报告原因，而不是错贴到其他 PR。
