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
docs/design.md    功能的具体行为、加密设计、权限、网站图标、已知限制（开发者文档）
```

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

### TypeScript 6 和 7 并存（有意为之）

`typescript-eslint` 遇到 TS 7 的 API 会报错，所以两个包都用官方的并存方案，版本在 `pnpm-workspace.yaml` 的 `catalog:` 里统一锁定：

- `"typescript": "npm:@typescript/typescript6"` —— `require('typescript')` 解析到的版本（ESLint、编辑器的 tsserver）。
- `"typescript-7": "npm:typescript"` —— `type-check` 实际运行的 TS 7 `tsc`。

等 typescript-eslint#10940 发布后，合并回单一的 `typescript`。

## 硬性规则

- **`packages/core` 保持纯净。** 不用浏览器扩展 API，不碰 DOM，不用 React。它的 `tsconfig.json` 设了 `lib: ["ES2024", "WebWorker"]` 和 `types: []`，所以在那里用 `window`、`document`、`chrome` 都是类型错误；它也没有 React/chrome 依赖。只用标准 Web API（`URL`、`crypto.subtle`、`TextEncoder`、`btoa`/`atob`）。core 返回错误码，从不返回给用户看的文案。
- **只用 Web Crypto。** 不引入第三方加密库。
- **只能离线。** 没有后端、账号、统计分析或任何远程请求。
- **唯一的界面是 action popup。** 没有 options 页、侧边栏、新标签页覆盖，也绝不打开扩展自己的标签页。所有界面（引导、伪装界面、伪装设置、锁屏、保险箱列表、真正的设置……）都是 popup 里的视图。唯一的例外是受保护网页上的遮罩（见下一条）：它只有一个“显示页面”按钮，不承载任何别的功能或设置。
- **只有一个 content script：遮罩（`src/content/cover.ts`）。** 它在所有 http/https 网页的顶层框架、`document_start` 时运行（事先不知道用户收藏什么网站；按站点申请权限会把域名写进扩展详情页）。它只读 `index`、`prefs`，以及在要遮住的网页上读明文的 `links`（只用其中的工具栏图标，显示在遮罩按钮上），不读网页内容（标签页标题除外），只和后台交换“是否受保护 / 已显示 / 已遮住”；任何解密数据都不进入网页脚本。纯 http 页面没有 `crypto.subtle`，由后台按发消息的框架网址匹配。不要再加别的网页脚本或 host 权限。权限：`storage`、`history`、`tabs`、`alarms`、`bookmarks`（必需而非可选：保存条目会删除它的书签，而 Chrome 的权限弹窗会在保存中途关掉 popup），以及仅 Chromium 的 `favicon`（manifest 里的 `chromium:permissions` 会在那边替换掉普通列表，所以两份列表要保持同步）。
- **网站图标只来自浏览器本地缓存**（Chromium 的 `_favicon`），绝不走网络（不抓 `/favicon.ico`，不用图标服务）。Chrome 删除一个网页的历史时会连带删掉它缓存的图标，所以保险箱条目的图标在保存时、清理之前截取，存进加密条目（`icon`，有大小上限的 `data:` URL——见 `isEntryIcon`）。还没有图标的条目在解锁时再查一次：之后某次访问的图标通常能留下来，因为清理器在图标从网络到达之前就删掉了那次访问（这是竞态——先写入的图标会随历史一起被删；e2e 因此故意延迟测试图标）。快捷链接实时查询。Firefox 显示首字母图块。
- **保险箱密钥（DEK）只存在于 popup 内存里。** 绝不写入任何存储（包括 `storage.session`），也绝不发给 background。关闭 popup 就销毁它——这*就是*上锁。没有“保持解锁 N 分钟”，没有定时器，不用 `idle`。
- **磁盘上不能有明文。** 不要把编辑草稿或其他解密后的数据持久化到存储里。
- **引导在最后一步之前什么都不写。** 引导中途关闭 popup，存储必须是空的。
- **旁人可能看到的地方一律用中性措辞。** manifest 的 name/description/title/命令描述绝不能含 private、hide、secret、隐私、隐藏、私密之类的词——`apps/extension/tools/check-manifest-words.mjs` 在 `lint` 里强制检查。存储键也是中性的（`shelf`、`index`、`links`、`state`、`prefs`）。
- **从第一天起就做 i18n。** 所有界面字符串都经过 `apps/extension/src/platform/i18n.ts` 的 `t()`；组件里不能有硬编码文案。语言：`en`（`default_locale`，也是推导 `MessageKey` 的那个文件，所以那里缺 key 就是类型错误）和 `zh_CN`。每个 key 都要同时写进两份 `_locales/*/messages.json`，占位符一致——`tools/check-locales.mjs` 在 `lint` 里强制检查。没有对应语言包的浏览器（包括繁体中文）显示英文。chrome.i18n 没有复数形式：英文里的计数写成 "Label: $COUNT$" 或 "(…$COUNT$)"。
- **存储格式带版本号，迁移要有测试。** 改动存储的保险箱、它的载荷或备份格式时，如果旧版本会误读数据、或丢掉某个重要内容，就需要新版本号、一个迁移步骤，以及一个仍能解开仓库里 v1 测试数据的测试。这些情况包括：删除、重命名字段，或改变字段的含义、类型；新增必填字段；新增字段一旦丢失（旧版本重新保存时不带它）会丢条目或缩小清理范围。新增一个旧版本可以忽略、丢失也只损失一个偏好设置的*可选*字段（例如 `skipSaveNotice`），不需要升版本号——但需要测试它能完整往返，并且格式错误的值会被丢弃而不是让整个保险箱失败。同理，删除一个设置字段时，如果旧版本读到它缺失会回落到默认值、而这个默认值正好就是新的行为（例如已移除的 `openMode`），也不需要升版本号；新版本的迁移步骤要丢掉旧值，并有测试覆盖。
- 属于用户的决定（界面风格、默认值、体验取舍），列出选项问用户，不要自行假设。

## 威胁模型（所有设计取舍都以此为准）

- **防的是旁观者。** 投影或屏幕共享时的地址栏提示、新标签页的“常去网站”、`chrome://history`、书签栏、扩展管理页上的名称/描述，以及有人好奇点开工具栏图标。
- **不防：** 完全控制这台机器、做取证分析的人；Google 账户的“网络与应用活动”；DNS/网络层日志；操作系统层面的记录。README（英文 `README.md`、中文 `README.zh-CN.md`，两份保持同步）必须如实说明这些局限。
- 明文匹配表存的是受保护主机名加盐后的 SHA-256 哈希（盐值每台设备随机）。它只能挡住随手翻看存储的人，挡不住拿常见域名列表逐个算哈希比对。代码注释和 `docs/design.md` 里要写明这一点；README 用一句普通话带过。

## README 与开发者文档

- README 面向普通用户，保持简短：一句话 slogan、几句说明适用场景的简介、少数几个大亮点（依次是纯本地运行、伪装、遮住与静音、开源）、“能防住什么，防不住什么”，以及简短的开发命令。不要写成说明书：不列功能细节、不写使用步骤（首次打开有设置向导），也不要出现“威胁模型”“哈希”这类术语。
- 加密设计、哈希匹配表、权限说明、网站图标、已知限制、功能的具体行为都写在 `docs/design.md`（中文）。改了相关行为时同步更新它。

## 扩展架构说明

- Extension.js 把 `src/manifest.json` 当作构建图。带 `chromium:` / `firefox:` 前缀的键按目标拆分（例如 `background.chromium:service_worker` 对 `firefox:scripts`）；两个目标都用 MV3。运行时用 `src/lib/browser.ts` 里的 `isChromiumLike` / `isFirefoxLike` 分支（判断 Chromium 时绝不用 `!isFirefoxLike`），Firefox 专有的 API 用 `firefoxBrowser()`。
- Extension.js 的特殊目录放在 `apps/extension/package.json` 旁边，而不是 `src/` 下：`_locales/`、`public/`（原样复制到输出根目录——图标集在 `public/icons/<set>/`，运行时以 `icons/<set>/<size>.png` 引用）。`scripts/` 和 `pages/` 也是特殊目录（里面每个文件都会成为入口），所以 Node 辅助脚本放在 `tools/`。
- 构建出的 popup 是 `action/index.html`；background 是 `background/service_worker.js`（Chromium）。
- `@nightstand/core` 以 TypeScript 源码形式被引用（`exports` → `src/index.ts`）；Extension.js 直接转译它，core 没有构建步骤。
- `extension-env.d.ts` 由 Extension.js 生成并被 gitignore；`env.d.ts` 带着同样的引用，保证新克隆的仓库上 `type-check` 也能通过。
- shadcn/ui：在 `apps/extension` 下运行 `pnpm dlx shadcn@latest add <name>`；组件会生成在 `src/components/ui`。保持 CLI 生成的代码原样——它从官方的 [`cn`](https://github.com/shadcn-ui/cn) 包导入 `cn`（shadcn 用来替代 clsx + tailwind-merge 的包）；应用代码里也用同样的导入。`assets.d.ts` 必须保持为脚本（不能有顶层 import/export）。
- 单列竖排布局用 `grid grid-cols-1`（Tailwind v4 生成一列 `minmax(0, 1fr)`），不要用裸 `grid`：裸 `grid` 的隐式 `auto` 列会被内容的 min-content 撑宽，一段不断行的长文本（文件名、拿网址当标题）即使套了 `truncate` 也会把视图撑出 360px 的 popup。同理，自定义列宽里不要写裸 `fr`（它的最小值是 `auto`），写成 `minmax(0,1fr)`，例如 `grid-cols-[96px_minmax(0,1fr)]`。`tools/check-grid.mjs` 在 `lint` 里检查 `src/popup` 下的这两点；shadcn 组件（如 `RadioGroup`）本身带裸 `grid`，在调用处传 `grid-cols-1`。
- Chromium 不接受 SVG 作为 action/manifest 图标：编辑 `icons-src/*.svg`，运行 `icons` 脚本，提交生成的 PNG。遮罩按钮上的图标是 `src/content/cover-icons.ts` 里的同一组形状，要一起改——`tools/check-cover-icons.mjs` 在 `lint` 里检查两边一致。

## 手动验收清单

每个涉及相关功能的里程碑，都要在真实浏览器里逐项过一遍。测试域名用 `example.com` / `example.org` 之类。

1. 添加 `example.com`（整个站点），访问 `https://www.example.com/foo`，然后：`chrome://history` 搜 "example" → 无结果；新标签页地址栏输入 `exa` → 没有历史提示；新标签页“常去网站” → 没有它。
2. 添加之前先访问某个网站并加书签，再添加它：保存提示给出历史里的网页数和书签数；确认后两者都消失。
3. 访问 `evil-example.com` 这类外观相似的域名：它**不能**被清理。
4. 锁定状态下访问受保护站点：历史照样被清理。
5. 锁定时打开 popup：只看到快捷链接；口令输错没有任何提示；输对口令按回车即解锁。
6. 解锁后关闭 popup 再打开：回到伪装界面，需要重新输入口令。
7. 全新安装，第一次打开 popup：进入引导（而不是伪装界面）。引导中途关闭 popup 再打开：引导从头开始，存储里没有保险箱数据。
8. 按下快速收起（panic）快捷键：匹配的标签页被关闭，打开着的 popup 也关闭。
9. 扩展管理页上没有任何暴露用途的信息（名称、描述、图标），使用过程中从未打开过扩展标签页。
10. 打开受保护站点（https 和 http 各一个）：加载过程中任何时刻都看不到页面内容，直接出现遮罩；标签页标题是“新标签页”、已静音。点“显示页面”后内容和声音恢复；切换标签页、切到别的应用、60 秒不操作后都重新遮住并静音。普通网站加载时没有可察觉的闪白。

另外还要验证，并记录到 `docs/design.md` 的“已知限制”里：历史删除后，Chrome 地址栏是否仍会从书签、已打开的标签页、搜索引擎联想（服务端，和 Google 账户活动有关）或地址栏的“快捷方式”数据库提示受保护站点；以及开启 Chrome 同步时 `history.deleteUrl` 是否也会删除其他设备上的记录。

## 端到端测试（`apps/extension/e2e`）

Vitest + `puppeteer-core`，驱动本机安装的 Google Chrome 和 Firefox（可用 `CHROME_PATH` / `FIREFOX_PATH` 覆盖；缺少对应浏览器或构建产物时，该套测试会自动跳过）。共享的辅助代码在 `e2e/support/`；所有临时 profile、下载文件和打过补丁的构建副本都放在系统临时目录下，每个测试文件结束后删除。测试依赖下面这些事实，原因如下：

- **遮罩**（`e2e/cover.e2e.ts`）：遮罩是用 `showModal()` 打开的 `<dialog>`，测试用 `:modal` 判断是否遮住，按视口中心点击“显示页面”（按钮在封闭的 shadow root 里）。测试服务器是纯 http，走“问后台”的路径；`http://localhost` 是安全上下文，用来覆盖网页脚本自己算哈希的路径。窗口失焦用 `chrome.windows.onFocusChanged.dispatch(WINDOW_ID_NONE)` 模拟。60 秒无操作没有自动化测试。
- **Chrome**：用 `puppeteer.launch({pipe: true, enableExtensions: [dist/chromium]})` 和全新 profile。扩展 id 从 service worker target 获取；`sw.evaluate()` 可以在 background 里调用 `chrome.*`。popup 界面以标签页形式驱动，地址是 `chrome-extension://<id>/action/index.html`（关闭标签页 = 关闭 popup）。`--host-resolver-rules=MAP * 127.0.0.1:<port>` 加上 `e2e/support/server.ts`，让 `example.com` 等成为真实访问并进入历史。panic 用 `chrome.commands.onCommand.dispatch('panic')` 触发。
- **真实 popup**（`e2e/real-popup.e2e.ts`，仅在 `E2E_HEADED=1` 时运行）：先聚焦一个普通窗口，再从 service worker 调用 `chrome.action.openPopup({windowId})`。它固定住了界面设计所依赖的几个事实：文件选择器**不会**关掉 popup（macOS 上的 Chrome）；blob 下载在 popup 关闭后仍能完成。（`permissions.request` 的弹窗**会**关掉 popup——这就是 `bookmarks` 是必需权限的原因。）
- **Firefox**：WebDriver BiDi 能安装附加组件（`browser.installExtension`），但拒绝导航到或暴露 `moz-extension://` 页面，所以没法驱动 popup 界面。`e2e/firefox-history.e2e.ts` 改为检查 background：一个打过补丁的副本预置匹配表，访问通过测试服务器（作为 HTTP 代理）进行，关闭浏览器后用 `sqlite3` 命令行读取 `places.sqlite`，看历史里还剩什么。只在 popup 里的 Firefox 分支（粘贴式备份导入）仍需用 `pnpm dev:firefox` 手动过一遍。
- 界面操作按 zh_CN 文案查找按钮（`clickText`），所以改了 zh_CN 文案可能会让 e2e 测试失败——两边一起改。为了不让本机语言把它们切成英文，`launchChrome` 加载的是一份只有 zh_CN 语言包（同时也是默认语言）的构建副本。只有 `e2e/locale.e2e.ts` 传 `lang` 并运行真实构建，检查 en-US / zh-TW / zh-CN 浏览器分别得到哪种语言。macOS 上的 Chrome 会忽略 `--lang`；`-AppleLanguages (xx)` 在那里有效，但也会打开一个多余的 `http://(xx)/` 标签页，所以历史/标签页相关的测试里不要用它。

## MCP 服务器

`.mcp.json` 配置了三个服务器：

- **extension-dev**（`@extension.dev/mcp`）—— 感知构建的项目控制（开发服务器、重载、生成的 manifest、存储、日志）。
- **chrome-devtools**（`chrome-devtools-mcp`）—— 原始 CDP 调试；需要一个监听 `http://127.0.0.1:9222` 的 Chrome。
- **extensionjs** —— 托管的 Extension.js 文档；回答“Extension.js 怎么做……”类问题时优先用它，而不是凭记忆。
