// 模型定义接口
export interface ModelDefinition {
  id: string;
  name: string;
  provider: string;
  openRouterModel: string;
  customBaseUrl?: string;        // 自定义 API 端点（用于本地或自托管服务）
  requiresCustomAuth?: boolean;  // 是否需要自定义认证格式（非 OpenRouter 标准）
  requiresManualInput?: boolean; // 是否只支持手动输入模式（不显示选择模式）
  apiFormat?: 'openai' | 'ollama'; // API 格式：openai 使用 /chat/completions，ollama 使用 /api/generate
  defaultConfig: {
    temperature: number;
    maxTokens: number;
    topP?: number;
  };
  capabilities: string[];
  description: string;
  costLevel: 'low' | 'medium' | 'high';
}

// 模型注册表类
export class ModelRegistry {
  private static instance: ModelRegistry;
  private models: ModelDefinition[];

  private constructor() {
    this.models = [
      // // ============ DeepSeek 系列 ============
      // {
      //   id: 'deepseek-series',
      //   name: 'DeepSeek 系列',
      //   provider: 'DeepSeek',
      //   openRouterModel: 'deepseek-r1',
      //   customBaseUrl: 'https://api.deepseek.com/v1',
      //   requiresCustomAuth: true,
      //   defaultConfig: {
      //     temperature: 0.3,
      //     maxTokens: 4096
      //   },
      //   capabilities: ['text-generation', 'reasoning', 'code-analysis', 'chinese-friendly', 'free-tier', 'model-list'],
      //   description: 'DeepSeek系列模型，可自动获取所有可用模型版本，包括deepseek-chat、deepseek-coder等',
      //   costLevel: 'medium'
      // },
      // // ============ 阿里云通义千问系列 ============
      // {
      //   id: 'qwen-series',
      //   name: '通义千问 系列',
      //   provider: '阿里云',
      //   openRouterModel: 'qwen3-max',
      //   customBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      //   requiresCustomAuth: true,
      //   defaultConfig: {
      //     temperature: 0.3,
      //     maxTokens: 2000
      //   },
      //   capabilities: ['text-generation', 'chinese-friendly', 'free-tier', 'fast-response', 'model-list'],
      //   description: '阿里云通义千问系列模型，可自动获取所有可用模型版本，包括qwen-turbo、qwen-plus、qwen-max等',
      //   costLevel: 'medium'
      // },
      // // ============ 月之暗面 Kimi 系列 ============
      // {
      //   id: 'kimi-series',
      //   name: 'Kimi 系列',
      //   provider: '月之暗面',
      //   openRouterModel: 'kimi-k2-turbo-preview',
      //   customBaseUrl: 'https://api.moonshot.cn/v1',
      //   requiresCustomAuth: true,
      //   defaultConfig: {
      //     temperature: 0.3,
      //     maxTokens: 4000
      //   },
      //   capabilities: ['text-generation', 'long-context', 'chinese-friendly', 'free-tier', 'model-list'],
      //   description: 'Kimi系列模型，可自动获取所有可用模型版本，包括moonshot-v1-8k、moonshot-v1-32k、moonshot-v1-128k、Kimi K2大模型，最新一代混合专家模型，支持128K超长上下文，具备强大的代理智能和自主问题解决能力',
      //   costLevel: 'medium'
      // },
      // // ============ 智谱AI GLM 系列 ============
      // {
      //   id: 'glm-series',
      //   name: '智谱GLM 系列',
      //   provider: '智谱AI',
      //   openRouterModel: 'glm-4',
      //   customBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      //   requiresCustomAuth: true,
      //   defaultConfig: {
      //     temperature: 0.3,
      //     maxTokens: 2000
      //   },
      //   capabilities: ['text-generation', 'multimodal', 'reasoning', 'code-analysis', 'chinese-friendly', 'free-tier', 'model-list'],
      //   description: '智谱AI GLM系列模型，可自动获取所有可用模型版本，包括glm-4、glm-4-flash、glm-4v、glm-4.6v等',
      //   costLevel: 'medium'
      // },
      // {
      //   id: 'ernie-bot-turbo',
      //   name: '文心一言',
      //   provider: '百度',
      //   openRouterModel: 'ernie-bot-turbo',
      //   customBaseUrl: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/eb-instant',
      //   requiresCustomAuth: true,
      //   defaultConfig: {
      //     temperature: 0.3,
      //     maxTokens: 2000
      //   },
      //   capabilities: ['text-generation', 'fast-response', 'chinese-friendly', 'free-tier'],
      //   description: '百度文心一言Turbo模型，快速响应，免费额度充足',
      //   costLevel: 'low'
      // },
      // {
      //   id: 'gpt-4o',
      //   name: 'GPT-4o',
      //   provider: 'OpenAI',
      //   openRouterModel: 'openai/gpt-4o',
      //   defaultConfig: {
      //     temperature: 0.3,
      //     maxTokens: 1500
      //   },
      //   capabilities: ['text-generation', 'multimodal', 'reasoning', 'code-analysis'],
      //   description: 'OpenAI GPT-4o模型，支持文本和图像理解',
      //   costLevel: 'high'
      // },
      // {
      //   id: 'gemini-3-pro',
      //   name: 'Gemini 3 Pro',
      //   provider: 'Google',
      //   openRouterModel: 'google/gemini-3-pro',
      //   customBaseUrl: 'https://openrouter.ai/api/v1',
      //   defaultConfig: {
      //     temperature: 0.3,
      //     maxTokens: 4096
      //   },
      //   capabilities: ['text-generation', 'multimodal', 'reasoning', 'code-analysis', 'image-understanding', 'audio-understanding', 'long-context'],
      //   description: 'Google Gemini 3 Pro模型，支持多模态和超长上下文',
      //   costLevel: 'high'
      // },
      // {
      //   id: 'claude-sonnet-4.5',
      //   name: 'Claude Sonnet 4.5',
      //   provider: 'OpenRouter',
      //   openRouterModel: 'anthropic/claude-sonnet-4.5',
      //   defaultConfig: {
      //     temperature: 0.3,
      //     maxTokens: 2000
      //   },
      //   capabilities: ['text-generation', 'multimodal', 'reasoning', 'code-analysis', 'long-context'],
      //   description: 'Anthropic Claude Sonnet 4.5模型，平衡性能与成本，支持长上下文',
      //   costLevel: 'medium'
      // },
      // // ============ OpenRouter 系列 (包含OpenAI、Anthropic等) ============
      // {
      //   id: 'openrouter-series',
      //   name: 'OpenRouter 全部模型',
      //   provider: 'OpenRouter',
      //   openRouterModel: 'openai/gpt-4o',
      //   customBaseUrl: 'https://openrouter.ai/api/v1',
      //   requiresCustomAuth: true,
      //   defaultConfig: {
      //     temperature: 0.3,
      //     maxTokens: 2000
      //   },
      //   capabilities: ['text-generation', 'multimodal', 'reasoning', 'code-analysis', 'model-list'],
      //   description: 'OpenRouter平台，可自动获取所有可用模型，包括OpenAI、Anthropic、Google、Meta等多家厂商模型',
      //   costLevel: 'high'
      // },
      // // ============ Zenmux 系列 (Google Gemini 等) ============
      // {
      //   id: 'zenmux-series',
      //   name: 'Zenmux 全部模型',
      //   provider: 'Zenmux',
      //   openRouterModel: 'google/gemini-3-pro-preview',
      //   customBaseUrl: 'https://zenmux.ai/api/v1',
      //   requiresCustomAuth: true,
      //   defaultConfig: {
      //     temperature: 0.3,
      //     maxTokens: 4096
      //   },
      //   capabilities: ['text-generation', 'multimodal', 'reasoning', 'code-analysis', 'model-list'],
      //   description: 'Zenmux平台，可自动获取所有可用模型，包括Google Gemini系列、Claude等多家厂商模型',
      //   costLevel: 'medium'
      // },
      // ============ NewApi 系列 ============
      {
        id: 'newapi-series',
        name: '在线大模型',
        provider: 'NewApi',
        openRouterModel: 'claude-sonnet-4-5-20250929',
        customBaseUrl: 'https://claude.ticketpro.cc/v1',
        requiresCustomAuth: true,
        defaultConfig: {
          temperature: 0.3,
          maxTokens: 4096
        },
        capabilities: ['text-generation', 'multimodal', 'reasoning', 'code-analysis', 'model-list'],
        description: 'NewApi平台，可自动获取所有可用模型，兼容OpenAI格式，支持多家厂商模型',
        costLevel: 'medium'
      },
      // ============ 本地系列（Ollama） ============
      {
        id: 'local-series-ollama',
        name: '本地大模型',
        provider: 'Ollama',
        openRouterModel: 'deepseek-r1:8b',
        customBaseUrl: 'http://localhost:11434', // Ollama 默认端口
        requiresCustomAuth: false,
        requiresManualInput: true, // 只支持手动输入模式
        apiFormat: 'ollama', // 使用 Ollama 原生 API 格式 (/api/generate)
        defaultConfig: {
          temperature: 0.3,
          maxTokens: 4096
        },
        capabilities: ['text-generation', 'multimodal', 'reasoning', 'code-analysis', 'image-understanding', 'audio-understanding'],
        description: '本地部署的大模型（Ollama），使用 /api/generate 端点，可指定具体的模型名称，免费畅通使用',
        costLevel: 'low'
      },
      // ============ 本地系列（OpenAI兼容格式） ============
      {
        id: 'local-series-openai',
        name: '本地大模型',
        provider: 'OpenAI',
        openRouterModel: 'qwen3-vl-30b',
        customBaseUrl: 'http://localhost:3000/v1',
        requiresCustomAuth: false,
        requiresManualInput: true, // 只支持手动输入模式
        apiFormat: 'openai', // 使用 OpenAI 兼容 API 格式 (/chat/completions)
        defaultConfig: {
          temperature: 0.3,
          maxTokens: 4096
        },
        capabilities: ['text-generation', 'multimodal', 'reasoning', 'code-analysis', 'image-understanding', 'audio-understanding'],
        description: '本地部署的大模型（OpenAI兼容格式），使用 /chat/completions 端点，可指定具体的模型名称，免费畅通使用',
        costLevel: 'low'
      },
    ];
  }

  // 单例模式
  public static getInstance(): ModelRegistry {
    if (!ModelRegistry.instance) {
      ModelRegistry.instance = new ModelRegistry();
    }
    return ModelRegistry.instance;
  }

  // 获取所有可用模型
  public getAvailableModels(): ModelDefinition[] {
    return [...this.models];
  }

  // 根据ID获取模型
  public getModelById(id: string): ModelDefinition | null {
    return this.models.find(model => model.id === id) || null;
  }

  // 获取默认模型（GPT-4o）
  public getDefaultModel(): ModelDefinition {
    return this.models[0]; // GPT-4o作为默认模型
  }

  // 验证模型ID是否有效
  public isValidModelId(id: string): boolean {
    return this.models.some(model => model.id === id);
  }

  // 获取模型的OpenRouter标识符
  public getOpenRouterModel(id: string): string | null {
    const model = this.getModelById(id);
    return model ? model.openRouterModel : null;
  }

  // 获取模型的默认配置
  public getDefaultConfig(id: string): ModelDefinition['defaultConfig'] | null {
    const model = this.getModelById(id);
    return model ? { ...model.defaultConfig } : null;
  }
}

// 导出单例实例
export const modelRegistry = ModelRegistry.getInstance();