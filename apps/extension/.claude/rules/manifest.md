---
paths:
  - "src/manifest.json"
---

- Extension.js 把 `src/manifest.json` 当作构建图。带 `chromium:` / `firefox:` 前缀的键按目标拆分（例如 `background.chromium:service_worker` 对 `firefox:scripts`）；两个目标都用 MV3。
- 权限：`storage`、`history`、`tabs`、`alarms`、`bookmarks`（必需而非可选，原因见 apps/extension/context/decisions/2026-11-06-bookmarks-required-permission.md），以及仅 Chromium 的 `favicon`（manifest 里的 `chromium:permissions` 会在那边替换掉普通列表，所以两份列表要保持同步）。
