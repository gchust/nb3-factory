# PR 预览环境

搭建任务通过 `verify-final` 和 `publish` 之后，**Deploy Task Preview** 工作流会把这一次
验收过的构建产物部署到预览机（`ct252-nocobase`），并给业务 PR 回一条带地址的评论：

```
https://pr-<PR 号>.preview.nfvd.net/main/
```

和截图、录像的区别在于它是**真的在跑**：可以登录、可以新增和修改数据、可以把链接发给别人。
代价是它需要一台常驻机器。

预览失败不会影响已经通过的搭建验收：该工作流的失败不会改变业务 PR 的状态，只会在 PR 上
留一条说明。

## 工作原理

```
Code Agent NocoBase Task
  verify-final ──► pnpm build --tar --target linux-x64
                   artifact: factory-dist-<Issue 号>
                             ├─ dist.tar.gz         要部署的构建
                             └─ task-metadata.json  属于哪个 PR 和目标分支

Deploy Task Preview（由 workflow_run 触发）
  select  ──► 只挑同时通过 verify-final 和 publish 的运行
  prepare ──► 认领 PR、算出依赖集标识、生成地址
  推送    ──► Tailscale 入网 → scp 到 252 → preview-deploy.sh
  评论    ──► 按 marker 幂等写入 PR
```

**依赖集缓存。** 一次构建里 `dist/node_modules` 约占 740MB（`dist/server` 只有 144KB）。
所以推送前先问预览机有没有同一个依赖集：有就只传应用代码（几 MB），没有才传整包。
依赖集标识是 `dist/package.json` 里已解析的依赖版本加构建目标（平台、架构、libc、Node ABI）
的哈希——构建目标是关键，同一批版本但换一个架构或 Node ABI，原生模块就不是同一棵依赖树。

**为什么在 `verify-final` 里构建。** 预览跑的必须是独立验收通过的那棵树，而不是 Agent
自己声称的版本，所以打包步骤放在 `verify-final` 的验收之后，产物随 artifact 传递。

`verify-final` 先把 `dist.tar.gz` 和 `task-metadata.json` 拷进同一个目录再上传，因为
`upload-artifact` 会保留路径的公共祖先之下的结构：直接把两个各在一处的文件列成 `path`
会让它们各自多套一层目录，而预览端是平着读这两个名字的。

**为什么保持 `/main`。** `APP_BASE_PATH` 与 `verify.sh` 验收时用的完全一致。换一个 base
path 会让预览和验收看到的不是同一个东西，那就又回到了"预览不能代表真实部署"的老问题。

## 一次性配置

### 1. 预览机

```bash
ssh 252 'mkdir -p /srv/nb3-preview'
scp -r .github/scripts/preview/. 252:/srv/nb3-preview/scripts/
ssh 252 'chmod +x /srv/nb3-preview/scripts/*.sh'
ssh 252 'PREVIEW_BUILD_PROXY=http://192.168.2.250:7890 bash /srv/nb3-preview/scripts/provision.sh'
```

`provision.sh` 建目录、建 `nb3-preview` docker 网络、构建运行时镜像、在 `127.0.0.1:8081`
拉起 Traefik。它是幂等的，改了 Dockerfile 或 compose 之后再跑一次即可。

`PREVIEW_BUILD_PROXY` 只在构建镜像时装 `ca-certificates` 用得到：Docker 守护进程自己的
代理设置只管拉镜像，构建步骤里的网络访问只认构建客户端传进去的参数。

预览机需要：Docker、`tar`、`curl`、`openssl`、`flock`（Debian 12 默认都有）。

### 2. Cloudflare

给 tunnel `5ead5b3b-5134-4237-9268-f40b05fa744b` 加一条通配 public hostname：

```
*.preview.nfvd.net  →  http://localhost:8081
```

控制台会自带一条 `*.preview` 的 CNAME。**只配这一次**，之后增删预览不需要再动 Cloudflare：
Traefik 从容器 label 里自动发现路由。

Traefik 只监听回环地址，预览端口不发布到宿主机和局域网，公网入口只有这条 tunnel。

### 3. Tailscale

CI 需要临时加入 tailnet 才能连上内网的 252。在 Tailscale 后台建一个带 tag 的 OAuth
client（tag 用 `tag:ci`），存成 `FACTORY_TAILSCALE_OAUTH_CLIENT_ID` 和
`FACTORY_TAILSCALE_OAUTH_CLIENT_SECRET`。

### 4. CI 到预览机的 SSH 密钥

```bash
ssh-keygen -t ed25519 -C "factory-preview" -f ./preview_key -N ''
ssh 252 'mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys' < ./preview_key.pub
gh secret set FACTORY_PREVIEW_SSH_KEY --repo gchust/nb3-factory < ./preview_key
rm -f ./preview_key ./preview_key.pub
```

不要把私钥写进命令参数、Issue、PR 或聊天。

### 5. 可选的仓库变量

| 变量                     | 默认值             | 说明                  |
| ------------------------ | ------------------ | --------------------- |
| `FACTORY_PREVIEW_HOST`   | `100.120.77.102`   | 预览机的 tailnet 地址 |
| `FACTORY_PREVIEW_USER`   | `root`             | SSH 用户              |
| `FACTORY_PREVIEW_DOMAIN` | `preview.nfvd.net` | 预览域名              |

四个凭据缺任意一个，工作流会直接跳过并留一条 `::warning::`，不会失败。

## 手动补发

进入 Actions → **Deploy Task Preview** → **Run workflow**，选择默认分支，填写成功搭建的
**Actions run ID**（不是 Issue 或 PR 编号）。和补发截图录像的方式一样，它只下载已有的
构建产物再部署一次，不调用 Code Agent、不重新搭建。

## 回收

PR 关闭或合并后，**Reclaim Task Preview** 会删掉对应容器和实例目录。依赖集缓存保留，
因为它是按依赖集而不是按 PR 共享的；`preview-gc.sh` 负责回收不再被任何预览引用的缓存，
以及实例目录已丢失但容器还在的孤儿：

```bash
ssh 252 'bash /srv/nb3-preview/scripts/preview-gc.sh'
```

回收失败不会影响业务 PR。如果 PR 关闭时回收没跑成功，用上面的命令兜底。

## 资源与并发

预览机只有 1 个 vCPU，且和 Gitea、act_runner、NocoBase alpha、四个 PostgreSQL 共用，
所以每个预览限 0.5 CPU / 768MB，并发上限默认 6 个。超限时新预览会被拒绝并提示先回收，
而不是悄悄挤掉别人正在看的预览。

## 排查

| 现象                        | 可能原因                                                                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| PR 上只有"部署失败"的评论   | 看该工作流的日志；`preview-deploy.sh` 的输出里有迁移和启动的完整记录                                                        |
| 地址打不开                  | 通配路由是否配好；`ssh 252 'docker logs nb3-preview-traefik'`                                                               |
| 应用启动报 `.node` 相关错误 | `dist/package.json` 的 `nocobase.buildTarget` 与运行时镜像不匹配，用 `PREVIEW_NODE_IMAGE` 指定合适的镜像重跑 `provision.sh` |
| 一直卡在 apt-get            | 预览机没有直接出网，构建时要传 `PREVIEW_BUILD_PROXY`                                                                        |
| 磁盘告警                    | `ssh 252 'bash /srv/nb3-preview/scripts/preview-gc.sh'`                                                                     |

预览机上的构建日志在 `/srv/nb3-preview/logs/pr-<号>-{migrate,seed}.log`。

## 安全

- **预览是公开地址。** 拿到链接的人都能打开登录页，而种子管理员凭据
  （`nocobase` / `admin123`）写在 `browser-acceptance.sh` 里，等于公开可知。
  所以预览里只能用一次性测试数据，不能放真实业务数据、密码或密钥。
  想收紧时，在 Cloudflare 控制台给 `*.preview.nfvd.net` 挂一个 Access 应用（邮箱 OTP）
  即可，不需要改任何代码。
- **CI 的 SSH 用户等价于 root**（它必须能调 Docker，而 Docker 组就是 root）。这个凭据泄露
  等于预览机失守，而预览机上还有 Gitea、四个 PostgreSQL、NocoBase alpha 和 MinIO。
  首次写入 `mode 600`，只传给推送和部署步骤。
- **不在 CI 里运行产物。** 工作流只把 tar 当数据搬运；真正执行它的是预览机上的容器。
- **Traefik 挂载 Docker socket**（只读）。它只读 label，但这仍是一个特权组件。

## 相关文件

| 文件                                         | 作用                                         |
| -------------------------------------------- | -------------------------------------------- |
| `.github/workflows/deploy-preview.yml`       | 部署工作流                                   |
| `.github/workflows/preview-teardown.yml`     | PR 关闭时回收                                |
| `.github/scripts/deploy-preview.mjs`         | `select` / `prepare` / `publish`             |
| `.github/scripts/preview-host.mjs`           | 纯函数：依赖集标识、命名、瘦包清单、评论渲染 |
| `.github/scripts/preview/preview-deploy.sh`  | 预览机上的部署                               |
| `.github/scripts/preview/preview-destroy.sh` | 回收单个预览                                 |
| `.github/scripts/preview/preview-gc.sh`      | 回收无引用的缓存与孤儿容器                   |
| `.github/scripts/preview/provision.sh`       | 预览机一次性配置                             |
