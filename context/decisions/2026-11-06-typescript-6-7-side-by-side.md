# TypeScript 6 和 7 并存

状态：生效

## 背景
`typescript-eslint` 遇到 TS 7 的 API 会报错。

## 决定
让 TS 6（给 ESLint 和编辑器）和 TS 7（给 `type-check`）并存，直到 `typescript-eslint` 支持 TS 7。具体写法和合并回去的条件见 `.claude/rules/tooling/typescript-versions.md`。

## 放弃的方案
未记录
