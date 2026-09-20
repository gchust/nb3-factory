# 中文截图与录像

中文变成方框通常是无头浏览器所在 Runner 缺少中文字形，而非 UTF-8 编码错误。
PR #22 的截图出现方框，但同一轮浏览器 snapshot 能正确读取“会议室D”“行政部”。

工厂在 agent、verify-final、模板刷新三个独立 Runner 中、启动浏览器前运行
`install-browser-fonts.sh`：安装 `fontconfig` / `fonts-noto-cjk`，刷新字体缓存并检查
`Noto Sans CJK SC` 存在。安装/检查失败直接指出环境错误，不让缺字截图继续冒充正常证据。
修改语言变量或 `<meta charset>` 不会安装字体；字体修复也不会把应用英文 UI 自动翻译成中文。

`tests/browser-fonts-smoke.mjs` 使用真实 Chrome 和 CDP 查询实际渲染中文字形的字体，
而非只判断 DOM 文本、截图文件是否存在或 `document.fonts.check` 是否返回 true。

旧 PNG/WebM 已经是像素，重新发布旧 Artifact 不会修复；需要在装有字体的新 Runner
重新执行浏览器验收与拍摄。无需给业务应用提交字体文件。
