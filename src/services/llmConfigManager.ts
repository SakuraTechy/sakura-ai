import { modelRegistry, ModelDefinition } from './modelRegistry';
import { settingsService, LLMSettings } from './settingsService';
import { LLMConfig } from '../types/llm';

// 配置变更事件类型
export type ConfigChangeEvent = {
  type: 'model_changed' | 'config_updated' | 'connection_tested';
  oldConfig?: LLMConfig;
  newConfig: LLMConfig;
  modelInfo: ModelDefinition;
  timestamp: Date;
};

// 配置变更监听器类型
export type ConfigChangeListener = (event: ConfigChangeEvent) => void;

// 连接测试结果
export interface ConnectionTestResult {
  success: boolean;
  responseTime?: number;
  error?: string;
  modelInfo: ModelDefinition;
  timestamp: Date;
}

// LLM配置管理器
export class LLMConfigManager {
  private static instance: LLMConfigManager;
  private currentConfig: LLMConfig | null = null;
  private currentModelInfo: ModelDefinition | null = null;
  private listeners: ConfigChangeListener[] = [];
  private isInitialized = false;
  private backendSettingsService: any = null; // 🔥 后端设置服务实例

  private constructor() {}

  // 单例模式
  public static getInstance(): LLMConfigManager {
    if (!LLMConfigManager.instance) {
      LLMConfigManager.instance = new LLMConfigManager();
    }
    return LLMConfigManager.instance;
  }

  // 🔥 获取正确的设置服务（根据环境）
  private async getSettingsService(): Promise<any> {
    // 前端环境：使用前端设置服务
    if (typeof window !== 'undefined') {
      return settingsService;
    }

    // 后端环境：使用后端设置服务
    if (!this.backendSettingsService) {
      try {
        const module = await import('../../server/services/settingsService.js');
        this.backendSettingsService = module.BackendSettingsService.getInstance();
        console.log('✅ 后端设置服务已加载');
      } catch (error) {
        console.warn('⚠️ 无法加载后端设置服务，回退到前端服务:', error);
        return settingsService;
      }
    }

    return this.backendSettingsService;
  }

  // 初始化配置管理器
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('🔧 初始化LLM配置管理器...');
      
      // 🔥 根据环境获取正确的设置服务
      const service = await this.getSettingsService();
      const settings = await service.getLLMSettings();
      
      // 🔥 修复：检查模型是否需要API密钥
      const modelInfo = modelRegistry.getModelById(settings.selectedModelId);
      const requiresApiKey = modelInfo?.requiresCustomAuth !== false; // 云端模型需要API密钥，本地模型不需要
      
      // 如果需要API密钥但未配置，标记为"未配置"状态
      if (requiresApiKey && (!settings.apiKey || settings.apiKey.trim() === '')) {
        console.warn('⚠️ API密钥未配置，配置管理器将以"未配置"状态初始化');
        console.warn('⚠️ 请在设置中配置有效的API密钥以启用AI功能');
        
        // 标记为已初始化，但不设置配置
        this.isInitialized = true;
        this.currentConfig = null;
        this.currentModelInfo = null;
        
        console.log('✅ LLM配置管理器已初始化（未配置状态）');
        return;
      }
      
      await this.updateConfig(settings);
      
      this.isInitialized = true;
      console.log('✅ LLM配置管理器初始化完成');
    } catch (error) {
      console.error('❌ LLM配置管理器初始化失败:', error);
      // 🔥 修复：即使初始化失败，也标记为已初始化，避免重复尝试
      this.isInitialized = true;
      throw error;
    }
  }

  // 获取当前配置
  public getCurrentConfig(): LLMConfig {
    // 🔥 修复：如果配置为空，返回默认值而不是抛出错误
    if (!this.currentConfig) {
      console.warn('⚠️ 配置管理器未初始化或API密钥未配置，返回默认值');
      return {
        apiKey: '',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'openai/gpt-4o',
        temperature: 0.3,
        maxTokens: 1500,
        apiFormat: 'openai'
      };
    }
    return { ...this.currentConfig };
  }

  // 获取当前模型信息
  public getModelInfo(): ModelDefinition {
    // 🔥 修复：如果模型信息为空，返回默认模型而不是抛出错误
    if (!this.currentModelInfo) {
      console.warn('⚠️ 模型信息未初始化或API密钥未配置，返回默认模型');
      return modelRegistry.getDefaultModel();
    }
    return { ...this.currentModelInfo };
  }

  // 更新配置
  public async updateConfig(settings: LLMSettings): Promise<void> {
    try {
      console.log(`🔄 更新LLM配置: ${settings.selectedModelId}`);
      
      // 获取模型信息
      const modelInfo = modelRegistry.getModelById(settings.selectedModelId);
      if (!modelInfo) {
        throw new Error(`未找到模型: ${settings.selectedModelId}`);
      }
      
      // 🔥 修复：检查模型是否需要API密钥
      const requiresApiKey = modelInfo.requiresCustomAuth !== false; // 云端模型需要API密钥，本地模型不需要
      
      // 如果需要API密钥但未配置，标记为"未配置"
      if (requiresApiKey && (!settings.apiKey || settings.apiKey.trim() === '')) {
        console.warn('⚠️ API密钥未配置，跳过配置更新');
        this.currentConfig = null;
        this.currentModelInfo = null;
        return;
      }
      
      // 🔥 根据环境获取正确的设置服务
      const service = await this.getSettingsService();
      
      // 验证设置
      const validation = await service.validateLLMSettings(settings);
      if (!validation.isValid) {
        throw new Error(`配置验证失败: ${validation.errors.map(e => e.message).join(', ')}`);
      }

      // 构建新配置
      // 🔥 修复：优先使用 settings 中传入的值，其次使用模型默认值
      const oldConfig = this.currentConfig;
      const newConfig: LLMConfig = {
        apiKey: settings.apiKey || '', // 🔥 本地模型允许空字符串
        baseUrl: settings.baseUrl || modelInfo.customBaseUrl || 'https://openrouter.ai/api/v1', // 🔥 优先使用 settings.baseUrl
        model: settings.customModelName || modelInfo.openRouterModel, // 优先使用自定义模型名称
        temperature: settings.customConfig?.temperature ?? modelInfo.defaultConfig.temperature,
        maxTokens: settings.customConfig?.maxTokens ?? modelInfo.defaultConfig.maxTokens,
        apiFormat: modelInfo.apiFormat || 'openai' // 🔥 API 格式（默认 openai）
      };

      // 更新当前配置
      this.currentConfig = newConfig;
      this.currentModelInfo = modelInfo;

      // 触发配置变更事件
      const eventType = oldConfig?.model !== newConfig.model ? 'model_changed' : 'config_updated';
      this.notifyListeners({
        type: eventType,
        oldConfig: oldConfig || undefined,
        newConfig,
        modelInfo,
        timestamp: new Date()
      });

      console.log(`✅ LLM配置更新成功: ${modelInfo.name}`);
      console.log(`   API端点: ${newConfig.baseUrl} (来源: ${settings.baseUrl ? 'settings' : 'modelInfo'})`);
      console.log(`   模型: ${newConfig.model} (来源: ${settings.customModelName ? 'customModelName' : 'openRouterModel'})`);
      console.log(`   温度: ${newConfig.temperature}`);
      console.log(`   最大令牌: ${newConfig.maxTokens}`);
      console.log(`   API密钥: ${newConfig.apiKey ? '已设置' : '未设置（本地模型）'}`);
      
    } catch (error) {
      console.error('❌ 更新LLM配置失败:', error);
      throw error;
    }
  }

  // 测试OpenRouter API连接
  public async testConnection(): Promise<ConnectionTestResult> {
    // 🔥 修复：如果配置未就绪，返回有意义的错误
    if (!this.currentConfig || !this.currentModelInfo) {
      const timestamp = new Date();
      const result: ConnectionTestResult = {
        success: false,
        error: 'API密钥未配置，请先在设置中配置有效的API密钥',
        modelInfo: modelRegistry.getDefaultModel(),
        timestamp
      };
      console.warn('⚠️ 配置管理器未初始化，无法测试连接');
      return result;
    }

    const startTime = Date.now();
    const timestamp = new Date();

    try {
      console.log(`🧪 [前端] 测试连接: ${this.currentModelInfo.name}`);
      console.log(`📋 [前端] 当前配置模型: ${this.currentConfig.model}`);

      // 🔥 通过后端 API 代理测试连接，避免 CORS 问题
      const llmSettings = {
        selectedModelId: this.currentModelInfo.id,
        apiKey: this.currentConfig.apiKey,
        baseUrl: this.currentConfig.baseUrl,
        customModelName: this.currentConfig.model, // 🔥 传递用户选择的模型名称
        customConfig: {
          temperature: this.currentConfig.temperature,
          maxTokens: this.currentConfig.maxTokens
        }
      };

      console.log(`📤 [前端] 发送测试请求:`, {
        selectedModelId: llmSettings.selectedModelId,
        baseUrl: llmSettings.baseUrl,
        customModelName: llmSettings.customModelName
      });

      const response = await fetch('/api/config/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(llmSettings)
      });

      const responseTime = Date.now() - startTime;
      const data = await response.json();

      if (!response.ok || !data.success) {
        const errorMessage = data.error || `API调用失败 (${response.status})`;
        
        const result: ConnectionTestResult = {
          success: false,
          responseTime: data.responseTime || responseTime,
          error: errorMessage,
          modelInfo: this.currentModelInfo,
          timestamp
        };

        console.error(`❌ [前端] 连接测试失败: ${this.currentModelInfo.name} - ${errorMessage}`);
        return result;
      }

      // 触发连接测试事件
      this.notifyListeners({
        type: 'connection_tested',
        newConfig: this.currentConfig,
        modelInfo: this.currentModelInfo,
        timestamp
      });

      const result: ConnectionTestResult = {
        success: true,
        responseTime: data.responseTime || responseTime,
        modelInfo: this.currentModelInfo,
        timestamp
      };

      console.log(`✅ [前端] 连接测试成功: ${this.currentModelInfo.name} (${result.responseTime}ms)`);
      return result;

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      // 增强错误处理
      let enhancedError = error.message;
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        enhancedError = '网络连接失败，请检查网络设置';
        (error as any).type = 'NETWORK_ERROR';
      }
      
      const result: ConnectionTestResult = {
        success: false,
        responseTime,
        error: enhancedError,
        modelInfo: this.currentModelInfo,
        timestamp
      };

      console.error(`❌ [前端] 连接测试失败: ${this.currentModelInfo.name} - ${enhancedError}`);
      return result;
    }
  }

  // 重新加载配置（从存储中）
  public async reloadConfig(): Promise<void> {
    try {
      console.log('🔄 重新加载LLM配置...');
      
      // 🔥 根据环境获取正确的设置服务
      const service = await this.getSettingsService();
      const settings = await service.getLLMSettings();
      
      // 🔥 修复：检查模型是否需要API密钥
      const modelInfo = modelRegistry.getModelById(settings.selectedModelId);
      const requiresApiKey = modelInfo?.requiresCustomAuth !== false; // 云端模型需要API密钥，本地模型不需要
      
      // 如果需要API密钥但未配置，标记为"未配置"状态
      if (requiresApiKey && (!settings.apiKey || settings.apiKey.trim() === '')) {
        console.warn('⚠️ API密钥未配置，配置管理器将以"未配置"状态重新加载');
        this.currentConfig = null;
        this.currentModelInfo = null;
        console.log('✅ LLM配置已重新加载（未配置状态）');
        return;
      }
      
      await this.updateConfig(settings);
      console.log('✅ LLM配置重新加载完成');
    } catch (error) {
      console.error('❌ 重新加载LLM配置失败:', error);
      throw error;
    }
  }

  // 保存当前配置到存储
  public async saveCurrentConfig(): Promise<void> {
    if (!this.currentConfig || !this.currentModelInfo) {
      throw new Error('没有可保存的配置');
    }

    try {
      const settings: LLMSettings = {
        selectedModelId: this.currentModelInfo.id,
        apiKey: this.currentConfig.apiKey,
        baseUrl: this.currentConfig.baseUrl, // 🔥 添加 baseUrl
        customConfig: {
          temperature: this.currentConfig.temperature,
          maxTokens: this.currentConfig.maxTokens
        }
      };

      // 🔥 根据环境获取正确的设置服务
      const service = await this.getSettingsService();
      await service.saveLLMSettings(settings);
      console.log('✅ 当前配置已保存到存储');
    } catch (error) {
      console.error('❌ 保存配置失败:', error);
      throw error;
    }
  }

  // 添加配置变更监听器
  public addConfigChangeListener(listener: ConfigChangeListener): void {
    this.listeners.push(listener);
  }

  // 移除配置变更监听器
  public removeConfigChangeListener(listener: ConfigChangeListener): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  // 获取配置摘要信息
  public getConfigSummary(): {
    modelName: string;
    modelId: string;
    provider: string;
    temperature: number;
    maxTokens: number;
    costLevel: string;
    capabilities: string[];
    isInitialized: boolean;
  } {
    // 🔥 修复：如果配置未就绪，返回默认摘要而不是抛出错误
    if (!this.currentConfig || !this.currentModelInfo) {
      const defaultModel = modelRegistry.getDefaultModel();
      return {
        modelName: '未配置',
        modelId: defaultModel.id,
        provider: defaultModel.provider,
        temperature: defaultModel.defaultConfig.temperature,
        maxTokens: defaultModel.defaultConfig.maxTokens,
        costLevel: defaultModel.costLevel,
        capabilities: defaultModel.capabilities,
        isInitialized: false
      };
    }

    return {
      modelName: this.currentModelInfo.name,
      modelId: this.currentModelInfo.id,
      provider: this.currentModelInfo.provider,
      temperature: this.currentConfig.temperature,
      maxTokens: this.currentConfig.maxTokens,
      costLevel: this.currentModelInfo.costLevel,
      capabilities: [...this.currentModelInfo.capabilities],
      isInitialized: this.isInitialized
    };
  }

  // 检查是否已初始化
  public isReady(): boolean {
    return this.isInitialized && this.currentConfig !== null && this.currentModelInfo !== null;
  }

  // 私有方法：通知监听器
  private notifyListeners(event: ConfigChangeEvent): void {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('配置变更监听器执行失败:', error);
      }
    });
  }

  // 重置配置管理器（主要用于测试）
  public reset(): void {
    this.currentConfig = null;
    this.currentModelInfo = null;
    this.listeners = [];
    this.isInitialized = false;
  }
}

// 导出单例实例
export const llmConfigManager = LLMConfigManager.getInstance();