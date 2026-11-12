---
paths:
  - "e2e/**"
  - "vitest.e2e.config.ts"
  - "store/assets.store.ts"
  - "_locales/zh_CN/messages.json"
---

# 端到端测试（`apps/extension/e2e`）

- Vitest + `puppeteer-core`，驱动本机的 Chrome 和 Firefox；缺浏览器或构建产物时整套跳过。辅助代码在 `e2e/support/`，临时文件放系统临时目录，每个测试文件结束后删除。
- 界面操作按 zh_CN 文案找按钮（`clickText`）：改了 zh_CN 文案，e2e 要一起改。
- Firefox 驱动不了 popup，e2e 只检查后台的历史清理；popup 里的 Firefox 分支（粘贴式备份导入）要用 `pnpm dev:firefox` 手动过。
- 写测试、改辅助代码或测试失败排查前，读 `apps/extension/.context/e2e/harness.md`（遮罩、Chrome、真实 popup、Firefox、语言各部分依赖的浏览器事实，以及打过补丁的构建副本怎么用）。
