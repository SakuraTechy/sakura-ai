# 步骤截图数据库存储功能部署指南

## 概述

本指南描述了如何部署步骤截图数据库存储功能到不同环境（开发、测试、生产）。

## 部署前准备

### 1. 系统要求

- Node.js >= 16.0.0
- MySQL >= 8.0
- npm >= 8.0.0
- 足够的磁盘空间用于截图存储

### 2. 环境变量配置

#### 必需的环境变量

```bash
DATABASE_URL="mysql://username:password@host:port/database_name?timezone=Asia/Shanghai"
NODE_ENV="development|test|production"
```

#### 可选的环境变量（有默认值）

```bash
SCREENSHOT_DIR="screenshots"                # 截图存储目录
SCREENSHOT_RETENTION_DAYS="30"             # 截图保留天数
SCREENSHOT_MAX_FILE_SIZE="10485760"        # 最大文件大小(字节)
SCREENSHOT_QUALITY="80"                    # 截图质量(1-100)
```

### 3. 数据库准备

确保MySQL数据库已创建并且用户有足够权限：

```sql
CREATE DATABASE automation_testing CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON automation_testing.* TO 'username'@'%';
FLUSH PRIVILEGES;
```

## 部署步骤

### 方法1：自动化部署（推荐）

#### 1. 数据库部署

```bash
# 设置环境变量
export DATABASE_URL="mysql://username:password@host:port/database_name?timezone=Asia/Shanghai"
export NODE_ENV="production"

# 执行数据库部署
node scripts/deploy-database.cjs
```

#### 2. 应用部署

```bash
# 执行应用部署
node scripts/deploy-application.cjs

# 检查部署状态
node scripts/deploy-application.cjs status
```

### 方法2：手动部署

#### 1. 安装依赖

```bash
npm install
```

#### 2. 数据库迁移

```bash
npx prisma migrate deploy
npx prisma generate
```

#### 3. 创建目录结构

```bash
mkdir -p screenshots logs temp backups
```

#### 4. 验证部署

```bash
# 检查数据库连接
npx prisma db pull

# 验证表结构
npx prisma studio
```

## 环境特定配置

### 开发环境

```bash
# .env.development
NODE_ENV=development
DATABASE_URL="mysql://root:password@localhost:3306/automation_testing?timezone=Asia/Shanghai"
SCREENSHOT_DIR=screenshots
SCREENSHOT_RETENTION_DAYS=30
```

### 测试环境

```bash
# .env.test
NODE_ENV=test
DATABASE_URL="mysql://root:password@localhost:3306/automation_testing_test?timezone=Asia/Shanghai"
SCREENSHOT_DIR=test-screenshots
SCREENSHOT_RETENTION_DAYS=7
```

### 生产环境

```bash
# .env.production
NODE_ENV=production
DATABASE_URL="mysql://username:password@prod-host:3306/automation_testing?timezone=Asia/Shanghai"
SCREENSHOT_DIR=/var/app/screenshots
SCREENSHOT_RETENTION_DAYS=90
SCREENSHOT_MAX_FILE_SIZE=20971520
```

## 验证部署

### 1. 数据库验证

```sql
-- 检查表是否存在
SHOW TABLES LIKE 'step_screenshots';

-- 检查表结构
DESCRIBE step_screenshots;

-- 检查索引
SHOW INDEX FROM step_screenshots;

-- 验证枚举类型
SELECT column_type FROM information_schema.columns 
WHERE table_name = 'step_screenshots' AND column_name = 'status';
```

### 2. 文件系统验证

```bash
# 检查目录权限
ls -la screenshots/ logs/ temp/ backups/

# 测试写入权限
touch screenshots/test.txt && rm screenshots/test.txt
```

### 3. 应用验证

```bash
# 检查服务状态
node scripts/deploy-application.cjs status

# 启动应用测试
npm run dev
```

## 监控和维护

### 1. 日志监控

```bash
# 查看应用日志
tail -f logs/app.log

# 查看错误日志
tail -f logs/error.log
```

### 2. 存储监控

```bash
# 检查截图目录大小
du -sh screenshots/

# 检查数据库大小
SELECT 
  table_name,
  ROUND(((data_length + index_length) / 1024 / 1024), 2) AS 'Size (MB)'
FROM information_schema.tables
WHERE table_name = 'step_screenshots';
```

### 3. 性能监控

```sql
-- 检查慢查询
SELECT * FROM mysql.slow_log 
WHERE sql_text LIKE '%step_screenshots%'
ORDER BY start_time DESC LIMIT 10;

-- 检查索引使用情况
EXPLAIN SELECT * FROM step_screenshots WHERE run_id = 'test-run-id';
```

## 故障排除

### 常见问题

#### 1. 数据库连接失败

```bash
# 检查数据库服务状态
systemctl status mysql  # Linux
net start mysql         # Windows

# 测试连接
mysql -h host -P port -u username -p database_name
```

#### 2. 权限问题

```bash
# Linux/Mac权限修复
chmod 755 screenshots/ logs/ temp/
chown -R app:app screenshots/ logs/ temp/

# Windows权限检查
icacls screenshots /grant Users:F
```

#### 3. 磁盘空间不足

```bash
# 清理过期截图
node -e "
const { ScreenshotService } = require('./server/services/screenshotService.ts');
const service = new ScreenshotService();
service.cleanupExpiredScreenshots(30).then(count => 
  console.log(\`清理了 \${count} 个过期截图\`)
);
"
```

#### 4. 迁移失败

```bash
# 重置迁移状态
npx prisma migrate reset --force

# 手动执行迁移
npx prisma db push --force-reset
```

## 回滚计划

### 1. 数据库回滚

```bash
# 恢复数据库备份
mysql -h host -P port -u username -p database_name < backups/backup-timestamp.sql

# 重置Prisma状态
npx prisma migrate reset --force
```

### 2. 应用回滚

```bash
# 恢复到上一个版本
git checkout previous-version
npm install
npx prisma generate
```

## 性能优化

### 1. 数据库优化

```sql
-- 添加复合索引
CREATE INDEX idx_run_step ON step_screenshots(run_id, step_index);

-- 优化查询
ANALYZE TABLE step_screenshots;
OPTIMIZE TABLE step_screenshots;
```

### 2. 文件系统优化

```bash
# 使用SSD存储截图
# 配置定期清理任务
0 2 * * * /usr/bin/node /path/to/cleanup-script.js

# 考虑使用CDN或对象存储
```

## 安全考虑

### 1. 数据库安全

- 使用强密码
- 限制数据库访问IP
- 定期备份数据
- 启用SSL连接

### 2. 文件安全

- 设置适当的文件权限
- 定期扫描恶意文件
- 限制文件大小和类型
- 使用安全的文件路径

### 3. 应用安全

- 验证用户输入
- 实施访问控制
- 记录审计日志
- 定期更新依赖

## 联系支持

如果遇到部署问题，请提供：

1. 错误日志
2. 环境配置
3. 数据库版本
4. 操作系统信息
5. 部署步骤记录