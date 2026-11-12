---
paths:
  - "e2e/**"
  - "vitest.e2e.config.ts"
  - "store/assets.store.ts"
  - "_locales/zh_CN/messages.json"
---

# 端到端测试（`apps/extension/e2e`）

Vitest + `puppeteer-core`，驱动本机安装的 Google Chrome 和 Firefox（可用 `CHROME_PATH` / `FIREFOX_PATH` 覆盖；缺少对应浏览器或构建产物时，该套测试会自动跳过）。共享的辅助代码在 `e2e/support/`；所有临时 profile、下载文件和打过补丁的构建副本都放在系统临时目录下，每个测试文件结束后删除。测试依赖下面这些事实，原因如下：

- **遮罩**（`e2e/cover.e2e.ts`）：遮罩是用 `showModal()` 打开的 `<dialog>`，测试用 `:modal` 判断是否遮住，按视口中心点击“显示页面”（按钮在封闭的 shadow root 里）。测试服务器是纯 http，走“问后台”的路径；`http://localhost` 是安全上下文，用来覆盖网页脚本自己算哈希的路径。窗口失焦用 `chrome.windows.onFocusChanged.dispatch(WINDOW_ID_NONE)` 模拟。无操作计时和“播放中不计时”在一份打过补丁的构建副本里测（`patchedCopy` 的 `pageScript` 把网页脚本里的一分钟换成一秒、静音宽限期换成 1.5 秒，并核对替换次数，构建产物变了会直接报错）；声音来自一个远低于听觉的振荡器（17 kHz、-60 dB），为此这组测试用 `launchChrome({audible: true})` 去掉 puppeteer 默认的 `--mute-audio`（带着它，标签页永远不会变成 `audible`）。
- **Chrome**：用 `puppeteer.launch({pipe: true, enableExtensions: [dist/chromium]})` 和全新 profile。扩展 id 从 service worker target 获取；`sw.evaluate()` 可以在 background 里调用 `chrome.*`。popup 界面以标签页形式驱动，地址是 `chrome-extension://<id>/action/index.html`（关闭标签页 = 关闭 popup）。`--host-resolver-rules=MAP * 127.0.0.1:<port>` 加上 `e2e/support/server.ts`，让 `example.com` 等成为真实访问并进入历史。panic 用 `chrome.commands.onCommand.dispatch('panic')` 触发。
- **真实 popup**（`e2e/real-popup.e2e.ts`，仅在 `E2E_HEADED=1` 时运行）：先聚焦一个普通窗口，再从 service worker 调用 `chrome.action.openPopup({windowId})`。它固定住了界面设计所依赖的几个事实：文件选择器**不会**关掉 popup（macOS 上的 Chrome）；blob 下载在 popup 关闭后仍能完成。（`permissions.request` 的弹窗**会**关掉 popup——这就是 `bookmarks` 是必需权限的原因。）
- **Firefox**：WebDriver BiDi 能安装附加组件（`browser.installExtension`），但拒绝导航到或暴露 `moz-extension://` 页面，所以没法驱动 popup 界面。`e2e/firefox-history.e2e.ts` 改为检查 background：一个打过补丁的副本预置匹配表，访问通过测试服务器（作为 HTTP 代理）进行，关闭浏览器后用 `sqlite3` 命令行读取 `places.sqlite`，看历史里还剩什么。只在 popup 里的 Firefox 分支（粘贴式备份导入）仍需用 `pnpm dev:firefox` 手动过一遍。
- 界面操作按 zh_CN 文案查找按钮（`clickText`），所以改了 zh_CN 文案可能会让 e2e 测试失败——两边一起改。为了不让本机语言把它们切成英文，`launchChrome` 加载的是一份只有 zh_CN 语言包（同时也是默认语言）的构建副本。只有 `e2e/locale.e2e.ts` 传 `lang` 并运行真实构建，检查 en-US / zh-TW / zh-CN 浏览器分别得到哪种语言。macOS 上的 Chrome 会忽略 `--lang`；`-AppleLanguages (xx)` 在那里有效，但也会打开一个多余的 `http://(xx)/` 标签页，所以历史/标签页相关的测试里不要用它。
