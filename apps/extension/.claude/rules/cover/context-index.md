---
paths:
  - "src/content/**"
  - "scripts/**"
  - "src/background/page-script.ts"
  - "src/background/cover.ts"
  - "src/background/index.ts"
  - "src/popup/views/Settings.tsx"
  - "e2e/cover.e2e.ts"
---

遮罩与静音相关的项目文档，改动前按需读：
- 漏掉一次离开就会闪出页面，所以宁可多遮：鼠标移出、切标签页、窗口失焦、无操作都重新遮住，播放声音时不因无操作遮住（停止后约 12 秒）；Nightstand 只撤销自己设的静音。改遮住、显示、重新遮住的时机，静音，无操作计时前读 `apps/extension/.context/cover/cover-behavior.md`
- 纯 http 页面问后台是有意的：打包 JS 版 SHA-256 实测只在 service worker 停掉后的第一个页面快约 26 ms，还违反只用 Web Crypto。想让纯 http 页面自己算哈希、不再问后台前读 `apps/extension/.context/cover/http-page-hashing.md`
- 后台按网页在请求里报来的当前地址（`location.href`）匹配，不用发消息框架的网址：history API 跳转后框架网址仍是文档最初的地址；标签页地址对不上时回答“说不准”。改后台怎么判断网页地址、复查标签页地址前读 `apps/extension/.context/cover/cover-behavior.md`
