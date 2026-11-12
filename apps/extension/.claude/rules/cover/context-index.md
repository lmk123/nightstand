---
paths:
  - "src/content/**"
  - "src/background/cover.ts"
  - "src/background/index.ts"
  - "src/popup/views/Settings.tsx"
  - "e2e/cover.e2e.ts"
---

遮罩与静音相关的项目文档，改动前按需读：
- 漏掉一次离开就会闪出页面，所以宁可多遮：鼠标移出、切标签页、窗口失焦、无操作都重新遮住，播放声音时不因无操作遮住（停止后约 12 秒）；Nightstand 只撤销自己设的静音。改遮住、显示、重新遮住的时机，静音，无操作计时前读 `apps/extension/.context/cover/cover-behavior.md`
- 纯 http 页面问后台是有意的：打包 JS 版 SHA-256 实测只在 service worker 停掉后的第一个页面快约 26 ms，还违反只用 Web Crypto。改纯 http 页面的匹配路径（网页脚本问后台、后台按框架网址匹配）前读 `apps/extension/.context/cover/http-page-hashing.md`
