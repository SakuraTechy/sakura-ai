import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { PlaywrightAgent } from '@midscene/web/playwright';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { TestStep } from '../../src/types/test.js';
import { EvidenceService } from './evidenceService.js';
import { StreamService } from './streamService.js';
import { MidsceneLogParser } from './midsceneLogParser.js';

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
  // 日志回调函数（用于将日志发送到前端）
  private logCallback?: (message: string, level?: 'info' | 'warning' | 'error' | 'success') => void;
  // AI API调用统计（简化版，详细统计由Midscene DEBUG日志提供）
  private aiCallStats = {
    totalCalls: 0,
    successCalls: 0,
    failedCalls: 0
  };
  // Midscene日志解析器
  private logParser: MidsceneLogParser;
  // 执行开始时间（用于过滤日志）
  private executionStartTime: Date | null = null;
  // 测试用例ID（用于缓存文件路径）
  private testCaseId: number | null = null;

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
    this.logParser = new MidsceneLogParser();
    // 🔥 在构造函数中立即设置执行开始时间，确保能捕获所有日志
    this.executionStartTime = new Date();
    // 🔥 初始化价格服务
    this.initializePricingService();
  }

  /**
   * 初始化价格服务（异步）
   */
  private async initializePricingService(): Promise<void> {
    try {
      await this.logParser.initialize();
    } catch (error: any) {
      console.warn(`⚠️ 价格服务初始化失败: ${error.message}`);
    }
  }

  /**
   * 初始化浏览器
   */
  async initialize(runId: string, options: {
    headless?: boolean;
    enableTrace?: boolean;
    enableVideo?: boolean;
    testCaseId?: number; // 🔥 测试用例ID，用于生成稳定的缓存ID
  } = {}): Promise<void> {
    const {
      headless = false,
      enableTrace = true,
      enableVideo = true,
      testCaseId // 🔥 测试用例ID
    } = options;

    // 🔥 保存测试用例ID
    this.testCaseId = testCaseId || null;

    // 🔥 启用Midscene DEBUG模式，打印AI服务消耗的时间和token使用情况
    process.env.DEBUG = 'midscene:*,midscene:cache:*,midscene:ai:profile:stats';
    console.log(`✅ [${runId}] 已启用 Midscene DEBUG 模式: DEBUG=midscene:*,midscene:cache:*,midscene:ai:profile:stats`);

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

        // 🔥 配置Midscene缓存（使用testCaseId作为稳定的缓存ID）
        // 相同测试用例的多次执行可以共享缓存，提高缓存命中率
        if (testCaseId) {
          const cacheId = `test-case-${testCaseId}`;
          aiConfig.cache = {
            strategy: 'read-write',
            id: cacheId
          };
          console.log(`💾 [${runId}] 缓存配置: 启用稳定缓存 (${cacheId})`);
        } else {
          console.log(`⚠️ [${runId}] 缓存配置: 未提供testCaseId，缓存已禁用`);
        }

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
   * @param assertionNumber 断言编号（仅用于 expect 操作，从 1 开始）
   */
  async executeStep(
    step: TestStep,
    runId: string,
    stepIndex: number,
    matchMode: 'strict' | 'auto' | 'loose' = 'auto',
    assertionNumber?: number
  ): Promise<{ success: boolean; error?: string }> {
    // 🔥 不再在这里设置 executionStartTime，已经在构造函数中设置
    
    if (!this.page) {
      return { success: false, error: '页面未初始化' };
    }

    try {
      // 🔥 移除重复日志：testExecution.ts已经输出了步骤信息
      // console.log(`🎬 [${runId}] 执行步骤 ${stepIndex + 1}: ${step.description}`);
      // console.log(`   操作: ${step.action}`);
      // this.addLog(runId, `🎬 执行步骤 ${stepIndex + 1}: ${step.description}`, 'info');

      // 🔥 步骤前截图（断言操作除外，断言有自己的截图逻辑）
      if (step.action !== 'expect') {
        await this.captureScreenshot(runId, stepIndex, 'before');
      }

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
          await this.executeExpect(step, runId, matchMode, stepIndex, assertionNumber);
          break;
        default:
          throw new Error(`不支持的操作类型: ${step.action}`);
      }

      // 🔥 步骤后截图（断言操作除外，断言有自己的截图逻辑）
      if (step.action !== 'expect') {
        await this.captureScreenshot(runId, stepIndex, 'after');
      }

      // 🔥 移除重复日志：testExecution.ts会输出成功信息
      // console.log(`✅ [${runId}] 步骤 ${stepIndex + 1} 执行成功`);
      // this.addLog(runId, `✅ 步骤 ${stepIndex + 1} 执行成功`, 'success');
      return { success: true };
    } catch (error: any) {
      // 🔥 修复：只返回简短的错误信息，不包含"步骤 X 执行失败"前缀
      // 详细错误已经在具体操作方法（executeClick/Fill/Expect）中输出
      // 这里只保存错误截图，返回简短错误信息供上层使用
      
      // 🔥 保存错误时的页面状态（断言操作除外，断言有自己的错误截图）
      if (step.action !== 'expect') {
        await this.captureScreenshot(runId, stepIndex, 'error');
      }
      
      return { success: false, error: error.message };
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
    
    try {
      this.aiCallStats.totalCalls++;
      console.log(`🤖 [${runId}] 使用 Midscene AI: ${operationDesc}`);
      this.addLog(runId, `🤖 使用 Midscene AI 执行操作（视觉正在识别，请耐心等待）...`, 'info');
      
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
        
        return;
      } catch (innerError: any) {
        stopProgressMonitor();
        const duration = Date.now() - startTime;
        
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
    
    try {
      this.aiCallStats.totalCalls++;
      console.log(`🤖 [${runId}] 使用 Midscene AI: ${operationDesc}`);
      this.addLog(runId, `🤖 使用 Midscene AI 执行操作（视觉正在识别，请耐心等待）...`, 'info');
      
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
        
        return;
      } catch (innerError: any) {
        stopProgressMonitor();
        const duration = Date.now() - startTime;
        
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
    console.log(`⏰ [${runId}] 等待 ${duration}ms`);
    this.addLog(runId, `⏰ 等待 ${duration}ms`, 'info');
    
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
    matchMode: 'strict' | 'auto' | 'loose',
    stepIndex: number,
    assertionNumber?: number
  ): Promise<void> {
    // 🔥 优先使用传入的 assertionNumber（从调用方传递的独立断言编号）
    // 如果没有传入，尝试从描述中提取
    // 最后才使用 stepIndex + 1 作为备选
    let finalAssertionNumber: number;
    
    if (assertionNumber !== undefined) {
      finalAssertionNumber = assertionNumber;
      console.log(`🔍 [${runId}] 使用传入的断言编号: ${finalAssertionNumber}`);
    } else {
      const extracted = this.extractAssertionNumber(step.description);
      if (extracted !== null) {
        finalAssertionNumber = extracted;
        console.log(`🔍 [${runId}] 断言编号提取: "${step.description}" -> ${finalAssertionNumber}`);
      } else {
        finalAssertionNumber = stepIndex + 1;
        console.log(`🔍 [${runId}] 无法从描述提取断言编号,使用步骤索引: ${finalAssertionNumber}`);
      }
    }
    
    // 然后提取操作描述
    const operationDesc = this.extractOperationDescription(step);
    console.log(`✔️ [${runId}] 验证断言: ${operationDesc} (模式: ${matchMode})`);
    this.addLog(runId, `✔️ 验证断言: ${operationDesc}`, 'info');

    // 🔥 Midscene模式：只使用AI，不降级到传统文本匹配
    if (!this.agent) {
      throw new Error(`Midscene AI Agent 未初始化，无法执行操作`);
    }
    
    try {
      this.aiCallStats.totalCalls++;
      console.log(`🤖 [${runId}] 使用 Midscene AI 验证: ${operationDesc}`);
      this.addLog(runId, `🤖 使用 Midscene AI 验证（视觉正在识别，请耐心等待）...`, 'info');
    
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
        // 🔥 断言前截图
        console.log(`📸 [${runId}] 准备拍摄断言前截图: assertion-${finalAssertionNumber}-before`);
        await this.captureAssertionScreenshot(runId, finalAssertionNumber, 'before');
        
        await this.agent.aiAssert(operationDesc);
        stopProgressMonitor();
        const duration = Date.now() - startTime;
        
        this.aiCallStats.successCalls++;
        console.log(`✅ [${runId}] Midscene AI 验证成功 (耗时: ${duration}ms)`);
        this.addLog(runId, `✅ Midscene AI 验证成功 (耗时: ${(duration/1000).toFixed(1)}秒)`, 'success');
        
        // 🔥 断言成功后截图
        console.log(`📸 [${runId}] 准备拍摄断言成功截图: assertion-${finalAssertionNumber}-success`);
        await this.captureAssertionScreenshot(runId, finalAssertionNumber, 'success');
        
        return;
      } catch (innerError: any) {
        stopProgressMonitor();
        const duration = Date.now() - startTime;
        
        console.error(`❌ [${runId}] Midscene AI 调用失败 (耗时: ${duration}ms)`);
        console.error(`❌ [${runId}] 错误详情:`, innerError);
        
        // 🔥 断言失败后截图
        console.log(`📸 [${runId}] 准备拍摄断言失败截图: assertion-${finalAssertionNumber}-error`);
        await this.captureAssertionScreenshot(runId, finalAssertionNumber, 'error');
        
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
   * 🔥 从步骤描述中提取断言编号
   * 例如："10. 验证登录成功 -> 页面显示用户名" 提取为 10
   */
  private extractAssertionNumber(description: string): number | null {
    // 匹配步骤编号（如 "1. ", "2. ", "10. "）
    const match = description.match(/^(\d+)[\.、\)]\s*/);
    if (match) {
      return parseInt(match[1], 10);
    }
    return null;
  }

  /**
   * 🔥 捕获断言截图
   * 文件名格式: {runId}-assertion-{编号}-{状态}-{时间戳}.png
   */
  private async captureAssertionScreenshot(
    runId: string,
    assertionNumber: number,
    status: 'before' | 'success' | 'error'
  ): Promise<string> {
    try {
      const timestamp = Date.now();
      const filename = `${runId}-assertion-${assertionNumber}-${status}-${timestamp}.png`;
      const filepath = path.join(this.artifactsDir, runId, filename);
      
      // 使用 Buffer 保存截图，同时保存到数据库
      const screenshotBuffer = await this.page!.screenshot({
        fullPage: false
      });
      
      // 保存到数据库和文件系统
      await this.evidenceService.saveBufferArtifact(
        runId,
        'screenshot',
        screenshotBuffer,
        filename
      );
      
      console.log(`📸 [${runId}] 断言截图已保存: ${filename}`);
      return filepath;
    } catch (error: any) {
      console.warn(`⚠️ [${runId}] 断言截图失败: ${error.message}`);
      return '';
    }
  }

  /**
   * 从测试步骤中提取操作描述（移除步骤编号和预期结果）
   * 对于操作步骤：提取 -> 前面的操作部分
   * 对于断言步骤：提取 -> 后面的断言部分
   * 
   * 例如：
   * - 操作：2. 在用户名输入框输入账号：sysadmin -> 输入框正常接收输入
   *   提取为："在用户名输入框输入账号：sysadmin"
   * - 断言：10. 验证登录成功 -> 页面显示用户名
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
      
      // 🔥 修复：使用 Buffer 保存截图，同时保存到数据库
      const screenshotBuffer = await this.page!.screenshot({
        fullPage: false
      });
      
      // 保存到数据库和文件系统
      await this.evidenceService.saveBufferArtifact(
        runId,
        'screenshot',
        screenshotBuffer,
        filename
      );
      
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

      // 🔥 手动刷新Midscene缓存到文件（确保缓存被持久化）
      // 重要：必须在清理 agent 之前调用 flushCache()
      if (this.agent) {
        try {
          // 调用flushCache()将缓存写入文件
          // 注意：不传cleanUnused参数，保留所有缓存记录
          await (this.agent as any).flushCache();
          console.log(`💾 [${runId}] Midscene 缓存已刷新到文件`);
        } catch (error: any) {
          console.warn(`⚠️ [${runId}] Midscene 缓存刷新失败: ${error.message}`);
        }
        
        // 缓存刷新完成后，再清理 Midscene Agent
        this.agent = null;
        console.log(`🧹 [${runId}] Midscene Agent 已清理`);
      }

      // 🔥 修复：关闭页面、上下文和浏览器
      if (this.page) {
        try {
          await this.page.close();
          this.page = null;
          console.log(`🧹 [${runId}] 页面已关闭`);
        } catch (error: any) {
          console.warn(`⚠️ [${runId}] 页面关闭失败: ${error.message}`);
        }
      }

      if (this.context) {
        try {
          await this.context.close();
          this.context = null;
          console.log(`🧹 [${runId}] 上下文已关闭`);
        } catch (error: any) {
          console.warn(`⚠️ [${runId}] 上下文关闭失败: ${error.message}`);
        }
      }

      if (this.browser) {
        try {
          await this.browser.close();
          this.browser = null;
          console.log(`🧹 [${runId}] 浏览器已关闭`);
        } catch (error: any) {
          console.warn(`⚠️ [${runId}] 浏览器关闭失败: ${error.message}`);
        }
        try {
          // 注意：不传cleanUnused参数，保留所有缓存记录
          await (this.agent as any).flushCache();
          console.log(`💾 [${runId}] Midscene 缓存已刷新到文件`);
        } catch (error: any) {
          console.warn(`⚠️ [${runId}] Midscene 缓存刷新失败: ${error.message}`);
        }
      }

      console.log(`✅ [${runId}] Midscene Test Runner 资源清理完成`);
      this.addLog(runId, '✅ 资源清理完成', 'success');
    } catch (error: any) {
      console.error(`❌ [${runId}] 资源清理失败: ${error.message}`);
      this.addLog(runId, `❌ 资源清理失败: ${error.message}`, 'error');
    }
  }

  /**
   * 🔥 输出统计信息（由外部调用，在资源清理后统一输出）
   */
  async printStatistics(runId: string): Promise<void> {
    // 🔥 解析Midscene日志并输出详细统计到前端
    try {
      console.log(`✅ [${runId}] 正在解析Midscene日志...`);
      this.addLog(runId, `✅ 正在解析Midscene日志，获取详细统计...`, 'info');
      
      // 🔥 等待更长时间，确保 Midscene 将日志刷新到文件
      // Midscene 在测试结束时会调用 cache.flush()，需要等待文件写入完成
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // 🔥 传递执行开始时间，只统计本次执行的日志
      const logSummary = await this.logParser.parseLogForRun(runId, this.executionStartTime || undefined);
      
      if (logSummary) {
        // 输出到前端：同时发送简洁和详细两种格式
        // 简洁格式（无标记）
        const compactSummary = this.logParser.formatSummary(logSummary, {
          testCaseId: this.testCaseId || undefined,
          executionId: runId,
          detailed: false
        });
        this.addLog(runId, compactSummary, 'info');
        
        // 详细格式（添加特殊标记）
        const detailedSummary = this.logParser.formatSummary(logSummary, {
          testCaseId: this.testCaseId || undefined,
          executionId: runId,
          detailed: true
        });
        // 🔥 添加特殊标记，让前端知道这是详细版本
        this.addLog(runId, `[DETAILED_STATS]\n${detailedSummary}`, 'info');
        
        console.log(`✅ [${runId}] Midscene日志解析完成`);
      } else {
        console.log(`⚠️ [${runId}] 未找到Midscene日志文件或解析失败`);
        this.addLog(runId, `⚠️ 未找到Midscene日志文件，详细统计不可用`, 'warning');
      }
    } catch (error: any) {
      console.error(`❌ [${runId}] 解析Midscene日志失败:`, error.message);
      this.addLog(runId, `❌ 解析Midscene日志失败: ${error.message}`, 'error');
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
   * 添加日志（发送到前端）
   */
  private addLog(runId: string, message: string, level: 'info' | 'warning' | 'error' | 'success' = 'info'): void {
    if (this.logCallback) {
      this.logCallback(message, level);
    }
  }
}
