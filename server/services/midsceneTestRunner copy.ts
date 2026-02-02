import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { PlaywrightAgent } from '@midscene/web/playwright';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { TestStep } from '../../src/types/test.js';
import { EvidenceService } from './evidenceService.js';
import { StreamService } from './streamService.js';

/**
 * Midscene Test Runner 执行器
 * 使用Midscene AI视觉理解能力执行测试，支持智能元素定位
 */
export class MidsceneTestRunner {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private agent: PlaywrightAgent | null = null; // Midscene AI Agent
  private evidenceService: EvidenceService;
  private streamService: StreamService;
  private artifactsDir: string;
  // 元素定位缓存（避免重复AI调用）
  private elementCache: Map<string, CachedElement> = new Map();
  // 🔥 新增：AI操作结果缓存（避免重复AI调用）
  private actionCache: Map<string, CachedAction> = new Map();
  // 日志回调函数（用于将日志发送到前端）
  private logCallback?: (message: string, level?: 'info' | 'warning' | 'error' | 'success') => void;
  // AI API调用统计
  private aiCallStats = {
    totalCalls: 0,
    successCalls: 0,
    failedCalls: 0,
    cacheHits: 0,
    // 🔥 新增：详细的token和时间统计
    tokenStats: [] as Array<{
      timestamp: string;
      operation: string;
      duration: number; // 毫秒
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
      cost?: number;
    }>
  };

  constructor(
    evidenceService: EvidenceService,
    streamService: StreamService,
    artifactsDir: string,
    logCallback?: (message: string, level?: 'info' | 'warning' | 'error' | 'success') => void
  ) {
    this.evidenceService = evidenceService;
    this.streamService = streamService;
    this.artifactsDir = artifactsDir;
    this.logCallback = logCallback;
  }

  /**
   * 初始化浏览器
   */
  async initialize(runId: string, options: {
    headless?: boolean;
    enableTrace?: boolean;
    enableVideo?: boolean;
  } = {}): Promise<void> {
    const {
      headless = false,
      enableTrace = true,
      enableVideo = true
    } = options;

    // 🔥 启用Midscene DEBUG模式，打印AI服务消耗的时间和token使用情况
    process.env.DEBUG = 'midscene:*';
    console.log(`🔧 [${runId}] 已启用 Midscene DEBUG 模式: DEBUG=midscene:*`);

    console.log(`🚀 [${runId}] 初始化 Midscene Test Runner...`);
    // this.addLog(runId, '🚀 初始化 Midscene Test Runner...', 'info');
    
    try {
      // 启动浏览器
      this.browser = await chromium.launch({
        headless,
        args: ['--start-maximized']
      });

      // 创建运行目录
      const runDir = path.join(this.artifactsDir, runId);
      await fs.mkdir(runDir, { recursive: true });

      // 配置 context 选项
      const contextOptions: any = {
        viewport: null, // 使用全屏
        ignoreHTTPSErrors: true,
        acceptDownloads: true,
        downloadsPath: runDir,
      };

      // 启用 trace 录制
      if (enableTrace) {
        contextOptions.trace = {
          screenshots: true,
          snapshots: true,
          sources: true,
        };
      }

      // 启用 video 录制
      if (enableVideo) {
        contextOptions.recordVideo = {
          dir: runDir,
          size: { width: 1920, height: 1080 }
        };
      }

      // 创建 context
      this.context = await this.browser.newContext(contextOptions);

      // 开始 trace 录制
      if (enableTrace) {
        await this.context.tracing.start({
          screenshots: true,
          snapshots: true,
          sources: true
        });
      }

      // 创建页面
      this.page = await this.context.newPage();

      // 初始化 Midscene AI Agent
      try {
        // 🔥 使用系统 LLM 配置管理器获取 AI 配置
        const aiConfig: any = {
          waitForNavigationTimeout: 5000,
          waitForNetworkIdleTimeout: 2000,
          forceSameTabNavigation: true,
          // 🔥 配置报告路径和名称
          groupName: runId, // 使用runId作为报告组名
        };

        // 动态导入 LLMConfigManager（后端环境）
        const { LLMConfigManager } = await import('../../src/services/llmConfigManager.js');
        const llmConfigManager = LLMConfigManager.getInstance();
        
        // 初始化配置管理器
        await llmConfigManager.initialize();
        
        // 获取当前 LLM 配置
        const llmConfig = llmConfigManager.getCurrentConfig();
        const modelInfo = llmConfigManager.getModelInfo();
        
        if (llmConfig.apiKey && llmConfig.apiKey !== 'your_api_key_here') {
          // 🔥 修复：使用正确的Midscene配置键名
          // 参考：https://midscenejs.com/model-config
          
          // 🔥 根据模型名称自动判断MODEL_FAMILY
          let modelFamily = 'qwen3-vl'; // 默认值
          const modelName = llmConfig.model.toLowerCase();
          
          if (modelName.includes('qwen-vl') || modelName.includes('qwen2.5-vl')) {
            modelFamily = 'qwen2.5-vl';
          } else if (modelName.includes('qwen3-vl')) {
            modelFamily = 'qwen3-vl';
          } else if (modelName.includes('doubao') || modelName.includes('seed')) {
            modelFamily = 'doubao-vision';
          } else if (modelName.includes('glm')) {
            modelFamily = 'glm-v';
          } else if (modelName.includes('gemini')) {
            modelFamily = 'gemini';
          } else if (modelName.includes('ui-tars')) {
            modelFamily = 'ui-tars';
          }
          
          // 🔥 使用正确的配置键名
          aiConfig.modelConfig = {
            MIDSCENE_MODEL_BASE_URL: llmConfig.baseUrl,  // 🔥 正确的键名
            MIDSCENE_MODEL_API_KEY: llmConfig.apiKey,    // 🔥 正确的键名
            MIDSCENE_MODEL_FAMILY: modelFamily,
            MIDSCENE_MODEL_NAME: llmConfig.model,
            MIDSCENE_MODEL_TEXT_ONLY: 'false'
          };
          console.log(`🤖 [${runId}] 使用系统 LLM 配置:`);
          console.log(`   模型: ${modelInfo.name} (${llmConfig.model})`);
          console.log(`   模型家族: ${modelFamily}`);
          console.log(`   API端点: ${llmConfig.baseUrl}`);
          console.log(`   温度: ${llmConfig.temperature}`);
          this.addLog(runId, `🤖 使用系统 LLM 配置: ${modelInfo.name} (${modelFamily})`, 'info');
        } else {
          console.warn(`⚠️ [${runId}] 未配置 LLM API 密钥，Midscene AI 功能将不可用`);
          this.addLog(runId, `⚠️ 未配置 LLM API 密钥，将使用传统选择器`, 'warning');
        }

        this.agent = new PlaywrightAgent(this.page, aiConfig);
        console.log(`🤖 [${runId}] Midscene AI Agent 初始化成功`);
        // this.addLog(runId, '🤖 Midscene AI Agent 初始化成功', 'success');
      } catch (agentError: any) {
        console.warn(`⚠️ [${runId}] Midscene AI Agent 初始化失败: ${agentError.message}`);
        this.addLog(runId, `⚠️ Midscene AI Agent 初始化失败，将使用传统选择器: ${agentError.message}`, 'warning');
        // 不抛出错误，允许降级到传统选择器
      }

      console.log(`✅ [${runId}] Midscene Test Runner 初始化完成`);
      // this.addLog(runId, '✅ Midscene Test Runner 初始化成功，AI视觉识别引擎已启动', 'success');
    } catch (error: any) {
      const errorMsg = `Midscene初始化失败: ${error.message}`;
      console.error(`❌ [${runId}] ${errorMsg}`);
      this.addLog(runId, `❌ ${errorMsg}`, 'error');
      throw new Error(`${errorMsg}。建议切换到Playwright或MCP引擎。`);
    }
  }

  /**
   * 执行测试步骤
   * @param step 测试步骤
   * @param runId 运行ID
   * @param stepIndex 步骤索引
   * @param matchMode 断言匹配模式（仅用于 expect 操作）
   */
  async executeStep(
    step: TestStep,
    runId: string,
    stepIndex: number,
    matchMode: 'strict' | 'auto' | 'loose' = 'auto'
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.page) {
      return { success: false, error: '页面未初始化' };
    }

    try {
      // 🔥 移除重复日志：testExecution.ts已经输出了步骤信息
      // console.log(`🎬 [${runId}] 执行步骤 ${stepIndex + 1}: ${step.description}`);
      // console.log(`   操作: ${step.action}`);
      // this.addLog(runId, `🎬 执行步骤 ${stepIndex + 1}: ${step.description}`, 'info');

      // 步骤前截图
      await this.captureScreenshot(runId, stepIndex, 'before');

      switch (step.action) {
        case 'navigate':
          await this.executeNavigate(step, runId);
          break;
        case 'click':
          await this.executeClick(step, runId);
          break;
        case 'fill':
        case 'input':
          await this.executeFill(step, runId);
          break;
        case 'wait':
          await this.executeWait(step, runId);
          break;
        case 'scroll':
          await this.executeScroll(step, runId);
          break;
        case 'screenshot':
          await this.executeScreenshot(step, runId, stepIndex);
          break;
        case 'expect':
          await this.executeExpect(step, runId, matchMode);
          break;
        default:
          throw new Error(`不支持的操作类型: ${step.action}`);
      }

      // 步骤后截图
      await this.captureScreenshot(runId, stepIndex, 'after');

      // 🔥 移除重复日志：testExecution.ts会输出成功信息
      // console.log(`✅ [${runId}] 步骤 ${stepIndex + 1} 执行成功`);
      // this.addLog(runId, `✅ 步骤 ${stepIndex + 1} 执行成功`, 'success');
      return { success: true };
    } catch (error: any) {
      const errorMsg = `步骤 ${stepIndex + 1} 执行失败: ${error.message}`;
      // 🔥 保留错误日志：错误信息很重要，需要输出
      console.error(`❌ [${runId}] ${errorMsg}`);
      this.addLog(runId, `❌ ${errorMsg}`, 'error');
      
      // 保存错误时的页面状态
      await this.captureScreenshot(runId, stepIndex, 'error');
      
      return { success: false, error: errorMsg };
    }
  }

  /**
   * 执行导航操作
   */
  private async executeNavigate(step: TestStep, runId: string): Promise<void> {
    if (!step.url) {
      throw new Error('导航步骤缺少 URL');
    }

    console.log(`🌐 [${runId}] 导航到: ${step.url}`);
    this.addLog(runId, `🌐 导航到: ${step.url}`, 'info');

    await this.page!.goto(step.url, {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    // 等待页面稳定
    await this.page!.waitForLoadState('domcontentloaded');
  }

  /**
   * 执行点击操作（使用AI视觉定位）
   */
  private async executeClick(step: TestStep, runId: string): Promise<void> {
    const operationDesc = this.extractOperationDescription(step);
    console.log(`🖱️ [${runId}] 点击操作: ${operationDesc}`);
    this.addLog(runId, `🖱️ 点击操作: ${operationDesc}`, 'info');

    // 🔥 Midscene模式：只使用AI，不降级到传统选择器
    if (!this.agent) {
      throw new Error(`Midscene AI Agent 未初始化，无法执行操作`);
    }

    // 🔥 检查缓存
    const cachedAction = await this.checkActionCache('click', operationDesc);
    if (cachedAction) {
      this.aiCallStats.cacheHits++;
      console.log(`💾 [${runId}] 使用缓存的点击操作结果`);
      this.addLog(runId, `💾 使用缓存结果，节省AI调用`, 'success');
      
      if (cachedAction.success) {
        // 缓存显示操作成功，直接返回
        return;
      } else {
        // 🔥 缓存显示操作失败，直接抛出错误（不降级）
        throw new Error(`缓存显示Midscene AI执行失败`);
      }
    }
    
    try {
      this.aiCallStats.totalCalls++;
      console.log(`🤖 [${runId}] 使用 Midscene AI: ${operationDesc}`);
      this.addLog(runId, `🤖 使用 Midscene AI 执行操作（视觉识别需要10-30秒，请耐心等待）...`, 'info');
      
      // 直接使用完整的操作描述
      const startTime = Date.now();
      
      // 🔥 添加超时监控和详细日志
      console.log(`🚀 [${runId}] 开始调用 Midscene AI API...`);
      console.log(`📝 [${runId}] 操作描述: "${operationDesc}"`);
      
      // 🔥 添加进度监控定时器
      let progressTimer: NodeJS.Timeout | null = null;
      let elapsedSeconds = 0;
      
      const startProgressMonitor = () => {
        progressTimer = setInterval(() => {
          elapsedSeconds += 5;
          console.log(`⏱️ [${runId}] AI调用进行中... 已耗时 ${elapsedSeconds}秒`);
          this.addLog(runId, `⏱️ AI视觉识别进行中... 已耗时 ${elapsedSeconds}秒`, 'info');
        }, 5000); // 每5秒输出一次进度
      };
      
      const stopProgressMonitor = () => {
        if (progressTimer) {
          clearInterval(progressTimer);
          progressTimer = null;
        }
      };
      
      startProgressMonitor();
      
      try {
        await this.agent.aiAct(operationDesc);
        stopProgressMonitor();
        const duration = Date.now() - startTime;
        
        this.aiCallStats.successCalls++;
        console.log(`✅ [${runId}] Midscene AI 执行成功 (耗时: ${duration}ms)`);
        this.addLog(runId, `✅ Midscene AI 执行成功 (耗时: ${(duration/1000).toFixed(1)}秒)`, 'success');
        
        // 🔥 记录token统计（时间信息）
        this.aiCallStats.tokenStats.push({
          timestamp: new Date().toISOString(),
          operation: `click: ${operationDesc}`,
          duration: duration
        });
        
        // 🔥 保存成功结果到缓存
        await this.saveActionCache('click', operationDesc, true);
        
        return;
      } catch (innerError: any) {
        stopProgressMonitor();
        const duration = Date.now() - startTime;
        
        // 🔥 保存失败结果到缓存
        await this.saveActionCache('click', operationDesc, false);
        
        console.error(`❌ [${runId}] Midscene AI 调用失败 (耗时: ${duration}ms)`);
        console.error(`❌ [${runId}] 错误详情:`, innerError);
        
        throw innerError; // 重新抛出错误
      }
    } catch (aiError: any) {
      this.aiCallStats.failedCalls++;
      const errorMessage = aiError.message || String(aiError);
      const errorDetails = aiError.stack || errorMessage;
      
      console.error(`❌ [${runId}] Midscene AI 执行失败:`, errorDetails);
      console.error(`   操作描述: ${operationDesc}`);
      console.error(`   错误类型: ${aiError.name || 'Unknown'}`);
      this.addLog(runId, `❌ Midscene AI 执行失败: ${errorMessage}`, 'error');
      
      // 🔥 不降级，直接抛出错误
      throw new Error(`Midscene AI 执行失败: ${aiError.message}`);
    }
  }
    } else {
      throw new Error(`无法定位元素: 既没有Midscene AI可用，也没有提供传统选择器。建议：1) 配置支持视觉理解的AI模型 2) 或为步骤添加selector属性`);
    }
  }

  /**
   * 执行填充操作（使用AI视觉定位）
   */
  private async executeFill(step: TestStep, runId: string): Promise<void> {
    const operationDesc = this.extractOperationDescription(step);
    
    console.log(`⌨️ [${runId}] 填充操作: ${operationDesc}`);
    this.addLog(runId, `⌨️ 填充操作: ${operationDesc}`, 'info');

    // 🔥 Midscene模式：只使用AI，不降级到传统选择器
    if (!this.agent) {
      throw new Error(`Midscene AI Agent 未初始化，无法执行操作`);
    }

    // 🔥 检查缓存
    const cachedAction = await this.checkActionCache('fill', operationDesc, step.value);
    if (cachedAction) {
      this.aiCallStats.cacheHits++;
      console.log(`💾 [${runId}] 使用缓存的填充操作结果`);
      this.addLog(runId, `💾 使用缓存结果，节省AI调用`, 'success');
      
      if (cachedAction.success) {
        // 缓存显示操作成功，直接返回
        return;
      } else {
        // 🔥 缓存显示操作失败，直接抛出错误（不降级）
        throw new Error(`缓存显示Midscene AI执行失败`);
      }
    }
    
    try {
      this.aiCallStats.totalCalls++;
      console.log(`🤖 [${runId}] 使用 Midscene AI: ${operationDesc}`);
      this.addLog(runId, `🤖 使用 Midscene AI 执行操作（视觉识别需要10-30秒，请耐心等待）...`, 'info');
      
      // 直接使用完整的操作描述
      const startTime = Date.now();
      
      // 🔥 添加超时监控和详细日志
      console.log(`🚀 [${runId}] 开始调用 Midscene AI API...`);
      console.log(`📝 [${runId}] 操作描述: "${operationDesc}"`);
      
      // 🔥 添加进度监控定时器
      let progressTimer: NodeJS.Timeout | null = null;
      let elapsedSeconds = 0;
      
      const startProgressMonitor = () => {
        progressTimer = setInterval(() => {
          elapsedSeconds += 5;
          console.log(`⏱️ [${runId}] AI调用进行中... 已耗时 ${elapsedSeconds}秒`);
          this.addLog(runId, `⏱️ AI视觉识别进行中... 已耗时 ${elapsedSeconds}秒`, 'info');
        }, 5000); // 每5秒输出一次进度
      };
      
      const stopProgressMonitor = () => {
        if (progressTimer) {
          clearInterval(progressTimer);
          progressTimer = null;
        }
      };
      
      startProgressMonitor();
      
      try {
        await this.agent.aiAct(operationDesc);
        stopProgressMonitor();
        const duration = Date.now() - startTime;
        
        this.aiCallStats.successCalls++;
        console.log(`✅ [${runId}] Midscene AI 执行成功 (耗时: ${duration}ms)`);
        this.addLog(runId, `✅ Midscene AI 执行成功 (耗时: ${(duration/1000).toFixed(1)}秒)`, 'success');
        
        // 🔥 记录token统计（时间信息）
        this.aiCallStats.tokenStats.push({
          timestamp: new Date().toISOString(),
          operation: `fill: ${operationDesc}`,
          duration: duration
        });
        
        // 🔥 保存成功结果到缓存
        await this.saveActionCache('fill', operationDesc, true, step.value);
        
        return;
      } catch (innerError: any) {
        stopProgressMonitor();
        const duration = Date.now() - startTime;
        
        // 🔥 保存失败结果到缓存
        await this.saveActionCache('fill', operationDesc, false, step.value);
        
        console.error(`❌ [${runId}] Midscene AI 调用失败 (耗时: ${duration}ms)`);
        console.error(`❌ [${runId}] 错误详情:`, innerError);
        
        throw innerError; // 重新抛出错误
      }
    } catch (aiError: any) {
      this.aiCallStats.failedCalls++;
      const errorMessage = aiError.message || String(aiError);
      const errorDetails = aiError.stack || errorMessage;
      
      console.error(`❌ [${runId}] Midscene AI 执行失败:`, errorDetails);
      console.error(`   操作描述: ${operationDesc}`);
      console.error(`   错误类型: ${aiError.name || 'Unknown'}`);
      this.addLog(runId, `❌ Midscene AI 执行失败: ${errorMessage}`, 'error');
      
      // 🔥 不降级，直接抛出错误
      throw new Error(`Midscene AI 执行失败: ${aiError.message}`);
    }
  }

  /**
   * 执行等待操作
   */
  private async executeWait(step: TestStep, runId: string): Promise<void> {
    const duration = step.duration || 1000;
    console.log(`⏳ [${runId}] 等待 ${duration}ms`);
    this.addLog(runId, `⏳ 等待 ${duration}ms`, 'info');
    
    await new Promise(resolve => setTimeout(resolve, duration));
  }

  /**
   * 执行滚动操作
   */
  private async executeScroll(step: TestStep, runId: string): Promise<void> {
    console.log(`📜 [${runId}] 滚动页面`);
    this.addLog(runId, `📜 滚动页面`, 'info');

    if (step.selector) {
      // 滚动到指定元素
      await this.page!.locator(step.selector).scrollIntoViewIfNeeded();
    } else {
      // 滚动到页面底部
      await this.page!.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
    }
  }

  /**
   * 执行截图操作
   */
  private async executeScreenshot(step: TestStep, runId: string, stepIndex: number): Promise<void> {
    console.log(`📸 [${runId}] 捕获截图`);
    this.addLog(runId, `📸 捕获截图`, 'info');
    
    await this.captureScreenshot(runId, stepIndex, 'manual');
  }

  /**
   * 执行断言操作（使用AI视觉验证）
   */
  private async executeExpect(
    step: TestStep,
    runId: string,
    matchMode: 'strict' | 'auto' | 'loose'
  ): Promise<void> {
    const operationDesc = this.extractOperationDescription(step);
    console.log(`✓ [${runId}] 验证断言: ${operationDesc} (模式: ${matchMode})`);
    this.addLog(runId, `✓ 验证断言: ${operationDesc}`, 'info');

    // 🔥 Midscene模式：只使用AI，不降级到传统文本匹配
    if (!this.agent) {
      throw new Error(`Midscene AI Agent 未初始化，无法执行操作`);
    }

    // 🔥 检查缓存
    const cachedAction = await this.checkActionCache('assert', operationDesc);
    if (cachedAction) {
      this.aiCallStats.cacheHits++;
      console.log(`💾 [${runId}] 使用缓存的断言结果`);
      this.addLog(runId, `💾 使用缓存结果，节省AI调用`, 'success');
      
      if (cachedAction.success) {
        // 缓存显示断言成功，直接返回
        return;
      } else {
        // 🔥 缓存显示断言失败，直接抛出错误（不降级）
        throw new Error(`缓存显示Midscene AI验证失败`);
      }
    }
    
    try {
      this.aiCallStats.totalCalls++;
      console.log(`🤖 [${runId}] 使用 Midscene AI 验证: ${operationDesc}`);
      this.addLog(runId, `🤖 使用 Midscene AI 验证（视觉识别需要10-30秒，请耐心等待）...`, 'info');
    
      // 直接使用完整的断言描述（支持中文自然语言）
      const startTime = Date.now();
      
      // 🔥 添加超时监控和详细日志
      console.log(`🚀 [${runId}] 开始调用 Midscene AI API...`);
      console.log(`📝 [${runId}] 断言描述: "${operationDesc}"`);
      
      // 🔥 添加进度监控定时器
      let progressTimer: NodeJS.Timeout | null = null;
      let elapsedSeconds = 0;
      
      const startProgressMonitor = () => {
        progressTimer = setInterval(() => {
          elapsedSeconds += 5;
          console.log(`⏱️ [${runId}] AI调用进行中... 已耗时 ${elapsedSeconds}秒`);
          this.addLog(runId, `⏱️ AI视觉识别进行中... 已耗时 ${elapsedSeconds}秒`, 'info');
        }, 5000); // 每5秒输出一次进度
      };
      
      const stopProgressMonitor = () => {
        if (progressTimer) {
          clearInterval(progressTimer);
          progressTimer = null;
        }
      };
      
      startProgressMonitor();
      
      try {
        await this.agent.aiAssert(operationDesc);
        stopProgressMonitor();
        const duration = Date.now() - startTime;
        
        this.aiCallStats.successCalls++;
        console.log(`✅ [${runId}] Midscene AI 验证成功 (耗时: ${duration}ms)`);
        this.addLog(runId, `✅ Midscene AI 验证成功 (耗时: ${(duration/1000).toFixed(1)}秒)`, 'success');
        
        // 🔥 记录token统计（时间信息）
        this.aiCallStats.tokenStats.push({
          timestamp: new Date().toISOString(),
          operation: `assert: ${operationDesc}`,
          duration: duration
        });
        
        // 🔥 保存成功结果到缓存
        await this.saveActionCache('assert', operationDesc, true);
        
        return;
      } catch (innerError: any) {
        stopProgressMonitor();
        const duration = Date.now() - startTime;
        
        // 🔥 保存失败结果到缓存
        await this.saveActionCache('assert', operationDesc, false);
        
        console.error(`❌ [${runId}] Midscene AI 调用失败 (耗时: ${duration}ms)`);
        console.error(`❌ [${runId}] 错误详情:`, innerError);
        
        throw innerError; // 重新抛出错误
      }
    } catch (aiError: any) {
      this.aiCallStats.failedCalls++;
      const errorMessage = aiError.message || String(aiError);
      const errorDetails = aiError.stack || errorMessage;
      
      console.error(`❌ [${runId}] Midscene AI 验证失败:`, errorDetails);
      console.error(`   断言描述: ${operationDesc}`);
      console.error(`   错误类型: ${aiError.name || 'Unknown'}`);
      this.addLog(runId, `❌ Midscene AI 验证失败: ${errorMessage}`, 'error');
      
      // 🔥 不降级，直接抛出错误
      throw new Error(`Midscene AI 验证失败: ${aiError.message}`);
    }
  }

  /**
   * 从测试步骤中提取操作描述（移除步骤编号和预期结果）
   * 对于操作步骤：提取 -> 前面的操作部分
   * 对于断言步骤：提取 -> 后面的断言部分
   * 
   * 例如：
   * - 操作："2. 在用户名输入框输入账号：sysadmin -> 输入框正常接收输入" 
   *   提取为："在用户名输入框输入账号：sysadmin"
   * - 断言："10. 验证登录成功 -> 页面显示用户名"
   *   提取为："页面显示用户名"
   */
  private extractOperationDescription(step: TestStep): string {
    // 优先使用 element 字段（如果有）
    if (step.element) {
      return step.element;
    }

    // 从 description 中提取
    let desc = step.description || '';
    
    // 移除步骤编号（如 "1. ", "2. ", "1) ", "2) "）
    desc = desc.replace(/^\d+[\.、\)]\s*/, '');
    
    // 根据步骤类型决定提取哪部分
    if (step.action === 'expect') {
      // 断言步骤：提取 -> 后面的部分（预期结果）
      const separators = ['->', '→'];
      for (const sep of separators) {
        if (desc.includes(sep)) {
          const parts = desc.split(sep);
          // 返回 -> 后面的部分
          return parts[1]?.trim() || desc;
        }
      }
      // 如果没有 ->，返回整个描述
      return desc;
    } else {
      // 操作步骤：提取 -> 前面的部分（操作内容）
      const separators = ['->', '→'];
      for (const sep of separators) {
        if (desc.includes(sep)) {
          const parts = desc.split(sep);
          // 返回 -> 前面的部分
          return parts[0]?.trim() || desc;
        }
      }
      // 如果没有 ->，返回整个描述
      return desc;
    }
  }

  /**
   * 捕获截图
   */
  private async captureScreenshot(
    runId: string,
    stepIndex: number,
    status: string
  ): Promise<string> {
    try {
      const timestamp = Date.now();
      const filename = `${runId}-step-${stepIndex + 1}-${status}-${timestamp}.png`;
      const filepath = path.join(this.artifactsDir, runId, filename);
      
      await this.page!.screenshot({
        path: filepath,
        fullPage: false
      });
      
      return filepath;
    } catch (error: any) {
      console.warn(`⚠️ [${runId}] 截图失败: ${error.message}`);
      return '';
    }
  }

  /**
   * 清理资源
   */
  async close(runId: string): Promise<void> {
    console.log(`🧹 [${runId}] 清理 Midscene Test Runner 资源...`);
    this.addLog(runId, '🧹 清理资源...', 'info');

    try {
      // 输出 AI 调用统计
      console.log(`📊 [${runId}] AI 调用统计:`);
      console.log(`   总调用次数: ${this.aiCallStats.totalCalls}`);
      console.log(`   成功次数: ${this.aiCallStats.successCalls}`);
      console.log(`   失败次数: ${this.aiCallStats.failedCalls}`);
      console.log(`   缓存命中: ${this.aiCallStats.cacheHits}`);
      if (this.aiCallStats.totalCalls > 0) {
        const successRate = (this.aiCallStats.successCalls / this.aiCallStats.totalCalls * 100).toFixed(1);
        const cacheRate = (this.aiCallStats.cacheHits / (this.aiCallStats.totalCalls + this.aiCallStats.cacheHits) * 100).toFixed(1);
        console.log(`   成功率: ${successRate}%`);
        console.log(`   缓存命中率: ${cacheRate}%`);
      }
      
      // 🔥 新增：输出CSV格式的token统计（便于分析）
      if (this.aiCallStats.tokenStats.length > 0) {
        console.log(`\n📊 [${runId}] Token使用统计 (CSV格式):`);
        console.log(`时间戳,操作类型,耗时(ms),输入Token,输出Token,总Token,成本`);
        this.aiCallStats.tokenStats.forEach(stat => {
          const row = [
            stat.timestamp,
            stat.operation,
            stat.duration.toFixed(0),
            stat.inputTokens || 0,
            stat.outputTokens || 0,
            stat.totalTokens || 0,
            stat.cost ? stat.cost.toFixed(4) : '0'
          ].join(',');
          console.log(row);
        });
        
        // 计算总计
        const totalDuration = this.aiCallStats.tokenStats.reduce((sum, s) => sum + s.duration, 0);
        const totalInputTokens = this.aiCallStats.tokenStats.reduce((sum, s) => sum + (s.inputTokens || 0), 0);
        const totalOutputTokens = this.aiCallStats.tokenStats.reduce((sum, s) => sum + (s.outputTokens || 0), 0);
        const totalTokens = this.aiCallStats.tokenStats.reduce((sum, s) => sum + (s.totalTokens || 0), 0);
        const totalCost = this.aiCallStats.tokenStats.reduce((sum, s) => sum + (s.cost || 0), 0);
        
        console.log(`总计,${this.aiCallStats.tokenStats.length}次,${totalDuration.toFixed(0)},${totalInputTokens},${totalOutputTokens},${totalTokens},${totalCost.toFixed(4)}`);
        console.log(`\n💰 [${runId}] 总成本: $${totalCost.toFixed(4)}, 总耗时: ${(totalDuration/1000).toFixed(1)}秒, 总Token: ${totalTokens}`);
      }
      
      this.addLog(runId, `📊 AI 调用统计: 总${this.aiCallStats.totalCalls}次, 成功${this.aiCallStats.successCalls}次, 缓存${this.aiCallStats.cacheHits}次`, 'info');

      // 停止 trace 录制
      if (this.context) {
        try {
          const tracePath = path.join(this.artifactsDir, runId, 'trace.zip');
          await this.context.tracing.stop({ path: tracePath });
          console.log(`📦 [${runId}] Trace 已保存: ${tracePath}`);
        } catch (error: any) {
          console.warn(`⚠️ [${runId}] Trace 保存失败: ${error.message}`);
        }
      }

      // 清理 Midscene Agent
      if (this.agent) {
        this.agent = null;
      }

      // 关闭页面
      if (this.page) {
        await this.page.close();
        this.page = null;
      }

      // 关闭上下文
      if (this.context) {
        await this.context.close();
        this.context = null;
      }

      // 关闭浏览器
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }

      // 清空缓存
      this.elementCache.clear();
      this.actionCache.clear(); // 🔥 清理操作缓存

      console.log(`✅ [${runId}] Midscene Test Runner 资源清理完成`);
      this.addLog(runId, '✅ 资源清理完成', 'success');
    } catch (error: any) {
      console.error(`❌ [${runId}] 资源清理失败: ${error.message}`);
      this.addLog(runId, `❌ 资源清理失败: ${error.message}`, 'error');
    }
  }

  /**
   * 获取页面对象（供外部使用）
   */
  getPage(): Page | null {
    return this.page;
  }

  /**
   * 获取Midscene报告文件路径
   */
  getReportFile(): string | null {
    if (this.agent && (this.agent as any).reportFile) {
      return (this.agent as any).reportFile;
    }
    return null;
  }

  /**
   * 🔥 新增：生成页面内容哈希
   * 用于判断页面是否发生变化，决定是否使用缓存
   */
  private async getPageHash(): Promise<string> {
    if (!this.page) return '';
    
    try {
      // 获取页面URL和主要内容的哈希
      const url = this.page.url();
      const bodyText = await this.page.textContent('body') || '';
      
      // 简单哈希：URL + 内容长度 + 前100个字符
      const content = `${url}_${bodyText.length}_${bodyText.substring(0, 100)}`;
      
      // 使用简单的字符串哈希算法
      let hash = 0;
      for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
      }
      
      return hash.toString(36);
    } catch (error) {
      return '';
    }
  }

  /**
   * 🔥 新增：检查操作缓存
   * @param actionType 操作类型
   * @param description 操作描述
   * @param value 操作值（可选，用于fill操作）
   * @returns 缓存的操作结果，如果没有缓存则返回null
   */
  private async checkActionCache(
    actionType: 'click' | 'fill' | 'assert',
    description: string,
    value?: string
  ): Promise<CachedAction | null> {
    const pageUrl = this.page?.url() || '';
    const pageHash = await this.getPageHash();
    
    // 构建缓存键
    const cacheKey = `${actionType}_${pageUrl}_${description}_${value || ''}`;
    const cached = this.actionCache.get(cacheKey);
    
    // 检查缓存是否有效
    if (cached) {
      // 检查页面是否变化
      if (cached.pageHash === pageHash) {
        // 检查缓存是否过期（30秒）
        const age = Date.now() - cached.timestamp;
        if (age < 30000) {
          return cached;
        }
      }
      // 缓存失效，删除
      this.actionCache.delete(cacheKey);
    }
    
    return null;
  }

  /**
   * 🔥 新增：保存操作到缓存
   */
  private async saveActionCache(
    actionType: 'click' | 'fill' | 'assert',
    description: string,
    success: boolean,
    value?: string
  ): Promise<void> {
    const pageUrl = this.page?.url() || '';
    const pageHash = await this.getPageHash();
    
    const cacheKey = `${actionType}_${pageUrl}_${description}_${value || ''}`;
    
    this.actionCache.set(cacheKey, {
      actionType,
      description,
      value,
      success,
      timestamp: Date.now(),
      pageUrl,
      pageHash
    });
  }

  /**
   * 添加日志（发送到前端）
   */
  private addLog(runId: string, message: string, level: 'info' | 'warning' | 'error' | 'success' = 'info'): void {
    if (this.logCallback) {
      this.logCallback(message, level);
    }
  }
}

/**
 * 缓存元素接口
 */
interface CachedElement {
  description: string;
  x: number;
  y: number;
  confidence: number;
  timestamp: number;
  pageUrl: string;
}

/**
 * 🔥 新增：缓存操作接口
 * 用于缓存AI操作结果，避免重复调用AI API
 */
interface CachedAction {
  actionType: 'click' | 'fill' | 'assert';
  description: string;
  value?: string; // fill操作的值
  success: boolean;
  timestamp: number;
  pageUrl: string;
  pageHash: string; // 页面内容的哈希值，用于判断页面是否变化
}
