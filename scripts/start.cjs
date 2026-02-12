#!/usr/bin/env node

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const os = require('os');

const execPromise = promisify(exec);

// 🔥 加载环境变量（Docker 环境中通过 docker-compose 传递，无需 .env 文件）
try {
  const dotenv = require('dotenv');
  const envPath = path.join(__dirname, '..', '.env');
  
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log('✓ 已加载 .env 文件');
  } else {
    console.log('ℹ️ 未找到 .env 文件，使用环境变量或默认配置');
  }
} catch (error) {
  console.log('ℹ️ 使用环境变量或默认配置');
}

// 🔥 从环境变量读取配置，提供默认值
const BACKEND_PORT = parseInt(process.env.PORT || '3001', 10);
const FRONTEND_PORT = parseInt(process.env.VITE_PORT || '5173', 10);
const SERVER_HOST = process.env.SERVER_HOST || '0.0.0.0';

// Windows 兼容性：检测 npm 和 npx 命令
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

console.log('\n🚀 Sakura AI 启动脚本');
console.log('====================\n');

// 检查依赖是否已安装
function checkDependencies() {
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const nodeModulesPath = path.join(__dirname, '..', 'node_modules');
  
  if (!fs.existsSync(nodeModulesPath)) {
    console.log('   ⚙️  正在安装依赖（这可能需要几分钟）...');
    return new Promise((resolve, reject) => {
      const install = spawn(npmCmd, ['install'], { 
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit',
        shell: process.platform === 'win32'
      });
      
      install.on('close', (code) => {
        if (code === 0) {
          // 依赖安装完成，静默完成
          resolve();
        } else {
          // 提供通用的错误提示和解决方案
          console.error('\n❌ 依赖安装失败');
          console.error('\n📋 如果错误与 sqlite3 编译相关，可以尝试以下解决方案：');
          console.error('\n   方案 1（推荐）：安装 Visual Studio Build Tools');
          console.error('   - 下载地址: https://visualstudio.microsoft.com/downloads/');
          console.error('   - 选择 "Build Tools for Visual Studio"');
          console.error('   - 安装时勾选 "Desktop development with C++" 工作负载');
          console.error('   - 安装完成后重新运行此脚本');
          console.error('\n   方案 2：尝试使用预编译版本（跳过编译）');
          console.error('   - 运行: npm install --ignore-scripts');
          console.error('   - 然后运行: npm install sqlite3 --build-from-source=false');
          console.error('   - 如果仍有问题，可以暂时跳过: npm install --ignore-scripts');
          console.error('\n   方案 3：如果项目使用 MySQL，sqlite3 可能是可选依赖');
          console.error('   - 可以尝试: npm install --ignore-scripts');
          console.error('   - 然后手动安装其他依赖');
          console.error('\n💡 提示：项目当前配置使用 MySQL，sqlite3 可能是可选依赖');
          console.error('   如果不需要 SQLite，可以暂时跳过 sqlite3 的安装');
          reject(new Error('依赖安装失败，请查看上方错误信息和解决方案'));
        }
      });
      
      install.on('error', (error) => {
        reject(error);
      });
    });
  }
  return Promise.resolve();
}

// 等待数据库就绪
async function waitForDatabase() {
  // 检查是否需要等待数据库（Docker 环境或配置了远程数据库）
  const isDocker = fs.existsSync('/.dockerenv') || process.env.DOCKER_CONTAINER === 'true';
  const dbUrl = process.env.DATABASE_URL || '';
  
  // 如果不是 Docker 环境且数据库是本地 localhost，跳过等待
  // if (!isDocker && dbUrl.includes('localhost')) {
  //   return;
  // }

  const maxRetries = 30;
  const retryInterval = 10000; // 10秒
  let retryCount = 0;
  
  // 从环境变量解析数据库连接信息
  const match = dbUrl.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  
  if (!match) {
    console.log('   ⚠️  无法解析 DATABASE_URL，跳过数据库连接检查');
    await new Promise(resolve => setTimeout(resolve, 5000));
    return;
  }
  
  const [, user, password, host, port, database] = match;
  
  console.log(`   🔗 连接目标: ${user}:${password}@${host}:${port}/${database}`);
  
  while (retryCount < maxRetries) {
    try {
      // 使用 Node.js mysql2 包测试连接（跨平台，不依赖系统工具）
      const mysql = require('mysql2/promise');
      const connection = await mysql.createConnection({
        host: host,
        port: parseInt(port),
        user: user,
        password: password,
        connectTimeout: 5000
      });
      
      // 测试连接
      await connection.ping();
      await connection.end();
      
      console.log(`   ✅ 数据库已就绪 (尝试 ${retryCount + 1}/${maxRetries})`);
      return;
    } catch (error) {
      retryCount++;
      if (retryCount < maxRetries) {
        process.stdout.write(`\r   ⏳ 等待数据库启动... (${retryCount}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, retryInterval));
      } else {
        console.log(`\n   ❌ 数据库连接失败，无法启动应用`);
        console.log(`   💡 连接信息: ${user}@${host}:${port}`);
        console.log(`   💡 请检查：`);
        console.log(`      1. 数据库服务是否正常运行`);
        console.log(`      2. 网络连接是否正常`);
        console.log(`      3. DATABASE_URL 配置是否正确`);
        console.log(`      4. 用户名和密码是否正确`);
        if (isDocker) {
          console.log(`      5. Docker 容器状态: docker compose ps`);
          console.log(`      6. 数据库日志: docker compose logs mysql`);
        }
        console.log(`   💡 错误详情: ${error.message}`);
        process.exit(1);
      }
    }
  }
}

// 运行数据库迁移
async function runDatabaseMigrations() {
  try {
    return new Promise((resolve, reject) => {
      console.log('   ⚙️  检查数据库迁移状态...');
      
      // 检查是否有标准的迁移目录（时间戳格式）
      const migrationsDir = path.join(__dirname, '..', 'prisma', 'migrations');
      let hasStandardMigrations = false;
      
      try {
        const entries = fs.readdirSync(migrationsDir, { withFileTypes: true });
        // 查找时间戳格式的目录（如 20240101000000_init）
        hasStandardMigrations = entries.some(entry => 
          entry.isDirectory() && /^\d{14}_/.test(entry.name)
        );
      } catch (error) {
        console.log('   ℹ️  迁移目录不存在，跳过迁移');
        resolve();
        return;
      }
      
      if (hasStandardMigrations) {
        // 有标准迁移，使用 migrate deploy（幂等，安全）
        console.log('   📦 发现标准迁移文件，执行 migrate deploy...');
        
        // Docker 环境下支持重试
        const isDocker = fs.existsSync('/.dockerenv') || process.env.DOCKER_CONTAINER === 'true';
        const maxRetries = isDocker ? 3 : 1;
        let retryCount = 0;
        
        const attemptMigration = () => {
          const migrateDeploy = spawn(npxCmd, ['prisma', 'migrate', 'deploy'], { 
            cwd: path.join(__dirname, '..'),
            stdio: 'inherit',
            shell: process.platform === 'win32'
          });
          
          migrateDeploy.on('close', (code) => {
            if (code === 0) {
              console.log('   ✅ 数据库迁移完成');
              // 迁移成功后，检查数据库是否与 schema 一致
              checkDatabaseSync(resolve);
            } else {
              retryCount++;
              if (retryCount < maxRetries) {
                console.log(`   ⚠️  迁移失败（退出码: ${code}），等待 3 秒后重试... (${retryCount}/${maxRetries})`);
                setTimeout(attemptMigration, 3000);
              } else {
                console.log(`   ⚠️  迁移失败（退出码: ${code}），尝试使用 db push 修复...`);
                executeDbPushForRepair(resolve);
              }
            }
          });
          
          migrateDeploy.on('error', (error) => {
            retryCount++;
            if (retryCount < maxRetries) {
              console.warn('   ⚠️  迁移执行出错:', error.message);
              console.log(`   🔄 等待 3 秒后重试... (${retryCount}/${maxRetries})`);
              setTimeout(attemptMigration, 3000);
            } else {
              console.warn('   ⚠️  迁移执行出错:', error.message);
              console.log('   🔄 尝试使用 db push 修复数据库结构...');
              executeDbPushForRepair(resolve);
            }
          });
        };
        
        attemptMigration();
      } else {
        // 没有标准迁移，跳过（避免使用 db push）
        console.log('   ℹ️  未发现标准迁移文件，跳过数据库迁移');
        console.log('   💡 如需初始化数据库，请手动执行: npx prisma db push');
        console.log('   💡 或创建标准迁移: npx prisma migrate dev --name init');
        resolve();
      }
    });
  } catch (error) {
    console.warn('⚠️ 数据库迁移检查异常，但继续启动:', error.message);
    resolve();
  }
}

// 检查数据库是否与 schema 同步
function checkDatabaseSync(resolve) {
  console.log('   🔍 检查数据库结构一致性...');
  
  // 使用 prisma migrate diff 检测差异
  const migrateDiff = spawn(npxCmd, [
    'prisma', 'migrate', 'diff',
    '--from-schema-datamodel', 'prisma/schema.prisma',
    '--to-schema-datasource', 'prisma/schema.prisma',
    '--exit-code'
  ], { 
    cwd: path.join(__dirname, '..'),
    stdio: 'pipe',  // 使用 pipe 捕获输出
    shell: process.platform === 'win32'
  });
  
  let output = '';
  migrateDiff.stdout?.on('data', (data) => {
    output += data.toString();
  });
  
  migrateDiff.stderr?.on('data', (data) => {
    output += data.toString();
  });
  
  migrateDiff.on('close', (code) => {
    if (code === 0) {
      // 退出码 0 表示没有差异
      console.log('   ✅ 数据库结构一致，无需同步');
      resolve();
    } else if (code === 2) {
      // 退出码 2 表示有差异，需要同步
      console.log('   ⚠️  检测到数据库结构差异，执行同步...');
      console.log('   💡 注意：如果看到重复键错误，可以忽略（Prisma 已知问题）');
      executeDbPushForRepair(resolve);
    } else {
      // 其他错误码，静默处理
      console.log('   ℹ️  无法检测数据库差异，跳过同步检查');
      resolve();
    }
  });
  
  migrateDiff.on('error', (error) => {
    console.warn('   ⚠️  差异检测失败:', error.message);
    console.log('   ℹ️  跳过同步检查，继续启动');
    resolve();
  });
}

// 执行 db push 用于修复数据库（仅在检测到差异或迁移失败时）
function executeDbPushForRepair(resolve) {
  const dbPush = spawn(npxCmd, ['prisma', 'db', 'push', '--accept-data-loss', '--skip-generate'], { 
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  
  dbPush.on('close', (pushCode) => {
    if (pushCode === 0) {
      console.log('   ✅ 数据库结构同步完成');
    } else {
      console.log('   ⚠️  数据库同步失败（退出码: ${pushCode}），但继续启动');
      console.log('   💡 这通常是 Prisma 的已知问题（重复键错误），可以忽略');
      console.log('   💡 如果服务运行正常，无需手动处理');
    }
    // 无论成功与否，都继续启动
    resolve();
  });
  
  dbPush.on('error', (error) => {
    console.warn('   ⚠️  数据库同步出错:', error.message, '，但继续启动');
    // 静默处理，不阻止启动
    resolve();
  });
}

// 生成 Prisma 客户端
async function generatePrismaClient() {
  try {
    const prismaClientPath = path.resolve(__dirname, '../src/generated/prisma');
    
    // 检查 Prisma 客户端是否已生成
    if (fs.existsSync(prismaClientPath) && fs.existsSync(path.join(prismaClientPath, 'index.js'))) {
      // 已存在，静默跳过
      return;
    }
    
    // 需要生成时才显示日志
    console.log('   ⚙️  正在生成 Prisma 客户端...');
    
    // 直接使用 npx prisma generate 生成客户端
    return new Promise((resolve, reject) => {
      const prismaGenerate = spawn(npxCmd, ['prisma', 'generate'], { 
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit',
        shell: process.platform === 'win32'
      });
      
      prismaGenerate.on('close', (code) => {
        if (code === 0) {
          // 生成成功，静默完成
          resolve();
        } else {
          reject(new Error('Prisma 客户端生成失败'));
        }
      });
      
      prismaGenerate.on('error', (error) => {
        reject(error);
      });
    });
  } catch (error) {
    console.error('❌ Prisma 客户端生成失败:', error.message);
    console.error('💡 提示：可以手动运行 "npx prisma generate" 来生成 Prisma 客户端');
    process.exit(1);
  }
}

// 安装 Playwright 浏览器
async function setup() {
  try {
    // 🔥 跨平台检测：验证 Playwright 缓存中的可执行文件是否存在
    const isWindows = process.platform === 'win32';
    const isDocker = fs.existsSync('/.dockerenv') || process.env.DOCKER_CONTAINER === 'true';
    
    // Docker 环境使用固定路径，本地环境使用用户目录
    const playwrightCachePath = isDocker
      ? '/root/.cache/ms-playwright'
      : (isWindows 
          ? path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright')
          : path.join(os.homedir(), '.cache', 'ms-playwright'));
    
    console.log(`   🔍 检查 Playwright 缓存路径: ${playwrightCachePath}`);
    
    if (fs.existsSync(playwrightCachePath)) {
      const cacheContents = fs.readdirSync(playwrightCachePath);
      console.log(`   📂 缓存目录内容: ${cacheContents.join(', ')}`);
      
      // 查找任意版本的 chromium 目录并验证可执行文件
      const chromiumDir = cacheContents.find(dir => dir.startsWith('chromium-') && !dir.includes('headless'));
      const headlessDir = cacheContents.find(dir => dir.includes('chromium_headless_shell'));
      const ffmpegDir = cacheContents.find(dir => dir.startsWith('ffmpeg'));
      
      let chromiumOk = false;
      let headlessOk = false;
      let ffmpegOk = false;
      
      // 验证 chromium 可执行文件（跨平台）
      if (chromiumDir) {
        const chromeExe = isWindows ? 'chrome.exe' : 'chrome';
        const chromeSubPath = isWindows ? 'chrome-win' : 'chrome-linux';
        const chromePath = path.join(playwrightCachePath, chromiumDir, chromeSubPath, chromeExe);
        chromiumOk = fs.existsSync(chromePath);
        if (chromiumOk) {
          console.log(`   📦 chromium: ${chromiumDir} ✓ (${chromePath})`);
        } else {
          console.log(`   ❌ chromium 可执行文件不存在: ${chromePath}`);
        }
      } else {
        console.log(`   ❌ 未找到 chromium 目录`);
      }
      
      // 验证 headless shell 可执行文件（跨平台）
      if (headlessDir) {
        const headlessExe = isWindows ? 'headless_shell.exe' : 'headless_shell';
        const headlessSubPath = isWindows ? 'chrome-win' : 'chrome-linux';
        const headlessPath = path.join(playwrightCachePath, headlessDir, headlessSubPath, headlessExe);
        headlessOk = fs.existsSync(headlessPath);
        if (headlessOk) {
          console.log(`   📦 headless_shell: ${headlessDir} ✓ (${headlessPath})`);
          
          // 验证文件权限（仅 Linux/Docker）
          if (!isWindows) {
            try {
              const stats = fs.statSync(headlessPath);
              const isExecutable = (stats.mode & 0o111) !== 0;
              if (!isExecutable) {
                console.log(`   ⚠️ headless_shell 没有执行权限，正在修复...`);
                fs.chmodSync(headlessPath, 0o755);
                console.log(`   ✅ 已设置执行权限`);
              }
            } catch (err) {
              console.log(`   ⚠️ 无法检查/设置权限: ${err.message}`);
            }
          }
        } else {
          console.log(`   ❌ headless_shell 可执行文件不存在: ${headlessPath}`);
          
          // 尝试列出目录内容以诊断问题
          try {
            const headlessDirPath = path.join(playwrightCachePath, headlessDir);
            if (fs.existsSync(headlessDirPath)) {
              console.log(`   🔍 ${headlessDir} 目录内容:`);
              const listDir = (dir, prefix = '     ') => {
                const items = fs.readdirSync(dir, { withFileTypes: true });
                items.forEach(item => {
                  const fullPath = path.join(dir, item.name);
                  if (item.isDirectory()) {
                    console.log(`${prefix}📁 ${item.name}/`);
                    listDir(fullPath, prefix + '  ');
                  } else {
                    const stats = fs.statSync(fullPath);
                    const size = (stats.size / 1024 / 1024).toFixed(2);
                    console.log(`${prefix}📄 ${item.name} (${size} MB)`);
                  }
                });
              };
              listDir(headlessDirPath);
            }
          } catch (err) {
            console.log(`   ⚠️ 无法列出目录: ${err.message}`);
          }
        }
      } else {
        console.log(`   ❌ 未找到 headless_shell 目录`);
      }
      
      // 验证 ffmpeg 可执行文件（跨平台）
      if (ffmpegDir) {
        // Windows 和 Linux 的 ffmpeg 路径结构不同
        let ffmpegPath;
        if (isWindows) {
          // Windows: ffmpeg-1011/ffmpeg-win64.exe (直接在根目录)
          ffmpegPath = path.join(playwrightCachePath, ffmpegDir, 'ffmpeg-win64.exe');
        } else {
          // Linux: ffmpeg-1009/ffmpeg-linux
          ffmpegPath = path.join(playwrightCachePath, ffmpegDir, 'ffmpeg-linux');
        }
        
        ffmpegOk = fs.existsSync(ffmpegPath);
        if (ffmpegOk) {
          console.log(`   📦 ffmpeg: ${ffmpegDir} ✓ (${ffmpegPath})`);
        } else {
          console.log(`   ⚠️ ffmpeg 路径不存在: ${ffmpegPath}`);
        }
      } else {
        console.log(`   ⚠️ 未找到 ffmpeg 目录`);
      }
      
      if (chromiumOk && headlessOk && ffmpegOk) {
        console.log(`   ✅ Playwright 浏览器已完整安装，跳过下载`);
        return;
      } else {
        console.log(`   ⚠️ Playwright 缓存不完整: chromium=${chromiumOk}, headless=${headlessOk}, ffmpeg=${ffmpegOk}`);
        if (!ffmpegOk) {
          console.log(`   💡 ffmpeg 用于视频录制功能，将自动安装`);
        }
        
        // Docker 环境下如果缺少浏览器，说明构建有问题
        if (isDocker) {
          console.error(`   ❌ Docker 环境中 Playwright 浏览器缺失，这不应该发生！`);
          console.error(`   💡 请检查 Dockerfile 中的 COPY 指令是否正确`);
          console.error(`   💡 或者重新构建镜像: docker compose build --no-cache`);
          process.exit(1);
        }
      }
    } else {
      console.log(`   ⚠️ Playwright 缓存目录不存在: ${playwrightCachePath}`);
    }
    
    // 下载 Playwright 浏览器（使用当前安装的 Playwright 版本）
    console.log(`   ⚙️ 正在下载 Playwright 浏览器...`);
    const playwrightPath = path.resolve(__dirname, '../node_modules/playwright');
    if (!fs.existsSync(playwrightPath)) {
        console.log('   ❌ Playwright 未安装，请先运行 npm install');
        process.exit(1);
    }
    
    const playwrightCliPath = path.resolve(playwrightPath, 'cli.js');
    // 安装 chromium 和 ffmpeg（视频录制必需）
    const installCmd = isWindows 
      ? `node "${playwrightCliPath}" install chromium chromium-headless-shell ffmpeg`
      : `node "${playwrightCliPath}" install --with-deps chromium chromium-headless-shell ffmpeg`;
    
    console.log(`   🔧 执行命令: ${installCmd}`);
    await execPromise(installCmd);
    console.log(`   ✅ Playwright 浏览器和 ffmpeg 下载完成`);
    
    // 再次验证安装结果
    console.log(`   🔍 验证安装结果...`);
    const verifyContents = fs.readdirSync(playwrightCachePath);
    console.log(`   📂 安装后缓存内容: ${verifyContents.join(', ')}`);
  } catch (error) {
    console.error('   ❌ Playwright 浏览器安装失败:', error.message);
    console.error('   💡 可以手动运行: npx playwright install chromium chromium-headless-shell ffmpeg');
    if (error.stack) {
      console.error('   📋 错误堆栈:', error.stack);
    }
    process.exit(1);
  }
}

// 创建必要的目录
function createDirectories() {
  const dirs = ['screenshots', 'logs', 'temp'];
  dirs.forEach(dir => {
    const dirPath = path.join(__dirname, '..', dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      // 静默创建，不输出日志
    }
  });
}

// 检查服务健康状态
function checkServiceHealth(url, serviceName, maxAttempts = 60) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    let attempts = 0;
    let isResolved = false;
    let checkTimer = null;
    
    const cleanup = () => {
      if (checkTimer) {
        clearTimeout(checkTimer);
        checkTimer = null;
      }
    };
    
    const check = () => {
      if (isResolved) return;
      
      attempts++;
      
      // 只在第一次和每10次尝试时显示进度
      if (attempts === 1 || attempts % 10 === 0) {
        process.stdout.write(`\r⏳ 等待${serviceName}启动... (${attempts}/${maxAttempts})`);
      }
      
      const req = http.get(url, { timeout: 2000 }, (res) => {
        if (isResolved) return;
        
        // 对于健康检查端点，200 表示成功
        // 对于前端，任何响应都表示服务已启动
        if (res.statusCode === 200 || res.statusCode < 500) {
          cleanup();
          isResolved = true;
          process.stdout.write('\r'); // 清除进度行
          resolve(true);
        } else {
          if (attempts < maxAttempts) {
            checkTimer = setTimeout(check, 1000);
          } else {
            cleanup();
            reject(new Error(`${serviceName}启动超时 (${maxAttempts} 秒)`));
          }
        }
        res.resume(); // 释放响应对象
      });
      
      req.on('error', () => {
        if (isResolved) return;
        
        if (attempts < maxAttempts) {
          checkTimer = setTimeout(check, 1000);
        } else {
          cleanup();
          reject(new Error(`${serviceName}启动超时 (${maxAttempts} 秒)`));
        }
      });
      
      req.on('timeout', () => {
        req.destroy();
        if (isResolved) return;
        
        if (attempts < maxAttempts) {
          checkTimer = setTimeout(check, 1000);
        } else {
          cleanup();
          reject(new Error(`${serviceName}启动超时 (${maxAttempts} 秒)`));
        }
      });
    };
    
    // 等待 3 秒后开始检查（给服务启动时间）
    checkTimer = setTimeout(check, 3000);
  });
}

// 启动服务
async function startServices() {
  console.log('\n🔥 启动 Sakura AI 服务...');
  console.log('====================\n');
  
  // 🔥 修复：按顺序启动服务，确保后端先启动成功后再启动前端
  
  // 步骤 1: 启动后端服务
  console.log('🔧 [1/2] 正在启动后端服务...');
  const backendProcess = spawn(npxCmd, ['tsx', 'watch', 'server/index.ts'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1'
    }
  });
  
  // 存储后端进程引用以便优雅关闭
  process._backendProcess = backendProcess;
  
  // 错误处理
  backendProcess.on('error', (error) => {
    console.error('\n❌ 后端服务启动失败:', error.message);
    console.error('💡 请检查：');
    console.error('   1. 是否已安装所有依赖 (npm install)');
    console.error('   2. 是否已生成 Prisma 客户端 (npx prisma generate)');
    console.error('   3. 环境变量是否正确配置 (.env 文件)');
    console.error('   4. 端口是否被占用');
    console.error('   5. tsx 是否已安装 (npm install tsx)');
    process.exit(1);
  });
  
  // 步骤 2: 等待后端服务健康检查通过
  try {
    console.log('⏳ 等待后端服务启动...');
    const backendHealthUrl = `http://${SERVER_HOST}:${BACKEND_PORT}/health`;
    await checkServiceHealth(backendHealthUrl, '后端服务', 60);
    console.log(`✅ 后端服务已启动并运行正常 (端口 ${BACKEND_PORT})`);
  } catch (error) {
    console.error('\n❌ 后端服务健康检查失败:', error.message);
    console.error('💡 提示：');
    console.error('   - 后端可能仍在启动中，请查看上方的日志');
    console.error('   - 如果后端启动失败，请检查：');
    console.error('     1. 数据库连接是否正常');
    console.error('     2. 环境变量是否正确配置');
    console.error(`     3. 端口 ${BACKEND_PORT} 是否被占用`);
    console.error('   - 可以单独运行 "npm run dev:server" 查看详细错误信息');
    process.exit(1);
  }
  
  // 步骤 3: 后端启动成功后，启动前端服务
  console.log('\n🔧 [2/2] 正在启动前端服务...\n');
  const frontendProcess = spawn('node', [
    '--max-old-space-size=4096',
    './node_modules/vite/bin/vite.js'
  ], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  
  // 存储前端进程引用以便优雅关闭
  process._frontendProcess = frontendProcess;
  
  frontendProcess.on('error', (error) => {
    console.error('\n❌ 前端服务启动失败:', error.message);
    console.error('💡 请检查：');
    console.error(`   1. 端口 ${FRONTEND_PORT} 是否被占用`);
    console.error('   2. vite 是否已安装');
    process.exit(1);
  });
  
  // 步骤 4: 等待前端服务启动
  try {
    console.log('⏳ 等待前端服务启动...');
    const frontendHealthUrl = `http://${SERVER_HOST}:${FRONTEND_PORT}`;
    await checkServiceHealth(frontendHealthUrl, '前端服务', 30);
    console.log(`✅ 前端服务已启动并运行正常 (端口 ${FRONTEND_PORT})`);
  } catch (error) {
    console.warn('\n⚠️ 前端服务健康检查失败:', error.message);
    console.warn('💡 提示：前端可能仍在启动中，请查看上方的日志');
  }
  
  // 步骤 5: 所有服务启动完成，输出访问地址
  console.log('\n🎉 所有服务启动完成');
  console.log('====================');
  
  // 🔥 获取所有可用的网络地址
  const networkInterfaces = os.networkInterfaces();
  const networkIps = [];
  
  for (const name of Object.keys(networkInterfaces)) {
    const netInterface = networkInterfaces[name];
    if (netInterface) {
      for (const net of netInterface) {
        if (net.family === 'IPv4' && !net.internal) {
          const ip = net.address;
          if (ip !== '127.0.0.1' && ip !== '::1') {
            networkIps.push(ip);
          }
        }
      }
    }
  }
  
  // 去重并排序：优先显示局域网地址
  const uniqueIps = Array.from(new Set(networkIps));
  const sortedIps = uniqueIps.sort((a, b) => {
    const isLanA = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(a);
    const isLanB = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(b);
    if (isLanA && !isLanB) return -1;
    if (!isLanA && isLanB) return 1;
    return 0;
  });
  
  // 分离局域网地址和链路本地地址
  const lanIps = sortedIps.filter(ip => /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(ip));
  const linkLocalIps = sortedIps.filter(ip => /^169\.254\./.test(ip));
  
  console.log('📍 访问地址:');
  console.log('   - 本地访问:');
  console.log(`     • 后端: http://localhost:${BACKEND_PORT}`);
  console.log(`     • 前端: http://localhost:${FRONTEND_PORT}`);
  
  if (lanIps.length > 0) {
    console.log('   - 内网访问 (推荐):');
    lanIps.forEach(ip => {
      console.log(`     • 后端: http://${ip}:${BACKEND_PORT}`);
      console.log(`     • 前端: http://${ip}:${FRONTEND_PORT}`);
    });
  }
  
  if (linkLocalIps.length > 0) {
    console.log('   - 链路本地地址 (仅同链路可用):');
    linkLocalIps.forEach(ip => {
      console.log(`     • 后端: http://${ip}:${BACKEND_PORT}`);
      console.log(`     • 前端: http://${ip}:${FRONTEND_PORT}`);
    });
  }
  console.log('🔑 登录凭据:');
  console.log('   - 用户名: admin');
  console.log('   - 密码: admin');
  console.log('====================');
  console.log('💡 提示: 按 Ctrl+C 停止服务\n');
  
  // 优雅关闭处理
  const shutdown = () => {
    console.log('\n🛑 正在关闭服务...');
    if (process._backendProcess) {
      process._backendProcess.kill('SIGINT');
    }
    if (process._frontendProcess) {
      process._frontendProcess.kill('SIGINT');
    }
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  };
  
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  
  // 后端进程关闭事件
  backendProcess.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`\n❌ 后端服务异常退出 (退出码: ${code})`);
      console.error('💡 请检查上方的错误信息');
      console.error('💡 可以尝试单独启动后端: npm run dev:server');
    } else {
      console.log(`\n后端服务已关闭 (退出码: ${code})`);
    }
  });
  
  // 前端进程关闭事件
  frontendProcess.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`\n❌ 前端服务异常退出 (退出码: ${code})`);
      console.error('💡 请检查上方的错误信息');
    } else {
      console.log(`\n前端服务已关闭 (退出码: ${code})`);
    }
  });
}

// 主启动流程
async function main() {
  try {
    console.log('📋 启动检查清单:');
    console.log('   [1/6] 检查依赖...');
    await checkDependencies();
    
    console.log('   [2/6] 生成 Prisma 客户端...');
    await generatePrismaClient();
    
    console.log('   [3/6] 等待数据库就绪...');
    await waitForDatabase();
    
    console.log('   [4/6] 运行数据库迁移...');
    await runDatabaseMigrations();
    
    console.log('   [5/6] 创建必要目录...');
    createDirectories();
    
    console.log('   [6/6] 安装 Playwright 浏览器...');
    await setup();
    
    console.log('✅ 所有启动检查完成\n');
    await startServices();
  } catch (error) {
    console.error('\n❌ 启动失败:', error.message);
    process.exit(1);
  }
}

main(); 