/**
 * AI 服务超时配置工具
 * 统一管理所有 AI 调用的超时时间
 */

/**
 * 获取 AI 请求超时时间（毫秒）
 * @param type - 超时类型：'default' | 'short' | 'long'
 * @param customTimeout - 自定义超时配置（来自用户设置）
 * @returns 超时时间（毫秒）
 */
export function getAITimeout(
  type: 'default' | 'short' | 'long' = 'default',
  customTimeout?: { default?: number; short?: number }
): number {
  // 优先使用用户自定义配置
  if (customTimeout) {
    if (type === 'short' && customTimeout.short) {
      return customTimeout.short;
    }
    if ((type === 'default' || type === 'long') && customTimeout.default) {
      return customTimeout.default;
    }
  }
  
  // 回退到环境变量配置
  const defaultTimeout = parseInt(process.env.AI_REQUEST_TIMEOUT || '180000', 10); // 默认 3 分钟
  const shortTimeout = parseInt(process.env.AI_SHORT_TIMEOUT || '30000', 10);      // 默认 30 秒
  
  switch (type) {
    case 'short':
      // 用于快速分析任务（如分类、摘要生成）
      return shortTimeout;
    case 'long':
      // 用于长时间任务（如需求文档生成、深度分析）
      return defaultTimeout;
    case 'default':
    default:
      // 默认使用长超时
      return defaultTimeout;
  }
}

/**
 * 创建带超时的 AbortController
 * @param type - 超时类型
 * @param customTimeout - 自定义超时配置（来自用户设置）
 * @returns { controller, timeout, timeoutMs }
 */
export function createAIAbortController(
  type: 'default' | 'short' | 'long' = 'default',
  customTimeout?: { default?: number; short?: number }
): {
  controller: AbortController;
  timeout: NodeJS.Timeout;
  timeoutMs: number;
} {
  const controller = new AbortController();
  const timeoutMs = getAITimeout(type, customTimeout);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  return { controller, timeout, timeoutMs };
}

/**
 * 格式化超时错误消息
 * @param timeoutMs - 超时时间（毫秒）
 * @returns 友好的错误消息
 */
export function formatTimeoutError(timeoutMs: number): string {
  const seconds = Math.round(timeoutMs / 1000);
  return `AI 服务响应超时（${seconds}秒），请稍后重试或尝试缩短输入内容`;
}
