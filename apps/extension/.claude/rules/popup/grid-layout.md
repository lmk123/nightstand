---
paths:
  - "src/popup/**"
---

单列竖排布局用 `grid grid-cols-1`（Tailwind v4 生成一列 `minmax(0, 1fr)`），不要用裸 `grid`：裸 `grid` 的隐式 `auto` 列会被内容的 min-content 撑宽，一段不断行的长文本（文件名、拿网址当标题）即使套了 `truncate` 也会把视图撑出 360px 的 popup。同理，自定义列宽里不要写裸 `fr`（它的最小值是 `auto`），写成 `minmax(0,1fr)`，例如 `grid-cols-[96px_minmax(0,1fr)]`。`tools/check-grid.mjs` 在 `lint` 里检查 `src/popup` 下的这两点；shadcn 组件（如 `RadioGroup`）本身带裸 `grid`，在调用处传 `grid-cols-1`。
