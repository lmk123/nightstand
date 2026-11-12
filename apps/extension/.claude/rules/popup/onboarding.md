---
paths:
  - "src/popup/**"
  - "src/platform/storage.ts"
---

**引导在最后一步之前什么都不写。** 引导中途关闭 popup，存储必须是空的，下次打开从头开始（`App.tsx` 靠存储里有没有 `shelf` 决定显示引导还是锁屏）。引导里的一切（口令、新建的保险箱、恢复码）都先留在内存里，最后一步由 `saveInitialSetup` 一次写入；不要在引导中途调用任何 `save*`，也不要为了“记住进度”写草稿。`e2e/onboarding-vault.e2e.ts` 和手动验收第 7 项检查这一点。
