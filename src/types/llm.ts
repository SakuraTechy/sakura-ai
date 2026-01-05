// LLM 配置相关类型定义（前后端共享）

export interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  apiFormat?: 'openai' | 'ollama'; // API 格式：openai（默认）或 ollama
}

