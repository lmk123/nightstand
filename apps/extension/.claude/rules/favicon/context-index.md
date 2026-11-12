---
paths:
  - "src/platform/favicon.ts"
  - "e2e/favicon.e2e.ts"
---

网站图标相关的项目文档，改动前按需读：
- Chrome 删历史会连带删掉缓存的图标，所以条目图标在保存那一刻截取并加密保存，没图标的条目解锁时补查（依赖图标晚于删除写入的时序，e2e 因此让测试图标延迟返回）；Firefox 只显示首字。改图标的截取、补查、显示或测试图标的延迟前读 `apps/extension/.context/popup/favicons.md`
