---
paths:
  - "src/content/**"
  - "src/background/cover.ts"
  - "src/platform/messages.ts"
  - "src/platform/storage.ts"
---

**网页脚本能碰的数据是固定的一小份。** 遮罩脚本（`src/content/cover.ts`）只读 `index`（哈希匹配表）、`prefs`，以及在要遮住的网页上读明文的 `links`（只用其中的工具栏图标）；绝不读 `shelf` 或任何解密数据，不读网页内容（标签页标题除外：遮住时换成中性标题、显示时还原）。它和后台之间只有 `PageRequest` / `PageNotice` 里那几种消息（是否受保护 / 已显示 / 已遮住 / 是否在播放声音，以及后台的通知），后台的回答里只有布尔值，不带网址、标题或任何条目内容。加新消息或给回答加字段前，先确认没有把受保护站点的信息交给网页——网页里的其他脚本看得到页面的标题和 DOM，所以写进页面的东西都要假定会泄露。
