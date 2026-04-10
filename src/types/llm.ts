// LLM 配置相关类型定义（前后端共享）

export interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  apiFormat?: 'openai' | 'ollama'; // API 格式：openai（默认）或 ollama
  /**
   * 通用输入长度策略（来自系统设置，可选）
   * - maxInputTokensOverride: 强制覆盖“最大输入 tokens”
   * - modelContextWindowsJson: {"model": contextWindowTokens} 映射（JSON 字符串）
   * - inputSafetyMarginTokens: 动态计算时的安全余量（tokens）
   */
  inputLimits?: {
    maxInputTokensOverride?: number;
    modelContextWindowsJson?: string;
    inputSafetyMarginTokens?: number;
  };
  /**
   * 兼容旧字段（已废弃）：requirementDoc
   * 未来将被 inputLimits 替代，但读取时会自动回退。
   */
  requirementDoc?: {
    maxInputTokensOverride?: number;
    modelContextWindowsJson?: string;
    inputSafetyMarginTokens?: number;
  };
  timeout?: {
    default?: number; // 默认超时（毫秒），用于长时间任务
    short?: number;   // 短超时（毫秒），用于快速分析
  };
}

