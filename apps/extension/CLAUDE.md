# apps/extension

## 扩展架构说明

- Extension.js 把 `src/manifest.json` 当作构建图。带 `chromium:` / `firefox:` 前缀的键按目标拆分（例如 `background.chromium:service_worker` 对 `firefox:scripts`）；两个目标都用 MV3。运行时用 `src/lib/browser.ts` 里的 `isChromiumLike` / `isFirefoxLike` 分支（判断 Chromium 时绝不用 `!isFirefoxLike`），Firefox 专有的 API 用 `firefoxBrowser()`。
- Extension.js 的特殊目录放在 `apps/extension/package.json` 旁边，而不是 `src/` 下：`_locales/`、`public/`（原样复制到输出根目录——图标集在 `public/icons/<set>/`，运行时以 `icons/<set>/<size>.png` 引用）。`scripts/` 和 `pages/` 也是特殊目录（里面每个文件都会成为入口），所以 Node 辅助脚本放在 `tools/`。
- 构建出的 popup 是 `action/index.html`；background 是 `background/service_worker.js`（Chromium）。
