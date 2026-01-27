import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * 模型价格服务
 * 支持从配置文件、官方API和默认配置获取模型价格
 */

export interface ModelPricing {
  input: number;  // 输入价格（美元/1K tokens）
  output: number; // 输出价格（美元/1K tokens）
  source?: 'config' | 'api' | 'default'; // 价格来源
  lastUpdated?: string; // 最后更新时间
}

export interface ModelPricingConfig {
  models: Record<string, ModelPricing>;
  lastUpdated: string;
  version: string;
}

/**
 * 默认价格配置（作为后备）
 */
const DEFAULT_PRICING: Record<string, ModelPricing> = {
  // OpenAI
  'gpt-4o': { input: 0.0025, output: 0.01, source: 'default' },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006, source: 'default' },
  'gpt-4-turbo': { input: 0.01, output: 0.03, source: 'default' },
  'gpt-4': { input: 0.03, output: 0.06, source: 'default' },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015, source: 'default' },
  
  // Anthropic Claude
  'claude-3.5-sonnet': { input: 0.003, output: 0.015, source: 'default' },
  'claude-3-opus': { input: 0.015, output: 0.075, source: 'default' },
  'claude-3-sonnet': { input: 0.003, output: 0.015, source: 'default' },
  'claude-3-haiku': { input: 0.00025, output: 0.00125, source: 'default' },
  
  // Google Gemini
  'gemini-1.5-pro': { input: 0.00125, output: 0.005, source: 'default' },
  'gemini-1.5-flash': { input: 0.000075, output: 0.0003, source: 'default' },
  'gemini-pro-vision': { input: 0.00025, output: 0.0005, source: 'default' },
  
  // 字节跳动 Doubao（豆包）
  'doubao-seed-1-8': { input: 0.0001, output: 0.0002, source: 'default' },
  'doubao-seed-1-8-251228': { input: 0.0001, output: 0.0002, source: 'default' },
  'doubao-pro': { input: 0.0008, output: 0.002, source: 'default' },
  'doubao-lite': { input: 0.0003, output: 0.0006, source: 'default' },
  
  // 阿里通义千问
  'qwen-vl-max': { input: 0.0002, output: 0.0006, source: 'default' },
  'qwen-vl-max-latest': { input: 0.0002, output: 0.0006, source: 'default' },
  'qwen2.5-vl': { input: 0.0002, output: 0.0006, source: 'default' },
  'qwen-vl-plus': { input: 0.0001, output: 0.0003, source: 'default' },
  
  // 智谱 GLM
  'glm-4v': { input: 0.0005, output: 0.0005, source: 'default' },
  'glm-4v-plus': { input: 0.001, output: 0.001, source: 'default' },
  'glm-4.6v': { input: 0.001, output: 0.001, source: 'default' },
  
  // 默认价格（未知模型）
  'default': { input: 0.001, output: 0.002, source: 'default' }
};

export class ModelPricingService {
  private static instance: ModelPricingService;
  private pricingCache: Record<string, ModelPricing> = {};
  private configPath: string;
  private cacheExpiry: number = 24 * 60 * 60 * 1000; // 24小时缓存过期
  private syncInterval: number = 24 * 60 * 60 * 1000; // 同步间隔（默认24小时）
  private autoSync: boolean = false; // 是否自动同步
  private syncTimer?: NodeJS.Timeout; // 定时器

  private constructor() {
    this.configPath = path.join(process.cwd(), 'config', 'model-pricing.json');
    this.pricingCache = { ...DEFAULT_PRICING };
  }

  static getInstance(): ModelPricingService {
    if (!ModelPricingService.instance) {
      ModelPricingService.instance = new ModelPricingService();
    }
    return ModelPricingService.instance;
  }

  /**
   * 初始化价格服务（加载配置文件）
   * 会自动读取配置文件中的 autoSync 和 syncInterval 设置
   */
  async initialize(): Promise<void> {
    try {
      await this.loadPricingConfig();
      console.log('✅ 模型价格配置加载成功');
      
      // 🔥 根据配置文件设置自动同步
      if (this.autoSync) {
        console.log(`🔄 启用自动同步，间隔: ${this.syncInterval / 1000 / 60 / 60} 小时`);
        await this.checkAndUpdatePricing();
        this.startAutoSync();
      }
    } catch (error: any) {
      console.warn(`⚠️ 加载价格配置失败，使用默认价格: ${error.message}`);
    }
  }

  /**
   * 启动自动同步定时器
   */
  private startAutoSync(): void {
    // 清除旧的定时器
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }
    
    // 设置新的定时器
    this.syncTimer = setInterval(async () => {
      console.log('⏰ 定时同步价格...');
      await this.checkAndUpdatePricing();
    }, this.syncInterval);
    
    console.log(`✅ 自动同步定时器已启动，间隔: ${this.syncInterval / 1000 / 60 / 60} 小时`);
  }

  /**
   * 停止自动同步
   */
  stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
      console.log('⏹️ 自动同步已停止');
    }
  }

  /**
   * 检查并更新价格（如果过期）
   */
  private async checkAndUpdatePricing(): Promise<void> {
    try {
      const configContent = await fs.readFile(this.configPath, 'utf-8');
      const config: ModelPricingConfig = JSON.parse(configContent);
      
      const lastUpdated = new Date(config.lastUpdated);
      const now = new Date();
      const isExpired = (now.getTime() - lastUpdated.getTime()) > this.cacheExpiry;
      
      if (isExpired) {
        console.log('⏰ 价格配置已过期，正在从 OpenRouter 同步...');
        await this.fetchOpenRouterPricing();
      } else {
        const hoursLeft = Math.round((this.cacheExpiry - (now.getTime() - lastUpdated.getTime())) / (60 * 60 * 1000));
        console.log(`✅ 价格配置有效，${hoursLeft} 小时后过期`);
      }
    } catch (error: any) {
      console.warn(`⚠️ 检查价格更新失败: ${error.message}`);
    }
  }

  /**
   * 从配置文件加载价格
   */
  private async loadPricingConfig(): Promise<void> {
    try {
      const configContent = await fs.readFile(this.configPath, 'utf-8');
      const config: any = JSON.parse(configContent);
      
      // 读取配置文件中的设置
      if (config.settings) {
        this.autoSync = config.settings.autoSync ?? false;
        this.syncInterval = config.settings.syncInterval ?? (24 * 60 * 60 * 1000);
        this.cacheExpiry = config.settings.cacheExpiry ?? (24 * 60 * 60 * 1000);
        
        console.log(`⚙️ 配置: autoSync=${this.autoSync}, syncInterval=${this.syncInterval}ms, cacheExpiry=${this.cacheExpiry}ms`);
      }
      
      // 检查配置是否过期
      const lastUpdated = new Date(config.lastUpdated);
      const now = new Date();
      const isExpired = (now.getTime() - lastUpdated.getTime()) > this.cacheExpiry;
      
      if (isExpired) {
        console.warn(`⚠️ 价格配置已过期（更新于 ${config.lastUpdated}），建议更新`);
      }
      
      // 合并配置文件中的价格（覆盖默认价格）
      this.pricingCache = {
        ...DEFAULT_PRICING,
        ...config.models
      };
      
      console.log(`📊 已加载 ${Object.keys(config.models).length} 个模型的价格配置`);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // 配置文件不存在，创建默认配置
        await this.savePricingConfig();
        console.log('📝 已创建默认价格配置文件');
      } else {
        throw error;
      }
    }
  }

  /**
   * 保存价格配置到文件
   */
  private async savePricingConfig(): Promise<void> {
    // 转换价格为易读的字符串格式（避免科学计数法）
    const modelsWithReadablePricing: Record<string, any> = {};
    for (const [modelId, pricing] of Object.entries(this.pricingCache)) {
      modelsWithReadablePricing[modelId] = {
        input: pricing.input,
        output: pricing.output,
        source: pricing.source,
        lastUpdated: pricing.lastUpdated
      };
    }
    
    const config: any = {
      models: modelsWithReadablePricing,
      lastUpdated: new Date().toISOString(),
      version: '1.0.0',
      settings: {
        autoSync: this.autoSync,
        syncInterval: this.syncInterval,
        cacheExpiry: this.cacheExpiry
      },
      notes: [
        '价格单位：美元/1K tokens',
        '价格来源：各大模型官方定价（2026年1月）',
        '建议定期更新价格配置以保持准确性',
        '可以通过 API 接口更新价格或从 OpenRouter 同步',
        'autoSync: 是否自动同步价格（true/false）',
        'syncInterval: 同步间隔（86400000 毫秒，默认 24 小时）',
        'cacheExpiry: 缓存过期时间（86400000 毫秒，默认 24 小时）'
      ]
    };
    
    // 确保配置目录存在
    const configDir = path.dirname(this.configPath);
    await fs.mkdir(configDir, { recursive: true });
    
    // 先序列化为 JSON
    let jsonString = JSON.stringify(config, null, 2);
    
    // 使用正则表达式将科学计数法替换为小数格式
    // 匹配 "input": 3e-10 或 "output": 9e-10 这样的模式
    jsonString = jsonString.replace(/"(input|output)":\s*([0-9.]+)e-([0-9]+)/gi, (match, field, mantissa, exponent) => {
      const num = parseFloat(mantissa + 'e-' + exponent);
      const exp = parseInt(exponent);
      // 转换为固定小数位数
      let fixed = num.toFixed(exp + 10);
      // 去除尾部的 0
      fixed = fixed.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
      return `"${field}": ${fixed}`;
    });
    
    await fs.writeFile(
      this.configPath,
      jsonString,
      'utf-8'
    );
  }

  /**
   * 获取模型价格
   * @param model 模型名称
   * @returns 价格信息
   */
  getModelPricing(model: string | undefined): ModelPricing {
    if (!model) {
      return this.pricingCache['default'];
    }
    
    // 1. 精确匹配
    if (this.pricingCache[model]) {
      return this.pricingCache[model];
    }
    
    // 2. 模糊匹配
    const modelLower = model.toLowerCase();
    for (const [key, pricing] of Object.entries(this.pricingCache)) {
      if (key === 'default') continue;
      
      if (modelLower.includes(key.toLowerCase()) || key.toLowerCase().includes(modelLower)) {
        console.log(`🔍 模糊匹配: "${model}" → "${key}"`);
        return pricing;
      }
    }
    
    // 3. 使用默认价格
    console.warn(`⚠️ 未找到模型 "${model}" 的价格配置，使用默认价格`);
    return this.pricingCache['default'];
  }

  /**
   * 计算成本
   * @param model 模型名称
   * @param inputTokens 输入 Token 数量
   * @param outputTokens 输出 Token 数量
   * @returns 成本（美元）
   */
  calculateCost(model: string | undefined, inputTokens: number, outputTokens: number): number {
    const pricing = this.getModelPricing(model);
    const cost = (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;
    return cost;
  }

  /**
   * 更新模型价格（手动更新）
   * @param model 模型名称
   * @param pricing 价格信息
   */
  async updateModelPricing(model: string, pricing: Omit<ModelPricing, 'source' | 'lastUpdated'>): Promise<void> {
    this.pricingCache[model] = {
      ...pricing,
      source: 'config',
      lastUpdated: new Date().toISOString()
    };
    
    await this.savePricingConfig();
    console.log(`✅ 已更新模型 "${model}" 的价格配置`);
  }

  /**
   * 从 OpenRouter API 获取价格（如果使用 OpenRouter）
   * OpenRouter 提供统一的价格 API
   */
  async fetchOpenRouterPricing(): Promise<void> {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models');
      const data = await response.json();
      
      if (data.data && Array.isArray(data.data)) {
        let updatedCount = 0;
        let aliasUpdatedCount = 0;
        
        for (const modelInfo of data.data) {
          const modelId = modelInfo.id; // 完整ID，如 "z-ai/glm-4.6v"
          const pricing = modelInfo.pricing;
          
          if (pricing && pricing.prompt && pricing.completion) {
            const pricingData = {
              input: parseFloat(pricing.prompt) / 1000,
              output: parseFloat(pricing.completion) / 1000,
              source: 'api' as const,
              lastUpdated: new Date().toISOString()
            };
            
            // 1. 更新完整ID
            this.pricingCache[modelId] = pricingData;
            updatedCount++;
            
            // 2. 检查是否存在简化名称的配置（如 "glm-4.6v"）
            // 提取模型名称部分（去掉厂商前缀）
            const parts = modelId.split('/');
            if (parts.length === 2) {
              const simpleName = parts[1]; // 如 "glm-4.6v"
              
              // 如果简化名称已存在，也更新它（无论之前的 source 是什么）
              if (this.pricingCache[simpleName]) {
                this.pricingCache[simpleName] = {
                  ...pricingData,
                  source: 'api' // 标记为从API更新
                };
                aliasUpdatedCount++;
              }
            }
          }
        }
        
        await this.savePricingConfig();
        console.log(`✅ 从 OpenRouter 更新了 ${updatedCount} 个模型的价格`);
        if (aliasUpdatedCount > 0) {
          console.log(`✅ 同时更新了 ${aliasUpdatedCount} 个简化名称的价格`);
        }
      }
    } catch (error: any) {
      console.error(`❌ 从 OpenRouter 获取价格失败: ${error.message}`);
    }
  }

  /**
   * 获取所有模型价格配置
   */
  getAllPricing(): Record<string, ModelPricing> {
    return { ...this.pricingCache };
  }

  /**
   * 导出价格配置（用于备份或分享）
   */
  async exportPricing(outputPath: string): Promise<void> {
    const config: ModelPricingConfig = {
      models: this.pricingCache,
      lastUpdated: new Date().toISOString(),
      version: '1.0.0'
    };
    
    await fs.writeFile(
      outputPath,
      JSON.stringify(config, null, 2),
      'utf-8'
    );
    
    console.log(`✅ 价格配置已导出到: ${outputPath}`);
  }

  /**
   * 导入价格配置
   */
  async importPricing(inputPath: string): Promise<void> {
    const configContent = await fs.readFile(inputPath, 'utf-8');
    const config: ModelPricingConfig = JSON.parse(configContent);
    
    // 合并导入的价格
    this.pricingCache = {
      ...this.pricingCache,
      ...config.models
    };
    
    await this.savePricingConfig();
    console.log(`✅ 已导入 ${Object.keys(config.models).length} 个模型的价格配置`);
  }
}
