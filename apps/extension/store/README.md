# Chrome 网上应用店上架材料

这里放的是 Chrome 网上应用店开发者后台要填的所有内容。商店页面如实说明 Nightstand 的用途（商店政策要求详细说明与实际功能一致）；名称和一句话简介则直接取自 manifest，保持中性。

## 生成图片和打包

```bash
pnpm run store
```

它会先构建（并打出 `apps/extension/dist/nightstand-<版本>-chromium.zip`），再用真实构建驱动本机的 Chrome 截图，输出到 `apps/extension/dist/store/`：

| 文件 | 用途 | 尺寸 |
|---|---|---|
| `icon-128.png` | 商店图标（96px 图案居中，四周留白） | 128×128 |
| `<语言>/screenshot-<n>-<名称>.png` | 屏幕截图，按编号顺序上传（商店每种语言最多 5 张） | 1280×800 |
| `<语言>/promo-small-440x280.png` | 小型宣传图块 | 440×280 |
| `<语言>/promo-marquee-1400x560.png` | 顶部宣传图块（可选） | 1400×560 |

截图里的网站都是虚构的（`*.example`，由脚本里的本地服务器提供，图标是 emoji），浏览器固定为浅色主题。图片上的文案在 [`copy.ts`](copy.ts)，生成脚本是 [`assets.store.ts`](assets.store.ts)（借 Vitest 运行，以复用 e2e 的辅助代码）。改了 popup 界面后重新生成一遍。

## 商品详情（Store listing）

- **说明**：英文 [`description.en.txt`](description.en.txt)，简体中文 [`description.zh_CN.txt`](description.zh_CN.txt)，原样粘贴。商店的说明不渲染 Markdown，所以是纯文本。
- **类别**：Privacy & Security（没有的话选 Tools）。
- **语言**：English（默认）和中文（简体）。名称和简介由 `_locales` 提供。
- **官方网址 / 支持网址**：<https://github.com/lmk123/nightstand>，支持：<https://github.com/lmk123/nightstand/issues>。
- **公开范围**：公开。

## 隐私权（Privacy practices）

这些回答给审核人员看，用英文填写。

**Single purpose**

> Nightstand keeps the sites a user chooses out of the browser's address bar suggestions, history page and bookmarks. The user saves those sites in an encrypted list; Nightstand deletes their browsing history after every visit and deletes bookmarks that point to them; optionally (off by default), when one of them is opened, its page is covered and its tab muted until the user clicks to show it, so it can't be seen or heard by accident. While locked, its popup shows a plain "Quick Links" launcher; the passphrase typed into its filter box unlocks the list.

**Permission justifications**

| 权限 | Justification |
|---|---|
| `storage` | Stores the encrypted list of saved sites, a salted-hash match table used to recognise those sites while the list is locked, and the Quick Links and settings. Local storage only; nothing is synced or sent anywhere. |
| `history` | The core function: deletes the browsing history of the sites the user saved — right after each visit, when a site is added, at browser start-up and in a periodic scan — and counts the pages that will be deleted before a site is saved. |
| `tabs` | Reads the active tab's URL and title when the user clicks "Add current page"; lets the quick-close shortcut find and close the tabs of saved sites; and mutes the tabs of saved sites until the user chooses to show them. |
| `alarms` | Schedules the periodic scan (every 15 minutes) that deletes history of saved sites a visit-time clean-up may have missed. |
| `bookmarks` | When a site is saved, counts and deletes the bookmarks that point to it, since they would keep it in address bar suggestions; also lets the user import sites from their bookmarks. |
| `favicon` | Shows each site's icon in the popup, read from the browser's local icon cache. No icon is ever fetched from the network. |
| `scripting` | Registers the page-covering content script only while the user has covering turned on (and unregisters it when they turn it off), so that its host permission can be optional instead of granted at install. |

- **Host permissions**（可选的 `optional_host_permissions`：`http://*/*`、`https://*/*`，只在用户开启遮罩时申请）：

  > Optional, requested only when the user turns on covering in the settings (off by default) and removed when they turn it off. While granted, a content script registered at run time runs at document_start in the top frame of every http(s) page to check the page's address against the user's salted-hash match table. On a saved site it covers the page with an opaque overlay and a neutral tab title until the user clicks "Show page". The user saves arbitrary sites, so the script can't be limited to fixed hosts in advance, and requesting each saved site's host separately would list those sites on the extension's details page, which is exactly what the extension avoids. The script does not read page content (apart from the tab title it swaps and restores) and sends nothing anywhere; it only tells the extension's own background whether the page was shown or covered.
- **Are you using remote code?** No, I am not using remote code.

**Data usage**

商店政策要求：数据即使只在本机处理、从不上传，也要申报。勾选：

- **Web history** —— 保存的网站列表（加密，存在本地），以及为了删除记录而在本机读取浏览记录。

其余类别都不勾。三条声明全部勾选：

- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**：<https://github.com/lmk123/nightstand/blob/main/PRIVACY.md>（必须先合并到 `main`，链接才能打开）。

## 分发（Distribution）

- 付款：免费。
- 公开范围：公开。
- 地区：所有地区。
