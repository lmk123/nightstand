---
paths:
  - "packages/core/src/model.ts"
  - "packages/core/src/storage-format.ts"
  - "packages/core/src/backup.ts"
  - "packages/core/src/prefs.ts"
  - "packages/core/src/crypto/envelope.ts"
  - "packages/core/test/migration.test.ts"
  - "packages/core/test/fixtures/*.json"
  - "apps/extension/src/platform/storage.ts"
---

**存储格式带版本号，迁移要有测试。** 改动存储的保险箱、它的载荷或备份格式时，如果旧版本会误读数据、或丢掉某个重要内容，就需要新版本号、一个迁移步骤，以及一个仍能解开仓库里 v1 测试数据的测试。这些情况包括：删除、重命名字段，或改变字段的含义、类型；新增必填字段；新增字段一旦丢失（旧版本重新保存时不带它）会丢条目或缩小清理范围。新增一个旧版本可以忽略、丢失也只损失一个偏好设置的*可选*字段（例如 `skipSaveNotice`），不需要升版本号——但需要测试它能完整往返，并且格式错误的值会被丢弃而不是让整个保险箱失败。同理，删除一个设置字段时，如果旧版本读到它缺失会回落到默认值、而这个默认值正好就是新的行为（例如已移除的 `openMode`），也不需要升版本号；新版本的迁移步骤要丢掉旧值，并有测试覆盖。
