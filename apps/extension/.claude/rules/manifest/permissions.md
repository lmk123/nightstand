---
paths:
  - "src/manifest.json"
---

权限：`storage`、`history`、`tabs`、`alarms`、`bookmarks`（必需而非可选：保存条目会删除它的书签，而 Chrome 的权限弹窗会在保存中途关掉 popup），以及仅 Chromium 的 `favicon`（manifest 里的 `chromium:permissions` 会在那边替换掉普通列表，所以两份列表要保持同步）。

遮罩的 content script 必须匹配所有 `http://*/*`、`https://*/*`，不能改成按站点申请的可选 host 权限：事先不知道用户收藏哪些网站，而按站点申请会把受保护的域名列在扩展详情页的“网站访问权限”里。每项权限给商店的说明见 `apps/extension/store/README.md`，改权限时一起改。
