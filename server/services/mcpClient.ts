import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { TestStep } from '../../src/types/test.js';
import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { screenshotConfig } from '../../src/utils/screenshotConfig.js';
import { elementCache } from './elementCache.js'; // 🔥 新增：元素缓存系统

const require = createRequire(import.meta.url);

export interface McpExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
}

export class PlaywrightMcpClient {
  private client: Client<any, any> | null = null;
  private transport: StdioClientTransport | null = null;
  private isInitialized = false;
  private snapshot: any | null = null;
  private useAlternativeToolNames = false; // 🔥 工具名称映射标志
  
  // 🔥 静态方法：服务器启动时预安装浏览器
  public static async ensureBrowserInstalled(): Promise<void> {
    console.log('🚀 正在进行浏览器预安装检查...');
    
    try {
      // 检查浏览器安装路径
      const browserPath = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright');
      
      console.log('🔍 浏览器安装路径:', browserPath);
      
      // 创建临时MCP连接用于安装
      const tempTransport = new StdioClientTransport({
        command: 'npx',
        args: ['@playwright/mcp', '--browser', 'chromium'],
        env: {
          ...process.env,
          PLAYWRIGHT_BROWSERS_PATH: browserPath,
          PLAYWRIGHT_HEADLESS: 'false',
          HEADLESS: 'false',
          // 🔥 超时配置
          PLAYWRIGHT_TIMEOUT: '120000',
          PLAYWRIGHT_LAUNCH_TIMEOUT: '120000',
          PLAYWRIGHT_NAVIGATION_TIMEOUT: '120000'
        }
      });

      const tempClient = new Client({ name: 'browser-installer', version: '1.0.0' }, {});
      
      try {
        await tempClient.connect(tempTransport);
        
        console.log('🔧 正在安装/验证浏览器...');
        await tempClient.callTool({
          name: 'browser_install',
          arguments: {}
        });
        
        console.log('✅ 浏览器预安装完成');
      } finally {
        // 清理临时连接
        try {
          await tempClient.close();
        } catch (e) {
          // 忽略清理错误
        }
      }
    } catch (error) {
      console.log('⚠️ 浏览器可能已安装或安装失败:', error.message);
      // 不抛出错误，让系统继续启动
    }
  }

  async initialize(options: { reuseSession?: boolean; contextState?: any; } = {}) {
    if (this.isInitialized && options.reuseSession) {
      console.log('♻️ 复用现有MCP会话');
      if (options.contextState) await this.setContextState(options.contextState);
      return;
    }

    if (this.isInitialized) await this.close();

    console.log('🚀 正在启动MCP Playwright服务器...');
    console.log('📋 启动参数:', JSON.stringify(options, null, 2));

    try {
      // 🎯 使用有头模式 - 显示浏览器窗口
      console.log('🎯 使用有头模式 - 浏览器窗口可见');

      // 🔥 恢复蓝色Chromium：使用临时目录但保留Playwright自带浏览器
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-chrome-'));
      console.log('🎯 使用临时目录:', tmpDir);

      // 🎯 智能检测Playwright浏览器路径
      const possibleBrowserPaths = [
        path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright'),
        path.join(process.cwd(), 'node_modules', 'playwright-core', '.local-browsers')
      ];

      let browserPath = '';
      for (const browserDir of possibleBrowserPaths) {
        if (fs.existsSync(browserDir)) {
          // 查找 chromium 相关目录
          const entries = fs.readdirSync(browserDir, { withFileTypes: true });
          const chromiumDir = entries.find(function (entry) {
            return entry.isDirectory() && entry.name.startsWith('chromium-');
          });
          if (chromiumDir) {
            browserPath = browserDir;
            console.log('🔍 找到Playwright浏览器目录:', browserPath);
            console.log('🔍 找到Chromium:', chromiumDir.name);
            break;
          }
        }
      }

      if (browserPath) {
        process.env.PLAYWRIGHT_BROWSERS_PATH = browserPath;
        console.log('🎯 设置PLAYWRIGHT_BROWSERS_PATH:', browserPath);
      } else {
        console.log('⚠️ 未找到Playwright浏览器，使用默认路径');
      }

      // 浏览器启动参数
      const enhancedArgs = [
        `--user-data-dir=${tmpDir}`,
        '--no-first-run',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-popup-blocking',
        '--disable-sync',
      ];

      // 从环境变量读取全屏配置并应用
      // 注意：MCP服务器可能不支持通过环境变量传递启动参数
      // 我们会在浏览器启动后通过工具设置全屏
      const browserFullscreen = process.env.MCP_BROWSER_FULLSCREEN !== 'false';
      if (browserFullscreen) {
        enhancedArgs.push('--kiosk');
      } else if (process.env.MCP_BROWSER_MAXIMIZED !== 'false') {
        enhancedArgs.push('--start-maximized');
      }

      // 🔥 设置网络访问环境变量（无调试模式）
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // 忽略SSL证书验证
      process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1';
      // process.env.DEBUG = 'pw:browser*,pw:api*,pw:network*,pw:protocol*'; // 禁用调试输出
      // process.env.PWDEBUG = '1'; // 禁用调试模式
      process.env.PLAYWRIGHT_TIMEOUT = '120000';  // 🔥 增加到120秒
      process.env.PLAYWRIGHT_LAUNCH_TIMEOUT = '120000';  // 🔥 浏览器启动超时
      process.env.PLAYWRIGHT_NAVIGATION_TIMEOUT = '120000';  // 🔥 导航超时
      process.env.PLAYWRIGHT_IGNORE_HTTPS_ERRORS = 'true';

      // 配置MCP输出目录
      const screenshotDir = screenshotConfig.getScreenshotsDirectory();
      screenshotConfig.ensureScreenshotsDirectory();

      // 🔥 创建到MCP的连接（浏览器已在服务器启动时安装）
      // 🔥 修复：通过环境变量传递浏览器启动参数（使用之前已设置的 enhancedArgs）
      this.transport = new StdioClientTransport({
        command: 'npx',
        args: ['@playwright/mcp'],
        env: {
          ...process.env,
          PLAYWRIGHT_BROWSERS_PATH: browserPath || path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright'),
          PLAYWRIGHT_HEADLESS: 'false',
          HEADLESS: 'false',
          PLAYWRIGHT_TIMEOUT: '120000',
          PLAYWRIGHT_LAUNCH_TIMEOUT: '120000',
          PLAYWRIGHT_NAVIGATION_TIMEOUT: '120000',
          PLAYWRIGHT_MCP_OUTPUT_DIR: screenshotDir,
          MCP_OUTPUT_DIR: screenshotDir,
          PLAYWRIGHT_SCREENSHOTS_DIR: screenshotDir,
          MCP_SCREENSHOT_DIR: screenshotDir,
          PLAYWRIGHT_DOWNLOAD_DIR: screenshotDir,
          PLAYWRIGHT_TEMP_DIR: screenshotDir,
          // 🔥 修复：启用文件下载功能
          PLAYWRIGHT_ACCEPT_DOWNLOADS: 'true',
          PLAYWRIGHT_DOWNLOADS_PATH: screenshotDir
        }
      });

      // 🔥 连接MCP客户端
      this.client = new Client(
        { name: 'ai-test-client', version: '1.0.0' }, 
        {}  // 🔥 使用默认配置，在callTool层面处理超时
      );
      
      console.log('🔧 正在连接MCP客户端...');
      await this.client.connect(this.transport);

      console.log('✅ MCP连接建立成功');

      this.isInitialized = true;

      // 🔍 验证MCP工具是否真的可用
      console.log('🔍 正在验证MCP工具可用性...');

      // 先列出所有可用工具
      const availableTools = await this.listAvailableTools();

      console.log('🔧 MCP可用工具列表:', availableTools);

      // 初始化浏览器页面并设置全屏
      try {
        await this.client.callTool({
          name: 'browser_navigate',
          arguments: { url: 'about:blank' }
        });
        
        // 检查全屏配置（默认启用，除非明确设置为 'false'）
        const browserFullscreen = process.env.MCP_BROWSER_FULLSCREEN !== 'false';
        console.log(`🖥️ 全屏配置检查: MCP_BROWSER_FULLSCREEN=${process.env.MCP_BROWSER_FULLSCREEN || 'undefined (默认启用)'}, 启用=${browserFullscreen}`);
        
        // 如果启用全屏，尝试通过 browser_resize 工具设置全屏
        if (browserFullscreen && availableTools.includes('browser_resize')) {
          console.log('🖥️ 开始设置浏览器全屏...');
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          console.log('🖥️ 使用 browser_resize 工具设置全屏...');
          try {
            // 方法1：获取屏幕尺寸并设置窗口大小
            const screenSize = await this.client.callTool({
              name: 'browser_evaluate',
              arguments: {
                function: '() => ({ width: screen.width, height: screen.height })'
              }
            });
            
            console.log('🖥️ 屏幕尺寸获取结果:', JSON.stringify(screenSize));
            
            const sizeText = screenSize?.content?.[0]?.text || screenSize?.content?.text;
            if (sizeText) {
              try {
                const size = JSON.parse(sizeText);
                console.log(`🖥️ 设置窗口大小: ${size.width}x${size.height}`);
                await this.client.callTool({
                  name: 'browser_resize',
                  arguments: { width: size.width, height: size.height }
                });
                console.log('✅ 窗口大小设置成功');
                return; // 成功则返回
              } catch (parseError: any) {
                console.warn('⚠️ 解析屏幕尺寸失败:', parseError.message);
              }
            } else {
              console.warn('⚠️ 无法从结果中提取屏幕尺寸');
            }
          } catch (resizeError: any) {
            console.warn('⚠️ browser_resize 失败:', resizeError.message);
          }
          
          // 方法2：如果 resize 失败，尝试直接设置大尺寸（1920x1080）
          try {
            console.log('🖥️ 尝试设置固定大尺寸窗口 (1920x1080)...');
            await this.client.callTool({
              name: 'browser_resize',
              arguments: { width: 1920, height: 1080 }
            });
            console.log('✅ 固定尺寸窗口设置成功');
          } catch (fixedResizeError: any) {
            console.warn('⚠️ 固定尺寸设置失败:', fixedResizeError.message);
            
            // 方法3：如果 resize 都失败，尝试 F11
            try {
              console.log('🖥️ 尝试使用 F11 快捷键...');
              await this.client.callTool({
                name: 'browser_press_key',
                arguments: { key: 'F11' }
              });
              console.log('✅ F11 快捷键已发送');
            } catch (f11Error: any) {
              console.warn('⚠️ F11 快捷键失败:', f11Error.message);
            }
          }
        } else {
          console.log('ℹ️ 全屏未启用，跳过全屏设置');
        }
      } catch (initError: any) {
        console.warn('⚠️ 浏览器初始化失败:', initError.message);
      }

      if (availableTools.length === 0) {
        throw new Error('MCP服务器没有提供任何工具');
      }

      // 🔥 修复：动态检测工具名称格式
      console.log('🔍 可用工具列表:', availableTools);

      // 检查是否使用 browser_ 前缀  
      const hasBrowserPrefix = availableTools.some(function (tool) {
        return tool.startsWith('browser_');
      });

      if (hasBrowserPrefix) {
        console.log('✅ 使用 browser_* 格式的工具名称');
        this.useAlternativeToolNames = true;
      } else {
        console.log('⚠️ 未识别的工具名称格式，使用默认格式');
        this.useAlternativeToolNames = false;
      }

      // 🔥 简化验证：只检查工具列表，不进行实际导航
      try {
        console.log('🔍 正在验证MCP工具可用性...');
        
        // 🔥 只获取工具列表，不进行实际操作
        const toolsResult = await this.client.listTools();
        console.log('🔧 MCP工具列表获取成功:');
        toolsResult.tools.forEach(function (tool, index) {
          console.log(`  ${index + 1}. ${tool.name} - ${tool.description || '无描述'}`);
        });
        
        // 🔥 检查必要的工具是否存在
        const requiredTools = ['browser_navigate', 'browser_click', 'browser_type', 'browser_snapshot'];
        const availableToolNames = toolsResult.tools.map(t => t.name);
        
        const missingTools = requiredTools.filter(tool => 
          !availableToolNames.includes(tool) && 
          !availableToolNames.includes('mcp_playwright_' + tool.replace('browser_', ''))
        );
        
        if (missingTools.length > 0) {
          console.warn(`⚠️ 部分工具不可用: ${missingTools.join(', ')}`);
          console.warn('⚠️ 将使用替代工具名称映射');
          this.useAlternativeToolNames = true;
        } else {
          console.log('✅ 所有必要工具均可用');
        }
        
        console.log('✅ MCP工具验证完成');
        
      } catch (verifyError: any) {
        console.error('❌ MCP工具验证失败:', verifyError.message);
        console.warn('⚠️ 将在实际使用时重试初始化');
        // 🔥 不抛出错误，允许继续初始化
      }

      // 🔥 工具列表已在上面获取并显示，无需重复

      if (options.contextState) await this.setContextState(options.contextState);

      console.log('✅ MCP服务器启动成功！浏览器窗口应该可见');
    } catch (error: any) {
      console.error('❌ MCP服务器启动失败:', error);
      console.error('❌ 错误详情:', error.stack);
      console.error('❌ 错误类型:', error.constructor.name);
      console.error('❌ 完整错误对象:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      this.isInitialized = false;
      throw new Error(`MCP服务器启动失败: ${error.message}`);
    }
  }

  async close() {
    if (this.isInitialized && this.client) {
      try {
        await this.client.close();
      } catch (e) {
        console.warn('⚠️ 关闭MCP客户端时出错:', e);
      }
    }
    if (this.transport) {
      try {
        await this.transport.close();
      } catch (e) {
        console.warn('⚠️ 关闭MCP传输时出错:', e);
      }
    }
    this.client = null;
    this.transport = null;
    this.isInitialized = false;
    this.snapshot = null;
    console.log('🛑 MCP会话已关闭');
  }

  public async callTool(args: { name: string; arguments: any; }): Promise<any> {
    if (!this.isInitialized || !this.client) {
      throw new Error('MCP_DISCONNECTED: Client is not initialized.');
    }

    try {
      console.log(`🔧 MCP工具调用: ${args.name}`, args.arguments);
      
      // 🔥 增加超时保护（90秒）
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('MCP工具调用超时(90秒)')), 90000);
      });
      
      const result = await Promise.race([
        this.client.callTool(args),
        timeoutPromise
      ]);
      
      // 🔥 详细记录MCP返回结果
      console.log(`📋 MCP工具返回结果: ${args.name}`, JSON.stringify(result, null, 2));
      
      // 🔥 检查返回结果中的错误信息
      if (result && result.content) {
        const content = Array.isArray(result.content) ? result.content : [result.content];
        for (const item of content) {
          if (item.type === 'text' && item.text) {
            console.log(`📄 MCP返回内容: ${item.text}`);
            // 检查是否包含错误信息
            if (item.text.includes('Error:') || item.text.includes('Failed:') || item.text.includes('error')) {
              console.error(`❌ MCP命令执行错误: ${item.text}`);
            }
          }
        }
      }
      
      console.log(`✅ MCP工具调用成功: ${args.name}`);
      return result;
    } catch (error: any) {
      console.error(`❌ MCP工具调用失败: ${args.name}`, {
        error: error.message,
        arguments: args.arguments
      });
      throw new Error(`MCP工具调用失败 [${args.name}]: ${error.message}`);
    }
  }

  // 🔥 新增：列出所有可用的MCP工具
  public async listAvailableTools(): Promise<string[]> {
    if (!this.isInitialized || !this.client) {
      throw new Error('MCP_DISCONNECTED: Client is not initialized.');
    }

    try {
      const result = await this.client.listTools();
      console.log('🔧 MCP可用工具列表:', result.tools.map(function (t) {
        return t.name;
      }));
      return result.tools.map(function (t) {
        return t.name;
      });
    } catch (error: any) {
      console.error('❌ 获取MCP工具列表失败:', error.message);
      return [];
    }
  }

  private handleConnectionClose() {
    console.error('❌ MCP连接关闭');
    this.isInitialized = false;
    this.client = null;
    this.transport = null;
    this.snapshot = null;
  }

  async executeStep(step: TestStep, runId: string): Promise<McpExecutionResult> {
    if (!this.isInitialized || !this.client) {
      throw new Error('MCP_DISCONNECTED: Client is not initialized.');
    }

    try {
      // 调试：打印完整的步骤对象
      console.log(`[${runId}] Executing MCP Step:`, JSON.stringify(step, null, 2));
      const result = await this.executeMcpStep(step, runId);
      return { success: true, result };
    } catch (error: any) {
      console.error(`❌ MCP步骤[${step.description}]执行失败 (runId: ${runId}):`, error.message);
      return { success: false, error: error.message };
    }
  }

  // 🔥 统一使用MCPToolMapper进行工具名映射
  private getToolName(baseName: string): string {
    try {
      // 直接导入并使用MCPToolMapper
      const { MCPToolMapper } = require('../utils/mcpToolMapper.js');
      return MCPToolMapper.getToolName(baseName);
    } catch (error) {
      console.warn('⚠️ 无法加载MCPToolMapper，使用降级映射:', error);
      // 降级映射，确保fill/input/type都映射到browser_type
      const fallbackMap: Record<string, string> = {
        'navigate': 'browser_navigate',
        'click': 'browser_click',
        'fill': 'browser_type',
        'input': 'browser_type',
        'type': 'browser_type',
        'wait': 'browser_wait_for',
        'screenshot': 'browser_take_screenshot',
        'expect': 'browser_snapshot'
      };
      return fallbackMap[baseName] || `browser_${baseName}`;
    }
  }

  // 🚀 修复getComputedStyle错误：公有方法，包含错误处理和重试机制
  async executeMcpStep(step: TestStep, runId: string): Promise<any> {
    const maxRetries = 2;
    let lastError: any;
    
    for (let retry = 1; retry <= maxRetries; retry++) {
      try {
        console.log(`🔧 [${runId}] 执行MCP步骤 (${retry}/${maxRetries}): ${step.action}`);
        
        const result = await this.executeMcpStepInternal(step, runId);
        
        if (retry > 1) {
          console.log(`✅ [${runId}] MCP步骤重试成功: ${step.action}`);
        }
        
        return result;
        
      } catch (error: any) {
        console.warn(`⚠️ [${runId}] MCP步骤执行失败 (${retry}/${maxRetries}): ${step.action}`, error.message);
        lastError = error;
        
        // 🚀 专门处理getComputedStyle和DOM相关错误
        const isComputedStyleError = error.message?.includes('getComputedStyle') ||
                                   error.message?.includes('Element') ||
                                   error.message?.includes('not of type') ||
                                   error.message?.includes('parameter 1');
        
        if (isComputedStyleError && retry < maxRetries) {
          console.log(`🔄 [${runId}] 检测到DOM时序错误，等待后重试...`);
          
          // 等待DOM稳定后重试
          await new Promise(resolve => setTimeout(resolve, 2000));
          await this.waitForDOMStable(1);
          continue;
        }
        
        // 其他类型的错误或已达到最大重试次数
        if (retry >= maxRetries) {
          console.error(`❌ [${runId}] MCP步骤最终失败: ${step.action}`);
          throw lastError;
        }
        
        // 普通错误也给一次重试机会
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    throw lastError;
  }

  // 🚀 原始执行方法，改为私有
  private async executeMcpStepInternal(step: TestStep, runId: string): Promise<any> {
    if (!this.client) throw new Error('MCP_DISCONNECTED: Client is null.');

    console.log(`🎬 [${runId}] === 开始执行步骤 ===`);
    console.log(`📝 步骤描述: ${step.description}`);
    console.log(`🎯 操作类型: ${step.action}`);
    console.log(`🔍 目标元素: ${step.selector || '无'}`);
    console.log(`📄 输入值: ${step.value || '无'}`);
    console.log(`🌐 目标URL: ${step.url || '无'}`);

    // 🔍 每个步骤前验证当前页面状态
    await this.verifyCurrentPageState(runId);

    // 🔥 修复：直接使用正确的工具名称
    const getToolName = (baseName: string): string => {
      // 直接使用browser_*格式，移除错误的前缀映射
      if (baseName.startsWith('mcp_playwright_browser_')) {
        return baseName.replace('mcp_playwright_browser_', 'browser_');
      }
      return baseName; // 直接返回，确保名称正确
    };

    switch (step.action) {
      case 'navigate':
        console.log(`🚀 [${runId}] 正在导航到: ${step.url}`);
        // 🔥 修复：确保URL参数正确传递并添加调试
        console.log(`🌐 [${runId}] 执行导航命令到: ${step.url}`);
        const navigateResult = await this.client.callTool({
          name: this.getToolName('navigate'),
          arguments: { url: step.url! }
        });
        console.log(`🌐 [${runId}] 导航命令完成，结果:`, JSON.stringify(navigateResult, null, 2));
        console.log(`✅ [${runId}] 页面导航完成:`, navigateResult);

        // 🔍 导航后立即验证页面状态
        await this.verifyCurrentPageState(runId);

        // 导航后等待一下确保页面加载
        console.log(`⏳ [${runId}] 等待页面完全加载...`);
        try {
          await this.client.callTool({
            name: this.getToolName('wait'),
            arguments: { state: 'networkidle' }
          });
          console.log(`✅ [${runId}] 页面完全加载完成`);

          // 🔍 等待后再次验证
          await this.verifyCurrentPageState(runId);

        } catch (waitError) {
          console.warn(`⚠️ [${runId}] 页面等待失败，继续执行: ${waitError}`);
        }

        // 🔍 强制截图验证实际显示状态
        await this.takeScreenshot(`navigate-${Date.now()}.png`);

        await this.refreshSnapshot();
        console.log(`📊 [${runId}] 页面快照已更新`);
        break;

      case 'click':
      case 'fill':
        console.log(`🔍 [${runId}] 正在查找元素: ${step.selector}`);

        // 操作前确保页面完全加载
        await this.waitForLoad();

        const element = await this.findBestElement(step.selector!, runId);
        console.log(`✅ [${runId}] 找到目标元素: ${element.text} (ref: ${element.ref})`);

        // 确保元素可见并可交互
        try {
          console.log(`🔍 [${runId}] 验证元素可见性...`);
          await this.client.callTool({
            name: this.getToolName('wait'),
            arguments: { ref: element.ref, state: 'visible', timeout: 5000 }
          });
          console.log(`✅ [${runId}] 元素可见性验证通过`);
        } catch (visibilityError) {
          console.warn(`⚠️ [${runId}] 元素不可见，尝试直接操作...`);
        }

        const toolName = this.getToolName(step.action === 'click' ? 'click' : 'fill');
        const args = step.action === 'click'
          ? { ref: element.ref }
          : { ref: element.ref, text: step.value! };

        console.log(`🎯 [${runId}] 正在执行${step.action === 'click' ? '点击' : '输入'}操作...`);
        console.log(`📋 [${runId}] MCP参数:`, JSON.stringify(args, null, 2));

        try {
          await this.client.callTool({ name: toolName, arguments: args });
          console.log(`✅ [${runId}] ${step.action === 'click' ? '点击' : '输入'}操作完成`);
        } catch (operationError) {
          console.error(`❌ [${runId}] 操作执行失败:`, operationError);
          // 重试一次
          console.log(`🔄 [${runId}] 正在重试操作...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          await this.client.callTool({ name: toolName, arguments: args });
          console.log(`✅ [${runId}] 重试操作成功`);
        }

        await this.refreshSnapshot();
        console.log(`📊 [${runId}] 操作后页面快照已更新`);
        break;

      case 'browser_type':
        console.log(`⌨️ [${runId}] 正在执行browser_type操作...`);
        console.log(`📋 [${runId}] 目标ref: ${step.ref}, 输入文本: ${step.text}`);

        // 🚀 修复：操作前确保页面完全稳定
        await this.waitForLoad();
        
        // 🚀 新增：操作前额外检查元素是否仍然存在
        await this.waitForElementReady(step.ref, runId);

        // 直接使用AI提供的ref，无需查找元素
        const typeArgs = { ref: step.ref, text: step.text };
        console.log(`🎯 [${runId}] MCP browser_type参数:`, JSON.stringify(typeArgs, null, 2));

        try {
          await this.client.callTool({ 
            name: 'browser_type', 
            arguments: typeArgs 
          });
          console.log(`✅ [${runId}] browser_type操作完成`);
          
          // 🚀 修复：输入后等待页面响应完成
          await new Promise(resolve => setTimeout(resolve, 300));
          
        } catch (typeError) {
          console.error(`❌ [${runId}] browser_type操作失败:`, typeError);
          throw typeError;
        }

        await this.refreshSnapshot();
        console.log(`📊 [${runId}] browser_type操作后页面快照已更新`);
        break;

      case 'browser_click':
        console.log(`🖱️ [${runId}] 正在执行browser_click操作...`);
        console.log(`📋 [${runId}] 目标ref: ${step.ref}`);

        // 🚀 修复：操作前确保页面完全稳定
        await this.waitForLoad();
        
        // 🚀 新增：操作前额外检查元素是否仍然存在
        await this.waitForElementReady(step.ref, runId);

        // 直接使用AI提供的ref，无需查找元素
        const clickArgs = { ref: step.ref };
        console.log(`🎯 [${runId}] MCP browser_click参数:`, JSON.stringify(clickArgs, null, 2));

        try {
          await this.client.callTool({ 
            name: 'browser_click', 
            arguments: clickArgs 
          });
          console.log(`✅ [${runId}] browser_click操作完成`);
          
          // 🚀 修复：点击后等待页面响应完成
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (clickError) {
          console.error(`❌ [${runId}] browser_click操作失败:`, clickError);
          throw clickError;
        }

        await this.refreshSnapshot();
        console.log(`📊 [${runId}] browser_click操作后页面快照已更新`);
        break;

      case 'wait':
        const waitTimeout = step.timeout || 3000;
        console.log(`⏱️ [${runId}] 开始等待 ${waitTimeout}ms...`);

        // 使用MCP的等待功能确保页面完全加载
        try {
          console.log(`⏳ [${runId}] 等待页面网络空闲...`);
          await this.client.callTool({
            name: this.getToolName('wait'),
            arguments: { state: 'networkidle' }
          });
          console.log(`✅ [${runId}] 页面网络空闲完成`);
        } catch (networkError) {
          console.warn(`⚠️ [${runId}] 网络等待失败，使用固定等待时间: ${networkError}`);
          await new Promise(function (res) {
            setTimeout(res, waitTimeout);
          });
        }

        // 等待后刷新快照确保元素可见
        await this.refreshSnapshot();
        console.log(`✅ [${runId}] 等待完成，页面快照已更新`);
        break;

      case 'scroll':
        console.log(`📜 [${runId}] 正在滚动页面...`);
        // 🔥 修复：使用JavaScript执行滚动，更可靠
        await this.client.callTool({
          name: this.getToolName('evaluate'),
          arguments: {
            script: 'window.scrollTo(0, document.body.scrollHeight);'
          }
        });
        console.log(`✅ [${runId}] 页面滚动完成`);
        await this.refreshSnapshot();
        console.log(`📊 [${runId}] 滚动后页面快照已更新`);
        break;

      case 'screenshot':
        console.log(`📸 [${runId}] 正在截图...`);
        const filename = `screenshot-${Date.now()}.png`;
        await this.takeScreenshot(filename);
        console.log(`✅ [${runId}] 截图完成: ${filename}`);
        break;

      default:
        throw new Error(`❌ [${runId}] 未知的MCP动作: ${step.action}`);
    }

    console.log(`🏁 [${runId}] === 步骤执行完成 ===\n`);
  }

  private async findBestElement(selector: string, runId: string): Promise<any> {
    if (!this.snapshot) {
      await this.refreshSnapshot();
    }
    if (!this.snapshot) {
      throw new Error(`无法获取页面快照 (runId: ${runId})`);
    }

    try {
      // 🔥 新增：解析快照获取页面信息和结构指纹
      const snapshotData = this.parseSnapshotForAI();
      const pageUrl = snapshotData.pageInfo.url || 'unknown';
      
      // 🔥 新增：生成缓存Key
      const snapshotFingerprint = elementCache.generateSnapshotFingerprint(this.snapshot);
      const cacheKey = elementCache.generateCacheKey(pageUrl, selector, snapshotFingerprint);

      // 🔥 新增：尝试从缓存获取
      const cachedElement = elementCache.get(cacheKey);
      if (cachedElement) {
        console.log(`⚡ [${runId}] 使用缓存元素，跳过AI调用`);
        console.log(`   🎯 缓存元素: "${cachedElement.text}"`);
        console.log(`   🔗 元素引用: ${cachedElement.ref}`);
        return {
          ref: cachedElement.ref,
          text: cachedElement.text,
          confidence: cachedElement.confidence,
          fromCache: true
        };
      }

      // 缓存未命中，进行AI解析
      console.log(`🤖 [${runId}] ===== AI元素解析开始 =====`);
      console.log(`🔍 [${runId}] 目标描述: "${selector}"`);

      console.log(`📊 [${runId}] AI分析基础数据:`);
      console.log(`   📋 页面信息: ${snapshotData.pageInfo.title} (${pageUrl})`);
      console.log(`   📊 发现 ${snapshotData.elements.length} 个可交互元素`);

      // 打印所有发现的元素供调试
      console.log(`🔍 [${runId}] 全部可交互元素列表:`);
      snapshotData.elements.forEach((element, index) => {
        console.log(`   ${index + 1}. [${element.ref}] ${element.role || 'unknown'}: "${element.texts.join('", "')}"`);
      });

      // 使用AI服务来解析最佳匹配元素
      const matchedElement = await this.aiMatchElement(selector, snapshotData, runId);

      if (matchedElement) {
        console.log(`✅ [${runId}] AI匹配成功`);
        console.log(`   🎯 匹配元素: "${matchedElement.text}"`);
        console.log(`   🔗 元素引用: ${matchedElement.ref}`);
        console.log(`   📊 置信度: ${matchedElement.confidence || 'N/A'}%`);
        console.log(`🤖 [${runId}] ===== AI元素解析完成 =====`);
        
        // 🔥 新增：将结果存入缓存
        elementCache.set(cacheKey, {
          ref: matchedElement.ref,
          text: matchedElement.text,
          confidence: matchedElement.confidence || 100
        });
        
        return matchedElement;
      }

      console.log(`❌ [${runId}] AI无法找到匹配元素: ${selector}`);
      console.log(`🤖 [${runId}] ===== AI元素解析失败 =====`);
      throw new Error(`AI无法找到匹配元素: ${selector} (runId: ${runId})`);

    } catch (parseError: any) {
      console.error(`❌ [${runId}] AI解析时出错:`, parseError.message);
      console.error(`❌ [${runId}] 错误堆栈:`, parseError.stack);
      throw new Error(`AI元素定位失败: ${parseError.message} (runId: ${runId})`);
    }
  }

  private parseSnapshotForAI(): any {
    const elements: any[] = [];
    const lines = this.snapshot.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();

      // 提取ref和完整描述
      const refMatch = trimmedLine.match(/\[ref=([a-zA-Z0-9_-]+)\]/);
      if (refMatch) {
        const ref = refMatch[1];

        // 提取所有文本信息
        const textMatches = trimmedLine.match(/"([^"]*)"/g) || [];
        const texts = textMatches.map(t => t.replace(/"/g, ''));

        // 确定角色和类型
        let role = '';
        let type = '';

        if (trimmedLine.includes('textbox')) role = 'textbox';
        else if (trimmedLine.includes('button')) role = 'button';
        else if (trimmedLine.includes('checkbox')) role = 'checkbox';
        else if (trimmedLine.includes('link')) role = 'link';
        else if (trimmedLine.includes('input')) role = 'input';

        if (trimmedLine.includes('password')) type = 'password';
        else if (trimmedLine.includes('submit')) type = 'submit';

        elements.push({
          ref,
          texts,
          role,
          type,
          fullLine: trimmedLine
        });
      }
    }

    return {
      elements,
      pageInfo: this.extractPageInfo()
    };
  }

  private extractPageInfo(): any {
    // 提取页面基本信息用于AI理解上下文
    const urlMatch = this.snapshot.match(/Page URL: ([^\n]+)/);
    const titleMatch = this.snapshot.match(/Page Title: ([^\n]+)/);

    return {
      url: urlMatch ? urlMatch[1].trim() : '',
      title: titleMatch ? titleMatch[1].trim() : '',
      elementCount: (this.snapshot.match(/\[ref=/g) || []).length
    };
  }

  private async aiMatchElement(selector: string, snapshotData: any, runId: string): Promise<any> {
    // 这里应该调用AI服务，但为了保持MCP架构，我们使用简单的启发式算法
    // 实际项目中可以接入真正的AI服务

    const { elements, pageInfo } = snapshotData;
    const selectorDesc = selector.toLowerCase();

    console.log(`🤖 [${runId}] AI分析开始:`);
    console.log(`   📝 自然语言描述: "${selector}"`);
    console.log(`   🌐 页面标题: ${pageInfo.title}`);
    console.log(`   📊 待匹配元素数: ${elements.length}`);

    // 智能启发式匹配，模拟AI理解
    let bestMatch = null;
    let bestConfidence = 0;

    console.log(`🤖 [${runId}] AI匹配过程:`);

    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      let confidence = 0;
      const elementText = element.texts.join(' ').toLowerCase();
      const elementDesc = `[${element.ref}] ${element.role} ${element.type}: "${element.texts.join('", "')}"`;

      console.log(`   🔍 分析元素 ${i + 1}/${elements.length}: ${elementDesc}`);

      // 基于自然语言理解的匹配逻辑
      let reasons = [];

      if (selectorDesc.includes('账号') || selectorDesc.includes('用户名') || selectorDesc.includes('user')) {
        if (elementText.includes('账号')) {
          confidence += 100;
          reasons.push('包含"账号"关键词');
        }
        if (elementText.includes('用户名')) {
          confidence += 90;
          reasons.push('包含"用户名"关键词');
        }
        if (elementText.includes('user')) {
          confidence += 80;
          reasons.push('包含"user"关键词');
        }
        if (element.role === 'textbox' && !elementText.includes('密码')) {
          confidence += 40;
          reasons.push('是文本输入框且不含密码提示');
        }
      }

      if (selectorDesc.includes('密码') || selectorDesc.includes('password') || selectorDesc.includes('pass')) {
        if (elementText.includes('密码')) {
          confidence += 100;
          reasons.push('包含"密码"关键词');
        }
        if (elementText.includes('password')) {
          confidence += 90;
          reasons.push('包含"password"关键词');
        }
        if (element.type === 'password') {
          confidence += 60;
          reasons.push('类型为password');
        }
        if (element.role === 'textbox' && elementText.includes('密码')) {
          confidence += 50;
          reasons.push('是文本输入框且含密码提示');
        }
      }

      if (selectorDesc.includes('登录') || selectorDesc.includes('登入') || selectorDesc.includes('submit') || selectorDesc.includes('button')) {
        if (elementText.includes('登录')) {
          confidence += 100;
          reasons.push('包含"登录"关键词');
        }
        if (elementText.includes('登入')) {
          confidence += 100;
          reasons.push('包含"登入"关键词');
        }
        if (elementText.includes('login')) {
          confidence += 80;
          reasons.push('包含"login"关键词');
        }
        if (element.role === 'button') {
          confidence += 50;
          reasons.push('是按钮类型');
        }
      }

      // 选择器文本匹配
      const selectorKeywords = selectorDesc.split(/\s+/).filter(k => k.length > 1);
      for (const keyword of selectorKeywords) {
        if (elementText.includes(keyword)) {
          confidence += 25;
          reasons.push(`匹配关键词"${keyword}"`);
        }
      }

      console.log(`      📊 置信度: ${confidence}% (${reasons.join(', ')})`);

      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestMatch = {
          ref: element.ref,
          text: element.texts[0] || '',
          confidence,
          reasons: reasons.join(', ')
        };
      }
    }

    if (bestMatch && bestConfidence >= 50) {
      console.log(`✅ [${runId}] AI匹配成功:`);
      console.log(`   🎯 最佳匹配: "${bestMatch.text}" [${bestMatch.ref}]`);
      console.log(`   📊 最终置信度: ${bestConfidence}%`);
      console.log(`   🔍 匹配原因: ${bestMatch.reasons}`);
      return bestMatch;
    }

    if (bestMatch && bestConfidence > 20) {
      console.log(`⚠️ [${runId}] AI找到低置信度匹配:`);
      console.log(`   🎯 匹配元素: "${bestMatch.text}" [${bestMatch.ref}]`);
      console.log(`   📊 置信度: ${bestConfidence}% (低于推荐阈值)`);
    }

    // 如果启发式匹配失败，使用智能回退策略
    console.log(`🤖 [${runId}] 使用智能回退策略...`);

    const fallback = elements.find(e =>
      (selectorDesc.includes('账号') && e.role === 'textbox' && e.texts.some(t => t.includes('账号'))) ||
      (selectorDesc.includes('密码') && e.role === 'textbox' && e.texts.some(t => t.includes('密码'))) ||
      (selectorDesc.includes('登录') && e.role === 'button' && e.texts.some(t => t.includes('登录')))
    );

    if (fallback) {
      console.log(`⚠️ [${runId}] AI使用智能回退:`);
      console.log(`   🎯 回退匹配: "${fallback.texts[0]}" [${fallback.ref}]`);
      return { ref: fallback.ref, text: fallback.texts[0] || '' };
    }

    if (elements.length > 0) {
      const lastResort = elements[0];
      console.log(`⚠️ [${runId}] AI使用最后手段:`);
      console.log(`   🎯 选择第一个元素: "${lastResort.texts[0]}" [${lastResort.ref}]`);
      return { ref: lastResort.ref, text: lastResort.texts[0] || '' };
    }

    console.log(`❌ [${runId}] AI无法找到任何匹配元素`);
    return null;
  }

  // 🚀 修复getComputedStyle错误：增加快照刷新重试机制
  private async refreshSnapshot(): Promise<void> {
    const maxRetries = 3;
    let lastError: any;
    
    for (let retry = 1; retry <= maxRetries; retry++) {
      try {
        console.log(`📊 刷新页面快照 (${retry}/${maxRetries})...`);
        
        // 在获取快照前先等待DOM稳定
        if (retry > 1) {
          console.log('⏳ 重试前等待DOM稳定...');
          await this.waitForDOMStable(1); // 快速稳定性检查
        }
        
        this.snapshot = await this.getSnapshot();
        console.log('✅ 页面快照刷新成功');
        return;
        
      } catch (error: any) {
        console.warn(`⚠️ 快照刷新失败 (${retry}/${maxRetries}):`, error.message);
        lastError = error;
        
        // 如果是getComputedStyle相关错误，等待后重试
        if (error.message?.includes('getComputedStyle') || 
            error.message?.includes('Element') ||
            retry < maxRetries) {
          
          const delay = retry * 1000; // 递增延迟
          console.log(`🔄 ${delay}ms 后重试快照获取...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        throw error;
      }
    }
    
    // 所有重试都失败了
    console.error(`❌ 快照刷新最终失败，已重试 ${maxRetries} 次`);
    throw new Error(`快照刷新失败: ${lastError?.message}`);
  }

  async getSnapshot(): Promise<any> {
    if (!this.isInitialized || !this.client) {
      throw new Error('MCP_DISCONNECTED: Client is not connected.');
    }
    try {
      console.log(`📊 正在获取MCP页面快照...`);

      // 🔥 增强调试：记录原始返回
      const snapshotResult: any = await this.client.callTool({ name: this.getToolName('snapshot'), arguments: { random_string: 'test' } });

      console.log(`📊 MCP原始快照返回:`, JSON.stringify(snapshotResult, null, 2));

      const yaml = snapshotResult?.snapshot?.body      // old <=0.2.x
        ?? snapshotResult?.snapshot             // old (partial)
        ?? snapshotResult?.content?.[0]?.text   // new >=0.3.x
        ?? snapshotResult?.content?.text;       // 🔥 额外兼容格式

      if (!yaml) {
        console.error('❌ mcp_playwright_browser_snapshot 没返回可用数据, 实际返回:', snapshotResult);

        // 🔥 尝试截图作为备用方案
        try {
          await this.client.callTool({ name: this.getToolName('screenshot'), arguments: { filename: 'debug-snapshot.png' } });
          console.log('📸 已保存调试截图: debug-snapshot.png');
        } catch (screenshotError) {
          console.warn('⚠️ 截图也失败了:', screenshotError);
        }

        throw new Error('mcp_playwright_browser_snapshot 没返回可用数据');
      }

      // 🔥 增强调试：显示快照内容预览
      const lines = yaml.split('\n');
      console.log(`📊 MCP页面快照已获取 (${lines.length} 行)`);

      // 显示前20行用于调试
      const previewLines = lines.slice(0, 20);
      console.log(`📊 快照预览:\n${previewLines.join('\n')}`);

      // 🔥 统计元素类型
      const elementTypes = ['textbox', 'button', 'link', 'input', 'checkbox', 'radio', 'combobox'];
      const foundTypes: string[] = [];
      elementTypes.forEach(type => {
        const count = (yaml.match(new RegExp(type, 'g')) || []).length;
        if (count > 0) foundTypes.push(`${type}(${count})`);
      });

      if (foundTypes.length > 0) {
        console.log(`📊 发现元素类型: ${foundTypes.join(', ')}`);
      } else {
        console.log(`⚠️ 未在快照中发现常见交互元素`);
      }

      this.snapshot = yaml; // Store the YAML string
      return yaml;

    } catch (error: any) {
      console.error('📛 mcp_playwright_browser_snapshot 调用异常 >>>', error);
      this.snapshot = null;
      throw new Error(`获取MCP快照失败: ${error?.message || error}`);
    }
  }

  async takeScreenshot(filename: string): Promise<void> {
    if (!this.isInitialized || !this.client) return;
    try {
      // 🔥 修复：只传递文件名，让MCP保存到默认位置
      console.log(`📸 [MCP] 调用截图工具:`, { filename: filename });
      
      const result = await this.client.callTool({ name: this.getToolName('screenshot'), arguments: { filename: filename } });
      console.log(`📋 [MCP] 截图工具返回:`, result);
      
      // 🔥 处理文件移动到正确目录（如果需要）
      await this.handleScreenshotPostProcess(filename);
      
    } catch (error) {
      console.error(`❌ 截图失败:`, error);
    }
  }

  // 🔥 修复方案：使用简单文件名+后处理移动
  async takeScreenshotForStream(options: { runId?: string; filename?: string } = {}): Promise<{ buffer: Buffer; source: 'mcp-direct' | 'filesystem'; durationMs: number }> {
    if (!this.isInitialized || !this.client) {
      console.error('❌ [MCP] 截图失败：客户端未初始化');
      throw new Error('MCP客户端未初始化');
    }

    const startedAt = Date.now();
    const runTag = options.runId?.slice(0, 12) ?? 'stream';
    const filename = options.filename ?? `stream-${runTag}-${Date.now()}.png`;
    const screenshotDir = screenshotConfig.getScreenshotsDirectory();

    console.log(`📸 [MCP] 开始截图流程: ${filename}, runId: ${runTag}`);

    try {
      if (!fs.existsSync(screenshotDir)) {
        console.log(`📁 [MCP] 创建截图目录: ${screenshotDir}`);
        fs.mkdirSync(screenshotDir, { recursive: true });
      }
    } catch (dirError) {
      console.warn('⚠️ [MCP] 创建截图目录失败:', this.normaliseError(dirError).message);
    }

    const fallbackPath = path.join(screenshotDir, filename);

    console.log(`🔧 [MCP] 调用截图工具:`, {
      toolName: this.getToolName('screenshot'),
      filename,
      fallbackPath
    });

    let result;
    try {
      result = await this.client.callTool({
        name: this.getToolName('screenshot'),
        arguments: { filename }
      });
      console.log(`✅ [MCP] 截图工具调用完成，耗时: ${Date.now() - startedAt}ms`);
    } catch (callError: any) {
      const errorMsg = this.normaliseError(callError).message;
      console.error(`❌ [MCP] 截图工具调用失败: ${errorMsg}`);
      throw callError;
    }

    console.log(`📋 [MCP] 截图工具返回结果:`, JSON.stringify(result).substring(0, 200));

    const directBuffer = this.extractImageBuffer(result);
    if (directBuffer) {
      const duration = Date.now() - startedAt;
      console.log(`✅ [MCP] 直接返回Buffer成功: ${directBuffer.length} bytes, ${duration}ms, source: mcp-direct`);
      
      // 🔥 优化：实时流截图不保存到磁盘，立即清理可能存在的临时文件
      if (filename.startsWith('stream-')) {
        const tempPath = path.join(screenshotDir, filename);
        fs.promises.unlink(tempPath).catch(() => undefined); // 静默删除，文件可能不存在
      }
      
      return { buffer: directBuffer, source: 'mcp-direct', durationMs: duration };
    }

    const toolError = this.extractScreenshotError(result);
    if (toolError) {
      console.error(`❌ [MCP] 截图工具返回错误: ${toolError}`);
      throw new Error(toolError);
    }

    console.log(`📂 [MCP] 未获取到直接Buffer，尝试文件系统回退方案`);

    const resolvedPath = (await this.handleScreenshotPostProcess(filename, fallbackPath)) ?? this.locateScreenshotFile(filename, fallbackPath);
    if (!resolvedPath) {
      console.error(`❌ [MCP] 未找到截图文件: ${filename}, fallbackPath: ${fallbackPath}`);
      throw new Error(`未找到截图文件: ${filename}`);
    }

    console.log(`📄 [MCP] 找到截图文件: ${resolvedPath}`);

    try {
      const buffer = await this.readScreenshotWithRetries(resolvedPath);
      console.log(`✅ [MCP] 成功读取文件Buffer: ${buffer.length} bytes`);

      // 🔥 优化：实时流截图立即删除，不占用磁盘空间
      // 无论是 stream- 开头的文件还是其他临时文件，都立即删除
      if (filename.startsWith('stream-') || options.runId) {
        console.log(`🗑️ [MCP] 立即删除实时流临时截图文件: ${resolvedPath}`);
        // 异步删除，不阻塞返回
        fs.promises.unlink(resolvedPath).catch((deleteError) => {
          console.warn(`⚠️ [MCP] 删除临时文件失败（可忽略）: ${resolvedPath}`, this.normaliseError(deleteError).message);
        });
      }
      
      const duration = Date.now() - startedAt;
      console.log(`✅ [MCP] 文件系统回退成功: ${buffer.length} bytes, ${duration}ms, source: filesystem, path: ${resolvedPath}`);
      return { buffer, source: 'filesystem', durationMs: duration };
    } catch (fsError) {
      const details = this.normaliseError(fsError);
      console.error(`❌ [MCP] 读取回退截图失败: ${details.message}, path: ${resolvedPath}`);
      throw new Error(`读取回退截图失败: ${details.message}`);
    }
  }

  private async readScreenshotWithRetries(filePath: string, attempts = 4, delayMs = 30): Promise<Buffer> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await fs.promises.readFile(filePath);
      } catch (error) {
        lastError = error;
        if (attempt === attempts) {
          break;
        }
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
      }
    }

    if (lastError instanceof Error) {
      throw lastError;
    }

    throw new Error(String(lastError ?? 'Unknown error'));
  }

  private extractScreenshotError(result: unknown): string | null {
    if (!result || typeof result !== 'object') {
      return null;
    }

    const payload = result as { isError?: boolean; error?: unknown; errors?: unknown; message?: unknown; content?: unknown };

    if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
      return `MCP_SCREENSHOT_ERROR: ${payload.error.trim()}`;
    }

    if (Array.isArray(payload.errors)) {
      const combined = payload.errors
        .map(entry => typeof entry === 'string' ? entry.trim() : '')
        .filter(Boolean)
        .join('; ');
      if (combined.length > 0) {
        return `MCP_SCREENSHOT_ERROR: ${combined}`;
      }
    }

    if (typeof payload.message === 'string' && payload.message.trim().length > 0 && payload.isError) {
      return `MCP_SCREENSHOT_ERROR: ${payload.message.trim()}`;
    }

    const contentText = this.extractTextContent(payload.content);
    if (contentText) {
      const lower = contentText.toLowerCase();
      if (payload.isError || lower.startsWith('error')) {
        return `MCP_SCREENSHOT_ERROR: ${contentText}`;
      }
    }

    return null;
  }

  private extractTextContent(content: unknown): string | null {
    if (!content) {
      return null;
    }

    const entries = Array.isArray(content) ? content : [content];
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }

      const candidate = entry as { text?: unknown; message?: unknown; content?: unknown };
      if (typeof candidate.text === 'string' && candidate.text.trim().length > 0) {
        return candidate.text.trim();
      }
      if (typeof candidate.message === 'string' && candidate.message.trim().length > 0) {
        return candidate.message.trim();
      }
      if (typeof candidate.content === 'string' && candidate.content.trim().length > 0) {
        return candidate.content.trim();
      }
    }

    return null;
  }

  private extractImageBuffer(result: unknown): Buffer | null {
    if (!result || typeof result !== 'object') {
      return null;
    }

    const content = (result as { content?: unknown }).content;
    if (Array.isArray(content)) {
      for (const entry of content) {
        const decoded = this.decodeImagePayload(entry);
        if (decoded) {
          return decoded;
        }
      }
    }

    const topLevelData = (result as { data?: unknown }).data;
    if (typeof topLevelData === 'string') {
      try {
        return Buffer.from(topLevelData, 'base64');
      } catch {
        return null;
      }
    }

    return null;
  }

  private decodeImagePayload(payload: unknown): Buffer | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const item = payload as {
      type?: unknown;
      data?: unknown;
      base64Data?: unknown;
      body?: unknown;
      mimeType?: unknown;
      mime_type?: unknown;
    };

    const base64Candidate =
      (typeof item.data === 'string' && item.data) ||
      (typeof item.base64Data === 'string' && item.base64Data) ||
      (typeof item.body === 'string' && item.body) ||
      undefined;

    if (!base64Candidate) {
      return null;
    }

    const mime = item.mimeType ?? item.mime_type;
    const declaredType = item.type;

    if (declaredType === 'image' || (typeof mime === 'string' && mime.startsWith('image/'))) {
      try {
        return Buffer.from(base64Candidate, 'base64');
      } catch {
        return null;
      }
    }

    return null;
  }

  private normaliseError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }
    if (typeof error === 'string') {
      return new Error(error);
    }
    try {
      return new Error(JSON.stringify(error));
    } catch {
      return new Error('Unknown error');
    }
  }



  async waitForLoad(isFirstStep: boolean = false): Promise<void> {
    if (!this.isInitialized || !this.client) return;
    try {
      // 🔥 优化：第一步导航使用快速模式，避免长时间等待
      if (isFirstStep) {
        console.log('⚡ 第一步导航：使用快速等待模式...');
        // 只等待基本的页面就绪，不等待网络空闲
        try {
          await Promise.race([
            this.client.callTool({
              name: this.useAlternativeToolNames ? 'browser_wait' : 'mcp_playwright_browser_wait',
              arguments: { state: 'domcontentloaded' }
            }),
            new Promise<void>((resolve) => setTimeout(resolve, 2000)) // 最多等待2秒
          ]);
        } catch (error) {
          console.log('⚡ 第一步快速等待超时，直接继续');
        }
        console.log('✅ 第一步快速等待完成');
        return;
      }

      // 🚀 非第一步：使用完整的页面稳定性等待
      console.log('⏳ 开始等待页面完全稳定...');
      
      // 1. 等待网络空闲
      await this.client.callTool({
        name: this.useAlternativeToolNames ? 'browser_wait' : 'mcp_playwright_browser_wait',
        arguments: { state: 'networkidle' }
      });
      
      // 2. 等待DOM稳定（防止动态修改导致getComputedStyle错误）
      await this.waitForDOMStable();
      
      console.log('✅ 页面已完全稳定');
    } catch (error) {
      console.warn('⚠️ 等待页面加载失败，继续执行:', error);
    }
  }

  // 🚀 新增：等待DOM稳定，防止getComputedStyle错误
  private async waitForDOMStable(maxAttempts: number = 3): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`🔍 DOM稳定性检查 (${attempt}/${maxAttempts})...`);
        
        // 等待一小段时间让动态内容完成加载
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 检查页面是否还在加载
        const isStable = await this.client.callTool({
          name: 'browser_evaluate',
          arguments: {
            function: `() => {
              // 检查页面是否有正在进行的动画或异步加载
              return document.readyState === 'complete' && 
                     !document.querySelector('[loading], .loading, .spinner') &&
                     !window.requestAnimationFrame.toString().includes('native');
            }`
          }
        });
        
        if (isStable?.content?.[0]?.text === 'true') {
          console.log('✅ DOM已稳定');
          return;
        }
        
        console.log(`⚠️ DOM尚未稳定，等待重试...`);
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.warn(`⚠️ DOM稳定性检查失败 (${attempt}/${maxAttempts}):`, error);
        if (attempt === maxAttempts) {
          console.log('⚠️ DOM稳定性检查超时，继续执行');
        }
      }
    }
  }

  // 🚀 修复Bug：实现缺失的页面完全加载等待方法
  async waitForPageFullyLoaded(): Promise<void> {
    if (!this.isInitialized || !this.client) return;
    
    try {
      console.log('⏳ 等待页面完全加载...');
      
      // 1. 等待页面基本加载完成
      await this.client.callTool({
        name: this.useAlternativeToolNames ? 'browser_wait' : 'mcp_playwright_browser_wait',
        arguments: { state: 'domcontentloaded' }
      });
      
      // 2. 等待网络请求完成
      await this.client.callTool({
        name: this.useAlternativeToolNames ? 'browser_wait' : 'mcp_playwright_browser_wait',
        arguments: { state: 'networkidle' }
      });
      
      // 3. 额外等待，确保动态内容加载完成
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.log('✅ 页面完全加载完成');
    } catch (error) {
      console.warn('⚠️ 页面完全加载等待失败:', error);
      // 降级：简单等待
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // 🚀 修复Bug：实现缺失的页面稳定性检查方法
  async waitForPageStability(): Promise<void> {
    if (!this.isInitialized || !this.client) return;
    
    try {
      console.log('⏳ 检查页面稳定性...');
      
      // 检查页面URL是否稳定（防止重定向中断）
      let previousUrl = await this.getCurrentUrl();
      await new Promise(resolve => setTimeout(resolve, 500));
      let currentUrl = await this.getCurrentUrl();
      
      // 如果URL还在变化，继续等待
      if (previousUrl !== currentUrl) {
        console.log(`🔄 页面正在跳转: ${previousUrl} → ${currentUrl}`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 再次检查
        currentUrl = await this.getCurrentUrl();
        console.log(`✅ 页面跳转完成: ${currentUrl}`);
      }
      
      // 等待DOM稳定
      await this.waitForDOMStable(2);
      
      console.log('✅ 页面稳定性检查完成');
    } catch (error) {
      console.warn('⚠️ 页面稳定性检查失败:', error);
      // 降级：固定等待
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  // 🚀 新增：等待元素准备就绪，防止操作失败
  private async waitForElementReady(ref: string, runId: string): Promise<void> {
    if (!ref) return;
    
    try {
      console.log(`🎯 [${runId}] 检查元素是否准备就绪: ${ref}`);
      
      // 使用browser_wait_for确保元素可见且可交互
      await this.client.callTool({
        name: this.getToolName('wait'),
        arguments: { 
          ref: ref, 
          state: 'visible',
          timeout: 5000 
        }
      });
      
      // 额外等待确保元素完全稳定
      await new Promise(resolve => setTimeout(resolve, 200));
      
      console.log(`✅ [${runId}] 元素已准备就绪: ${ref}`);
      
    } catch (error) {
      console.warn(`⚠️ [${runId}] 元素准备检查失败: ${ref}`, error);
      // 不抛出错误，让后续操作继续尝试
    }
  }

  async getCurrentUrl(): Promise<string> {
    if (!this.isInitialized || !this.client) return '';
    
    try {
      // 🔥 修复：使用正确的browser_evaluate工具和function参数格式
      const result = await this.client.callTool({
        name: 'browser_evaluate',
        arguments: {
          function: '() => window.location.href'
        }
      });

      // 解析结果
      if (result && result.content) {
        const content = Array.isArray(result.content) ? result.content : [result.content];
        for (const item of content) {
          if (item.type === 'text' && item.text) {
            // 提取URL
            const urlMatch = item.text.match(/https?:\/\/[^\s]+/) || item.text.match(/^[^\s]+$/);
            if (urlMatch) {
              console.log(`🔍 当前页面URL: ${urlMatch[0]}`);
              return urlMatch[0];
            }
          }
        }
      }
      
      console.warn('⚠️ 无法从browser_evaluate结果中提取URL');
      return '';
    } catch (error: any) {
      console.warn(`⚠️ getCurrentUrl失败: ${error.message}`);
      return '';
    }
  }

  async getContextState(): Promise<any> {
    if (!this.isInitialized || !this.client) return null;
    try {
      return await this.client.callTool({ name: this.getToolName('get_context_state'), arguments: {} });
    } catch (error) {
      console.error(`❌ 获取上下文状态失败:`, error);
      return null;
    }
  }

  async setContextState(contextState: any): Promise<void> {
    if (!this.isInitialized || !this.client) return;
    try {
      await this.client.callTool({ name: this.getToolName('set_context_state'), arguments: { contextState } });
      console.log('🔄 上下文状态已恢复');
    } catch (error) {
      console.error(`❌ 设置上下文状态失败:`, error);
    }
  }


  private async verifyCurrentPageState(runId: string): Promise<void> {
    console.log(`🔍 [${runId}] ===== 验证当前页面状态 =====`);

    try {
      // 🔥 使用正确的工具名称格式
      const getToolName = (baseName: string): string => {
        return baseName.replace('mcp_playwright_browser_', 'browser_');
      };

      // 🔥 修复：使用browser_evaluate工具进行页面状态验证
      console.log(`🔍 [${runId}] 当前页面状态:`);
      
      try {
        // 获取页面基本信息
        const urlResult = await this.getCurrentUrl();
        console.log(`   🌐 当前URL: ${urlResult || '未知'}`);
        
        // 获取页面标题
        const titleResult = await this.client.callTool({
          name: 'browser_evaluate',
          arguments: {
            function: '() => document.title'
          }
        });
        
        if (titleResult && titleResult.content) {
          const content = Array.isArray(titleResult.content) ? titleResult.content : [titleResult.content];
          for (const item of content) {
            if (item.type === 'text' && item.text) {
              console.log(`   📄 页面标题: ${item.text}`);
              break;
            }
          }
        }
      } catch (evalError: any) {
        console.log(`   ⚠️ 页面状态检查失败: ${evalError.message}`);
        console.log(`   📊 改为使用快照进行页面验证`);
      }

      // 强制刷新快照，确保与实际浏览器状态同步
      await this.refreshSnapshot();
      console.log(`📊 [${runId}] 页面状态验证完成`);

    } catch (error) {
      console.error(`❌ [${runId}] 验证页面状态失败:`, error);
    }

    console.log(`🔍 [${runId}] ===== 页面状态验证结束 =====`);
  }

  // 🔥 新增：处理截图文件的后处理（移动到正确目录）
  private buildScreenshotCandidatePaths(filename: string, preferredPath?: string): string[] {
    const candidates = new Set<string>();
    if (preferredPath) {
      candidates.add(path.normalize(preferredPath));
    }

    const screenshotDir = screenshotConfig.getScreenshotsDirectory();

    const staticPaths = [
      filename,
      path.join(process.cwd(), filename),
      path.join(screenshotDir, filename),
      path.join(process.cwd(), 'temp-screenshots', filename),
      path.join(process.cwd(), 'screenshots', filename),
      path.join(process.cwd(), 'node_modules', '@playwright', 'mcp', filename),
      path.join(process.cwd(), 'node_modules', '.bin', filename),
      path.join(process.cwd(), 'playwright-report', filename),
      path.join(process.cwd(), 'test-results', filename),
      path.join(os.tmpdir(), filename),
      path.join(os.homedir(), filename)
    ];

    for (const candidate of staticPaths) {
      if (candidate && candidate.trim().length > 0) {
        candidates.add(path.normalize(candidate));
      }
    }

    const envDirectories = [
      process.env.PLAYWRIGHT_MCP_OUTPUT_DIR,
      process.env.MCP_OUTPUT_DIR,
      process.env.PLAYWRIGHT_SCREENSHOTS_DIR,
      process.env.MCP_SCREENSHOT_DIR,
      process.env.PLAYWRIGHT_DOWNLOAD_DIR,
      process.env.PLAYWRIGHT_TEMP_DIR,
      process.env.PLAYWRIGHT_BROWSERS_PATH
    ].filter((value): value is string => Boolean(value && value.trim().length > 0));

    for (const directory of envDirectories) {
      candidates.add(path.normalize(path.join(directory, filename)));
    }

    return Array.from(candidates);
  }

  private locateScreenshotFile(filename: string, preferredPath?: string): string | null {
    const candidates = this.buildScreenshotCandidatePaths(filename, preferredPath);

    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) {
          const stats = fs.statSync(candidate);
          if (stats.isFile() && stats.size > 0) {
            return candidate;
          }
        }
      } catch (error) {
        // 忽略单个路径检查错误
      }
    }

    return null;
  }

  private async handleScreenshotPostProcess(filename: string, targetPath?: string): Promise<string | null> {
    try {
      console.log(`🔍 [PostProcess] 查找截图文件: ${filename}`);

      const targetDir = screenshotConfig.getScreenshotsDirectory();
      const finalPath = targetPath || path.join(targetDir, filename);
      const sourceFile = this.locateScreenshotFile(filename, finalPath);

      if (!sourceFile) {
        console.warn(`⚠️ [PostProcess] 未找到截图文件: ${filename}`);
        const candidates = this.buildScreenshotCandidatePaths(filename, finalPath);
        console.warn('🔍 [PostProcess] 已检查路径:', candidates);

        try {
          const parts = filename.split('-');
          const token = parts.length > 1 ? parts[1] : filename;
          const currentDirFiles = fs.readdirSync(process.cwd()).filter(file => file.includes(token));
          console.warn('📂 [PostProcess] 当前目录相关文件:', currentDirFiles);

          const screenshotFiles = fs.readdirSync(screenshotConfig.getScreenshotsDirectory()).slice(-5);
          console.warn('📂 [PostProcess] screenshots目录最新文件:', screenshotFiles);
        } catch (debugError) {
          console.warn('🔍 [PostProcess] 调试信息获取失败:', (debugError as Error).message);
        }

        return null;
      }

      screenshotConfig.ensureScreenshotsDirectory();

      if (path.resolve(sourceFile) === path.resolve(finalPath)) {
        console.log(`✅ [PostProcess] 文件已在正确位置: ${finalPath}`);
        return finalPath;
      }

      try {
        await fs.promises.mkdir(path.dirname(finalPath), { recursive: true });
      } catch (mkdirError) {
        console.warn('⚠️ [PostProcess] 创建目标目录失败:', this.normaliseError(mkdirError as Error).message);
      }

      console.log(`🔄 [PostProcess] 移动文件: ${sourceFile} -> ${finalPath}`);
      fs.copyFileSync(sourceFile, finalPath);

      if (fs.existsSync(finalPath)) {
        const stats = fs.statSync(finalPath);
        console.log(`✅ [PostProcess] 文件移动成功: ${finalPath} (${stats.size} bytes)`);

        if (sourceFile !== finalPath) {
          try {
            fs.unlinkSync(sourceFile);
            console.log(`🗑️ [PostProcess] 已删除源文件: ${sourceFile}`);
          } catch (deleteError) {
            console.warn('⚠️ [PostProcess] 删除源文件失败:', deleteError);
          }
        }

        return finalPath;
      }

      console.error(`❌ [PostProcess] 文件移动失败: ${finalPath}`);
      return null;
    } catch (error) {
      console.error('❌ [PostProcess] 截图后处理失败', error);
      return null;
    }
  }

}
