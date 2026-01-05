import { PlaywrightMcpClient } from './mcpClient.js';
import { llmConfigManager, LLMConfigManager } from '../../src/services/llmConfigManager.js';
import { ProxyAgent } from 'undici';
import type { LLMConfig } from '../../src/types/llm.js';
import crypto from 'crypto'; // 🔥 用于生成缓存key
import { PrismaClient } from '../../src/generated/prisma/index.js'; // 🔥 数据库持久化

// 🔥 重新导出类型以便向后兼容
export type { LLMConfig } from '../../src/types/llm.js';

export interface AIParseResult {
  success: boolean;
  steps: TestStep[];
  error?: string;
}

export interface AINextStepParseResult {
  success: boolean;
  step?: TestStep;
  remaining?: string;
  error?: string;
}

export interface TestStep {
  id: string;
  action: string;
  description: string;
  order: number;  // 🔥 添加：步骤顺序
  selector?: string;
  value?: string;
  url?: string;
  condition?: string;
  text?: string;
  timeout?: number;
  element?: string;  // 🔥 新增：元素的人类可读描述
  ref?: string;      // 🔥 新增：元素的精确引用
  stepType?: 'operation' | 'assertion';  // 🔥 新增：步骤类型标记
  // 🔥 新增：滚动操作参数
  pixels?: number;   // 滚动像素数
  direction?: 'up' | 'down' | 'left' | 'right';  // 滚动方向
  x?: number;        // 水平滚动距离
  y?: number;        // 垂直滚动距离
  // 🔥 新增：页签切换参数
  tabTarget?: string;    // 页签目标（标题、URL片段或索引）
  tabMatchType?: 'title' | 'url' | 'index' | 'last' | 'first';  // 匹配方式
}

export interface MCPCommand {
  name: string;
  arguments: Record<string, any>;
}

export class AITestParser {
  private mcpClient: PlaywrightMcpClient;
  private prisma: PrismaClient; // 🔥 数据库客户端
  
  // 🔥 L1缓存：断言解析缓存（内存）
  private assertionCache: Map<string, MCPCommand & { assertion?: any }> = new Map();
  private cacheMaxSize = 100; // 最大缓存数量
  
  // 🔥 L1缓存：操作步骤解析缓存（内存）
  private operationCache: Map<string, MCPCommand> = new Map();
  private operationCacheMaxSize = 200; // 操作缓存通常更大
  
  // 🔥 缓存统计
  private cacheStats = {
    assertionHits: 0,
    assertionMisses: 0,
    operationHits: 0,
    operationMisses: 0
  };
  
  // 🔥 持久化配置
  private enablePersistence: boolean;
  private cacheTTL = 7 * 24 * 60 * 60 * 1000; // 默认7天过期
  private syncInterval: NodeJS.Timeout | null = null;
  
  private configManager: LLMConfigManager;
  private useConfigManager: boolean;
  private legacyConfig: LLMConfig | null = null; // 🔥 存储传统模式下的配置

  constructor(mcpClient: PlaywrightMcpClient, llmConfig?: LLMConfig, options?: { persistence?: boolean }) {
    this.mcpClient = mcpClient;
    this.prisma = new PrismaClient();
    this.configManager = llmConfigManager;
    this.enablePersistence = options?.persistence !== false; // 默认启用持久化

    // 如果提供了llmConfig，使用传统模式；否则使用配置管理器
    this.useConfigManager = !llmConfig;

    if (llmConfig) {
      // 传统模式：使用传入的配置
      this.legacyConfig = llmConfig; // 🔥 存储配置以便后续使用
      console.log('🤖 AI解析器启用 (传统模式)，模型:', llmConfig.model);
    } else {
      // 配置管理器模式：使用动态配置
      console.log('🤖 AI解析器启用 (配置管理器模式) - 延迟初始化');
    }
    
    // 🔥 初始化缓存持久化
    if (this.enablePersistence) {
      console.log('💾 AI解析缓存持久化已启用');
      this.loadCachesFromDatabase().catch(err => {
        console.error('❌ 从数据库加载AI缓存失败:', err);
      });
      
      // 定期同步缓存到数据库（每10分钟）
      this.startPeriodicSync();
    }
  }

  /**
   * 初始化配置管理器
   */
  private async initializeConfigManager(): Promise<void> {
    try {
      if (!this.configManager.isReady()) {
        await this.configManager.initialize();
      }

      const summary = this.configManager.getConfigSummary();
      console.log(`🔧 AI解析器配置已加载: ${summary.modelName} (${summary.provider})`);
      console.log(`   温度: ${summary.temperature}, 最大令牌: ${summary.maxTokens}`);

      // 监听配置变更
      this.configManager.addConfigChangeListener((event) => {
        console.log(`🔄 AI解析器配置已更新: ${event.type} - ${event.modelInfo.name}`);
        if (event.type === 'model_changed') {
          console.log(`   模型切换: ${event.oldConfig?.model || '未知'} → ${event.newConfig.model}`);
        }
      });

    } catch (error) {
      console.error('❌ AI解析器配置管理器初始化失败:', error);
      // 回退到默认配置
      this.useConfigManager = false;
    }
  }

  /**
   * 获取当前LLM配置
   */
  private async getCurrentConfig(): Promise<LLMConfig> {
    if (this.useConfigManager) {
      // 🔥 修复：添加超时和错误处理，避免配置管理器卡住整个服务
      try {
        // 如果配置管理器还没准备好，等待初始化完成（带超时）
        if (!this.configManager.isReady()) {
          console.log('⏳ 配置管理器未就绪，开始初始化...');

          // 使用Promise.race添加超时机制
          await Promise.race([
            this.initializeConfigManager(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('配置管理器初始化超时')), 5000)
            )
          ]);
        }

        if (this.configManager.isReady()) {
          const config = this.configManager.getCurrentConfig();
          console.log(`🔧 使用配置管理器配置: ${config.model}`);
          return config;
        }
      } catch (error) {
        console.error('❌ 配置管理器初始化失败，回退到默认配置:', error.message);
        this.useConfigManager = false;
      }
    }

    // 回退到默认配置(从环境变量读取)
    const defaultConfig = {
      apiKey: process.env.OPENROUTER_API_KEY || '',
      baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
      model: process.env.DEFAULT_MODEL || 'openai/gpt-4o',
      temperature: parseFloat(process.env.DEFAULT_TEMPERATURE || '0.3'),
      maxTokens: parseInt(process.env.DEFAULT_MAX_TOKENS || '1500')
    };
    console.log(`⚠️ 使用默认配置: ${defaultConfig.model}`);
    return defaultConfig;
  }

  /**
   * 重新加载配置（无需重启服务）
   */
  public async reloadConfiguration(): Promise<void> {
    if (this.useConfigManager) {
      try {
        await this.configManager.reloadConfig();
        const summary = this.configManager.getConfigSummary();
        console.log(`🔄 AI解析器配置已重新加载: ${summary.modelName}`);
      } catch (error) {
        console.error('❌ 重新加载AI解析器配置失败:', error);
      }
    } else {
      console.log('⚠️ AI解析器使用传统模式，无法重新加载配置');
    }
  }

  /**
   * 从模型字符串中解析 provider 信息
   * 例如: "openai/gpt-4o" -> "OpenAI", "deepseek/deepseek-chat" -> "DeepSeek"
   */
  private parseProviderFromModel(modelString: string): string {
    if (!modelString) return '未知';
    
    // 尝试从 modelRegistry 中查找匹配的模型
    try {
      // 动态导入 modelRegistry（避免循环依赖）
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { modelRegistry } = require('../../src/services/modelRegistry.js');
      const allModels = modelRegistry.getAllModels();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const matchedModel = allModels.find((m: any) => m.openRouterModel === modelString);
      if (matchedModel) {
        return matchedModel.provider;
      }
    } catch {
      // 如果无法加载 modelRegistry，继续使用字符串解析
    }

    // 如果找不到匹配的模型，从字符串中解析 provider
    // 格式通常是 "provider/model-name"
    const parts = modelString.split('/');
    if (parts.length >= 2) {
      const providerPart = parts[0].toLowerCase();
      // 将常见的 provider 名称转换为友好的显示名称
      const providerMap: Record<string, string> = {
        'openai': 'OpenAI',
        'deepseek': 'DeepSeek',
        'anthropic': 'Anthropic',
        'google': 'Google',
        'meta': 'Meta',
        'mistralai': 'Mistral AI',
        'cohere': 'Cohere',
        'perplexity': 'Perplexity',
        'qwen': 'Qwen',
        '01-ai': '01.AI'
      };
      return providerMap[providerPart] || parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    }
    
    return '未知';
  }

  /**
   * 🔥 生成操作缓存Key
   */
  private generateOperationCacheKey(stepDescription: string, pageElements: string): string {
    const normalizedDesc = stepDescription.toLowerCase().trim();
    // 生成页面元素指纹（只包含核心元素，避免因动态内容变化导致缓存失效）
    const elementsHash = crypto
      .createHash('md5')
      .update(pageElements.substring(0, 500)) // 只取前500字符
      .digest('hex')
      .substring(0, 8);
    
    return `${normalizedDesc}::${elementsHash}`;
  }

  /**
   * 🔥 设置操作缓存
   */
  private setOperationCache(cacheKey: string, command: MCPCommand): void {
    // 如果缓存已满，删除最早的一半
    if (this.operationCache.size >= this.operationCacheMaxSize) {
      const keysToDelete = Array.from(this.operationCache.keys()).slice(0, Math.floor(this.operationCacheMaxSize / 2));
      keysToDelete.forEach(key => this.operationCache.delete(key));
      console.log(`🗑️ 操作缓存已满，清理了 ${keysToDelete.length} 条旧缓存`);
    }

    this.operationCache.set(cacheKey, command);
    console.log(`💾 操作结果已缓存 (当前: ${this.operationCache.size}/${this.operationCacheMaxSize})`);
  }

  /**
   * 🔥 获取缓存统计信息
   */
  public getCacheStats(): {
    operation: { hits: number; misses: number; size: number; hitRate: string };
    assertion: { hits: number; misses: number; size: number; hitRate: string };
  } {
    const operationTotal = this.cacheStats.operationHits + this.cacheStats.operationMisses;
    const assertionTotal = this.cacheStats.assertionHits + this.cacheStats.assertionMisses;

    return {
      operation: {
        hits: this.cacheStats.operationHits,
        misses: this.cacheStats.operationMisses,
        size: this.operationCache.size,
        hitRate: operationTotal > 0 
          ? `${((this.cacheStats.operationHits / operationTotal) * 100).toFixed(2)}%`
          : 'N/A'
      },
      assertion: {
        hits: this.cacheStats.assertionHits,
        misses: this.cacheStats.assertionMisses,
        size: this.assertionCache.size,
        hitRate: assertionTotal > 0
          ? `${((this.cacheStats.assertionHits / assertionTotal) * 100).toFixed(2)}%`
          : 'N/A'
      }
    };
  }

  /**
   * 🔥 清空所有缓存
   */
  public clearAllCaches(): void {
    this.operationCache.clear();
    this.assertionCache.clear();
    console.log('🗑️ 已清空所有AI解析缓存');
  }

  /**
   * 获取当前模型信息（用于日志和调试）- 同步版本
   */
  public getCurrentModelInfo(): { modelName: string; provider: string; mode: string } {
    // 🔥 修复：在配置管理器模式下，尝试获取配置管理器的模型信息
    if (this.useConfigManager) {
      try {
        // 即使配置管理器未完全就绪，也尝试获取配置（可能已经在初始化过程中有配置）
        if (this.configManager.isReady()) {
          const summary = this.configManager.getConfigSummary();
          // 只有在获取到有效配置时才使用
          if (summary && summary.modelName && summary.modelName !== '未初始化') {
            return {
              modelName: summary.modelName,
              provider: summary.provider,
              mode: '配置管理器模式'
            };
          }
        }
        // 如果配置管理器未就绪或配置无效，尝试直接读取后端设置
        // 注意：这里不能等待异步操作，所以只能尝试同步获取
      } catch (error) {
        console.warn('⚠️ 获取配置管理器模型信息失败，尝试其他方式:', error);
      }
    }
    
    // 回退方案：从实际配置中获取模型信息
    const config = this.legacyConfig || {
      model: process.env.DEFAULT_MODEL || 'openai/gpt-4o',
    };
    
    const modelString = config.model;
    const provider = this.parseProviderFromModel(modelString);
    
    return {
      modelName: modelString,
      provider: provider,
      mode: this.useConfigManager ? '配置管理器模式（未就绪）' : '传统模式'
    };
  }

  /**
   * 获取当前模型信息（异步版本，确保配置管理器已初始化）
   */
  public async getCurrentModelInfoAsync(): Promise<{ modelName: string; provider: string; mode: string }> {
    // 🔥 修复：在配置管理器模式下，确保配置管理器已初始化
    if (this.useConfigManager) {
      try {
        // 如果配置管理器未就绪，尝试初始化
        if (!this.configManager.isReady()) {
          console.log('⏳ 配置管理器未就绪，开始初始化...');
          try {
            await Promise.race([
              this.initializeConfigManager(),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('配置管理器初始化超时')), 5000)
              )
            ]);
          } catch (error) {
            console.warn('⚠️ 配置管理器初始化失败，使用回退方案:', error);
          }
        }

        // 再次尝试获取配置
        if (this.configManager.isReady()) {
          const summary = this.configManager.getConfigSummary();
          if (summary && summary.modelName && summary.modelName !== '未初始化') {
            return {
              modelName: summary.modelName,
              provider: summary.provider,
              mode: '配置管理器模式'
            };
          }
        }
      } catch (error) {
        console.warn('⚠️ 获取配置管理器模型信息失败:', error);
      }
    }

    // 回退方案：从实际配置中获取模型信息
    const config = this.legacyConfig || {
      model: process.env.DEFAULT_MODEL || 'openai/gpt-4o',
    };
    
    const modelString = config.model;
    const provider = this.parseProviderFromModel(modelString);
    
    return {
      modelName: modelString,
      provider: provider,
      mode: this.useConfigManager ? '配置管理器模式（未就绪）' : '传统模式'
    };
  }

  /**
   * 检查配置管理器是否可用
   */
  public isConfigManagerMode(): boolean {
    return this.useConfigManager && this.configManager.isReady();
  }

  /**
   * 获取详细的模型配置信息（异步版本，用于详细日志）
   */
  public async getDetailedModelInfoAsync(): Promise<{
    modelName: string;
    modelId: string;
    provider: string;
    mode: string;
    baseUrl: string;
    apiModel: string;
    apiKeyStatus: string;
    temperature: number;
    maxTokens: number;
    costLevel: string;
    capabilities: string[];
    apiFormat: 'openai' | 'ollama';
    isInitialized: boolean;
  }> {
    // 确保配置管理器已初始化
    if (this.useConfigManager) {
      try {
        if (!this.configManager.isReady()) {
          console.log('⏳ 配置管理器未就绪，开始初始化...');
          try {
            await Promise.race([
              this.initializeConfigManager(),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('配置管理器初始化超时')), 5000)
              )
            ]);
          } catch (error) {
            console.warn('⚠️ 配置管理器初始化失败，使用回退方案:', error);
          }
        }

        if (this.configManager.isReady()) {
          const summary = this.configManager.getConfigSummary();
          const config = this.configManager.getCurrentConfig();
          
          if (summary && summary.modelName && summary.modelName !== '未初始化') {
            return {
              modelName: summary.modelName,
              modelId: summary.modelId,
              provider: summary.provider,
              mode: '配置管理器模式',
              baseUrl: config.baseUrl,
              apiModel: config.model,
              apiKeyStatus: config.apiKey ? `已设置 (${config.apiKey.slice(0, 8)}...)` : '未设置',
              temperature: summary.temperature,
              maxTokens: summary.maxTokens,
              costLevel: summary.costLevel,
              capabilities: summary.capabilities,
              apiFormat: config.apiFormat || 'openai',
              isInitialized: summary.isInitialized
            };
          }
        }
      } catch (error) {
        console.warn('⚠️ 获取配置管理器详细信息失败:', error);
      }
    }

    // 回退方案：从实际配置中获取模型信息
    const config = this.legacyConfig || {
      model: process.env.DEFAULT_MODEL || 'openai/gpt-4o',
      baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY || '',
      temperature: parseFloat(process.env.DEFAULT_TEMPERATURE || '0.3'),
      maxTokens: parseInt(process.env.DEFAULT_MAX_TOKENS || '4000'),
      apiFormat: 'openai' as const
    };
    
    const provider = this.parseProviderFromModel(config.model);
    
    return {
      modelName: config.model,
      modelId: config.model,
      provider: provider,
      mode: this.useConfigManager ? '配置管理器模式（未就绪）' : '传统模式',
      baseUrl: config.baseUrl,
      apiModel: config.model,
      apiKeyStatus: config.apiKey ? `已设置 (${config.apiKey.slice(0, 8)}...)` : '未设置',
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      costLevel: '未知',
      capabilities: [],
      apiFormat: config.apiFormat || 'openai',
      isInitialized: false
    };
  }

  /**
   * 基于MCP快照和用例描述，AI解析为可执行的步骤
   */
  async parseTestDescription(description: string, testName: string, runId: string, snapshot: any | null): Promise<AIParseResult> {
    try {
      // 将用例描述分割为步骤
      const steps = this.splitDescriptionToSteps(description);
      return { success: true, steps };
    } catch (error) {
      return { success: false, steps: [], error: `解析测试描述失败: ${error}` };
    }
  }

  /**
   * AI根据当前快照和下一条指令生成MCP命令
   */
  async parseNextStep(
    remainingStepsText: string, 
    snapshot: any | null, 
    runId: string,
    logCallback?: (message: string, level: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<AINextStepParseResult> {
    try {
      // 🔥 增强日志：打印完整的剩余步骤
      console.log(`\n🔍 [${runId}] ===== AI解析步骤开始 =====`);
      console.log(`📋 [${runId}] 剩余步骤文本:\n${remainingStepsText}`);

      if (!remainingStepsText?.trim()) {
        console.log(`❌ [${runId}] 没有剩余步骤，解析结束`);
        return { success: false, error: "没有剩余步骤" };
      }

      // 🔥 修复：更智能的步骤分割，处理数字编号的步骤
      const lines = remainingStepsText.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      if (lines.length === 0) {
        console.log(`❌ [${runId}] 没有有效步骤，解析结束`);
        return { success: false, error: "没有有效步骤" };
      }

      // 🔥 增强日志：打印所有拆分的步骤
      console.log(`📊 [${runId}] 拆分后的步骤数量: ${lines.length}`);
      lines.forEach((line, index) => {
        console.log(`   ${index + 1}. "${line}"`);
      });

      // 🔥 修复：确保正确提取当前步骤并计算剩余步骤
      let nextStepText = lines[0].trim();

      // 🔥 增强：移除各种步骤编号格式（中文标点、英文标点、无标点等）
      // 匹配模式：数字 + 可选的标点符号(、。.：:) + 可选空格
      nextStepText = nextStepText.replace(/^(?:\d+\s*[、。\.\)\:]?\s*|步骤\s*\d+\s*[、。\.\)\:]?\s*)/i, '').trim();

      console.log(`🔄 [${runId}] 原始步骤: "${lines[0]}"`);
      console.log(`🔄 [${runId}] 清理后步骤: "${nextStepText}"`);

      // 🔥 关键修复：确保剩余步骤正确计算
      const remaining = lines.slice(1).join('\n').trim();

      console.log(`🎯 [${runId}] 当前解析步骤: "${nextStepText}"`);
      console.log(`📊 [${runId}] 剩余步骤数: ${lines.length - 1}`);
      console.log(`📋 [${runId}] 剩余步骤内容: "${remaining}"`)

      // 🔥 增强日志：打印页面快照状态
      if (snapshot) {
        const snapshotLines = snapshot.split('\n');
        console.log(`📸 [${runId}] 页面快照状态: ${snapshotLines.length}行`);

        // 提取页面URL和标题
        const urlMatch = snapshot.match(/Page URL: ([^\n]+)/);
        const titleMatch = snapshot.match(/Page Title: ([^\n]+)/);

        if (urlMatch) console.log(`   🌐 URL: ${urlMatch[1]}`);
        if (titleMatch) console.log(`   📄 标题: ${titleMatch[1]}`);

        // 统计元素
        const elementTypes = ['textbox', 'button', 'link', 'input', 'checkbox', 'radio', 'combobox'];
        const foundTypes = elementTypes
          .map(type => {
            const count = (snapshot.match(new RegExp(type, 'g')) || []).length;
            return count > 0 ? `${type}(${count})` : null;
          })
          .filter(Boolean);

        if (foundTypes.length > 0) {
          console.log(`   🔍 页面元素: ${foundTypes.join(', ')}`);
        } else {
          console.log(`   ⚠️ 未在快照中发现常见交互元素`);
        }
      } else {
        console.log(`⚠️ [${runId}] 无页面快照可用，将使用默认解析策略`);
      }

      // AI模拟：基于当前步骤文本和快照生成MCP命令，传递 runId 和日志回调
      const mcpCommand = await this.generateMCPCommand(nextStepText, snapshot, runId, logCallback);

      // 🔥 增强日志：打印解析结果
      console.log(`🤖 [${runId}] AI解析结果:`);
      console.log(`   🎯 操作类型: ${mcpCommand.name}`);
      console.log(`   📋 参数: ${JSON.stringify(mcpCommand.arguments, null, 2)}`);

      const step: TestStep = {
        id: `step-${Date.now()}`,
        action: mcpCommand.name,
        description: nextStepText,
        order: 0,
        stepType: 'operation',  // 🔥 标记为操作步骤
        ...mcpCommand.arguments
      };

      console.log(`✅ [${runId}] AI解析步骤完成: ${step.action} - ${step.description}`);
      console.log(`📋 [${runId}] 返回剩余步骤: "${remaining}"`);
      console.log(`🔍 [${runId}] ===== AI解析步骤结束 =====\n`);

      // 🔥 关键修复：确保返回正确的剩余步骤
      return { success: true, step, remaining: remaining || '' };
    } catch (error) {
      // 🔥 修复：不再在这里记录错误，因为 callLLM 已经记录过了，避免重复打印
      // 直接返回错误，让上层处理
      return { success: false, error: `解析下一步骤失败: ${error}` };
    }
  }

  /**
   * AI根据快照和断言描述生成断言命令
   * @param assertionsText 断言文本
   * @param snapshot 页面快照
   * @param runId 运行ID
   * @param logCallback 可选的日志回调函数，用于记录到前端日志
   */
  async parseAssertions(
    assertionsText: string, 
    snapshot: any, 
    runId: string,
    logCallback?: (message: string, level: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<AIParseResult> {
    try {
      if (!assertionsText?.trim()) {
        return { success: true, steps: [] };
      }

      const assertionLines = assertionsText.split('\n').filter(line => line.trim());
      const steps: TestStep[] = [];

      for (let i = 0; i < assertionLines.length; i++) {
        const assertionText = assertionLines[i].trim();
        const mcpCommand = await this.generateAssertionCommand(assertionText, snapshot, runId, logCallback);

        // 🔥 构建步骤，包含结构化断言信息
        const step: TestStep = {
          id: `assertion-${i + 1}`,
          action: mcpCommand.name as any,
          description: assertionText,
          order: i + 1,  // 🔥 添加order字段
          stepType: 'assertion',  // 🔥 标记为断言步骤
          ...mcpCommand.arguments
        };

        // 🔥 如果AI返回了结构化断言信息，添加到步骤中
        if (mcpCommand.assertion) {
          step.element = mcpCommand.assertion.element;
          step.ref = mcpCommand.assertion.ref;
          step.condition = mcpCommand.assertion.condition || 'visible';
          step.value = mcpCommand.assertion.value;
          step.selector = mcpCommand.assertion.selector;
          
          console.log(`✅ [${runId}] 断言 ${i + 1} 结构化信息:`, {
            element: step.element,
            ref: step.ref,
            condition: step.condition,
            value: step.value
          });
        }

        steps.push(step);
      }

      return { success: true, steps };
    } catch (error) {
      return { success: false, steps: [], error: `解析断言失败: ${error}` };
    }
  }

  /**
   * 将用例描述分割为步骤
   */
  private splitDescriptionToSteps(description: string): TestStep[] {
    if (!description?.trim()) return [];

    const lines = description.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    return lines.map((line, index) => ({
      id: `step-${index + 1}`,
      action: 'pending', // 待AI解析
      description: line,
      order: index + 1
    }));
  }

  /**
   * 🔥 新增：检测页签切换指令
   */
  private detectTabSwitchCommand(stepDescription: string): MCPCommand | null {
    const text = stepDescription.toLowerCase().trim();
    
    // 页签切换模式匹配
    const patterns = [
      // 切换到最后一个页签
      { 
        regex: /切换到最后一?个?页签|切换页签到最后|打开最后一?个?页签|最后一?个?页签/, 
        type: 'last' 
      },
      // 切换到第一个页签
      { 
        regex: /切换到第一个页签|切换页签到第一|打开第一个页签|第一个页签/, 
        type: 'first' 
      },
      // 切换到新页签/新开的页签
      { 
        regex: /切换到新页签|切换到新开的?页签|打开新页签|新页签/, 
        type: 'last'  // 通常新页签是最后一个
      },
      // 切换到指定索引的页签（如：切换到第2个页签）
      { 
        regex: /切换到第(\d+)个页签|切换页签到第(\d+)|打开第(\d+)个页签/, 
        type: 'index' 
      },
      // 切换到包含特定标题的页签
      { 
        regex: /切换到(.+?)页签|切换页签到(.+)|打开(.+?)页签/, 
        type: 'title' 
      }
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern.regex);
      if (match) {
        console.log(`🎯 匹配页签切换模式: ${pattern.type}, 原文: "${stepDescription}"`);
        
        switch (pattern.type) {
          case 'last':
            return {
              name: 'browser_tab_switch',
              arguments: {
                tabTarget: 'last',
                tabMatchType: 'last',
                description: stepDescription
              }
            };
            
          case 'first':
            return {
              name: 'browser_tab_switch',
              arguments: {
                tabTarget: 'first',
                tabMatchType: 'first',
                description: stepDescription
              }
            };
            
          case 'index':
            const indexMatch = match[1] || match[2] || match[3];
            return {
              name: 'browser_tab_switch',
              arguments: {
                tabTarget: indexMatch,
                tabMatchType: 'index',
                description: stepDescription
              }
            };
            
          case 'title':
            // 提取页签标题
            let titleTarget = match[1] || match[2] || match[3];
            if (titleTarget) {
              // 清理可能的干扰词
              titleTarget = titleTarget.replace(/(的|到|个|页签)$/, '').trim();
              return {
                name: 'browser_tab_switch',
                arguments: {
                  tabTarget: titleTarget,
                  tabMatchType: 'title',
                  description: stepDescription
                }
              };
            }
            break;
        }
      }
    }

    return null;  // 不是页签切换指令
  }

  /**
   * 🔥 真正的AI解析：根据步骤描述和快照生成MCP命令
   * @param stepDescription 步骤描述
   * @param snapshot 页面快照
   * @param runId 可选的运行ID，用于日志记录
   * @param logCallback 可选的日志回调函数，用于记录到前端日志
   */
  private async generateMCPCommand(
    stepDescription: string, 
    snapshot: any,
    runId?: string,
    logCallback?: (message: string, level: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<MCPCommand> {
    console.log(`🤖 使用AI解析操作: "${stepDescription}"`);

    try {
      // 🔥 新增：预处理页签切换指令
      const tabSwitchCommand = this.detectTabSwitchCommand(stepDescription);
      if (tabSwitchCommand) {
        console.log(`✅ 识别为页签切换指令: ${tabSwitchCommand.name}`);
        return tabSwitchCommand;
      }

      // 🔥 检查操作缓存（L1内存 + L2数据库）
      const pageElements = this.extractPageElements(snapshot);
      const pageElementsStr = typeof pageElements === 'string' ? pageElements : JSON.stringify(pageElements);
      const cacheKey = this.generateOperationCacheKey(stepDescription, pageElementsStr);
      
      // L1: 检查内存缓存
      let cachedCommand = this.operationCache.get(cacheKey);
      
      // L2: 如果内存没有，检查数据库
      if (!cachedCommand && this.enablePersistence) {
        cachedCommand = await this.getOperationFromDatabase(cacheKey);
        if (cachedCommand) {
          // 加载到内存缓存
          this.operationCache.set(cacheKey, cachedCommand);
          console.log(`💾 从数据库加载操作缓存`);
        }
      }
      
      if (cachedCommand) {
        // 🔥 修复：验证缓存的命令是否有效，过滤掉error类型的无效缓存
        const invalidCommands = ['error', 'unknown', 'invalid', 'failed', 'undefined', 'null', ''];
        if (invalidCommands.includes(cachedCommand.name?.toLowerCase() || '')) {
          console.log(`⚠️ 检测到无效的缓存命令 (name=${cachedCommand.name})，跳过缓存，重新AI解析`);
          if (logCallback) {
            logCallback(`⚠️ 缓存命令无效，重新AI解析`, 'warning');
          }
          // 从缓存中删除无效条目
          this.operationCache.delete(cacheKey);
          if (this.enablePersistence) {
            this.deleteOperationCacheFromDatabase(cacheKey).catch(() => {});
          }
        } else {
          this.cacheStats.operationHits++;
          console.log(`⚡ 使用缓存的操作解析结果，跳过AI调用`);
          if (logCallback) {
            logCallback(`⚡ 使用缓存的解析结果 (命中${this.cacheStats.operationHits}次)`, 'info');
          }
          // 异步更新命中统计
          if (this.enablePersistence) {
            this.updateOperationHitCount(cacheKey).catch(() => {});
          }
          return cachedCommand;
        }
      }
      
      this.cacheStats.operationMisses++;

      // 1. 提取页面元素
      // const pageElements = this.extractPageElements(snapshot); // 已在上面提取

      // 2. 构建操作专用的用户提示词
      const userPrompt = this.buildOperationUserPrompt(stepDescription, pageElements);

      // 3. 调用AI模型（操作模式），传递 runId 和日志回调
      const aiResponse = await this.callLLM(userPrompt, 'operation', runId, logCallback);

      // 4. 解析AI响应
      const mcpCommand = this.parseAIResponse(aiResponse);

      console.log(`✅ AI操作解析成功: ${mcpCommand.name}`);
      
      // 🔥 修复：验证命令有效性，只缓存有效命令
      const invalidCommands = ['error', 'unknown', 'invalid', 'failed', 'undefined', 'null', ''];
      if (!invalidCommands.includes(mcpCommand.name?.toLowerCase() || '')) {
        // 🔥 将结果存入缓存（L1内存 + L2数据库）
        await this.setOperationCache(cacheKey, mcpCommand, stepDescription, pageElementsStr);
      } else {
        console.log(`⚠️ 检测到无效的AI解析结果 (name=${mcpCommand.name})，跳过缓存`);
      }
      
      return mcpCommand;

    } catch (error: any) {
      // 🔥 修复：不再在这里记录错误，因为 callLLM 已经记录过了，避免重复打印
      // 直接抛出错误，让上层处理
      throw new Error(`AI操作解析失败: ${error.message}`);
    }
  }

  /**
   * 🔥 过滤快照中的非功能性错误
   */
  private filterSnapshotErrors(snapshot: any): any {
    if (typeof snapshot === 'string') {
      console.log(`🧹 开始过滤快照中的Console错误...`);

      // 统计过滤前的错误数量
      const errorCountBefore = (snapshot.match(/TypeError:|ReferenceError:|SyntaxError:/g) || []).length;

      // 过滤常见的JavaScript错误
      let filteredSnapshot = snapshot
        // 过滤 getComputedStyle 错误
        .replace(/- TypeError: Failed to execute 'getComputedStyle'[^\n]*/g, '')
        // 过滤 Cannot read properties 错误
        .replace(/- TypeError: Cannot read properties of undefined[^\n]*/g, '')
        // 过滤其他常见TypeError
        .replace(/- TypeError:[^\n]*/g, '')
        // 过滤 ReferenceError
        .replace(/- ReferenceError:[^\n]*/g, '')
        // 过滤 SyntaxError
        .replace(/- SyntaxError:[^\n]*/g, '')
        // 过滤错误堆栈信息
        .replace(/at [a-zA-Z]+ \(https?:\/\/[^\)]+\)[^\n]*/g, '')
        // 过滤空的 "..." 占位符
        .replace(/\.\.\.[^\n]*\n/g, '')
        // 清理多余的空行
        .replace(/\n\n+/g, '\n\n');

      // 如果 "New console messages" 部分为空,则整个移除
      filteredSnapshot = filteredSnapshot.replace(/### New console messages\n+###/g, '');

      // 统计过滤后的错误数量
      const errorCountAfter = (filteredSnapshot.match(/TypeError:|ReferenceError:|SyntaxError:/g) || []).length;
      const filteredCount = errorCountBefore - errorCountAfter;

      if (filteredCount > 0) {
        console.log(`✅ 已过滤 ${filteredCount} 个Console错误，剩余 ${errorCountAfter} 个`);
      } else {
        console.log(`ℹ️ 快照中没有发现需要过滤的Console错误`);
      }

      return filteredSnapshot;
    }
    return snapshot;
  }

  /**
   * 🔥 真正的AI解析：根据断言描述和快照生成断言命令
   * @param assertionDescription 断言描述
   * @param snapshot 页面快照
   * @param runId 可选的运行ID，用于日志记录
   * @param logCallback 可选的日志回调函数，用于记录到前端日志
   */
  private async generateAssertionCommand(
    assertionDescription: string, 
    snapshot: any,
    runId?: string,
    logCallback?: (message: string, level: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<MCPCommand & { assertion?: any }> {
    try {
      // 1. 🔥 过滤快照中的非功能性错误
      const filteredSnapshot = this.filterSnapshotErrors(snapshot);

      // 2. 提取页面元素（使用过滤后的快照）
      const pageElements = this.extractPageElements(filteredSnapshot);

      // 3. 🔥 生成缓存 key
      const pageFingerprint = this.generatePageFingerprint(pageElements);
      const cacheKey = this.generateCacheKey(assertionDescription, pageFingerprint);

      // 4. 🔥 检查缓存（L1内存 + L2数据库）
      let cachedResult = this.assertionCache.get(cacheKey);
      
      // L2: 如果内存没有，检查数据库
      if (!cachedResult && this.enablePersistence) {
        cachedResult = await this.getAssertionFromDatabase(cacheKey);
        if (cachedResult) {
          // 加载到内存缓存
          this.assertionCache.set(cacheKey, cachedResult);
          console.log(`💾 从数据库加载断言缓存`);
        }
      }
      
      if (cachedResult) {
        console.log(`✅ 使用缓存的断言解析结果: "${assertionDescription}" (指纹: ${pageFingerprint})`);
        if (logCallback) {
          logCallback(`✅ 使用缓存的断言解析结果（避免重复 AI 调用）`, 'info');
        }
        // 异步更新命中统计
        if (this.enablePersistence) {
          this.updateAssertionHitCount(cacheKey).catch(() => {});
        }
        return cachedResult;
      }

      console.log(`🤖 使用AI解析断言: "${assertionDescription}" (指纹: ${pageFingerprint})`);

      // 5. 构建断言专用的用户提示词
      const userPrompt = this.buildAssertionUserPrompt(assertionDescription, pageElements);

      // 6. 调用AI模型（断言模式），传递 runId 和日志回调
      const aiResponse = await this.callLLM(userPrompt, 'assertion', runId, logCallback);

      // 7. 解析AI响应（包含结构化断言信息）
      const mcpCommand = this.parseAIResponse(aiResponse);

      console.log(`✅ AI断言解析成功: ${mcpCommand.name}`);
      if (mcpCommand.assertion) {
        console.log(`📋 结构化断言信息:`, JSON.stringify(mcpCommand.assertion, null, 2));
      }

      // 8. 🔥 保存到缓存（L1内存 + L2数据库）
      await this.cleanupCache(); // 清理旧缓存
      await this.setAssertionCache(cacheKey, mcpCommand, assertionDescription, pageFingerprint);
      console.log(`💾 断言解析结果已缓存 (缓存数: ${this.assertionCache.size}/${this.cacheMaxSize})`);

      return mcpCommand;

    } catch (error: any) {
      // 🔥 修复：不再在这里记录错误，因为 callLLM 已经记录过了，避免重复打印
      // 直接抛出错误，让上层处理
      throw new Error(`AI断言解析失败: ${error.message}`);
    }
  }

  /**
   * 🔥 生成页面元素指纹（用于缓存 key）
   * 基于页面主要元素生成一个简短的哈希值
   */
  private generatePageFingerprint(pageElements: Array<{ ref: string, role: string, text: string }>): string {
    // 只使用前10个元素的 role 和 text 生成指纹
    const topElements = pageElements.slice(0, 10);
    const fingerprintData = topElements
      .map(el => `${el.role}:${el.text.substring(0, 20)}`) // 只取前20个字符
      .join('|');
    
    // 简单哈希（使用字符串长度和字符码之和）
    let hash = 0;
    for (let i = 0; i < fingerprintData.length; i++) {
      const char = fingerprintData.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    return Math.abs(hash).toString(36); // 转换为36进制字符串
  }

  /**
   * 🔥 生成缓存 key
   */
  private generateCacheKey(assertionDescription: string, pageFingerprint: string): string {
    return `${assertionDescription.trim()}::${pageFingerprint}`;
  }

  /**
   * 🔥 清理缓存（LRU 策略）
   */
  private cleanupCache(): void {
    if (this.assertionCache.size >= this.cacheMaxSize) {
      // 删除最早的 20% 缓存项
      const deleteCount = Math.floor(this.cacheMaxSize * 0.2);
      const keysToDelete = Array.from(this.assertionCache.keys()).slice(0, deleteCount);
      keysToDelete.forEach(key => this.assertionCache.delete(key));
      console.log(`🧹 清理断言缓存: 删除 ${deleteCount} 个旧缓存项，当前缓存数: ${this.assertionCache.size}`);
    }
  }

  /**
   * 🔥 清空所有缓存（公共方法）
   */
  public clearAssertionCache(): void {
    const size = this.assertionCache.size;
    this.assertionCache.clear();
    console.log(`🧹 已清空所有断言缓存 (清空 ${size} 个缓存项)`);
  }

  /**
   * 🔥 获取断言缓存的简单统计信息（重命名以避免方法冲突）
   */
  public getAssertionCacheInfo(): { size: number; maxSize: number; hitRate?: number } {
    return {
      size: this.assertionCache.size,
      maxSize: this.cacheMaxSize
    };
  }

  /**
   * 🔥 提取页面元素用于AI分析
   */
  private extractPageElements(snapshot: string): Array<{ ref: string, role: string, text: string }> {
    if (!snapshot) return [];

    const elements: Array<{ ref: string, role: string, text: string }> = [];
    const lines = snapshot.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();
      const refMatch = trimmedLine.match(/\[ref=([a-zA-Z0-9_-]+)\]/);

      if (refMatch) {
        const ref = refMatch[1];
        const textMatches = trimmedLine.match(/"([^"]*)"/g) || [];
        const texts = textMatches.map(t => t.replace(/"/g, ''));

        let role = '';
        if (trimmedLine.includes('textbox')) role = 'textbox';
        else if (trimmedLine.includes('button')) role = 'button';
        else if (trimmedLine.includes('link')) role = 'link';
        else if (trimmedLine.includes('checkbox')) role = 'checkbox';
        else if (trimmedLine.includes('combobox')) role = 'combobox';
        else role = 'element';

        // 🔥 修复：即使text为空也要包含元素（特别是输入框可能没有name）
        if (ref) {
          const text = texts.length > 0 ? texts[0] : '';
          elements.push({ ref, role, text });
        }
      }
    }

    return elements.slice(0, 100); // 🔥 放宽到前100个元素
  }

  /**
   * 🔥 获取操作模式的系统提示词
   */
  private getOperationSystemPrompt(): string {
    return `你是一个顶级的测试自动化AI专家。你的核心职责是：

# 身份与能力
- 将自然语言操作指令转换为精确的JSON格式MCP命令
- 基于页面元素快照进行智能元素定位和操作解析
- 专注于处理明确的用户操作指令（点击、输入、滚动等）

# 操作模式原则
- 你处于【操作模式】，只处理明确的操作指令
- 如果指令看起来像断言或验证，请返回错误信息
- 只有具体的操作指令才应该被转换为MCP命令

# 核心参数规则
- element参数：必须是简洁的中文描述（如"用户名输入框"、"提交按钮"）
- ref参数：必须使用页面元素列表中的确切ref值
- 两个参数都是必需的，缺一不可
- ElementUI下拉组件：包含"el-input__inner"的readonly输入框是下拉触发器

# 下拉操作策略
- 打开下拉（包含"点击"、"展开"关键词）：点击readonly输入框触发器
- 选择下拉选项（包含"选择"、"选中"关键词）：点击已展开的listitem选项
- 关键区别：操作意图词汇决定目标元素类型

# 输出格式要求
<THOUGHTS>
1. 分析操作意图：检查是否包含"选择"、"选中"等选择关键词，还是"点击"、"展开"等打开关键词
2. 定位匹配的页面元素：选择操作应找listitem元素，打开操作应找textbox元素
3. 判断操作类型：根据操作意图和元素类型选择对应命令
4. 生成element描述和ref参数
5. 处理变量（如果需要）
6. 构建对应的MCP命令
</THOUGHTS>
<COMMAND>
{
  "name": "命令名称",
  "args": {...}
}
</COMMAND>

# 支持的MCP操作命令
## 核心交互
- 点击: {"name": "browser_click", "args": {"element": "元素描述", "ref": "element_ref"}}
- 双击: {"name": "browser_double_click", "args": {"element": "元素描述", "ref": "element_ref"}}
- 悬停: {"name": "browser_hover", "args": {"element": "元素描述", "ref": "element_ref"}}
- 输入: {"name": "browser_type", "args": {"element": "输入框描述", "ref": "input_ref", "text": "content"}}
- 清空: {"name": "browser_clear_input", "args": {"element": "输入框描述", "ref": "input_ref"}}
- 选择: {"name": "browser_select_option", "args": {"element": "下拉框描述", "ref": "select_ref", "value": "option_value"}}
- ElementUI下拉操作：
  - 打开下拉（"点击下拉栏"）：点击readonly textbox触发器
  - 选择选项（"选择XXX"）：点击展开的listitem选项
  - 元素识别：textbox=触发器，listitem=选项
  - 不要对自定义下拉使用browser_select_option
- 按键: {"name": "browser_press_key", "args": {"key": "Enter"}}

## 页面控制
- 导航: {"name": "browser_navigate", "args": {"url": "URL"}}
- 刷新: {"name": "browser_refresh", "args": {}}
- 后退: {"name": "browser_go_back", "args": {}}
- 前进: {"name": "browser_go_forward", "args": {}}

## 滚动操作
- 向下滚动: {"name": "browser_scroll_down", "args": {"pixels": 500}}
- 向上滚动: {"name": "browser_scroll_up", "args": {"pixels": 500}}
- 滚动到顶部: {"name": "browser_scroll_to_top", "args": {}}
- 滚动到底部: {"name": "browser_scroll_to_bottom", "args": {}}
- 滚动到元素: {"name": "browser_scroll_to_element", "args": {"element": "元素描述", "ref": "element_ref"}}
- 按像素滚动: {"name": "browser_scroll_by", "args": {"x": 0, "y": 500}}
- 滚动页面: {"name": "browser_scroll_page", "args": {"direction": "down", "pixels": 500}}

## 数据提取
- 获取文本: {"name": "browser_get_text", "args": {"element": "元素描述", "ref": "element_ref", "variable_name": "变量名"}}
- 获取属性: {"name": "browser_get_attribute", "args": {"element": "元素描述", "ref": "element_ref", "attribute": "属性名", "variable_name": "变量名"}}
- 获取URL: {"name": "browser_get_url", "args": {"variable_name": "变量名"}}

## 高级控制
- 等待: {"name": "browser_wait_for", "args": {"timeout": milliseconds}}
- 截图: {"name": "browser_screenshot", "args": {}}
- 切换iframe: {"name": "browser_switch_to_frame", "args": {"element": "iframe描述", "ref": "iframe_ref"}}
- 切换回主页面: {"name": "browser_switch_to_default", "args": {}}
- 处理弹窗: {"name": "browser_handle_alert", "args": {"action": "accept"}}`;
  }

  /**
   * 🔥 构建操作模式的用户提示词
   */
  private buildOperationUserPrompt(stepDescription: string, pageElements: Array<{ ref: string, role: string, text: string }>): string {
    const elementsContext = pageElements.length > 0
      ? pageElements.map(el => `[ref=${el.ref}] ${el.role} "${el.text}"`).join('\n')
      : "当前页面没有可用的交互元素。";

    return `# 当前任务：操作模式

## 当前页面可用元素
${elementsContext}

## 用户操作指令
"${stepDescription}"

## 分析要求
请将上述操作指令转换为MCP命令：
1. 确认这是一个明确的操作指令（而非断言验证）
2. **必须严格执行的下拉选择判定**：
   - 如果指令包含"选择"、"选中"关键词 → **必须**点击listitem选项元素，**绝不**点击textbox
   - 如果指令包含"点击"、"展开"关键词且无"选择" → 点击textbox触发器元素
   - 示例：
     * "下拉栏选择生鲜" → 点击listitem[生鲜]，不是textbox
     * "点击下拉栏" → 点击textbox触发器
3. **强制元素类型匹配**：
   - 选择操作：必须使用listitem元素的ref
   - 打开操作：必须使用textbox元素的ref
4. 在页面元素中找到最匹配的目标元素（严格按元素类型）
5. 生成简洁的中文element描述和准确的ref参数

请开始分析：`;
  }

  /**
   * 🔥 根据模式获取系统提示词
   */
  private getSystemPromptByMode(mode: 'operation' | 'assertion' | 'relevance_check' | 'update_generation'): string {
    switch (mode) {
      case 'operation':
        return this.getOperationSystemPrompt();
      case 'assertion':
        return this.getAssertionSystemPrompt();
      case 'relevance_check':
        return this.getRelevanceCheckSystemPrompt();
      case 'update_generation':
        return this.getUpdateGenerationSystemPrompt();
      default:
        return this.getOperationSystemPrompt();
    }
  }

  /**
   * 🔥 获取相关性检查的系统提示词
   */
  private getRelevanceCheckSystemPrompt(): string {
    return `你是一个专业的测试用例相关性分析AI专家。你的核心职责是：

# 身份与能力
- 精确分析测试用例与变更描述之间的相关性
- 基于功能、操作、UI元素、业务流程等多维度进行关联性判断
- 提供可信的相关性评分和详细的分析理由

# 分析原则
- **语义理解优先**：理解变更的实际业务含义，而不仅仅是关键词匹配
- **多维度评估**：从功能、操作、UI元素、业务流程等角度综合分析
- **细粒度判断**：即使是间接相关的情况也要准确识别和评分
- **准确性优先**：宁可保守评估，确保相关性判断的准确性

# 评分标准
- **0.9-1.0**: 直接相关，测试用例明确覆盖变更内容
- **0.7-0.8**: 高度相关，测试用例涉及变更影响的主要功能  
- **0.5-0.6**: 中度相关，测试用例可能受变更间接影响
- **0.3-0.4**: 低度相关，测试用例与变更有轻微关联
- **0.0-0.2**: 不相关，测试用例与变更无明显关联

# 输出要求
- 必须输出标准的JSON格式
- is_relevant字段：当相关性评分≥0.3时为true，否则为false
- relevance_score字段：0.0到1.0之间的数值
- recall_reason字段：详细说明相关性分析的依据和理由

# 分析思路
1. 解析变更描述的核心要素（功能、操作、UI元素等）
2. 分析测试用例覆盖的功能和操作流程
3. 识别两者之间的直接和间接关联
4. 综合评估相关性程度并给出评分
5. 提供清晰的分析理由`;
  }

  /**
   * 🔥 获取更新生成的系统提示词
   */
  private getUpdateGenerationSystemPrompt(): string {
    return `你是一个专业的测试用例自动化更新AI专家。你的核心职责是：

# 身份与能力
- 基于变更描述精确生成测试用例的JSON Patch修改方案
- 深度理解测试步骤的语义和业务逻辑
- 评估修改带来的副作用和风险等级
- 生成符合JSON Patch RFC 6902标准的修改指令

# 更新原则
- **精确定位**：仅修改与变更描述直接相关的测试步骤，不相关的步骤必须保持原样
- **内容保护**：除了步骤编号调整外，未涉及修改的步骤内容必须完全保持不变
- **语义保持**：确保更新后的测试步骤语义合理，逻辑连贯
- **最小变更**：只修改必要的部分，严格避免过度修改或无关修改
- **风险评估**：准确评估每个修改的潜在影响和风险等级
- **可回滚性**：生成的patch操作应该是可逆的

# JSON Patch操作类型
- **replace**: 替换现有值，格式 {"op":"replace", "path":"/steps/0/description", "value":"新描述"}
- **add**: 添加新字段，格式 {"op":"add", "path":"/steps/0/newField", "value":"新值"}  
- **remove**: 删除字段，格式 {"op":"remove", "path":"/steps/0/oldField"}

# 路径格式规范
- 步骤描述：/steps/索引/description
- 预期结果：/steps/索引/expectedResult
- 操作类型：/steps/索引/action
- 元素定位：/steps/索引/selector
- 输入值：/steps/索引/value

# 风险等级标准
- **low**: 简单文本修改，不影响业务逻辑
- **medium**: 涉及步骤顺序调整或重要参数修改
- **high**: 大幅修改测试逻辑或可能影响其他用例

# 重要约束条件
- **严格限制修改范围**：只能修改与变更描述明确相关的步骤
- **步骤编号例外**：当插入或删除步骤时，允许调整后续步骤的编号以保持连续性
- **内容完整性**：不相关步骤的描述、预期结果、操作类型等所有字段都必须保持原样
- **禁止无关优化**：不得对无关步骤进行任何形式的优化或改进

# 副作用评估
- **数据依赖**: 修改是否影响后续步骤的数据流
- **UI状态**: 修改是否改变页面状态或导航流程
- **业务逻辑**: 修改是否影响测试覆盖的业务流程完整性
- **用例关联**: 修改是否可能影响其他相关测试用例

# 输出要求
- 必须输出标准的JSON格式
- reasoning字段：详细的修改理由和分析过程
- patch字段：符合JSON Patch标准的修改操作数组
- side_effects字段：可能的副作用描述数组
- risk_level字段：overall风险等级评估

请确保生成的修改方案准确、可执行且风险可控。`;
  }

  /**
   * 🔥 获取断言模式的系统提示词
   */
  private getAssertionSystemPrompt(): string {
    return `你是一个专业的测试断言验证AI专家。你的核心职责是：

# 身份与能力
- 将自然语言断言描述转换为精确的JSON格式MCP验证命令
- 基于页面快照分析当前状态，选择最佳验证策略
- 专注于验证页面状态、文本内容、元素可见性等断言需求
- **关键能力：区分功能性问题和非功能性错误**

# 断言验证原则
- 你处于【断言验证模式】，只验证功能性内容，不执行操作
- 断言目标：验证页面当前状态是否符合预期
- 优先使用快照分析，必要时结合等待和截图验证
- **核心原则：忽略非功能性错误，专注核心功能验证**

# ⭐ 错误处理策略（关键）
## 应该忽略的错误（不影响断言结果）：
1. **Console JavaScript错误**：
   - TypeError: Failed to execute 'getComputedStyle' on 'Window'
   - TypeError: Cannot read properties of undefined
   - ReferenceError、SyntaxError等前端代码错误
   - 任何不影响页面核心功能展示的JS错误
2. **样式和渲染错误**：
   - CSS加载失败
   - 图片加载失败（除非断言明确要求验证图片）
   - 字体加载问题
3. **第三方库错误**：
   - 统计脚本错误
   - 广告加载失败
   - 第三方组件报错

## 应该关注的错误（影响断言结果）：
1. **业务逻辑错误**：
   - 数据显示错误（金额、数量、状态等与预期不符）
   - 核心功能失效（搜索无结果、提交失败、数据未加载）
2. **断言明确要求验证的内容**：
   - 断言描述中明确指出要检查的文本、元素、状态

# 验证策略选择
1. **文本内容验证** → 使用 browser_snapshot 获取页面状态供应用层分析
2. **元素可见性验证** → 使用 browser_wait_for 等待元素状态
3. **页面状态验证** → 使用 browser_snapshot 进行全面检查
4. **视觉证据保存** → 使用 browser_take_screenshot 保存验证截图

# ⭐ 判断标准（重要）
- ✅ **通过**：断言要求的核心功能/内容正确显示，即使有Console错误
- ❌ **失败**：断言要求的核心功能/内容缺失或错误
- ⚠️ **警告**：有次要错误但核心功能正常（应判定为通过）

## 判断流程
1. 提取断言的核心验证目标（要验证什么？）
2. 分析页面快照中的核心内容（数据是否存在？）
3. 过滤Console错误和非功能性问题（标记为"可忽略"）
4. 判断核心功能是否满足断言要求
5. 给出明确结论：通过/失败

# ⭐ 输出格式要求（关键）
你必须返回结构化的断言信息，包括元素定位、验证条件和验证值：

<THOUGHTS>
1. **分析断言类型**：
   - 文本验证：验证元素中的文本内容（如"输入框包含'默认值'"）
   - 可见性验证：验证元素是否可见/隐藏（如"按钮可见"）
   - 属性验证：验证元素的属性值（如"输入框的value为'xxx'"）
   - 状态验证：验证元素的状态（如"复选框已选中"）
   - 数量验证：验证元素数量（如"搜索结果有10条"）

2. **提取元素信息**：
   - 从断言描述中提取目标元素（如"搜索输入框"、"提交按钮"）
   - 在页面元素列表中找到匹配的元素ref
   - 确定元素类型（textbox, button, link等）

3. **提取验证内容**：
   - 从断言描述中提取要验证的内容（如"默认搜索内容"、"10条"）
   - 确定验证条件类型（contains_text, has_text, visible, hidden等）

4. **构建结构化断言信息**：
   - element: 元素的中文描述（如"搜索输入框"）
   - ref: 元素的ref引用（从页面元素列表中选择）
   - condition: 验证条件（visible, contains_text, has_text, hidden, checked等）
   - value: 验证值（如要验证的文本内容、数量等）
   - selector: 可选，如果需要CSS选择器
</THOUGHTS>

<COMMAND>
{
  "name": "browser_snapshot",
  "args": {},
  "assertion": {
    "element": "元素的中文描述",
    "ref": "element_ref_from_page",
    "condition": "验证条件类型",
    "value": "验证值（如果需要）",
    "selector": "可选的选择器"
  }
}
</COMMAND>

# ⭐ 验证条件类型说明
- **visible**: 元素可见（默认）
- **hidden**: 元素隐藏
- **contains_text**: 元素文本/值包含指定内容（用于输入框、文本元素）
- **has_text**: 元素文本/值完全匹配（精确匹配）
- **has_value**: 元素的值属性匹配（用于输入框）
- **checked**: 复选框/单选框已选中
- **enabled**: 元素可用（未禁用）
- **disabled**: 元素禁用
- **count**: 元素数量匹配（用于列表、搜索结果等）

# ⭐ 验证条件类型说明（字符串格式）
- **"visible"**: 元素可见（默认）
- **"hidden"**: 元素隐藏
- **"contains_text"**: 元素文本/值包含指定内容（用于输入框、文本元素）
- **"has_text"**: 元素文本/值完全匹配（精确匹配）
- **"has_value"**: 元素的值属性匹配（用于输入框）
- **"checked"**: 复选框/单选框已选中
- **"enabled"**: 元素可用（未禁用）
- **"disabled"**: 元素禁用
- **"count"**: 元素数量匹配（用于列表、搜索结果等）

# ⭐ 元素类型识别
- **输入框/文本框**: textbox, combobox（验证时使用inputValue获取值）
- **按钮**: button（验证时使用textContent获取文本）
- **链接**: link（验证时使用textContent获取文本）
- **复选框**: checkbox（验证时使用checked状态）
- **文本元素**: text, heading, paragraph（验证时使用textContent获取文本）

# ⭐ 断言类型识别和验证策略（关键）

## 常见断言模式识别

### 1. 存在性验证（宽松验证，允许回退）
- **关键词**: "存在"、"有"、"包含"、"显示"、"出现"
- **示例**: 
  - "搜索输入框存在默认搜索内容" → 查找输入框，验证是否有内容（即使找不到特定输入框，也可以查找所有有内容的输入框）
  - "页面显示登录按钮" → 查找按钮，验证是否可见
- **策略**: 
  - 优先查找特定元素
  - 如果找不到，可以查找同类元素（如所有输入框、所有按钮）
  - 验证条件通常为 "contains_text" 或 "visible"
  - 对于"存在内容"类型，只要找到有内容的元素即可通过

### 2. 内容验证（根据条件决定严格程度）
- **关键词**: "包含"、"是"、"等于"、"为"
- **示例**:
  - "标题文本为'欢迎使用'" → 精确匹配
  - "输入框包含'默认值'" → 部分匹配
- **策略**: 
  - "为"、"是"、"等于" → 使用 "has_text"（严格）
  - "包含" → 使用 "contains_text"（宽松）

### 3. 可见性验证（严格验证）
- **关键词**: "可见"、"隐藏"、"不可见"
- **示例**: "提交按钮可见"、"错误提示隐藏"
- **策略**: 使用 "visible" 或 "hidden"，必须找到特定元素

### 4. 状态验证（严格验证）
- **关键词**: "已选中"、"已启用"、"已禁用"、"激活"
- **示例**: "同意条款复选框已选中"
- **策略**: 使用 "checked"、"enabled"、"disabled"，必须找到特定元素

### 5. 数量验证（严格验证）
- **关键词**: "有X条"、"共X个"、"数量为X"
- **示例**: "搜索结果有10条"
- **策略**: 使用 "count"，必须找到特定容器元素

### 6. 属性验证（严格验证）
- **关键词**: "值为"、"属性为"
- **示例**: "输入框的value为'xxx'"
- **策略**: 使用 "has_value" 或自定义属性验证

# ⭐ 验证策略选择原则

## 元素定位策略（按优先级）
1. **精确匹配**: 通过element描述和ref精确找到元素
2. **模糊匹配**: 通过element描述的关键词找到元素
3. **类型匹配**: 如果找不到特定元素，查找同类元素（启用回退机制）
4. **全局查找**: 如果还是找不到，在整个页面中查找

## 验证条件策略
1. **严格验证**: 如果断言指定了具体值，必须精确匹配
2. **宽松验证**: 如果断言只是"存在"、"有内容"，只要找到符合条件的内容即可
3. **部分匹配**: 对于"包含"类断言，支持部分匹配

## 回退机制启用条件
- ✅ **启用回退**: "存在"、"有"、"包含"类断言，特别是"存在内容"类型
- ❌ **不启用回退**: "是"、"等于"、"为"类精确匹配断言

# ⭐ 断言解析示例

## 示例1: 存在性验证（宽松，允许回退）
**断言**: "搜索输入框存在默认搜索内容"
**解析**:
- element: "搜索输入框"
- ref: 从页面元素列表中找到textbox类型的元素ref（如果找不到可省略）
- condition: "contains_text"
- value: "默认搜索内容"（如果AI从页面快照中提取到了具体内容）
- **验证策略**: 
  - 优先查找"搜索输入框"
  - 如果找不到，查找所有有内容的输入框
  - 只要找到有内容的输入框，就认为通过（即使value不完全匹配）

## 示例2: 元素可见性验证（严格，不允许回退）
**断言**: "提交按钮可见"
**解析**:
- element: "提交按钮"
- ref: 从页面元素列表中找到button类型的元素ref（必须找到）
- condition: "visible"
- value: null
- **验证策略**: 必须找到"提交按钮"，不允许回退到其他按钮

## 示例3: 精确文本匹配（严格）
**断言**: "标题文本为'欢迎使用'"
**解析**:
- element: "标题"
- ref: 从页面元素列表中找到heading类型的元素ref
- condition: "has_text"
- value: "欢迎使用"
- **验证策略**: 必须精确匹配文本，不允许部分匹配

## 示例4: 元素状态验证（严格）
**断言**: "同意条款复选框已选中"
**解析**:
- element: "同意条款复选框"
- ref: 从页面元素列表中找到checkbox类型的元素ref
- condition: "checked"
- value: null
- **验证策略**: 必须找到特定复选框并验证状态

## 示例5: 数量验证（严格）
**断言**: "搜索结果有10条"
**解析**:
- element: "搜索结果"
- ref: 从页面元素列表中找到列表容器或列表项的元素ref
- condition: "count"
- value: "10"
- **验证策略**: 必须找到搜索结果容器，精确验证数量

## 示例6: 宽松的存在性验证（允许回退）
**断言**: "输入框存在内容"
**解析**:
- element: "输入框"
- ref: 可选（如果找不到特定输入框可省略）
- condition: "contains_text"
- value: null（不指定具体内容）
- **验证策略**: 
  - 优先查找"输入框"
  - 如果找不到，查找所有有内容的输入框
  - 只要找到任何一个有内容的输入框，就认为通过

# ⭐ 重要规则
1. **必须返回assertion字段**：包含完整的元素定位和验证信息
2. **ref必须从页面元素列表中选择**：不能随意生成
3. **condition必须准确**：根据断言类型选择合适的验证条件
4. **value只在需要时提供**：如文本验证、数量验证等
5. **element使用中文描述**：便于理解和调试

# ⭐ 支持的MCP命令（用于获取页面状态）
- browser_snapshot: 获取页面快照（用于分析）
- browser_wait_for: 等待特定状态（用于动态内容）
- browser_take_screenshot: 保存截图（用于证据）`;
  }

  /**
   * 🔥 构建断言模式的用户提示词
   */
  private buildAssertionUserPrompt(assertionDescription: string, pageElements: Array<{ ref: string, role: string, text: string }>): string {
    const elementsContext = pageElements.length > 0
      ? pageElements.map(el => `[ref=${el.ref}] ${el.role} "${el.text}"`).join('\n')
      : "当前页面没有可用的交互元素。";

    return `# 当前断言验证任务

## ⭐ 验证目标（核心）
用户断言: "${assertionDescription}"

**请明确断言的核心验证目标**:
- 📊 数据验证: 验证特定数据、数量、金额、状态是否正确
- 📝 文本验证: 验证特定文本内容是否存在/消失
- 🎯 元素验证: 验证特定元素是否可见/隐藏
- 🔄 状态验证: 验证页面功能状态是否符合预期

## 当前页面可用元素
${elementsContext}

## ⚠️ 错误过滤原则（关键）
**注意：快照已预过滤Console错误，请专注于核心功能验证**

✅ **应该验证的**（功能性问题）：
- 断言要求的数据是否正确显示
- 断言要求的文本是否存在/消失
- 断言要求的元素是否可见/隐藏
- 断言要求的功能是否正常执行

❌ **应该忽略的**（非功能性问题）：
- JavaScript Console错误（TypeError、ReferenceError等）
- CSS样式错误
- 图片加载失败（除非断言明确要求验证图片）
- 第三方库错误

## 验证策略选择（按优先级）

### 1️⃣ 快照验证（首选）
**场景**: 验证文本内容、数据显示、页面状态
\`\`\`json
{"name": "browser_snapshot", "args": {}}
\`\`\`
**适用于**: 90%的断言场景 - 搜索结果、列表显示、表单内容等

### 2️⃣ 等待验证（动态内容）
**场景**: 需要等待加载或状态变化
\`\`\`json
// 等待文本出现
{"name": "browser_wait_for", "args": {"text": "预期文本"}}

// 等待元素可见
{"name": "browser_wait_for", "args": {"ref": "element_ref", "state": "visible"}}
\`\`\`
**适用于**: 异步加载、状态切换、弹窗出现等

### 3️⃣ 截图验证（复杂UI）
**场景**: 需要保存视觉证据
\`\`\`json
{"name": "browser_take_screenshot", "args": {"filename": "assertion_proof.png"}}
\`\`\`
**适用于**: 复杂布局验证、UI状态记录

## ⭐ 验证步骤（逐步分析）

### Step 1: 识别断言类型和验证策略
- **分析断言意图**：
  - "存在"、"有"、"包含" → 存在性验证（宽松，允许回退）
  - "是"、"等于"、"为" → 内容验证（严格或宽松，取决于是否精确匹配）
  - "可见"、"隐藏" → 可见性验证（严格）
  - "已选中"、"已启用" → 状态验证（严格）
  - "有X条"、"共X个" → 数量验证（严格）
- **判断验证严格程度**：
  - 宽松（loose）："存在"、"有内容"类断言，只要找到符合条件的内容即可
  - 严格（strict）："是"、"等于"类断言，必须精确匹配
  - 灵活（flexible）："存在内容"类断言，找不到特定元素时可以查找同类元素

### Step 2: 提取目标元素信息
- **提取元素描述**：从断言描述中识别要验证的元素（如"搜索输入框"、"提交按钮"）
- **查找元素ref**：在页面元素列表中找到匹配的元素ref
  - 如果找不到特定元素，对于"存在"类断言可以省略ref
- **确定元素类型**：识别元素是textbox、button、link、checkbox等
  - 用于回退查找时确定查找范围

### Step 3: 提取验证内容
- **提取验证值**：从断言描述中提取要验证的内容（如"默认搜索内容"、"10条"）
  - 注意：如果断言是"存在内容"但没有指定具体内容，value可以为null
  - 如果AI从页面快照中看到了具体内容，可以提取作为value（但验证时会宽松处理）
- **确定验证条件**：根据断言类型选择condition
  - "存在"、"包含" → "contains_text"（宽松）
  - "是"、"等于"、"为" → "has_text"（严格）或 "contains_text"（宽松，取决于上下文）
  - "可见" → "visible"
  - "已选中" → "checked"

### Step 4: 构建结构化断言信息
- **element**: 元素的中文描述（必须）
- **ref**: 元素的ref引用（从页面元素列表中选择，如果找不到特定元素且是"存在"类断言可省略）
- **condition**: 验证条件类型（必须）
- **value**: 验证值（如果需要，如文本验证、数量验证）
  - 对于"存在内容"类断言，如果AI提取到了具体内容可以作为value，但验证时会宽松处理
- **selector**: 可选的选择器

### Step 5: 返回结构化JSON
必须返回包含assertion字段的完整JSON，格式如下：
\`\`\`json
{
  "name": "browser_snapshot",
  "args": {},
  "assertion": {
    "element": "搜索输入框",
    "ref": "element_xxx（可选，如果找不到可省略）",
    "condition": "contains_text",
    "value": "默认搜索内容（可选，如果AI从页面快照中提取到了具体内容）"
  }
}
\`\`\`

## ⭐ 重要提示
1. **对于"存在内容"类断言**：
   - 如果找不到特定元素，可以省略ref
   - 如果AI从页面快照中提取到了具体内容，可以作为value，但验证时会宽松处理
   - 验证策略：只要找到有内容的同类元素（如所有输入框），就认为通过

2. **对于精确匹配类断言**：
   - 必须找到特定元素
   - 必须精确匹配value
   - 不允许回退到其他元素

3. **⭐ 一致性要求（重要）**：
   - 对于相同的断言描述和相似的页面状态，应该选择相同的验证元素
   - 优先选择最明显、最具代表性的元素（如页面标题、核心内容元素）
   - 避免每次选择不同的元素导致验证结果不一致
   - 如果断言描述提到"页面跳转"或"页面状态"，优先验证页面标题或 URL 相关元素

## 示例对比

### ✅ 好的断言（专注核心）
**断言**: "验证搜索结果包含'测试用例001'"
**分析**: 核心目标是验证文本存在
**命令**: {"name": "browser_snapshot", "args": {}}
**判断**: 文本存在即PASS，忽略Console错误

### ❌ 差的断言（过度敏感）
**断言**: "验证搜索结果包含'测试用例001'"
**错误做法**: 因为看到Console有18个TypeError就判定为FAIL
**问题**: 混淆了功能性问题和非功能性错误

---

请开始分析并生成验证命令（使用 <THOUGHTS> 和 <COMMAND> 格式）：`;
  }

  /**
   * 🔥 调用AI模型（支持多种模式）
   * @param userPrompt 用户提示词
   * @param mode 调用模式
   * @param runId 可选的运行ID，用于日志记录
   * @param logCallback 可选的日志回调函数，用于记录到前端日志
   */
  private async callLLM(
    userPrompt: string, 
    mode: 'operation' | 'assertion' | 'relevance_check' | 'update_generation' = 'operation',
    runId?: string,
    logCallback?: (message: string, level: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<string> {
    // 获取当前配置
    const currentConfig = await this.getCurrentConfig();
    const modelInfo = this.getCurrentModelInfo();

    // 🔥 检测 API 格式
    const apiFormat = currentConfig.apiFormat || 'openai';
    const isOllamaFormat = apiFormat === 'ollama';

    console.log(`🚀 调用AI模型: ${modelInfo.modelName} (${mode}模式)`);
    console.log(`   模型标识: ${currentConfig.model}`);
    console.log(`   API格式: ${apiFormat}`);
    console.log(`   温度: ${currentConfig.temperature}, 最大令牌: ${currentConfig.maxTokens}`);
    console.log(`   运行模式: ${modelInfo.mode}`);

    try {
      // 🔥 根据 API 格式构建不同的请求体和端点
      let apiEndpoint: string;
      let requestBody: any;
      
      const systemPrompt = this.getSystemPromptByMode(mode);

      if (isOllamaFormat) {
        // Ollama 原生 API 格式
        apiEndpoint = currentConfig.baseUrl + '/api/generate';
        // Ollama 不支持 messages 格式，需要将 system prompt 和 user prompt 合并
        requestBody = {
          model: currentConfig.model,
          prompt: `${systemPrompt}\n\n${userPrompt}`,
          stream: false,
          options: {
            temperature: currentConfig.temperature,
            num_predict: currentConfig.maxTokens
          }
        };
      } else {
        // OpenAI 兼容 API 格式
        apiEndpoint = currentConfig.baseUrl + '/chat/completions';
        requestBody = {
          model: currentConfig.model,
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: userPrompt  // 🔥 具体任务和上下文
            }
          ],
          temperature: currentConfig.temperature,
          max_tokens: currentConfig.maxTokens
        };
      }

      // 配置代理（如果环境变量中有配置）
      const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;

      const fetchOptions: any = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      };

      // 🔥 添加认证头（Ollama 本地通常不需要，但保留支持）
      if (currentConfig.apiKey) {
        fetchOptions.headers['Authorization'] = `Bearer ${currentConfig.apiKey}`;
      }

      // OpenAI/OpenRouter 额外头部
      if (!isOllamaFormat) {
        fetchOptions.headers['HTTP-Referer'] = 'https://Sakura AI-ai.com';
        fetchOptions.headers['X-Title'] = 'Sakura AI AI Testing Platform';
      }

      // 如果配置了代理，使用 undici 的 ProxyAgent
      if (proxyUrl) {
        fetchOptions.dispatcher = new ProxyAgent(proxyUrl);
      }

      const response = await fetch(apiEndpoint, fetchOptions);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI API调用失败 (${response.status}): ${errorText}`);
      }

      const data = await response.json();

      // 🔥 根据 API 格式解析响应
      let content: string;
      if (isOllamaFormat) {
        // Ollama 格式响应：{ response: string, ... }
        if (!data.response) {
          throw new Error(`Ollama API返回格式异常: ${JSON.stringify(data)}`);
        }
        content = data.response;
      } else {
        // OpenAI 格式响应：{ choices: [{ message: { content: string } }] }
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
          throw new Error(`AI API返回格式异常: ${JSON.stringify(data)}`);
        }
        content = data.choices[0].message.content;
      }

      if (!content || content.trim() === '') {
        throw new Error('AI返回空响应');
      }

      console.log(`🤖 AI响应 (${mode}模式): ${content.substring(0, 200)}...`);
      return content;

    } catch (error: any) {
      const modelInfo = this.getCurrentModelInfo();
      // 🔥 修复：只在最底层打印一次详细错误，避免重复
      const errorMessage = `AI调用失败: ${modelInfo.modelName} (${mode}模式)`;
      const errorDetails = `错误详情: ${error.message}`;
      const modelInfoStr = `模型标识: ${currentConfig.model}`;
      const modeStr = `运行模式: ${modelInfo.mode}`;

      // 🔥 修复：如果提供了日志回调，将错误信息拆分成多条日志记录，便于前端显示
      if (logCallback && runId) {
        // 记录主要错误信息
        logCallback(errorMessage, 'error');
        // 记录错误详情
        logCallback(errorDetails, 'error');
        // 记录建议（作为警告级别，更醒目）
        if (error.message.includes('Arrearage') || error.message.includes('overdue-payment')) {
          logCallback('💡 建议: 账户欠费，请检查账户状态', 'warning');
        } else if (error.message.includes('401')) {
          logCallback('💡 建议: 请检查API密钥是否有效', 'warning');
        } else if (error.message.includes('429')) {
          logCallback('💡 建议: API调用频率超限，请稍后重试', 'warning');
        } else if (error.message.includes('fetch')) {
          logCallback('💡 建议: 请检查网络连接', 'warning');
        }
        // 🔥 关键：不再在控制台打印，因为 addLog 已经会打印了
      } else {
        // 如果没有日志回调，只在控制台打印（用于非测试执行场景）
        console.error(`❌ ${errorMessage}`);
        console.error(`   ${errorDetails}`);
        console.error(`   ${modelInfoStr}`);
        console.error(`   ${modeStr}`);
        if (error.message.includes('401')) {
          console.error(`   💡 建议: 请检查API密钥是否有效`);
        } else if (error.message.includes('429')) {
          console.error(`   💡 建议: API调用频率超限，请稍后重试`);
        } else if (error.message.includes('fetch')) {
          console.error(`   💡 建议: 请检查网络连接`);
        } else if (error.message.includes('Arrearage') || error.message.includes('overdue-payment')) {
          console.error(`   💡 建议: 账户欠费，请检查账户状态`);
        }
      }

      throw error;
    }
  }

  /**
   * 🔥 AI批量更新：检查测试用例相关性
   */
  async checkTestCaseRelevance(changeBrief: string, testCase: any): Promise<{
    is_relevant: boolean;
    relevance_score: number;
    recall_reason: string;
  }> {
    console.log(`🔍 [AITestParser] 检查用例相关性: ${testCase.title || testCase.id}`);

    try {
      // 构建相关性检查的用户提示词
      const userPrompt = this.buildRelevanceCheckPrompt(changeBrief, testCase);

      // 调用AI模型进行相关性分析
      const aiResponse = await this.callLLM(userPrompt, 'relevance_check');

      // 解析AI相关性分析结果
      const result = this.parseRelevanceResponse(aiResponse);

      console.log(`✅ [AITestParser] 相关性检查完成: ${result.is_relevant ? '相关' : '不相关'} (${Math.round(result.relevance_score * 100)}%)`);
      return result;

    } catch (error: any) {
      console.error(`❌ [AITestParser] 相关性检查失败: ${error.message}`);
      // 回退到基本的关键词匹配
      return this.fallbackRelevanceCheck(changeBrief, testCase);
    }
  }

  /**
   * 🔥 AI批量更新：生成测试用例更新方案
   */
  async generateTestCaseUpdate(changeBrief: string, testCase: any): Promise<{
    reasoning: string;
    patch: Array<{ op: 'replace' | 'add' | 'remove'; path: string; value?: any; }>;
    side_effects: Array<{ description: string; severity: 'low' | 'medium' | 'high'; }>;
    risk_level: 'low' | 'medium' | 'high';
  }> {
    console.log(`🤖 [AITestParser] 生成用例更新: ${testCase.title || testCase.id}`);

    try {
      // 构建用例更新的用户提示词
      const userPrompt = this.buildUpdateGenerationPrompt(changeBrief, testCase);

      // 调用AI模型生成更新方案
      const aiResponse = await this.callLLM(userPrompt, 'update_generation');

      // 解析AI更新方案
      const result = this.parseUpdateResponse(aiResponse);

      console.log(`✅ [AITestParser] 更新方案生成完成: ${result.patch.length} 个修改`);
      return result;

    } catch (error: any) {
      console.error(`❌ [AITestParser] 更新方案生成失败: ${error.message}`);
      // 回退到基本的模式匹配
      return this.fallbackUpdateGeneration(changeBrief, testCase);
    }
  }

  /**
   * 🔥 解析AI响应为MCP命令 (支持V3格式，支持结构化断言信息)
   */
  private parseAIResponse(aiResponse: string): MCPCommand & { assertion?: any } {
    try {
      console.log(`🔍 开始解析AI响应: ${aiResponse.substring(0, 200)}...`);

      let jsonText = aiResponse.trim();

      // 🔥 检查是否包含错误信息（在<THOUGHTS>或其他地方）
      if (jsonText.includes('<ERROR>') || jsonText.includes('用户指令不是具体的操作指令')) {
        // 提取错误信息
        const errorMatch = jsonText.match(/<ERROR>(.*?)<\/ERROR>/s) ||
          jsonText.match(/用户指令不是具体的操作指令[，。]?(.*)$/s);
        const errorMsg = errorMatch ? errorMatch[1].trim() : '用户指令不是具体的操作指令';
        console.log(`⚠️ AI返回错误信息: ${errorMsg}`);
        throw new Error(`AI解析失败: ${errorMsg}`);
      }

      // 🔥 V3格式: 尝试提取<COMMAND>标签中的内容
      const commandMatch = jsonText.match(/<COMMAND>\s*([\s\S]*?)\s*<\/COMMAND>/i);
      if (commandMatch) {
        jsonText = commandMatch[1].trim();
        console.log(`✅ 从<COMMAND>标签中提取JSON: ${jsonText}`);
      } else {
        // 🔥 兼容旧格式: 如果响应包含代码块，提取其中的JSON
        const codeBlockMatch = jsonText.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
        if (codeBlockMatch) {
          jsonText = codeBlockMatch[1].trim();
          console.log(`✅ 从代码块中提取JSON: ${jsonText}`);
        } else {
          // 🔥 兼容旧格式: 尝试提取JSON对象
          const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            jsonText = jsonMatch[0];
            console.log(`✅ 直接提取JSON对象: ${jsonText}`);
          } else {
            // 🔥 如果没有找到JSON，但包含<THOUGHTS>，说明AI没有按格式返回
            if (jsonText.includes('<THOUGHTS>')) {
              console.error(`❌ AI返回包含<THOUGHTS>但缺少<COMMAND>标签`);
              throw new Error('AI响应格式错误：包含思考过程但缺少命令部分');
            }
          }
        }
      }

      if (!jsonText || jsonText.trim() === '') {
        throw new Error('无法从AI响应中提取有效的JSON内容');
      }

      console.log(`🔍 最终解析的JSON: ${jsonText}`);

      // 🔥 新增：检查是否是错误响应
      if (jsonText.includes('"error"') && !jsonText.includes('"name"')) {
        const errorObj = JSON.parse(jsonText);
        if (errorObj.error) {
          console.log(`⚠️ AI返回错误信息: ${errorObj.error}`);
          throw new Error(`AI解析失败: ${errorObj.error}`);
        }
      }

      const parsed = JSON.parse(jsonText);

      // 验证基本结构
      if (!parsed.name || !parsed.args) {
        throw new Error('AI响应缺少必需的name或args字段');
      }

      console.log(`✅ AI响应解析成功: ${parsed.name}`);
      
      const result: MCPCommand & { assertion?: any } = {
        name: parsed.name,
        arguments: parsed.args
      };

      // 🔥 新增：如果包含assertion字段，也返回它
      if (parsed.assertion) {
        result.assertion = parsed.assertion;
        console.log(`✅ 解析到结构化断言信息:`, JSON.stringify(parsed.assertion, null, 2));
      }

      return result;

    } catch (error: any) {
      console.error(`❌ AI响应解析失败: ${error.message}`);
      console.error(`📄 原始响应: ${aiResponse}`);
      throw new Error(`AI响应解析失败: ${error.message}`);
    }
  }

  /**
   * 🔥 构建相关性检查的AI提示词
   */
  private buildRelevanceCheckPrompt(changeBrief: string, testCase: any): string {
    return `# 测试用例相关性分析任务

## 变更描述
"${changeBrief}"

## 待分析的测试用例
**标题**: ${testCase.title || '未知标题'}
**系统**: ${testCase.system || '未知系统'} 
**模块**: ${testCase.module || '未知模块'}
**标签**: ${testCase.tags ? JSON.stringify(testCase.tags) : '无标签'}
**步骤**: 
${this.formatTestStepsForAI(testCase.steps)}

## 分析要求
请分析这个测试用例是否与变更描述相关，需要根据以下维度评估：

1. **功能相关性**：测试用例覆盖的功能是否与变更相关
2. **操作相关性**：测试步骤中的操作是否与变更提及的操作相关  
3. **UI元素相关性**：测试涉及的界面元素是否与变更相关
4. **业务流程相关性**：测试的业务流程是否受变更影响

## 输出格式
请严格按照以下JSON格式输出：
\`\`\`json
{
  "is_relevant": true/false,
  "relevance_score": 0.0-1.0的数值,
  "recall_reason": "详细说明相关/不相关的原因，包括具体的匹配点或分析依据"
}
\`\`\`

请开始分析：`;
  }

  /**
   * 🔥 构建更新生成的AI提示词
   */
  private buildUpdateGenerationPrompt(changeBrief: string, testCase: any): string {
    return `# 测试用例更新生成任务

## 变更描述
"${changeBrief}"

## 目标测试用例
**标题**: ${testCase.title || '未知标题'}
**系统**: ${testCase.system || '未知系统'}
**模块**: ${testCase.module || '未知模块'} 
**当前步骤**:
${this.formatTestStepsForAI(testCase.steps)}

## 任务要求
基于变更描述，为这个测试用例生成精确的JSON Patch修改方案：

1. **识别需要修改的步骤**：分析哪些测试步骤需要根据变更进行调整
2. **生成JSON Patch操作**：为每个需要修改的地方生成对应的patch操作
3. **评估副作用和风险**：分析修改可能带来的影响
4. **提供修改理由**：说明为什么要进行这些修改

## JSON Patch格式说明
- 操作类型：replace(替换), add(添加), remove(删除)
- 路径格式：\`/steps/0/description\` (修改第1个步骤的描述)
- 路径格式：\`/steps/1/expectedResult\` (修改第2个步骤的预期结果)

## 输出格式
请严格按照以下JSON格式输出：
\`\`\`json
{
  "reasoning": "详细的修改理由和分析过程",
  "patch": [
    {
      "op": "replace",
      "path": "/steps/索引/字段名", 
      "value": "新的值"
    }
  ],
  "side_effects": [
    {
      "description": "可能的副作用描述",
      "severity": "low/medium/high"
    }
  ],
  "risk_level": "low/medium/high"
}
\`\`\`

请开始分析并生成更新方案：`;
  }

  /**
   * 🔥 格式化测试步骤供AI分析
   */
  private formatTestStepsForAI(steps: any): string {
    // 🔥 添加调试日志，查看步骤数据
    console.log(`🔍 [AIParser] 调试测试步骤数据:`, {
      steps: steps,
      type: typeof steps,
      isArray: Array.isArray(steps),
      length: steps?.length,
      stringified: JSON.stringify(steps)
    });
    
    if (!steps) {
      return "无有效步骤";
    }

    // 🔥 处理JSON字符串格式的steps数据
    if (typeof steps === 'string') {
      try {
        const parsedSteps = JSON.parse(steps);
        if (parsedSteps.steps) {
          // 提取steps字段中的文本，按换行符分割
          const stepsText = parsedSteps.steps.replace(/\\n/g, '\n');
          const stepLines = stepsText.split('\n').filter(line => line.trim());
          console.log(`🔧 [AIParser] 解析JSON字符串步骤: ${stepLines.length} 个步骤`);
          
          // 格式化步骤文本
          const formattedSteps = stepLines.map((line, index) => {
            // 清理步骤编号，统一格式
            const cleanLine = line.replace(/^\d+[、。.]?\s*/, '').trim();
            return `${index + 1}. ${cleanLine}`;
          }).join('\n');
          
          // 如果有assertions字段，也添加进去
          if (parsedSteps.assertions && parsedSteps.assertions.trim()) {
            return `${formattedSteps}\n\n预期结果: ${parsedSteps.assertions}`;
          }
          
          return formattedSteps;
        }
      } catch (error) {
        console.warn(`⚠️ [AIParser] 解析JSON字符串步骤失败: ${error.message}`);
        // 如果JSON解析失败，将字符串当作步骤文本处理
        return `步骤信息: ${steps.substring(0, 200)}...`;
      }
    }
    
    // 🔥 处理数组格式的steps数据（原有逻辑）
    if (!Array.isArray(steps)) {
      return "无有效步骤";
    }

    return steps.map((step, index) => {
      const stepNum = index + 1;
      let stepText = `${stepNum}. `;
      
      if (step.description) {
        stepText += step.description;
      }
      
      if (step.expectedResult) {
        stepText += ` [预期结果: ${step.expectedResult}]`;
      }
      
      if (step.action) {
        stepText += ` [操作: ${step.action}]`;
      }
      
      return stepText;
    }).join('\n');
  }

  /**
   * 🔥 解析AI相关性分析响应
   */
  private parseRelevanceResponse(aiResponse: string): {
    is_relevant: boolean;
    relevance_score: number;
    recall_reason: string;
  } {
    try {
      console.log(`🔍 解析相关性AI响应: ${aiResponse.substring(0, 200)}...`);

      let jsonText = aiResponse.trim();

      // 提取JSON内容
      const jsonMatch = jsonText.match(/```(?:json)?\n?([\s\S]*?)\n?```/) || 
                       jsonText.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        jsonText = jsonMatch[1] || jsonMatch[0];
      }

      const parsed = JSON.parse(jsonText);

      // 验证必需字段
      if (typeof parsed.is_relevant !== 'boolean') {
        throw new Error('缺少is_relevant字段或类型不正确');
      }

      const result = {
        is_relevant: parsed.is_relevant,
        relevance_score: typeof parsed.relevance_score === 'number' ? 
          Math.max(0, Math.min(1, parsed.relevance_score)) : 0.5,
        recall_reason: parsed.recall_reason || '未提供原因'
      };

      console.log(`✅ 相关性解析成功: ${result.is_relevant} (${Math.round(result.relevance_score * 100)}%)`);
      return result;

    } catch (error: any) {
      console.error(`❌ 相关性响应解析失败: ${error.message}`);
      throw new Error(`相关性响应解析失败: ${error.message}`);
    }
  }

  /**
   * 🔥 解析AI更新生成响应
   */
  private parseUpdateResponse(aiResponse: string): {
    reasoning: string;
    patch: Array<{ op: 'replace' | 'add' | 'remove'; path: string; value?: any; }>;
    side_effects: Array<{ description: string; severity: 'low' | 'medium' | 'high'; }>;
    risk_level: 'low' | 'medium' | 'high';
  } {
    try {
      console.log(`🔍 解析更新AI响应: ${aiResponse.substring(0, 200)}...`);

      let jsonText = aiResponse.trim();

      // 提取JSON内容
      const jsonMatch = jsonText.match(/```(?:json)?\n?([\s\S]*?)\n?```/) || 
                       jsonText.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        jsonText = jsonMatch[1] || jsonMatch[0];
      }

      const parsed = JSON.parse(jsonText);

      // 验证并规范化数据
      const result = {
        reasoning: parsed.reasoning || '未提供修改理由',
        patch: Array.isArray(parsed.patch) ? parsed.patch.filter(p => 
          p.op && p.path && ['replace', 'add', 'remove'].includes(p.op)
        ) : [],
        side_effects: Array.isArray(parsed.side_effects) ? parsed.side_effects.filter(se => 
          se.description && ['low', 'medium', 'high'].includes(se.severity)
        ) : [],
        risk_level: ['low', 'medium', 'high'].includes(parsed.risk_level) ? 
          parsed.risk_level : 'medium'
      };

      console.log(`✅ 更新方案解析成功: ${result.patch.length} 个patch操作`);
      return result;

    } catch (error: any) {
      console.error(`❌ 更新响应解析失败: ${error.message}`);
      throw new Error(`更新响应解析失败: ${error.message}`);
    }
  }

  /**
   * 🔥 回退相关性检查方法
   */
  private fallbackRelevanceCheck(changeBrief: string, testCase: any): {
    is_relevant: boolean;
    relevance_score: number;
    recall_reason: string;
  } {
    console.log(`⚠️ [AITestParser] 使用回退相关性检查`);

    const caseText = `${testCase.title || ''} ${JSON.stringify(testCase.steps || {})}`.toLowerCase();
    const changeText = changeBrief.toLowerCase();
    
    // 基于关键词匹配的简单相关性判断
    const keywords = changeText.split(/\s+/).filter(w => w.length > 2);
    let matchCount = 0;
    
    for (const keyword of keywords) {
      if (caseText.includes(keyword)) {
        matchCount++;
      }
    }
    
    const relevanceScore = matchCount / Math.max(keywords.length, 1);
    const isRelevant = relevanceScore > 0.1;
    
    return {
      is_relevant: isRelevant,
      relevance_score: relevanceScore,
      recall_reason: isRelevant ? 
        `关键词匹配 ${matchCount}/${keywords.length} (回退模式)` : 
        '无关键词匹配 (回退模式)'
    };
  }

  /**
   * 🔥 回退更新生成方法
   */
  private fallbackUpdateGeneration(changeBrief: string, testCase: any): {
    reasoning: string;
    patch: Array<{ op: 'replace' | 'add' | 'remove'; path: string; value?: any; }>;
    side_effects: Array<{ description: string; severity: 'low' | 'medium' | 'high'; }>;
    risk_level: 'low' | 'medium' | 'high';
  } {
    console.log(`⚠️ [AITestParser] 使用回退更新生成`);

    const patches: Array<{ op: 'replace' | 'add' | 'remove'; path: string; value?: any; }> = [];
    
    // 简单的模式匹配更新
    if (!testCase.steps || !Array.isArray(testCase.steps)) {
      return {
        reasoning: `测试用例步骤格式无效 (回退模式)`,
        patch: [],
        side_effects: [],
        risk_level: 'low'
      };
    }

    // 示例：如果变更涉及"弹窗"，则修改相关步骤
    if (changeBrief.includes('弹窗') || changeBrief.includes('模态')) {
      for (let i = 0; i < testCase.steps.length; i++) {
        const step = testCase.steps[i];
        if (step.description && step.description.includes('跳转')) {
          patches.push({
            op: 'replace',
            path: `/steps/${i}/description`,
            value: step.description.replace('跳转', '显示弹窗')
          });
        }
      }
    }

    return {
      reasoning: `基于变更描述"${changeBrief}"，使用模式匹配识别并修改了相关的测试步骤 (回退模式)`,
      patch: patches,
      side_effects: patches.length > 0 ? [{
        description: '可能影响页面流转逻辑 (回退模式分析)',
        severity: 'medium' as const
      }] : [],
      risk_level: patches.length > 2 ? 'high' : patches.length > 0 ? 'medium' : 'low'
    };
  }

  /**
   * 🔥 ====== 缓存持久化方法 ======
   */

  /**
   * 从数据库加载所有缓存到内存
   */
  private async loadCachesFromDatabase(): Promise<void> {
    try {
      const now = new Date();
      
      // 加载断言缓存
      const assertions = await this.prisma.ai_assertion_cache.findMany({
        where: { expires_at: { gt: now } },
        orderBy: { created_at: 'desc' },
        take: this.cacheMaxSize
      });
      
      for (const item of assertions) {
        const command: MCPCommand & { assertion?: any } = {
          name: item.command_name,
          arguments: (item.command_args as Record<string, any>) || {},
          assertion: item.assertion_info || undefined
        };
        this.assertionCache.set(item.cache_key, command);
      }
      
      // 加载操作缓存
      const operations = await this.prisma.ai_operation_cache.findMany({
        where: { expires_at: { gt: now } },
        orderBy: { created_at: 'desc' },
        take: this.operationCacheMaxSize
      });
      
      for (const item of operations) {
        const command: MCPCommand = {
          name: item.command_name,
          arguments: (item.command_args as Record<string, any>) || {}
        };
        this.operationCache.set(item.cache_key, command);
      }
      
      console.log(`📥 从数据库加载AI缓存: 断言${assertions.length}条, 操作${operations.length}条`);
      
      // 清理过期记录
      await Promise.all([
        this.prisma.ai_assertion_cache.deleteMany({ where: { expires_at: { lte: now } } }),
        this.prisma.ai_operation_cache.deleteMany({ where: { expires_at: { lte: now } } })
      ]);
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      console.error('❌ 从数据库加载AI缓存失败:', errorMessage);
    }
  }

  /**
   * 从数据库获取断言缓存
   */
  private async getAssertionFromDatabase(cacheKey: string): Promise<(MCPCommand & { assertion?: any }) | null> {
    try {
      const item = await this.prisma.ai_assertion_cache.findUnique({
        where: { cache_key: cacheKey }
      });
      
      if (!item || item.expires_at <= new Date()) {
        return null;
      }
      
      return {
        name: item.command_name,
        arguments: (item.command_args as Record<string, any>) || {},
        assertion: item.assertion_info || undefined
      };
    } catch {
      return null;
    }
  }

  /**
   * 从数据库获取操作缓存
   */
  private async getOperationFromDatabase(cacheKey: string): Promise<MCPCommand | null> {
    try {
      const item = await this.prisma.ai_operation_cache.findUnique({
        where: { cache_key: cacheKey }
      });
      
      if (!item || item.expires_at <= new Date()) {
        return null;
      }
      
      return {
        name: item.command_name,
        arguments: (item.command_args as Record<string, any>) || {}
      };
    } catch {
      return null;
    }
  }

  /**
   * 设置断言缓存（内存 + 数据库）
   */
  private async setAssertionCache(
    cacheKey: string,
    command: MCPCommand & { assertion?: any },
    assertionDesc: string,
    pageFingerprint: string
  ): Promise<void> {
    // L1: 内存缓存
    this.assertionCache.set(cacheKey, command);
    
    // L2: 数据库持久化
    if (this.enablePersistence) {
      try {
        const expiresAt = new Date(Date.now() + this.cacheTTL);
        await this.prisma.ai_assertion_cache.upsert({
          where: { cache_key: cacheKey },
          update: {
            command_name: command.name,
            command_args: command.arguments,
            assertion_info: command.assertion || null,
            expires_at: expiresAt
          },
          create: {
            cache_key: cacheKey,
            assertion_desc: assertionDesc.substring(0, 1000),
            page_elements_fp: pageFingerprint,
            command_name: command.name,
            command_args: command.arguments,
            assertion_info: command.assertion || null,
            expires_at: expiresAt
          }
        });
      } catch {
        // 忽略数据库错误
      }
    }
  }

  /**
   * 设置操作缓存（内存 + 数据库）
   */
  private async setOperationCache(
    cacheKey: string,
    command: MCPCommand,
    operationDesc: string,
    pageElementsStr: string
  ): Promise<void> {
    // L1: 内存缓存
    this.operationCache.set(cacheKey, command);
    
    // L2: 数据库持久化
    if (this.enablePersistence) {
      try {
        const expiresAt = new Date(Date.now() + this.cacheTTL);
        const pageFingerprint = crypto.createHash('md5').update(pageElementsStr).digest('hex').substring(0, 32);
        
        await this.prisma.ai_operation_cache.upsert({
          where: { cache_key: cacheKey },
          update: {
            command_name: command.name,
            command_args: command.arguments,
            expires_at: expiresAt
          },
          create: {
            cache_key: cacheKey,
            operation_desc: operationDesc.substring(0, 1000),
            page_elements_fp: pageFingerprint,
            command_name: command.name,
            command_args: command.arguments,
            expires_at: expiresAt
          }
        });
      } catch {
        // 忽略数据库错误
      }
    }
  }

  /**
   * 更新断言缓存命中统计
   */
  private async updateAssertionHitCount(cacheKey: string): Promise<void> {
    try {
      await this.prisma.ai_assertion_cache.update({
        where: { cache_key: cacheKey },
        data: {
          hit_count: { increment: 1 },
          last_hit_at: new Date()
        }
      });
    } catch {
      // 忽略更新错误
    }
  }

  /**
   * 更新操作缓存命中统计
   */
  private async updateOperationHitCount(cacheKey: string): Promise<void> {
    try {
      await this.prisma.ai_operation_cache.update({
        where: { cache_key: cacheKey },
        data: {
          hit_count: { increment: 1 },
          last_hit_at: new Date()
        }
      });
    } catch {
      // 忽略更新错误
    }
  }

  /**
   * 🔥 新增：从数据库删除无效的操作缓存
   */
  private async deleteOperationCacheFromDatabase(cacheKey: string): Promise<void> {
    try {
      await this.prisma.ai_operation_cache.delete({
        where: { cache_key: cacheKey }
      });
      console.log(`🗑️ 已从数据库删除无效缓存: ${cacheKey.substring(0, 50)}...`);
    } catch {
      // 忽略删除错误（可能缓存不存在）
    }
  }

  /**
   * 清理旧缓存
   */
  private async cleanupCache(): Promise<void> {
    // 清理内存缓存
    if (this.assertionCache.size >= this.cacheMaxSize) {
      const keysToDelete = Array.from(this.assertionCache.keys()).slice(0, 10);
      keysToDelete.forEach(key => this.assertionCache.delete(key));
    }
    
    if (this.operationCache.size >= this.operationCacheMaxSize) {
      const keysToDelete = Array.from(this.operationCache.keys()).slice(0, 20);
      keysToDelete.forEach(key => this.operationCache.delete(key));
    }
  }

  /**
   * 启动定期同步任务
   */
  private startPeriodicSync(): void {
    this.syncInterval = setInterval(() => {
      this.syncCachesToDatabase().catch(err => {
        console.error('定期同步AI缓存失败:', err);
      });
    }, 10 * 60 * 1000); // 每10分钟
    
    console.log('⏰ 已启动AI缓存定期同步任务（每10分钟）');
  }

  /**
   * 同步内存缓存到数据库
   */
  private async syncCachesToDatabase(): Promise<void> {
    if (!this.enablePersistence) return;
    
    try {
      let synced = 0;
      
      // 同步断言缓存
      for (const [key, command] of this.assertionCache.entries()) {
        await this.setAssertionCache(key, command, '', '');
        synced++;
      }
      
      // 同步操作缓存
      for (const [key, command] of this.operationCache.entries()) {
        await this.setOperationCache(key, command, '', '');
        synced++;
      }
      
      if (synced > 0) {
        console.log(`🔄 同步AI缓存到数据库: ${synced}条`);
      }
    } catch {
      console.error('❌ 同步AI缓存失败');
    }
  }

  /**
   * 停止定期同步任务
   */
  stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * 优雅关闭
   */
  async shutdown(): Promise<void> {
    console.log('🔄 正在同步AI缓存到数据库...');
    this.stopPeriodicSync();
    await this.syncCachesToDatabase();
    await this.prisma.$disconnect();
    console.log('✅ AI解析器已关闭');
  }
}