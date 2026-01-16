# 迁移历史说明

## 问题描述

初始迁移文件 `prisma/migrations/20250718022213_init/migration.sql` 与当前的 `prisma/schema.prisma` 对不上，这是**正常现象**。

## 原因说明

Prisma 的迁移是**增量式**的：
- 初始迁移只包含项目创建时的基础表结构
- 后续的 schema 变更通过新的迁移文件添加
- 这是 Prisma 的最佳实践，保持迁移历史的完整性

## 当前迁移历史

1. **20250718022213_init** - 初始迁移（基础表结构）
2. **20250727074322_add_step_screenshots_table** - 添加 step_screenshots 表
3. **20251119171318_sync_schema_with_prisma** - 同步 schema（最新）

## 解决方案

### 方案 1：保持现状（推荐）

**适用场景**：生产环境或已有数据的数据库

保持迁移历史不变，确保所有迁移都已应用：

```bash
# 检查迁移状态
npx prisma migrate status

# 应用所有未应用的迁移
npx prisma migrate deploy

# 或开发环境
npx prisma migrate dev
```

**优点**：
- 保持迁移历史完整性
- 可以追踪每个变更的时间点
- 符合 Prisma 最佳实践

### 方案 2：重置迁移历史（仅限新环境）

**适用场景**：全新的数据库，没有重要数据

如果数据库是全新的，可以删除所有迁移并重新生成一个完整的初始迁移：

```bash
# ⚠️ 警告：这会删除所有迁移历史
# 1. 备份现有迁移（可选）
cp -r prisma/migrations prisma/migrations.backup

# 2. 删除所有迁移文件
rm -rf prisma/migrations/*

# 3. 重置迁移历史
npx prisma migrate reset

# 4. 创建新的初始迁移（包含所有当前 schema）
npx prisma migrate dev --name init
```

**优点**：
- 初始迁移文件包含完整的 schema
- 迁移历史更简洁

**缺点**：
- 丢失迁移历史
- 无法追踪变更时间点
- 不适用于生产环境

### 方案 3：创建基线迁移（推荐用于新项目）

**适用场景**：新项目，想要一个完整的初始迁移

创建一个基线迁移，包含所有当前 schema：

```bash
# 1. 确保数据库结构与 schema 一致
npx prisma db push

# 2. 创建基线迁移
npx prisma migrate dev --name baseline --create-only

# 3. 编辑迁移文件，使其包含所有表结构
# （手动编辑 prisma/migrations/YYYYMMDDHHMMSS_baseline/migration.sql）

# 4. 标记为已应用（不执行 SQL）
npx prisma migrate resolve --applied YYYYMMDDHHMMSS_baseline
```

## 当前状态检查

运行以下命令检查迁移状态：

```bash
# 检查哪些迁移已应用
npx prisma migrate status

# 查看数据库当前结构
npx prisma db pull

# 比较 schema 和数据库
npx prisma migrate diff \
  --from-schema-datamodel prisma/schema.prisma \
  --to-schema-datasource prisma/schema.prisma \
  --script
```

## 建议

对于当前项目：

1. **保持迁移历史不变**（方案 1）
2. **确保所有迁移都已应用**：
   ```bash
   npx prisma migrate deploy
   ```
3. **如果发现未应用的迁移**，按顺序应用它们

## 注意事项

⚠️ **不要修改已存在的迁移文件**，这会导致：
- 迁移历史不一致
- 其他开发者环境不同步
- 生产环境部署失败

✅ **正确的做法**：
- 通过新的迁移文件添加变更
- 保持迁移历史的线性顺序
- 确保每个迁移都是可逆的（如果可能）

