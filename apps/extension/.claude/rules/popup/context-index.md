---
paths:
  - "src/popup/**"
  - "src/background/panic.ts"
  - "src/platform/download.ts"
---

popup 功能相关的项目文档，改动前按需读：
- 单击一行只选中，点“打开”或按回车才打开；口令输错没有任何提示，也有意不限次数；弹窗一关就上锁。改收藏列表交互、伪装界面、快速收起、口令、备份与恢复、外观、语言前读 `apps/extension/.context/popup/features.md`
- 条目图标在保存那一刻截取（Chrome 删历史会连带删图标），没图标的条目解锁时补查。改条目或快捷链接的图标显示、保存时截取图标、解锁时补查图标前读 `apps/extension/.context/popup/favicons.md`
