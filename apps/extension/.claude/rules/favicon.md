---
paths:
  - "src/platform/favicon.ts"
  - "src/popup/components/Avatar.tsx"
  - "src/popup/App.tsx"
  - "src/popup/views/BookmarkImport.tsx"
  - "e2e/favicon.e2e.ts"
---

Chrome 删除一个网页的历史时会连带删掉它缓存的图标，所以保险箱条目的图标在保存时、清理之前截取，存进加密条目（`icon`，有大小上限的 `data:` URL——见 `isEntryIcon`）。还没有图标的条目在解锁时再查一次：之后某次访问的图标通常能留下来，因为清理器在图标从网络到达之前就删掉了那次访问（这是竞态——先写入的图标会随历史一起被删；e2e 因此故意延迟测试图标）。快捷链接实时查询。Firefox 显示首字母图块。
