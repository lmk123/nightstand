# 项目文档入口

做新需求、评估方案前，先看有没有相关的：
- `apps/extension/.context/cover/cover-behavior.md`：评估和遮罩、静音、无操作计时有关的需求前（浏览器限制导致做不到或有意不做的情况）
- `apps/extension/.context/cover/http-page-hashing.md`：评估让纯 http 页面更快出结果、或在网页脚本里自己算哈希的方案前（实测数字和不做的原因）
- `apps/extension/.context/popup/features.md`：评估 popup 里的新功能或改动现有功能前（现有功能的预期行为、已知限制）
- `apps/extension/.context/popup/favicons.md`：评估和网站图标有关的需求前（为什么只读本地缓存、保存时截取、Firefox 只显示首字）
- `apps/extension/.context/manifest/permissions.md`：评估需要新权限或改动网页脚本读取范围的需求前（每项权限的用途、网页脚本读写哪些数据）

只在改代码时才用得上的文档由各领域的 `.claude/rules/<领域>/context-index.md` 在碰到相关代码时带出来，不在这里列。
