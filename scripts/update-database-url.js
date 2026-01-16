#!/usr/bin/env node
/**
 * 自动更新 .env 文件中的 DATABASE_URL，添加时区配置
 * 
 * 使用方法：
 * node scripts/update-database-url.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENV_FILE = path.join(__dirname, '..', '.env');
const TIMEZONE = 'Asia/Shanghai';

console.log('🔧 开始更新 DATABASE_URL 配置...\n');

// 检查 .env 文件是否存在
if (!fs.existsSync(ENV_FILE)) {
  console.error('❌ 错误：.env 文件不存在');
  console.error('   请先创建 .env 文件，参考 docs/INSTALLATION.md\n');
  process.exit(1);
}

// 读取 .env 文件
let envContent = fs.readFileSync(ENV_FILE, 'utf-8');
const lines = envContent.split('\n');

// 查找 DATABASE_URL 行
let databaseUrlLineIndex = -1;
let currentDatabaseUrl = '';

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (line.startsWith('DATABASE_URL=')) {
    databaseUrlLineIndex = i;
    currentDatabaseUrl = line.substring('DATABASE_URL='.length).replace(/^["']|["']$/g, '');
    break;
  }
}

if (databaseUrlLineIndex === -1) {
  console.error('❌ 错误：.env 文件中没有找到 DATABASE_URL 配置');
  console.error('   请先在 .env 文件中添加 DATABASE_URL 配置\n');
  process.exit(1);
}

console.log('📋 当前配置：');
console.log(`   ${currentDatabaseUrl}\n`);

// 检查是否已经包含时区配置
if (currentDatabaseUrl.includes('timezone=')) {
  console.log('✅ DATABASE_URL 已包含时区配置，无需修改');
  console.log('   如果时间仍然不正确，请检查：');
  console.log('   1. 是否重启了应用（后端服务）');
  console.log('   2. 时区参数是否正确（应为 timezone=Asia/Shanghai）');
  console.log('   3. 参考 TIMEZONE_FIX_GUIDE.md 进行进一步排查\n');
  process.exit(0);
}

// 解析 URL 并添加时区参数
try {
  let newDatabaseUrl = currentDatabaseUrl;
  
  // 检查是否已有查询参数
  if (currentDatabaseUrl.includes('?')) {
    // 已有查询参数，添加到末尾
    newDatabaseUrl = `${currentDatabaseUrl}&timezone=${TIMEZONE}`;
  } else {
    // 没有查询参数，新增
    newDatabaseUrl = `${currentDatabaseUrl}?timezone=${TIMEZONE}`;
  }
  
  console.log('🔄 新配置：');
  console.log(`   ${newDatabaseUrl}\n`);
  
  // 备份原文件
  const backupFile = `${ENV_FILE}.backup.${Date.now()}`;
  fs.copyFileSync(ENV_FILE, backupFile);
  console.log(`💾 已备份原文件到：${path.basename(backupFile)}\n`);
  
  // 更新配置行
  lines[databaseUrlLineIndex] = `DATABASE_URL="${newDatabaseUrl}"`;
  
  // 写回文件
  fs.writeFileSync(ENV_FILE, lines.join('\n'), 'utf-8');
  
  console.log('✅ DATABASE_URL 已成功更新！\n');
  console.log('📝 接下来需要：');
  console.log('   1. 重启应用（后端服务）');
  console.log('      - 开发环境：Ctrl+C 停止，然后运行 npm run dev');
  console.log('      - 生产环境：pm2 restart Sakura AI');
  console.log('   2. 测试创建新记录，验证时间是否正确');
  console.log('   3. (可选) 使用 scripts/fix-timezone-data.sql 修复历史数据\n');
  console.log('📚 详细说明请参考：TIMEZONE_FIX_GUIDE.md\n');
  
} catch (error) {
  console.error('❌ 错误：更新 DATABASE_URL 失败');
  console.error(`   ${error.message}\n`);
  process.exit(1);
}

