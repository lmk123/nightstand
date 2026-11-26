---
paths:
  - "e2e/**"
  - "vitest.e2e.config.ts"
  - "store/assets.store.ts"
  - "_locales/zh_CN/messages.json"
---

# 端到端测试（`apps/extension/e2e`）

- 界面操作按 zh_CN 文案找按钮（`clickText`）：改了 zh_CN 文案，e2e 要一起改。
- Firefox 驱动不了 popup，popup 里的 Firefox 分支（粘贴式备份导入）要用 `pnpm dev:firefox` 手动过。
- Firefox 用 `e2e/support/firefox.ts` 的 `launchFirefox` 启动，别直接 `puppeteer.launch`：macOS 27 上从 Claude Code 里这样启动，Firefox 会卡在“找不到 profile”，测试超时。
- 测声音要用 `launchChrome({audible: true})`（带着 puppeteer 默认的 `--mute-audio`，标签页永远不会变成 `audible`）；macOS 上的 Chrome 忽略 `--lang`，`-AppleLanguages` 会多开一个标签页，历史 / 标签页相关的测试别用。
- 模拟扩展更新用 `browser.installExtension(同一目录)`（先改目录里 manifest 的 `version`）：`onInstalled` 收到 `update`。别用 `chrome.runtime.reload()`，puppeteer 加载的扩展这样会被卸掉、不再加载。Chromium 更新后，新注入的网页脚本在另一个 isolated world 里，旧的那份 API 失效但 DOM 监听还在跑。
