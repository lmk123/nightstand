---
paths:
  - "src/manifest.json"
  - "store/README.md"
  - "src/background/page-script.ts"
  - "src/platform/page-access.ts"
---

权限：`storage`、`history`、`tabs`、`alarms`、`bookmarks`（必需而非可选：保存条目会删除它的书签，而 Chrome 的权限弹窗会在保存中途关掉 popup）、`scripting`（注册网页脚本），以及仅 Chromium 的 `favicon`（manifest 里的 `chromium:permissions` 会在那边替换掉普通列表，所以两份列表要保持同步）。

遮罩的网页脚本匹配所有 `http://*/*`、`https://*/*`，这两项是 `optional_host_permissions`，用户打开遮罩时整块申请、关掉时撤销；不能改成按站点申请：事先不知道用户收藏哪些网站，而按站点申请会把受保护的域名列在扩展详情页的“网站访问权限”里。网页脚本也不能写回 manifest 的 `content_scripts`（那样它的匹配范围会变成安装时就授予的必需权限），由后台动态注册（`src/background/page-script.ts`）。每项权限的用途见 `apps/extension/.context/manifest/permissions.md`，给商店的英文说明在 `apps/extension/store/README.md`，改权限时三处一起改。
