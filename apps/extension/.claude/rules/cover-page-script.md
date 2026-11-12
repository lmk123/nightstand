---
paths:
  - "src/content/*.ts"
  - "src/background/cover.ts"
  - "src/platform/messages.ts"
---

# 遮罩网页脚本（`src/content/cover.ts`）

它只读 `index`、`prefs`，以及在要遮住的网页上读明文的 `links`（只用其中的工具栏图标，显示在遮罩按钮上），不读网页内容（标签页标题除外），只和后台交换“是否受保护 / 已显示 / 已遮住 / 是否在播放声音”；任何解密数据都不进入网页脚本。纯 http 页面没有 `crypto.subtle`，由后台按发消息的框架网址匹配。
