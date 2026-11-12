# 不为 http 页面的遮罩引入 JS SHA-256 库

状态：生效

## 背景
纯 http 页面上没有 `crypto.subtle`，遮罩网页脚本没法自己算哈希，改为问后台。

## 决定
2026-11-09 实测后，用户否决了引入 JS SHA-256 库。

除非有新的证据表明存在可察觉的延迟（例如在慢机器上），不要再提议为这条路径引入第三方（或手写的）SHA-256。

## 放弃的方案
引入 JS SHA-256 库（例如 `@noble/hashes`），让遮罩网页脚本在纯 http 页面上也能自己算哈希。收益只落在 service worker 冷启动后的第一个 http 页面上（约 25ms，按实测表里冷启动与本地算哈希两行相减得出）；代价是遮罩网页脚本明显变大，还会引入违背“只用 Web Crypto”的加密依赖。

实测数字见 apps/extension/context/data/cover-hold-time.md 和 apps/extension/context/data/js-sha256-bundle-size.md
