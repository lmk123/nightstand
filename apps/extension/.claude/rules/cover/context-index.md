---
paths:
  - "src/content/**"
  - "src/background/cover.ts"
  - "src/popup/views/Settings.tsx"
  - "e2e/cover.e2e.ts"
---

遮罩与静音相关的项目文档，改动前按需读：
- `apps/extension/.context/cover/cover-behavior.md`：改遮住、显示、重新遮住的时机，静音，无操作计时前（每种情况的预期行为、为什么宁可多遮、已知限制）
- `apps/extension/.context/cover/http-page-hashing.md`：改纯 http 页面的匹配路径（网页脚本问后台、后台按框架网址匹配）前（打包 JS 版 SHA-256 的实测数字和不做的原因）
