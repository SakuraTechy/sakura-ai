#!/bin/bash

# Prisma 类型修复脚本
# 解决 esbuild 编译时的常量未初始化错误

echo "🔧 开始修复 Prisma 类型定义..."

# 1. 清理旧的生成文件
echo "📦 清理旧的 Prisma Client..."
rm -rf src/generated/prisma
rm -rf node_modules/.prisma

# 2. 重新生成 Prisma Client
echo "🔄 重新生成 Prisma Client..."
npx prisma generate

# 3. 检查生成结果
if [ -d "src/generated/prisma" ]; then
    echo "✅ Prisma Client 生成成功"
    
    # 检查关键文件
    if [ -f "src/generated/prisma/index.js" ]; then
        echo "✅ index.js 文件存在"
    else
        echo "⚠️  警告: index.js 文件不存在"
    fi
    
    if [ -f "src/generated/prisma/index.d.ts" ]; then
        echo "✅ index.d.ts 文件存在"
    else
        echo "⚠️  警告: index.d.ts 文件不存在"
    fi
else
    echo "❌ Prisma Client 生成失败"
    exit 1
fi

echo ""
echo "🎉 Prisma 类型修复完成！"
echo "💡 提示: 如果问题仍然存在，请尝试:"
echo "   1. npm install"
echo "   2. npx prisma generate"
echo "   3. npm run build"
