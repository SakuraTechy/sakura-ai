import type { AxureParseResult, PageMode, PlatformType } from '../types/axure.js';
import type { EnhancedAxureData } from '../types/aiPreAnalysis.js';
import { llmConfigManager } from '../../src/services/llmConfigManager.js';
import { modelRegistry } from '../../src/services/modelRegistry.js';
import type { LLMConfig } from './aiParser.js';
import { ProxyAgent } from 'undici';
import { TestCaseKnowledgeBase } from './testCaseKnowledgeBase.js';
import { getWebRequirementPrompt } from '../prompts/web-requirement.prompt.js';
import { getMobileRequirementPrompt } from '../prompts/mobile-requirement.prompt.js';
import { getTextRequirementPrompt, type ContentSourceType } from '../prompts/text-requirement.prompt.js';
import { getUserPrompt, getBusinessRulesSystemPrompt, getCommonSystemInstructions } from '../prompts/common-instructions.js';
import { TestConfigService } from './testConfigService.js';

/**
 * 项目配置信息（用于AI生成测试步骤）
 */
export interface ProjectConfigForAI {
  serverUrl?: string;       // 服务器访问地址
  loginUrl?: string;        // 登录页面地址
  accounts?: {              // 账号配置
    admin?: { username: string; password: string };
    security?: { username: string; password: string };
    auditor?: { username: string; password: string };
    default?: { username: string; password: string };
  };
}

/**
 * 项目信息
 */
export interface ProjectInfo {
  systemName?: string;      // 系统名称
  moduleName?: string;       // 模块名称
  platformType?: PlatformType; // 平台类型(web/mobile)
  businessRules?: string[];  // 补充业务规则
}

/**
 * 批次信息
 */
export interface Batch {
  id: string;
  name: string;
  priority: string;
  scenarios: string[];
  estimatedCount: number;
}

/**
 * 🆕 测试场景（阶段1输出）
 */
export interface TestScenario {
  id: string;
  name: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  relatedSections: string[]; // 关联的章节ID，如 ["1.1", "1.2"]
  estimatedTestPoints?: number; // 🆕 预估测试点数量
  testPoints?: TestPoint[]; // 可选，阶段2生成后才有
  testCase?: TestCase; // 可选，阶段3生成后才有
  isExpanded?: boolean; // 🆕 是否展开测试点列表（前端UI状态）
}

/**
 * 兼容性：保留旧接口名称（已废弃，使用TestScenario）
 * @deprecated 使用 TestScenario 代替
 */
export type TestModule = TestScenario;

/**
 * 兼容性：保留旧接口（已废弃）
 * @deprecated 使用 TestPoint 代替
 */
export interface TestPurpose {
  id: string;
  name: string;
  description: string;
  coverageAreas: string;
  estimatedTestPoints: number;
  priority: 'high' | 'medium' | 'low';
  testCase?: TestCase;
}

/**
 * 测试点（阶段2输出）
 */
export interface TestPoint {
  testScenario?: string; // 🆕 测试场景（每个测试点都应该有）
  testPoint: string; // 测试点名称
  steps: string; // 测试步骤
  expectedResult: string; // 预期结果
  riskLevel?: string; // 风险等级
  testPurpose?: string; // 🆕 测试目的（与测试用例的 testPurpose 相同）
  description?: string; // 测试点描述
  coverageAreas?: string; // 覆盖范围
  estimatedTestCases?: number; // 预估测试用例数量
}

/**
 * 测试用例
 */
export interface TestCase {
  name: string;
  description: string;
  steps: string;
  assertions: string;
  priority: string;
  tags: string[];
  system: string;
  module: string;
  testType?: string;
  preconditions?: string;
  testData?: string;
  // 新增字段
  testScenario?: string; // 测试场景
  testScenarioId?: string; // 测试场景ID
  testPoints?: TestPoint[]; // 测试点数组
  sectionId?: string; // 章节ID (1.1, 1.2)
  sectionName?: string; // 章节名称
  coverageAreas?: string; // 覆盖范围
  caseType?: string; // 用例类型: SMOKE(冒烟) | FULL(全量) | ABNORMAL(异常) | BOUNDARY(边界) | PERFORMANCE(性能) | SECURITY(安全) | USABILITY(可用性) | COMPATIBILITY(兼容性)
  // 兼容性字段
  testPurpose?: string; // 兼容旧字段（已废弃，使用testScenario）
  // 🆕 数据一致性验证标记
  isFiltered?: boolean; // 是否被过滤（数据一致性验证失败）
  filterReason?: string; // 过滤原因
}

/**
 * 🆕 测试用例生成结果（包含过滤信息）
 */
export interface TestCaseGenerationResult {
  validCases: TestCase[]; // 有效的测试用例
  filteredCases: TestCase[]; // 被过滤的测试用例（数据一致性问题）
  totalGenerated: number; // AI生成的总数量
  validCount: number; // 有效数量
  filteredCount: number; // 被过滤数量
}

/**
 * 功能测试用例AI生成服务
 */
export class FunctionalTestCaseAIService {
  private useConfigManager: boolean = true;
  private knowledgeBase: TestCaseKnowledgeBase | null = null; // 🔥 改为可选
  private knowledgeBaseAvailable: boolean = false;

  constructor() {
    console.log('🤖 功能测试用例AI服务已初始化');

    // 🔥 不再在构造函数中初始化知识库，改为在使用时动态初始化
    console.log('💡 知识库服务将按需动态初始化（支持多系统）');
  }

  /**
   * 🔥 新增：获取或创建指定系统的知识库实例
   */
  private getKnowledgeBase(systemName?: string): TestCaseKnowledgeBase {
    // 每次都创建新实例,确保使用正确的系统集合
    return new TestCaseKnowledgeBase(systemName);
  }

  /**
   * 初始化配置管理器
   */
  private async initializeConfigManager(): Promise<void> {
    try {
      if (!llmConfigManager.isReady()) {
        await llmConfigManager.initialize();
      }
      console.log('🔧 功能测试用例AI服务配置已加载');
    } catch (error) {
      console.error('❌ 配置管理器初始化失败:', error);
      this.useConfigManager = false;
    }
  }

  /**
   * 获取当前LLM配置
   */
  private async getCurrentConfig(): Promise<LLMConfig> {
    if (this.useConfigManager) {
      try {
        if (!llmConfigManager.isReady()) {
          await Promise.race([
            this.initializeConfigManager(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('配置管理器初始化超时')), 5000)
            )
          ]);
        }

        if (llmConfigManager.isReady()) {
          const config = llmConfigManager.getCurrentConfig();
          console.log(`🔧 使用配置管理器配置: ${config.model}`);
          return config;
        }
      } catch (error: any) {
        console.error('❌ 配置管理器初始化失败，回退到默认配置:', error.message);
        this.useConfigManager = false;
      }
    }

    // 回退到默认配置（从环境变量读取）
    const defaultConfig = {
      apiKey: process.env.OPENROUTER_API_KEY || '',
      baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
      model: process.env.DEFAULT_MODEL || 'openai/gpt-4o',
      temperature: parseFloat(process.env.DEFAULT_TEMPERATURE || '0.3'),
      maxTokens: parseInt(process.env.DEFAULT_MAX_TOKENS || '4000')
    };

    // 验证配置有效性
    if (!defaultConfig.apiKey || defaultConfig.apiKey === '') {
      console.error('❌ API Key 未配置！请在 .env 文件中设置 OPENROUTER_API_KEY');
      throw new Error('API Key 未配置，无法调用 AI 服务');
    }

    console.log(`⚠️ 使用默认配置: ${defaultConfig.model}`);
    console.log(`🔑 API Key 来源: ${process.env.OPENROUTER_API_KEY ? '环境变量' : '硬编码回退值'}`);
    return defaultConfig;
  }

  /**
   * 格式化时间为易读格式 (YYYY-MM-DD HH:mm:ss.SSS)
   */
  private formatTime(timestamp?: number | Date): string {
    const date = timestamp ? (typeof timestamp === 'number' ? new Date(timestamp) : timestamp) : new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
  }

  /**
   * 根据 baseUrl 获取提供商名称
   */
  private getProviderName(baseUrl: string, modelId?: string): string {
    if (baseUrl.includes('dashscope.aliyuncs.com')) {
      return '阿里云通义千问';
    } else if (baseUrl.includes('api.deepseek.com')) {
      return 'DeepSeek';
    } else if (baseUrl.includes('open.bigmodel.cn')) {
      return '智谱AI';
    } else if (baseUrl.includes('aip.baidubce.com')) {
      return '百度文心一言';
    } else if (baseUrl.includes('api.moonshot.cn')) {
      return '月之暗面Kimi';
    } else if (baseUrl.includes('zenmux.ai')) {
      return 'Zenmux (Gemini)';
    } else if (baseUrl.includes('openrouter.ai')) {
      return 'OpenRouter';
    } else {
      // 尝试从 modelRegistry 获取
      if (modelId) {
        try {
          const model = modelRegistry.getModelById(modelId);
          if (model) {
            return model.provider;
          }
        } catch {
          // 忽略错误
        }
      }
      return '未知提供商';
    }
  }

  /**
   * 获取模型的最大 tokens 限制
   */
  private getMaxTokensLimit(modelId: string, baseUrl: string): number {
    // 根据模型提供商和 baseUrl 判断限制
    if (baseUrl.includes('dashscope.aliyuncs.com')) {
      // 阿里云通义千问：限制为 8192
      return 8192;
    } else if (baseUrl.includes('api.deepseek.com')) {
      // DeepSeek：支持更大，但为安全起见限制为 4096
      return 8192;
    } else if (baseUrl.includes('open.bigmodel.cn')) {
      // 智谱GLM：限制为 4096
      return 4096;
    } else if (baseUrl.includes('aip.baidubce.com')) {
      // 百度文心一言：限制为 8192
      return 2048;
    } else if (baseUrl.includes('api.moonshot.cn')) {
      // 月之暗面Kimi：限制为 8192
      return 8192;
    } else if (baseUrl.includes('zenmux.ai')) {
      // Zenmux（Gemini 3 Pro）：限制为 4096
      return 4096;
    } else {
      // 默认限制（OpenRouter 等）：8192
      return 8192;
    }
  }

  /**
   * 调用AI模型
   */
  private async callAI(systemPrompt: string, userPrompt: string, maxTokens?: number): Promise<string> {
    return this.callAIWithRetry(systemPrompt, userPrompt, maxTokens, 3);
  }

  /**
   * 带速率限制重试的AI调用
   */
  private async callAIWithRetry(systemPrompt: string, userPrompt: string, maxTokens: number | undefined, maxRetries: number): Promise<string> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.callAIInternal(systemPrompt, userPrompt, maxTokens);
      } catch (error: any) {
        const isRateLimit = error.message?.includes('429') || 
                           error.message?.includes('速率限制') || 
                           error.message?.includes('rate limit') ||
                           error.message?.includes('限流') ||
                           error.message?.includes('1302');
        if (isRateLimit && attempt < maxRetries) {
          const waitTime = Math.min(5000 * Math.pow(2, attempt), 30000); // 5s, 10s, 20s
          console.warn(`⚠️ [速率限制] 第 ${attempt + 1} 次重试，等待 ${waitTime / 1000} 秒...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        throw error;
      }
    }
    throw new Error('AI调用失败：超过最大重试次数');
  }

  /**
   * 实际AI调用逻辑
   */
  private async callAIInternal(systemPrompt: string, userPrompt: string, maxTokens?: number): Promise<string> {
    const config = await this.getCurrentConfig();
    const startTime = Date.now();

    // 🔥 检测 API 格式
    const apiFormat = config.apiFormat || 'openai';
    const isOllamaFormat = apiFormat === 'ollama';

    // 🔥 获取该模型的最大 tokens 限制
    const maxTokensLimit = this.getMaxTokensLimit(config.model, config.baseUrl);
    
    // 🔥 验证并限制 maxTokens
    let finalMaxTokens = maxTokens || config.maxTokens;
    if (finalMaxTokens > maxTokensLimit) {
      console.warn(`⚠️ Max Tokens ${finalMaxTokens} 超过模型限制 ${maxTokensLimit}，已调整为 ${maxTokensLimit}`);
      finalMaxTokens = maxTokensLimit;
    }

    // 🔥 获取提供商名称（动态，不写死）
    const providerName = isOllamaFormat ? 'Ollama (本地)' : this.getProviderName(config.baseUrl, config.model);
    
    // 🔥 根据 API 格式确定端点
    const apiEndpoint = isOllamaFormat 
      ? `${config.baseUrl}/api/generate`
      : `${config.baseUrl}/chat/completions`;

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🚀 [AI调用] 开始调用AI模型`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`   模型标识: ${config.model}`);
    console.log(`   提供商: ${providerName}`);
    console.log(`   API格式: ${apiFormat}`);
    console.log(`   API端点: ${apiEndpoint}`);
    console.log(`   API Key状态: ${config.apiKey ? '已设置 (长度: ' + config.apiKey.length + ')' : '❌ 未设置'}`);
    console.log(`   参数配置:`);
    console.log(`     - Temperature: ${config.temperature}`);
    console.log(`     - Max Tokens: ${finalMaxTokens} (限制: ${maxTokensLimit})`);
    console.log(`   提示词统计:`);
    console.log(`     - System Prompt: ${systemPrompt.length} 字符`);
    console.log(`     - User Prompt: ${userPrompt.length} 字符`);
    console.log(`     - 总计: ${systemPrompt.length + userPrompt.length} 字符`);

    try {
      // 🔥 根据 API 格式构建不同的请求体
      let requestBody: any;
      
      if (isOllamaFormat) {
        // Ollama 原生 API 格式
        requestBody = {
          model: config.model,
          prompt: `${systemPrompt}\n\n${userPrompt}`,
          stream: false,
          options: {
            temperature: config.temperature,
            num_predict: finalMaxTokens
          }
        };
      } else {
        // OpenAI 兼容 API 格式
        requestBody = {
          model: config.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: config.temperature,
          max_tokens: finalMaxTokens
        };
      }

      // 🔥 打印请求详情（隐藏敏感信息）
      console.log(`\n📤 [请求] 准备发送请求到 ${providerName}...`);

      // 🔥 打印请求头信息（隐藏敏感信息）
      const headersForLog: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (config.apiKey && !isOllamaFormat) {
        headersForLog['Authorization'] = `Bearer ${config.apiKey.substring(0, 10)}...`;
        headersForLog['HTTP-Referer'] = 'https://Sakura AI-ai.com';
        headersForLog['X-Title'] = 'Sakura AI AI Testing Platform';
      }
      console.log(`   请求头:`, headersForLog);

      const requestBodyForLog = isOllamaFormat 
        ? {
            ...requestBody,
            prompt: requestBody.prompt.substring(0, 100) + (requestBody.prompt.length > 100 ? '...' : '')
          }
        : {
            ...requestBody,
            messages: requestBody.messages.map((msg: any) => ({
              role: msg.role,
              content: msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : '')
            }))
          };
      console.log(`   请求体预览:`, JSON.stringify(requestBodyForLog, null, 2));

      const fetchOptions: any = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      };

      // 🔥 添加认证头
      if (config.apiKey) {
        fetchOptions.headers['Authorization'] = `Bearer ${config.apiKey}`;
      }

      // OpenAI/OpenRouter 额外头部
      if (!isOllamaFormat) {
        fetchOptions.headers['HTTP-Referer'] = 'https://Sakura AI-ai.com';
        fetchOptions.headers['X-Title'] = 'Sakura AI AI Testing Platform';
      }

      // 配置代理（如果环境变量中有配置）
      const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
      console.log(`   代理: ${proxyUrl}`);

      // 如果配置了代理，使用 undici 的 ProxyAgent
      if (proxyUrl) {
        console.log(`   🌐 使用代理: ${proxyUrl}`);
        fetchOptions.dispatcher = new ProxyAgent(proxyUrl);
      } else {
        console.log(`   📡 直连模式（未配置代理）`);
      }

      const requestStartTime = Date.now();
      console.log(`   ⏱️  请求发送时间: ${this.formatTime()}`);

      const response = await fetch(apiEndpoint, fetchOptions);
      const requestDuration = Date.now() - requestStartTime;

      console.log(`\n📥 [响应] 收到 ${providerName} 响应`);
      console.log(`   HTTP状态码: ${response.status} ${response.statusText}`);
      console.log(`   请求耗时: ${requestDuration}ms`);
      console.log(`   响应头:`, {
        'content-type': response.headers.get('content-type'),
        'x-ratelimit-limit': response.headers.get('x-ratelimit-limit'),
        'x-ratelimit-remaining': response.headers.get('x-ratelimit-remaining'),
        'x-ratelimit-reset': response.headers.get('x-ratelimit-reset')
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`\n❌ [错误] ${providerName} API调用失败`);
        console.error(`   错误详情: ${errorText}`);
        console.error(`   请求模型: ${config.model}`);
        console.error(`   请求URL: ${apiEndpoint}`);
        console.error(`   请求耗时: ${requestDuration}ms`);

        // 区分不同的错误类型
        let errorMessage = '';
        if (response.status === 401) {
          errorMessage = `❌ 认证失败 (401): API Key无效或已过期。请检查API密钥配置`;
        } else if (response.status === 429) {
          errorMessage = `❌ 请求限流 (429): API调用频率过高，请稍后重试`;
        } else if (response.status === 402) {
          errorMessage = `❌ 配额不足 (402): ${providerName}账户余额不足，请充值`;
        } else if (response.status === 404) {
          errorMessage = isOllamaFormat
            ? `❌ Ollama 服务未找到 (404): 请确认 Ollama 正在运行且端口正确`
            : `❌ 模型不存在 (404): 模型 "${config.model}" 在${providerName}上不可用`;
        } else if (response.status >= 500) {
          errorMessage = `❌ 服务器错误 (${response.status}): ${providerName}服务异常，请稍后重试`;
        } else {
          errorMessage = `AI API调用失败 (${response.status}): ${errorText}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log(`   响应体:`, JSON.stringify(data, null, 2));
      const totalDuration = Date.now() - startTime;

      // 🔥 根据 API 格式解析响应
      let content: string;
      
      if (isOllamaFormat) {
        // Ollama 格式响应
        console.log(`\n✅ [成功] ${providerName} 响应解析完成`);
        console.log(`   模型: ${data.model || config.model}`);
        if (data.eval_count) {
          console.log(`   Token统计: ${data.eval_count} tokens`);
        }
        console.log(`   总耗时: ${totalDuration}ms`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

        if (!data.response) {
          console.error(`❌ Ollama API返回数据格式异常:`, JSON.stringify(data, null, 2));
          throw new Error(`Ollama API返回格式异常: 缺少 response 字段`);
        }
        content = data.response;
      } else {
        // OpenAI 格式响应
        console.log(`\n✅ [成功] ${providerName} 响应解析完成`);
        console.log(`   响应ID: ${data.id || 'N/A'}`);
        console.log(`   模型: ${data.model || config.model}`);
        console.log(`   创建时间: ${data.created ? this.formatTime(data.created * 1000) : 'N/A'}`);
        if (data.usage) {
          console.log(`   使用统计:`);
          console.log(`     - Prompt Tokens: ${data.usage.prompt_tokens || 0}`);
          console.log(`     - Completion Tokens: ${data.usage.completion_tokens || 0}`);
          console.log(`     - Total Tokens: ${data.usage.total_tokens || 0}`);
        }
        if (data.choices && data.choices[0]) {
          const choice = data.choices[0];
          console.log(`   响应内容:`);
          console.log(`     - Finish Reason: ${choice.finish_reason || 'N/A'}`);
          console.log(`     - 内容长度: ${choice.message?.content?.length || 0} 字符`);
          if (choice.message?.content) {
            const preview = choice.message.content.substring(0, 200);
            console.log(`     - 内容预览: ${preview}${choice.message.content.length > 200 ? '...' : ''}`);
          }
        }
        console.log(`   总耗时: ${totalDuration}ms (请求: ${requestDuration}ms, 解析: ${totalDuration - requestDuration}ms)`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
          console.error(`❌ API返回数据格式异常:`, JSON.stringify(data, null, 2));
          throw new Error(`AI API返回格式异常: 缺少 choices 或 message 字段`);
        }
        content = data.choices[0].message.content;
      }

      return content;
    } catch (error: any) {
      const totalDuration = Date.now() - startTime;
      
      // 增强错误日志
      if (error.name === 'TypeError' && error.message === 'fetch failed') {
        console.error(`\n❌ [网络错误] 无法连接到 ${providerName}`);
        console.error(`   API端点: ${apiEndpoint}`);
        console.error(`   总耗时: ${totalDuration}ms`);
        console.error(`   💡 可能原因:`);
        console.error(`      1. 网络连接问题（请检查网络设置）`);
        console.error(`      2. API端点不可达（请检查防火墙/代理设置）`);
        console.error(`      3. DNS解析失败（请检查DNS配置）`);
        if (isOllamaFormat) {
          console.error(`      4. Ollama 服务未启动（请运行 ollama serve）`);
        }
        console.error(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
        throw new Error(`❌ 网络连接失败: 无法访问 ${providerName} API。请检查网络连接。`);
      }

      console.error(`\n❌ [失败] ${providerName} AI调用失败`);
      console.error(`   错误类型: ${error.name || 'Unknown'}`);
      console.error(`   错误消息: ${error.message}`);
      console.error(`   总耗时: ${totalDuration}ms`);
      console.error(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
      throw error;
    }
  }

  /**
   * 生成需求文档（支持增强数据）
   * @param axureData Axure解析结果
   * @param projectInfo 项目信息
   * @param enhancedData 增强数据（可选，来自用户确认）
   */
  async generateRequirementDoc(
    axureData: AxureParseResult,
    projectInfo: ProjectInfo,
    enhancedData?: EnhancedAxureData
  ): Promise<{ requirementDoc: string; completeness: number; suggestions: string[] }> {
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║           🤖 开始生成需求文档 - 详细日志模式                ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    // 📊 输入数据日志
    console.log('📊 【步骤 1/5】输入数据统计:');
    console.log(`   - 系统名称: ${projectInfo.systemName || '未指定'}`);
    console.log(`   - 模块名称: ${projectInfo.moduleName || '未指定'}`);
    console.log(`   - 业务规则数量: ${projectInfo.businessRules?.length || 0}`);
    console.log(`   - Axure 页面数: ${axureData.pageCount}`);
    console.log(`   - Axure 元素数: ${axureData.elementCount}`);
    console.log(`   - Axure 交互数: ${axureData.interactionCount}\n`);

    // 📄 详细页面信息
    console.log('📄 【步骤 2/5】Axure 页面详情:');
    (axureData.pages || []).forEach((page, index) => {
      console.log(`\n   页面 ${index + 1}: "${page.name || '未命名'}"`);
      console.log(`      - 元素数量: ${(page.elements || []).length}`);
      console.log(`      - 交互数量: ${(page.interactions || []).length}`);

      // 显示前5个元素
      if ((page.elements || []).length > 0) {
        console.log(`      - 主要元素:`);
        (page.elements || []).slice(0, 5).forEach(elem => {
          const displayText = elem.text ? `"${elem.text}"` : (elem.placeholder ? `[${elem.placeholder}]` : (elem.name || '未命名'));
          console.log(`         • ${elem.type}: ${displayText}`);
        });
        if ((page.elements || []).length > 5) {
          console.log(`         ... 还有 ${(page.elements || []).length - 5} 个元素`);
        }
      }
    });
    console.log('');

    // 🆕 构建增强上下文（如果有用户确认数据）
    let enhancedContext = '';
    if (enhancedData) {
      console.log('✅ 检测到用户确认的增强数据，将注入到AI提示词中...');
      console.log('   🔥 页面类型:', enhancedData.enrichedInfo.pageType);
      console.log('   📊 确认的枚举数量:', Object.keys(enhancedData.enrichedInfo.confirmedEnums).length);
      console.log('   📊 确认的规则数量:', enhancedData.enrichedInfo.confirmedRules.length);
      enhancedContext = this.buildEnhancedContext(enhancedData);
      console.log('   📝 增强上下文长度:', enhancedContext.length, '字符');
      if (enhancedContext.length > 0) {
        console.log('   ✅ 增强上下文预览:\n', enhancedContext.substring(0, 500) + '...');
      }
    }

    const systemPrompt = `你是需求分析专家，基于Axure原型生成详细的功能需求文档。

${enhancedContext}

🚨 核心原则（必须严格遵守）:
1. 严格基于用户上传的实际原型内容，禁止编造任何字段或功能
2. 每个功能、字段都必须注明来源：(来源: 页面名-元素名)
3. 不确定的部分必须标注[待确认]或[推断]
4. 主业务页面为主，弹窗/导航归属到主页面
5. 🚫 绝对禁止输出任何示例占位符或自己编造的字段名

📋 必须包含的内容:

**一、页面结构（仅当原型中存在时才写）**

⚠️ **重要：首先识别页面类型，然后根据页面类型生成对应章节！**

🔍 **页面类型识别规则**：
- **列表页（list）**：包含"查询"/"搜索"按钮，主要展示数据列表
  → 需要生成：查询条件、列表展示字段、操作按钮
- **表单页（form）**：包含"保存"/"提交"按钮，主要用于新建/编辑数据
  → 需要生成：表单字段、操作按钮（不要生成查询条件）
- **详情页（detail）**：只读展示，无输入框，包含大量展示内容
  → 需要生成：详情展示字段、操作按钮（不要生成查询条件）
- **弹窗页（dialog）**：独立弹窗，根据内容判断是表单还是详情
- **混合页（mixed）**：包含多种功能，根据实际情况生成
- **未知页（unknown）**：无法判断，谨慎处理

📝 **input/select 元素的正确归类**：
- **列表页** → 查询条件（过滤数据用）
- **表单页** → 表单字段（创建/编辑数据用）
- **详情页** → 通常不应该有input/select（如果有，可能是混合页）

🎯 **章节生成规则**：

🔥🔥🔥 **最重要：所有页面类型都必须生成"操作按钮"章节！**
⚠️ 无论页面类型如何，必须从原型中提取所有 type="button" 的元素！

**对于列表页（list）**：
- 查询条件：
  * 从 **"查询条件字段 - 输入框/下拉框"** 部分的 type="input" 或 type="select" 元素中提取
  * 这些是用户用来过滤列表数据的条件
  * 如果元素有name属性，name就是查询条件字段名

- 列表展示字段（🔥 重要！）：
  * 从 **"列表字段 - div文本元素"** 部分的 type="div" 元素中提取
  * 🔥 这些 div 文本就是表格的列头名称！必须全部列出！
  * 例如看到 '- div: "客户名称"' 就生成一行：| 客户名称 | 文本 | - | 显示客户名称 | 集配管理-div |
  * 例如看到 '- div: "当前审批节点"' 就生成一行：| 当前审批节点 | 文本 | - | 显示当前审批节点 | 集配管理-div |
  * 例如看到 '- div: "结算总金额（集采含税采购成本）（元）"' 就生成一行：| 结算总金额（集采含税采购成本）（元）| 金额 | 元 | 显示结算总金额 | 集配管理-div |
  * ⚠️ 如果某个字段名已经在查询条件中出现，在列表中就不要重复

- 🔥 操作按钮（必须章节！）：
  * 从 **"操作按钮"** 部分的 type="button" 元素中提取 **所有按钮**
  * 包括：查询、重置、导出、新增、编辑、删除、审核等
  * 每个按钮都要列出，不要遗漏！

**对于表单页（form）**：
- 🚫 不要生成"查询条件"章节！
- 表单字段：
  * 从 type="input" 或 type="select" 的元素中提取
  * 这些是用户用来输入/编辑数据的字段
  * 记录字段名、控件类型、必填项、默认值、说明

- 🔥 操作按钮（必须章节！）：
  * 从 type="button" 的元素中提取 **所有按钮**
  * 通常包括："保存"/"提交"/"取消"/"返回"等
  * 每个按钮都要列出，不要遗漏！

**对于详情页（detail）**：
- 🚫 不要生成"查询条件"章节！
- 详情展示字段：
  * 从 type="div" 的元素中提取
  * 这些是只读展示的数据字段

- 🔥 操作按钮（必须章节！）：
  * 从 type="button" 的元素中提取 **所有按钮**
  * 通常包括："返回"/"编辑"/"删除"等
  * 每个按钮都要列出，不要遗漏！

**对于混合页（mixed）或未知页（unknown）**：
- 🔥 操作按钮（最重要！绝对不能遗漏！）：
  * 必须从原型中提取 **所有 type="button" 的元素**
  * 如果原型中有10个按钮，就必须在表格中列出10行
  * 如果原型中有20个按钮，就必须在表格中列出20行
  * 不要因为按钮太多就省略，每个按钮都很重要！

**二、表单详细定义（仅当原型中存在表单时才写）**
从原型中逐个提取每个字段的:
- 实际字段名称 (来源: 页面名-label文字)
- 控件类型 (输入框/下拉/单选/多选/日期选择器)
- 是否必填 (通过查找"*"标记确定)
- 数据类型和长度限制 (从"0/100"等字样提取)
- 默认值 (如原型中有)
- 选项内容 (单选/多选按钮的实际选项列表)
- 提示文字/占位符

**三、操作流程与交互**
从原型中提取:
- 按钮操作的实际行为
- 二次确认弹窗的实际提示文案
- 成功/失败反馈的实际消息

**四、校验规则**
基于原型内容推断:
- 必填校验：标有"*"的字段
- 格式校验：根据字段类型推断
- 长度限制：从原型中提取
- 数值范围：根据业务场景推断

**五、业务规则 (🚨 极其重要！！！)**
⚠️ **必须从原型中完整提取所有业务规则说明文字**,这些文字通常是长段落的文本,包含:
- 计算规则(如"结算总金额=商品价格之和+运费")
- 流程规则(如"审核通过时,需要...")
- 校验规则(如"需要校验库存是否能扣减成功")
- 拦截规则(如"当存在商品运费拉取失败时,需要拦截...")
- 状态变化规则(如"超时未上传则自动终止")
🎯 **提取要求**:
1. 逐字逐句完整提取,不要遗漏任何一条规则
2. 保持原文表述,不要改写或简化
3. 每条规则都必须注明来源
4. 特别关注包含"审核"、"校验"、"拦截"、"确认"、"运费"、"库存"、"结算总金额"等关键词的长文本段落

📤 输出格式（重要：必须带章节编号）:
---REQUIREMENT_DOC---
# [实际系统名称]需求文档

## 1. [实际模块名称]

### 1.1 [实际页面名称]

⚠️ **页面类型：[list/form/detail/dialog/mixed/unknown]** ← 必须先标注页面类型！

📋 **根据页面类型生成对应章节**：

**如果是列表页（list）**，生成以下章节：

#### 1.1.1 页面布局与文案校验
本章节用于验证页面的基本呈现是否符合设计要求。

**必须验证的内容：**
1. **页面标题与导航**: 页面标题文案正确，面包屑导航路径准确
2. **布局结构**: 查询区域、列表区域、按钮区域布局合理，无遮挡或错位
3. **表格列头**: 所有列头文案与原型一致，顺序正确
4. **按钮文案**: 所有操作按钮的文案、位置、样式与原型一致
5. **提示文案**: 空状态提示、加载提示、错误提示等文案友好且准确
6. **字段标签**: 查询条件的标签文案清晰准确，必填项有明显标识

#### 1.1.2 查询条件
| 字段名 | 控件类型 | 必填 | 默认值 | 说明 | 来源 |
|--------|---------|------|--------|------|------|
（此处填入从原型提取的实际字段，不要写任何占位符）

#### 1.1.3 列表展示字段
| 字段名 | 数据类型 | 格式 | 说明 | 来源 |
|--------|---------|------|------|------|
（此处填入从原型提取的实际字段，不要写任何占位符）

#### 1.1.4 操作按钮 ← 🔥 必须生成！
| 按钮名称 | 按钮类型 | 权限要求 | 触发条件 | 操作说明 | 来源 |
|---------|---------|---------|---------|---------|------|
（此处填入从原型提取的所有按钮，每个按钮一行，格式：按钮名称 | 主要/次要 | 需要XX权限 | 满足XX条件时可用 | 点击后执行XX操作 | 来源页面）

#### 1.1.5 业务规则
（提取原型中的实际业务规则文案）

**如果是表单页（form）**，生成以下章节：

#### 1.1.1 页面布局与文案校验
本章节用于验证页面的基本呈现是否符合设计要求。

**必须验证的内容：**
1. **页面标题与导航**: 页面标题文案正确（如"新增订单"、"编辑订单"），面包屑导航路径准确
2. **布局结构**: 表单区域布局合理，字段分组清晰，按钮位置符合交互规范
3. **字段标签**: 所有字段标签文案准确，必填项有红色星号标识
4. **按钮文案**: 提交/保存/取消等按钮文案与原型一致，主次关系明确
5. **提示文案**: 字段说明、校验提示、操作提示等文案友好且准确
6. **默认值显示**: 有默认值的字段正确显示初始值

#### 1.1.2 表单字段
| 字段名 | 控件类型 | 必填 | 默认值 | 说明 | 来源 |
|--------|---------|------|--------|------|------|
（此处填入从原型提取的实际字段，不要写任何占位符）

#### 1.1.3 操作按钮 ← 🔥 必须生成！
| 按钮名称 | 按钮类型 | 权限要求 | 触发条件 | 操作说明 | 来源 |
|---------|---------|---------|---------|---------|------|
（此处填入从原型提取的所有按钮，通常是"保存"/"提交"/"取消"等）

#### 1.1.4 业务规则
（提取原型中的实际业务规则文案）

**如果是详情页（detail）**，生成以下章节：

#### 1.1.1 页面布局与文案校验
本章节用于验证页面的基本呈现是否符合设计要求。

**必须验证的内容：**
1. **页面标题与导航**: 页面标题文案正确（如"订单详情"、"客户详情"），面包屑导航路径准确
2. **布局结构**: 详情区域布局合理，信息分组清晰（如基本信息、详细信息、操作记录等）
3. **字段标签**: 所有字段标签文案准确，与数据对应关系清晰
4. **按钮文案**: 返回/编辑/删除等按钮文案与原型一致
5. **提示文案**: 状态提示、操作提示等文案友好且准确
6. **数据展示格式**: 日期、金额、状态等字段按规定格式展示

#### 1.1.2 详情展示字段
| 字段名 | 数据类型 | 格式 | 说明 | 来源 |
|--------|---------|------|------|------|
（此处填入从原型提取的实际字段，不要写任何占位符）

#### 1.1.3 操作按钮 ← 🔥 必须生成！
| 按钮名称 | 按钮类型 | 权限要求 | 触发条件 | 操作说明 | 来源 |
|---------|---------|---------|---------|---------|------|
（此处填入从原型提取的所有按钮，通常是"返回"/"编辑"等）

#### 1.1.4 业务规则
（提取原型中的实际业务规则文案）

**如果是混合页（mixed）或未知页（unknown）**：

🔥 **重要：无论页面类型如何，必须按以下顺序生成章节！**

#### 1.1.1 页面布局与文案校验
本章节用于验证页面的基本呈现是否符合设计要求。

**必须验证的内容：**
1. **页面标题与导航**: 页面标题文案正确，面包屑导航路径准确
2. **布局结构**: 各功能区域布局合理，无遮挡或错位
3. **字段与列头**: 所有字段标签、列头文案与原型一致
4. **按钮文案**: 所有操作按钮的文案、位置、样式与原型一致
5. **提示文案**: 各类提示信息文案友好且准确
6. **数据展示格式**: 日期、金额、状态等字段按规定格式展示

#### 1.1.2 查询条件（如果有输入框用于查询）
| 字段名 | 控件类型 | 必填 | 默认值 | 说明 | 来源 |
|--------|---------|------|--------|------|------|
（此处填入从原型提取的实际字段）

#### 1.1.3 列表展示字段（如果有表格或列表）
| 字段名 | 数据类型 | 格式 | 说明 | 来源 |
|--------|---------|------|------|------|
（此处填入从原型提取的实际字段）

#### 1.1.4 操作按钮 ← 🔥🔥🔥 这是最重要的章节，绝对不能遗漏！
⚠️ **必须从原型中提取所有 type="button" 的元素！**

| 按钮名称 | 按钮类型 | 权限要求 | 触发条件 | 操作说明 | 来源 |
|---------|---------|---------|---------|---------|------|
（此处填入从原型提取的**所有按钮**，每个按钮占一行，格式示例：）
（查询 | 主要 | 无 | 无 | 根据查询条件筛选数据 | 集配管理-button）
（重置 | 次要 | 无 | 无 | 清空查询条件 | 集配管理-button）
（新增 | 主要 | 需要新增权限 | 无 | 打开新增弹窗 | 集配管理-button）
（删除 | 危险 | 需要删除权限 | 选中数据后可用 | 删除选中的数据 | 集配管理-button）
（如果原型中有10个按钮，就必须列出10行！不要遗漏任何一个按钮！）

#### 1.1.5 表单字段定义（仅当原型中存在表单输入时）
| 字段名 | 控件类型 | 必填 | 长度/范围 | 默认值 | 选项/说明 | 来源 |
|--------|---------|------|----------|--------|----------|------|
（此处填入从原型提取的实际字段，每一行都必须是真实字段）

#### 1.1.6 业务规则
（提取原型中的实际业务规则文案）

### 1.2 [下一个页面名称（如果有）]
（重复1.1的结构）

**重要说明**：
- 每个页面作为一个三级标题（1.1、1.2、1.3...）
- 每个页面下的子章节使用四级标题（1.1.1、1.1.2...）
- 章节编号必须连续且完整
- 每个章节编号将作为后续测试用例生成的批次标识

---COMPLETENESS---
（0-1评分，评估原型信息完整度）
---SUGGESTIONS---
（列出缺少的信息）

🚫 严格禁止:
1. 不要输出任何示例占位符(如带中括号的内容)
2. 不要编造任何原型中不存在的内容
3. 表格中的每一行都必须是从原型中实际提取的内容
4. 如果原型中没有某个章节的内容，就跳过该章节，不要生成示例
5. 所有字段名、按钮文本都必须从原型中提取，不要自己创造`;

    // 🎯 关键优化: 收集页面类型信息和元素统计,帮助AI识别页面类型
    const pageTypeAnalysis: Array<{
      name: string;
      pageType: string;
      inputCount: number;
      buttonCount: number;
      allButtons: string[];  // 🔥 新增：所有按钮列表
      queryButtons: string[];
      formButtons: string[];
      suggestion: string;
    }> = [];

    (axureData.pages || []).forEach(page => {
      const inputCount = (page.elements || []).filter(e => e.type === 'input' || e.type === 'select').length;
      const buttonCount = (page.elements || []).filter(e => e.type === 'button').length;

      // 🔥 提取所有按钮（这是最重要的！）
      const allButtons = (page.elements || [])
        .filter(e => e.type === 'button')
        .map(e => e.text || e.name || '未命名按钮');

      const queryButtons = (page.elements || [])
        .filter(e => e.type === 'button' && e.text && (
          e.text.includes('查询') || e.text.includes('搜索') || e.text.includes('重置')
        ))
        .map(e => e.text || '');

      const formButtons = (page.elements || [])
        .filter(e => e.type === 'button' && e.text && (
          e.text.includes('保存') || e.text.includes('提交') || e.text.includes('确定')
        ))
        .map(e => e.text || '');

      const pageType = page.pageType || 'unknown';

      let suggestion = '';
      if (pageType === 'list') {
        suggestion = '需要生成：查询条件、列表展示字段、操作按钮（必须列出所有按钮！）';
      } else if (pageType === 'form') {
        suggestion = '需要生成：表单字段、操作按钮（必须列出所有按钮！不要生成查询条件）';
      } else if (pageType === 'detail') {
        suggestion = '需要生成：详情展示字段、操作按钮（必须列出所有按钮！不要生成查询条件）';
      } else {
        suggestion = '根据实际情况灵活生成，但操作按钮章节是必须的！';
      }

      pageTypeAnalysis.push({
        name: page.name || '未命名',
        pageType,
        inputCount,
        buttonCount,
        allButtons,  // 🔥 新增
        queryButtons,
        formButtons,
        suggestion
      });
    });

    const pageTypeTable = pageTypeAnalysis.length > 0
      ? `\n🔍 【重要】页面类型分析表（请根据此表生成对应章节）:\n${pageTypeAnalysis.map((p, i) =>
          `${i + 1}. ${p.name}
   页面类型: ${p.pageType}
   输入框数量: ${p.inputCount}
   按钮数量: ${p.buttonCount}
   🔥 所有按钮列表: ${p.allButtons.length > 0 ? p.allButtons.join(', ') : '无'}
   查询按钮: ${p.queryButtons.length > 0 ? p.queryButtons.join(', ') : '无'}
   表单按钮: ${p.formButtons.length > 0 ? p.formButtons.join(', ') : '无'}
   📋 章节建议: ${p.suggestion}`
        ).join('\n\n')}\n`
      : '';

    // 🎯 关键优化2: 提取所有长文本段落(可能包含重要的业务规则说明)
    const longTexts: Array<{text: string; page: string}> = [];
    (axureData.pages || []).forEach(page => {
      (page.elements || [])
        .filter(e => e.type === 'div' && e.text && e.text.length > 50) // 提取超过50字的div元素
        .forEach(e => {
          // 过滤掉只包含重复数据的文本(如列表数据)
          const text = e.text!.trim();
          if (text.includes('审核') || text.includes('校验') || text.includes('拦截') ||
              text.includes('确认') || text.includes('运费') || text.includes('库存') ||
              text.includes('结算总金额') || text.includes('通过时') || text.includes('拉取')) {
            longTexts.push({
              text: text.substring(0, 500), // 最多取500字
              page: page.name || '未命名'
            });
          }
        });
    });

    const longTextSummary = longTexts.length > 0
      ? `\n📋 【极其重要！！！】原型中的业务规则说明文字 (${longTexts.length}条,必须完整提取到"业务规则"章节):\n${longTexts.map((lt, i) =>
          `${i + 1}. [来源: ${lt.page}] ${lt.text}`
        ).join('\n\n')}\n`
      : '';

    // 🔥 新增：专门提取所有按钮详细信息
    const buttonDetails: Array<{page: string; buttons: string[]}> = [];
    (axureData.pages || []).forEach(page => {
      const buttons = (page.elements || [])
        .filter(e => e.type === 'button')
        .map(e => e.text || e.name || '未命名按钮');

      if (buttons.length > 0) {
        buttonDetails.push({
          page: page.name || '未命名',
          buttons
        });
      }
    });

    const buttonDetailSummary = buttonDetails.length > 0
      ? `\n🔥🔥🔥 【最重要！！！】所有按钮详细列表（必须在"操作按钮"章节中全部列出，一个都不能遗漏！）:\n${buttonDetails.map((bd, i) =>
          `页面 ${i + 1}: ${bd.page}
   按钮数量: ${bd.buttons.length}个
   所有按钮: ${bd.buttons.join(', ')}`
        ).join('\n\n')}\n`
      : '';

    const userPrompt = `系统: ${projectInfo.systemName || '未指定'}
模块: ${projectInfo.moduleName || '未指定'}
${pageTypeTable}${buttonDetailSummary}${longTextSummary}
Axure原型解析结果 (${axureData.pageCount || 0}页, ${axureData.elementCount || 0}元素):

${(axureData.pages || []).slice(0, 10).map((page, i) => {
  // 🔍 关键优化: 优先显示所有input/select元素,确保查询条件不会被遗漏
  const inputElements = (page.elements || []).filter(e => e.type === 'input' || e.type === 'select');
  const buttonElements = (page.elements || []).filter(e => e.type === 'button');  // 🔥 专门提取按钮
  const divElements = (page.elements || []).filter(e => e.type === 'div' && e.text && e.text.length > 0 && e.text.length <= 50 && e.name !== '业务规则说明');  // 🔥 专门提取 div 文本（可能是列表字段）
  const otherElements = (page.elements || []).filter(e => e.type !== 'input' && e.type !== 'select' && e.type !== 'button' && e.type !== 'div');

  // 构建元素详情: 先显示所有输入框，再显示所有按钮，再显示 div 元素，最后显示其他元素
  const inputDetail = inputElements.map(e => {
    if (e.name) return `  - ${e.type}: name="${e.name}"${e.value ? `, value="${e.value}"` : ''}${e.placeholder ? `, placeholder="${e.placeholder}"` : ''}`;
    if (e.placeholder) return `  - ${e.type}: [${e.placeholder}]`;
    return `  - ${e.type}`;
  }).join('\n');

  // 🔥 按钮详情（显示所有按钮，不截断！）
  const buttonDetail = buttonElements.map(e => {
    return `  - button: "${e.text || e.name || '未命名'}"`;
  }).join('\n');

  // 🔥 div 文本详情（显示所有 div，不截断！这些可能是列表字段）
  const divDetail = divElements.map(e => {
    return `  - div: "${e.text}"`;
  }).join('\n');

  const otherDetail = otherElements.slice(0, 10).map(e => {
    if (e.text) return `  - ${e.type}: "${e.text}"`;
    if (e.placeholder) return `  - ${e.type}: [${e.placeholder}]`;
    if (e.name) return `  - ${e.type}: ${e.name}`;
    return `  - ${e.type}`;
  }).join('\n');

  const elementsDetail = [inputDetail, buttonDetail, divDetail, otherDetail].filter(d => d).join('\n');

  const interactionsDetail = (page.interactions || []).slice(0, 10).map(int =>
    `  - ${int.type}${int.trigger ? `: ${int.trigger}` : ''}`
  ).join('\n');

  return `页面${i + 1}: ${page.name || '未命名'}
⚠️ 页面类型: ${page.pageType || 'unknown'}

📝 查询条件字段 - 输入框/下拉框 (${inputElements.length}个):
${inputDetail || '  无'}

🔘 操作按钮 (${buttonElements.length}个):
${buttonDetail || '  无'}

📋 列表字段 - div文本元素 (${divElements.length}个):
${divDetail || '  无'}

🔍 其他元素(${otherElements.length}个):
${otherDetail || '  无'}

⚡ 交互(${(page.interactions || []).length}):
${interactionsDetail || '  无'}`;
}).join('\n\n')}

${axureData.pageCount > 10 ? `\n(还有${axureData.pageCount - 10}个页面未展示)` : ''}

🚨 重要提醒:
1. 上面显示的所有元素和文字都是真实的原型内容
2. 你必须使用这些实际内容（如上面显示的按钮文本、输入框标签等）
3. 🚫 绝对禁止使用示例占位符，如[字段1]、[字段2]、[商品名称]、[库存数量]等
4. 如果原型中没有某类内容，就跳过该章节，不要编造
5. 严格按照上面的实际原型内容生成，按业务模块划分
6. 弹窗归属主页面，导航不单独描述
7. 所有字段必须标注来源`;

    // 🚀 构建完整的 Prompt 日志
    console.log('🚀 【步骤 3/5】构建 AI Prompt:');
    console.log(`   - System Prompt 长度: ${systemPrompt.length} 字符`);
    console.log(`   - User Prompt 长度: ${userPrompt.length} 字符`);
    console.log(`   - 总 Token 估算: ~${Math.ceil((systemPrompt.length + userPrompt.length) / 4)} tokens\n`);

    // 保存完整的 prompt 到日志（可选，用于调试）
    if (process.env.LOG_FULL_PROMPT === 'true') {
      console.log('📝 完整 User Prompt:\n');
      console.log('---BEGIN USER PROMPT---');
      console.log(userPrompt);
      console.log('---END USER PROMPT---\n');
    }

    try {
      console.log('📡 【步骤 4/5】调用 AI 模型...');
      const startTime = Date.now();

      const aiResponse = await this.callAI(systemPrompt, userPrompt, 8000);

      const duration = Date.now() - startTime;
      console.log(`✅ AI 响应完成 (耗时: ${duration}ms, 响应长度: ${aiResponse.length} 字符)\n`);

      // 📋 解析 AI 响应
      console.log('📋 【步骤 5/5】解析 AI 响应:');

      const docMatch = aiResponse.match(/---REQUIREMENT_DOC---([\s\S]*?)---COMPLETENESS---/);
      const completenessMatch = aiResponse.match(/---COMPLETENESS---\s*([\d.]+)/);
      const suggestionsMatch = aiResponse.match(/---SUGGESTIONS---([\s\S]*?)$/);

      const requirementDoc = docMatch ? docMatch[1].trim() : aiResponse;
      const completeness = completenessMatch ? parseFloat(completenessMatch[1]) : 0.8;
      const suggestions = suggestionsMatch
        ? suggestionsMatch[1].trim().split('\n').filter(s => s.trim()).map(s => s.replace(/^[-*]\s*/, ''))
        : ['请人工审核需求文档', '补充异常流程说明', '补充非功能性需求'];

      console.log(`   ✓ 需求文档提取成功 (${requirementDoc.length} 字符)`);
      console.log(`   ✓ 完整度评分: ${(completeness * 100).toFixed(1)}%`);
      console.log(`   ✓ 建议数量: ${suggestions.length} 条\n`);

      // 检查是否包含示例占位符（质量检查）
      const hasPlaceholders = /\[字段\d+\]|\[商品名称\]|\[库存数量\]|\[审核意见\]/.test(requirementDoc);
      if (hasPlaceholders) {
        console.warn('⚠️  警告: 检测到示例占位符，需求文档质量可能不佳');
      } else {
        console.log('✅ 质量检查通过: 未检测到示例占位符');
      }

      console.log('\n╔═══════════════════════════════════════════════════════════════╗');
      console.log('║              ✅ 需求文档生成成功                              ║');
      console.log('╚═══════════════════════════════════════════════════════════════╝\n');

      return { requirementDoc, completeness, suggestions };
    } catch (error: any) {
      console.error('\n❌ 【错误】需求文档生成失败:');
      console.error(`   错误类型: ${error.name}`);
      console.error(`   错误消息: ${error.message}`);
      if (error.stack) {
        console.error(`   错误堆栈:\n${error.stack}`);
      }
      console.error('\n🔄 使用回退方案生成模拟文档...\n');

      // 回退到模拟实现
      const requirementDoc = this.buildMockRequirementDoc(axureData, projectInfo);
      return {
        requirementDoc,
        completeness: 0.7,
        suggestions: ['AI服务暂时不可用，请人工审核此文档']
      };
    }
  }

  /**
   * 🆕 直接从HTML文件生成需求文档（不经过解析，直接传文本给AI）
   * @param htmlContent HTML文件的完整内容
   * @param projectInfo 项目信息（系统名称、模块名称）
   * @returns 生成的需求文档和章节列表
   */
  async generateRequirementFromHtmlDirect(
    content: string,
    projectInfo: { systemName?: string; moduleName?: string; pageMode?: PageMode; platformType?: PlatformType; businessRules?: string[]; contentSourceType?: ContentSourceType | 'html' }
  ): Promise<{ requirementDoc: string; sections: string[] }> {
    const pageMode = projectInfo.pageMode || 'new';
    const platformType = projectInfo.platformType || 'web';
    const contentSourceType: ContentSourceType | 'html' = projectInfo.contentSourceType || 'html';
    const isHtmlSource = contentSourceType === 'html';

    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log(`║       🚀 直接从HTML生成需求文档 - ${pageMode === 'new' ? '新增页面' : '修改页面'}模式 - ${platformType === 'web' ? 'Web端' : '移动端'}          ║`);
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    console.log('📊 输入信息:');
    console.log(`   - 平台类型: ${platformType === 'web' ? 'Web端' : '移动端'}`);
    console.log(`   - 页面模式: ${pageMode === 'new' ? '新增页面' : '修改页面'}`);
    console.log(`   - 系统名称: ${projectInfo.systemName || '未指定'}`);
    console.log(`   - 模块名称: ${projectInfo.moduleName || '未指定'}`);
    console.log(`   - 来源类型: ${contentSourceType}`);
    console.log(`   - 文档长度: ${content.length} 字符`);

    // 🆕 如果是修改模式，提取红色字段和业务描述
    let redFields: string[] = [];
    let businessDescription = '';

    if (isHtmlSource && pageMode === 'modify') {
      redFields = this.extractRedFields(content);
      businessDescription = this.extractBusinessDescription(content);
    }

    // 📊 业务规则日志
    if (projectInfo.businessRules && projectInfo.businessRules.length > 0) {
      console.log(`\n🎯 【步骤 3/5】用户提供的补充业务规则:`);
      projectInfo.businessRules.forEach((rule, i) => {
        console.log(`   ${i + 1}. ${rule}`);
      });
      console.log(`   💡 这些规则将作为AI提示词的一部分，辅助AI理解需求\n`);
    }

    // 🆕 根据平台类型选择对应的提示词
    console.log(`\n🎯 【步骤 2/5】加载提示词策略...`);

    const platformPromptOptions = {
      systemName: projectInfo.systemName,
      moduleName: projectInfo.moduleName,
      pageMode,
      businessDescription,
      redFields
    };

    const platformPrompt = isHtmlSource
      ? (platformType === 'web'
        ? getWebRequirementPrompt(platformPromptOptions)
        : getMobileRequirementPrompt(platformPromptOptions))
      : (() => {
        const normalizedSource: ContentSourceType = contentSourceType === 'html' ? 'markdown' : contentSourceType;
        return getTextRequirementPrompt({
          systemName: projectInfo.systemName,
          moduleName: projectInfo.moduleName,
          sourceType: normalizedSource
        });
      })();

    console.log(`   ✅ 提示词策略已加载 (${isHtmlSource ? 'HTML/原型' : '文本'})`);

    // 构建系统提示词
    const systemPrompt = `你是一个专业的需求分析专家。你的任务是分析${isHtmlSource ? 'Axure原型导出的HTML文件' : '用户提供的业务文档'}并生成结构化的需求文档。

${projectInfo.businessRules && projectInfo.businessRules.length > 0 ? getBusinessRulesSystemPrompt(projectInfo.businessRules) : ''}
${platformPrompt}
${getCommonSystemInstructions()}`;


    // 构建用户提示词
    const userPrompt = getUserPrompt(content, isHtmlSource ? 'html' : 'text');

    try {
      console.log('\n🤖 正在调用AI大模型生成需求文档...');
      console.log(`   - 系统提示词长度: ${systemPrompt.length} 字符`);
      console.log(`   - 用户提示词长度: ${userPrompt.length} 字符`);

      const aiStartTime = Date.now();

      // 调用AI（注意：maxTokens 会根据模型限制自动调整）
      let requirementDoc = await this.callAI(systemPrompt, userPrompt, 8000);

      const aiDuration = Date.now() - aiStartTime;
      console.log(`✅ AI生成完成 (耗时: ${aiDuration}ms)`);
      console.log(`   - 原始文档长度: ${requirementDoc.length} 字符`);

      // 🔥 清理AI返回内容中的markdown代码块包裹符号
      console.log(`\n🧹 清理Markdown代码块包裹符号...`);

      // 移除开头的 ```markdown 或 ```
      requirementDoc = requirementDoc.replace(/^```markdown\s*/i, '').replace(/^```\s*/, '');

      // 移除结尾的 ```
      requirementDoc = requirementDoc.replace(/\s*```\s*$/, '');

      // 去除首尾空白
      requirementDoc = requirementDoc.trim();

      console.log(`   ✅ 清理完成,文档长度: ${requirementDoc.length} 字符`);

      // 提取章节列表 - 支持二级和三级标题
      // 匹配格式：## 1. 功能概述 或 ### 1.1 子章节
      const sectionRegex = /^#{2,3}\s+(\d+(?:\.\d+)*\.?)\s+(.+)$/gm;
      const sections: string[] = [];
      let match;
      while ((match = sectionRegex.exec(requirementDoc)) !== null) {
        sections.push(`${match[1]} ${match[2]}`);
      }

      console.log(`\n📋 提取到 ${sections.length} 个章节:`);
      sections.forEach((section, index) => {
        // console.log(`   ${index + 1}. ${section}`);
        console.log(`   ${section}`);
      });

      console.log('\n✅ 需求文档生成成功\n');

      return {
        requirementDoc,
        sections
      };
    } catch (error: any) {
      console.error('❌ 直接生成需求文档失败:', error);
      throw new Error(`需求文档生成失败: ${error.message}`);
    }
  }

  /**
   * 规划分批策略 - 基于需求文档章节
   * @param requirementDoc 需求文档
   */
  async planBatchStrategy(requirementDoc: string): Promise<Batch[]> {
    console.log('📋 开始规划分批策略（基于章节）...');

    // 提取文档中的二级和三级标题（## 1. 或 ### 1.1 等）
    // 匹配格式：## 1. 功能概述 或 ### 1.1 子章节
    const chapterRegex = /^#{2,3}\s+(\d+(?:\.\d+)*\.?)\s+(.+)$/gm;
    const chapters: Array<{ id: string; name: string }> = [];
    let match;

    while ((match = chapterRegex.exec(requirementDoc)) !== null) {
      chapters.push({
        id: match[1].trim().replace(/\.$/, ''), // "1", "1.1", "1.2" (去除末尾的点)
        name: match[2].trim() // 页面名称
      });
    }

    if (chapters.length === 0) {
      console.warn('⚠️  未能从需求文档中提取到章节编号，使用回退方案');
      return [
        {
          id: 'section-1',
          name: '完整功能测试',
          priority: 'high',
          scenarios: ['主要功能测试'],
          estimatedCount: 10
        }
      ];
    }

    console.log(`✅ 提取到 ${chapters.length} 个章节:`, chapters.map(c => `${c.id} ${c.name}`).join(', '));

    // 将每个章节转换为一个批次
    const batches: Batch[] = chapters.map((chapter, index) => ({
      id: `section-${chapter.id}`,
      name: `${chapter.id} ${chapter.name}`,
      priority: index === 0 ? 'high' : 'medium', // 第一个章节优先级为high
      scenarios: [chapter.id], // 直接使用章节ID作为场景标识
      estimatedCount: 0 // 将在生成时由AI决定数量
    }));

    console.log(`✅ 规划完成，共 ${batches.length} 个批次（按章节划分）`);
    return batches;
  }

  /**
   * 生成单个批次的测试用例（基于章节）
   */
  async generateBatch(
    batchId: string,
    scenarios: string[], // scenarios[0] 可能是 "1.1" 或 "1.1 用户登录功能"
    requirementDoc: string,
    existingCases: TestCase[],
    systemName?: string,  // 系统名称
    moduleName?: string   // 模块名称
  ): Promise<TestCase[]> {
    // 🆕 从 scenarios[0] 中提取章节编号和标题
    // 支持格式：
    // - "1.1" (只有编号)
    // - "1.1 用户登录功能" (编号 + 标题)
    const relatedSection = scenarios[0];
    let sectionId: string;
    let sectionNameFromAI: string | null = null;
    
    // 尝试匹配 "编号 标题" 格式
    const sectionMatch = relatedSection.match(/^([\d.]+)\s+(.+)$/);
    if (sectionMatch) {
      // 如果匹配成功，说明是 "1.1 用户登录功能" 格式
      sectionId = sectionMatch[1]; // 提取编号部分
      sectionNameFromAI = sectionMatch[2].trim(); // 提取标题部分
    } else {
      // 否则，整个字符串就是编号
      sectionId = relatedSection;
    }
    
    console.log(`🤖 开始生成批次 ${batchId}（章节 ${relatedSection}），系统: ${systemName || '未指定'}, 模块: ${moduleName || '未指定'}`);

    // 提取该章节的完整内容 - 支持二级和三级标题
    // 匹配格式：## 1. 标题 或 ### 1.1 标题，支持编号末尾有无点号
    const escapedSectionId = sectionId.replace(/\./g, '\\.');
    const sectionRegex = new RegExp(`^#{2,3}\\s+${escapedSectionId}\\.?\\s+(.+?)$[\\s\\S]*?(?=^#{2,3}\\s+\\d+(?:\\.\\d+)*\\.?\\s+|$)`, 'm');
    const contentMatch = requirementDoc.match(sectionRegex);
    const sectionContent = contentMatch ? contentMatch[0] : requirementDoc.substring(0, 3000);
    // 优先使用从需求文档中提取的标题，如果没有则使用AI返回的标题
    const sectionName = contentMatch ? contentMatch[1].trim() : (sectionNameFromAI || '功能模块');

    console.log(`📄 提取章节内容 - ${sectionId} ${sectionName} (${sectionContent.length}字符)`);

    // 🔍 查询知识库（RAG增强）- 🔥 使用系统特定的知识库
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📚 [知识库RAG] 开始检索相关知识...`);
    console.log(`   🎯 目标系统: ${systemName || '默认'}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    let knowledgeContext = '';
    try {
      // 🔥 获取系统特定的知识库实例
      const knowledgeBase = this.getKnowledgeBase(systemName);
      console.log(`✅ 知识库实例已创建（系统：${systemName || '默认'}），开始RAG检索...`);
      try {
        console.log(`🔍 [RAG-Step1] 准备查询参数:`);
        console.log(`   📌 章节名称: "${sectionName}"`);
        console.log(`   📌 内容长度: ${sectionContent.length}字符 (取前500字作为查询上下文)`);
        console.log(`   📌 检索参数: topK=3, scoreThreshold=0.5`);

        const queryText = `${sectionName}\n${sectionContent.substring(0, 500)}`;
        console.log(`   📌 实际查询文本预览: ${queryText.substring(0, 150)}...`);

        console.log(`\n🔍 [RAG-Step2] 调用Qdrant向量数据库进行语义检索...`);
        const queryStartTime = Date.now();

        const knowledgeResults = await knowledgeBase.searchByCategory({
          query: queryText,
          topK: 3,
          scoreThreshold: 0.5
        });

        const queryDuration = Date.now() - queryStartTime;
        console.log(`✅ [RAG-Step2] 向量检索完成 (耗时: ${queryDuration}ms)`);

        const totalKnowledge =
          knowledgeResults.businessRules.length +
          knowledgeResults.testPatterns.length +
          knowledgeResults.pitfalls.length +
          knowledgeResults.riskScenarios.length;

        if (totalKnowledge > 0) {
          console.log(`\n📊 [RAG-Step3] 知识检索结果汇总:`);
          console.log(`   ✅ 业务规则: ${knowledgeResults.businessRules.length}条`);
          if (knowledgeResults.businessRules.length > 0) {
            knowledgeResults.businessRules.forEach((r: any, i: number) => {
              console.log(`      ${i+1}. "${r.knowledge.title}" (相似度: ${(r.score * 100).toFixed(1)}%)`);
            });
          }

          console.log(`   ✅ 测试模式: ${knowledgeResults.testPatterns.length}条`);
          if (knowledgeResults.testPatterns.length > 0) {
            knowledgeResults.testPatterns.forEach((r: any, i: number) => {
              console.log(`      ${i+1}. "${r.knowledge.title}" (相似度: ${(r.score * 100).toFixed(1)}%)`);
            });
          }

          console.log(`   ✅ 历史踩坑点: ${knowledgeResults.pitfalls.length}条`);
          if (knowledgeResults.pitfalls.length > 0) {
            knowledgeResults.pitfalls.forEach((r: any, i: number) => {
              console.log(`      ${i+1}. "${r.knowledge.title}" (相似度: ${(r.score * 100).toFixed(1)}%)`);
            });
          }

          console.log(`   ✅ 资损风险场景: ${knowledgeResults.riskScenarios.length}条`);
          if (knowledgeResults.riskScenarios.length > 0) {
            knowledgeResults.riskScenarios.forEach((r: any, i: number) => {
              console.log(`      ${i+1}. "${r.knowledge.title}" (相似度: ${(r.score * 100).toFixed(1)}%)`);
            });
          }

          console.log(`   📈 总计检索到: ${totalKnowledge}条相关知识`);

          console.log(`\n🔧 [RAG-Step4] 格式化知识上下文，准备注入AI提示词...`);
          knowledgeContext = this.buildKnowledgeContext(knowledgeResults);
          console.log(`✅ [RAG-Step4] 知识上下文构建完成 (长度: ${knowledgeContext.length}字符)`);

          console.log(`\n🎯 [RAG模式] 将使用知识库增强模式生成测试用例`);
        } else {
          console.log(`\n⚠️  [RAG-Step3] 未检索到相关知识 (所有知识相似度 < 0.5)`);
          console.log(`   💡 这可能是因为:`);
          console.log(`      - 知识库中没有与"${sectionName}"相关的内容`);
          console.log(`      - 相似度阈值0.5设置过高`);
          console.log(`      - 需要添加更多业务知识到知识库`);
          console.log(`\n🔄 [降级处理] 切换到普通模式生成（不使用知识库增强）`);
        }
      } catch (error: any) {
        console.error(`\n❌ [RAG-Error] 知识库查询异常:`);
        console.error(`   错误类型: ${error.name}`);
        console.error(`   错误信息: ${error.message}`);
        console.error(`   错误堆栈: ${error.stack}`);
        console.warn(`\n🔄 [降级处理] 自动切换到普通模式生成`);
      }
    } catch (outerError: any) {
      console.error(`❌ [RAG-Error] 知识库初始化失败:`);
      console.error(`   错误信息: ${outerError.message}`);
      console.warn(`\n🔄 [降级处理] 自动切换到普通模式生成`);
    }

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    const systemPrompt = `你是一个测试用例设计专家。你的职责是：
1. 根据需求文档的指定章节生成详细的功能测试用例
2. 每个测试用例包含一个测试目的，以及若干个测试点
3. 每个测试点是一个独立的、可验证的测试项
4. 根据需求复杂度决定生成的测试点数量，不要人为限制数量
5. 避免与已存在的测试用例重复

🎯 核心数据结构：
- 一条测试用例 = 一个测试目的 + 多个测试点
- 测试目的：总体测试目标（如"验证订单创建流程"）
- 测试点：具体的测试项（如"正常提交订单"、"库存不足时提交订单"、"超时订单处理"）
- **重要**：每个测试点都必须包含 testPurpose 字段（同一个测试用例下的所有测试点共享相同的 testPurpose）

📊 测试用例生成规则：
1. 数量不限制：根据需求文档的复杂度自动判断需要多少个测试点
2. 每个测试点必须是原子性的、独立验证的
3. 测试点应覆盖正常流程、异常流程、边界条件
4. 测试点应标注风险等级（low/medium/high）
5. **每个测试点必须包含 testPurpose 字段**

🎨 **特殊章节：页面布局与文案校验**
如果章节名称包含"页面布局与文案校验"或"布局"/"文案"等关键词，需要生成以下类型的测试点：
1. **页面标题与导航验证**: 检查页面标题文案、面包屑路径是否正确
2. **布局结构验证**: 检查各功能区域位置、间距、对齐是否符合设计
3. **字段与列头验证**: 检查所有标签、列头文案是否与原型一致
4. **按钮文案验证**: 检查所有按钮的文案、样式、位置是否正确
5. **提示文案验证**: 检查空状态提示、错误提示、操作提示等文案
6. **数据格式验证**: 检查日期、金额、状态等字段的展示格式
这类测试点的优先级通常是 medium 或 high，风险等级是 low 或 medium

测试用例结构要求：
- name: 用例名称（格式：[章节ID]-[测试目的]，如"1.1-订单创建"）
- testPurpose: 测试目的（简短描述测试目标）
- system: 所属系统（从需求文档提取）
- module: 所属模块（从需求文档提取）
- sectionId: 章节ID（如"1.1"）
- sectionName: 章节名称（如"订单管理页面"）
- priority: high/medium/low
- tags: 相关标签数组
- coverageAreas: 覆盖范围（功能点列表，逗号分隔）
- testPoints: 测试点数组，每个测试点包含：
  * testPurpose: 测试目的（**必填**，与测试用例的 testPurpose 相同）
  * testPoint: 测试点名称
  * steps: 操作步骤（**必须使用【操作】【预期】格式**，如："1. 【操作】打开页面\\n   【预期】页面正常显示"）
  * expectedResult: 预期结果（汇总所有步骤的【预期】内容）
  * riskLevel: 风险等级（low/medium/high）
- steps: 汇总的操作步骤（兼容旧格式，**必须包含每步的【操作】【预期】**）
- assertions: 汇总的预期结果（兼容旧格式，汇总所有【预期】内容）
- preconditions: 前置条件（可选）
- testData: 测试数据（可选）
${knowledgeContext}`;

    const existingCaseNames = existingCases.map(tc => tc.name).join('\n- ');

    const userPrompt = `请为以下需求文档章节生成详细的功能测试用例：

## 目标章节
章节ID: ${sectionId}
章节名称: ${sectionName}

## 章节需求内容
${sectionContent}

## 已存在的测试用例（避免重复）
${existingCaseNames || '无'}

## 生成要求
1. 根据需求复杂度决定测试点数量，不要人为限制
2. 每个测试点必须独立且可验证
3. 覆盖正常流程、异常流程、边界条件
4. 标注每个测试点的风险等级
5. 测试用例名称格式：[章节ID]-[测试目的]
6. 🎨 **如果章节是"页面布局与文案校验"**，请生成验证页面标题、布局、文案、按钮、提示信息、数据格式等方面的测试点
7. 🔥 **每个步骤必须包含【操作】和【预期】两部分**，格式如："1. 【操作】具体操作\\n   【预期】该步骤的预期结果"
8. ⚠️ **数据一致性检查（生成前必须逐项检查）**：
   - 用例名称描述的场景与测试数据必须完全一致
   - 测试数据与操作步骤中使用的数据必须完全一致
   - 操作步骤必须真实执行用例名称描述的场景
   - 例如：用例名为"密码为空"，则：
     * testData 必须写："用户名：admin\\n密码：（空）"
     * steps 中不能有"输入密码"或具体密码值
   - 例如：用例名为"用户名不为空"，则：
     * testData 必须写："用户名：admin\\n密码：123456"
     * steps 中必须有"输入用户名'admin'"
   - 步骤中使用的所有具体值必须在 testData 中完整列出
   
9. 🔥 **测试数据格式（必须遵守）**：
   - testData 字段必须换行显示，每个字段占一行
   - 格式："字段1：值1\\n字段2：值2\\n字段3：值3"
   - 示例："用户名：testuser001\\n密码：Test@123456\\n邮箱：testuser@example.com\\n手机号：13800138000"
   - ⚠️ 如果字段为空，明确标记："字段名：（空）"

请输出JSON格式：
\`\`\`json
{
  "testCases": [
    {
      "name": "${sectionId}-测试目的简述",
      "testPurpose": "测试目的详细描述",
      "system": "系统名",
      "module": "模块名",
      "sectionId": "${sectionId}",
      "sectionName": "${sectionName}",
      "priority": "high",
      "tags": ["标签1", "标签2"],
      "coverageAreas": "功能点1,功能点2,功能点3",
      "testPoints": [
        {
          "testPurpose": "测试目的详细描述",
          "testPoint": "测试点1：具体测试项",
          "steps": "1. 【操作】打开登录页面\\n   【预期】页面正常加载，显示登录表单\\n2. 【操作】输入用户名和密码\\n   【预期】输入框正常接收输入",
          "expectedResult": "1. 页面正常加载，显示登录表单\\n2. 输入框正常接收输入",
          "riskLevel": "high"
        },
        {
          "testPurpose": "测试目的详细描述",
          "testPoint": "测试点2：具体测试项",
          "steps": "1. 【操作】点击查询按钮\\n   【预期】系统开始查询，显示加载动画\\n2. 【操作】等待查询完成\\n   【预期】列表显示查询结果",
          "expectedResult": "1. 系统开始查询，显示加载动画\\n2. 列表显示查询结果",
          "riskLevel": "medium"
        }
      ],
      "steps": "1. 【操作】汇总的操作步骤1\\n   【预期】该步骤的预期结果\\n2. 【操作】汇总的操作步骤2\\n   【预期】该步骤的预期结果",
      "assertions": "1. 步骤1的预期结果\\n2. 步骤2的预期结果",
      "preconditions": "前置条件",
      "testData": "用户名：testuser001\\n密码：Test@123456\\n邮箱：testuser@example.com"
    }
  ]
}
\`\`\`

💡 提示：根据需求文档内容决定测试点数量，简单页面可能3-5个测试点，复杂流程可能需要10-20个测试点。`;

    try {
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`🤖 [AI生成] 准备调用大模型生成测试用例...`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`   📊 章节信息: ${sectionId} - ${sectionName}`);
      console.log(`   📝 系统提示词长度: ${systemPrompt.length} 字符`);
      console.log(`   📝 用户提示词长度: ${userPrompt.length} 字符`);

      if (knowledgeContext) {
        console.log(`   ✅ 已注入知识库上下文 (${knowledgeContext.length}字符)`);
        console.log(`   💡 AI将基于知识库内容生成更专业的测试用例`);
      } else {
        console.log(`   ⚠️  未注入知识库上下文，使用普通模式生成`);
      }

      // 🔥 详细打印系统提示词
      console.log(`\n┌─────────────────────────────────────────────────────────┐`);
      console.log(`│ 📋 [完整系统提示词] System Prompt                       │`);
      console.log(`└─────────────────────────────────────────────────────────┘`);
      console.log(systemPrompt);
      console.log(`┌─────────────────────────────────────────────────────────┐`);
      console.log(`│ 📋 [完整用户提示词] User Prompt                         │`);
      console.log(`└─────────────────────────────────────────────────────────┘`);
      console.log(userPrompt);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

      console.log(`🚀 [AI生成] 正在调用大模型API (GPT-4o via OpenRouter)...`);
      const aiStartTime = Date.now();

      const aiResponse = await this.callAI(systemPrompt, userPrompt, 8000);

      const aiDuration = Date.now() - aiStartTime;
      console.log(`✅ [AI生成] 大模型响应完成 (耗时: ${aiDuration}ms, 响应长度: ${aiResponse.length}字符)`);

      // 🔥 详细打印AI原始响应
      console.log(`\n┌─────────────────────────────────────────────────────────┐`);
      console.log(`│ 🤖 [AI原始响应] Raw Response                            │`);
      console.log(`└─────────────────────────────────────────────────────────┘`);
      console.log(aiResponse);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

      // 解析AI响应
      console.log(`🔍 [解析] 开始解析AI响应为JSON...`);
      const parsed = this.parseAIJsonResponse(aiResponse, '批次生成JSON解析');
      const testCases: TestCase[] = parsed.testCases || [];

      console.log(`✅ [解析成功] 解析出 ${testCases.length} 个测试用例`);

      // 补充章节信息和系统模块信息
      testCases.forEach((tc, index) => {
        tc.sectionId = sectionId;
        tc.sectionName = sectionName;

        // 自动填充系统名称和模块名称
        if (systemName) {
          tc.system = systemName;
        }
        if (moduleName) {
          tc.module = moduleName;
        }

        // 如果没有testPoints，从steps和assertions生成一个默认测试点
        if (!tc.testPoints || tc.testPoints.length === 0) {
          tc.testPoints = [{
            testPoint: tc.testPurpose || tc.name,
            steps: tc.steps,
            expectedResult: tc.assertions,
            riskLevel: 'medium'
          }];
        }

        console.log(`   ${index + 1}. ${tc.name} (${tc.testPoints?.length || 0}个测试点)`);
      });

      const totalTestPoints = testCases.reduce((sum, tc) => sum + (tc.testPoints?.length || 0), 0);

      // 🔥 强制要求：确保至少有一条 SMOKE 冒烟用例，且优先级为 high
      const hasSmokeCase = testCases.some(tc => tc.caseType === 'SMOKE');
      if (!hasSmokeCase && testCases.length > 0) {
        console.warn('⚠️  警告：批次生成的测试用例中没有冒烟用例，自动将第一个高优先级用例转换为 SMOKE 类型');
        
        // 查找第一个高优先级用例，如果没有则使用第一个用例
        const targetCase = testCases.find(tc => tc.priority === 'high') || testCases[0];
        targetCase.caseType = 'SMOKE';
        targetCase.priority = 'high'; // 🔥 冒烟用例优先级必须为 high
        
        console.log(`   ✅ 已将用例 "${targetCase.name}" 设置为 SMOKE（冒烟用例），优先级：high`);
      }
      
      // 🔥 确保所有 SMOKE 用例的优先级都是 high
      testCases.forEach(tc => {
        if (tc.caseType === 'SMOKE' && tc.priority !== 'high') {
          console.log(`   ⚠️  修正冒烟用例 "${tc.name}" 的优先级：${tc.priority} -> high`);
          tc.priority = 'high';
        }
      });

      // 🔥 验证测试用例的数据一致性
      console.log(`\n🔍 [数据一致性验证] 检查批次 ${batchId} 的测试用例...`);
      let hasConsistencyIssues = false;
      let hasCriticalErrors = false;
      const validTestCases: TestCase[] = [];
      const invalidTestCases: { case: TestCase; validation: any }[] = [];
      
      testCases.forEach((tc, index) => {
        const validation = this.validateTestCaseConsistency(tc);
        if (!validation.isValid) {
          hasConsistencyIssues = true;
          console.error(`\n${validation.severity === 'error' ? '❌' : '⚠️'} [一致性问题] 批次${batchId}-用例${index + 1}: "${tc.name}" [${validation.severity.toUpperCase()}]`);
          validation.warnings.forEach(warning => {
            console.error(`   ${warning}`);
          });
          console.error(`   📋 用例信息:`);
          console.error(`      - 测试数据: ${tc.testData || '无'}`);
          console.error(`      - 操作步骤预览: ${(tc.steps || '').substring(0, 150)}...`);
          
          if (validation.severity === 'error') {
            hasCriticalErrors = true;
            invalidTestCases.push({ case: tc, validation });
            console.error(`   🚫 此用例存在严重错误，将被过滤掉\n`);
          } else {
            validTestCases.push(tc);
            console.warn(`   ⚠️ 此用例存在警告，但仍会保留\n`);
          }
        } else {
          validTestCases.push(tc);
          console.log(`   ✅ 批次${batchId}-用例${index + 1}: "${tc.name}" - 数据一致性检查通过`);
        }
      });

      if (hasCriticalErrors) {
        console.error(`\n🚫 [严重错误] 批次 ${batchId} 检测到 ${invalidTestCases.length} 个用例存在严重的数据一致性问题，已被过滤`);
        console.error(`   保留了 ${validTestCases.length} 个有效用例`);
        console.error(`   建议：请检查AI生成质量，或考虑重新生成\n`);
      } else if (hasConsistencyIssues) {
        console.warn(`\n⚠️ [警告] 批次 ${batchId} 部分用例存在轻微的一致性问题，但仍会保留\n`);
      } else {
        console.log(`   ✅ 批次 ${batchId} 所有测试用例数据一致性检查通过\n`);
      }

      // 如果所有用例都被过滤了，返回原始用例但添加警告标签
      const finalTestCases = validTestCases.length > 0 ? validTestCases : testCases.map(tc => ({
        ...tc,
        tags: [...(tc.tags || []), '⚠️数据可能不一致']
      }));

      // 🆕 对测试用例进行排序：SMOKE（冒烟用例）优先，然后按优先级排序
      finalTestCases.sort((a, b) => {
        // 1. 首先按用例类型排序（SMOKE 最高优先级）
        const typeOrder: Record<string, number> = {
          SMOKE: 1,
          FULL: 2,
          BOUNDARY: 3,
          ABNORMAL: 4,
          PERFORMANCE: 5,
          SECURITY: 6,
          USABILITY: 7,
          COMPATIBILITY: 8
        };
        const typeA = typeOrder[a.caseType || 'FULL'] || 9;
        const typeB = typeOrder[b.caseType || 'FULL'] || 9;
        if (typeA !== typeB) {
          return typeA - typeB;
        }

        // 2. 用例类型相同时，按优先级排序（high → medium → low）
        const priorityOrder: Record<string, number> = { high: 1, medium: 2, low: 3 };
        const priorityA = priorityOrder[a.priority] || 2;
        const priorityB = priorityOrder[b.priority] || 2;
        return priorityA - priorityB;
      });

      const finalTotalTestPoints = finalTestCases.reduce((sum, tc) => sum + (tc.testPoints?.length || 0), 0);

      console.log(`\n┌─────────────────────────────────────────────────────────┐`);
      console.log(`│ ✅ [生成完成] 批次 ${batchId} 生成结果汇总（已按优先级排序）│`);
      console.log(`└─────────────────────────────────────────────────────────┘`);
      console.log(`   📊 有效用例数: ${finalTestCases.length}${validTestCases.length < testCases.length ? ` (过滤掉 ${testCases.length - validTestCases.length} 个)` : ''}`);
      console.log(`   📊 测试点总数: ${finalTotalTestPoints}`);
      console.log(`   📊 平均每个用例: ${(finalTotalTestPoints / finalTestCases.length).toFixed(1)} 个测试点`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

      return finalTestCases;

    } catch (error: any) {
      console.error(`❌ 批次${batchId}生成失败，使用回退方案:`, error.message);
      // 回退到简单生成（默认生成一个 SMOKE 冒烟用例）
      return [{
        name: `${sectionId}-${sectionName}`,
        testPurpose: `验证${sectionName}的基本功能`,
        description: `针对${sectionName}的功能测试(AI生成失败，回退到基础模板)`,
        steps: `1. 准备测试环境和数据\n2. 执行${sectionName}相关操作\n3. 观察系统响应\n4. 验证结果`,
        assertions: `1. ${sectionName}执行成功\n2. 系统响应正确\n3. 数据状态符合预期`,
        priority: 'high',
        caseType: 'SMOKE', // 🔥 回退方案默认生成冒烟用例
        tags: [sectionName, '自动生成', 'AI回退', '冒烟用例'],
        system: '待补充',
        module: '待补充',
        sectionId,
        sectionName,
        testPoints: [{
          testPoint: '基本功能测试',
          steps: `1. 准备测试环境和数据\n2. 执行${sectionName}相关操作`,
          expectedResult: '功能正常运行',
          riskLevel: 'high'
        }],
        testType: '功能测试'
      }];
    }
  }

  /**
   * 🆕 阶段1：智能测试场景拆分
   * 根据需求文档，识别不同的测试场景（查询条件、列表展示、操作按钮、页面布局等）
   */
  async analyzeTestScenarios(requirementDoc: string): Promise<TestScenario[]> {
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║       🎯 阶段1：智能测试场景拆分                            ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    // 🆕 检测是否为修改页面模式（包含变更摘要）
    const hasChangeSummary = /##\s*变更摘要/.test(requirementDoc);
    const isModifyMode = hasChangeSummary;

    console.log(`   页面模式: ${isModifyMode ? '修改页面' : '新增页面'}`);

    const systemPrompt = `你是一个测试策略规划专家。你的任务是分析需求文档，将测试工作拆分为不同的测试场景。

## 测试场景拆分原则

**测试场景是什么？**
- 测试场景是一个具体的业务场景或功能场景
- 每个场景包含多个相关的测试点
- 场景应该聚焦于一个明确的测试目标

**根据页面类型识别测试场景：**

### 列表页常见测试场景：
1. **查询条件测试场景** - 验证查询功能、边界值、组合查询
2. **列表展示与数据校验场景** - 验证列表字段、数据格式、排序分页
3. **操作按钮与权限场景** - 验证新增、编辑、删除等操作功能和权限
4. **页面布局与文案校验场景** - 验证页面标题、字段标签、按钮文案、提示信息

### 表单页常见测试场景：
1. **表单字段验证场景** - 验证必填项、数据类型、长度限制
2. **字段联动与依赖场景** - 验证字段之间的联动关系
3. **提交与保存场景** - 验证提交、保存、取消等操作
4. **数据回显与编辑场景** - 验证编辑时数据回显
5. **页面布局与文案校验场景** - 验证页面标题、字段标签、按钮文案

### 详情页常见测试场景：
1. **详情展示场景** - 验证所有字段正确显示
2. **操作按钮场景** - 验证编辑、返回等操作按钮
3. **页面布局与文案校验场景** - 验证页面标题、字段标签

### 弹窗常见测试场景：
1. **弹窗表单验证场景** - 验证表单字段和验证规则
2. **弹窗交互场景** - 验证打开、关闭、取消等操作
3. **页面布局与文案校验场景** - 验证标题、提示文案

## 输出格式

请输出JSON格式：
\`\`\`json
{
  "scenarios": [
    {
      "id": "scenario-1",
      "name": "测试场景名称",
      "description": "该场景的测试目标和范围",
      "priority": "high|medium|low",
      "relatedSections": ["1.1 需求章节标题", "1.2 另一章节标题"],
      "estimatedTestPoints": 5
    }
  ]
}
\`\`\`

**重要：relatedSections 格式说明**
- ⚠️ **必须严格从需求文档中提取完整的章节编号和标题**
- ⚠️ **每个测试场景必须至少关联1个需求章节，不能为空数组！**
- ⚠️ **不要漏掉章节！同一页面的多个子章节都需要关联！**
- 格式要求："章节编号 章节标题"（章节编号和标题之间有一个空格）
- 章节编号必须与需求文档中的 ### 或 #### 标题完全一致

**正确示例：**
- 如果需求文档中是 ### 1.1 用户登录功能，则返回 "1.1 用户登录功能"
- 如果需求文档中是 #### 1.1.1 页面布局验证，则返回 "1.1.1 页面布局验证"
- 如果需求文档中是 ### 2.3 订单查询界面，则返回 "2.3 订单查询界面"
- **如果场景涉及多个章节，必须全部列出**：
  {
    "relatedSections": [
      "1.1 登录页面",
      "1.1.1 页面布局与文案校验",
      "1.1.2 表单字段",
      "1.1.3 操作按钮"
    ]
  }

**错误示例（不要这样）：**
- ❌ "1. 用户登录功能"（缺少小数点后的编号）
- ❌ "登录功能"（缺少章节编号）
- ❌ "1.1"（缺少章节标题）
- ❌ []（空数组，必须至少有1个章节）
- ❌ ["1.1 登录页面"]（明明还有 1.1.1, 1.1.2, 1.1.3 等子章节，却只关联了父章节）

⚠️ **关键要求（极其重要！）**：
1. **每个场景必须有 relatedSections，至少包含1个需求章节！**
2. **仔细阅读需求文档中的章节标题（### 或 #### 开头的行），完整复制章节编号和标题！**
3. **如果场景涉及多个章节，必须全部列出，不要遗漏任何一个！**
4. **特别注意：同一页面下的所有子章节（如 1.1.1, 1.1.2, 1.1.3）都要关联到该页面的场景中！**
5. **宁可多关联，也不要少关联！关联不足会导致需求覆盖不完整！**

**estimatedTestPoints 说明：**
- 预估该场景需要多少个测试点
- 根据场景复杂度判断：简单场景 3-5个，中等场景 5-8个，复杂场景 8-12个

## 重要提示
- 场景数量控制在3-6个，太多会导致规划过于分散
- 优先级判断：功能性 > 权限 > 布局文案
- 每个场景要有清晰的测试边界，避免重叠
- 场景名称应该具体明确，如"用户登录场景"、"订单查询场景"等
- **estimatedTestPoints 必须填写，帮助测试人员了解工作量**

${isModifyMode ? `
## ⚠️ 修改页面模式特别说明

这是一个【修改页面】，需求文档中包含【变更摘要】章节，列出了本次迭代的变更内容。

**你的任务：**
1. **只针对变更的功能生成测试模块**
   - 查找"变更摘要"章节
   - 只针对标记为 🆕 新增功能 和 ✏️ 修改功能 的部分生成测试模块
   - **完全忽略** 标记为 ➖ 原有功能（未变更）的部分

2. **测试重点：**
   - 新增功能：完整测试新增的字段、按钮、逻辑
   - 修改功能：重点测试修改的逻辑、变更的计算方式、调整的规则
   - 回归测试：验证修改是否影响相关联的功能

3. **示例：**
   如果变更摘要显示：
   \`\`\`
   ### 🆕 新增功能
   - 列表新增【订单来源】字段
   - 筛选条件新增【订单来源】下拉框

   ### ✏️ 修改功能
   - 含税采购价计算逻辑调整

   ### ➖ 原有功能（未变更）
   - 订单列表基本展示
   - 供应商筛选
   \`\`\`

   那么你应该生成的测试模块是：
   - 订单来源字段测试（新增）
   - 订单来源筛选测试（新增）
   - 含税采购价计算逻辑测试（修改）

   **不要**生成：
   - ❌ 订单列表基本展示测试（未变更）
   - ❌ 供应商筛选测试（未变更）
` : ''}`;

    const userPrompt = `请分析以下需求文档，拆分出合适的测试场景。

## 📋 需求文档内容
${requirementDoc}

---

## 🔥 **【最高优先级】relatedSections 章节编号提取规则**

⚠️ **重要提醒：不同的子章节必须使用不同的编号！**
- 如果需求文档有 "1.1.1 页面布局"、"1.1.2 表单字段"、"1.1.3 操作按钮"
- 那么在 relatedSections 中也必须是 "1.1.1"、"1.1.2"、"1.1.3"
- **千万不要把所有子章节的编号都改成 "1.1"！**

⚠️ **【最高优先级】relatedSections 章节提取规则 - 必须严格遵守！**

🔥 **核心要求：必须完整提取需求文档中的所有章节编号！**

**步骤1：扫描并提取需求文档中的所有章节（极其重要！）**
1. **逐行扫描需求文档**，找出所有以 ### 或 #### 开头的行
2. **提取完整的章节编号和标题**：
   - 从 "### 1.1 用户登录功能" 提取 → "1.1 用户登录功能"
   - 从 "#### 1.1.1 页面布局" 提取 → "1.1.1 页面布局"
   - 从 "#### 1.1.2 表单字段" 提取 → "1.1.2 表单字段"
3. **保持原始编号**：不要改变章节编号，完全按照需求文档中的编号来（1.1、1.1.1、1.1.2、1.2、1.2.1 等）
4. **建立章节清单**：在生成场景前，先列出需求文档中的所有章节

**步骤2：为测试场景关联完整的章节列表**
- **原则**：一个测试场景通常对应一个页面或模块的所有相关章节
- **示例1 - 登录页面场景**（需求文档有 1.1、1.1.1、1.1.2、1.1.3、1.1.4）：
  relatedSections: ["1.1 用户登录页面", "1.1.1 页面布局与文案校验", "1.1.2 表单字段", "1.1.3 操作按钮", "1.1.4 业务规则"]
  说明：包含主章节 1.1 和所有子章节 1.1.1 到 1.1.4

- **示例2 - 订单列表页面场景**（需求文档有 1.2、1.2.1、1.2.2、1.2.3）：
  relatedSections: ["1.2 订单列表页面", "1.2.1 查询条件", "1.2.2 列表展示字段", "1.2.3 操作按钮"]
  说明：包含主章节 1.2 和所有子章节 1.2.1 到 1.2.3

**步骤3：格式严格检查**
- ✅ **正确格式**："章节编号 章节标题"（章节编号和标题之间有一个空格）
  - "1.1 用户登录功能" ✅
  - "1.1.1 页面布局与文案校验" ✅
  - "1.2.3 操作按钮" ✅
- ❌ **错误格式**（绝对禁止）：
  - "1. 用户登录" ❌ （缺少小数点后的编号）
  - "登录功能" ❌ （缺少章节编号）
  - "1.1" ❌ （缺少章节标题）
  - "1.1  用户登录" ❌ （两个空格）

**步骤4：完整性和准确性验证（生成前强制检查！）**
- [ ] 是否扫描了需求文档中的所有 ### 和 #### 章节？
- [ ] 每个场景的 relatedSections 至少有 1 个章节？
- [ ] 如果页面有子章节（如 1.1.1, 1.1.2），是否都包含了？
- [ ] 章节编号是否与需求文档**完全一致**（1.1、1.1.1、1.1.2，而不是全部都是 1.1）？
- [ ] 格式是否正确（"编号 标题"，中间一个空格）？

⚠️ **常见错误示例（绝对禁止！）**

❌ 错误1：所有章节编号都是 1.1（必须使用不同的编号：1.1、1.1.1、1.1.2）
  relatedSections: ["1.1 登录页面", "1.1 页面布局", "1.1 表单字段", "1.1 操作按钮"]
  问题：页面布局应该是 1.1.1，表单字段应该是 1.1.2，操作按钮应该是 1.1.3，不能全部都是 1.1

❌ 错误2：只关联父章节（遗漏了所有子章节）
  relatedSections: ["1.1 用户登录功能"]
  问题：应该包含 1.1、1.1.1、1.1.2、1.1.3 等所有相关子章节

❌ 错误3：空数组
  relatedSections: []
  问题：必须至少包含一个章节

✅ **正确示例**
relatedSections: ["1.1 用户登录页面", "1.1.1 页面布局与文案校验", "1.1.2 表单字段", "1.1.3 操作按钮", "1.1.4 业务规则"]
说明：主章节编号是 1.1，子章节编号是 1.1.1、1.1.2、1.1.3、1.1.4（注意每个子章节的编号都不同）

🎯 **提取策略（推荐）**
1. 先扫描需求文档，列出所有章节：
   - 1.1 用户登录页面
   - 1.1.1 页面布局
   - 1.1.2 表单字段
   - 1.1.3 操作按钮
   - 1.2 订单列表页面
   - 1.2.1 查询条件
   - 1.2.2 列表字段
2. 然后根据场景，组合相关章节：
   - 登录场景 → 关联 1.1、1.1.1、1.1.2、1.1.3
   - 订单列表场景 → 关联 1.2、1.2.1、1.2.2

## 🔥 排序要求（最高优先级！）
⚠️ **输出的测试场景数组必须严格按照优先级排序！**

**强制排序规则：**
1. **第一个场景必须是主流程场景，优先级必须为 "high"**
   - 核心业务功能、主要操作流程
   - 例如：登录场景、订单创建场景、数据查询场景

2. **所有场景必须按优先级排序：high → medium → low**
   - 所有 high 优先级场景排在最前面
   - 然后是 medium 优先级场景
   - 最后是 low 优先级场景

3. **输出前检查清单：**
   - [ ] 第一个场景是 high 优先级？
   - [ ] 所有 high 在 medium 之前？
   - [ ] 所有 medium 在 low 之前？

**正确示例：**
[{priority:"high"}, {priority:"high"}, {priority:"medium"}, {priority:"low"}] ✅
**错误示例：**
[{priority:"low"}, {priority:"high"}] ❌

${isModifyMode ? `
⚠️ **这是修改页面模式，请严格遵守以下规则：**
1. 从需求文档中找到【变更摘要】章节
2. 只针对 🆕 新增功能 和 ✏️ 修改功能 生成测试场景
3. 完全忽略 ➖ 原有功能（未变更）部分
4. 测试场景命名要明确标注是"新增"还是"修改"
` : ''}
请识别页面类型，并根据上述原则拆分测试场景。**确保主流程场景排在第一位！** 直接输出JSON格式，不要其他说明文字。`;

    try {
      console.log('🤖 正在调用AI进行测试场景拆分...');
      const aiResponse = await this.callAI(systemPrompt, userPrompt, 4000);

      // 解析JSON
      const parsed = this.parseAIJsonResponse(aiResponse, '测试场景拆分');
      const scenarios: TestScenario[] = parsed.scenarios || [];

      // 🆕 确保测试场景按优先级排序（high → medium → low）
      scenarios.sort((a, b) => {
        const priorityOrder = { high: 1, medium: 2, low: 3 };
        const priorityA = priorityOrder[a.priority] || 2;
        const priorityB = priorityOrder[b.priority] || 2;
        return priorityA - priorityB;
      });

      // 🆕 设置默认展开状态：第一个场景默认展开，其他的收起
      scenarios.forEach((s, i) => {
        s.isExpanded = i === 0; // 第一个场景（索引0）默认展开
      });

      console.log(`✅ 成功拆分 ${scenarios.length} 个测试场景（已按优先级排序）:`);
      scenarios.forEach((s, i) => {
        const estimatedInfo = s.estimatedTestPoints ? `, 预估${s.estimatedTestPoints}个测试点` : '';
        console.log(`   ${i + 1}. ${s.name} (${s.priority}${estimatedInfo}) - 关联章节: ${s.relatedSections.join(', ')}`);
      });

      return scenarios;
    } catch (error) {
      console.error('❌ 测试场景拆分失败1:', error.message);
      // 将错误抛出，让路由层处理并返回给前端
      throw new Error(`${error.message || error}`);
      // 回退方案：返回基础场景
      // return [
      //   {
      //     id: 'scenario-1',
      //     name: '完整功能测试场景',
      //     description: '验证所有功能点',
      //     priority: 'high',
      //     relatedSections: ['1.1'],
      //     isExpanded: true // 🆕 回退方案默认展开
      //   }
      // ];
    }
  }

  /**
   * 兼容性方法：保留旧接口名称
   * @deprecated 使用 analyzeTestScenarios 代替
   */
  async analyzeTestModules(requirementDoc: string): Promise<TestModule[]> {
    return this.analyzeTestScenarios(requirementDoc);
  }

  /**
   * 🆕 阶段2：生成测试点
   * 为指定测试场景生成多个测试点
   */
  async generateTestPointsForScenario(
    scenarioId: string,
    scenarioName: string,
    scenarioDescription: string,
    requirementDoc: string,
    relatedSections: string[]
  ): Promise<TestPoint[]> {
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log(`║       🎯 阶段2：生成测试点 - ${scenarioName}             ║`);
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    // 🆕 检测是否为修改页面模式
    const hasChangeSummary = /##\s*变更摘要/.test(requirementDoc);
    const isModifyMode = hasChangeSummary;

    console.log(`   页面模式: ${isModifyMode ? '修改页面' : '新增页面'}`);

    // 提取相关章节内容 - 支持二级和三级标题
    const sectionContents = relatedSections.map(sectionId => {
      // 匹配格式：## 1. 标题 或 ### 1.1 标题，支持编号末尾有无点号
      const escapedSectionId = sectionId.replace(/\./g, '\\.');
      const regex = new RegExp(`^#{2,3}\\s+${escapedSectionId}\\.?\\s+([\\s\\S]*?)(?=^#{2,3}\\s+\\d+(?:\\.\\d+)*\\.?\\s+|$)`, 'm');
      const match = requirementDoc.match(regex);
      return match ? match[0] : '';
    }).join('\n\n');

    const systemPrompt = `你是一个测试点设计专家。你的任务是为指定的测试场景生成多个测试点（Test Point）。

## 测试点生成原则

**测试点是什么？**
- 测试点是一个独立的、可执行的测试项
- 每个测试点包含：测试点名称、操作步骤、预期结果、风险等级
- 测试点应该原子化，一个测试点验证一个具体场景

**如何设计测试点？**
1. **正常流程**：验证标准操作路径
2. **异常流程**：验证错误处理和提示
3. **边界条件**：验证特殊值、空值、超长输入等
4. **权限控制**：验证不同角色的权限限制

**风险等级判断：**
- high：核心功能、资金相关、权限控制
- medium：常用功能、数据校验
- low：UI展示、文案校验

**数量建议：**
- 简单场景：3-5个测试点
- 复杂场景：6-10个测试点
- 根据场景复杂度决定，不要人为限制

## 🔥 主流程识别与排序（极其重要！）

⚠️ **第一条测试点必须是主流程测试点（正常流程、正向场景）！**

**主流程测试点特征：**
1. **正常操作路径**：使用正确的数据、正确的操作顺序
2. **成功场景**：验证功能在理想条件下能够正常工作
3. **核心功能**：最基本、最常用的业务流程
4. **正向验证**：不是错误场景、不是边界条件、不是异常情况

**排序规则（必须严格遵守！）：**
1. **第一位：主流程测试点**（正常流程、正向场景、成功案例）
   - 例如："用户名和密码均正确，凭据正确"（✅ 主流程）
   - 例如："正常提交订单"（✅ 主流程）
   - 例如："有效数据查询"（✅ 主流程）
   - ❌ 不是："用户名和密码均不为空，但凭据错误"（异常流程）
   - ❌ 不是："密码错误"（异常流程）
   - ❌ 不是："库存不足时提交"（异常流程）
   - 风险等级：通常为 high

2. **第二位：关键异常流程**（业务规则验证、重要异常处理）
   - 例如："用户名和密码均不为空，但凭据错误"
   - 例如："库存不足时提交订单"
   - 风险等级：high 或 medium

3. **后续：边界条件和次要异常**
   - 例如："用户名为空"、"密码为空"
   - 风险等级：medium 或 low

**识别主流程的关键词：**
- ✅ 正确、正常、有效、成功、合法、标准、凭据正确、密码正确、数据有效
- ❌ 错误、无效、失败、异常、非法、边界、为空、超长、凭据错误、密码错误

**🚨 特别注意：**
- "用户名和密码均不为空，但凭据错误" 是 ❌ 异常流程（因为包含"错误"）
- "用户名和密码均正确，凭据正确" 是 ✅ 主流程（因为包含"正确"）

**✅ 正确示例（严格按此格式）：**
\`\`\`json
{
  "testPoints": [
    {"testPoint": "用户名和密码均正确，凭据正确", "riskLevel": "high"},              // 1. ✅ 主流程（正向场景）
    {"testPoint": "用户名和密码均不为空，但凭据错误", "riskLevel": "high"},          // 2. 异常流程（关键异常）
    {"testPoint": "用户名为空", "riskLevel": "medium"},                              // 3. 边界条件
    {"testPoint": "密码为空", "riskLevel": "medium"}                                 // 4. 边界条件
  ]
}
\`\`\`

**❌ 错误示例（绝对禁止）：**
\`\`\`json
{
  "testPoints": [
    {"testPoint": "用户名和密码均不为空，但凭据错误", "riskLevel": "high"},  // ❌ 异常流程排第一（错误！）
    {"testPoint": "用户名和密码均正确，凭据正确", "riskLevel": "high"}      // ❌ 主流程排最后（错误！）
  ]
}
\`\`\`

⚠️ **输出前检查清单：**
- [ ] 第一个测试点是正常流程（不是错误、不是为空、不是异常）？
- [ ] 第一个测试点的风险等级是 high？
- [ ] 测试点按照：正常流程 → 异常流程 → 边界条件 排序？

## 输出格式

请输出JSON格式：
\`\`\`json
{
  "testPoints": [
    {
      "testPoint": "测试点名称",
      "description": "测试点描述（简要说明该测试点的目的和范围）",
      "coverageAreas": "覆盖范围（如：查询功能、数据校验、权限控制等）",
      "estimatedTestCases": 1,
      "steps": "1. 步骤1\\n2. 步骤2\\n3. 步骤3",
      "expectedResult": "预期结果描述",
      "riskLevel": "high|medium|low"
    }
  ]
}
\`\`\`

## 字段说明
- **testPoint**: 测试点名称，简洁明确（**必须与steps中的操作内容一致**）
- **description**: 测试点描述，说明该测试点的测试目的和测试范围
- **coverageAreas**: 覆盖范围，说明该测试点覆盖的功能点（如：查询条件、数据展示、操作按钮等）
- **estimatedTestCases**: 预估该测试点会生成多少个测试用例（根据以下原则预估：简单测试点1个，中等测试点2-3个，复杂测试点3-5个）
- **steps**: 测试步骤，详细的操作步骤（**必须与testPoint名称描述的场景一致**）
- **expectedResult**: 预期结果，期望的测试结果（**必须与testPoint名称和steps对应**）
- **riskLevel**: 风险等级

⚠️ **数据一致性要求（极其重要！）**
- 测试点名称、操作步骤、预期结果必须逻辑一致，不能相互矛盾
- 例如：测试点名为"用户名为空"，则steps中不能输入用户名
- 例如：测试点名为"密码为空"，则steps中不能输入密码

${isModifyMode ? `
## ⚠️ 修改页面模式特别说明

当前需求文档包含【变更摘要】，说明这是一个修改页面。

**你的任务：**
1. **聚焦变更内容**
   - 当前测试模块应该是针对变更功能的（🆕 新增 或 ✏️ 修改）
   - 生成的测试目的应该聚焦于这些变更点
   - 如果是新增功能，要完整测试
   - 如果是修改功能，要重点测试变更的逻辑和影响

2. **不要测试未变更功能**
   - 不要为标记为 ➖ 原有功能（未变更）的部分生成测试目的
   - 除非是必要的回归测试（验证修改没有破坏原有功能）
` : ''}`;

    const userPrompt = `请为以下测试场景生成测试点：

## 测试场景信息
- 场景ID: ${scenarioId}
- 场景名称: ${scenarioName}
- 场景描述: ${scenarioDescription}
- 关联章节: ${relatedSections.join(', ')}

## 相关需求内容
${sectionContents}

${isModifyMode ? `
⚠️ **这是修改页面模式：**
- 当前场景应该是针对变更功能的
- 只为变更的功能点生成测试点
- 避免为未变更的原有功能生成测试点
` : ''}
请根据需求内容，为该场景生成详细的测试点。直接输出JSON格式，不要其他说明文字。`;

    try {
      console.log(`🤖 正在为场景"${scenarioName}"生成测试点...`);
      const aiResponse = await this.callAI(systemPrompt, userPrompt, 4000);

      // 解析JSON
      const parsed = this.parseAIJsonResponse(aiResponse, '测试点生成');
      const testPoints: TestPoint[] = parsed.testPoints || [];

      // 为每个测试点添加场景信息
      testPoints.forEach(tp => {
        tp.testScenario = scenarioName;
      });

      // 🆕 智能排序：主流程优先 + 风险等级排序
      testPoints.sort((a, b) => {
        // 1. 识别主流程测试点（正常流程优先）
        const isMainFlowA = this.isMainFlowTestPoint(a.testPoint);
        const isMainFlowB = this.isMainFlowTestPoint(b.testPoint);
        
        if (isMainFlowA && !isMainFlowB) return -1; // A是主流程，排前面
        if (!isMainFlowA && isMainFlowB) return 1;  // B是主流程，排前面
        
        // 2. 都是主流程或都不是主流程时，按风险等级排序
        const riskOrder = { high: 1, medium: 2, low: 3 };
        const riskA = riskOrder[a.riskLevel as keyof typeof riskOrder] || 2;
        const riskB = riskOrder[b.riskLevel as keyof typeof riskOrder] || 2;
        return riskA - riskB;
      });

      console.log(`✅ 成功生成 ${testPoints.length} 个测试点（已按主流程+风险等级排序）:`);
      testPoints.forEach((tp, i) => {
        const isMainFlow = this.isMainFlowTestPoint(tp.testPoint);
        console.log(`   ${i + 1}. ${tp.testPoint} (${tp.riskLevel || 'medium'})${isMainFlow ? ' 🔥主流程' : ''}`);
      });

      return testPoints;
    } catch (error: any) {
      console.error('❌ 测试点生成失败:', error.message);
      // 回退方案
      return [
        {
          testScenario: scenarioName,
          testPoint: `${scenarioName}基本功能验证`,
          description: `${scenarioName}的基本功能验证测试点`,
          coverageAreas: scenarioName,
          estimatedTestCases: 1,
          steps: '1. 准备测试环境和数据\n2. 执行相关操作\n3. 验证结果',
          expectedResult: '功能正常运行',
          riskLevel: 'medium'
        }
      ];
    }
  }

  /**
   * 兼容性方法：保留旧接口名称
   * @deprecated 使用 generateTestPointsForScenario 代替
   */
  async generateTestPurposes(
    moduleId: string,
    moduleName: string,
    moduleDescription: string,
    requirementDoc: string,
    relatedSections: string[]
  ): Promise<TestPurpose[]> {
    // 转换为旧格式（兼容性）
    const testPoints = await this.generateTestPointsForScenario(moduleId, moduleName, moduleDescription, requirementDoc, relatedSections);
    return testPoints.map((tp, index) => ({
      id: `purpose-${moduleId}-${index + 1}`,
      name: tp.testPoint,
      description: tp.expectedResult,
      coverageAreas: tp.testScenario || '',
      estimatedTestPoints: 1,
      priority: (tp.riskLevel === 'high' ? 'high' : tp.riskLevel === 'low' ? 'low' : 'medium') as 'high' | 'medium' | 'low'
    }));
  }

  /**
   * 🆕 获取项目配置信息（用于AI生成测试步骤）
   * @param projectId 项目ID
   * @returns 项目配置信息
   */
  private async getProjectConfigForAI(projectId?: number | null): Promise<ProjectConfigForAI | null> {
    if (!projectId) {
      console.log('⚠️ [项目配置] 未提供项目ID，跳过配置获取');
      return null;
    }

    try {
      const testConfigService = new TestConfigService();
      
      // 获取项目默认配置
      const config = await testConfigService.getProjectDefaultConfig(projectId);
      
      // 获取所有账号配置
      const allAccounts = await testConfigService.getProjectAccounts(projectId);
      
      const result: ProjectConfigForAI = {};
      
      // 构建服务器URL
      if (config.server) {
        // 优先使用 parameters.url
        if (config.server.parameters && typeof config.server.parameters === 'object') {
          const params = config.server.parameters as Record<string, any>;
          if (params.url && typeof params.url === 'string') {
            result.serverUrl = params.url;
          }
        }
        // 如果没有 parameters.url，从 host_name 和 host_port 构建
        if (!result.serverUrl && config.server.host_name) {
          const protocol = config.server.host_port === 443 ? 'https' : 'http';
          const port = (config.server.host_port === 80 || config.server.host_port === 443) 
            ? '' 
            : `:${config.server.host_port}`;
          result.serverUrl = `${protocol}://${config.server.host_name}${port}`;
        }
        // 构建登录页面地址
        if (result.serverUrl) {
          // 如果 serverUrl 已经包含 /login，就不再添加
          if (result.serverUrl.endsWith('/login')) {
            result.loginUrl = result.serverUrl;
          } else {
            result.loginUrl = `${result.serverUrl}/login`;
          }
        }
      }
      
      // 构建账号配置
      if (allAccounts && allAccounts.length > 0) {
        result.accounts = {};
        
        allAccounts.forEach(account => {
          const accountInfo = {
            username: account.account_name || '',
            password: account.account_password || ''
          };
          
          switch (account.account_type) {
            case 'admin':
              result.accounts!.admin = accountInfo;
              break;
            case 'security':
              result.accounts!.security = accountInfo;
              break;
            case 'auditor':
              result.accounts!.auditor = accountInfo;
              break;
          }
          
          // 设置默认账号
          if (account.is_default) {
            result.accounts!.default = accountInfo;
          }
        });
        
        // 如果没有设置默认账号，使用第一个账号作为默认
        if (!result.accounts.default && allAccounts.length > 0) {
          result.accounts.default = {
            username: allAccounts[0].account_name || '',
            password: allAccounts[0].account_password || ''
          };
        }
      }
      
      console.log('✅ [项目配置] 获取成功:', {
        serverUrl: result.serverUrl,
        loginUrl: result.loginUrl,
        accountTypes: result.accounts ? Object.keys(result.accounts) : []
      });
      
      return result;
    } catch (error: any) {
      console.error('❌ [项目配置] 获取失败:', error.message);
      return null;
    }
  }

  /**
   * 🆕 构建项目配置的AI提示词片段
   * @param config 项目配置
   * @returns AI提示词片段
   */
  private buildProjectConfigPrompt(config: ProjectConfigForAI | null): string {
    if (!config) {
      return '';
    }

    const parts: string[] = [];
    
    parts.push(`\n## 🔧 项目配置信息（必须在测试步骤中使用）\n`);
    parts.push(`**重要：生成的测试步骤必须使用以下配置信息，不要使用占位符或示例数据！**\n`);
    
    if (config.serverUrl) {
      parts.push(`### 服务器地址`);
      parts.push(`- 访问地址: ${config.serverUrl}`);
      if (config.loginUrl) {
        parts.push(`- 登录页面: ${config.loginUrl}`);
      }
      parts.push('');
    }
    
    if (config.accounts) {
      parts.push(`### 测试账号配置`);
      
      if (config.accounts.default) {
        parts.push(`- **默认账号**: 用户名 \`${config.accounts.default.username}\`，密码 \`${config.accounts.default.password}\``);
      }
      if (config.accounts.admin) {
        parts.push(`- **管理员账号**: 用户名 \`${config.accounts.admin.username}\`，密码 \`${config.accounts.admin.password}\``);
      }
      if (config.accounts.security) {
        parts.push(`- **安全审计账号**: 用户名 \`${config.accounts.security.username}\`，密码 \`${config.accounts.security.password}\``);
      }
      if (config.accounts.auditor) {
        parts.push(`- **普通用户账号**: 用户名 \`${config.accounts.auditor.username}\`，密码 \`${config.accounts.auditor.password}\``);
      }
      parts.push('');
    }
    
    parts.push(`### 🚨 使用要求`);
    parts.push(`1. **登录步骤必须包含具体的访问地址**，例如：`);
    parts.push(`   - 打开登录页面：${config.loginUrl || config.serverUrl || 'https://xxx.xxx.xxx.xxx/login'}`);
    parts.push(`2. **登录步骤必须包含具体的账号密码**，例如：`);
    if (config.accounts?.default) {
      parts.push(`   - 在用户名输入框中输入："${config.accounts.default.username}"`);
      parts.push(`   - 在密码输入框中输入："${config.accounts.default.password}"`);
    }
    parts.push(`3. **根据测试场景选择合适的账号类型**：`);
    parts.push(`   - 管理员功能测试 → 使用管理员账号`);
    parts.push(`   - 安全审计功能测试 → 使用安全审计账号`);
    parts.push(`   - 普通用户功能测试 → 使用普通用户账号`);
    parts.push(`4. **禁止使用占位符**，如 "xxx"、"admin"（除非配置中就是admin）、"password" 等`);
    parts.push('');
    
    return parts.join('\n');
  }

  /**
   * 🆕 阶段3：为单个测试点生成测试用例
   * 一个测试点可能对应多个测试用例（不同场景、不同数据等）
   * @param projectId 项目ID，用于获取项目配置（访问地址、账号密码等）
   */
  async generateTestCaseForTestPoint(
    testPoint: TestPoint,
    scenarioId: string,
    scenarioName: string,
    scenarioDescription: string,
    requirementDoc: string,
    systemName: string,
    moduleName: string,
    relatedSections: string[],
    projectId?: number | null
  ): Promise<TestCaseGenerationResult> {
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log(`║       🎯 阶段3：为测试点生成测试用例 - ${testPoint.testPoint}             ║`);
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    console.log(`   测试点: ${testPoint.testPoint}`);
    console.log(`   场景: ${scenarioName}`);
    console.log(`   系统: ${systemName || '未指定'}`);
    console.log(`   模块: ${moduleName || '未指定'}`);
    console.log(`   项目ID: ${projectId || '未指定'}`);

    // 🆕 获取项目配置（访问地址、账号密码等）
    const projectConfig = await this.getProjectConfigForAI(projectId);
    const projectConfigPrompt = this.buildProjectConfigPrompt(projectConfig);

    // 🆕 提取章节信息 - 正确处理 "编号 标题" 格式
    const relatedSection = relatedSections[0] || '1.1';
    let sectionId: string;
    let sectionNameFromRelated: string | null = null;
    
    // 尝试匹配 "编号 标题" 格式
    const sectionMatch = relatedSection.match(/^([\d.]+)\s+(.+)$/);
    if (sectionMatch) {
      // 如果匹配成功，说明是 "1.1 用户登录功能" 格式
      sectionId = sectionMatch[1]; // 提取编号部分
      sectionNameFromRelated = sectionMatch[2].trim(); // 提取标题部分
    } else {
      // 否则，整个字符串就是编号
      sectionId = relatedSection;
    }
    
    // 优先使用从relatedSections提取的标题，如果没有则使用scenarioName
    const sectionName = sectionNameFromRelated || scenarioName;

    // 🔍 查询知识库（RAG增强）
    let knowledgeContext = '';
    try {
      const knowledgeBase = this.getKnowledgeBase(systemName);
      const queryText = `${testPoint.testPoint}\n${testPoint.steps}\n${scenarioName}`;
      const knowledgeResults = await knowledgeBase.searchByCategory({
        query: queryText,
        topK: 3,
        scoreThreshold: 0.5
      });
      knowledgeContext = this.buildKnowledgeContext(knowledgeResults);
    } catch (error) {
      console.warn('知识库查询失败，使用普通模式');
    }

    // 🆕 检测是否为修改页面模式
    const hasChangeSummary = /##\s*变更摘要/.test(requirementDoc);
    const isModifyMode = hasChangeSummary;

    const systemPrompt = `你是一个测试用例设计专家。你的任务是为指定的测试点生成一个或多个测试用例。
${projectConfigPrompt}
## 🚨 最重要的要求：数据一致性

**在生成每个测试用例时，必须确保：**
1. ✅ **用例名称** 与 **测试数据** 完全一致
2. ✅ **测试数据** 与 **操作步骤** 完全一致
3. ✅ **操作步骤** 必须真实执行用例名称描述的场景

**禁止出现的错误：**
- ❌ 用例名为"用户名为空"，但测试数据或步骤中有用户名的具体值
- ❌ 用例名为"正常登录"，但步骤中说"保持为空"
- ❌ 测试数据写了"用户名：admin"，但步骤中没有输入admin
- ❌ 不同用例的数据和步骤互相搞混

**生成策略：逐个用例独立思考**
- 先写用例名称 → 再写匹配的测试数据 → 最后写匹配的操作步骤
- 每个用例生成完后，必须回头检查三者是否一致
- 不要把不同用例的数据混在一起！

## 核心概念

**测试用例（TestCase）是什么？**
- 测试用例是基于测试点的具体执行方案
- 一个测试点可能对应多个测试用例（不同测试数据、不同场景、不同前置条件等）
- 每个测试用例包含：用例名称、测试步骤、预期结果、前置条件、测试数据等

**何时生成多个测试用例？**
- ✅ **推荐**：测试点涉及多种测试数据 → **生成1-2个用例**（针对当前测试点的不同数据组合）
- ✅ **推荐**：测试点涉及多种场景 → **生成1-2个用例**（不同角色、不同权限）
- ✅ **推荐**：测试点需要不同的前置条件 → **生成1-2个用例**
- ⚠️ **默认**：大多数测试点 → **生成1个用例**（专注于当前测试点描述的场景）
- ✅ **必须**：复杂测试点（多种组合）→ **生成2-3个用例**

**🔥 重要原则：避免重复生成！**
- **每个测试点只生成与该测试点直接相关的用例**
- **不要为每个测试点都生成"正常流程"用例**
- 如果测试点是"用户名为空"，只生成"用户名为空"相关的用例，不要生成"正常登录"用例
- 如果测试点是"密码错误"，只生成"密码错误"相关的用例，不要生成"正常登录"用例
- 正常流程用例应该只在"正常流程"测试点中生成

**预估测试用例数量的原则：**
- 分析测试点的复杂度：步骤数量、涉及的数据类型、场景数量
- **默认策略：每个测试点生成 1 个用例**（专注于当前测试点）
- 简单测试点（单一场景、单一数据）：**生成1个用例**
- 中等测试点（多种数据组合）：**生成1-2个用例**
- 复杂测试点（多步骤、多分支、关键功能）：**生成2-3个用例**
- 🔥 **原则：避免重复，每个用例必须与当前测试点直接相关**

## 输出格式

请输出JSON格式：
\`\`\`json
{
  "testCases": [
    {
      "name": "测试用例名称",
      "description": "测试用例描述",
      "testScenario": "测试场景名称",
      "testPoint": "测试点名称",
      "system": "系统名",
      "module": "模块名",
      "sectionId": "1.1",
      "sectionName": "章节名称",
      "priority": "high|medium|low",
      "caseType": "SMOKE|FULL|BOUNDARY|ABNORMAL",
      "tags": ["标签1", "标签2"],
      "preconditions": "前置条件",
      "testData": "用户名：admin\\n密码：123456\\n邮箱：test@example.com",
      "steps": "1. 【操作】具体操作步骤1\\n   【预期】该步骤的预期结果\\n2. 【操作】具体操作步骤2\\n   【预期】该步骤的预期结果\\n3. 【操作】具体操作步骤3\\n   【预期】该步骤的预期结果",
      "assertions": "1. 步骤1的预期结果\\n2. 步骤2的预期结果\\n3. 步骤3的预期结果（保持与steps中的预期一致）"
    }
  ]
}
\`\`\`

## 🔥 关键要求：步骤与预期结果的对应关系

**每个测试步骤必须包含两部分：**
1. **【操作】** - 具体的操作动作
2. **【预期】** - 该操作的预期结果

**格式示例：**
1. 【操作】打开用户登录页面
   【预期】页面正常加载，显示用户名和密码输入框
2. 【操作】输入正确的用户名"admin"和密码"123456"
   【预期】输入框正常接收输入，密码显示为掩码
3. 【操作】点击"登录"按钮
   【预期】系统验证通过，跳转到首页，显示欢迎信息

**assertions字段说明：**
- assertions字段应该汇总所有步骤的预期结果
- 数量必须与steps中的步骤数量一致
- 内容应该与steps中的【预期】部分保持一致
- 每条预期结果独立成行，便于测试人员验证

## 用例类型判断规则（caseType）

⚠️ **强制要求：每次生成的测试用例中，必须至少包含 1 条 SMOKE（冒烟用例）！**

- **SMOKE（冒烟用例）**【必须生成至少1条，优先级必须为 high】：核心功能验证、基本正向流程、高优先级场景、主要业务路径、必须通过的基础功能
  * 示例：用户登录的正常流程、订单创建的基本流程、数据查询的主要功能
  * 判断标准：如果该功能不通过，整个模块基本不可用
  * 🔥 **SMOKE 用例的 priority 字段必须设置为 "high"**
  
- **FULL（全量用例）**：详细功能验证、边界条件测试、异常情况处理、各种输入组合、非核心功能验证
- **ABNORMAL（异常用例）**：异常情况处理、各种输入组合、非核心功能验证
- **BOUNDARY（边界用例）**：边界条件测试、各种输入组合、非核心功能验证
- **PERFORMANCE（性能用例）**：性能测试、各种输入组合、非核心功能验证
- **SECURITY（安全用例）**：安全测试、各种输入组合、非核心功能验证
- **USABILITY（可用性用例）**：可用性测试、各种输入组合、非核心功能验证
- **COMPATIBILITY（兼容性用例）**：兼容性测试、各种输入组合、非核心功能验证
- **RELIABILITY（可靠性用例）**：可靠性测试、各种输入组合、非核心功能验证

## 重要提示

### 用例数量要求（重要！）
- **一个测试点通常需要生成 2-3 个测试用例**，覆盖不同的测试场景：
  * 至少1个 SMOKE（冒烟用例）- 正常流程
  * 1-2个 BOUNDARY（边界用例）- 边界条件
  * 0-1个 ABNORMAL（异常用例）- 异常情况
- **只有极其简单的测试点才生成1个用例**（如：纯查看类、单一操作）
- **大多数测试点都应该生成多个用例**，以覆盖：
  * 正常情况 vs 异常情况
  * 有数据 vs 无数据
  * 不同的输入组合
  * 不同的边界值

### 步骤格式要求
- 测试用例的步骤应该基于测试点的steps，但可以更详细
- **每个步骤必须包含【操作】和【预期】两部分**
- steps字段中的每一步都要用"【操作】...【预期】..."的格式
- assertions字段要汇总所有【预期】内容，且数量必须与步骤数量一致

### 测试数据要求
- 🔥 **如果步骤中使用了具体的测试数据，必须在 testData 字段中列出**
- 格式："字段1：值1\\n字段2：值2\\n字段3：值3"

${knowledgeContext}

${isModifyMode ? `
## ⚠️ 修改页面模式特别说明
当前需求文档包含【变更摘要】，这是一个修改页面。
生成的测试用例应该聚焦于变更的功能点。
` : ''}`;

const userPrompt = `请为以下测试点生成测试用例：

## 测试场景信息
- 系统名称: ${systemName}
- 模块名称: ${moduleName}
- 场景ID: ${scenarioId}
- 场景名称: ${scenarioName}
- 场景描述: ${scenarioDescription}
- 关联章节: ${relatedSections.join(', ')}

## 测试点信息
- 测试点名称: ${testPoint.testPoint}
- 测试步骤: ${testPoint.steps}
- 预期结果: ${testPoint.expectedResult}
- 风险等级: ${testPoint.riskLevel || 'medium'}

## 相关需求内容
${requirementDoc.substring(0, 2000)}

## 🔥 生成要求（必须严格遵守）

### 1. 数据一致性要求（最重要！）
⚠️ **严格检查：用例名称、测试数据、操作步骤、预期结果必须完全一致，不能相互矛盾！**

**✅ 正确示例1：用户名不为空，密码为空 - BOUNDARY**
- 用例名称："用户名不为空，密码为空"
- testData："用户名：admin\\n密码：（空）"
- steps："1. 【操作】打开登录页面\\n   【预期】页面正常加载\\n2. 【操作】在用户名输入框中输入'admin'\\n   【预期】输入框正常接收输入\\n3. 【操作】密码输入框保持为空\\n   【预期】密码输入框保持空白状态\\n4. 【操作】点击登录按钮\\n   【预期】显示错误提示：密码不能为空"
- 说明：✅ 用例名说"密码为空"，testData标记"密码：（空）"，steps说"保持为空" - 三者完全一致！

**✅ 正确示例2：用户名为空，密码不为空 - BOUNDARY**
- 用例名称："用户名为空，密码不为空"
- testData："用户名：（空）\\n密码：123456"
- steps："1. 【操作】打开登录页面\\n   【预期】页面正常加载\\n2. 【操作】用户名输入框保持为空\\n   【预期】用户名输入框保持空白状态\\n3. 【操作】在密码输入框中输入'123456'\\n   【预期】输入框正常接收输入\\n4. 【操作】点击登录按钮\\n   【预期】显示错误提示：用户名不能为空"
- 说明：✅ 用例名说"用户名为空"，testData标记"用户名：（空）"，steps说"保持为空" - 三者完全一致！

**❌ 错误示例（绝对禁止）：**
- 用例名称："用户名为空，密码不为空"
- testData："用户名：（空）\\n密码：123456"  ← 这里是对的
- steps："1. 打开登录页面\\n2. 在用户名输入框中输入'admin'\\n3. 在密码输入框中输入'123456'"  ← ❌❌❌ 错误！用例名说"用户名为空"，但步骤却在输入admin！
- 问题：用例名和testData说"用户名为空"，但steps却在输入用户名，完全矛盾！这种用例会被系统自动过滤掉！

**检查清单（生成前必须逐项检查）：**
- [ ] 用例名称描述的场景与测试数据一致？
- [ ] 测试数据与操作步骤中使用的数据一致？
- [ ] 操作步骤是否真的在执行用例名称描述的场景？
- [ ] 预期结果是否符合用例名称描述的场景？
- [ ] 如果用例名称说"为空"，则测试数据必须标记为"（空）"，步骤中不能输入该字段
- [ ] 如果用例名称说"不为空"，则测试数据必须有具体值，步骤中必须输入该字段
- [ ] 步骤中使用的所有具体值（如 'admin'、'123456'）必须在测试数据中列出

**🔥 特别注意：**
- 如果测试数据字段为空，请在测试数据中明确标记为"字段名：（空）"
- 步骤中使用的任何具体数据（账号、密码、数字等）都必须在 testData 字段中完整列出

### 2. 步骤格式要求
1. **每个测试步骤必须包含【操作】和【预期】两部分**
2. 格式：
   - 1. 【操作】具体操作内容
   -    【预期】该步骤的预期结果
3. assertions字段要汇总所有【预期】内容，数量与步骤数一致

### 3. 用例数量要求（关键！）
🔥 **请为该测试点生成 1 个测试用例，专注于当前测试点描述的场景**：
   - **只生成与当前测试点直接相关的用例**
   - **不要生成与测试点无关的正常流程用例**
   - 例如：
     * 测试点是"用户名为空，密码正确" → 只生成"用户名为空，密码正确"用例，不要生成"正常登录"
     * 测试点是"密码错误" → 只生成"密码错误"用例，不要生成"正常登录"
     * 测试点是"用户名和密码均正确" → 生成"正常登录"用例
   - **特殊情况**：如果测试点本身包含多种数据组合（如"用户名超长字符输入"可能需要测试不同长度），可以生成1-2个用例

### 4. 🔥 用例与测试点的对应关系（极其重要！）

⚠️ **每个测试用例必须与当前测试点直接对应，不要生成无关用例！**

**正确示例：**
- 测试点："用户名为空，密码正确" → 用例："用户名为空，密码正确" ✅
- 测试点："密码错误" → 用例："密码错误" ✅
- 测试点："用户名和密码均正确" → 用例："用户名和密码均正确，正常登录" ✅

**错误示例（绝对禁止）：**
- 测试点："用户名为空，密码正确" → 用例："用户名和密码均正确，正常登录" ❌❌❌
- 测试点："密码错误" → 用例："正常登录" ❌❌❌
- 测试点："用户名超长字符输入" → 用例："正常登录" ❌❌❌

**核心原则：**
- 用例名称必须包含测试点的核心关键词
- 用例的测试数据必须符合测试点的描述
- 用例的操作步骤必须验证测试点的场景
- 不要为每个测试点都生成"正常流程"用例

### 5. 主流程用例识别（仅在测试点本身是正常流程时使用）

### 5. 主流程用例识别（仅在测试点本身是正常流程时使用）

⚠️ **只有当测试点本身描述的是正常流程时，才生成 SMOKE 类型的主流程用例！**

**主流程测试点特征：**
- 测试点名称包含：正常、正确、有效、成功、合法、标准、均正确、均有效
- 测试点描述的是理想条件下的操作路径
- 例如："用户名和密码均正确，凭据正确"、"正常提交订单"

**非主流程测试点特征：**
- 测试点名称包含：错误、无效、失败、异常、为空、超长、边界、不正确
- 测试点描述的是边界条件或异常情况
- 例如："用户名为空"、"密码错误"、"用户名超长字符输入"

**用例类型判断规则：**
- 如果测试点是主流程 → 生成 SMOKE 类型用例，priority 为 high
- 如果测试点是边界条件 → 生成 BOUNDARY 类型用例，priority 为 medium
- 如果测试点是异常情况 → 生成 ABNORMAL 类型用例，priority 为 medium

**排序规则（已由系统自动处理，无需关注）：**
**排序规则（已由系统自动处理，无需关注）：**
1. 系统会自动将 SMOKE 类型用例排在前面
2. 然后是 BOUNDARY、ABNORMAL 等类型

**识别主流程的关键词（仅供参考）：**
- ✅ 正常、正确、有效、成功、合法、标准、均正确、均有效
- ❌ 错误、无效、失败、异常、为空、超长、边界、不正确

⚠️ **生成前检查清单：**
- [ ] 用例类型（caseType）是否与测试点的性质匹配？
- [ ] 如果测试点是正常流程，caseType 是否为 SMOKE？
- [ ] 如果测试点是边界/异常，caseType 是否为 BOUNDARY/ABNORMAL？
- [ ] 用例名称是否与测试点名称直接对应？

### 6. 冒烟用例要求
⚠️ **只有当测试点本身是正常流程时，才生成 SMOKE 类型的冒烟用例**
   - 如果测试点是"用户名和密码均正确" → 生成 SMOKE 用例
   - 如果测试点是"用户名为空" → 生成 BOUNDARY 用例，不是 SMOKE
   - 如果测试点是"密码错误" → 生成 ABNORMAL 用例，不是 SMOKE
   - SMOKE 用例的优先级必须为 high

### 7. 测试数据要求
🔥 **testData 字段格式要求**：
- **必须换行显示**：每个字段占一行，格式为"字段名：值\\n"
- 示例："用户名：admin\\n密码：123456\\n邮箱：test@example.com"
- ⚠️ 如果字段为空，明确标记："字段名：（空）"
- 如果步骤中使用了具体的测试数据，必须在 testData 字段中列出
- 确保与用例名称、步骤内容完全一致

### 🚨 生成前自查清单（每个用例生成前必须逐项检查）
**为了避免数据混乱，请在生成每个用例时，严格按照以下步骤自查：**

1. **读取用例名称** → 确定该用例要测试什么场景
2. **编写测试数据** → 根据用例名称填写 testData 字段
   - 例如：名称是"用户名为空"，则 testData 必须写 "用户名：（空）"
   - 例如：名称是"正常登录"，则 testData 必须写具体的用户名和密码值
3. **编写操作步骤** → steps 中的操作必须与 testData 完全一致
   - 如果 testData 中某字段为（空），则 steps 中该字段必须"保持为空"
   - 如果 testData 中某字段有具体值，则 steps 中必须"输入该具体值"
4. **交叉验证** → 用例名称、testData、steps 三者必须完全一致，不能有任何矛盾

**🔥 特别警告：**
- ⛔ 绝对不允许出现：用例名为"用户名为空"，但 testData 或 steps 中有用户名的具体值
- ⛔ 绝对不允许出现：用例名为"用户名不为空"，但 testData 或 steps 中没有用户名
- ⛔ 如果 testData 写了 "用户名：admin"，则 steps 必须写 "输入'admin'"
- ⛔ 如果 testData 写了 "密码：（空）"，则 steps 必须写 "密码保持为空"
- ⛔ 不要把不同用例的数据和步骤搞混！每个用例独立检查！

请基于测试点的步骤和预期结果，**生成 1 个与当前测试点直接对应的测试用例**。

🔥 **关键要求：**
1. **用例必须与测试点直接对应** - 不要生成无关的正常流程用例
2. **用例名称必须反映测试点的核心场景** - 例如测试点是"用户名为空"，用例名也应该是"用户名为空"相关
3. **根据测试点性质选择正确的用例类型**：
   - 测试点是正常流程 → SMOKE
   - 测试点是边界条件 → BOUNDARY
   - 测试点是异常情况 → ABNORMAL
4. **逐个用例检查数据一致性** - 用例名称、测试数据、操作步骤必须完全一致

直接输出JSON格式，不要其他说明文字。`;

    try {
      console.log(`🤖 正在为测试点"${testPoint.testPoint}"生成测试用例...`);
      const aiResponse = await this.callAI(systemPrompt, userPrompt, 4000);

      // 解析JSON
      const parsed = this.parseAIJsonResponse(aiResponse, '测试用例生成');
      const testCases: TestCase[] = parsed.testCases || [];

      // 补充信息
      testCases.forEach(tc => {
        tc.system = systemName;
        tc.module = moduleName;
        tc.testScenario = scenarioName;
        tc.testScenarioId = scenarioId;
        tc.sectionId = sectionId;
        tc.sectionName = sectionName;
        
        // 🆕 确保用例类型字段存在（如果 AI 没有返回，根据优先级和风险等级自动判断）
        if (!tc.caseType) {
          tc.caseType = this.determineCaseType(tc, testPoint);
        }
        
        // 确保每个测试用例都包含关联的测试点信息
        // 使用类型断言访问 AI 返回的动态字段
        const tcAny = tc as any;
        if (!tc.testPoints) {
          // 🔧 修复：优先使用测试用例自己的 steps 和 expectedResult，而不是测试点的默认值
          tc.testPoints = [{
            testPoint: testPoint.testPoint,  // 测试点名称
            riskLevel: tcAny.riskLevel || testPoint.riskLevel || 'medium',
            description: testPoint.description || '',
            coverageAreas: testPoint.coverageAreas || '',
            testScenario: scenarioName,
            testPurpose: tc.testPurpose || tc.description || '',
            // 🔧 关键修复：测试用例自己的值优先于测试点的默认值
            steps: tc.steps || testPoint.steps || '',
            expectedResult: tc.assertions || tcAny.expectedResult || testPoint.expectedResult || ''
          }];
        } else {
          // 确保每个测试点都有 testPurpose，并优先使用测试用例自己的步骤和预期结果
          tc.testPoints = tc.testPoints.map(tp => ({
            ...tp,
            testPurpose: tp.testPurpose || tc.testPurpose || tc.description || '',
            testScenario: tp.testScenario || scenarioName,
            // 🔧 关键修复：测试用例自己的值优先
            steps: tp.steps || tc.steps || '',
            expectedResult: tp.expectedResult || tc.assertions || tcAny.expectedResult || ''
          }));
        }
      });

      // 🔥 智能判断：只有正常流程测试点才需要 SMOKE 用例
      const isNormalFlowTestPoint = this.isMainFlowTestCase(testPoint.testPoint);
      const hasSmokeCase = testCases.some(tc => tc.caseType === 'SMOKE');
      
      if (isNormalFlowTestPoint && !hasSmokeCase && testCases.length > 0) {
        console.warn('⚠️  警告：正常流程测试点没有生成冒烟用例，自动将第一个用例转换为 SMOKE 类型');
        
        const targetCase = testCases[0];
        targetCase.caseType = 'SMOKE';
        targetCase.priority = 'high'; // 🔥 冒烟用例优先级必须为 high
        
        console.log(`   ✅ 已将用例 "${targetCase.name}" 设置为 SMOKE（冒烟用例），优先级：high`);
      } else if (!isNormalFlowTestPoint && hasSmokeCase) {
        console.warn('⚠️  警告：非正常流程测试点生成了冒烟用例，自动调整用例类型');
        
        testCases.forEach(tc => {
          if (tc.caseType === 'SMOKE') {
            // 根据测试点名称判断应该是 BOUNDARY 还是 ABNORMAL
            const isAbnormal = /错误|失败|异常|无效/.test(testPoint.testPoint);
            tc.caseType = isAbnormal ? 'ABNORMAL' : 'BOUNDARY';
            tc.priority = 'medium';
            console.log(`   ✅ 已将用例 "${tc.name}" 从 SMOKE 调整为 ${tc.caseType}，优先级：medium`);
          }
        });
      }
      
      // 🔥 确保所有 SMOKE 用例的优先级都是 high
      testCases.forEach(tc => {
        if (tc.caseType === 'SMOKE' && tc.priority !== 'high') {
          console.log(`   ⚠️  修正冒烟用例 "${tc.name}" 的优先级：${tc.priority} -> high`);
          tc.priority = 'high';
        }
      });

      // 🔥 验证测试用例的数据一致性
      console.log(`\n🔍 [数据一致性验证] 检查生成的测试用例...`);
      let hasConsistencyIssues = false;
      let hasCriticalErrors = false;
      const validTestCases: TestCase[] = [];
      const invalidTestCases: { case: TestCase; validation: any }[] = [];
      
      testCases.forEach((tc, index) => {
        const validation = this.validateTestCaseConsistency(tc);
        if (!validation.isValid) {
          hasConsistencyIssues = true;
          console.error(`\n${validation.severity === 'error' ? '❌' : '⚠️'} [一致性问题] 用例 ${index + 1}: "${tc.name}" [${validation.severity.toUpperCase()}]`);
          validation.warnings.forEach(warning => {
            console.error(`   ${warning}`);
          });
          console.error(`   📋 用例信息:`);
          console.error(`      - 测试数据: ${tc.testData || '无'}`);
          console.error(`      - 操作步骤预览: ${(tc.steps || '').substring(0, 150)}...`);
          
          if (validation.severity === 'error') {
            hasCriticalErrors = true;
            invalidTestCases.push({ case: tc, validation });
            console.error(`   🚫 此用例存在严重错误，将被过滤掉\n`);
          } else {
            validTestCases.push(tc);
            console.warn(`   ⚠️ 此用例存在警告，但仍会保留\n`);
          }
        } else {
          validTestCases.push(tc);
          console.log(`   ✅ 用例 ${index + 1}: "${tc.name}" - 数据一致性检查通过`);
        }
      });

      if (hasCriticalErrors) {
        console.error(`\n🚫 [严重错误] 检测到 ${invalidTestCases.length} 个用例存在严重的数据一致性问题，已被过滤`);
        console.error(`   保留了 ${validTestCases.length} 个有效用例`);
        console.error(`   建议：请检查AI生成质量，或考虑重新生成\n`);
      } else if (hasConsistencyIssues) {
        console.warn(`\n⚠️ [警告] 部分用例存在轻微的一致性问题，但仍会保留\n`);
      } else {
        console.log(`   ✅ 所有测试用例数据一致性检查通过\n`);
      }

      // 如果所有用例都被过滤了，返回原始用例但添加警告标签
      const finalTestCases = validTestCases.length > 0 ? validTestCases : testCases.map(tc => ({
        ...tc,
        tags: [...(tc.tags || []), '⚠️数据可能不一致']
      }));

      // 🔥 智能排序：主流程 + SMOKE类型 + 优先级
      finalTestCases.sort((a, b) => {
        // 1. 识别主流程用例（正常流程优先）
        const isMainFlowA = this.isMainFlowTestCase(a.name);
        const isMainFlowB = this.isMainFlowTestCase(b.name);
        
        if (isMainFlowA && !isMainFlowB) return -1; // A是主流程，排前面
        if (!isMainFlowA && isMainFlowB) return 1;  // B是主流程，排前面
        
        // 2. 都是主流程或都不是主流程时，按用例类型排序（SMOKE 最高优先级）
        const typeOrder: Record<string, number> = {
          SMOKE: 1,
          FULL: 2,
          BOUNDARY: 3,
          ABNORMAL: 4,
          PERFORMANCE: 5,
          SECURITY: 6,
          USABILITY: 7,
          COMPATIBILITY: 8
        };
        const typeA = typeOrder[a.caseType || 'FULL'] || 9;
        const typeB = typeOrder[b.caseType || 'FULL'] || 9;
        if (typeA !== typeB) {
          return typeA - typeB;
        }

        // 3. 用例类型相同时，按优先级排序（high → medium → low）
        const priorityOrder: Record<string, number> = { high: 1, medium: 2, low: 3 };
        const priorityA = priorityOrder[a.priority] || 2;
        const priorityB = priorityOrder[b.priority] || 2;
        return priorityA - priorityB;
      });

      console.log(`✅ 成功生成 ${finalTestCases.length} 个有效测试用例（已按主流程+优先级排序）${validTestCases.length < testCases.length ? ` (过滤掉 ${testCases.length - validTestCases.length} 个)` : ''}`);
      finalTestCases.forEach((tc, i) => {
        const isMainFlow = this.isMainFlowTestCase(tc.name);
        console.log(`   ${i + 1}. ${tc.name} [${tc.caseType || 'FULL'}] [${tc.priority}]${isMainFlow ? ' 🔥主流程' : ''}`);
      });

      // 🆕 构建被过滤用例列表（带标记）
      const filteredCasesWithMark = invalidTestCases.map(({ case: tc, validation }) => ({
        ...tc,
        isFiltered: true,
        filterReason: validation.warnings.join('; ')
      }));

      // 🆕 返回包含过滤信息的完整结果
      return {
        validCases: finalTestCases,
        filteredCases: filteredCasesWithMark,
        totalGenerated: testCases.length,
        validCount: finalTestCases.length,
        filteredCount: invalidTestCases.length
      };
    } catch (error: any) {
      console.error('❌ 生成测试用例失败2:', error.message);
      // 回退方案：生成一个基础测试用例
      // 🆕 从 relatedSections 中正确提取 sectionId
      const relatedSection = relatedSections[0] || '1.1';
      const sectionMatch = relatedSection.match(/^([\d.]+)\s+(.+)$/);
      const fallbackSectionId = sectionMatch ? sectionMatch[1] : relatedSection;
      const fallbackCase: TestCase = {
        name: `${fallbackSectionId}-${testPoint.testPoint}`,
        description: `基于测试点"${testPoint.testPoint}"的测试用例`,
        testScenario: scenarioName,
        testScenarioId: scenarioId,
        system: systemName,
        module: moduleName,
        sectionId: fallbackSectionId,
        sectionName: scenarioName,
        priority: testPoint.riskLevel === 'high' ? 'high' : testPoint.riskLevel === 'low' ? 'low' : 'medium',
        caseType: 'SMOKE', // 🔥 回退方案默认生成冒烟用例
        tags: [scenarioName, 'AI生成', '冒烟用例'],
        preconditions: '准备测试环境和数据',
        testData: '使用系统提供的测试数据',
        steps: testPoint.steps,
        assertions: testPoint.expectedResult,
        testPoints: [{
          testPoint: testPoint.testPoint,
          riskLevel: testPoint.riskLevel || 'medium',
          description: testPoint.description || '',
          coverageAreas: testPoint.coverageAreas || '',
          testScenario: scenarioName,
          // 🔧 回退方案：使用测试点的步骤和预期结果
          steps: testPoint.steps,
          expectedResult: testPoint.expectedResult
        }]
      };
      // 🆕 返回包含过滤信息的完整结果（回退方案无过滤）
      return {
        validCases: [fallbackCase],
        filteredCases: [],
        totalGenerated: 1,
        validCount: 1,
        filteredCount: 0
      };
    }
  }

  /**
   * 🆕 阶段3：为场景的所有测试点批量生成测试用例
   * 兼容性方法：保留旧接口
   */
  async generateTestCase(
    scenarioId: string,
    scenarioName: string,
    scenarioDescription: string,
    testPoints: TestPoint[],
    requirementDoc: string,
    systemName: string,
    moduleName: string,
    relatedSections: string[]
  ): Promise<TestCase> {
    // 如果只有一个测试点，直接生成
    if (testPoints.length === 1) {
      const result = await this.generateTestCaseForTestPoint(
        testPoints[0],
        scenarioId,
        scenarioName,
        scenarioDescription,
        requirementDoc,
        systemName,
        moduleName,
        relatedSections
      );
      return result.validCases[0]; // 返回第一个有效测试用例
    }

    // 多个测试点：为第一个测试点生成测试用例（兼容旧逻辑）
    const result = await this.generateTestCaseForTestPoint(
      testPoints[0],
      scenarioId,
      scenarioName,
      scenarioDescription,
      requirementDoc,
      systemName,
      moduleName,
      relatedSections
    );
    return result.validCases[0];
  }

  /**
   * 根据测试点列表确定优先级
   */
  private determinePriority(testPoints: TestPoint[]): string {
    const highRiskCount = testPoints.filter(tp => tp.riskLevel === 'high').length;
    const mediumRiskCount = testPoints.filter(tp => tp.riskLevel === 'medium').length;
    
    if (highRiskCount > 0) return 'high';
    if (mediumRiskCount > testPoints.length / 2) return 'medium';
    return 'low';
  }

  /**
   * 根据测试用例名称、描述、优先级和测试点风险等级自动判断用例类型
   * @param tc 测试用例对象
   * @param testPoint 关联的测试点
   * @returns 用例类型
   */
  private determineCaseType(tc: any, testPoint: TestPoint): string {
    const caseName = tc.name || '';
    const caseDescription = tc.description || '';
    const testPointName = testPoint.testPoint || '';
    
    // 合并所有文本用于关键词匹配
    const combinedText = `${caseName} ${caseDescription} ${testPointName}`.toLowerCase();
    
    // 按优先级顺序判断用例类型（优先级从高到低）
    
    // 1. 性能用例 - 关键词：性能、响应时间、并发、吞吐量、负载
    if (this.containsKeywords(combinedText, ['性能', '响应时间', '并发', '吞吐量', '负载', '压力测试', '稳定性测试'])) {
      return 'PERFORMANCE';
    }
    
    // 2. 安全用例 - 关键词：安全、权限、加密、认证、授权、XSS、SQL注入
    if (this.containsKeywords(combinedText, ['安全', '权限', '加密', '认证', '授权', 'xss', 'sql注入', '防护', '攻击'])) {
      return 'SECURITY';
    }
    
    // 3. 兼容性用例 - 关键词：兼容、浏览器、设备、平台、版本
    if (this.containsKeywords(combinedText, ['兼容', '浏览器', '设备', '平台', '版本', '适配', '多端'])) {
      return 'COMPATIBILITY';
    }
    
    // 4. 边界用例 - 关键词：边界、最大、最小、极限、超出、范围
    if (this.containsKeywords(combinedText, ['边界', '最大', '最小', '极限', '超出', '范围', '限制', '上限', '下限'])) {
      return 'BOUNDARY';
    }
    
    // 5. 异常用例 - 关键词：异常、错误、失败、非法、无效、中断
    if (this.containsKeywords(combinedText, ['异常', '错误', '失败', '非法', '无效', '中断', '故障', '容错', '降级'])) {
      return 'ABNORMAL';
    }
    
    // 6. 可用性用例 - 关键词：可用性、易用、友好、体验、交互
    if (this.containsKeywords(combinedText, ['可用性', '易用', '友好', '体验', '交互', 'ui', 'ux', '界面'])) {
      return 'USABILITY';
    }
    
    // 7. 冒烟用例 - 判断条件：
    //    - 高优先级或高风险
    //    - 包含核心、基本、主流程等关键词
    const isHighPriorityOrRisk = tc.priority === 'high' || testPoint.riskLevel === 'high';
    const isCoreFunction = this.containsKeywords(combinedText, ['核心', '基本', '主流程', '关键', '必须', '登录', '注册']);
    
    if (isHighPriorityOrRisk || isCoreFunction) {
      return 'SMOKE';
    }
    
    // 8. 默认为全量用例
    return 'FULL';
  }

  /**
   * 检查文本中是否包含任意关键词
   * @param text 要检查的文本
   * @param keywords 关键词列表
   * @returns 是否包含任意关键词
   */
  private containsKeywords(text: string, keywords: string[]): boolean {
    return keywords.some(keyword => text.includes(keyword));
  }

  /**
   * 验证测试用例的数据一致性
   * @param testCase 测试用例
   * @returns 是否存在一致性问题
   */
  private validateTestCaseConsistency(testCase: TestCase): { isValid: boolean; warnings: string[]; severity: 'error' | 'warning' | 'ok' } {
    const warnings: string[] = [];
    let severity: 'error' | 'warning' | 'ok' = 'ok';
    const caseName = (testCase.name || '').toLowerCase();
    const testData = (testCase.testData || '').toLowerCase();
    const steps = (testCase.steps || '').toLowerCase();

    // 🔥 智能提取用例名称中提到的字段（通用方案）
    
    // 第一步：预处理组合表达，拆分成独立字段
    // 处理 "XX和YY均..." 或 "XX、YY均..." 格式
    let processedCaseName = caseName;
    const combinationPatterns = [
      /([^，。、\s和]{2,6})和([^，。、\s和]{2,6})均(正确|错误|为空|不为空|有效|无效)/g,
      /([^，。、\s、]{2,6})、([^，。、\s、]{2,6})均(正确|错误|为空|不为空|有效|无效)/g,
    ];
    
    combinationPatterns.forEach(pattern => {
      processedCaseName = processedCaseName.replace(pattern, (match, field1, field2, status) => {
        // 将 "XX和YY均正确" 转换为 "XX正确，YY正确"
        return `${field1}${status}，${field2}${status}`;
      });
    });

    // 第二步：从处理后的用例名称中提取字段
    // 匹配模式：XX为空、XX不为空、XX正确、XX错误、XX不填、输入XX等
    const fieldExtractionPatterns = [
      /([^，。、\s]{2,8}?)为空/g,
      /([^，。、\s]{2,8}?)不为空/g,
      /([^，。、\s]{2,8}?)不填/g,
      /([^，。、\s]{2,8}?)正确/g,
      /([^，。、\s]{2,8}?)错误/g,
      /([^，。、\s]{2,8}?)有效/g,
      /([^，。、\s]{2,8}?)无效/g,
      /不输入([^，。、\s]{2,8})/g,
      /输入([^，。、\s]{2,8})/g,
    ];

    // 提取所有可能的字段名
    const detectedFields = new Set<string>();
    fieldExtractionPatterns.forEach(pattern => {
      const matches = processedCaseName.matchAll(pattern);
      for (const match of matches) {
        const field = match[1];
        // 过滤掉一些常见的非字段词、抽象概念词和无效字段
        // 🔥 增加抽象概念词排除：凭据、信息、数据、内容、资料、参数、格式 等
        const excludeWords = [
          // 测试相关
          '测试', '用例', '场景', '功能', '检查', '验证', '系统', '正常', '成功', '失败',
          // 抽象概念词（不是具体输入字段）
          '凭据', '信息', '数据', '内容', '资料', '参数', '格式', '条件', '状态', '结果',
          '登录', '注册', '提交', '请求', '响应', '操作', '流程', '规则', '逻辑'
        ];
        const isValidField = field && 
                            field.length >= 2 && 
                            field.length <= 8 && 
                            !excludeWords.includes(field) &&
                            !field.includes('和') &&
                            !field.includes('或');
        
        if (isValidField) {
          detectedFields.add(field);
        }
      }
    });

    // 检查1: 用例名称与测试数据的一致性（通用检查）
    // 如果用例名称包含"XX为空"、"XX不填"等，测试数据和步骤中不应该有该字段的值
    const emptyKeywordPatterns = ['为空', '不填', '不输入', '未输入', '空值'];
    const notEmptyKeywordPatterns = ['不为空', '正确', '有效', '输入'];

    // 对每个检测到的字段进行动态验证
    detectedFields.forEach(field => {
      // 判断该字段是"为空"场景还是"不为空"场景（使用预处理后的名称）
      const isEmptyScenario = emptyKeywordPatterns.some(kw => 
        processedCaseName.includes(`${field}${kw}`) || processedCaseName.includes(`${kw}${field}`)
      );
      const isNotEmptyScenario = notEmptyKeywordPatterns.some(kw => 
        processedCaseName.includes(`${field}${kw}`) || processedCaseName.includes(`${kw}${field}`)
      );

      // 验证"为空"场景
      if (isEmptyScenario) {
        // 检查测试数据中该字段的值
        if (testData.includes(field)) {
          const hasEmptyMarker = testData.includes(`${field}：（空）`) || 
                                 testData.includes(`${field}：空`) ||
                                 testData.includes(`${field}:（空）`) ||
                                 testData.includes(`${field}:空`) ||
                                 testData.includes(`${field}为空`);
          
          // 提取当前字段的值（更精确的检查）
          const fieldValueMatch = testData.match(new RegExp(`${field}[：:]\\s*([^\\n]+)`));
          const fieldValue = fieldValueMatch ? fieldValueMatch[1].trim() : '';
          
          // 检查该字段的值是否为空标记
          const isEmptyValue = fieldValue.includes('（空）') || fieldValue.includes('空') || fieldValue.length === 0;
          
          // 检查该字段是否有具体的值
          const hasConcreteValue = fieldValue && !isEmptyValue && fieldValue.length > 0;

          if (!hasEmptyMarker && hasConcreteValue) {
            warnings.push(`❌ 严重错误：用例名称表明"${field}为空"，但测试数据中显示${field}有具体值（${fieldValue}）`);
            severity = 'error';
          }
        }

        // 🔧 修复：检查步骤中是否明确说明保持该字段为空
        const keepEmptyPatterns = [
          '保持为空', '保持.*为空', '不输入', '不填写', '留空', '为空',
          '输入框为空', '字段为空', '保持.*输入框为空', '保持.*字段为空'
        ];
        const hasKeepEmptyAction = keepEmptyPatterns.some(pattern => {
          const regex = new RegExp(pattern, 'i');
          return regex.test(steps) && steps.includes(field);
        });
        
        // 🔧 修复：更精确的输入检测模式 - 必须是"输入 + 具体值"的组合
        // 排除"输入框"、"输入框为空"等描述性文本
        // 使用更严格的正则：确保"输入"后面跟的是引号包裹的值或中文/字母数字
        const inputWithValuePattern = new RegExp(
          `(在|向)?${field}(输入框|字段)?[中]?输入['"]([^'"]+)['"]`,
          'i'
        );
        const inputMatch = steps.match(inputWithValuePattern);
        
        // 只有当匹配到"输入 + 具体值"，且不是"输入框为空"这类描述时，才认为是在输入具体值
        const isInputtingConcreteValue = inputMatch && 
          inputMatch[3] && // 确保捕获到了具体值
          inputMatch[3].trim().length > 0 && // 值不为空
          !['为空', '空', '留空', '（空）'].includes(inputMatch[3].trim()) && // 排除空值描述
          !steps.includes('输入框为空') && // 排除"输入框为空"
          !steps.includes('字段为空'); // 排除"字段为空"

        if (isInputtingConcreteValue && !hasKeepEmptyAction) {
          warnings.push(`❌ 严重错误：用例名称表明"${field}为空"，但操作步骤中在输入${field}的具体值（${inputMatch[3].trim()}）`);
          severity = 'error';
        }
      }

      // 验证"不为空"场景
      if (isNotEmptyScenario) {
        // 检查测试数据中是否标记为空
        const isMarkedAsEmpty = testData.includes(`${field}：（空）`) || 
                                testData.includes(`${field}：空`) ||
                                testData.includes(`${field}:（空）`) ||
                                testData.includes(`${field}:空`);

        if (isMarkedAsEmpty) {
          warnings.push(`❌ 严重错误：用例名称表明"${field}不为空"，但测试数据中标记为"（空）"`);
          severity = 'error';
        }

        // 🔥 优化输入操作检测逻辑 - 增加更多匹配模式
        // 检查步骤中是否有输入操作
        const inputKeywords = ['输入', '填写', '选择', '填入'];
        const hasInputAction = inputKeywords.some(keyword => 
          steps.includes(`${keyword}${field}`) || steps.includes(`${field}${keyword}`)
        );

        if (!hasInputAction) {
          // 额外检查1：查找"在XX输入框/字段"的模式（包含"中"字）
          const inputBoxPattern = new RegExp(`(在|向)${field}(输入框|字段|框)?[中]?(输入|填写|填入)`, 'i');
          const hasInputBox = inputBoxPattern.test(steps);
          
          // 额外检查2：查找"在XX输入框中输入'value'"的模式（更宽松）
          const inputWithValuePattern = new RegExp(`${field}[^\\n]*输入['"]?[\\w\\u4e00-\\u9fa5@]+['"]?`, 'i');
          const hasInputWithValue = inputWithValuePattern.test(steps);
          
          // 额外检查3：查找测试数据中该字段是否有值，如果有值则认为会有输入操作
          const fieldValueMatch = testData.match(new RegExp(`${field}[：:]\\s*([^\\n（空]+)`));
          const hasConcreteTestData = fieldValueMatch && fieldValueMatch[1]?.trim().length > 0;
          
          if (!hasInputBox && !hasInputWithValue && !hasConcreteTestData) {
            warnings.push(`❌ 严重错误：用例名称表明"${field}不为空"或需要输入${field}，但操作步骤中没有输入${field}的操作`);
            severity = 'error';
          }
        }
      }
    });

    // 检查2: 步骤中提到的具体值应该在测试数据中体现（通用检查）
    // 提取步骤中所有 "输入'xxx'" 或 "输入\"xxx\"" 的值
    const inputValuePattern = /输入['"]([^'"]{1,50})['"]|填写['"]([^'"]{1,50})['"]|选择['"]([^'"]{1,50})['"]|填入['"]([^'"]{1,50})['"]/g;
    const inputMatches = steps.matchAll(inputValuePattern);
    
    for (const match of inputMatches) {
      const value = match[1] || match[2] || match[3] || match[4];
      if (value && value.trim()) {
        // 检查这个值是否在测试数据中列出
        if (!testData.includes(value.toLowerCase().trim())) {
          // 排除一些通用的占位符描述
          const placeholders = ['xxx', 'yyy', 'zzz', '具体值', '相应内容', '对应值'];
          if (!placeholders.includes(value.toLowerCase())) {
            warnings.push(`⚠️ 警告：操作步骤中使用了值"${value}"，但测试数据中未列出`);
            if (severity === 'ok') severity = 'warning';
          }
        }
      }
    }

    // 检查3: 交叉验证 - 测试数据中的值必须在步骤中使用（通用检查）
    // 提取测试数据中所有 "字段名：值" 的格式
    const dataFieldPattern = /([^\n：:]{1,10})[：:]\s*([^（\n]{1,100})/g;
    const dataMatches = testData.matchAll(dataFieldPattern);
    
    for (const match of dataMatches) {
      const field = match[1]?.trim();
      const value = match[2]?.trim();
      
      if (field && value && !value.includes('空') && value.length > 0) {
        // 检查步骤中是否使用了这个值
        if (!steps.includes(value.toLowerCase())) {
          // 排除一些元数据字段
          const metaFields = ['备注', '说明', '描述', '注释'];
          if (!metaFields.includes(field)) {
            warnings.push(`⚠️ 警告：测试数据中列出了${field}的值"${value}"，但操作步骤中未使用`);
            if (severity === 'ok') severity = 'warning';
          }
        }
      }
    }

    return {
      isValid: severity === 'ok',
      warnings,
      severity
    };
  }

  /**
   * 兼容性方法：保留旧接口名称
   * @deprecated 使用 generateTestCase 代替
   */
  async generateTestPoints(
    purposeId: string,
    purposeName: string,
    purposeDescription: string,
    requirementDoc: string,
    systemName: string,
    moduleName: string,
    relatedSections: string[]
  ): Promise<TestCase> {
    // 先生成测试点
    const testPoints = await this.generateTestPointsForScenario(purposeId, purposeName, purposeDescription, requirementDoc, relatedSections);
    // 再生成测试用例
    return this.generateTestCase(purposeId, purposeName, purposeDescription, testPoints, requirementDoc, systemName, moduleName, relatedSections);
  }

  /**
   * 重新生成指定用例
   */
  async regenerateCases(
    originalCases: TestCase[],
    instruction: string,
    requirementDoc: string
  ): Promise<TestCase[]> {
    console.log(`🔄 重新生成${originalCases.length}个用例，指令: ${instruction}`);

    const systemPrompt = `你是一个测试用例优化专家。你的职责是：
1. 根据用户的优化指令改进现有测试用例
2. 保持用例的核心测试目标不变
3. 根据指令优化步骤、验证点、优先级等
4. 确保优化后的用例更完善、更易执行
5. **每个测试步骤必须包含【操作】和【预期】两部分**
6. ⚠️ **强制要求：优化后的测试用例中，必须至少保留或生成 1 条 caseType="SMOKE" 的冒烟用例**

## 🔥 步骤格式要求
每个步骤必须使用以下格式：
1. 【操作】具体操作内容
   【预期】该步骤的预期结果
2. 【操作】具体操作内容
   【预期】该步骤的预期结果

## 🔥 用例类型要求
- **必须确保至少有 1 条 SMOKE（冒烟用例）**
- SMOKE 用例用于验证核心功能的基本正向流程
- 如果原始用例中有 SMOKE 类型，必须保留
- 如果原始用例中没有 SMOKE 类型，需要将最核心的用例设置为 SMOKE

常见优化指令类型：
- "补充边界条件" - 添加更多边界值测试
- "增强步骤描述" - 让步骤更详细清晰，每步都要有【操作】和【预期】
- "增加异常场景" - 补充异常流程验证
- "调整优先级" - 重新评估优先级
- "细化验证点" - 增加更具体的验证项，确保每步都有对应的预期结果`;

    const originalCasesList = originalCases.map((tc, i) => `
### 用例 ${i + 1}: ${tc.name}
**描述**: ${tc.description}
**步骤**:
${tc.steps}
**验证点**:
${tc.assertions}
**优先级**: ${tc.priority}
**标签**: ${tc.tags.join(', ')}
`).join('\n');

    const userPrompt = `请根据以下优化指令改进测试用例：

## 优化指令
"${instruction}"

## 原始测试用例
${originalCasesList}

## 需求文档(参考)
${requirementDoc.substring(0, 1500)}...

## 🔥 输出要求

### 1. 数据一致性要求（最重要！必须严格遵守！）
⚠️ **严格检查：用例名称、测试数据、操作步骤、预期结果必须完全一致，不能相互矛盾！**

**✅ 正确示例1：用户名不为空，密码为空 - BOUNDARY**
{
  "name": "用户名不为空，密码为空",
  "testData": "用户名：admin\\n密码：（空）",
  "steps": "1. 【操作】在用户名输入框中输入'admin'\\n   【预期】输入框正常接收输入\\n2. 【操作】密码输入框保持为空\\n   【预期】密码输入框保持空白状态\\n3. 【操作】点击登录按钮\\n   【预期】显示错误提示：密码不能为空"
}
→ ✅ 三者一致：名称说"密码为空"，testData标记"密码：（空）"，steps说"保持为空"

**✅ 正确示例2：用户名为空，密码不为空 - BOUNDARY**
{
  "name": "用户名为空，密码不为空",
  "testData": "用户名：（空）\\n密码：123456",
  "steps": "1. 【操作】用户名输入框保持为空\\n   【预期】用户名输入框保持空白状态\\n2. 【操作】在密码输入框中输入'123456'\\n   【预期】输入框正常接收输入\\n3. 【操作】点击登录按钮\\n   【预期】显示错误提示：用户名不能为空"
}
→ ✅ 三者一致：名称说"用户名为空"，testData标记"用户名：（空）"，steps说"保持为空"

**❌ 严重错误示例（此类用例将被自动过滤）：**
{
  "name": "用户名为空，密码不为空",
  "testData": "用户名：（空）\\n密码：123456",
  "steps": "1. 【操作】在用户名输入框中输入'admin'\\n2. 【操作】在密码输入框中输入'123456'"
}
→ ❌ 名称和testData说"用户名为空"，但steps却在输入用户名 - 完全矛盾！会被过滤！

**检查清单（生成每个用例前必须逐项检查）：**
- [ ] 用例名称描述的场景与测试数据一致？
- [ ] 测试数据与操作步骤中使用的数据一致？
- [ ] 操作步骤是否真的在执行用例名称描述的场景？
- [ ] 预期结果是否符合用例名称描述的场景？
- [ ] 如果用例名称说"为空"，则测试数据必须标记为"（空）"，步骤中不能输入该字段
- [ ] 如果用例名称说"不为空"，则测试数据必须有具体值，步骤中必须输入该字段
- [ ] 步骤中使用的所有具体值（如 'admin'、'123456'）必须在测试数据中列出

### 2. 测试数据格式要求
🔥 **testData 字段必须换行显示，每个字段一行**：
- 格式："字段1：值1\\n字段2：值2\\n字段3：值3"
- 示例："用户名：admin\\n密码：123456\\n邮箱：test@example.com"
- ⚠️ 如果字段为空，必须明确标记："字段名：（空）"

### 3. 步骤格式要求
**每个步骤必须包含【操作】和【预期】两部分！**

请输出优化后的测试用例，保持JSON格式：
\`\`\`json
{
  "testCases": [
    {
      "name": "用例名称",
      "description": "用例描述",
      "testData": "字段1：值1\\n字段2：值2\\n字段3：值3",
      "steps": "1. 【操作】具体操作步骤1\\n   【预期】该步骤的预期结果\\n2. 【操作】具体操作步骤2\\n   【预期】该步骤的预期结果",
      "assertions": "1. 步骤1的预期结果\\n2. 步骤2的预期结果",
      "priority": "high/medium/low",
      "caseType": "SMOKE/FULL/BOUNDARY/ABNORMAL",
      "tags": ["标签"],
      "system": "系统名",
      "module": "模块名"
    }
  ]
}
\`\`\``;

    try {
      const aiResponse = await this.callAI(systemPrompt, userPrompt, 3000);

      // 解析AI响应
      let jsonText = aiResponse.trim();
      const jsonMatch = jsonText.match(/```(?:json)?\n?([\s\S]*?)\n?```/) || jsonText.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        jsonText = jsonMatch[1] || jsonMatch[0];
      }

      const parsed = JSON.parse(jsonText);
      const newCases: TestCase[] = parsed.testCases || [];

      // 🔥 强制要求：确保至少有一条 SMOKE 冒烟用例，且优先级为 high
      const hasSmokeCase = newCases.some(tc => tc.caseType === 'SMOKE');
      if (!hasSmokeCase && newCases.length > 0) {
        console.warn('⚠️  警告：重新生成的测试用例中没有冒烟用例，自动将第一个高优先级用例转换为 SMOKE 类型');
        
        // 查找第一个高优先级用例，如果没有则使用第一个用例
        const targetCase = newCases.find(tc => tc.priority === 'high') || newCases[0];
        targetCase.caseType = 'SMOKE';
        targetCase.priority = 'high'; // 🔥 冒烟用例优先级必须为 high
        
        console.log(`   ✅ 已将用例 "${targetCase.name}" 设置为 SMOKE（冒烟用例），优先级：high`);
      }
      
      // 🔥 确保所有 SMOKE 用例的优先级都是 high
      newCases.forEach(tc => {
        if (tc.caseType === 'SMOKE' && tc.priority !== 'high') {
          console.log(`   ⚠️  修正冒烟用例 "${tc.name}" 的优先级：${tc.priority} -> high`);
          tc.priority = 'high';
        }
      });

      // 🔥 验证测试用例的数据一致性
      console.log(`\n🔍 [数据一致性验证] 检查重新生成的测试用例...`);
      let hasConsistencyIssues = false;
      let hasCriticalErrors = false;
      const validNewCases: TestCase[] = [];
      const invalidNewCases: { case: TestCase; validation: any }[] = [];
      
      newCases.forEach((tc, index) => {
        const validation = this.validateTestCaseConsistency(tc);
        if (!validation.isValid) {
          hasConsistencyIssues = true;
          console.error(`\n${validation.severity === 'error' ? '❌' : '⚠️'} [一致性问题] 重新生成的用例 ${index + 1}: "${tc.name}" [${validation.severity.toUpperCase()}]`);
          validation.warnings.forEach(warning => {
            console.error(`   ${warning}`);
          });
          console.error(`   📋 用例信息:`);
          console.error(`      - 测试数据: ${tc.testData || '无'}`);
          console.error(`      - 操作步骤预览: ${(tc.steps || '').substring(0, 150)}...`);
          
          if (validation.severity === 'error') {
            hasCriticalErrors = true;
            invalidNewCases.push({ case: tc, validation });
            console.error(`   🚫 此用例存在严重错误，将被过滤掉\n`);
          } else {
            validNewCases.push(tc);
            console.warn(`   ⚠️ 此用例存在警告，但仍会保留\n`);
          }
        } else {
          validNewCases.push(tc);
          console.log(`   ✅ 重新生成的用例 ${index + 1}: "${tc.name}" - 数据一致性检查通过`);
        }
      });

      if (hasCriticalErrors) {
        console.error(`\n🚫 [严重错误] 重新生成的用例中检测到 ${invalidNewCases.length} 个存在严重的数据一致性问题，已被过滤`);
        console.error(`   保留了 ${validNewCases.length} 个有效用例`);
        console.error(`   建议：请再次重新生成或手动修正\n`);
      } else if (hasConsistencyIssues) {
        console.warn(`\n⚠️ [警告] 重新生成的用例中部分存在轻微的一致性问题，但仍会保留\n`);
      } else {
        console.log(`   ✅ 所有重新生成的测试用例数据一致性检查通过\n`);
      }

      // 如果所有用例都被过滤了，返回原始用例
      const finalNewCases = validNewCases.length > 0 ? validNewCases : originalCases.map(tc => ({
        ...tc,
        tags: [...(tc.tags || []), '⚠️重新生成失败-使用原版']
      }));

      console.log(`✅ AI重新生成完成，共${finalNewCases.length}个有效用例${validNewCases.length < newCases.length ? ` (过滤掉 ${newCases.length - validNewCases.length} 个)` : ''}`);
      return finalNewCases;

    } catch (error: any) {
      console.error(`❌ 重新生成失败，使用回退方案:`, error.message);
      // 回退到简单优化
      const newCases = originalCases.map(tc => ({
        ...tc,
        steps: tc.steps + '\n' + this.getOptimizationStep(instruction),
        assertions: tc.assertions + '\n' + this.getOptimizationAssertion(instruction),
        tags: [...tc.tags, instruction.substring(0, 10)]
      }));

      // 🔥 强制要求：确保至少有一条 SMOKE 冒烟用例（回退方案），且优先级为 high
      const hasSmokeCase = newCases.some(tc => tc.caseType === 'SMOKE');
      if (!hasSmokeCase && newCases.length > 0) {
        console.warn('⚠️  回退方案：自动将第一个高优先级用例转换为 SMOKE 类型');
        const targetCase = newCases.find(tc => tc.priority === 'high') || newCases[0];
        targetCase.caseType = 'SMOKE';
        targetCase.priority = 'high'; // 🔥 冒烟用例优先级必须为 high
        console.log(`   ✅ 已将用例 "${targetCase.name}" 设置为 SMOKE（冒烟用例），优先级：high`);
      }
      
      // 🔥 确保所有 SMOKE 用例的优先级都是 high
      newCases.forEach(tc => {
        if (tc.caseType === 'SMOKE' && tc.priority !== 'high') {
          console.log(`   ⚠️  修正冒烟用例 "${tc.name}" 的优先级：${tc.priority} -> high`);
          tc.priority = 'high';
        }
      });

      console.log(`✅ 回退方案重新生成完成`);
      return newCases;
    }
  }

  /**
   * 构建知识库上下文（RAG增强）
   */
  private buildKnowledgeContext(knowledgeResults: {
    businessRules: any[];
    testPatterns: any[];
    pitfalls: any[];
    riskScenarios: any[];
  }): string {
    console.log(`\n🔧 [RAG-格式化] 开始构建知识上下文，准备注入AI提示词...`);

    let context = '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    context += '📚 【知识库增强】以下是从企业知识库检索到的相关测试知识：\n';
    context += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';

    let totalKnowledgeAdded = 0;

    // 业务规则
    if (knowledgeResults.businessRules.length > 0) {
      console.log(`   📋 [类别1/4] 添加业务规则 ${knowledgeResults.businessRules.length} 条:`);
      context += '\n## 📋 业务规则参考\n';
      context += '（生成测试用例时必须符合这些业务规则）\n\n';
      knowledgeResults.businessRules.forEach((result, i) => {
        const knowledge = result.knowledge;
        const similarity = (result.score * 100).toFixed(1);
        console.log(`      - "${knowledge.title}" (${similarity}%, ${knowledge.content.length}字符)`);
        context += `**${i + 1}. ${knowledge.title}** (相似度: ${similarity}%)\n`;
        context += `${knowledge.content}\n\n`;
        totalKnowledgeAdded++;
      });
    } else {
      console.log(`   📋 [类别1/4] 业务规则: 无匹配`);
    }

    // 测试模式
    if (knowledgeResults.testPatterns.length > 0) {
      console.log(`   🎯 [类别2/4] 添加测试模式 ${knowledgeResults.testPatterns.length} 条:`);
      context += '\n## 🎯 测试模式参考\n';
      context += '（参考这些测试模式设计测试点，确保覆盖全面）\n\n';
      knowledgeResults.testPatterns.forEach((result, i) => {
        const knowledge = result.knowledge;
        const similarity = (result.score * 100).toFixed(1);
        console.log(`      - "${knowledge.title}" (${similarity}%, ${knowledge.content.length}字符)`);
        context += `**${i + 1}. ${knowledge.title}** (相似度: ${similarity}%)\n`;
        context += `${knowledge.content}\n\n`;
        totalKnowledgeAdded++;
      });
    } else {
      console.log(`   🎯 [类别2/4] 测试模式: 无匹配`);
    }

    // 历史踩坑点
    if (knowledgeResults.pitfalls.length > 0) {
      console.log(`   ⚠️  [类别3/4] 添加历史踩坑点 ${knowledgeResults.pitfalls.length} 条 (高优先级):`);
      context += '\n## ⚠️  历史踩坑点（必须覆盖）\n';
      context += '（这些是历史上发生过的bug，测试用例中必须包含这些场景以避免重复犯错）\n\n';
      knowledgeResults.pitfalls.forEach((result, i) => {
        const knowledge = result.knowledge;
        const similarity = (result.score * 100).toFixed(1);
        console.log(`      - "${knowledge.title}" (${similarity}%, ${knowledge.content.length}字符)`);
        context += `**${i + 1}. ${knowledge.title}** (相似度: ${similarity}%)\n`;
        context += `${knowledge.content}\n\n`;
        totalKnowledgeAdded++;
      });
    } else {
      console.log(`   ⚠️  [类别3/4] 历史踩坑点: 无匹配`);
    }

    // 资损风险场景
    if (knowledgeResults.riskScenarios.length > 0) {
      console.log(`   🔥 [类别4/4] 添加资损风险场景 ${knowledgeResults.riskScenarios.length} 条 (最高优先级):`);
      context += '\n## 🔥 资损风险场景（优先级最高）\n';
      context += '（这些场景可能导致资金损失或安全问题，必须优先测试并标记为high风险等级）\n\n';
      knowledgeResults.riskScenarios.forEach((result, i) => {
        const knowledge = result.knowledge;
        const similarity = (result.score * 100).toFixed(1);
        console.log(`      - "${knowledge.title}" (${similarity}%, ${knowledge.content.length}字符)`);
        context += `**${i + 1}. ${knowledge.title}** (相似度: ${similarity}%)\n`;
        context += `${knowledge.content}\n\n`;
        totalKnowledgeAdded++;
      });
    } else {
      console.log(`   🔥 [类别4/4] 资损风险场景: 无匹配`);
    }

    context += '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    context += '💡 请基于以上知识库内容生成更专业、更全面的测试用例\n';
    context += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';

    console.log(`✅ [RAG-格式化] 知识上下文构建完成:`);
    console.log(`   📊 总计添加 ${totalKnowledgeAdded} 条知识`);
    console.log(`   📏 上下文总长度: ${context.length} 字符`);
    console.log(`   💡 这些知识将被注入到AI系统提示词中，引导生成更专业的测试用例\n`);

    return context;
  }

  /**
   * 根据指令生成优化步骤(回退方案)
   */
  private getOptimizationStep(instruction: string): string {
    if (instruction.includes('边界')) {
      return '5. 验证边界值输入情况';
    } else if (instruction.includes('异常')) {
      return '5. 执行异常场景测试';
    } else if (instruction.includes('详细') || instruction.includes('细化')) {
      return '5. 补充详细操作说明';
    }
    return '5. 根据指令补充测试步骤';
  }

  /**
   * 根据指令生成优化验证点(回退方案)
   */
  private getOptimizationAssertion(instruction: string): string {
    if (instruction.includes('边界')) {
      return '5. 边界值处理符合预期';
    } else if (instruction.includes('异常')) {
      return '5. 异常情况得到正确处理';
    } else if (instruction.includes('详细') || instruction.includes('细化')) {
      return '5. 所有验证点均通过';
    }
    return '5. 补充验证项符合要求';
  }

  /**
   * 🔥 识别主流程测试点（正常流程、正向场景）
   */
  private isMainFlowTestPoint(testPointName: string): boolean {
    const name = testPointName.toLowerCase();
    
    // 🔥 最强正向关键词（明确表示主流程，优先级最高）
    const strongPositiveKeywords = [
      '正确', '正常', '有效', '成功', '合法', '均正确', '都正确', '全部正确',
      '均有效', '都有效', '全部有效', '均成功', '都成功',
      '凭据正确', '凭证正确', '密码正确', '账号正确',
      '数据有效', '输入有效', '格式正确', '信息正确'
    ];
    
    // 如果包含强正向关键词，一定是主流程
    const hasStrongPositiveKeyword = strongPositiveKeywords.some(keyword => name.includes(keyword));
    if (hasStrongPositiveKeyword) {
      return true;
    }
    
    // 负向关键词（这些表示异常流程、边界条件）
    const negativeKeywords = [
      '为空', '空值', '不填', '未填',
      '错误', '无效', '失败', '异常', '非法',
      '超长', '超过', '过长', '过短',
      '不存在', '不匹配', '不一致',
      '未授权', '无权限', '禁止',
      '格式错误', '类型错误', '长度不足',
      '缺少', '缺失', '不完整',
      '边界', '极限', '最大', '最小',
      '重复', '冲突', '不符合',
      '凭据错误', '凭证错误', '密码错误', '账号错误',
      '数据无效', '输入无效', '格式错误', '信息错误'
    ];
    
    // 检查是否包含负向关键词
    const hasNegativeKeyword = negativeKeywords.some(keyword => name.includes(keyword));
    
    // 如果包含负向关键词，不是主流程
    if (hasNegativeKeyword) {
      return false;
    }
    
    // 一般正向关键词（这些表示正常流程）
    const positiveKeywords = [
      '标准', '完整', '匹配', '一致',
      '有权限', '已授权', '允许',
      '符合', '满足', '通过'
    ];
    
    // 如果包含正向关键词，是主流程
    const hasPositiveKeyword = positiveKeywords.some(keyword => name.includes(keyword));
    if (hasPositiveKeyword) {
      return true;
    }
    
    // 既没有负向也没有正向关键词，通过其他规则判断
    // 例如："提交订单"、"查询数据"这类简单动作通常是主流程
    // 但"重复提交"、"查询不存在的数据"则不是
    
    // 默认：如果没有明确的负向关键词，且名称较简单，认为是主流程
    return !hasNegativeKeyword;
  }

  /**
   * 🔥 识别主流程测试用例（正常流程、正向场景）
   */
  private isMainFlowTestCase(testCaseName: string): boolean {
    const name = testCaseName.toLowerCase();
    
    // 🔥 最强正向关键词（明确表示主流程，优先级最高）
    const strongPositiveKeywords = [
      '正确', '正常', '有效', '成功', '合法', '均正确', '都正确', '全部正确',
      '均有效', '都有效', '全部有效', '均成功', '都成功',
      '凭据正确', '凭证正确', '密码正确', '账号正确',
      '数据有效', '输入有效', '格式正确', '信息正确'
    ];
    
    // 如果包含强正向关键词，一定是主流程
    const hasStrongPositiveKeyword = strongPositiveKeywords.some(keyword => name.includes(keyword));
    if (hasStrongPositiveKeyword) {
      return true;
    }
    
    // 负向关键词（这些表示异常流程、边界条件）
    const negativeKeywords = [
      '为空', '空值', '不填', '未填',
      '错误', '无效', '失败', '异常', '非法',
      '超长', '超过', '过长', '过短',
      '凭据错误', '凭证错误', '密码错误', '账号错误',
      '数据无效', '输入无效', '格式错误', '信息错误',
      '不存在', '不匹配', '不一致',
      '未授权', '无权限', '禁止',
      '格式错误', '类型错误', '长度不足',
      '缺少', '缺失', '不完整',
      '边界', '极限', '最大', '最小',
      '重复', '冲突', '不符合'
    ];
    
    // 检查是否包含负向关键词
    const hasNegativeKeyword = negativeKeywords.some(keyword => name.includes(keyword));
    
    // 如果包含负向关键词，不是主流程
    if (hasNegativeKeyword) {
      return false;
    }
    
    // 一般正向关键词（这些表示正常流程）
    const positiveKeywords = [
      '标准', '完整', '匹配', '一致',
      '有权限', '已授权', '允许',
      '符合', '满足', '通过'
    ];
    
    // 如果包含正向关键词，是主流程
    const hasPositiveKeyword = positiveKeywords.some(keyword => name.includes(keyword));
    if (hasPositiveKeyword) {
      return true;
    }
    
    // 默认：如果没有明确的负向关键词，且名称较简单，认为是主流程
    return !hasNegativeKeyword;
  }

  /**
   * 🔧 解析AI返回的JSON响应（增强错误处理和修复）
   */
  private parseAIJsonResponse(aiResponse: string, context: string = 'JSON解析'): any {
    let jsonText = aiResponse.trim();
    
    // 1. 提取JSON代码块（修复：避免捕获组导致的转义问题）
    if (jsonText.startsWith('```')) {
      // 移除开头的 ```json 或 ```
      jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, '');
      // 移除结尾的 ```
      jsonText = jsonText.replace(/\n?```\s*$/, '');
    }

    // 2. 清理JSON文本
    jsonText = jsonText.trim();
    
    console.log(`🔧 [${context}] 开始修复控制字符，原始长度: ${jsonText.length}`);
    
    // 🔍 诊断：检查是否有控制字符
    let controlCharCount = 0;
    for (let i = 0; i < jsonText.length; i++) {
      const charCode = jsonText.charCodeAt(i);
      if (charCode < 32 && charCode !== 10 && charCode !== 13 && charCode !== 9) {
        controlCharCount++;
      }
    }
    console.log(`🔍 [${context}] 检测到 ${controlCharCount} 个控制字符（不包括常见的换行、回车、制表符）`);
    
    // 3. 🔥 修复字符串值中的控制字符（使用改进的状态机方法）
    let fixed = '';
    let inString = false;
    let i = 0;
    let fixedCount = 0;
    
    while (i < jsonText.length) {
      const char = jsonText[i];
      const charCode = char.charCodeAt(0);
      
      // 检测字符串开始/结束（未转义的引号）
      if (char === '"') {
        // 检查前面有多少个连续的反斜杠
        let backslashCount = 0;
        let j = fixed.length - 1;
        while (j >= 0 && fixed[j] === '\\') {
          backslashCount++;
          j--;
        }
        // 如果反斜杠数量是偶数（包括0），则这个引号未被转义
        if (backslashCount % 2 === 0) {
          inString = !inString;
        }
        fixed += char;
        i++;
        continue;
      }
      
      // 在字符串内部，处理控制字符
      if (inString) {
        // 如果是反斜杠，检查下一个字符
        if (char === '\\' && i + 1 < jsonText.length) {
          const nextChar = jsonText[i + 1];
          // 如果已经是有效的转义序列，保持原样
          if (nextChar === '"' || nextChar === '\\' || nextChar === '/' || 
              nextChar === 'b' || nextChar === 'f' || nextChar === 'n' || 
              nextChar === 'r' || nextChar === 't' || nextChar === 'u') {
            fixed += char + nextChar;
            i += 2;
            continue;
          }
        }
        
        // 替换控制字符（ASCII 0-31，除了已经转义的）
        if (charCode < 32) {
          if (charCode === 10) { // \n
            fixed += '\\n';
            fixedCount++;
          } else if (charCode === 13) { // \r
            fixed += '\\r';
            fixedCount++;
          } else if (charCode === 9) { // \t
            fixed += '\\t';
            fixedCount++;
          } else if (charCode === 8) { // \b
            fixed += '\\b';
            fixedCount++;
          } else if (charCode === 12) { // \f
            fixed += '\\f';
            fixedCount++;
          } else {
            // 其他控制字符用 \uXXXX 格式
            fixed += '\\u' + charCode.toString(16).padStart(4, '0');
            fixedCount++;
          }
        } else {
          fixed += char;
        }
      } else {
        fixed += char;
      }
      
      i++;
    }
    
    jsonText = fixed;
    console.log(`🔧 [${context}] 控制字符修复完成，修复了 ${fixedCount} 处，新长度: ${jsonText.length}`);
    
    // 修复对象之间的逗号
    jsonText = jsonText.replace(/(\})\s*\n\s*(\{)/g, '$1,\n$2');
    
    // 🔥 移除注释（但要避免误删 URL 中的 //）
    // 只在字符串外部移除注释
    let finalText = '';
    let inStr = false;
    let i2 = 0;
    while (i2 < jsonText.length) {
      const ch = jsonText[i2];
      
      // 检测字符串开始/结束
      if (ch === '"') {
        let bsCount = 0;
        let j = finalText.length - 1;
        while (j >= 0 && finalText[j] === '\\') {
          bsCount++;
          j--;
        }
        if (bsCount % 2 === 0) {
          inStr = !inStr;
        }
      }
      
      // 在字符串外部，检查是否是注释
      if (!inStr) {
        // 检查 /* */ 注释
        if (ch === '/' && i2 + 1 < jsonText.length && jsonText[i2 + 1] === '*') {
          // 跳过整个块注释
          i2 += 2;
          while (i2 < jsonText.length - 1) {
            if (jsonText[i2] === '*' && jsonText[i2 + 1] === '/') {
              i2 += 2;
              break;
            }
            i2++;
          }
          continue;
        }
        // 检查 // 注释（但要确保不是 URL 中的 //）
        if (ch === '/' && i2 + 1 < jsonText.length && jsonText[i2 + 1] === '/') {
          // 检查前面是否是 http: 或 https:
          const before = finalText.slice(-6);
          if (!before.endsWith('http:') && !before.endsWith('https:')) {
            // 跳过整行
            while (i2 < jsonText.length && jsonText[i2] !== '\n') {
              i2++;
            }
            continue;
          }
        }
      }
      
      finalText += ch;
      i2++;
    }
    jsonText = finalText;
    
    // 4. 记录解析信息
    console.log(`📋 [${context}] 提取的JSON文本长度: ${jsonText.length} 字符`);
    
    // 5. 尝试解析
    try {
      return JSON.parse(jsonText);
    } catch (parseError: any) {
      console.error(`❌ [${context}] JSON解析失败: ${parseError.message}`);
      
      // 显示错误位置
      const errorPos = parseInt(parseError.message.match(/position (\d+)/)?.[1] || '0');
      if (errorPos > 0 && errorPos < jsonText.length) {
        const start = Math.max(0, errorPos - 100);
        const end = Math.min(jsonText.length, errorPos + 100);
        console.error(`📍 错误位置附近的文本:`);
        console.error(`   ${jsonText.substring(start, end)}`);
        console.error(`   ${' '.repeat(Math.min(100, errorPos - start))}^`);
      }
      
      // 🔥 尝试更激进的修复：逐行处理字符串值中的换行符
      console.log(`🔧 [${context}] 尝试更激进的JSON修复...`);
      try {
        // 方法1：使用更精确的正则表达式修复字符串中的换行
        let fixedJson = jsonText;
        
        // 找到所有字符串值并修复其中的控制字符
        fixedJson = fixedJson.replace(/"((?:[^"\\]|\\.)*)"/g, (match, content) => {
          // 替换未转义的控制字符
          const fixed = content
            .replace(/(?<!\\)\n/g, '\\n')
            .replace(/(?<!\\)\r/g, '\\r')
            .replace(/(?<!\\)\t/g, '\\t');
          return `"${fixed}"`;
        });
        
        return JSON.parse(fixedJson);
      } catch (retryError1: any) {
        console.error(`❌ [${context}] 激进修复1失败: ${retryError1.message}`);
      }
      
      // 尝试更激进的修复（针对testPoints数组）
      if (jsonText.includes('testPoints')) {
        console.log(`🔧 [${context}] 尝试修复testPoints数组格式...`);
        const testPointsMatch = jsonText.match(/"testPoints"\s*:\s*\[([\s\S]*?)\]/);
        if (testPointsMatch) {
          let testPointsContent = testPointsMatch[1];
          // 确保数组元素之间有逗号
          testPointsContent = testPointsContent.replace(/(\})\s*(\{)/g, '$1,\n$2');
          // 确保最后一个元素后没有逗号
          testPointsContent = testPointsContent.replace(/,\s*(\]\s*[,}])/g, '$1');
          jsonText = jsonText.replace(/"testPoints"\s*:\s*\[[\s\S]*?\]/, `"testPoints": [${testPointsContent}]`);
          
          // 再次尝试解析
          try {
            return JSON.parse(jsonText);
          } catch (retryError: any) {
            console.error(`❌ [${context}] JSON修复后仍然失败: ${retryError.message}`);
          }
        }
      }
      
      throw new Error(`${context}失败: ${parseError.message}。原始响应长度: ${aiResponse.length}字符`);
    }
  }

  /**
   * 🆕 构建增强上下文（将用户确认信息注入到AI提示词）
   */
  private buildEnhancedContext(enhancedData: EnhancedAxureData): string {
    let context = '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    context += '📋 【用户确认信息】以下是用户明确确认的关键信息（优先级最高）：\n';
    context += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

    const { enrichedInfo } = enhancedData;
    let hasAnyInfo = false;

    // 🔥 0. 确认的页面类型（最重要！）
    if (enrichedInfo.pageType) {
      hasAnyInfo = true;
      context += '## 🔥 确认的页面类型（最高优先级！）\n';
      context += '⚠️ 这是用户明确确认的页面类型，决定了后续如何解析所有字段！\n\n';
      context += `**页面类型**: ${enrichedInfo.pageType}\n\n`;

      // 根据页面类型给出明确指导
      if (enrichedInfo.pageType === 'list') {
        context += '📝 **解析指导**:\n';
        context += '- 页面顶部的 input/select 元素应归类为：**查询条件**\n';
        context += '- 页面的 table/div 元素应归类为：**列表展示字段**\n';
        context += '- 🚫 不要生成"表单字段"章节！\n';
        context += '- ✅ 应该生成：查询条件、列表展示字段、操作按钮\n';
      } else if (enrichedInfo.pageType === 'form') {
        context += '📝 **解析指导**:\n';
        context += '- 页面的 input/select 元素应归类为：**表单字段**\n';
        context += '- 🚫 不要生成"查询条件"章节！\n';
        context += '- ✅ 应该生成：表单字段、操作按钮\n';
      } else if (enrichedInfo.pageType === 'detail') {
        context += '📝 **解析指导**:\n';
        context += '- 页面的元素应归类为：**详情展示字段**\n';
        context += '- 🚫 不要生成"查询条件"或"表单字段"章节！\n';
        context += '- ✅ 应该生成：详情展示字段、操作按钮\n';
      }
      context += '\n';
    }

    // 1. 确认的枚举值
    if (Object.keys(enrichedInfo.confirmedEnums).length > 0) {
      hasAnyInfo = true;
      context += '## 📌 确认的枚举值\n';
      context += '（生成需求文档时必须使用这些值，不要修改或添加）\n\n';
      for (const [field, values] of Object.entries(enrichedInfo.confirmedEnums)) {
        context += `- **${field}**: ${values.join('、')}\n`;
      }
      context += '\n';
    }

    // 2. 确认的业务规则
    if (enrichedInfo.confirmedRules.length > 0) {
      hasAnyInfo = true;
      context += '## 📌 确认的业务规则\n';
      context += '（这些是用户明确的业务规则，必须体现在需求文档中）\n\n';
      enrichedInfo.confirmedRules.forEach((rule, index) => {
        context += `${index + 1}. **${rule.field}**: ${rule.rule}\n`;
      });
      context += '\n';
    }

    // 3. 确认的字段含义
    if (Object.keys(enrichedInfo.confirmedMeanings).length > 0) {
      hasAnyInfo = true;
      context += '## 📌 确认的字段含义\n';
      context += '（使用这些明确的字段含义，不要猜测）\n\n';
      for (const [field, meaning] of Object.entries(enrichedInfo.confirmedMeanings)) {
        context += `- **${field}**: ${meaning}\n`;
      }
      context += '\n';
    }

    // 4. 确认的校验规则
    if (enrichedInfo.confirmedValidations.length > 0) {
      hasAnyInfo = true;
      context += '## 📌 确认的校验规则\n\n';
      enrichedInfo.confirmedValidations.forEach((val, index) => {
        context += `${index + 1}. **${val.field}**: ${val.validation}\n`;
      });
      context += '\n';
    }

    if (hasAnyInfo) {
      context += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
      context += '💡 请在生成需求文档时，优先使用以上用户确认的信息\n';
      context += '   标注来源时使用"(来源: 用户确认)"\n';
      context += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
      return context;
    }

    return '';
  }

  /**
   * 构建模拟需求文档（临时实现）
   * 注意：补充业务规则不应出现在需求文档中，它只是辅助AI理解需求的提示
   */
  private buildMockRequirementDoc(axureData: AxureParseResult, projectInfo: ProjectInfo): string {
    return `# ${projectInfo.projectName} 需求文档

## 一、项目概述

- **项目名称**: ${projectInfo.projectName}
- **系统类型**: ${projectInfo.systemType}
- **业务领域**: ${projectInfo.businessDomain}

## 二、原型分析

通过分析Axure原型文件，识别出以下关键信息：

- **页面数量**: ${axureData.pageCount}个
- **交互元素**: ${axureData.elementCount}个
- **交互行为**: ${axureData.interactionCount}个

## 三、功能模块划分

${axureData.pages.map((page, i) => `
### ${i + 1}. ${page.name}

**主要元素**:
${page.elements.slice(0, 5).map(e => `- ${e.type}: ${e.name || e.text || e.placeholder || '未命名'}`).join('\n')}

**交互行为**:
${page.interactions.slice(0, 3).map(int => `- ${int.type}: ${int.trigger}`).join('\n')}
`).join('\n')}

## 四、约束条件

${projectInfo.constraints.map((constraint, i) => `${i + 1}. ${constraint}`).join('\n')}

---
*本文档由AI自动生成，请人工审核确认*
`;
  }

  /**
   * 🆕 提取页面内容区域的红色字段（用于修改页面模式）
   * 排除表格区域，只提取页面主体内容中的红色标记
   */
  private extractRedFields(htmlContent: string): string[] {
    console.log('\n🔍 开始提取页面红色字段...');

    try {
      // 1. 排除表格区域（表格可能包含业务描述）
      let nonTableContent = htmlContent;
      const tableMatch = htmlContent.match(/<div[^>]*class=["'][^"']*table[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi);
      if (tableMatch) {
        tableMatch.forEach(table => {
          nonTableContent = nonTableContent.replace(table, '');
        });
        console.log('   ✓ 已排除表格区域');
      }

      // 2. 提取红色文字（支持多种红色表示法）
      const redPatterns = [
        /<span[^>]*style=["'][^"']*color:\s*#D9001B[^"']*["'][^>]*>([^<]+)<\/span>/gi,
        /<span[^>]*style=["'][^"']*color:\s*red[^"']*["'][^>]*>([^<]+)<\/span>/gi,
        /<span[^>]*style=["'][^"']*color:\s*rgb\(255,\s*0,\s*0\)[^"']*["'][^>]*>([^<]+)<\/span>/gi,
      ];

      const redFields: string[] = [];

      for (const pattern of redPatterns) {
        let match;
        while ((match = pattern.exec(nonTableContent)) !== null) {
          const text = match[1].trim();

          // 过滤条件：
          // 1. 长度 > 1
          // 2. 不是纯符号
          // 3. 不是纯数字（排除数据值）
          // 4. 包含中文或英文字母
          if (
            text.length > 1 &&
            !/^[:\s、，。]+$/.test(text) &&
            !/^\d+$/.test(text) &&
            /[\u4e00-\u9fa5a-zA-Z]/.test(text) &&
            !redFields.includes(text)
          ) {
            redFields.push(text);
          }
        }
      }

      console.log(`   ✓ 提取到 ${redFields.length} 个红色字段:`);
      redFields.forEach((field, i) => {
        console.log(`     ${i + 1}. ${field}`);
      });

      return redFields;
    } catch (error) {
      console.error('   ❌ 提取红色字段失败:', error);
      return [];
    }
  }

  /**
   * 🆕 提取业务描述区域（用于修改页面模式）
   * 使用多策略尝试识别业务描述的位置
   */
  private extractBusinessDescription(htmlContent: string): string {
    console.log('\n📋 开始提取业务描述区域...');

    try {
      // 策略1：查找表格中包含编号列表的单元格（1、2、3...）
      const tableMatch = htmlContent.match(/<div[^>]*class=["'][^"']*table[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);

      if (tableMatch) {
        const tableContent = tableMatch[1];

        // 查找包含"1、"、"2、"等编号的文本块
        const cellMatches = tableContent.match(/<div[^>]*_text[^>]*>([\s\S]*?)<\/div>/gi);

        if (cellMatches) {
          for (const cell of cellMatches) {
            // 提取纯文本
            const text = cell
              .replace(/<[^>]+>/g, '')
              .replace(/&nbsp;/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();

            // 判断是否包含编号列表（1、或①）
            if (/[1-9]、|①|②|③/.test(text) && text.length > 50) {
              console.log(`   ✓ 策略1成功：找到表格中的业务描述（${text.length}字符）`);
              return text;
            }
          }
        }
      }

      // 策略2：查找特定 ID 的元素（基于样本规律）
      const idPatterns = ['u6402', 'u6404', 'u6146', 'u6147'];
      for (const id of idPatterns) {
        const match = htmlContent.match(new RegExp(`<div[^>]*id=["']${id}_text["'][^>]*>([\\s\\S]*?)<\\/div>`, 'i'));
        if (match) {
          const text = match[1]
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          if (text.length > 50) {
            console.log(`   ✓ 策略2成功：找到ID为${id}的业务描述（${text.length}字符）`);
            return text;
          }
        }
      }

      // 策略3：查找包含关键词的区域
      const keywords = ['备注', '说明', '业务描述', '需求', '功能说明'];
      for (const keyword of keywords) {
        const regex = new RegExp(`<div[^>]*>([\\s\\S]*?${keyword}[\\s\\S]*?)<\\/div>`, 'gi');
        const matches = htmlContent.match(regex);

        if (matches && matches.length > 0) {
          const text = matches[0]
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          if (text.length > 50) {
            console.log(`   ✓ 策略3成功：找到包含"${keyword}"的业务描述（${text.length}字符）`);
            return text;
          }
        }
      }

      // 策略4：降级到全文（让 AI 自行识别）
      console.log('   ⚠️ 无法定位业务描述区域，返回空字符串');
      return '';

    } catch (error) {
      console.error('   ❌ 提取业务描述失败:', error);
      return '';
    }
  }
}

// 延迟初始化：使用 new FunctionalTestCaseAIService() 创建实例
