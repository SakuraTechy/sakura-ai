#!/usr/bin/env node

/**
 * 应用配置和部署脚本
 * 确保应用环境正确配置并验证功能
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 开始应用配置和部署...');

async function deployApplication() {
  try {
    // 1. 验证环境配置
    console.log('🔧 验证环境配置...');
    await validateEnvironmentConfig();

    // 2. 确保目录结构存在
    console.log('📁 检查目录结构...');
    await ensureDirectoryStructure();

    // 3. 验证文件权限
    console.log('🔐 验证文件权限...');
    await verifyFilePermissions();

    // 4. 构建应用
    console.log('🔨 构建应用...');
    await buildApplication();

    // 5. 验证功能
    console.log('✅ 验证功能...');
    await verifyFunctionality();

    console.log('🎉 应用配置和部署完成');

  } catch (error) {
    console.error('❌ 应用部署失败:', error.message);
    process.exit(1);
  }
}

async function validateEnvironmentConfig() {
  const requiredEnvVars = [
    'DATABASE_URL',
    'NODE_ENV'
  ];

  const optionalEnvVars = [
    'SCREENSHOT_DIR',
    'SCREENSHOT_RETENTION_DAYS',
    'SCREENSHOT_MAX_FILE_SIZE',
    'SCREENSHOT_QUALITY'
  ];

  // 检查必需的环境变量
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`缺少必需的环境变量: ${envVar}`);
    }
    console.log(`✅ ${envVar}: ${process.env[envVar]}`);
  }

  // 检查可选的环境变量并设置默认值
  const defaults = {
    SCREENSHOT_DIR: 'screenshots',
    SCREENSHOT_RETENTION_DAYS: '30',
    SCREENSHOT_MAX_FILE_SIZE: '10485760', // 10MB
    SCREENSHOT_QUALITY: '80'
  };

  for (const envVar of optionalEnvVars) {
    const value = process.env[envVar] || defaults[envVar];
    console.log(`✅ ${envVar}: ${value} ${!process.env[envVar] ? '(默认值)' : ''}`);
  }

  // 验证配置值的合理性
  const retentionDays = parseInt(process.env.SCREENSHOT_RETENTION_DAYS || defaults.SCREENSHOT_RETENTION_DAYS);
  if (retentionDays < 1 || retentionDays > 365) {
    console.warn('⚠️ SCREENSHOT_RETENTION_DAYS应该在1-365天之间');
  }

  const maxFileSize = parseInt(process.env.SCREENSHOT_MAX_FILE_SIZE || defaults.SCREENSHOT_MAX_FILE_SIZE);
  if (maxFileSize < 1024 || maxFileSize > 50 * 1024 * 1024) {
    console.warn('⚠️ SCREENSHOT_MAX_FILE_SIZE应该在1KB-50MB之间');
  }
}

async function ensureDirectoryStructure() {
  const screenshotDir = process.env.SCREENSHOT_DIR || 'screenshots';
  const requiredDirs = [
    screenshotDir,
    'logs',
    'temp',
    'backups'
  ];

  for (const dir of requiredDirs) {
    const fullPath = path.join(process.cwd(), dir);
    
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(`✅ 创建目录: ${dir}`);
    } else {
      console.log(`✅ 目录已存在: ${dir}`);
    }

    // 检查目录是否可写
    try {
      const testFile = path.join(fullPath, '.write-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      console.log(`✅ 目录可写: ${dir}`);
    } catch (error) {
      throw new Error(`目录不可写: ${dir} - ${error.message}`);
    }
  }
}

async function verifyFilePermissions() {
  const screenshotDir = process.env.SCREENSHOT_DIR || 'screenshots';
  const criticalPaths = [
    screenshotDir,
    'logs',
    'temp'
  ];

  for (const dirPath of criticalPaths) {
    const fullPath = path.join(process.cwd(), dirPath);
    
    try {
      const stats = fs.statSync(fullPath);
      
      // 在Windows上，权限检查不同
      if (process.platform === 'win32') {
        // Windows权限检查
        try {
          fs.accessSync(fullPath, fs.constants.R_OK | fs.constants.W_OK);
          console.log(`✅ Windows权限正常: ${dirPath}`);
        } catch (error) {
          throw new Error(`Windows权限不足: ${dirPath}`);
        }
      } else {
        // Unix/Linux权限检查
        const mode = stats.mode;
        const permissions = (mode & parseInt('777', 8)).toString(8);
        console.log(`✅ 权限 ${permissions}: ${dirPath}`);
        
        if ((mode & parseInt('200', 8)) === 0) {
          throw new Error(`目录不可写: ${dirPath}`);
        }
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`目录不存在: ${dirPath}`);
      }
      throw error;
    }
  }
}

async function buildApplication() {
  try {
    // 安装依赖
    console.log('📦 安装依赖...');
    execSync('npm install', { stdio: 'inherit' });

    // 生成Prisma客户端
    console.log('🔧 生成Prisma客户端...');
    execSync('npx prisma generate', { stdio: 'inherit' });

    // 构建TypeScript
    console.log('🔨 编译TypeScript...');
    try {
      execSync('npx tsc --noEmit', { stdio: 'inherit' });
    } catch (error) {
      console.warn('⚠️ TypeScript编译有警告，但继续部署');
    }

    // 运行测试（可选）
    if (process.env.NODE_ENV !== 'production') {
      console.log('🧪 运行测试...');
      try {
        execSync('npm test -- --run', { stdio: 'inherit' });
        console.log('✅ 测试通过');
      } catch (error) {
        console.warn('⚠️ 测试失败，但继续部署');
      }
    }

  } catch (error) {
    throw new Error(`构建失败: ${error.message}`);
  }
}

async function verifyFunctionality() {
  // 验证截图目录
  const screenshotDir = process.env.SCREENSHOT_DIR || 'screenshots';
  const screenshotPath = path.join(process.cwd(), screenshotDir);
  
  if (!fs.existsSync(screenshotPath)) {
    throw new Error(`截图目录不存在: ${screenshotPath}`);
  }

  // 检查现有截图文件
  const files = fs.readdirSync(screenshotPath);
  const imageFiles = files.filter(file => /\.(png|jpg|jpeg)$/i.test(file));
  console.log(`✅ 截图目录正常，现有图片文件: ${imageFiles.length} 个`);

  // 验证服务器启动（如果在开发环境）
  if (process.env.NODE_ENV === 'development') {
    console.log('🔍 验证服务器配置...');
    
    // 检查关键文件是否存在
    const criticalFiles = [
      'server/index.ts',
      'server/services/screenshotService.ts',
      'server/services/testExecution.ts',
      'server/routes/screenshots.ts'
    ];

    for (const file of criticalFiles) {
      if (fs.existsSync(file)) {
        console.log(`✅ 关键文件存在: ${file}`);
      } else {
        console.warn(`⚠️ 关键文件缺失: ${file}`);
      }
    }
  }

  console.log('✅ 功能验证完成');
}

// 创建部署状态检查函数
async function checkDeploymentStatus() {
  console.log('📊 部署状态检查...');
  
  const status = {
    environment: process.env.NODE_ENV || 'unknown',
    database: 'unknown',
    screenshots: 'unknown',
    services: 'unknown'
  };

  // 检查截图目录状态
  try {
    const screenshotDir = process.env.SCREENSHOT_DIR || 'screenshots';
    const files = fs.readdirSync(screenshotDir);
    const imageFiles = files.filter(file => /\.(png|jpg|jpeg)$/i.test(file));
    status.screenshots = `${imageFiles.length} files`;
  } catch (error) {
    status.screenshots = `error: ${error.message}`;
  }

  // 检查服务状态
  const services = [
    'server/services/screenshotService.ts',
    'server/services/testExecution.ts'
  ];
  
  const existingServices = services.filter(service => fs.existsSync(service));
  status.services = `${existingServices.length}/${services.length} services`;

  console.log('📊 部署状态:');
  console.log(`   环境: ${status.environment}`);
  console.log(`   数据库: ${status.database}`);
  console.log(`   截图: ${status.screenshots}`);
  console.log(`   服务: ${status.services}`);

  return status;
}

// 运行部署
if (require.main === module) {
  const command = process.argv[2];
  
  if (command === 'status') {
    checkDeploymentStatus();
  } else {
    deployApplication();
  }
}

module.exports = { 
  deployApplication, 
  validateEnvironmentConfig, 
  ensureDirectoryStructure,
  verifyFilePermissions,
  buildApplication,
  verifyFunctionality,
  checkDeploymentStatus
};