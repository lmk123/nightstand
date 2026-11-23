# packages/core

- **`packages/core` 保持纯净。** 不用浏览器扩展 API，不碰 DOM，不用 React。只用标准 Web API（`URL`、`crypto.subtle`、`TextEncoder`、`btoa`/`atob`）。core 返回错误码，从不返回给用户看的文案。
