---
paths:
  - "packages/core/src/url.ts"
  - "packages/core/src/match-table.ts"
  - "apps/extension/src/background/cleaner.ts"
  - "apps/extension/src/background/index.ts"
  - "apps/extension/src/platform/history.ts"
  - "apps/extension/src/platform/bookmarks.ts"
  - "apps/extension/src/popup/views/EntryForm.tsx"
  - "apps/extension/e2e/{history,redirect-hops,extra-hosts,backup-bookmarks,firefox-history}.e2e.ts"
---

历史清理相关的项目文档，改动前按需读：
- 跳转链中间的网址 `history.search` 搜不到，只能按网址或按访问时间删，终点在保护范围外的跳转链删不到；Firefox 不做按时间删除。改清理范围、网址匹配、清理时机、书签删除、保存前确认的文案前读 `.context/history/cleaning.md`
