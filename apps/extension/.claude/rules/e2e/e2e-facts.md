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
- 测声音要用 `launchChrome({audible: true})`（带着 puppeteer 默认的 `--mute-audio`，标签页永远不会变成 `audible`）；macOS 上的 Chrome 忽略 `--lang`，`-AppleLanguages` 会多开一个标签页，历史 / 标签页相关的测试别用。写测试、改辅助代码或测试失败排查前，读 `apps/extension/.context/e2e/harness.md`（测试怎么启动浏览器、遮罩 / Chrome / 真实 popup / Firefox / 语言各部分依赖的浏览器事实，以及打过补丁的构建副本怎么用）。
