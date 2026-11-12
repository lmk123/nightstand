---
paths:
  - "src/popup/**/*.ts"
  - "src/popup/**/*.tsx"
  - "src/components/ui/*.tsx"
  - "components.json"
---

- shadcn/ui：在 `apps/extension` 下运行 `pnpm dlx shadcn@latest add <name>`；组件会生成在 `src/components/ui`。保持 CLI 生成的代码原样——它从官方的 [`cn`](https://github.com/shadcn-ui/cn) 包导入 `cn`（shadcn 用来替代 clsx + tailwind-merge 的包）；应用代码里也用同样的导入。
- 单列竖排布局用 `grid grid-cols-1`（Tailwind v4 生成一列 `minmax(0, 1fr)`），不要用裸 `grid`：裸 `grid` 的隐式 `auto` 列会被内容的 min-content 撑宽，一段不断行的长文本（文件名、拿网址当标题）即使套了 `truncate` 也会把视图撑出 360px 的 popup。同理，自定义列宽里不要写裸 `fr`（它的最小值是 `auto`），写成 `minmax(0,1fr)`，例如 `grid-cols-[96px_minmax(0,1fr)]`。`tools/check-grid.mjs` 在 `lint` 里检查 `src/popup` 下的这两点；shadcn 组件（如 `RadioGroup`）本身带裸 `grid`，在调用处传 `grid-cols-1`。
