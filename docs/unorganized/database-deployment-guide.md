# 数据库部署指南

## 概述

本指南描述了如何部署step_screenshots功能的数据库更改到生产环境。

## 部署前准备

### 1. 环境检查

确保以下环境变量已正确配置：

```bash
DATABASE_URL="mysql://username:password@host:port/database_name?timezone=Asia/Shanghai"
NODE_ENV=production
```

### 2. 数据库备份

**重要：在执行任何迁移之前，必须备份生产数据库**

```bash
# 手动备份
mysqldump -h host -P port -u username -p database_name > backup-$(date +%Y%m%d_%H%M%S).sql

# 或使用部署脚本自动备份
node scripts/deploy-database.js
```

### 3. 依赖检查

确保以下工具已安装：
- Node.js (>= 16)
- MySQL客户端工具
- Prisma CLI

## 部署步骤

### 方法1：使用自动化部署脚本

```bash
# 执行完整的数据库部署
node scripts/deploy-database.js
```

脚本将自动执行：
1. 检查数据库连接
2. 创建数据库备份
3. 执行Prisma迁移
4. 生成Prisma客户端
5. 验证数据库结构
6. 优化索引

### 方法2：手动部署

```bash
# 1. 检查迁移状态
npx prisma migrate status

# 2. 执行迁移
npx prisma migrate deploy

# 3. 生成客户端
npx prisma generate

# 4. 验证部署
npx prisma db pull
```

## 验证部署

### 1. 表结构验证

```sql
-- 检查step_screenshots表是否存在
SHOW TABLES LIKE 'step_screenshots';

-- 检查表结构
DESCRIBE step_screenshots;

-- 检查索引
SHOW INDEX FROM step_screenshots;
```

### 2. 枚举类型验证

```sql
-- 检查status字段的枚举值
SELECT column_type 
FROM information_schema.columns 
WHERE table_name = 'step_screenshots' 
AND column_name = 'status';
```

### 3. 外键约束验证

```sql
-- 检查外键约束
SELECT 
  constraint_name,
  table_name,
  column_name,
  referenced_table_name,
  referenced_column_name
FROM information_schema.key_column_usage
WHERE table_name = 'step_screenshots'
AND referenced_table_name IS NOT NULL;
```

## 预期的数据库结构

### step_screenshots表

| 字段名 | 类型 | 约束 | 描述 |
|--------|------|------|------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT | 主键 |
| run_id | VARCHAR(255) | NOT NULL, INDEX | 测试运行ID |
| test_case_id | INT | NULL, FOREIGN KEY, INDEX | 测试用例ID |
| step_index | VARCHAR(50) | NOT NULL | 步骤索引 |
| step_description | TEXT | NULL | 步骤描述 |
| status | ENUM | NOT NULL | 步骤状态 |
| file_path | VARCHAR(1024) | NOT NULL | 文件路径 |
| file_name | VARCHAR(255) | NOT NULL | 文件名 |
| file_size | BIGINT | NULL | 文件大小 |
| mime_type | VARCHAR(100) | DEFAULT 'image/png' | MIME类型 |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP, INDEX | 创建时间 |
| file_exists | BOOLEAN | DEFAULT TRUE | 文件存在标志 |

### 索引

- `idx_run_id` - 按run_id查询优化
- `idx_test_case_id` - 按test_case_id查询优化  
- `idx_created_at` - 按时间排序优化

### 枚举类型

`step_screenshots_status`:
- success
- failed
- error
- completed

## 回滚计划

如果部署出现问题，可以使用以下步骤回滚：

### 1. 恢复数据库备份

```bash
# 恢复到部署前状态
mysql -h host -P port -u username -p database_name < backup-file.sql
```

### 2. 重置Prisma迁移状态

```bash
# 重置到上一个迁移状态
npx prisma migrate reset --force
```

## 性能监控

部署后监控以下指标：

### 1. 查询性能

```sql
-- 监控慢查询
SELECT * FROM mysql.slow_log 
WHERE sql_text LIKE '%step_screenshots%'
ORDER BY start_time DESC;
```

### 2. 索引使用情况

```sql
-- 检查索引使用统计
SELECT 
  table_name,
  index_name,
  cardinality
FROM information_schema.statistics
WHERE table_name = 'step_screenshots';
```

### 3. 存储空间

```sql
-- 检查表大小
SELECT 
  table_name,
  ROUND(((data_length + index_length) / 1024 / 1024), 2) AS 'Size (MB)'
FROM information_schema.tables
WHERE table_name = 'step_screenshots';
```

## 故障排除

### 常见问题

1. **迁移失败**
   - 检查数据库连接
   - 验证用户权限
   - 查看错误日志

2. **索引创建失败**
   - 检查表数据完整性
   - 验证外键约束
   - 手动创建索引

3. **客户端生成失败**
   - 清理node_modules
   - 重新安装依赖
   - 检查Prisma版本兼容性

### 联系支持

如果遇到无法解决的问题，请提供：
- 错误日志
- 数据库版本信息
- 迁移状态输出
- 环境配置信息