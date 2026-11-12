---
paths:
  - "icons-src/**"
  - "public/icons/**"
  - "src/content/cover-icons.ts"
  - "src/platform/icons.ts"
  - "tools/check-cover-icons.mjs"
---

Chromium 不接受 SVG 作为 action/manifest 图标：编辑 `icons-src/*.svg`，运行 `icons` 脚本，提交生成的 PNG。遮罩按钮上的图标是 `src/content/cover-icons.ts` 里的同一组形状，要一起改——`tools/check-cover-icons.mjs` 在 `lint` 里检查两边一致。
