# apps/extension

- **唯一的界面是 action popup。** 没有 options 页、侧边栏、新标签页覆盖，也绝不打开扩展自己的标签页。所有界面（引导、伪装界面、伪装设置、锁屏、保险箱列表、真正的设置……）都是 popup 里的视图。唯一的例外是受保护网页上的遮罩（见下一条）：它只有一个“显示页面”按钮，不承载任何别的功能或设置。
- **只有一个 content script：遮罩（`src/content/cover.ts`）。** 它在所有 http/https 网页的顶层框架、`document_start` 时运行（事先不知道用户收藏什么网站；按站点申请权限会把域名写进扩展详情页）。不要再加别的网页脚本或 host 权限。
- **网站图标只来自浏览器本地缓存**（Chromium 的 `_favicon`），绝不走网络（不抓 `/favicon.ico`，不用图标服务）。
- **保险箱密钥（DEK）只存在于 popup 内存里。** 绝不写入任何存储（包括 `storage.session`），也绝不发给 background。关闭 popup 就销毁它——这*就是*上锁。没有“保持解锁 N 分钟”，没有定时器，不用 `idle`。
- **磁盘上不能有明文。** 不要把编辑草稿或其他解密后的数据持久化到存储里。
- **旁人可能看到的地方一律用中性措辞。** manifest 的 name/description/title/命令描述绝不能含 private、hide、secret、隐私、隐藏、私密之类的词——`apps/extension/tools/check-manifest-words.mjs` 在 `lint` 里强制检查。存储键也是中性的（`shelf`、`index`、`links`、`state`、`prefs`）。
- **从第一天起就做 i18n。** 所有界面字符串都经过 `apps/extension/src/platform/i18n.ts` 的 `t()`；组件里不能有硬编码文案。
- 运行时用 `src/lib/browser.ts` 里的 `isChromiumLike` / `isFirefoxLike` 分支（判断 Chromium 时绝不用 `!isFirefoxLike`），Firefox 专有的 API 用 `firefoxBrowser()`。
- Extension.js 的特殊目录放在 `apps/extension/package.json` 旁边，而不是 `src/` 下：`_locales/`、`public/`（原样复制到输出根目录——图标集在 `public/icons/<set>/`，运行时以 `icons/<set>/<size>.png` 引用）。`scripts/` 和 `pages/` 也是特殊目录（里面每个文件都会成为入口），所以 Node 辅助脚本放在 `tools/`。

本包的历史决策在 `apps/extension/context/decisions/`，实测数据在 `apps/extension/context/data/`。
