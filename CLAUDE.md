# CLAUDE.md

本文件为 Claude Code（claude.ai/code）在这个仓库里工作时提供指引。

## 这是什么

**Nightstand** 是一个浏览器扩展（Chrome 优先，兼容 Firefox）。有些网站，用户不希望地址栏把它们提示出来（上台分享、屏幕共享、同事凑过来看屏幕时），就把它们存进扩展里的加密保险箱，而不是书签栏；Nightstand 在每次访问后删除对应的浏览记录。扩展本身刻意低调：锁定时，它看起来、用起来都只是一个普通的“快捷链接”启动器。

仓库是 pnpm workspace monorepo。目前只有扩展和它的纯 TS 核心；以后可能会有 `apps/web`（官网）和 `apps/server`（例如端到端加密同步）——没被要求之前不要创建。

```
apps/extension/   @nightstand/extension — Extension.js + React 19 + Tailwind v4 + shadcn/ui
packages/core/    @nightstand/core — 纯 TypeScript：数据模型、网址匹配、加密、备份格式
apps/extension/store/  Chrome 网上应用店的商店说明、隐私权表单答案和图片生成脚本
PRIVACY.md        隐私政策（商店的隐私政策链接指向它）
```

`@nightstand/core` 以 TypeScript 源码形式被引用（`exports` → `src/index.ts`）；Extension.js 直接转译它，core 没有构建步骤。

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
- **唯一的界面是 action popup。** 没有 options 页、侧边栏、新标签页覆盖，也绝不打开扩展自己的标签页。所有界面（引导、伪装界面、伪装设置、锁屏、保险箱列表、真正的设置……）都是 popup 里的视图。唯一的例外是受保护网页上的遮罩（见下一条）：它只有一个“显示页面”按钮，不承载任何别的功能或设置。
- **只有一个 content script：遮罩（`src/content/cover.ts`）。** 任何解密数据都不进入网页脚本。不要再加别的网页脚本或 host 权限。
- **网站图标只来自浏览器本地缓存**（Chromium 的 `_favicon`），绝不走网络（不抓 `/favicon.ico`，不用图标服务）。
- **保险箱密钥（DEK）只存在于 popup 内存里。** 绝不写入任何存储（包括 `storage.session`），也绝不发给 background。关闭 popup 就销毁它——这*就是*上锁。没有“保持解锁 N 分钟”，没有定时器，不用 `idle`。
- **磁盘上不能有明文。** 不要把编辑草稿或其他解密后的数据持久化到存储里。
- **旁人可能看到的地方一律用中性措辞。** manifest 的 name/description/title/命令描述绝不能含 private、hide、secret、隐私、隐藏、私密之类的词——`apps/extension/tools/check-manifest-words.mjs` 在 `lint` 里强制检查。存储键也是中性的（`shelf`、`index`、`links`、`state`、`prefs`）。
- 属于用户的决定（界面风格、默认值、体验取舍），列出选项问用户，不要自行假设。

## 威胁模型（所有设计取舍都以此为准）

- **防的是旁观者。** 投影或屏幕共享时的地址栏提示、新标签页的“常去网站”、`chrome://history`、书签栏、扩展管理页上的名称/描述，以及有人好奇点开工具栏图标。
- **不防：** 完全控制这台机器、做取证分析的人；Google 账户的“网络与应用活动”；DNS/网络层日志；操作系统层面的记录。README（英文 `README.md`、中文 `README.zh-CN.md`，两份保持同步）必须如实说明这些局限。
- 明文匹配表存的是受保护主机名加盐后的 SHA-256 哈希（盐值每台设备随机）。它只能挡住随手翻看存储的人，挡不住拿常见域名列表逐个算哈希比对。代码注释里要写明这一点；README 用一句普通话带过。

## MCP 服务器

`.mcp.json` 配置了三个服务器：

- **extension-dev**（`@extension.dev/mcp`）—— 感知构建的项目控制（开发服务器、重载、生成的 manifest、存储、日志）。
- **chrome-devtools**（`chrome-devtools-mcp`）—— 原始 CDP 调试；需要一个监听 `http://127.0.0.1:9222` 的 Chrome。
- **extensionjs** —— 托管的 Extension.js 文档；回答“Extension.js 怎么做……”类问题时优先用它，而不是凭记忆。

## 更多上下文
- 各包和各模块的专属约定、背景会按路径通过 rule 自动加载（`apps/extension/CLAUDE.md`、`packages/core/CLAUDE.md` 在碰到对应包的文件时加载），不用手动查
- 做新需求、评估方案前，先看 `.context/README.md` 和 `apps/extension/.context/README.md`：各功能的预期行为、浏览器限制导致做不到或有意不做的事
- 记下读代码看不出来的项目知识（原因、踩坑、实测数字、外部约束）：只涉及一个文件的写成紧贴代码的短注释，几个文件共用的写进 `.claude/rules/`；经过、数字等扩展内容和挂不到代码上的写进 `.context/`，原处留「重点 + 什么时候读 + 路径」（装了 context-keeper 插件就用 `record-context`）。不写成长注释，也不只记在自动记忆里；改动让已有注释、rule 或 `.context/` 文档里的说法不再成立时，同一次改动里改掉
- 发布流程：用 `/release`
- 里程碑的手动验收：用 `/manual-acceptance`
