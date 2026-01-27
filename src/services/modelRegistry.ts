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
      // ============ DeepSeek 系列 ============
      {
        id: 'deepseek-series',
        name: 'DeepSeek 系列 (自动获取)',
        provider: 'DeepSeek',
        openRouterModel: 'deepseek-r1',
        customBaseUrl: 'https://api.deepseek.com/v1',
        requiresCustomAuth: true,
        defaultConfig: {
          temperature: 0.3,
          maxTokens: 4096
        },
        capabilities: ['text-generation', 'reasoning', 'code-analysis', 'chinese-friendly', 'free-tier', 'model-list'],
        description: 'DeepSeek系列模型，可自动获取所有可用模型版本，包括deepseek-chat、deepseek-coder等',
        costLevel: 'medium'
      },
      // {
      //   id: 'deepseek-v3',
      //   name: 'DeepSeek-V3',
      //   provider: 'DeepSeek',
      //   openRouterModel: 'deepseek-v3',
      //   customBaseUrl: 'https://api.deepseek.com/v1',
      //   requiresCustomAuth: false,
      //   defaultConfig: {
      //     temperature: 0.3,
      //     maxTokens: 4096
      //   },
      //   capabilities: ['text-generation', 'multimodal', 'reasoning', 'code-analysis', 'chinese-friendly', 'free-tier', 'long-context'],
      //   description: 'DeepSeek-V3官方大模型，最新版本，支持多模态和超长上下文，性能更强',
      //   costLevel: 'high'
      // },
      // {
      //   id: 'deepseek-r1',
      //   name: 'DeepSeek-R1',
      //   provider: 'DeepSeek',
      //   openRouterModel: 'deepseek-r1',
      //   customBaseUrl: 'https://api.deepseek.com/v1',
      //   requiresCustomAuth: false,
      //   defaultConfig: {
      //     temperature: 0.3,
      //     maxTokens: 4000
      //   },
      //   capabilities: ['text-generation', 'reasoning', 'code-analysis', 'chinese-friendly', 'free-tier', 'advanced-reasoning'],
      //   description: 'DeepSeek-R1推理模型，强大的推理和问题解决能力，支持复杂逻辑推理',
      //   costLevel: 'medium'
      // },
      // {
      //   id: 'deepseek-chat-direct',
      //   name: 'DeepSeek Chat (直接API)',
      //   provider: 'DeepSeek',
      //   openRouterModel: 'deepseek-chat',
      //   customBaseUrl: 'https://api.deepseek.com/v1',
      //   requiresCustomAuth: false,
      //   defaultConfig: {
      //     temperature: 0.2,
      //     maxTokens: 2000
      //   },
      //   capabilities: ['text-generation', 'reasoning', 'code-analysis', 'chinese-friendly', 'free-tier'],
      //   description: 'DeepSeek直接API，免费额度充足，中文友好，国内访问快速',
      //   costLevel: 'low'
      // },
      // ============ 阿里云通义千问系列 ============
      {
        id: 'qwen-series',
        name: '通义千问 系列 (自动获取)',
        provider: '阿里云',
        openRouterModel: 'qwen3-max',
        customBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        requiresCustomAuth: true,
        defaultConfig: {
          temperature: 0.3,
          maxTokens: 2000
        },
        capabilities: ['text-generation', 'chinese-friendly', 'free-tier', 'fast-response', 'model-list'],
        description: '阿里云通义千问系列模型，可自动获取所有可用模型版本，包括qwen-turbo、qwen-plus、qwen-max等',
        costLevel: 'medium'
      },
      // {
      //   id: 'qwen-turbo',
      //   name: '通义千问 Turbo',
      //   provider: '阿里云',
      //   openRouterModel: 'qwen-turbo',
      //   customBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      //   requiresCustomAuth: false,
      //   defaultConfig: {
      //     temperature: 0.3,
      //     maxTokens: 2000
      //   },
      //   capabilities: ['text-generation', 'chinese-friendly', 'free-tier', 'fast-response'],
      //   description: '阿里云通义千问Turbo模型，免费额度充足，国内访问极速',
      //   costLevel: 'low'
      // },
      // {
      //   id: 'qwen-plus',
      //   name: '通义千问 Plus',
      //   provider: '阿里云',
      //   openRouterModel: 'qwen-plus',
      //   customBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      //   requiresCustomAuth: false,
      //   defaultConfig: {
      //     temperature: 0.3,
      //     maxTokens: 2000
      //   },
      //   capabilities: ['text-generation', 'reasoning', 'chinese-friendly', 'free-tier'],
      //   description: '阿里云通义千问Plus模型，性能更强，免费额度充足',
      //   costLevel: 'medium'
      // },
      // {
      //   id: 'qwen-max',
      //   name: '通义千问 Max',
      //   provider: '阿里云',
      //   openRouterModel: 'qwen-max',
      //   customBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      //   requiresCustomAuth: false,
      //   defaultConfig: {
      //     temperature: 0.3,
      //     maxTokens: 2000
      //   },
      //   capabilities: ['text-generation', 'multimodal', 'reasoning', 'code-analysis', 'chinese-friendly'],
      //   description: '阿里云通义千问Max模型，最强性能，支持多模态',
      //   costLevel: 'high'
      // },
      // {
      //   id: 'qwen3-max',
      //   name: '通义千问3 Max',
      //   provider: '阿里云',
      //   openRouterModel: 'qwen3-max',
      //   customBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      //   requiresCustomAuth: false,
      //   defaultConfig: {
      //     temperature: 0.3,
      //     maxTokens: 2000
      //   },
      //   capabilities: ['text-generation', 'multimodal', 'reasoning', 'code-analysis', 'chinese-friendly'],
      //   description: '阿里云通义千问3 Max模型，最强性能，支持多模态',
      //   costLevel: 'high'
      // },
      // ============ 月之暗面 Kimi 系列 ============
      {
        id: 'kimi-series',
        name: 'Kimi 系列 (自动获取)',
        provider: '月之暗面',
        openRouterModel: 'kimi-k2-turbo-preview',
        customBaseUrl: 'https://api.moonshot.cn/v1',
        requiresCustomAuth: true,
        defaultConfig: {
          temperature: 0.3,
          maxTokens: 4000
        },
        capabilities: ['text-generation', 'long-context', 'chinese-friendly', 'free-tier', 'model-list'],
        description: 'Kimi系列模型，可自动获取所有可用模型版本，包括moonshot-v1-8k、moonshot-v1-32k、moonshot-v1-128k、Kimi K2大模型，最新一代混合专家模型，支持128K超长上下文，具备强大的代理智能和自主问题解决能力',
        costLevel: 'medium'
      },
      // {
      //   id: 'kimi-chat-8k',
      //   name: 'Kimi Chat 8K',
      //   provider: '月之暗面',
      //   openRouterModel: 'moonshot-v1-8k',
      //   customBaseUrl: 'https://api.moonshot.cn/v1',
      //   requiresCustomAuth: false,
      //   defaultConfig: {
      //     temperature: 0.3,
      //     maxTokens: 2000
      //   },
      //   capabilities: ['text-generation', 'long-context', 'chinese-friendly', 'free-tier'],
      //   description: '月之暗面Kimi模型，支持超长上下文，中文友好，免费额度充足',
      //   costLevel: 'low'
      // },
      // {
      //   id: 'kimi-chat-32k',
      //   name: 'Kimi Chat 32K',
      //   provider: '月之暗面',
      //   openRouterModel: 'moonshot-v1-32k',
      //   customBaseUrl: 'https://api.moonshot.cn/v1',
      //   requiresCustomAuth: false,
      //   defaultConfig: {
      //     temperature: 0.3,
      //     maxTokens: 4000
      //   },
      //   capabilities: ['text-generation', 'long-context', 'chinese-friendly', 'free-tier'],
      //   description: '月之暗面Kimi 32K模型，支持超长上下文（32K tokens）',
      //   costLevel: 'medium'
      // },
      // {
      //   id: 'kimi-k2',
      //   name: 'Kimi K2',
      //   provider: '月之暗面',
      //   openRouterModel: 'kimi-k2-turbo-preview',
      //   customBaseUrl: 'https://api.moonshot.cn/v1',
      //   requiresCustomAuth: false,
      //   defaultConfig: {
      //     temperature: 0.3,
      //     maxTokens: 4000
      //   },
      //   capabilities: ['text-generation', 'long-context', 'multimodal', 'reasoning', 'code-analysis', 'agent-capability', 'chinese-friendly', 'free-tier'],
      //   description: '月之暗面Kimi K2大模型，最新一代混合专家模型，支持128K超长上下文，具备强大的代理智能和自主问题解决能力',
      //   costLevel: 'high'
      // },
      // ============ 智谱AI GLM 系列 ============
      {
        id: 'glm-series',
        name: '智谱GLM 系列 (自动获取)',
        provider: '智谱AI',
        openRouterModel: 'glm-4',
        customBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        requiresCustomAuth: true,
        defaultConfig: {
          temperature: 0.3,
          maxTokens: 2000
        },
        capabilities: ['text-generation', 'multimodal', 'reasoning', 'code-analysis', 'chinese-friendly', 'free-tier', 'model-list'],
        description: '智谱AI GLM系列模型，可自动获取所有可用模型版本，包括glm-4、glm-4-flash、glm-4v、glm-4.6v等',
        costLevel: 'medium'
      },
      // {
      //   id: 'glm-4',
      //   name: '智谱GLM-4',
      //   provider: '智谱AI',
      //   openRouterModel: 'glm-4',
      //   customBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      //   requiresCustomAuth: false,
      //   defaultConfig: {
      //     temperature: 0.3,
      //     maxTokens: 2000
      //   },
      //   capabilities: ['text-generation', 'multimodal', 'reasoning', 'code-analysis', 'chinese-friendly', 'free-tier'],
      //   description: '智谱AI GLM-4模型，高性能，中文友好，免费额度充足',
      //   costLevel: 'medium'
      // },
      // {
      //   id: 'glm-4-flash',
      //   name: '智谱GLM-4 Flash',
      //   provider: '智谱AI',
      //   openRouterModel: 'glm-4-flash',
      //   customBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      //   requiresCustomAuth: false,
      //   defaultConfig: {
      //     temperature: 0.3,
      //     maxTokens: 2000
      //   },
      //   capabilities: ['text-generation', 'fast-response', 'chinese-friendly', 'free-tier'],
      //   description: '智谱AI GLM-4 Flash模型，快速响应，免费额度充足',
      //   costLevel: 'low'
      // },
      // {
      //   id: 'ernie-bot',
      //   name: '文心一言 (ERNIE-Bot)',
      //   provider: '百度',
      //   openRouterModel: 'ernie-bot',
      //   customBaseUrl: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat',
      //   requiresCustomAuth: true,
      //   defaultConfig: {
      //     temperature: 0.3,
      //     maxTokens: 2000
      //   },
      //   capabilities: ['text-generation', 'multimodal', 'reasoning', 'code-analysis', 'chinese-friendly', 'free-tier'],
      //   description: '百度文心一言ERNIE-Bot模型，支持多模态，中文友好，免费额度充足',
      //   costLevel: 'medium'
      // },
      {
        id: 'ernie-bot-turbo',
        name: '文心一言 Turbo',
        provider: '百度',
        openRouterModel: 'ernie-bot-turbo',
        customBaseUrl: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/eb-instant',
        requiresCustomAuth: true,
        defaultConfig: {
          temperature: 0.3,
          maxTokens: 2000
        },
        capabilities: ['text-generation', 'fast-response', 'chinese-friendly', 'free-tier'],
        description: '百度文心一言Turbo模型，快速响应，免费额度充足',
        costLevel: 'low'
      },
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        provider: 'OpenAI',
        openRouterModel: 'openai/gpt-4o',
        defaultConfig: {
          temperature: 0.3,
          maxTokens: 1500
        },
        capabilities: ['text-generation', 'multimodal', 'reasoning', 'code-analysis'],
        description: 'OpenAI GPT-4o模型，支持文本和图像理解',
        costLevel: 'high'
      },
      {
        id: 'gemini-3-pro',
        name: 'Gemini 3 Pro',
        provider: 'Google',
        openRouterModel: 'google/gemini-3-pro',
        customBaseUrl: 'https://openrouter.ai/api/v1',
        defaultConfig: {
          temperature: 0.3,
          maxTokens: 4096
        },
        capabilities: ['text-generation', 'multimodal', 'reasoning', 'code-analysis', 'image-understanding', 'audio-understanding', 'long-context'],
        description: 'Google Gemini 3 Pro模型，支持多模态和超长上下文',
        costLevel: 'high'
      },
      {
        id: 'claude-sonnet-4.5',
        name: 'Claude Sonnet 4.5',
        provider: 'Anthropic',
        openRouterModel: 'anthropic/claude-sonnet-4.5',
        defaultConfig: {
          temperature: 0.3,
          maxTokens: 2000
        },
        capabilities: ['text-generation', 'multimodal', 'reasoning', 'code-analysis', 'long-context'],
        description: 'Anthropic Claude Sonnet 4.5模型，平衡性能与成本，支持长上下文',
        costLevel: 'medium'
      },
      // ============ OpenRouter 系列 (包含OpenAI、Anthropic等) ============
      {
        id: 'openrouter-series',
        name: 'OpenRouter 全部模型 (自动获取)',
        provider: 'OpenRouter',
        openRouterModel: 'openai/gpt-4o',
        customBaseUrl: 'https://openrouter.ai/api/v1',
        requiresCustomAuth: false,
        defaultConfig: {
          temperature: 0.3,
          maxTokens: 2000
        },
        capabilities: ['text-generation', 'multimodal', 'reasoning', 'code-analysis', 'model-list'],
        description: 'OpenRouter平台，可自动获取所有可用模型，包括OpenAI、Anthropic、Google、Meta等多家厂商模型',
        costLevel: 'high'
      },
      // ============ Zenmux 系列 (Google Gemini 等) ============
      {
        id: 'zenmux-series',
        name: 'Zenmux 全部模型 (自动获取)',
        provider: 'Zenmux',
        openRouterModel: 'google/gemini-3-pro-preview',
        customBaseUrl: 'https://zenmux.ai/api/v1',
        requiresCustomAuth: true,
        defaultConfig: {
          temperature: 0.3,
          maxTokens: 4096
        },
        capabilities: ['text-generation', 'multimodal', 'reasoning', 'code-analysis', 'model-list'],
        description: 'Zenmux平台，可自动获取所有可用模型，包括Google Gemini系列、Claude等多家厂商模型',
        costLevel: 'medium'
      },
      // {
      //   id: 'gemini-3-pro-preview',
      //   name: 'Gemini 3 Pro Preview',
      //   provider: 'Google (Zenmux)',
      //   openRouterModel: 'google/gemini-3-pro-preview',
      //   customBaseUrl: 'https://zenmux.ai/api/v1',
      //   requiresCustomAuth: false,
      //   defaultConfig: {
      //     temperature: 0.3,
      //     maxTokens: 4096
      //   },
      //   capabilities: ['text-generation', 'multimodal', 'reasoning', 'code-analysis', 'image-understanding', 'audio-understanding', 'long-context'],
      //   description: 'Google Gemini 3 Pro 预览版，通过 Zenmux 提供，支持多模态和超长上下文',
      //   costLevel: 'high'
      // },
      // ============ 本地系列（Ollama） ============
      {
        id: 'local-series-ollama',
        name: '自定义大模型系列 (Ollama格式)',
        provider: 'Local',
        openRouterModel: 'deepseek-r1:8b',
        customBaseUrl: 'http://localhost:11434', // Ollama 默认端口
        requiresCustomAuth: true,
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
        name: '自定义大模型系列 (OpenAI格式)',
        provider: 'Local',
        openRouterModel: 'qwen3-vl-30b',
        customBaseUrl: 'http://localhost:3000/v1',
        requiresCustomAuth: true,
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