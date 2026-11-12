---
paths:
  - "src/components/**"
  - "src/popup/**"
  - "components.json"
---

shadcn/ui：在 `apps/extension` 下运行 `pnpm dlx shadcn@latest add <name>`；组件会生成在 `src/components/ui`。保持 CLI 生成的代码原样——它从官方的 [`cn`](https://github.com/shadcn-ui/cn) 包导入 `cn`（shadcn 用来替代 clsx + tailwind-merge 的包）；应用代码里也用同样的导入。
