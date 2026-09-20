# PR 预览环境

搭建任务通过 `verify-final` 和 `publish` 之后，**Deploy Task Preview** 工作流会把这一次
验收过的构建产物部署到预览机（`ct252-nocobase`），并给业务 PR 回一条带地址的评论：

```
https://nb3-<PR 号>.nfvd.net/main/
```

也可以直接打开 `https://nb3-<PR 号>.nfvd.net`，根路径会跳转到 `/main/`。

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
  发布    ──► 把 payload 上传成临时 release 资产（factory-previews）
  取件    ──► ssh 只递过去 URL 与 sha256 → 252 自己走出口拉取、校验
  部署    ──► 252 上 preview-deploy.sh（迁移、起容器）
  公网检查 ──► 从 GitHub runner 检查 HTTPS 地址可访问
  评论    ──► 检查通过才公布地址；失败仅报告日志；PR 关闭时删掉那个资产
```

**依赖集缓存。** 一次构建里 `dist/node_modules` 约占 740MB（`dist/server` 只有 144KB）。
所以发布前先问预览机有没有同一个依赖集：有就只发应用代码（几 MB），没有才发整包。
依赖集标识是 `dist/package.json` 里已解析的依赖版本加构建目标（平台、架构、libc、Node ABI）
的哈希——构建目标是关键，同一批版本但换一个架构或 Node ABI，原生模块就不是同一棵依赖树。

**为什么让预览机自己拉。** 由 runner 推的话，字节要走 Tailscale：实测 GitHub runner →
252 只有 **17 KB/s**，78MB 的整包要两个多小时，超过 job 的 45 分钟超时，而且 `scp` 不能续传，
重试永远从 0 开始。改成"runner 传到 GitHub、252 走自己的出口来拉"之后，实测 **815 KB/s**，
同一个包约 96 秒。所以 SSH 这条控制通道只承担几十字节（URL + sha256），字节走预览机本来就
有的网络；下载落在 `payload-pr-<号>.tar.gz.part`，只有摘要校验通过才会改名成正式文件名，
所以半截的下载永远不会被当成完整包部署。

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

给 tunnel `5ead5b3b-5134-4237-9268-f40b05fa744b` 在现有精确路由之后加一条通配 public hostname：

```
*.nfvd.net  →  http://127.0.0.1:8081
```

使用 Zero Trust → Networks → Tunnels & Mesh → nocobase-252 → Published application routes。
这个入口支持通配符，并明确提示不会自动创建通配 DNS；新版 Networking → Tunnels
的表单可能拒绝 `*`。已有 `npm`、`nb`、`qoder` 精确路由必须排在通配路由之前。

**不要修改已有 `*.nfvd.net` DNS 记录。** 它仍服务其他站点。每个预览创建独立的
`nb3-<PR>` CNAME，目标为 `5ead5b3b-5134-4237-9268-f40b05fa744b.cfargotunnel.com`，
开启 Proxied。免费 Universal SSL 的 `*.nfvd.net` 可覆盖这些单级域名；旧的
`pr-<PR>.preview.nfvd.net` 是多级域名，免费证书不覆盖。

252 上的 `nb3-preview-dns-sync.timer` 每分钟调用 `cloudflare-sync.py`，自动发现
`preview-pr-<PR>` 容器和实例目录、创建 DNS，并生成 Traefik 的新域名路由。
已部署容器不必重建，别名直接使用其 `pr<PR>@docker` 服务。
实例目录和容器都删除后，等待 10 分钟才清理 DNS；仅清理带
`nb3-factory preview DNS` 注释且指向本 tunnel 的 `nb3-数字` CNAME。
DNS 冲突会报错，不覆盖已有的其他记录。Docker/API 查询失败不会被当成空列表清理。

同步器运行文件在 `/srv/nb3-preview/cloudflare/`，不会被每次 CI 上传脚本覆盖。
`config.json` 指定 `domain`、`zone_id`、`target`、`token_file`；Token 为
`nb3-factory-preview-dns`，仅授权 `nfvd.net / DNS:Edit`，在预览机上以 root-only
权限保存为 `api-token`，不写入仓库或业务构建产物。
Cloudflare 权限粒度是整个 Zone；脚本通过前缀、目标和归属注释收紧实际管理范围。

首次安装需复制本目录提供的 `cloudflare-sync.py`、systemd service/timer，配置 Token，
执行 `cloudflare-sync.py --dry-run` 核对变更后，再启动 service 和启用 timer。
Traefik 配置需包含 file provider，读取 `/srv/nb3-preview/routing/aliases.yml`。
`--routes-only` 可在不访问 Cloudflare 的情况下刷新域名别名。

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

| 变量                          | 默认值                      | 说明                                                        |
| ----------------------------- | --------------------------- | ----------------------------------------------------------- |
| `FACTORY_PREVIEW_HOST`        | `100.120.77.102`            | 预览机的 tailnet 地址                                       |
| `FACTORY_PREVIEW_USER`        | `root`                      | SSH 用户                                                    |
| `FACTORY_PREVIEW_DOMAIN`      | `nfvd.net`                  | 根域名，生成 `nb3-<PR>.nfvd.net`，不要填 `preview.nfvd.net` |
| `FACTORY_PREVIEW_FETCH_PROXY` | `http://192.168.2.250:7890` | 预览机拉取 payload 时的出口代理；能直连时可设为空字符串     |

四个凭据缺任意一个，工作流会直接跳过并留一条 `::warning::`，不会失败。
`FACTORY_PREVIEW_FETCH_PROXY` 不是凭据：它只决定预览机从哪个出口去取 payload。

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

| 现象                        | 可能原因                                                                                                                                                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR 上只有"部署失败"的评论   | 看该工作流的日志；`preview-deploy.sh` 的输出里有迁移和启动的完整记录                                                                                                                                                       |
| 地址打不开                  | 通配路由是否配好；`ssh 252 'docker logs nb3-preview-traefik'`                                                                                                                                                              |
| 应用启动报 `.node` 相关错误 | `dist/package.json` 的 `nocobase.buildTarget` 与运行时镜像不匹配，用 `PREVIEW_NODE_IMAGE` 指定合适的镜像重跑 `provision.sh`                                                                                                |
| 一直卡在 apt-get            | 预览机没有直接出网，构建时要传 `PREVIEW_BUILD_PROXY`                                                                                                                                                                       |
| 取件失败或摘要不匹配        | `preview-deploy.sh` 会打印 `could not fetch the payload` 或 `payload digest mismatch`；先确认预览机能不能解析并连上 github.com（`ssh 252 'curl -sI https://github.com'`），需要代理时由 `FACTORY_PREVIEW_FETCH_PROXY` 指定 |
| 磁盘告警                    | `ssh 252 'bash /srv/nb3-preview/scripts/preview-gc.sh'`                                                                                                                                                                    |

预览机上的构建日志在 `/srv/nb3-preview/logs/pr-<号>-{migrate,seed}.log`。取件的半截文件是
`/srv/nb3-preview/tmp/payload-pr-<号>.tar.gz.part`，它永远不会被部署，可以随时删。

## 安全

- **预览是公开地址。** 拿到链接的人都能打开登录页，而种子管理员凭据
  （`nocobase` / `admin123`）写在 `browser-acceptance.sh` 里，等于公开可知。
  所以预览里只能用一次性测试数据，不能放真实业务数据、密码或密钥。
  想收紧时，在 Cloudflare 控制台给各个 `nb3-<PR>.nfvd.net` 挂 Access 应用（邮箱 OTP）
  即可，不需要改任何代码。
- **临时 payload 资产也是公开的。** 仓库是 public，`factory-previews` 下的
  `preview-pr-<号>.tar.gz` 无需凭据即可下载（这正是预览机不必持有 GitHub 凭据的原因）。
  它装的是这次验收过的构建，内容与公开分支里的源码同源；每个 PR 只保留一个，
  PR 关闭时由 **Reclaim Task Preview** 删除。想让它更严，就得换成 252 上的上传端点
  并自建鉴权，那时取件方向也会变成推。
- **CI 的 SSH 用户等价于 root**（它必须能调 Docker，而 Docker 组就是 root）。这个凭据泄露
  等于预览机失守，而预览机上还有 Gitea、四个 PostgreSQL、NocoBase alpha 和 MinIO。
  首次写入 `mode 600`，只传给推送和部署步骤。
- **不在 CI 里运行产物。** 工作流只把 tar 当数据搬运；真正执行它的是预览机上的容器。
- **Traefik 挂载 Docker socket**（只读）。它只读 label，但这仍是一个特权组件。

## 相关文件

| 文件                                                 | 作用                                         |
| ---------------------------------------------------- | -------------------------------------------- |
| `.github/workflows/deploy-preview.yml`               | 部署工作流                                   |
| `.github/workflows/preview-teardown.yml`             | PR 关闭时回收                                |
| `.github/scripts/deploy-preview.mjs`                 | `select` / `prepare` / `publish`             |
| `.github/scripts/preview-host.mjs`                   | 纯函数：依赖集标识、命名、瘦包清单、评论渲染 |
| `.github/scripts/preview/preview-deploy.sh`          | 预览机上的部署                               |
| `.github/scripts/preview/preview-destroy.sh`         | 回收单个预览                                 |
| `.github/scripts/preview/preview-gc.sh`              | 回收无引用的缓存与孤儿容器                   |
| `.github/scripts/preview/provision.sh`               | 预览机一次性配置                             |
| `.github/scripts/preview/cloudflare-sync.py`         | 自动 DNS 创建/延迟清理及新域名别名路由       |
| `.github/scripts/preview/nb3-preview-dns-sync.timer` | 每分钟自动同步                               |

## 连接和可用性检查

Tailscale 加入网络后，用允许中继的有限时 ping 输出诊断，不把 ping 失败作为部署阻断条件；随后 `preview-connect.sh` 最多尝试 6 次获取主机公钥并验证部署密钥认证，失败保留错误和网络状态。加入 tailnet 成功不代表 SSH 已就绪。

部署脚本完成本机健康检查后，Runner 还会对公网 HTTPS 地址执行有限重试。只有公网检查通过，PR 评论才显示地址与登录说明；否则显示部署或公网检查失败及日志链接。

## 增量搭建的预览更新

预览是一次性验收环境，每次部署重新初始化示例数据，避免未合并分支的种子变更与上次数据库校验冲突。旧数据库、上传文件和应用目录保存在 `/srv/nb3-preview/backups/`，不会直接删除。新部署本机健康检查失败时恢复旧实例；失败的新目录也保留供诊断，且不占预览名额。备份需要管理员按磁盘使用情况清理。

默认最多 12 个实例，每个仍限制 768 MB 内存、0.5 CPU。预览部署在 GitHub 统一排队，避免共享脚本与产物的并发写入。
