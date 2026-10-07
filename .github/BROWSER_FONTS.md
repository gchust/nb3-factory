# 中文截图与录像

中文变成方框通常是无头浏览器所在 Runner 缺少中文字形，而非 UTF-8 编码错误。
PR #22 的截图出现方框，但同一轮浏览器 snapshot 能正确读取“会议室D”“行政部”。

工厂在 agent、verify-final、模板刷新，以及源码基线检查的两个 Runner（共五处）中、启动浏览器前运行
`install-browser-fonts.sh`：安装 `fontconfig` / `fonts-noto-cjk`，刷新字体缓存并检查
`Noto Sans CJK SC` 存在。先走一轮 apt：索引更新限时 45 秒、安装限时 100 秒，apt 每个连接无数据 15 秒即放弃并重试两次，
所以卡住的镜像会在限时内失败，而不是被外层超时整轮杀掉。apt 失败后不再重试 apt，而是依次从
`archive.ubuntu.com` 和 `mirrors.edge.kernel.org` 直接下载固定版本 `1:20230817+repack1-3` 的 `.deb`：
低于 1 MB/s 持续 20 秒视为卡住，单个来源最多 90 秒；文件必须与 noble `Packages` 索引中的 SHA-256 一致才用 `dpkg -i` 安装。
`fc-cache`（30 秒）、`fc-list` 与 `fc-match`（各 10 秒）和哈希校验也都限时，整段最坏约 555 秒，运行它的步骤限时 10 分钟，`workflow-policy.test.mjs` 按脚本里的限时重新计算并要求留出 30 秒余量。仍然失败时直接指出环境错误，不让缺字截图继续冒充正常证据。
任务工作流的 agent Job 用 `actions/cache` 以固定 `.deb` 的 SHA-256 为键缓存该包（`FACTORY_FONT_DEB_CACHE`），verify-final 只恢复不保存：命中时校验哈希后直接 `dpkg -i`，不跑 apt 和索引更新；缓存包不能安装时只走直接下载，仍在同一时间预算内。apt 安装成功或直接下载成功后，把与固定哈希一致的包存入缓存目录。ffmpeg 先用现有索引安装，失败才更新索引。
`tests/browser-fonts-install.test.mjs` 用桩命令覆盖这几条路径，不需要 sudo 或网络。
修改语言变量或 `<meta charset>` 不会安装字体；字体修复也不会把应用英文 UI 自动翻译成中文。

`tests/browser-fonts-smoke.mjs` 使用真实 Chrome 和 CDP 查询实际渲染中文字形的字体，
而非只判断 DOM 文本、截图文件是否存在或 `document.fonts.check` 是否返回 true。

旧 PNG/WebM 已经是像素，重新发布旧 Artifact 不会修复；需要在装有字体的新 Runner
重新执行浏览器验收与拍摄。无需给业务应用提交字体文件。
