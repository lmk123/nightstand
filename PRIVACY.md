# Privacy Policy

English | [简体中文](#隐私政策)

Last updated: 2026-11-09

Nightstand is a browser extension that runs entirely on your device. It has no account, no server, no analytics and makes no network requests. The developer receives no data from it, ever.

## What Nightstand handles, and where it stays

- **The sites you save** (their URLs, titles, extra domains and site icons). They are encrypted with a key derived from your passphrase and stored in your browser's local extension storage. They are never synced or sent anywhere.
- **A match table** of salted SHA-256 hashes of the saved sites' host names and URLs, stored in the same local storage, so history can be cleaned while your list is locked.
- **Your browsing history and bookmarks.** Nightstand reads them only on your device, to find and delete the entries that belong to the sites you saved. It does not record, keep or transmit them.
- **Your open tabs.** Nightstand reads the current tab's URL and title when you ask to add it, and finds the tabs of saved sites when you use the quick-close shortcut.
- **The address of each web page you open.** A small script runs in every http(s) page to check its address against the match table, so a saved site can be covered and muted until you choose to show it. It does not read the page's content (apart from its title, which it swaps for a neutral one while the page is covered and puts back afterwards), and it only tells Nightstand's background whether the page was shown or covered. Nothing is recorded or sent off your device.
- **Site icons** come from the browser's local icon cache, never from the network.
- **Quick Links** (the links shown while locked) and your settings, including whether to cover and mute saved sites, are stored in local extension storage.

Your passphrase and recovery code are not stored anywhere.

## What Nightstand doesn't do

- It doesn't send any data off your device, to the developer or to anyone else.
- It doesn't sell, share or transfer user data, and doesn't use it for any purpose other than the extension's single purpose described above.
- It doesn't use user data for advertising, or to determine creditworthiness or for lending purposes.

## Removing your data

Uninstalling Nightstand removes everything it stored. Backups you exported are files you control.

## Contact

Questions: open an issue at <https://github.com/lmk123/nightstand/issues>.

---

## 隐私政策

最后更新：2026-11-09

Nightstand 是一个完全在本机运行的浏览器扩展：没有账号、没有服务器、没有统计分析，也不发出任何网络请求。开发者不会从它那里收到任何数据。

### Nightstand 处理哪些数据，存在哪里

- **你收藏的网站**（网址、标题、附加域名和网站图标）：用由你的口令派生的密钥加密后，存在浏览器本地的扩展存储里，从不同步、从不上传。
- **匹配表**：收藏网站的主机名和网址加盐后的 SHA-256 哈希，存在同一个本地存储里，用于在列表锁定时照样清理浏览记录。
- **浏览记录和书签**：只在本机读取，用来找出并删除属于你收藏的网站的条目；不记录、不保留、不传输。
- **打开的标签页**：你要求添加当前页时读取它的网址和标题；使用快速收起快捷键时找出收藏网站的标签页。
- **你打开的每个网页的网址**：每个 http(s) 网页里都会运行一个小脚本，拿网址和匹配表比对，以便把收藏的网站先遮住、静音，等你选择显示。它不读取网页内容（只有标题例外：遮住时换成中性标题，显示时还原），只告诉 Nightstand 的后台这个页面是已显示还是已遮住。不记录，也不发出你的设备。
- **网站图标**：只读取浏览器本地的图标缓存，从不联网获取。
- **快捷链接**（锁定时显示的链接）和你的设置（包括是否遮住、静音收藏的网站）：存在本地扩展存储里。

你的口令和恢复码不保存在任何地方。

### Nightstand 不做什么

- 不把任何数据发出你的设备，无论是发给开发者还是其他任何人。
- 不出售、分享或转让用户数据，也不把它用于上述单一用途以外的任何目的。
- 不把用户数据用于广告，也不用于判断信用或借贷。

### 删除数据

卸载 Nightstand 会删除它存储的全部内容。你导出的备份文件由你自己保管。

### 联系方式

有问题请在 <https://github.com/lmk123/nightstand/issues> 提交 issue。
