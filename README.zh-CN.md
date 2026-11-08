# Nightstand

[English](README.md) | 简体中文

**让地址栏忘掉某些网站。**

上台分享、屏幕共享，或者同事凑过来看你屏幕的时候，地址栏刚输入几个字母，就把你不想让别人看到的网站提示了出来——Nightstand 就是为这种时刻准备的。把这些网站放进 Nightstand 的加密保险箱，每次访问之后，它都会自动删掉对应的浏览记录和书签，地址栏就再也不会提示它们。

支持 Chrome、Edge 和 Firefox。

## 亮点

- **纯本地运行**：没有账号，没有服务器，不发出任何网络请求。你的网站列表用口令加密，只保存在这台电脑的浏览器里。
- **伪装成普通工具**：平时点开图标，看到的只是一个能正常使用的“快捷链接”小工具，在筛选框里输入口令才会进入真正的列表；弹窗一关就自动上锁。扩展管理页上的名称、描述和图标也都平平无奇。
- **开源**：代码以 MIT 许可证公开，任何人都能查看 Nightstand 是否只做了它说的事。

## 能防住什么，防不住什么

Nightstand 防的是**能看到你屏幕的旁人**：

- 投影或屏幕共享时，地址栏的自动提示；
- 新标签页上的“常去网站”；
- 浏览器的历史记录页；
- 书签栏；
- 扩展管理页上的名称、描述和图标；
- 有人好奇点开扩展图标。

它防不住：

- 拿到你电脑完全控制权、专门翻查数据的人。比如能读取扩展存储的人，可以拿常见网站逐个比对，猜出你保存了其中哪些；
- Google 账户里的“网络与应用活动”、搜索引擎的联想词等云端记录；
- 公司网络、路由器、DNS 等网络层面的记录；
- 操作系统层面的记录；
- 扩展详情页可以链到它在 Chrome 网上应用店的页面，那里写明了 Nightstand 的用途。

## 开发

需要 Node 24 和 pnpm 12。

```bash
pnpm install
pnpm dev            # Chromium；Firefox 用 pnpm dev:firefox
pnpm build          # 产物在 apps/extension/dist/chromium（Firefox：pnpm build:firefox）
pnpm lint && pnpm type-check && pnpm test
pnpm test:e2e       # 端到端测试：先构建，再驱动本机安装的 Chrome / Firefox
```

设计细节和已知限制见 [docs/design.md](docs/design.md)。

## 许可证

[MIT](LICENSE)
