# PR 预览环境

搭建任务通过 `verify-final` 和 `publish` 之后，**Deploy Task Preview** 工作流会把这一次
验收过的构建产物部署到预览机（`ct252-nocobase`），并给业务 PR 回一条带地址的评论。
失败任务发布了标为失败的 PR（`publish-failed`）时，失败的构建也会部署一次：`verify-final` 的构建已经完成、
之后的检查才失败时，由它直接上传这次构建；否则由 `preview-build-failed` 重新打包。
评论里标明搭建状态为 failed；打包失败时不部署，只在失败通知里说明。是否交付按这些 Job 的结果判断，
不看整次运行的结论，所以交付之后问答回复失败不影响预览：

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

Deploy Task Preview（由 workflow_run 触发，搭建流程也会显式请求一次）
  wait    ──► 不持锁等待来源运行结束，记下等到的 attempt
  select  ──► 只挑通过 verify-final 和 publish（或 publish-failed）的运行，取该 attempt 打包 Job 上传的那个构建
  prepare ──► 认领 PR（必须仍开放）、直接从压缩包读出依赖集标识（不解包）、生成地址
  脚本    ──► 把仓库里的预览机脚本发到 252（回收流程也会先发一次）
  名额    ──► 先问预览机还有没有名额；满了就回收已关闭 PR 和失败构建的预览，仍满则跳过
  发布    ──► 依赖缓存命中时只解出应用部分打成瘦包；上传成临时 release 资产（factory-previews），名字带内容摘要
  取件    ──► ssh 只递过去 URL 与 sha256 → 252 自己走出口拉取、校验
  部署    ──► 252 上 preview-deploy.sh（迁移、起容器；同一次构建已经在跑则原样保留）
  清理    ──► 部署成功后删掉这个 PR 之前的 payload 资产，只留本次的
  公网检查 ──► 从 GitHub runner 检查 HTTPS 地址可访问
  评论    ──► 检查通过才公布地址；失败仅报告日志；PR 关闭时删掉这些资产
```

**先判断能不能部署，再解包。** 构建产物约 84 MB，解开约 744 MB、三万个文件，以前一下载就整包解开，
等到 PR 已关闭或预览机没名额时这一步就白做了。现在 `prepare` 用 `preview-host.mjs` 的
`readArchiveEntries` 流式读一遍压缩包，算出与解包后逐个 `stat` 完全相同的依赖集标识（硬链接按目标
大小计、只隐含存在的目录也计入，所以预览机上已有的缓存仍然命中）；只有名额确认、依赖缓存命中时，
才用 `tar --exclude=dist/node_modules` 解出几 MB 的应用部分打瘦包。应用文件若以硬链接指向依赖树
（解包时缺了目标会失败），就改发整包。产物本身仍要先下载：PR、Issue 和目标分支只记在它带的
`task-metadata.json` 里。

**依赖集缓存。** 一次构建里 `dist/node_modules` 约占 740MB（`dist/server` 只有 144KB）。
所以发布前先问预览机有没有同一个依赖集：有就只发应用代码（几 MB），没有才发整包。
依赖集标识是 `dist/node_modules` 里每个文件和目录的路径与大小的哈希（`preview-host.mjs` 的
`depsKeyFromEntries`），不是 `dist/package.json` 里的版本：同样的版本也可能因为构建配方不同而裁剪出
不同的依赖树。内容不参与哈希，因为三万个文件逐个读太慢；修改时间也不参与，否则同一棵树每次构建都会变。

**为什么让预览机自己拉。** 由 runner 推的话，字节要走 Tailscale：实测 GitHub runner →
252 只有 **17 KB/s**，78MB 的整包约要 78 分钟，超过 job 的 60 分钟超时，而且 `scp` 不能续传，
重试永远从 0 开始。改成"runner 传到 GitHub、252 走自己的出口来拉"之后，实测 **815 KB/s**，
同一个包约 96 秒。所以 SSH 这条控制通道只承担几十字节（URL + sha256），字节走预览机本来就
有的网络；下载落在 `payload-pr-<号>-<run>-<attempt>.tar.gz.part`，只有摘要校验通过才会改名成正式文件名，
所以半截的下载永远不会被当成完整包部署。文件名带上本次部署工作流的 run 和 attempt：CI 步骤超时后
预览机上的旧部署还会继续跑，如果新旧两次部署共用一个文件名，就会写同一个 `.part`，或者旧部署拿到锁后
解开的是新部署刚换上的包。payload 在部署结束时删除，无论成败；失败的部署由新的 run 重新取件。

**为什么资产名带内容摘要。** 资产名是 `preview-pr-<号>-<内容摘要前 16 位>.tar.gz`。同一个
名字永远只对应同一批字节，所以“刚上传就被取到旧内容”这类缓存窗口不可能再让一个没换成的包
通过校验——它只会以失败告终，而不是被当成新的。之前是每个 PR 固定一个名字、每次
`--clobber` 覆盖：同一个 run 被部署两次时，第二次上传后几秒内取回的仍是第一次的字节，摘要
对不上，于是一次**已经成功部署**的预览被报成“部署失败”（PR #159，2026-09-21）。一个 PR
因此会留下多个资产：每次部署成功后删掉这个 PR 其它的 `preview-pr-<号>-*` 资产，只留刚部署的那个；
PR 关闭时由回收流程全部删除。删的时候不会有别的部署还要用它们：部署在 GitHub 上串行排队，
预览机上还没结束的旧部署拿到锁后也会因为“已有更新的部署开始”而拒绝。列资产用分页的
`releases/<id>/assets` 接口，资产再多也不会漏删。

**为什么同一次构建只部署一次。** 交付成功后这个工作流可能被请求两次：搭建流程的
`dispatch-reports` 会显式补发一次（bot 触发的续跑不保证产生 `workflow_run` 事件），
GitHub 也会为同一个 run 的完成事件触发一次。两次请求带的是同一个提交、同一个依赖集，而部署
会重新初始化示例数据，第二次就会顶掉别人正在试用的那一份。所以 `preview-deploy.sh` 拿到锁之后
会核对实例记录的 `sha` 与 `depsKey`：已经是这次构建且容器在跑，就原样保留并直接成功返回。
确实要重新初始化时用 `force`（手动 Run workflow）或 `--redeploy`（直接调脚本）。

**评论不会被后来的失败撤掉。** 报告写在同一处（按 `run:attempt` 认领同一条评论）。一次已确认的
地址不会被同一个 run 后来的失败尝试改成“暂无已确认可用的地址”：那次失败会在下面补一句说明，
地址和登录说明保持不变；只有第一次部署就失败的构建才发布“没有可用地址”。

**为什么在 `verify-final` 里构建。** 预览跑的必须是独立验收通过的那棵树，而不是 Agent
自己声称的版本，所以由 `verify-final` 验收用的那次构建带 `--tar` 直接归档，产物随 artifact 传递。
验收通过时它作为交付构建上传；构建完成之后才有检查失败时，它也会上传，供失败 PR 的预览使用，
这样 `preview-build-failed` 不必再构建一次。

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
| `FACTORY_PREVIEW_ENABLED`     | 未设置（开启）              | 设为 `false` 时，失败任务不再打包预览，省掉一次完整构建     |

`FACTORY_PREVIEW_SSH_KEY`、`FACTORY_TAILSCALE_OAUTH_CLIENT_ID`、`FACTORY_TAILSCALE_OAUTH_CLIENT_SECRET`
三个 Secret 缺任意一个，部署和回收工作流都会直接跳过并留一条 `::warning::`，不会失败。
`FACTORY_PREVIEW_FETCH_PROXY` 不是凭据：它只决定预览机从哪个出口去取 payload。

## 手动补发

进入 Actions → **Deploy Task Preview** → **Run workflow**，选择默认分支，填写成功搭建的
**Actions run ID**（不是 Issue 或 PR 编号）。和补发截图录像的方式一样，它只下载已有的
构建产物再部署一次，不调用 Code Agent、不重新搭建。默认情况下，如果这次构建已经在预览机上
跑着，补发只做公网检查、不替换实例；确实要重新初始化一份示例数据时勾上 `force`。

## 回收

PR 关闭或合并后，**Reclaim Task Preview** 会删掉对应容器、实例目录和该 PR 的 payload 资产。
它和部署一样先把仓库里的预览机脚本发过去，所以对 `preview-destroy.sh`、`preview-lib.sh` 的修复
在这次回收就生效，不必等下一次部署；发送失败只记 Warning，用预览机上已有的脚本照常回收。
删除实例的 SSH 连接最多尝试 3 次（间隔 15、30 秒）；即使三次都失败，payload 资产也照样删除，
但作业仍然失败，提示预览还在运行。名额满时被回收的预览同样会删掉它的 payload 资产。

**PR 重新打开时预览会回来。** 同一个工作流的 `restore-preview` Job 从 PR 正文的
`GitHub Actions 运行记录` 链接取出发布它的任务 run，按“手动补发”的路径请求一次 **Deploy Task Preview**；
该工作流自己再核对一遍 run、构建、PR 是否开放并仍指向这个 run。和回收一样只处理本仓库
`agent/issue-*` 分支的 PR。回收留下的关闭标记不会挡住它：这次部署在标记之后才开始。
只有 release 不存在才算“没有可删的”；列资产时遇到认证、网络或限流等其他错误会报错失败（回收时让作业变红，
名额回收时记 Warning），不会再当成无事可做。
依赖集缓存保留，因为它是按依赖集而不是按 PR 共享的；`preview-gc.sh` 负责回收不再被任何预览引用的缓存、
实例目录已丢失但容器还在的孤儿，以及**已经没有预览的备份**。部署的缓存探测命中时会 `touch` 该缓存目录，
GC 不回收两小时内被探测或写入过的缓存：探测不持部署锁，部署要等上传和取件之后才拿锁，中间若 GC 恰好删掉
这份尚无实例引用的缓存，只发了应用部分的 slim 载荷就会部署失败：

```bash
ssh 252 'bash /srv/nb3-preview/scripts/preview-gc.sh'                    # 三类一起回收
ssh 252 'bash /srv/nb3-preview/scripts/preview-gc.sh --prune-backups'    # 只回收备份
```

预览机上 `nb3-preview-gc.timer` 每小时跑一次 `--all`，所以这件事不再依赖有人记得手动执行。

**备份只为本次部署的回滚而留。** 每次部署都会把上一个实例整份挪到 `backups/pr-<号>.XXXXXX`
（数据库、上传文件、应用，约 340MB），新实例本机健康检查失败就挪回去。新实例健康后这份备份就没有
用处了——之后的部署各自再备份一次——所以部署成功时立即删除，同时删掉这个 PR 以前失败部署留下的
`failed-pr-<号>.XXXXXX`。部署失败时，失败的新目录存成 `failed-pr-<号>.XXXXXX` 供诊断，每个 PR
只留最新的一份（更早的失败描述的是已经被替换的构建）。以前成功部署从不删备份，一个反复部署的 PR
每次都多留一份；2026-09-22 实测 `backups/` 占 1.5GB，而磁盘已到 80%。

`preview-gc.sh` 仍按一条规则回收剩下的：目录名里的 PR 号还有没有实例目录；没有就删。
它在部署锁下运行，所以此时看到的 `pr-<号>` 备份只可能来自中途被杀、来不及回滚或提交的部署，
可能是那个预览数据的唯一一份，实例还在就不动。名字不是 `pr-<号>.XXXXXX` / `failed-pr-<号>.XXXXXX`
的一律不动（DNS 同步器的状态就在这棵树下），也不用时间做启发式：预览可以几周没人看。

回收失败不会影响业务 PR。如果 PR 关闭时回收没跑成功，用上面的命令兜底。

## 资源与并发

预览机只有 1 个 vCPU，且和 Gitea、act_runner、NocoBase alpha、四个 PostgreSQL 共用，
所以每个预览限 0.5 CPU / 768MB，实例上限默认 30 个（`PREVIEW_MAX_INSTANCES`）。

**名额满了怎么办。** 打包和上传 payload 之前，工作流先用 `preview-capacity.sh` 问预览机
还有没有名额（这个 PR 已经有实例时是替换，不占新名额）。以前这一步在上传之后才由
`preview-deploy.sh` 检查：2026-10-05 有 49 个开放的搭建 PR 争 30 个名额，约 82% 的部署
上传了公开 release 资产（带依赖时约 84 MB，解包后约 744 MB）之后才被拒绝。现在名额满时按这个顺序腾位置：

1. PR 已关闭、已合并或不存在的预览，部署时间最早的先回收——本该由回收流程删掉，别处也不会再删。一次部署除了需要的名额外最多再回收 3 个（`CLOSED_EVICTIONS_PER_DEPLOY`），因为每个回收都可能等部署锁 3 分钟，“腾名额”步骤只为这么多留了时间；剩下的仍排在所有开放 PR 之前，由下一次需要名额的部署回收；
2. 失败构建的预览，部署时间最早的先让（失败构建的预览本来就是可选的）；
3. 既没有记录搭建状态的预览（主机上没有 `buildStatus`，PR 正文里也没有
   `factory-build-status` 标记），同样部署时间最早的先让。

搭建状态由 `preview-deploy.sh --build-status` 写进实例的 `preview.env`；在它之前部署的实例
从 PR 正文的 `factory-build-status` 标记补读。**开放 PR 的成功构建预览永远不会被挤掉。**
失败和未知状态的预览只在回收后确实能腾出名额时才回收；腾不出来就一个都不动，这次部署
记为**跳过**而不是失败：工作流保持绿色，PR 上的预览评论说明名额已满以及怎么释放（关闭不再
需要的 PR，或在预览机上运行 `preview-destroy.sh <PR 号>`，再按“手动补发”重跑）。被回收的
开放 PR 会收到一条“预览环境已回收”的评论。迁移、启动、公网检查等真正的部署错误仍然记为失败。

## 排查

| 现象                             | 可能原因                                                                                                                                                                                                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR 上显示“预览已跳过”            | 名额已满且剩下的都是开放 PR 的成功构建；关闭不再需要的 PR 或运行 `preview-destroy.sh <PR 号>` 后手动补发                                                                                                                                                               |
| PR 上只有"部署失败"的评论        | 看该工作流的日志；`preview-deploy.sh` 的输出里有迁移和启动的完整记录                                                                                                                                                                                                   |
| 地址打不开                       | 通配路由是否配好；`ssh 252 'docker logs nb3-preview-traefik'`                                                                                                                                                                                                          |
| 应用启动报 `.node` 相关错误      | `dist/package.json` 的 `nocobase.buildTarget` 与运行时镜像不匹配，用 `PREVIEW_NODE_IMAGE` 指定合适的镜像重跑 `provision.sh`                                                                                                                                            |
| 一直卡在 apt-get                 | 预览机没有直接出网，构建时要传 `PREVIEW_BUILD_PROXY`                                                                                                                                                                                                                   |
| 取件失败或摘要不匹配             | `preview-deploy.sh` 会打印 `could not fetch the payload` 或 `payload digest mismatch`；先确认预览机能不能解析并连上 github.com（`ssh 252 'curl -sI https://github.com'`），需要代理时由 `FACTORY_PREVIEW_FETCH_PROXY` 指定                                             |
| 评论显示失败但地址能打开         | 那个地址来自同一次构建更早一次成功的部署：重复请求失败时不会撤掉已确认的地址（见“评论不会被后来的失败撤掉”），失败尝试的日志在评论里给出                                                                                                                               |
| 部署成功但地址没变（没重新部署） | 同一次构建已经在跑时 `preview-deploy.sh` 不做任何替换；需要重新初始化示例数据时勾上 `force` 再补发                                                                                                                                                                     |
| 磁盘告警                         | `ssh 252 'bash /srv/nb3-preview/scripts/preview-gc.sh'`；先用 `du -sh /srv/nb3-preview/{backups,deps,instances,tmp}` 看是谁占的。备份与依赖缓存是主要占用（各约 340MB/份），两者都已由 `nb3-preview-gc.timer` 每小时自动回收                                           |
| 怀疑 DNS 记录没回收              | 别用本机解析器判断：它会缓存已删除的记录，预览机的记录删掉后本机仍可能解析到 Cloudflare 地址。用 `dig @1.1.1.1 nb3-<号>.nfvd.net`——返回 zone 通配地址（如 `52.184.25.30`）才说明记录已删；权威依据是在预览机上用 `cloudflare/api-token` 查 `/zones/<zone>/dns_records` |

预览机上的构建日志在 `/srv/nb3-preview/logs/pr-<号>-{migrate,seed}.log`。取件的半截文件是
`/srv/nb3-preview/tmp/payload-pr-<号>-<run>-<attempt>.tar.gz.part`，它永远不会被部署，可以随时删。

## 安全

- **预览是公开地址。** 拿到链接的人都能打开登录页，而种子管理员凭据
  （`nocobase` / `admin123`）写在 `browser-acceptance.sh` 里，等于公开可知。
  所以预览里只能用一次性测试数据，不能放真实业务数据、密码或密钥。
  想收紧时，在 Cloudflare 控制台给各个 `nb3-<PR>.nfvd.net` 挂 Access 应用（邮箱 OTP）
  即可，不需要改任何代码。
- **临时 payload 资产也是公开的。** 仓库是 public，`factory-previews` 下的
  `preview-pr-<号>-<摘要>.tar.gz` 无需凭据即可下载（这正是预览机不必持有 GitHub 凭据的原因）。
  它装的是这次验收过的构建，内容与公开分支里的源码同源；每次部署一个、名字带内容摘要，
  一个 PR 可能留下多个，PR 关闭时由 **Reclaim Task Preview** 全部删除，预览因名额被回收时也一并删除。想让它更严，就得换成
  252 上的上传端点并自建鉴权，那时取件方向也会变成推。
- **CI 的 SSH 用户等价于 root**（它必须能调 Docker，而 Docker 组就是 root）。这个凭据泄露
  等于预览机失守，而预览机上还有 Gitea、四个 PostgreSQL、NocoBase alpha 和 MinIO。
  首次写入 `mode 600`，只传给推送和部署步骤。
- **不在 CI 里运行产物。** 工作流只把 tar 当数据搬运；真正执行它的是预览机上的容器。
- **容器不能再提权。** 迁移和应用容器都带 `--security-opt no-new-privileges`。它们仍以 root 运行、
  保留 Docker 默认的 capabilities：实例目录由 root 解包、文件属主是 CI runner 写进压缩包的 uid，
  换成非 root 用户或去掉 `CAP_DAC_OVERRIDE` 后应用还能不能写它要写的地方，没有在预览机上验证过。
- **SSH 每个 Job 只建一条连接。** `preview-connect.sh` 写的 `~/.ssh/config` 打开
  `ControlMaster auto` / `ControlPersist 20m`，之后的 ssh、scp 都复用它，省掉每次经 Tailscale
  的 TCP 与密钥交换；仍然 `StrictHostKeyChecking yes`。
- **Traefik 挂载 Docker socket**（只读）。它只读 label，但这仍是一个特权组件。

## 相关文件

| 文件                                                 | 作用                                                      |
| ---------------------------------------------------- | --------------------------------------------------------- |
| `.github/workflows/deploy-preview.yml`               | 部署工作流                                                |
| `.github/workflows/preview-teardown.yml`             | PR 关闭时回收                                             |
| `.github/scripts/delete-preview-payloads.sh`         | 删除一个 PR 的 payload 资产（关闭、回收、部署后清理共用） |
| `.github/scripts/preview-send-scripts.sh`            | 把预览机脚本发到 252（部署与回收共用）                    |
| `.github/scripts/deploy-preview.mjs`                 | `select` / `prepare` / `slim` / `capacity` / `publish` 等 |
| `.github/scripts/preview-host.mjs`                   | 纯函数：依赖集标识、命名、瘦包清单、回收顺序、评论渲染    |
| `.github/scripts/preview/preview-deploy.sh`          | 预览机上的部署                                            |
| `.github/scripts/preview/preview-capacity.sh`        | 上传前报告名额、实例与搭建状态                            |
| `.github/scripts/preview/preview-destroy.sh`         | 回收单个预览                                              |
| `.github/scripts/preview/preview-gc.sh`              | 回收无引用的缓存与孤儿容器                                |
| `.github/scripts/preview/provision.sh`               | 预览机一次性配置                                          |
| `.github/scripts/preview/cloudflare-sync.py`         | 自动 DNS 创建/延迟清理及新域名别名路由                    |
| `.github/scripts/preview/nb3-preview-dns-sync.timer` | 每分钟自动同步                                            |

## 连接和可用性检查

部署和回收都通过组合 action `.github/actions/preview-connect`（取自可信的默认分支 `control/` 检出）加入 tailnet 并安装部署密钥；发送主机脚本仍是工作流步骤，因为回收要给它设 `timeout-minutes`。Tailscale 加入网络后，用允许中继的有限时 ping 输出诊断，不把 ping 失败作为部署阻断条件；随后 `preview-connect.sh` 最多尝试 6 次获取主机公钥并验证部署密钥认证，失败保留错误和网络状态。加入 tailnet 成功不代表 SSH 已就绪。

部署脚本完成本机健康检查后，Runner 还会对公网 HTTPS 地址做检查：只有公网检查通过，PR 评论才显示地址与登录说明；否则显示部署或公网检查失败及日志链接。检查先向公共 DNS（DoH）问这个域名的 A 记录，再把地址用 `--resolve` 交给 curl（hostname、TLS 与路由保持原样，不禁用证书），失败就按间隔重问，预算用尽才退回 runner 自己的解析器。

**为什么不先直连。** 每个预览的 DNS 记录由预览机上的定时器创建（`cloudflare-sync.py` 最多滞后一分钟），而检查在容器起来后十几秒就跑了：记录还不存在时，zone 的通配记录（`*.nfvd.net` → 一个连不上的地址）会替它作答，直连只能白等超时——这就是每次部署日志里那段 40 秒 `Failed to connect` 的来源，也让一个其实可用的预览差一点被读成不可达。默认预算 120 秒（大于定时器周期）、间隔 5 秒，可用 `PREVIEW_PUBLIC_CHECK_BUDGET_MS` / `PREVIEW_PUBLIC_CHECK_INTERVAL_MS` 调整；判定标准不变：必须有一次针对该 hostname 的公网 HTTPS 请求成功。

## 增量搭建的预览更新

预览是一次性验收环境，每次部署重新初始化示例数据（`config.yml` 和其中的密钥也每次重新生成），避免未合并分支的种子变更与上次数据库校验冲突。部署期间旧数据库、上传文件和应用目录保存在 `/srv/nb3-preview/backups/`，新部署本机健康检查失败时恢复旧实例，成功后删除；失败的新目录保留最新一份供诊断，且不占预览名额（见“回收”）。

默认最多 30 个实例，每个仍限制 768 MB 内存、0.5 CPU；名额满时的回收顺序见“资源与并发”。预览部署和回收在 GitHub 统一排队（`factory-preview-deploy`，加在 `deploy-preview` 和 `teardown-preview` 两个 Job 上），避免共享脚本与产物的并发写入；被 dispatch gate 覆盖或跳过的运行、以及非搭建 PR 关闭触发的回收运行不进入这个队列，不会排在部署后面。等待来源任务运行结束（最长 11 分钟）放在不持锁的 `wait-for-source` Job 里，持锁的部署 Job 只在真正部署时占用队列，上限 100 分钟（腾名额 22、发布 10、部署 45、公网检查 5、清理旧资产 3 分钟，其余步骤另计；腾名额和部署只有在预览机的部署锁被占着时才会用到这么久）；回收 Job 上限 20 分钟。传输卡住时由步骤限时报出失败：SSH 每 15 秒保活、连续 4 次无响应即断开，预览机下载 payload 低于 50 KB/s 持续两分钟即视为卡住，最多再试三次，每次用 `curl -C -` 从已下载的 `.part` 续传而不是重下整个 payload（带依赖时约 84 MB，依赖缓存命中时约 2 MB；服务端拒绝断点续传时从头下载），最后仍按摘要校验整个文件；这样 PR 仍能收到失败说明，而不是整个 Job 在上限处被取消。

**预览机上的每一次等待都有上限。** CI 步骤超时只会杀掉 runner 上的 ssh 客户端，预览机上的脚本照样跑下去；无限的等待会一直占着部署锁，挡住后面的部署和回收。所以 `preview-deploy.sh` 给自己的每段等待设了上限，合计留在 45 分钟的部署步骤之内：取件 600 秒（所有重试在内，`PREVIEW_FETCH_BUDGET`）、等部署锁 960 秒（`PREVIEW_LOCK_WAIT`）、迁移 480 秒（`PREVIEW_MIGRATE_TIMEOUT`，迁移容器有名字，超时后由清理删掉）、创建容器 120 秒（`PREVIEW_START_TIMEOUT`）、就绪检查 90 秒（按时钟计，每次探测不超过剩余时间），共 37.5 分钟，另加最多 3 分钟的本机解包、链接与回滚。等锁上限不短于一次部署最长的持锁时间（迁移、启动、就绪共 690 秒加那 3 分钟），所以排在别的部署（包括 CI 已断开、仍在预览机上跑的部署）后面时会等它结束，而不是失败；同一 PR 的旧部署先拿到锁时，新部署等它做完再替换。`preview-capacity.sh` 同样等锁 960 秒（“腾名额”步骤 28 分钟，含最多 3 次回收各 3 分钟的等锁），`preview-destroy.sh` 180 秒，都在各自步骤的上限之内。等锁超时的报错会提示按“手动补发”重跑。

**旧部署不会盖掉新部署。** 每次部署在取件前把开始时间（纳秒）记到 `started/pr-<号>`，只保留最新的。拿到部署锁后，如果这个 PR 有更晚开始的部署，旧部署直接拒绝，和回收留下的关闭标记一样。GitHub 上的部署本来就串行，这防的是 CI 步骤超时后仍在预览机上跑的旧部署：新部署已经开始（或已经完成）时，它不能再把较早的提交部署上去。标记由 `preview-gc.sh` 在一天后清掉。
