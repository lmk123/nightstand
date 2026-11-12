# 不为 http 页面的遮罩引入 JS SHA-256 库

状态：生效

## 背景
On plain-http pages the cover page script has no `crypto.subtle` and asks the background instead.

## 决定
Adding a JS SHA-256 library was measured and rejected by the user on 2026-11-09.

Don't re-propose a third-party (or hand-rolled) SHA-256 for this path unless new evidence shows a perceptible delay, e.g. on slow machines.

## 放弃的方案
A JS SHA-256 lib (e.g. @noble/hashes) so the cover page script can hash on plain-http pages. Only the first http page after ≥30s idle gains about 26ms. Cost: @noble/hashes sha256 is 5.7KB min (2.8KB gzip), about 42% more on the 13.5KB content script. It would also add a crypto dependency against the "只用 Web Crypto" rule.

实测数字见 apps/extension/context/data/cover-hold-time.md
