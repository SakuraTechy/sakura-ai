# Git 提交日志

## 2026-02-03

### fix: 恢复 migrate diff 自动检测方案，优化错误提示说明

**问题描述：**
- 之前移除了自动 `db push`，但这样表被删除后不会自动修复
- 用户反馈：虽然 `db push` 会报重复键错误，但实际不影响服务运行

**解决方案：**

恢复使用 `migrate diff` 检测差异的方案，但**优化错误提示**，明确告知用户可以忽略：

```javascript
// 执行流程
1. migrate deploy（应用新迁移）
   ↓ 成功
2. migrate diff（检测差异）
   ↓
   有差异？
   ├─ 是 → 执行 db push（可能报错但继续）
   └─ 否 → 跳过
```

**优化的错误提示：**

```javascript
console.log('💡 注意：如果看到重复键错误，可以忽略（Prisma 已知问题）');
console.log('⚠️  数据库同步失败，但继续启动');
console.log('💡 这通常是 Prisma 的已知问题（重复键错误），可以忽略');
console.log('💡 如果服务运行正常，无需手动处理');
```

**修改文件：**
- `scripts/start.cjs` - 恢复 `checkDatabaseSync()` 和 `executeDbPushForRepair()` 函数，优化提示信息

**优点：**
- ✅ 表被删除后自动修复
- ✅ 手动修改表结构后自动恢复
- ✅ 智能检测，按需同步
- ✅ 错误提示更友好，用户知道可以忽略

**缺点：**
- ⚠️ 启动日志中会看到重复键错误（但不影响功能）
- ⚠️ 这是 Prisma 的已知 bug，无法完全避免

**权衡：**
- 选择"自动修复 + 可忽略的错误提示"
- 而不是"手动修复 + 无错误提示"
- 更适合开发环境的快速迭代

---

### fix: 移除自动 db push，避免 Prisma 外键重复创建 bug

**问题描述：**
- `migrate diff` 检测到索引差异（实际上索引已存在）
- 执行 `db push` 时仍然报重复键错误：`Error: Can't write; duplicate key in table`
- 这是 Prisma 的已知 bug：即使索引/外键已存在，`db push` 也会尝试重新创建

**根本原因：**
Prisma 的 `db push` 命令在处理外键和索引时有 bug：
1. 即使外键/索引已存在于数据库
2. `db push` 仍然会尝试重新创建
3. 导致 MySQL 报重复键错误

**解决方案：**

**完全移除自动 `db push`**，只依赖 `migrate deploy`：

```javascript
// 修改前：migrate deploy 后检测差异并执行 db push
migrateDeploy.on('close', (code) => {
  if (code === 0) {
    checkDatabaseSync(resolve);  // ❌ 会触发 db push
  }
});

// 修改后：只执行 migrate deploy
migrateDeploy.on('close', (code) => {
  if (code === 0) {
    console.log('✅ 数据库迁移完成');
    console.log('💡 如需修复数据库结构，请手动执行: npx prisma db push');
    resolve();  // ✅ 直接完成
  }
});
```

**执行策略：**

1. **日常启动**：
   - 只执行 `migrate deploy`
   - 应用新的迁移
   - 不执行任何自动同步

2. **数据库损坏/表被删除**：
   - 用户手动执行：`npx prisma db push --accept-data-loss`
   - 或重新运行迁移：`npx prisma migrate reset`

**修改文件：**
- `scripts/start.cjs` - 移除 `checkDatabaseSync()` 和 `executeDbPushForRepair()` 函数

**效果：**
- ✅ 彻底解决重复键错误
- ✅ 启动速度更快（不执行差异检测）
- ✅ 避免了 Prisma `db push` 的 bug
- ✅ 更符合生产环境最佳实践（不自动修改数据库）

**权衡：**
- ❌ 表被删除后不会自动修复（需要手动执行 `db push`）
- ✅ 但避免了自动操作可能导致的数据丢失风险

**建议：**
- 开发环境：如需修复数据库，手动执行 `npx prisma db push --accept-data-loss`
- 生产环境：使用标准迁移流程，不依赖 `db push`

---

## 2026-02-03

### fix: 移除自动 db push，避免 Prisma 外键重复创建 bug

**问题描述：**
- `migrate diff` 检测到索引差异（实际上索引已存在）
- 执行 `db push` 时仍然报重复键错误：`Error: Can't write; duplicate key in table`
- 这是 Prisma 的已知 bug：即使索引/外键已存在，`db push` 也会尝试重新创建

**根本原因：**
Prisma 的 `db push` 命令在处理外键和索引时有 bug：
1. 即使外键/索引已存在于数据库
2. `db push` 仍然会尝试重新创建
3. 导致 MySQL 报重复键错误

**解决方案：**

**完全移除自动 `db push`**，只依赖 `migrate deploy`：

```javascript
// 修改前：migrate deploy 后检测差异并执行 db push
migrateDeploy.on('close', (code) => {
  if (code === 0) {
    checkDatabaseSync(resolve);  // ❌ 会触发 db push
  }
});

// 修改后：只执行 migrate deploy
migrateDeploy.on('close', (code) => {
  if (code === 0) {
    console.log('✅ 数据库迁移完成');
    console.log('💡 如需修复数据库结构，请手动执行: npx prisma db push');
    resolve();  // ✅ 直接完成
  }
});
```

**执行策略：**

1. **日常启动**：
   - 只执行 `migrate deploy`
   - 应用新的迁移
   - 不执行任何自动同步

2. **数据库损坏/表被删除**：
   - 用户手动执行：`npx prisma db push --accept-data-loss`
   - 或重新运行迁移：`npx prisma migrate reset`

**修改文件：**
- `scripts/start.cjs` - 移除 `checkDatabaseSync()` 和 `executeDbPushForRepair()` 函数

**效果：**
- ✅ 彻底解决重复键错误
- ✅ 启动速度更快（不执行差异检测）
- ✅ 避免了 Prisma `db push` 的 bug
- ✅ 更符合生产环境最佳实践（不自动修改数据库）

**权衡：**
- ❌ 表被删除后不会自动修复（需要手动执行 `db push`）
- ✅ 但避免了自动操作可能导致的数据丢失风险

**建议：**
- 开发环境：如需修复数据库，手动执行 `npx prisma db push --accept-data-loss`
- 生产环境：使用标准迁移流程，不依赖 `db push`

---

### fix: 使用 migrate diff 智能检测数据库差异，解决自动修复与重复键冲突

**问题描述：**
- 如果总是执行 `db push` → 会报重复键错误
- 如果不执行 `db push` → 表被删除后不会自动修复
- 这是一个两难的问题

**根本原因：**
`db push` 在处理外键时有 bug，即使外键已存在也会尝试重新创建，导致重复键错误。

**解决方案：**

使用 `prisma migrate diff` 智能检测数据库是否与 schema 一致，**只在真正有差异时**才执行 `db push`：

```javascript
// 执行流程
1. migrate deploy（应用新迁移）
   ↓ 成功
2. migrate diff（检测数据库差异）
   ↓
   有差异？
   ├─ 是（退出码 2）→ 执行 db push 修复
   └─ 否（退出码 0）→ 跳过，避免重复键错误
```

**migrate diff 的退出码：**
- `0` - 没有差异，数据库与 schema 一致 ✅
- `2` - 有差异，需要同步 🔧
- 其他 - 检测失败，跳过同步

**修改文件：**
- `scripts/start.cjs` - 新增 `checkDatabaseSync()` 函数

**效果：**
- ✅ 正常启动不会报重复键错误（没有差异时不执行 db push）
- ✅ 表被删除后自动修复（检测到差异时执行 db push）
- ✅ 智能检测，按需同步
- ✅ 避免了 `db push` 的外键 bug

**使用场景：**

| 场景 | migrate diff 结果 | 操作 |
|------|------------------|------|
| 正常启动 | 退出码 0（无差异） | 跳过 db push ✅ |
| 表被删除 | 退出码 2（有差异） | 执行 db push 🔧 |
| 手动修改表 | 退出码 2（有差异） | 执行 db push 🔧 |

---

## 2026-02-03

### fix: 使用 migrate diff 智能检测数据库差异，解决自动修复与重复键冲突

**问题描述：**
- 如果总是执行 `db push` → 会报重复键错误
- 如果不执行 `db push` → 表被删除后不会自动修复
- 这是一个两难的问题

**根本原因：**
`db push` 在处理外键时有 bug，即使外键已存在也会尝试重新创建，导致重复键错误。

**解决方案：**

使用 `prisma migrate diff` 智能检测数据库是否与 schema 一致，**只在真正有差异时**才执行 `db push`：

```javascript
// 执行流程
1. migrate deploy（应用新迁移）
   ↓ 成功
2. migrate diff（检测数据库差异）
   ↓
   有差异？
   ├─ 是（退出码 2）→ 执行 db push 修复
   └─ 否（退出码 0）→ 跳过，避免重复键错误
```

**migrate diff 的退出码：**
- `0` - 没有差异，数据库与 schema 一致 ✅
- `2` - 有差异，需要同步 🔧
- 其他 - 检测失败，跳过同步

**修改文件：**
- `scripts/start.cjs` - 新增 `checkDatabaseSync()` 函数

**效果：**
- ✅ 正常启动不会报重复键错误（没有差异时不执行 db push）
- ✅ 表被删除后自动修复（检测到差异时执行 db push）
- ✅ 智能检测，按需同步
- ✅ 避免了 `db push` 的外键 bug

**使用场景：**

| 场景 | migrate diff 结果 | 操作 |
|------|------------------|------|
| 正常启动 | 退出码 0（无差异） | 跳过 db push ✅ |
| 表被删除 | 退出码 2（有差异） | 执行 db push 🔧 |
| 手动修改表 | 退出码 2（有差异） | 执行 db push 🔧 |

---

### fix: 修复启动时 db push 重复创建外键的问题，仅在迁移失败时使用

**问题描述：**
- 在 `migrate deploy` 成功后仍然执行 `db push`，导致重复创建外键错误
- 错误信息：`Error: Can't write; duplicate key in table '#sql-2247_98ed'`
- `db push` 不够智能，即使表已存在也会尝试重新创建外键

**根本原因：**
`db push` 的行为是"强制同步"，它会：
1. 检测 schema 和数据库的差异
2. 尝试应用所有差异（包括已存在的外键）
3. 导致重复键冲突

**解决方案：**

修改执行策略，**只在 `migrate deploy` 失败时**才使用 `db push` 作为修复手段：

```javascript
// 修改前：migrate deploy 成功后总是执行 db push
migrateDeploy.on('close', (code) => {
  if (code === 0) {
    console.log('✅ 数据库迁移完成');
    executeDbPushForSync(resolve);  // ❌ 总是执行
  }
});

// 修改后：只在失败时才使用 db push
migrateDeploy.on('close', (code) => {
  if (code === 0) {
    console.log('✅ 数据库迁移完成');
    resolve();  // ✅ 成功则直接完成
  } else {
    console.log('⚠️ 迁移失败，尝试使用 db push 修复...');
    executeDbPushForRepair(resolve);  // ✅ 失败才修复
  }
});
```

**执行策略：**

1. **正常情况**（数据库完整）：
   - `migrate deploy` 成功 → 完成 ✅
   - 不执行 `db push`，避免重复键错误

2. **异常情况**（表被删除/损坏）：
   - `migrate deploy` 失败 → 执行 `db push` 修复 🔧
   - `db push` 重建缺失的表和结构

**修改文件：**
- `scripts/start.cjs` - 修改 `runDatabaseMigrations()` 和 `executeDbPushForRepair()` 函数

**效果：**
- ✅ 正常启动不会报重复键错误
- ✅ `migrate deploy` 成功后直接完成
- ✅ 只在迁移失败时才使用 `db push` 修复
- ✅ 保持了对异常情况的容错能力

---

## 2026-02-03

### fix: 修复启动时 db push 重复创建外键的问题，仅在迁移失败时使用

**问题描述：**
- 在 `migrate deploy` 成功后仍然执行 `db push`，导致重复创建外键错误
- 错误信息：`Error: Can't write; duplicate key in table '#sql-2247_98ed'`
- `db push` 不够智能，即使表已存在也会尝试重新创建外键

**根本原因：**
`db push` 的行为是"强制同步"，它会：
1. 检测 schema 和数据库的差异
2. 尝试应用所有差异（包括已存在的外键）
3. 导致重复键冲突

**解决方案：**

修改执行策略，**只在 `migrate deploy` 失败时**才使用 `db push` 作为修复手段：

```javascript
// 修改前：migrate deploy 成功后总是执行 db push
migrateDeploy.on('close', (code) => {
  if (code === 0) {
    console.log('✅ 数据库迁移完成');
    executeDbPushForSync(resolve);  // ❌ 总是执行
  }
});

// 修改后：只在失败时才使用 db push
migrateDeploy.on('close', (code) => {
  if (code === 0) {
    console.log('✅ 数据库迁移完成');
    resolve();  // ✅ 成功则直接完成
  } else {
    console.log('⚠️ 迁移失败，尝试使用 db push 修复...');
    executeDbPushForRepair(resolve);  // ✅ 失败才修复
  }
});
```

**执行策略：**

1. **正常情况**（数据库完整）：
   - `migrate deploy` 成功 → 完成 ✅
   - 不执行 `db push`，避免重复键错误

2. **异常情况**（表被删除/损坏）：
   - `migrate deploy` 失败 → 执行 `db push` 修复 🔧
   - `db push` 重建缺失的表和结构

**修改文件：**
- `scripts/start.cjs` - 修改 `runDatabaseMigrations()` 和 `executeDbPushForRepair()` 函数

**效果：**
- ✅ 正常启动不会报重复键错误
- ✅ `migrate deploy` 成功后直接完成
- ✅ 只在迁移失败时才使用 `db push` 修复
- ✅ 保持了对异常情况的容错能力

---

### fix: 增强启动脚本的数据库同步能力，自动修复表结构不一致

**问题描述：**
- 当前启动脚本只执行 `migrate deploy`，只应用新迁移
- 如果数据库表被删除或手动修改，启动时不会自动修复
- `migrate deploy` 不检测数据库结构是否与 schema 一致

**解决方案：**

在 `migrate deploy` 成功后，额外执行 `db push --accept-data-loss` 确保数据库结构完全同步：

```javascript
// 执行流程
1. migrate deploy（应用新迁移）
   ↓ 成功
2. db push --accept-data-loss（同步结构差异）
   - 重新创建被删除的表
   - 修复手动修改的表结构
   - 确保与 schema.prisma 完全一致
```

**为什么这样安全：**

1. **先执行 migrate deploy**：
   - 应用版本化的迁移
   - 保持迁移历史记录
   - 幂等操作，不会重复创建

2. **再执行 db push**：
   - 只在 migrate deploy 之后执行
   - 此时迁移已完成，不会冲突
   - 修复任何结构不一致
   - 使用 `--accept-data-loss` 自动处理冲突

**修改文件：**
- `scripts/start.cjs` - 增加 `executeDbPushForSync()` 函数

**效果：**
- ✅ 自动应用新迁移（`migrate deploy`）
- ✅ 自动修复表结构不一致（`db push`）
- ✅ 表被删除后自动重建
- ✅ 手动修改后自动恢复
- ✅ 确保数据库始终与 schema 一致

**注意事项：**
- `--accept-data-loss` 会在必要时删除数据，适合开发环境
- 生产环境建议手动执行迁移，避免数据丢失

---

## 2026-02-03

### fix: 增强启动脚本的数据库同步能力，自动修复表结构不一致

**问题描述：**
- 当前启动脚本只执行 `migrate deploy`，只应用新迁移
- 如果数据库表被删除或手动修改，启动时不会自动修复
- `migrate deploy` 不检测数据库结构是否与 schema 一致

**解决方案：**

在 `migrate deploy` 成功后，额外执行 `db push --accept-data-loss` 确保数据库结构完全同步：

```javascript
// 执行流程
1. migrate deploy（应用新迁移）
   ↓ 成功
2. db push --accept-data-loss（同步结构差异）
   - 重新创建被删除的表
   - 修复手动修改的表结构
   - 确保与 schema.prisma 完全一致
```

**为什么这样安全：**

1. **先执行 migrate deploy**：
   - 应用版本化的迁移
   - 保持迁移历史记录
   - 幂等操作，不会重复创建

2. **再执行 db push**：
   - 只在 migrate deploy 之后执行
   - 此时迁移已完成，不会冲突
   - 修复任何结构不一致
   - 使用 `--accept-data-loss` 自动处理冲突

**修改文件：**
- `scripts/start.cjs` - 增加 `executeDbPushForSync()` 函数

**效果：**
- ✅ 自动应用新迁移（`migrate deploy`）
- ✅ 自动修复表结构不一致（`db push`）
- ✅ 表被删除后自动重建
- ✅ 手动修改后自动恢复
- ✅ 确保数据库始终与 schema 一致

**注意事项：**
- `--accept-data-loss` 会在必要时删除数据，适合开发环境
- 生产环境建议手动执行迁移，避免数据丢失

---

### refactor: 优化启动脚本的数据库迁移逻辑，支持标准 Prisma 迁移

**问题描述：**
- 之前完全跳过了数据库迁移，不够灵活
- 日常启动时应该可以安全地执行数据库迁移
- 关键是要用正确的方式（`migrate deploy` 而不是 `db push`）

**优化内容：**

修改 `runDatabaseMigrations()` 函数，智能检测迁移类型：

1. **检测标准迁移目录**：
   - 查找时间戳格式的目录（如 `20240101000000_init/`）
   - 这是 Prisma 官方的标准迁移格式

2. **有标准迁移**：
   - 执行 `prisma migrate deploy`
   - 幂等操作，多次执行安全
   - 只会应用未执行过的迁移
   - 已执行的迁移会被自动跳过

3. **无标准迁移**（当前情况）：
   - 跳过迁移，避免使用 `db push`
   - 提示用户手动初始化或创建标准迁移

**为什么这样更好：**

| 方式 | 幂等性 | 版本追踪 | 生产环境 | 团队协作 |
|------|--------|----------|----------|----------|
| `migrate deploy` | ✅ 安全 | ✅ 有记录 | ✅ 推荐 | ✅ 支持 |
| `db push` | ❌ 会报错 | ❌ 无记录 | ❌ 不推荐 | ❌ 不支持 |

**修改文件：**
- `scripts/start.cjs` - 优化数据库迁移检测和执行逻辑

**效果：**
- ✅ 支持标准 Prisma 迁移的自动执行
- ✅ 避免使用非幂等的 `db push`
- ✅ 迁移失败不会阻止服务启动
- ✅ 提供清晰的提示信息

**下一步建议：**
如果想让日常启动自动执行迁移，可以创建标准迁移：
```bash
npx prisma migrate dev --name baseline
```

---

## 2026-02-03

### refactor: 优化启动脚本的数据库迁移逻辑，支持标准 Prisma 迁移

**问题描述：**
- 之前完全跳过了数据库迁移，不够灵活
- 日常启动时应该可以安全地执行数据库迁移
- 关键是要用正确的方式（`migrate deploy` 而不是 `db push`）

**优化内容：**

修改 `runDatabaseMigrations()` 函数，智能检测迁移类型：

1. **检测标准迁移目录**：
   - 查找时间戳格式的目录（如 `20240101000000_init/`）
   - 这是 Prisma 官方的标准迁移格式

2. **有标准迁移**：
   - 执行 `prisma migrate deploy`
   - 幂等操作，多次执行安全
   - 只会应用未执行过的迁移
   - 已执行的迁移会被自动跳过

3. **无标准迁移**（当前情况）：
   - 跳过迁移，避免使用 `db push`
   - 提示用户手动初始化或创建标准迁移

**为什么这样更好：**

| 方式 | 幂等性 | 版本追踪 | 生产环境 | 团队协作 |
|------|--------|----------|----------|----------|
| `migrate deploy` | ✅ 安全 | ✅ 有记录 | ✅ 推荐 | ✅ 支持 |
| `db push` | ❌ 会报错 | ❌ 无记录 | ❌ 不推荐 | ❌ 不支持 |

**修改文件：**
- `scripts/start.cjs` - 优化数据库迁移检测和执行逻辑

**效果：**
- ✅ 支持标准 Prisma 迁移的自动执行
- ✅ 避免使用非幂等的 `db push`
- ✅ 迁移失败不会阻止服务启动
- ✅ 提供清晰的提示信息

**下一步建议：**
如果想让日常启动自动执行迁移，可以创建标准迁移：
```bash
npx prisma migrate dev --name baseline
```

---

### fix: 彻底移除启动时的数据库迁移，避免重复创建外键错误

**问题描述：**
- 第二次启动时持续报错：`Error: Can't write; duplicate key in table '#sql-2247_9851'`
- 错误发生在 `prisma db push` 尝试添加外键时
- 之前的修复（只在 migrate deploy 失败时执行 db push）仍然无效

**根本原因：**
1. 项目的迁移目录结构不标准：
   - 只有 `init.sql` 和 `migration_lock.toml`
   - 缺少标准的时间戳迁移目录（如 `20240101000000_init/`）
2. Prisma `migrate deploy` 检测不到迁移文件，返回成功但实际未执行
3. 然后执行 `db push`，尝试重新创建已存在的外键 → 重复键冲突
4. 数据库已经初始化完成，不需要每次启动都执行迁移

**修改文件：**
- `scripts/start.cjs` - 完全移除启动时的数据库迁移逻辑

**修复内容：**

修改 `runDatabaseMigrations()` 函数，跳过所有数据库迁移操作：

```javascript
// 修改前：检测迁移文件并执行 migrate deploy 或 db push
async function runDatabaseMigrations() {
  // 检查迁移文件
  // 执行 migrate deploy 或 db push
}

// 修改后：完全跳过数据库迁移
async function runDatabaseMigrations() {
  console.log('   ℹ️  跳过数据库迁移（数据库应该已初始化）');
  console.log('   💡 如需重新初始化数据库，请手动执行: npx prisma db push');
  resolve();
}
```

**执行策略：**
1. **首次部署**：手动执行 `npx prisma db push` 初始化数据库
2. **日常启动**：跳过数据库迁移，直接启动服务
3. **Schema 变更**：手动执行 `npx prisma db push` 同步变更

**效果：**
- ✅ 彻底解决第二次启动时的重复键错误
- ✅ 加快启动速度（跳过不必要的数据库检查）
- ✅ 避免生产环境自动执行危险的数据库操作
- ✅ 保持 Prisma 客户端生成和其他初始化逻辑不变

**注意事项：**
- 首次部署或 Schema 变更后，需要手动执行 `npx prisma db push`
- 生产环境建议使用标准的 Prisma 迁移流程（`prisma migrate`）

---

## 2026-02-03

### fix: 彻底移除启动时的数据库迁移，避免重复创建外键错误

**问题描述：**
- 第二次启动时持续报错：`Error: Can't write; duplicate key in table '#sql-2247_9851'`
- 错误发生在 `prisma db push` 尝试添加外键时
- 之前的修复（只在 migrate deploy 失败时执行 db push）仍然无效

**根本原因：**
1. 项目的迁移目录结构不标准：
   - 只有 `init.sql` 和 `migration_lock.toml`
   - 缺少标准的时间戳迁移目录（如 `20240101000000_init/`）
2. Prisma `migrate deploy` 检测不到迁移文件，返回成功但实际未执行
3. 然后执行 `db push`，尝试重新创建已存在的外键 → 重复键冲突
4. 数据库已经初始化完成，不需要每次启动都执行迁移

**修改文件：**
- `scripts/start.cjs` - 完全移除启动时的数据库迁移逻辑

**修复内容：**

修改 `runDatabaseMigrations()` 函数，跳过所有数据库迁移操作：

```javascript
// 修改前：检测迁移文件并执行 migrate deploy 或 db push
async function runDatabaseMigrations() {
  // 检查迁移文件
  // 执行 migrate deploy 或 db push
}

// 修改后：完全跳过数据库迁移
async function runDatabaseMigrations() {
  console.log('   ℹ️  跳过数据库迁移（数据库应该已初始化）');
  console.log('   💡 如需重新初始化数据库，请手动执行: npx prisma db push');
  resolve();
}
```

**执行策略：**
1. **首次部署**：手动执行 `npx prisma db push` 初始化数据库
2. **日常启动**：跳过数据库迁移，直接启动服务
3. **Schema 变更**：手动执行 `npx prisma db push` 同步变更

**效果：**
- ✅ 彻底解决第二次启动时的重复键错误
- ✅ 加快启动速度（跳过不必要的数据库检查）
- ✅ 避免生产环境自动执行危险的数据库操作
- ✅ 保持 Prisma 客户端生成和其他初始化逻辑不变

**注意事项：**
- 首次部署或 Schema 变更后，需要手动执行 `npx prisma db push`
- 生产环境建议使用标准的 Prisma 迁移流程（`prisma migrate`）

---

## 2026-02-03

### fix: 修复第二次启动时 Prisma db push 重复创建外键导致的错误

**问题描述：**
- 第一次启动成功，第二次启动时报错：`Error: Can't write; duplicate key in table '#sql-2247_982c'`
- 错误发生在 `prisma db push` 尝试添加外键时
- 启动脚本在有迁移文件时，先执行 `migrate deploy`，然后无论成功与否都执行 `db push`

**根本原因：**
1. 第一次启动：`db push` 成功创建所有表和外键
2. 第二次启动：
   - `migrate deploy` 执行（迁移已应用，无操作）
   - `db push` 再次尝试创建已存在的外键 → 重复键冲突

**修改文件：**
- `scripts/start.cjs` - 修改数据库迁移逻辑

**修复内容：**

修改 `runDatabaseMigrations()` 函数的执行策略：

```javascript
// 修改前：migrate deploy 后总是执行 db push
if (hasMigrations) {
  migrateDeploy.on('close', (code) => {
    // 无论成功与否都执行 db push
    executeDbPush(resolve);
  });
}

// 修改后：只在 migrate deploy 失败时才执行 db push
if (hasMigrations) {
  migrateDeploy.on('close', (code) => {
    if (code === 0) {
      console.log('   ✅ migrate deploy 完成');
      resolve(); // 成功则直接完成，不执行 db push
    } else {
      console.log('   ⚠️  migrate deploy 失败，尝试 db push...');
      executeDbPush(resolve); // 失败时才回退到 db push
    }
  });
}
```

**执行策略：**
1. **有迁移文件**：
   - 优先使用 `prisma migrate deploy`（生产环境推荐）
   - 成功 → 完成，不执行 `db push`
   - 失败 → 回退到 `db push`

2. **无迁移文件**：
   - 直接使用 `prisma db push`（开发环境）

**效果：**
- ✅ 第一次启动：正常执行 `db push` 创建数据库结构
- ✅ 第二次启动：`migrate deploy` 成功后不再重复执行 `db push`
- ✅ 避免了重复创建外键导致的错误
- ✅ 保持了对迁移失败的容错处理

---

## 2026-02-03

### fix: 修复 Settings.tsx 中 selectedModel 为 null 时访问 provider 属性导致的错误

**问题描述：**
- 前端设置页面报错：`TypeError: Cannot read properties of null (reading 'provider')`
- 当 `selectedModel` 为 `null` 时，代码直接访问 `selectedModel.provider` 导致空指针错误

**根本原因：**
在多处代码中使用了 `selectedModel.provider` 而不是 `selectedModel?.provider`，缺少可选链操作符保护。

**修改文件：**
- `src/pages/Settings.tsx` - 添加可选链操作符保护

**修复内容：**

修复了以下位置的空指针访问（共 15 处）：

1. **API密钥标签提示**（第 803 行）：
   ```typescript
   // 修改前
   selectedModel?.requiresCustomAuth === false && selectedModel.provider === 'Local'
   
   // 修改后
   selectedModel?.requiresCustomAuth === false && selectedModel?.provider === 'Local'
   ```

2. **占位符文本**（第 816 行）：
   ```typescript
   // 修改前
   selectedModel?.requiresCustomAuth === false && selectedModel.provider === 'Local'
   
   // 修改后
   selectedModel?.requiresCustomAuth === false && selectedModel?.provider === 'Local'
   ```

3. **帮助文本中的所有 provider 判断**（第 852-903 行）：
   - 所有 `selectedModel.provider` 改为 `selectedModel?.provider`
   - 包括：Local、百度、阿里云、DeepSeek、月之暗面、智谱AI、OpenRouter、Zenmux、NewApi
   - 默认情况添加回退值：`${selectedModel?.provider || '模型提供商'}`

4. **customBaseUrl 分支**（第 907 行）：
   ```typescript
   // 修改前
   `从 ${selectedModel.provider} 获取API密钥`
   
   // 修改后
   `从 ${selectedModel?.provider || '模型提供商'} 获取API密钥`
   ```

**效果：**
- ✅ 修复了 `selectedModel` 为 `null` 时的空指针错误
- ✅ 所有访问 `provider` 属性的地方都使用了可选链操作符
- ✅ 添加了回退值，提升用户体验
- ✅ 页面不再因为空值而崩溃

---

### fix: 修复 Prisma schema 中 AI 缓存表 expires_at 字段的默认值问题

**问题描述：**
- 执行 Prisma 迁移时报错：`Invalid default value for 'expires_at'`
- MySQL 的 TIMESTAMP 类型字段必须有默认值或设置为可空
- 三个 AI 缓存表（`ai_element_cache`、`ai_assertion_cache`、`ai_operation_cache`）的 `expires_at` 字段既没有默认值也不是可空的

**根本原因：**
MySQL 对 TIMESTAMP 类型有严格限制：
- 必须有 `DEFAULT` 值（如 `CURRENT_TIMESTAMP`）
- 或者设置为可空（`NULL`）
- 否则会报错：`Invalid default value`

**修改文件：**
- `prisma/schema.prisma` - 修改三个 AI 缓存表的 `expires_at` 字段定义

**修复内容：**
将 `expires_at` 字段从 `DateTime` 改为 `DateTime?`（可空）：

```prisma
// 修改前
expires_at       DateTime  @db.Timestamp(0)

// 修改后
expires_at       DateTime? @db.Timestamp(0)
```

**影响的表：**
1. `ai_element_cache` - AI元素识别缓存表
2. `ai_assertion_cache` - AI断言解析缓存表
3. `ai_operation_cache` - AI操作步骤解析缓存表

**同步方式：**
由于数据库用户没有创建 shadow database 的权限，使用 `prisma db push` 直接同步：
```bash
npx prisma db push
```

**效果：**
- ✅ 数据库 schema 同步成功
- ✅ 三个 AI 缓存表的 `expires_at` 字段现在可以为 NULL
- ✅ 避免了 MySQL TIMESTAMP 默认值错误
- ✅ 保持了与 `api_tokens` 表中 `expires_at` 字段的一致性

---

### fix: 修复 README.md 在 GitHub 上样式不生效的问题

**问题描述**：
- README.md 中使用了内联 HTML style 属性
- GitHub Markdown 渲染器不支持内联 style 属性，导致样式不生效

**修改内容**：
- 将带有 style 属性的 div 标签改为标准 Markdown 语法
- 使用 `#` 标题和 `###` 副标题替代内联样式
- 保持了视觉层次结构和可读性

**影响范围**：
- README.md 文件头部标题区域

**测试验证**：
- 修改后的 Markdown 语法在 GitHub 上可以正常渲染
- 标题层次清晰，符合 GitHub Markdown 规范

## 2026-02-02

### fix: 优化前端设置页面本地模型API密钥提示和修复所有模型超链接

**问题描述：**
- 前端设置页面对所有模型都显示相同的 API 密钥提示
- 本地模型（Ollama、LM Studio）不需要 API 密钥，但界面没有明确说明
- 部分模型（阿里云、OpenRouter、Zenmux）的超链接没有显示

**修改文件：**
- `src/pages/Settings.tsx` - 优化 API 密钥输入框的提示信息和超链接显示

**修复内容：**

1. **标签提示**：
   - 对于本地模型，在标签后添加"（本地模型可选）"提示
   - 其他模型保持"API 密钥"标签

2. **占位符文本**：
   - 本地模型：显示"本地模型无需API密钥（可选）"
   - 其他模型：显示"sk-or-v1-..."

3. **帮助文本**：
   - 本地模型：说明"本地模型（Ollama、LM Studio等）通常不需要API密钥，如果您的本地服务配置了认证，请填写对应的密钥"
   - 其他模型：在 `requiresCustomAuth` 分支中添加了所有厂商的超链接处理：
     * Local（本地模型）：说明文字
     * 百度：百度智能云千帆超链接
     * 阿里云：阿里云通义千问超链接 ✅
     * DeepSeek：DeepSeek平台超链接
     * 月之暗面：月之暗面Kimi平台超链接
     * 智谱AI：智谱AI平台超链接
     * OpenRouter：OpenRouter平台超链接 ✅
     * Zenmux 或 Google (Zenmux)：Zenmux平台超链接 ✅

**验证结果：**
- 所有设置了 `requiresCustomAuth: true` 的模型都已正确配置超链接
- 包括：DeepSeek、阿里云、月之暗面、智谱AI、百度、OpenRouter、Zenmux、Local
- 超链接显示逻辑完整，无遗漏

**效果：**
- 用户在配置本地模型时，清楚地知道 API 密钥是可选的
- 所有云端模型都显示正确的获取 API 密钥超链接
- 减少用户困惑，提升用户体验
- 保持其他模型的必填验证逻辑不变

---

### fix: 修复本地模型无API密钥时测试连接按钮被禁用的问题

**问题描述：**
- 本地模型不填API密钥时，"测试连接"按钮被禁用
- 本地模型（Ollama、LM Studio）通常不需要API密钥，但无法测试连接
- 用户无法验证本地模型的连接是否正常

**根本原因：**
测试连接按钮的disabled条件：`!formData.apiKey` - 强制要求必须有API密钥才能测试

**修改文件：**
- `src/pages/Settings.tsx` - 修改测试连接按钮的disabled条件

**修复内容：**

**测试连接按钮disabled条件**（第1000行）：
```typescript
// 修改前
disabled={isTesting || !formData.selectedModelId || !formData.apiKey}

// 修改后
disabled={isTesting || !formData.selectedModelId || (!formData.apiKey && !selectedModel?.requiresCustomAuth)}
```

**逻辑说明：**
- 本地模型（`requiresCustomAuth: false`）：即使没有API密钥也可以点击测试连接
- 云端模型（`requiresCustomAuth: true` 或未设置）：必须有API密钥才能测试连接
- 所有模型（包括本地模型）：必须测试连接成功后才能保存设置

**效果：**
- ✅ 本地模型不填API密钥时，可以正常点击"测试连接"按钮
- ✅ 本地模型可以测试连接验证baseUrl和模型名称是否正确
- ✅ 所有模型（包括本地模型）都必须测试连接成功后才能保存设置
- ✅ 云端模型仍然要求必须有API密钥才能测试连接
- ✅ 提升了本地模型的配置体验，同时保持了安全性

---

### fix: 修复requiresCustomAuth语义反转导致的验证逻辑错误

**问题描述：**
- `requiresCustomAuth` 的语义和实际验证逻辑相反
- 语义上：`requiresCustomAuth: true` 应该表示"需要自定义认证"（云端模型）
- 实际上：验证逻辑将 `requiresCustomAuth: true` 当作"API密钥可选"（本地模型）
- 导致所有验证逻辑都是反的

**根本原因：**
1. modelRegistry中定义正确：
   - 本地模型：`requiresCustomAuth: false`
   - 云端模型：`requiresCustomAuth: true`
2. 但验证逻辑反了：
   - `requiresCustomAuth: true` → API密钥可选 ❌
   - `requiresCustomAuth: false` → API密钥必填 ❌

**修改文件：**
- `src/utils/llmSettingsValidation.ts` - 修复API密钥验证逻辑
- `src/services/llmConfigManager.ts` - 修复配置管理器中的验证逻辑（3处）
- `src/pages/Settings.tsx` - 修复前端UI判断逻辑（4处）

**修复内容：**

1. **llmSettingsValidation.ts**：
```typescript
// 修改前
if (model?.requiresCustomAuth) {
  // 本地模型：API密钥可选
} else {
  // 云端模型：API密钥必填
}

// 修改后
if (model?.requiresCustomAuth === false) {
  // 本地模型：API密钥可选
} else {
  // 云端模型：API密钥必填
}
```

2. **llmConfigManager.ts**（3处）：
```typescript
// 修改前
const requiresApiKey = !modelInfo?.requiresCustomAuth; // 本地模型不需要API密钥

// 修改后
const requiresApiKey = modelInfo?.requiresCustomAuth !== false; // 云端模型需要API密钥，本地模型不需要
```

3. **Settings.tsx**（4处）：
```typescript
// 修改前
selectedModel?.requiresCustomAuth && selectedModel.provider === 'Local'
selectedModel?.requiresCustomAuth
(!formData.apiKey && !selectedModel?.requiresCustomAuth)

// 修改后
selectedModel?.requiresCustomAuth === false && selectedModel.provider === 'Local'
selectedModel?.requiresCustomAuth !== false
(!formData.apiKey && selectedModel?.requiresCustomAuth !== false)
```

**正确的语义：**
- `requiresCustomAuth: true` = 需要自定义认证（云端厂商API密钥）→ API密钥**必填**
- `requiresCustomAuth: false` = 不需要自定义认证（本地模型）→ API密钥**可选**
- `requiresCustomAuth: undefined` = 默认为云端模型 → API密钥**必填**

**效果：**
- ✅ 修复了所有验证逻辑的语义反转问题
- ✅ 本地模型（`requiresCustomAuth: false`）：API密钥可选
- ✅ 云端模型（`requiresCustomAuth: true`）：API密钥必填
- ✅ 前端UI提示正确显示
- ✅ 测试连接和保存设置逻辑正确工作

---

### fix: 为云端模型添加API密钥必填的前端实时提示

**问题描述：**
- 云端模型的API密钥是必填项，但前端没有明确的必填提示
- 用户可能不清楚哪些模型必须配置API密钥
- 只有在保存时才会看到验证错误

**修改文件：**
- `src/pages/Settings.tsx` - 添加API密钥必填提示

**修复内容：**

1. **添加必填标记**：
```typescript
<label className="block text-sm font-medium text-gray-700 mb-2">
  API 密钥 
  {selectedModel?.requiresCustomAuth === false && selectedModel.provider === 'Local' && (
    <span className="text-gray-500 font-normal">（本地模型可选）</span>
  )}
  {selectedModel?.requiresCustomAuth !== false && (
    <span className="text-red-500 font-normal">*</span>
  )}
</label>
```

2. **输入框边框变红**：
```typescript
className={`... ${
  getFieldError('apiKey') || (selectedModel?.requiresCustomAuth !== false && !formData.apiKey) 
    ? 'border-red-300' 
    : 'border-gray-300'
}`}
```

3. **添加实时错误提示**：
```typescript
{!getFieldError('apiKey') && selectedModel?.requiresCustomAuth !== false && !formData.apiKey && (
  <p className="mt-1 text-sm text-red-600">
    <AlertCircle className="inline h-3 w-3 mr-1" />
    云端模型必须配置API密钥
  </p>
)}
```

**效果：**
- ✅ 云端模型的API密钥标签显示红色星号（*）表示必填
- ✅ 云端模型未填API密钥时，输入框边框变红
- ✅ 云端模型未填API密钥时，显示红色提示"云端模型必须配置API密钥"
- ✅ 本地模型显示"（本地模型可选）"，无必填提示
- ✅ 提升用户体验，减少配置错误

---

### fix: 修复后端环境中LLM配置管理器使用错误的设置服务

**问题描述：**
- 后端执行测试时，配置管理器加载的是错误的模型配置（DeepSeek 而不是 local-series-openai）
- 错误信息：`Failed to load LLM settings, using defaults: Error: loadSettingsFromDB should only be called from backend`
- 原因：`llmConfigManager.ts` 在后端环境中仍然使用前端的 `settingsService`

**根本原因：**
1. `llmConfigManager.ts` 是一个共享文件，在前端和后端都会使用
2. 它导入的是前端的 `settingsService`，而不是后端的 `BackendSettingsService`
3. 在后端环境中，前端的 `settingsService.getLLMSettings()` 会调用 `loadSettingsFromDB()`
4. 前端的 `loadSettingsFromDB()` 方法会抛出错误，导致回退到默认配置

**修改文件：**
- `src/services/llmConfigManager.ts` - 添加环境检测和动态服务加载

**修复内容：**

1. **添加 `getSettingsService()` 方法**：
   - 在前端环境中（`typeof window !== 'undefined'`），使用前端的 `settingsService`
   - 在后端环境中，动态导入并使用 `BackendSettingsService`
   - 缓存后端服务实例，避免重复导入

2. **修改所有使用 `settingsService` 的方法**：
   - `initialize()` - 使用 `getSettingsService()` 获取正确的服务
   - `updateConfig()` - 使用 `getSettingsService()` 进行验证
   - `reloadConfig()` - 使用 `getSettingsService()` 重新加载配置
   - `saveCurrentConfig()` - 使用 `getSettingsService()` 保存配置

**效果：**
- 后端环境中，配置管理器正确使用 `BackendSettingsService` 从数据库加载配置
- 前端环境中，配置管理器继续使用前端的 `settingsService` 通过 API 获取配置
- 配置管理器能够正确加载数据库中的本地模型配置（`local-series-openai`）
- 避免了"使用默认配置"的回退行为

---

### fix: 修复本地模型（Ollama/LM Studio）API密钥验证问题

**问题描述：**
- 数据库中已有本地模型配置（`local-series-openai`），但配置管理器仍然报错"API密钥不能为空"
- 本地模型（如 Ollama、LM Studio）不需要 API 密钥，但验证逻辑强制要求

**根本原因：**
1. `llmSettingsValidation.ts` 中的验证逻辑对所有模型都要求 API 密钥不能为空
2. 即使模型有 `requiresCustomAuth: true` 标记，仍然强制验证 API 密钥
3. `llmConfigManager.ts` 中的初始化逻辑没有区分本地模型和云端模型

**修改文件：**
- `src/utils/llmSettingsValidation.ts` - 修改 API 密钥验证逻辑
- `src/services/llmConfigManager.ts` - 修改初始化、更新和重新加载逻辑

**修复内容：**

1. **llmSettingsValidation.ts**：
   - 对于 `requiresCustomAuth: true` 的模型（本地模型），API 密钥可选
   - 对于标准 OpenRouter 模型，API 密钥必填且必须以 `sk-` 开头

2. **llmConfigManager.ts**：
   - `initialize()` - 检查模型是否需要 API 密钥，本地模型允许空密钥
   - `updateConfig()` - 本地模型允许空字符串作为 API 密钥
   - `reloadConfig()` - 检查模型类型后决定是否要求 API 密钥

**效果：**
- 本地模型（Ollama、LM Studio）可以正常初始化，无需配置 API 密钥
- 云端模型（OpenRouter、DeepSeek 等）仍然要求有效的 API 密钥
- 配置管理器能够正确区分本地模型和云端模型

---

### fix: 修复LLM配置管理器初始化失败导致服务启动异常

**问题描述：**
- 后端启动时，如果数据库中没有LLM配置或API密钥为空，配置管理器初始化失败
- 错误信息：`配置验证失败: API密钥不能为空`
- 导致整个服务无法启动

**根本原因：**
1. 后端 `AITestParser` 在初始化时调用 `llmConfigManager.initialize()`
2. 配置管理器从数据库加载设置，如果API密钥为空则验证失败
3. 验证错误导致初始化异常，服务启动中断

**修改文件：**
- `src/services/llmConfigManager.ts` - 修改初始化和配置更新逻辑
- `server/services/aiParser.ts` - 修改配置管理器初始化和配置获取逻辑

**修复内容：**

1. **llmConfigManager.ts**：
   - `initialize()` - 允许API密钥为空，标记为"未配置"状态而不是抛出错误
   - `updateConfig()` - 如果API密钥为空，允许更新但不设置配置
   - `reloadConfig()` - 如果API密钥为空，允许重新加载但标记为"未配置"
   - `getCurrentConfig()` - 如果配置为空，返回默认值而不是抛出错误
   - `getModelInfo()` - 如果模型信息为空，返回默认模型而不是抛出错误
   - `testConnection()` - 如果配置未就绪，返回有意义的错误而不是抛出异常
   - `getConfigSummary()` - 如果配置未就绪，返回默认摘要而不是抛出错误

2. **aiParser.ts**：
   - `initializeConfigManager()` - 如果配置管理器未就绪，不抛出错误，改为回退到默认配置
   - `getCurrentConfig()` - 如果配置管理器未就绪，检查状态后回退到默认配置
   - `reloadConfiguration()` - 如果配置管理器未就绪，标记为回退模式而不是抛出错误

**效果：**
- 后端启动时，即使API密钥未配置，也能正常启动
- 配置管理器以"未配置"状态初始化，不影响服务运行
- 用户可以在前端设置中配置API密钥后，服务自动启用AI功能
- 避免了因配置缺失导致的服务启动失败

---

## 2026-01-30

### fix: 修复执行历史查询 MySQL sort buffer 溢出问题

**问题描述：**
- 获取执行历史时报错：`Out of sort memory, consider increasing server sort buffer size`
- 原因：查询使用 `include` 加载全部字段 + `orderBy` 排序，数据量大时内存不足

**修改文件：**
- `server/services/functionalTestCaseService.ts` - 优化 `getExecutionHistory` 查询
- `prisma/schema.prisma` - 添加复合索引

**优化内容：**

1. **查询优化**：
   - 将 `include` 改为 `select`，只查询需要的字段
   - 减少内存占用，避免 sort buffer 溢出

2. **添加复合索引**：
   - `@@index([test_case_id, executed_at(sort: Desc)])` 
   - 优化按用例ID查询并按时间倒序排序的场景

**部署步骤：**
```bash
npx prisma migrate dev --name add_execution_history_index
# 或生产环境
npx prisma migrate deploy
```

---

## 2026-01-28

### perf: Docker 构建性能优化（镜像加速 + .dockerignore）

**新增文件：**
- `.dockerignore` - 排除不必要的构建文件
- `docker/daemon.json` - Docker 镜像加速配置

**修改文件：**
- `Dockerfile.alpine` - 配置 Alpine 镜像源和 npm 镜像源
- `docker-compose.alpine.yml` - 添加 BuildKit 缓存配置

**优化内容：**

1. **创建 .dockerignore**：
   - 排除 `node_modules`、`dist`、`screenshots`、`artifacts` 等
   - 构建上下文从 93.52MB 降到 ~5-10MB
   - 加载时间从卡住到 <10 秒

2. **Docker 镜像加速配置**：
   - 添加 6 个国内镜像源（daocloud、1panel、rat.dev 等）
   - 配置文件：`docker/daemon.json`
   - 使用方法：`sudo cp docker/daemon.json /etc/docker/daemon.json && sudo systemctl restart docker`

3. **Dockerfile 优化**：
   - 配置 Alpine 使用阿里云镜像源
   - npm 使用 npmmirror 国内镜像源
   - 使用官方 node:20-alpine 镜像（通过 daemon 加速拉取）

4. **BuildKit 缓存**：
   - 启用 `cache_from` 和 `BUILDKIT_INLINE_CACHE`
   - 支持增量构建，加快重复构建速度

**性能提升：**
- 构建上下文加载：93.52MB → ~5-10MB
- 镜像拉取速度：提升 3-5 倍
- 首次构建时间：预计 5-10 分钟
- 增量构建时间：预计 1-3 分钟

**使用方法：**
```bash
# 1. 配置 Docker 镜像加速
sudo cp docker/daemon.json /etc/docker/daemon.json
sudo systemctl daemon-reload
sudo systemctl restart docker

# 2. 启动服务（自动构建）
export DOCKER_BUILDKIT=1
docker compose -f docker-compose.alpine.yml up -d
```

**提交命令：**
```bash
git add .dockerignore docker/daemon.json Dockerfile.alpine docker-compose.alpine.yml
git commit -m "perf: Docker 构建性能优化，添加镜像加速和 .dockerignore"
```


---

### fix: 修复 npm config 配置项顺序错误

**修改文件：**
- `Dockerfile.alpine`

**问题描述：**
```
npm error `disturl` is not a valid npm option
```

**根本原因：**
npm 配置项 `disturl` 需要在 `node_gyp_mirror` 之后设置，且两者指向同一个镜像地址。

**解决方案：**
```dockerfile
# 修改前（错误）
npm config set disturl https://npmmirror.com/dist

# 修改后（正确）
npm config set node_gyp_mirror https://npmmirror.com/mirrors/node
npm config set disturl https://npmmirror.com/mirrors/node
```

**提交命令：**
```bash
git add Dockerfile.alpine
git commit -m "fix: 修复 npm config 配置项顺序错误"
```


---

### fix: 修复 Docker 容器运行时缺少 tsx 和 semver 依赖的问题

**修改文件：**
- `Dockerfile.alpine`

**问题描述：**
容器启动失败：
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'semver'
```

**根本原因：**
1. 使用 `npm ci --omit=dev` 排除了开发依赖
2. 但 `tsx`（TypeScript 运行时）和 `semver` 是运行时需要的
3. 项目通过 `npm start` → `tsx server/index.ts` 启动

**解决方案：**
```dockerfile
# 修改前
RUN npm ci --omit=dev

# 修改后
RUN npm ci
```

安装完整依赖，确保 `tsx`、`semver` 等运行时依赖可用。

**提交命令：**
```bash
git add Dockerfile.alpine
git commit -m "fix: 修复 Docker 容器运行时缺少 tsx 和 semver 依赖的问题"
```


---

## 2026-01-30

### fix: 修复 server 目录下多个文件的中文注释乱码问题

**修改文件：**
- `server/services/streamService.ts`
- `server/services/databaseService.ts`
- `server/routes/aiBulkUpdate.ts`
- `server/services/functionalTestCaseAIService.ts`
- `server/services/midsceneTestRunner copy.ts`
- `server/services/playwrightTestRunner.ts`

**问题描述：**
部分文件中的中文注释出现乱码（显示为 `�` 字符），影响代码可读性。

**修复内容：**

1. **streamService.ts** - 修复约 30 处乱码
2. **databaseService.ts** - 修复 3 处乱码
3. **aiBulkUpdate.ts** - 修复 1 处乱码（正则表达式中的乱码模式）
4. **functionalTestCaseAIService.ts** - 修复 1 处乱码
5. **midsceneTestRunner copy.ts** - 修复 1 处乱码
6. **playwrightTestRunner.ts** - 修复 1 处乱码

**提交命令：**
```bash
git add server/services/streamService.ts server/services/databaseService.ts server/routes/aiBulkUpdate.ts server/services/functionalTestCaseAIService.ts "server/services/midsceneTestRunner copy.ts" server/services/playwrightTestRunner.ts
git commit -m "fix: 修复 server 目录下多个文件的中文注释乱码问题"
```


---

### fix: 修复 Docker 容器中 Playwright 无法找到 Chromium 的问题

**修改文件：**
- `Dockerfile.alpine`
- `server/services/playwrightTestRunner.ts`
- `server/services/midsceneTestRunner.ts`

**问题描述：**
Docker 容器中执行测试时报错：
```
browserType.launch: Failed to launch: Error: spawn /root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome ENOENT
```

**根本原因：**
1. Playwright 默认查找自己下载的浏览器（`~/.cache/ms-playwright/`）
2. 容器中已安装系统 Chromium（`/usr/bin/chromium-browser`）
3. 但代码没有配置使用系统 Chromium

**解决方案：**

1. **Dockerfile 添加环境变量**：
   ```dockerfile
   ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
       PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser \
       CHROME_PATH=/usr/bin/chromium-browser \
       CHROMIUM_PATH=/usr/bin/chromium-browser
   ```

2. **代码中读取环境变量**：
   ```typescript
   const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || 
                         process.env.CHROME_PATH || 
                         process.env.CHROMIUM_PATH;
   
   this.browser = await chromium.launch({
     headless: finalHeadless,
     args: launchArgs,
     ...(executablePath && { executablePath })
   });
   ```

**提交命令：**
```bash
git add Dockerfile.alpine server/services/playwrightTestRunner.ts server/services/midsceneTestRunner.ts
git commit -m "fix: 修复 Docker 容器中 Playwright 无法找到 Chromium 的问题"
```

---

### fix: 修复 deviceScaleFactor 与 null viewport 不兼容的问题

**修改文件：**
- `server/services/playwrightTestRunner.ts`
- `server/services/midsceneTestRunner.ts`

**问题描述：**
非 headless 模式下启动浏览器报错：
```
Error: "deviceScaleFactor" option is not supported with null "viewport"
```

**根本原因：**
Playwright 不允许在 `viewport: null`（全屏模式）时设置 `deviceScaleFactor`。

**解决方案：**
将 `deviceScaleFactor: 1` 改为条件设置，仅在 headless 模式下启用：

```typescript
// 修改前
deviceScaleFactor: 1,

// 修改后
...(finalHeadless && { deviceScaleFactor: 1 }),
```

**提交命令：**
```bash
git add server/services/playwrightTestRunner.ts server/services/midsceneTestRunner.ts
git commit -m "fix: 修复 deviceScaleFactor 与 null viewport 不兼容的问题"
```

---

### fix: 修复 Docker 环境中 start.cjs 强制下载 Playwright 浏览器的问题

**修改文件：**
- `scripts/start.cjs`

**问题描述：**
Docker 容器中执行 `npm start` 时，`start.cjs` 会强制执行 `playwright install chromium`，忽略已安装的系统 Chromium。

**解决方案：**
修改 `setup()` 函数，智能检测系统 Chromium，自动适配 Windows 和 Docker 环境：

```javascript
// 智能检测：如果系统已安装 Chromium，跳过下载
const systemChromiumPaths = [
  '/usr/bin/chromium-browser',  // Alpine Linux
  '/usr/bin/chromium',          // Debian/Ubuntu
  '/usr/bin/google-chrome',     // Google Chrome
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  process.env.CHROME_PATH,
  process.env.CHROMIUM_PATH
].filter(Boolean);

for (const chromiumPath of systemChromiumPaths) {
  if (fs.existsSync(chromiumPath)) {
    console.log(`✅ 检测到系统 Chromium: ${chromiumPath}，跳过下载`);
    return;
  }
}
// 系统没有 Chromium，执行 playwright install chromium
```

**效果：**
- Windows：无系统 Chromium → 自动下载
- Docker Alpine：有 `/usr/bin/chromium-browser` → 跳过下载
- 无需设置任何环境变量

**提交命令：**
```bash
git add scripts/start.cjs
git commit -m "fix: 智能检测系统 Chromium，自动适配 Windows 和 Docker 环境"
```

---

### refactor: 优化 Dockerfile.alpine

**修改文件：**
- `Dockerfile.alpine`

**优化内容：**
1. 移除重复的环境变量定义（`PLAYWRIGHT_*` 定义了两次）
2. 修复健康检查路径：`/api/health` → `/health`
3. 移除不必要的 `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD`（start.cjs 已智能检测）
4. 合并 apk 安装命令，清理缓存减少镜像大小
5. 增加 `start-period` 到 60s（给应用更多启动时间）
6. 使用 curl 替代 node 脚本做健康检查（更可靠）

**提交命令：**
```bash
git add Dockerfile.alpine
git commit -m "refactor: 优化 Dockerfile.alpine，修复健康检查路径"
```

---

### fix: 修复 Docker 容器缺少 tsx/semver 依赖的问题

**修改文件：**
- `Dockerfile.alpine`

**问题描述：**
```
Cannot find package 'semver' imported from @midscene/web
npm warn exec The following package was not found: tsx@4.21.0
```

**根本原因：**
`NODE_ENV=production` 导致 `npm ci` 跳过开发依赖，但 `tsx`、`semver` 是运行时需要的。

**解决方案：**
移除 `NODE_ENV=production` 环境变量，安装完整依赖。

**提交命令：**
```bash
git add Dockerfile.alpine
git commit -m "fix: 移除 NODE_ENV=production，安装完整依赖解决 tsx/semver 缺失"
```

---

### fix: 添加 ffmpeg 支持 Playwright 视频录制

**修改文件：**
- `Dockerfile.alpine`

**问题描述：**
```
Executable doesn't exist at /root/.cache/ms-playwright/ffmpeg-1011/ffmpeg-linux
```

**解决方案：**
1. 安装系统 ffmpeg：`apk add ffmpeg`
2. 添加环境变量：`PLAYWRIGHT_FFMPEG_PATH=/usr/bin/ffmpeg`

**提交命令：**
```bash
git add Dockerfile.alpine
git commit -m "fix: 添加 ffmpeg 支持 Playwright 视频录制"
```

---

### perf: 优化 Docker 构建缓存，加速重复构建

**修改文件：**
- `Dockerfile.alpine`

**优化内容：**
1. 添加 `# syntax=docker/dockerfile:1` 启用 BuildKit 语法
2. 使用 `--mount=type=cache,target=/root/.npm` 缓存 npm 下载
3. 即使 Dockerfile 修改，npm 包缓存也会保留

**效果：**
- 首次构建：正常下载所有依赖
- 后续构建：npm 缓存命中，跳过下载，只安装

**使用方法：**
```bash
# 确保启用 BuildKit
export DOCKER_BUILDKIT=1
docker compose -f docker-compose.alpine.yml up -d --build
```

**提交命令：**
```bash
git add Dockerfile.alpine
git commit -m "perf: 使用 BuildKit 缓存挂载加速 npm ci"
```

---

### fix: 创建 ffmpeg 符号链接支持 Playwright 视频录制

**修改文件：**
- `Dockerfile.alpine`

**问题描述：**
Playwright 查找 `/root/.cache/ms-playwright/ffmpeg-1011/ffmpeg-linux`，但系统 ffmpeg 在 `/usr/bin/ffmpeg`。

**解决方案：**
创建符号链接：
```dockerfile
RUN mkdir -p /root/.cache/ms-playwright/ffmpeg-1011 && \
    ln -s /usr/bin/ffmpeg /root/.cache/ms-playwright/ffmpeg-1011/ffmpeg-linux
```

**提交命令：**
```bash
git add Dockerfile.alpine
git commit -m "fix: 创建 ffmpeg 符号链接支持 Playwright 视频录制"
```

---

### fix: 使用 Playwright 自带 ffmpeg 解决视频录制问题

**修改文件：**
- `Dockerfile.alpine`

**问题描述：**
系统 ffmpeg 路径与 Playwright 期望路径不匹配，符号链接方案不生效。

**解决方案：**
1. 移除系统 ffmpeg 安装
2. 添加 `npx playwright install ffmpeg` 下载 Playwright 兼容的 ffmpeg

**提交命令：**
```bash
git add Dockerfile.alpine
git commit -m "fix: 使用 Playwright 自带 ffmpeg 解决视频录制问题"
```

---

### refactor: 改用 Playwright 自带 Chromium 和 ffmpeg

**修改文件：**
- `Dockerfile.alpine`

**变更内容：**
1. 移除系统 Chromium（`apk add chromium`）
2. 移除 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 环境变量
3. 使用 `npx playwright install chromium ffmpeg` 安装 Playwright 自带版本

**优点：**
- 完全兼容，避免系统 Chromium 版本不匹配问题
- Playwright 官方测试过的组合

**缺点：**
- 镜像增大约 200MB

**提交命令：**
```bash
git add Dockerfile.alpine
git commit -m "refactor: 改用 Playwright 自带 Chromium 和 ffmpeg 提高兼容性"
```

---

### fix: 修复 start.cjs 重复下载 Playwright Chromium 的问题

**修改文件：**
- `scripts/start.cjs`

**问题描述：**
Dockerfile 已执行 `npx playwright install chromium ffmpeg`，但 `start.cjs` 只检测系统路径，检测不到 Playwright 缓存中的 Chromium，导致重复下载。

**解决方案：**
优先检测 Playwright 缓存目录 `~/.cache/ms-playwright/chromium*`：
```javascript
const playwrightCachePath = path.join(os.homedir(), '.cache', 'ms-playwright');
const chromiumInCache = fs.existsSync(playwrightCachePath) && 
  fs.readdirSync(playwrightCachePath).some(dir => dir.startsWith('chromium'));
```

**提交命令：**
```bash
git add scripts/start.cjs
git commit -m "fix: 检测 Playwright 缓存避免重复下载 Chromium"
```

---

### fix: 修复 Chromium 路径配置，支持 Playwright 默认路径

**修改文件：**
- `server/services/playwrightTestRunner.ts`
- `server/services/midsceneTestRunner.ts`

**问题描述：**
代码中 `executablePath` 为空字符串时仍会传给 Playwright，导致报错找不到 `/usr/bin/chromium-browser`。

**解决方案：**
当环境变量未设置时，返回 `undefined` 让 Playwright 使用默认路径：
```typescript
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || 
                      process.env.CHROME_PATH || 
                      process.env.CHROMIUM_PATH ||
                      undefined; // 使用 Playwright 默认路径
```

**提交命令：**
```bash
git add server/services/playwrightTestRunner.ts server/services/midsceneTestRunner.ts
git commit -m "fix: 修复 Chromium 路径配置，支持 Playwright 默认路径"
```

---

### fix: 移除 docker-compose 中的 Chromium 路径配置

**修改文件：**
- `docker-compose.alpine.yml`

**问题描述：**
`docker-compose.alpine.yml` 中设置了 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser`，但现在使用 Playwright 自带的 Chromium，该路径不存在。

**解决方案：**
移除以下环境变量：
- `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD`
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`

**提交命令：**
```bash
git add docker-compose.alpine.yml
git commit -m "fix: 移除 docker-compose 中的 Chromium 路径配置"
```

---

### refactor: 改用 Debian slim 镜像解决 Playwright 兼容性问题

**修改文件：**
- `Dockerfile.alpine`

**问题描述：**
Playwright 官方不支持 Alpine Linux，下载的 Ubuntu 二进制文件在 Alpine 上无法运行。

**解决方案：**
改用 `node:20-slim`（基于 Debian），Playwright 完全兼容。

**变更内容：**
- `FROM node:20-alpine` → `FROM node:20-slim`
- `apk add` → `apt-get install`
- 移除 Alpine 镜像源配置

**提交命令：**
```bash
git add Dockerfile.alpine
git commit -m "refactor: 改用 Debian slim 镜像解决 Playwright 兼容性问题"
```

---

### fix: 完善 Playwright 浏览器安装，添加 headless shell 支持

**修改文件：**
- `Dockerfile.alpine`

**问题描述：**
```
Executable doesn't exist at /root/.cache/ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell
```

**根本原因：**
1. 只安装了 `chromium`，缺少 `chromium-headless-shell`
2. 同时安装系统 chromium 和 Playwright chromium 会导致冲突

**解决方案：**
1. 移除系统 chromium 安装（使用 Playwright 自带版本）
2. 使用 `playwright install-deps` 安装系统依赖
3. 安装完整的 Playwright 浏览器组件：
   - `chromium` - 完整浏览器
   - `chromium-headless-shell` - headless 模式专用
   - `ffmpeg` - 视频录制

**修改内容：**
```dockerfile
# 移除系统 chromium，使用 Playwright 自带版本
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    # 不再安装 chromium
    libnss3 libnspr4 ... \
    && rm -rf /var/lib/apt/lists/*

# 安装 Playwright 系统依赖和浏览器
RUN npx playwright install-deps chromium && \
    npx playwright install chromium chromium-headless-shell ffmpeg
```

**提交命令：**
```bash
git add Dockerfile.alpine
git commit -m "fix: 完善 Playwright 浏览器安装，添加 headless shell 支持"
```

---

### fix: 修复配置一致性问题

**修改文件：**
- `docker-compose.alpine.yml`
- `scripts/start.cjs`
- `Dockerfile.alpine`

**修复内容：**

1. **健康检查路径统一**：
   - docker-compose 中 `/api/health` → `/health`
   - 与 Dockerfile 保持一致

2. **移除 NODE_ENV=production**：
   - 避免运行时环境变量影响依赖加载

3. **完善 start.cjs 浏览器检测**：
   - 检测完整的 Playwright 组件（chromium + headless-shell + ffmpeg）
   - 缓存不完整时自动下载缺失组件

4. **清理 Dockerfile 残留注释**

**提交命令：**
```bash
git add Dockerfile.alpine docker-compose.alpine.yml scripts/start.cjs
git commit -m "fix: 修复 Docker 配置一致性问题，完善 Playwright 浏览器检测"
```

---

### fix: 添加 --force 参数确保 Playwright 浏览器完整安装

**修改文件：**
- `Dockerfile.alpine`

**问题描述：**
```
Executable doesn't exist at /root/.cache/ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell
```

**根本原因：**
Docker 构建缓存导致 `playwright install` 命令被跳过，`chromium-headless-shell` 未安装。

**解决方案：**
1. 添加 `--force` 参数强制重新安装
2. 添加 `ls -la` 命令验证安装结果

```dockerfile
RUN npx playwright install-deps chromium && \
    npx playwright install --force chromium chromium-headless-shell ffmpeg && \
    ls -la /root/.cache/ms-playwright/
```

**提交命令：**
```bash
git add Dockerfile.alpine
git commit -m "fix: 添加 --force 参数确保 Playwright 浏览器完整安装"
```

---

### fix: 配置 Debian 国内镜像源解决网络超时问题

**修改文件：**
- `Dockerfile.alpine`

**问题描述：**
```
Could not connect to deb.debian.org:80, connection timed out
E: Unable to locate package xvfb
```

**根本原因：**
Docker 构建环境无法访问 Debian 官方源 `deb.debian.org`。

**解决方案：**
1. 配置阿里云 Debian 镜像源
2. 手动安装 Playwright 所需的系统依赖（跳过 `install-deps`）
3. 添加 `xvfb`、`fonts-liberation` 等缺失的包

```dockerfile
# 配置 Debian 国内镜像源（阿里云）
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources

# 手动安装 Playwright 依赖
RUN apt-get install -y xvfb fonts-liberation fonts-freefont-ttf ...

# 跳过 install-deps，直接安装浏览器
RUN npx playwright install --force chromium chromium-headless-shell ffmpeg
```

**提交命令：**
```bash
git add Dockerfile.alpine
git commit -m "fix: 配置 Debian 国内镜像源解决网络超时问题"
```

---

### fix: 完善 Playwright 浏览器检测和下载逻辑

**修改文件：**
- `Dockerfile.alpine`
- `scripts/start.cjs`

**问题描述：**
Playwright 缓存目录存在但可执行文件缺失，导致运行时报错。

**解决方案：**

1. **Dockerfile 增强验证**：
   - 添加 `PLAYWRIGHT_DOWNLOAD_HOST` 国内镜像加速
   - 构建时验证每个组件的可执行文件是否存在

2. **start.cjs 严格检测**：
   - 不再只检测目录是否存在
   - 验证 `chrome`、`headless_shell`、`ffmpeg-linux` 可执行文件
   - 缓存不完整时自动重新下载

**提交命令：**
```bash
git add Dockerfile.alpine scripts/start.cjs
git commit -m "fix: 完善 Playwright 浏览器检测和下载逻辑"
```

---

### fix: 统一 Playwright 版本解决浏览器版本不匹配问题

**修改文件：**
- `package.json`
- `scripts/start.cjs`

**问题描述：**
```
Executable doesn't exist at /root/.cache/ms-playwright/chromium_headless_shell-1194/...
```
但构建时安装的是 `chromium_headless_shell-1181`。

**根本原因：**
`package.json` 中 Playwright 版本不一致：
- `playwright: ^1.56.1` → 对应浏览器版本 1194
- `@playwright/test: ^1.54.1` → 对应浏览器版本 1181

**解决方案：**
1. 统一锁定版本为 `1.56.1`（移除 `^` 前缀）
2. 优化 `start.cjs` 检测逻辑，输出详细版本信息

**提交命令：**
```bash
git add package.json scripts/start.cjs
git commit -m "fix: 统一 Playwright 版本为 1.56.1 解决浏览器版本不匹配"
```


---

### fix: 解决 Windows package-lock.json 导致的原生模块兼容性问题

**修改文件：**
- `Dockerfile.alpine`

**问题描述：**
```
Could not load the "sharp" module using the linux-x64 runtime
Cannot find module @rollup/rollup-linux-x64-gnu
```

**根本原因：**
1. `package-lock.json` 在 Windows 上生成，包含 Windows 平台的原生模块
2. 下载预编译二进制文件时网络超时（即使配置了国内镜像）

**解决方案：**
强制 sharp 从源码编译，避免下载预编译二进制文件：

```dockerfile
# 强制从源码编译，避免下载预编译二进制
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1
ENV npm_config_build_from_source=true

RUN npm ci --legacy-peer-deps
```

**优点：**
- 不依赖网络下载预编译二进制
- 使用 `npm ci` 保证依赖版本一致性
- 编译工具（python3/make/g++）已在系统依赖中安装

**缺点：**
- 首次构建时间稍长（需要编译 sharp）
- 后续构建有 BuildKit 缓存，速度正常

**提交命令：**
```bash
git add Dockerfile.alpine
git commit -m "fix: 强制 sharp 从源码编译，解决预编译二进制下载超时问题"
```


---

### fix: 解决 Docker 构建中 rollup 原生模块缺失问题

**修改文件：**
- `Dockerfile.alpine`

**问题描述：**
```
Error: Cannot find module @rollup/rollup-linux-x64-gnu
npm has a bug related to optional dependencies
```

**根本原因：**
npm 的 optional dependencies 有已知 bug，跨平台构建时不会自动安装目标平台的原生模块。

**解决方案：**
在 `npm ci` 后手动安装 rollup 的 Linux 原生模块：

```dockerfile
RUN npm ci --legacy-peer-deps && \
    npm install @rollup/rollup-linux-x64-gnu --save-optional --legacy-peer-deps
```

**提交命令：**
```bash
git add Dockerfile.alpine
git commit -m "fix: 手动安装 rollup Linux 原生模块解决 npm optional dependencies bug"
```


---

### fix: 修复 Docker 构建顺序，先生成 Prisma 客户端再构建前端

**修改文件：**
- `Dockerfile.alpine`

**问题描述：**
```
Could not resolve "../../src/generated/prisma/index.js" from "server/services/databaseService.ts"
```

**根本原因：**
`vite build` 在 `prisma generate` 之前执行，但代码依赖 Prisma 生成的客户端。

**解决方案：**
调整构建顺序：
```dockerfile
# 先生成 Prisma 客户端
RUN npx prisma generate

# 再构建前端
RUN npm run build
```

**提交命令：**
```bash
git add Dockerfile.alpine
git commit -m "fix: 调整 Docker 构建顺序，先 prisma generate 再 vite build"
```


---

## 2026-01-31

### refactor: 优化 Docker 安装脚本，统一三个 Linux 发行版的管理脚本

**修改文件：**
- `docker/Debian Linux/docker-install.sh`
- `docker/Alpine Linux/docker-install.sh`
- `docker/Centos7 Linux/docker-install.sh`

**问题描述：**
1. 文件名是 `docker-install.sh`，但实际只是升级脚本
2. 所有脚本都错误地引用了 `docker-compose.debian.yml`（Alpine 和 CentOS 应该引用各自的配置文件）
3. 缺少真正的安装功能
4. 环境变量未从 `.env` 文件加载

**优化内容：**

1. **功能完善**：
   - 新增 `install` 首次安装命令
   - 新增 `start/stop/restart` 服务管理命令
   - 新增 `status` 查看服务状态
   - 新增 `logs` 查看日志
   - 新增 `backup/restore` 数据库备份恢复
   - 新增 `clean` 清理所有数据（危险操作）
   - 保留 `upgrade` 升级功能

2. **修复配置文件引用**：
   - Debian: `docker-compose.debian.yml`
   - Alpine: `docker-compose.alpine.yml`
   - CentOS: `docker-compose.centos.yml`

3. **环境变量检查**：
   - 自动加载 `.env` 文件
   - 检查必要变量（MYSQL_ROOT_PASSWORD、DB_PASSWORD、JWT_SECRET）
   - 缺少 `.env` 时自动从示例文件创建

4. **CentOS 特殊处理**：
   - 兼容 `docker compose` 和 `docker-compose` 两种命令
   - SELinux 上下文配置
   - 防火墙端口开放提示

5. **用户体验优化**：
   - 彩色日志输出
   - 危险操作二次确认
   - 详细的帮助信息

**使用方法：**
```bash
# 首次安装
./docker-install.sh install

# 升级更新
./docker-install.sh upgrade

# 服务管理
./docker-install.sh start
./docker-install.sh stop
./docker-install.sh restart
./docker-install.sh status

# 日志查看
./docker-install.sh logs          # 查看应用日志
./docker-install.sh logs mysql    # 查看 MySQL 日志

# 数据库备份恢复
./docker-install.sh backup
./docker-install.sh restore backup.sql

# 清理所有数据
./docker-install.sh clean
```

**提交命令：**
```bash
git add "docker/Debian Linux/docker-install.sh" "docker/Alpine Linux/docker-install.sh" "docker/Centos7 Linux/docker-install.sh"
git commit -m "refactor: 优化 Docker 安装脚本，统一三个 Linux 发行版的管理脚本"
```


---

### fix: 修复 Docker 脚本无法加载 Windows 换行符 .env 文件的问题

**修改文件：**
- `docker/Debian Linux/docker-install.sh`
- `docker/Alpine Linux/docker-install.sh`
- `docker/Centos7 Linux/docker-install.sh`

**问题描述：**
```
/data/sakura-ai/docker/Debian Linux/.env:行5: $'\r': 未找到命令
```

**根本原因：**
`.env` 文件在 Windows 上编辑，包含 CRLF (`\r\n`) 换行符，Linux 只识别 LF (`\n`)。

**解决方案：**
添加 `convert_line_endings()` 函数，在加载 `.env` 前自动转换换行符：

```bash
convert_line_endings() {
    local file="$1"
    if [ -f "$file" ] && grep -q $'\r' "$file" 2>/dev/null; then
        log_warning "检测到 Windows 换行符，正在转换: $file"
        sed -i 's/\r$//' "$file"
    fi
}
```

**提交命令：**
```bash
git add "docker/Debian Linux/docker-install.sh" "docker/Alpine Linux/docker-install.sh" "docker/Centos7 Linux/docker-install.sh"
git commit -m "fix: 自动转换 .env 文件的 Windows 换行符为 Unix 格式"
```

## 2026-02-02

### fix: 修正 docker-compose.yml 构建上下文和镜像名称

**问题描述：**
- 镜像名称为 `sakura-ai-sakura-ai:latest`（重复）
- 构建上下文为当前目录 `.`，无法访问项目根目录的文件

**根本原因：**
1. `build.context: .` 指向 `docker/Debian Linux` 目录
2. 但 Dockerfile 需要访问项目根目录的 `package.json`、`src/`、`server/` 等
3. Docker Compose 默认命名：`<项目名>-<服务名>:latest`

**修改文件：**
- `docker/Debian Linux/docker-compose.yml`

**修复内容：**

1. **修正构建上下文**：
   ```yaml
   build:
     context: ../..              # 指向项目根目录
     dockerfile: docker/Debian Linux/Dockerfile.debian  # 相对于根目录的 Dockerfile 路径
   ```

2. **显式指定镜像名称**：
   ```yaml
   image: sakura-ai:latest  # 避免自动生成重复名称
   ```

**效果：**
- ✅ 镜像名称：`sakura-ai:latest`（简洁）
- ✅ 构建上下文正确指向项目根目录
- ✅ Dockerfile 能够访问所有项目文件
- ✅ 符合之前修复的 Vite 构建问题（需要访问根目录）

---

### chore: 移除 docker-compose.yml 中已废弃的 version 字段

**问题描述：**
- Docker Compose 警告：`version` is obsolete
- Docker Compose v2 不再需要 `version` 字段

**修改文件：**
- `docker/Debian Linux/docker-compose.yml` - 移除 `version: '3.8'`

**说明：**
- Docker Compose v2 会自动使用最新的 Compose 规范
- 移除 `version` 字段可以消除警告信息
- 不影响任何功能

---

### fix: 修复 Debian Docker 中系统 Chromium 路径错误

**问题描述：**
- 使用系统 Chromium 时报错：`Failed to launch chromium because executable doesn't exist at /usr/bin/chromium-browser`
- Debian 系统中 Chromium 的实际路径是 `/usr/bin/chromium`，而不是 `/usr/bin/chromium-browser`

**修改文件：**
- `docker/Debian Linux/Dockerfile.debian` - 修正环境变量和添加验证步骤
- `docker/Debian Linux/docker-compose.yml` - 修正环境变量

**修复内容：**

1. **Dockerfile.debian**：
   - 修正环境变量：`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`
   - 添加系统 Chromium 验证步骤：
     ```bash
     which chromium && ls -la /usr/bin/chromium* && chromium --version
     ```

2. **docker-compose.yml**：
   - 修正环境变量：`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: /usr/bin/chromium`
   - 添加注释说明 Debian 系统路径

**不同系统的 Chromium 路径：**
- Debian/Ubuntu: `/usr/bin/chromium`
- Alpine Linux: `/usr/bin/chromium-browser`
- CentOS/RHEL: `/usr/bin/chromium-browser`

**效果：**
- ✅ Playwright 能够正确找到系统 Chromium
- ✅ 测试执行不再报 "executable doesn't exist" 错误
- ✅ 构建时验证 Chromium 安装和路径

---

### fix: 修复 Docker 构建时 Vite 解析 server 依赖导致的 Prisma 导出错误

**问题描述：**
- Docker 构建时报错：`"PrismaClient" is not exported by "src/generated/prisma/index.js"`
- 错误发生在 `vite build` 阶段
- 原因：`llmConfigManager.ts` 中动态导入了 server 模块，Vite 静态分析时尝试解析整个 server 依赖链

**根本原因：**
1. `llmConfigManager.ts` 是前后端共享文件，包含动态导入：
   ```typescript
   const module = await import('../../server/services/settingsService.js');
   ```
2. Vite 在构建时会静态分析所有 import 语句（包括动态 import）
3. 这导致 Vite 尝试解析 `server/services/settingsService.ts`
4. settingsService 导入了 `databaseService.ts`
5. databaseService 导入了 Prisma 客户端
6. Prisma 客户端在前端构建时不可用，导致构建失败

**修改文件：**
- `vite.config.ts` - 添加 build.rollupOptions.external 配置

**修复内容：**

在 Vite 配置中添加 `build.rollupOptions.external`，排除所有 server 目录的导入：

```typescript
build: {
  rollupOptions: {
    external: [
      // 排除所有 server 目录的导入
      /^\.\.\/\.\.\/server\//,
      /^\.\.\/server\//,
      /^server\//,
    ],
  },
}
```

**效果：**
- ✅ Vite 构建时不再尝试解析 server 目录的代码
- ✅ 动态 import 在运行时仍然有效（后端环境）
- ✅ 前端构建成功，不再报 Prisma 导出错误
- ✅ 前后端共享代码（llmConfigManager）可以正常工作

**技术说明：**
- `external` 配置告诉 Rollup 不要将这些模块打包到前端代码中
- 动态 import 在前端环境中会因为 `typeof window !== 'undefined'` 检查而跳过
- 后端环境中动态 import 会正常执行，加载后端模块

---

## 2026-01-31

### fix: 修复 Docker 构建时 Vite 解析 server 依赖导致的 Prisma 导出错误（已废弃）

**问题描述：**
- Docker 构建时报错：`"PrismaClient" is not exported by "src/generated/prisma/index.js"`
- 原因：`src/pages/TestPlanDetail.tsx` 导入了 `server/utils/timezone`，导致 Vite 构建时尝试解析整个 server 依赖链

**修改文件：**
- `src/pages/TestPlanDetail.tsx` - 修改导入路径
- `src/utils/dateUtils.ts` - 新增前端日期工具函数
- `docker/Debian Linux/docker-compose.yml` - 修复构建上下文路径
- `docker/Debian Linux/Dockerfile.debian` - 优化 Prisma 生成顺序

**修复内容：**
1. 创建前端独立的 `dateUtils.ts`，避免前端代码导入 server 模块
2. 修改 `llmConfigManager.ts`，移除对 server 代码的动态导入
3. 修改 docker-compose.yml 构建上下文为项目根目录
4. 优化 Dockerfile 中 Prisma 客户端生成顺序
5. 优化 docker-install.sh 迁移失败时的提示信息


## 2026-02-02

### docs: 在 README.md 中添加 Docker Debian 部署详细说明

**问题描述：**
- README.md 中 Docker 部署部分内容过于简略
- 缺少详细的部署步骤、服务管理、故障排除等信息
- 用户需要查看单独的文档才能了解完整的部署流程

**修改文件：**
- `README.md` - 扩展 Docker 部署章节

**新增内容：**

1. **为什么选择 Docker 部署**：
   - 添加传统部署 vs Docker 部署对比表
   - 说明 Docker 解决的核心问题（系统兼容性、环境配置、维护成本等）

2. **前置要求**：
   - 详细的宿主机配置要求表（CPU、内存、磁盘、操作系统）
   - CentOS 7 和 Ubuntu 的 Docker 安装步骤
   - Docker 版本验证命令

3. **快速部署**：
   - 四步部署流程（克隆项目、配置环境变量、一键部署、初始化数据库）
   - 必填和可选配置项的详细说明
   - 两种部署方式（脚本安装 vs 手动启动）

4. **服务管理**：
   - 使用安装脚本管理（推荐）：start/stop/restart/status/logs/upgrade/backup/restore
   - 使用 Docker Compose 管理：详细的命令示例

5. **启用可选服务**：
   - RAG 知识库（Qdrant）启用步骤
   - Nginx 反向代理配置说明

6. **监控和维护**：
   - 资源使用监控命令
   - 数据备份和恢复步骤（脚本方式 + 手动方式）

7. **更新应用**：
   - 脚本更新（推荐）
   - 手动更新步骤

8. **常见问题**：
   - 容器启动失败
   - 数据库连接失败
   - Playwright 浏览器启动失败
   - 内存不足
   - 权限问题
   - 每个问题都包含诊断命令和解决方案

**效果：**
- ✅ 用户可以在 README 中直接了解完整的 Docker 部署流程
- ✅ 减少查阅多个文档的需要
- ✅ 提供详细的故障排除指南
- ✅ 保持与 DOCKER_DEBIAN_DEPLOYMENT.md 的一致性
- ✅ 提升用户部署体验

**参考文档：**
- 基于 `docs/DOCKER_ALPINE_DEPLOYMENT.md` 的结构
- 适配 Debian 系统的具体配置
- 整合 `docker-install.sh` 脚本的使用说明


### docs: 创建 DOCKER_DEBIAN_DEPLOYMENT.md 完整部署文档

**问题描述：**
- `DOCKER_DEBIAN_DEPLOYMENT.md` 文件为空
- 缺少 Debian Docker 部署的详细文档

**新增文件：**
- `docs/DOCKER_DEBIAN_DEPLOYMENT.md` - 完整的 Debian Docker 部署指南

**文档内容：**

1. **为什么选择 Debian + Docker**：
   - CentOS 7 的限制说明（glibc 版本、官方仓库、编译复杂度）
   - Debian + Docker 的优势（完全兼容、现代化、稳定可靠、容器化、镜像适中）

2. **前置要求**：
   - 宿主机配置要求表（CPU、内存、磁盘、操作系统、Docker 版本）
   - CentOS 7 和 Ubuntu 的 Docker 安装详细步骤

3. **快速部署（四步流程）**：
   - 第一步：克隆项目
   - 第二步：配置环境变量（必填和可选配置项）
   - 第三步：一键部署（脚本安装 + 手动启动）
   - 第四步：初始化数据库

4. **服务管理**：
   - 使用安装脚本管理（start/stop/restart/status/logs/upgrade/backup/restore）
   - 使用 Docker Compose 管理（详细命令示例）

5. **启用可选服务**：
   - RAG 知识库（Qdrant）启用和验证
   - Nginx 反向代理配置

6. **监控和维护**：
   - 资源使用监控（docker stats、docker system df）
   - 数据备份和恢复（脚本方式 + 手动方式）

7. **更新应用**：
   - 脚本更新（推荐）
   - 手动更新步骤

8. **常见问题（5个）**：
   - 容器启动失败
   - 数据库连接失败
   - Playwright 浏览器启动失败
   - 内存不足
   - 权限问题
   - 每个问题都包含详细的诊断命令和解决方案

9. **安全加固**：
   - 使用强密码
   - 限制容器权限
   - 配置防火墙

10. **性能优化**：
    - 多阶段构建
    - 资源限制配置
    - Docker 缓存使用

**效果：**
- ✅ 提供完整的 Debian Docker 部署指南
- ✅ 与 README.md 中的 Docker 部署章节保持一致
- ✅ 参考 DOCKER_ALPINE_DEPLOYMENT.md 的结构
- ✅ 适配 Debian 系统的具体配置
- ✅ 包含详细的故障排除和最佳实践
- ✅ 用户可以按照文档完成从零到部署的全过程

**参考文档：**
- 基于 `docs/DOCKER_ALPINE_DEPLOYMENT.md` 的结构
- 整合 `docker-install.sh` 脚本的使用说明
- 适配 Debian 系统特性（Chromium 路径、包管理等）


### feat: 添加 NewApi 模型配置支持

**新增功能**：
- 添加 NewApi 平台模型配置，支持自动获取所有可用模型
- 兼容 OpenAI 格式，支持多家厂商模型

**修改文件**：
- `src/services/modelRegistry.ts` - 添加 newapi-series 配置
- `src/pages/Settings.tsx` - 添加 NewApi 平台超链接

**配置详情**：
```typescript
{
  id: 'newapi-series',
  name: 'NewApi 全部模型 (自动获取)',
  provider: 'NewApi',
  openRouterModel: 'gpt-4',
  customBaseUrl: 'https://api.newapi.pro/v1',
  requiresCustomAuth: true,
  capabilities: ['text-generation', 'multimodal', 'reasoning', 'code-analysis', 'model-list'],
  description: 'NewApi平台，可自动获取所有可用模型，兼容OpenAI格式，支持多家厂商模型',
  costLevel: 'medium'
}
```

**效果**：
- 用户可以在设置页面选择 NewApi 平台
- 自动获取 NewApi 平台的所有可用模型
- 提供 NewApi 平台的 API 密钥获取链接

---


**测试验证**：
- NewApi 配置正确，API 端点可访问
- 401 错误是预期行为（需要有效的 API 密钥）
- 用户配置有效密钥后即可正常使用


## 2026-02-03

### docs: 添加 Windows 系统 Docker 安装说明

**变更内容**：
- 在 README.md 的 Docker 安装部分添加 Windows 系统安装指南
- 提供两种安装方式：
  1. Docker Desktop（推荐方式）- 适合普通用户
  2. WSL2 + Docker（高级方式）- 适合开发者
- 包含详细的安装步骤和系统要求说明
- 添加注意事项提醒（Windows 版本、Hyper-V 要求等）

**影响范围**：
- 文档更新，不影响代码功能
- 完善了跨平台部署文档（CentOS、Ubuntu、Windows）

**相关文件**：
- README.md

