---
paths:
  - "src/manifest.json"
---

权限：`storage`、`history`、`tabs`、`alarms`、`bookmarks`（必需而非可选：保存条目会删除它的书签，而 Chrome 的权限弹窗会在保存中途关掉 popup），以及仅 Chromium 的 `favicon`（manifest 里的 `chromium:permissions` 会在那边替换掉普通列表，所以两份列表要保持同步）。
