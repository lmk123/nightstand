---
paths:
  - "_locales/zh_CN/messages.json"
  - "e2e/**/*.ts"
---

界面操作按 zh_CN 文案查找按钮（`clickText`），所以改了 zh_CN 文案可能会让 e2e 测试失败——两边一起改。为了不让本机语言把它们切成英文，`launchChrome` 加载的是一份只有 zh_CN 语言包（同时也是默认语言）的构建副本。只有 `e2e/locale.e2e.ts` 传 `lang` 并运行真实构建，检查 en-US / zh-TW / zh-CN 浏览器分别得到哪种语言。macOS 上的 Chrome 会忽略 `--lang`；`-AppleLanguages (xx)` 在那里有效，但也会打开一个多余的 `http://(xx)/` 标签页，所以历史/标签页相关的测试里不要用它。
