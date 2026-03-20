#!/bin/bash

# 修复 Prisma 迁移外键重复问题

echo "=== Prisma 迁移修复脚本 ==="
echo ""

# 方法1：开发环境 - 完全重置（会丢失所有数据）
echo "方法1：完全重置数据库（开发环境）"
echo "命令：npx prisma migrate reset"
echo "警告：这会删除所有数据！"
echo ""

# 方法2：生产环境 - 手动修复
echo "方法2：手动修复（保留数据）"
echo ""
echo "步骤1：删除迁移历史表"
echo "mysql -u root -p -e 'DROP TABLE IF EXISTS sakura_ai._prisma_migrations;'"
echo ""
echo "步骤2：重新初始化迁移"
echo "npx prisma migrate resolve --applied 20260203102638_init"
echo "npx prisma migrate resolve --applied 20260318000001_add_department_to_users"
echo ""
echo "步骤3：生成 Prisma Client"
echo "npx prisma generate"
echo ""

# 方法3：跳过当前迁移，强制标记为已应用
echo "方法3：强制标记迁移为已应用（如果数据库结构已正确）"
echo "npx prisma migrate resolve --applied <migration_name>"
echo ""

echo "=== 推荐操作 ==="
echo "如果是开发环境，运行："
echo "  npm run db:reset"
echo ""
echo "如果是生产环境，请先备份数据库，然后联系DBA处理"
