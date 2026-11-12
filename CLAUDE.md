# CLAUDE.md

## 这是什么

**Nightstand** 是一个浏览器扩展（Chrome 优先，兼容 Firefox）。有些网站，用户不希望地址栏把它们提示出来（上台分享、屏幕共享、同事凑过来看屏幕时），就把它们存进扩展里的加密保险箱，而不是书签栏；Nightstand 在每次访问后删除对应的浏览记录。扩展本身刻意低调：锁定时，它看起来、用起来都只是一个普通的“快捷链接”启动器。

仓库是 pnpm workspace monorepo。目前只有扩展和它的纯 TS 核心；以后可能会有 `apps/web`（官网）和 `apps/server`（例如端到端加密同步）——没被要求之前不要创建。

## 命令

包管理器是 **pnpm 12**（见根目录 `package.json` 的 `packageManager`）。在仓库根目录运行：

```bash
pnpm dev                # 扩展开发服务器 + 浏览器（Chromium）；Firefox 用 pnpm dev:firefox
pnpm build              # 生产构建 → apps/extension/dist/chromium（也有 build:firefox）
pnpm lint               # 每个包的 ESLint + manifest 用词检查
pnpm type-check         # 每个包的 tsc --noEmit（TS 7）——构建本身不会因为类型错误而失败
pnpm test               # Vitest 单元测试（packages/core）
pnpm test:e2e           # 构建两个目标，然后驱动真实的 Chrome/Firefox（apps/extension/e2e）
E2E_HEADED=1 pnpm test:e2e   # 额外运行真实 popup 的检查，需要可见窗口
pnpm --filter @nightstand/core test:watch
pnpm --filter @nightstand/extension icons   # 重新渲染 icons-src/*.svg → public/icons/<set>/<size>.png
pnpm run store          # 构建并打 zip，再生成 Chrome 网上应用店的截图和宣传图（apps/extension/dist/store）
```

在包内给 Extension.js 传参时，直接跟在脚本名后面，例如 `pnpm --filter @nightstand/extension run dev --browser=firefox`。**不要**加 `--`：pnpm 会原样转发它，Extension.js 就会把后面的参数当成项目路径（报 "Manifest file not found"）。

每次非平凡的改动后运行 `lint`、`type-check` 和 `test`；改了 popup、background 或 manifest 后还要运行 `test:e2e`。扩展包刻意没有单元测试：纯逻辑放进 `packages/core`（有单元测试），浏览器行为由 e2e 覆盖。

## 硬性规则

- **只用 Web Crypto。** 不引入第三方加密库。
- **只能离线。** 没有后端、账号、统计分析或任何远程请求。
- 属于用户的决定（界面风格、默认值、体验取舍），列出选项问用户，不要自行假设。

## 威胁模型（所有设计取舍都以此为准）

- **防的是旁观者。** 投影或屏幕共享时的地址栏提示、新标签页的“常去网站”、`chrome://history`、书签栏、扩展管理页上的名称/描述，以及有人好奇点开工具栏图标。
- **不防：** 完全控制这台机器、做取证分析的人；Google 账户的“网络与应用活动”；DNS/网络层日志；操作系统层面的记录。README（英文 `README.md`、中文 `README.zh-CN.md`，两份保持同步）必须如实说明这些局限。
- 明文匹配表存的是受保护主机名加盐后的 SHA-256 哈希（盐值每台设备随机）。它只能挡住随手翻看存储的人，挡不住拿常见域名列表逐个算哈希比对。代码注释和 `docs/design.md` 里要写明这一点；README 用一句普通话带过。

## README 与开发者文档

- 加密设计、哈希匹配表、权限说明、网站图标、已知限制、功能的具体行为都写在 `docs/design.md`（中文）。改了相关行为时同步更新它。

## MCP 服务器

`.mcp.json` 配置了三个服务器：

- **extension-dev**（`@extension.dev/mcp`）—— 感知构建的项目控制（开发服务器、重载、生成的 manifest、存储、日志）。
- **chrome-devtools**（`chrome-devtools-mcp`）—— 原始 CDP 调试；需要一个监听 `http://127.0.0.1:9222` 的 Chrome。
- **extensionjs** —— 托管的 Extension.js 文档；回答“Extension.js 怎么做……”类问题时优先用它，而不是凭记忆。

## 更多上下文

- 历史决策：`context/decisions/` 和各包的 `context/decisions/`（改架构前先 grep 一遍）；实测数据在各包的 `context/data/`
- 手动验收清单：用 `/manual-acceptance`；发布流程：用 `/release`
- 各包和各模块的专属约定会按路径自动加载，不用手动查
