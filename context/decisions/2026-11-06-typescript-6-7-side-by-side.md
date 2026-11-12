# TypeScript 6 和 7 并存

状态：生效

## 背景
`typescript-eslint` 遇到 TS 7 的 API 会报错。

## 决定
两个包都用官方的并存方案：`typescript` 指向 TS 6，`typescript-7` 指向 TS 7。等 typescript-eslint#10940 发布后，合并回单一的 `typescript`。具体写法见 `.claude/rules/tooling/typescript-versions.md`。

## 放弃的方案
未记录
