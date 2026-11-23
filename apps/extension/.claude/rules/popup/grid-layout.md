---
paths:
  - "src/popup/**"
---

shadcn 组件（`src/components/ui`，如 `RadioGroup`）自带裸 `grid`，在 popup 里用它们时在调用处传 `grid-cols-1`：裸 `grid` 的 `auto` 列会被不断行的长文本撑出 360px 的 popup，而 `tools/check-grid.mjs` 只查 `src/popup` 里写出来的类名，查不到组件内部的。
