---
paths:
  - "packages/core/src/crypto/**"
  - "packages/core/src/match-table.ts"
  - "packages/core/src/storage-format.ts"
  - "packages/core/src/backup.ts"
  - "apps/extension/src/popup/session.ts"
---

加密与匹配表相关的项目文档，改动前按需读：
- 匹配表是加盐 SHA-256，只挡随手翻看存储的人，挡不住拿常见域名逐个比对；数据密钥包裹两份（口令经 PBKDF2 600,000 次、160 bit 恢复码）。改密钥派生、包裹、恢复码、匹配表的哈希方式前读 `.context/vault/encryption.md`
