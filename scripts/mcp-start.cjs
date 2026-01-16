#!/usr/bin/env node

/**
 * 🔥 MCP Playwright 专用启动脚本
 * 确保 MCP 服务器在正确的环境下启动
 */

const { spawn, exec } = require('child_process');
const path = require('path');

console.log('🚀 正在启动 MCP Playwright 服务器...');

// 检查 @playwright/mcp 是否安装
exec('npm ls @playwright/mcp', (error, stdout, stderr) => {
  if (error) {
    console.log('⚠️ 正在安装 @playwright/mcp...');
    exec('npm install @playwright/mcp@latest', (installError) => {
      if (installError) {
        console.error('❌ 安装 @playwright/mcp 失败:', installError);
        process.exit(1);
      }
      startMcpServer();
    });
  } else {
    startMcpServer();
  }
});

function startMcpServer() {
  console.log('🎯 启动 MCP 服务器...');
  console.log('🔥 强制显示浏览器模式启动');
  
  // 🔥 与配置文件完全一致的启动参数 - 强制stdio模式
  const mcpArgs = [
    '@playwright/mcp@latest',
    '--browser', 'chromium',
    '--no-sandbox',
    '--ignore-https-errors'
  ];
  
  const mcpProcess = spawn('npx', mcpArgs, {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: {
      ...process.env,
      // 🚀 与配置文件一致的环境变量
      PLAYWRIGHT_HEADLESS: 'false',
      DEBUG: 'pw:browser*,pw:api*'
    }
  });
  
  mcpProcess.on('spawn', () => {
    console.log('✅ MCP Playwright 服务器已启动!');
    console.log('🌐 服务器地址: localhost:9000');
    console.log('📝 启动参数:', mcpArgs.join(' '));
  });
  
  mcpProcess.on('error', (error) => {
    console.error('❌ MCP 服务器启动失败:', error);
    process.exit(1);
  });
  
  mcpProcess.on('exit', (code, signal) => {
    if (code !== 0) {
      console.error(`❌ MCP 服务器异常退出，代码: ${code}, 信号: ${signal}`);
      process.exit(1);
    }
    console.log('🛑 MCP 服务器已停止');
  });
  
  // 处理进程终止信号
  process.on('SIGINT', () => {
    console.log('\n🛑 收到终止信号，正在关闭 MCP 服务器...');
    mcpProcess.kill('SIGTERM');
  });
  
  process.on('SIGTERM', () => {
    console.log('\n🛑 收到终止信号，正在关闭 MCP 服务器...');
    mcpProcess.kill('SIGTERM');
  });
}

// 检查是否直接运行此脚本
if (require.main === module) {
  console.log('🔥 MCP 启动脚本开始执行...');
} 