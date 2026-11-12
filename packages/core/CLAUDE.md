# packages/core

- **`packages/core` 保持纯净。** 不用浏览器扩展 API，不碰 DOM，不用 React。它的 `tsconfig.json` 设了 `lib: ["ES2024", "WebWorker"]` 和 `types: []`，所以在那里用 `window`、`document`、`chrome` 都是类型错误；它也没有 React/chrome 依赖。只用标准 Web API（`URL`、`crypto.subtle`、`TextEncoder`、`btoa`/`atob`）。core 返回错误码，从不返回给用户看的文案。
