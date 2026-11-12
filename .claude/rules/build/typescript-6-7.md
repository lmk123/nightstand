---
paths:
  - "pnpm-workspace.yaml"
  - "**/package.json"
  - "**/tsconfig.json"
  - "**/eslint.config.ts"
---

# TypeScript 6 和 7 并存（有意为之）

`typescript-eslint` 遇到 TS 7 的 API 会报错，所以两个包都用官方的并存方案，版本在 `pnpm-workspace.yaml` 的 `catalog:` 里统一锁定：

- `"typescript": "npm:@typescript/typescript6"` —— `require('typescript')` 解析到的版本（ESLint、编辑器的 tsserver）。
- `"typescript-7": "npm:typescript"` —— `type-check` 实际运行的 TS 7 `tsc`。

等 typescript-eslint#10940 发布后，合并回单一的 `typescript`。
