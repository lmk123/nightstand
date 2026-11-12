# 项目文档入口

做新需求、评估方案前，先看有没有相关的：
- 地址栏网址和标签页图标遮不住；网页脚本进不去的页面（PDF、浏览器自带页面）只静音不遮；键盘切换标签页可能闪一下页面。评估和遮罩、静音、无操作计时有关的需求前读 `apps/extension/.context/cover/cover-behavior.md`
- 已实测并决定不给纯 http 页面打包 JS 版 SHA-256，没有新证据就别再提议。评估让纯 http 页面更快出结果、或在网页脚本里自己算哈希的方案前读 `apps/extension/.context/cover/http-page-hashing.md`
- Firefox 上弹窗里开文件选择器会关掉弹窗，所以改为粘贴导入；输错口令有意不限次数。评估 popup 里的新功能或改动现有功能前读 `apps/extension/.context/popup/features.md`
- 图标绝不走网络，只读 Chrome 本地缓存，Firefox 没有接口只显示首字。评估和网站图标有关的需求前读 `apps/extension/.context/popup/favicons.md`
- 网页脚本必须匹配所有 http/https 网页（按站点申请会把域名暴露在扩展详情页），只读匹配表、`prefs` 和 `links` 里的图标。评估需要新权限或改动网页脚本读取范围的需求前读 `apps/extension/.context/manifest/permissions.md`

只在改代码时才用得上的文档由各领域的 `.claude/rules/<领域>/context-index.md` 在碰到相关代码时带出来，不在这里列。
