#!/usr/bin/env node

/**
 * 🔥 MCP 环境检查脚本
 * 验证 MCP Playwright 服务器是否正确启动和可用
 */

const { spawn, exec } = require('child_process');
const http = require('http');

console.log('🔍 检查 MCP 环境...');

// 检查 @playwright/mcp 包是否已安装
function checkMcpPackage() {
  return new Promise((resolve, reject) => {
    exec('npm ls @playwright/mcp', (error, stdout, stderr) => {
      if (error) {
        console.log('❌ @playwright/mcp 包未安装');
        console.log('💡 正在安装 @playwright/mcp...');
        exec('npm install @playwright/mcp@latest', (installError) => {
          if (installError) {
            console.error('❌ 安装失败:', installError.message);
            reject(installError);
          } else {
            console.log('✅ @playwright/mcp 安装成功');
            resolve();
          }
        });
      } else {
        console.log('✅ @playwright/mcp 包已安装');
        resolve();
      }
    });
  });
}

// 测试 MCP 服务器启动
function testMcpServer() {
  return new Promise((resolve, reject) => {
    console.log('🧪 测试 MCP 服务器启动...');
    
    const mcpProcess = spawn('npx', ['@playwright/mcp@latest', '--help'], {
      stdio: 'pipe'
    });
    
    let output = '';
    mcpProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    mcpProcess.on('close', (code) => {
      if (code === 0 && output.includes('Usage:')) {
        console.log('✅ MCP 服务器可以正常启动');
        resolve();
      } else {
        console.error('❌ MCP 服务器启动失败');
        reject(new Error('MCP 服务器不可用'));
      }
    });
    
    mcpProcess.on('error', (error) => {
      console.error('❌ MCP 服务器错误:', error.message);
      reject(error);
    });
  });
}

// 检查 Playwright 浏览器
function checkPlaywrightBrowsers() {
  return new Promise((resolve, reject) => {
    console.log('🌐 检查 Playwright 浏览器...');
    
    // 尝试安装 chromium
    const installProcess = spawn('npx', ['playwright', 'install', 'chromium'], {
      stdio: 'inherit'
    });
    
    installProcess.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Playwright Chromium 浏览器准备就绪');
        resolve();
      } else {
        console.error('❌ Playwright 浏览器安装失败');
        reject(new Error('浏览器安装失败'));
      }
    });
    
    installProcess.on('error', (error) => {
      console.error('❌ 浏览器安装错误:', error.message);
      reject(error);
    });
  });
}

// 主检查流程
async function main() {
  try {
    console.log('🚀 开始 MCP 环境检查...\n');
    
    await checkMcpPackage();
    await testMcpServer();
    await checkPlaywrightBrowsers();
    
    console.log('\n✅ MCP 环境检查完成');
    console.log('🎉 您可以使用以下命令启动：');
    console.log('   npm run mcp:start  - 启动 MCP 服务器');
    console.log('   npm run server     - 启动应用服务器');
    console.log('   npm run dev        - 启动完整开发环境');
    
  } catch (error) {
    console.error('\n❌ MCP 环境检查失败:', error.message);
    console.log('\n💡 请尝试以下解决方案:');
    console.log('1. 运行: npm install @playwright/mcp@latest');
    console.log('2. 运行: npx playwright install chromium');
    console.log('3. 检查网络连接是否正常');
    process.exit(1);
  }
}

// 检查是否直接运行此脚本
if (require.main === module) {
  main();
} 