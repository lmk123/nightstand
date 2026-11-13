# 权限与网页脚本读写的数据

| 权限 | 用途 |
|---|---|
| `storage` | 保存加密的收藏列表、哈希匹配表和快捷链接设置（只用本地存储） |
| `history` | 删除受保护站点的浏览记录，这是核心功能 |
| `tabs` | 读取当前标签页的网址和标题以便添加；快速收起时找出并关闭受保护站点的标签页 |
| `alarms` | 定期做增量扫描 |
| `bookmarks` | 保存条目时统计并删除这个站点的书签；从书签导入 |
| `favicon`（仅 Chrome） | 从浏览器本地的图标缓存读取网站图标，显示在列表里 |
| `scripting` | 只在遮罩开着时注册网页脚本、关掉时注销，这样它的网站权限才能是可选的（没有安装提示） |
| 可选：`http://*/*`、`https://*/*`（`optional_host_permissions`） | 网页脚本遮住受保护的网页要用。遮罩默认关闭，用户在设置里打开时才整块申请、关掉时撤销，所以安装时没有“读取和更改您在所有网站上的数据”的提示，没开遮罩时扩展详情页的“网站访问权限”也是空的。事先不知道用户会收藏哪些网站，只能整块申请所有网站；按站点申请反而会把受保护网站的域名写进扩展详情页的“网站访问权限” |

网页脚本不写在 manifest 的 `content_scripts` 里：Chrome 会把写在那里的匹配范围当成必需权限、安装时就授予。它由后台在遮罩开启且有权限时用 `scripting.registerContentScripts` 注册（构建入口 `apps/extension/scripts/cover.ts`，实现仍在 `src/content/cover.ts`），开关和权限怎么保持一致见 `apps/extension/src/background/page-script.ts`。历史清理、静音、`tabs.sendMessage` 都不需要网站权限。

网页脚本只读取匹配表、`prefs`，以及在要遮住的网页上读取明文的 `links`（伪装的快捷链接和图标选择，只用其中的图标；`storage` 只能整键读取），不读取网页内容（只读写标签页标题，以便遮住时换成中性标题、显示时还原），只和后台交换“是否受保护 / 已显示 / 已遮住 / 是否在播放声音”这几种消息。整个扩展不发起任何网络请求，完全离线运行。网站图标也不例外：只读 Chrome 本地已缓存的图标，不会去网站上下载（见 `apps/extension/.context/favicon/favicons.md`）。

给商店审核的英文权限说明在 `apps/extension/store/README.md`，改权限时，`src/manifest.json`、这份文档和它三处一起改。
