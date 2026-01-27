/**
 * 日志过滤工具函数
 * 用于在简洁模式和详细模式之间切换 Midscene 统计日志
 */

/**
 * 检测日志消息是否包含 Midscene 统计信息
 */
export const isMidsceneStats = (message: string): boolean => {
  return message.includes('📊 Midscene AI 调用详细统计') ||
         message.includes('[DETAILED_STATS]');
};

/**
 * 根据格式模式过滤日志行
 * @param message 原始日志消息
 * @param format 格式模式：'compact' 简洁模式 | 'detailed' 详细模式
 * @returns 过滤后的日志消息
 */
export const filterLogLines = (message: string, format: 'compact' | 'detailed'): string => {
  // 🔥 只过滤 Midscene 统计信息，其他日志都正常显示
  if (!isMidsceneStats(message)) {
    return message; // 非统计信息，直接返回
  }
  
  // 🔥 检测是否是详细统计信息（带标记）
  const isDetailedStats = message.includes('[DETAILED_STATS]');
  
  if (format === 'compact') {
    // 简洁模式：显示简洁统计，隐藏详细统计
    if (isDetailedStats) {
      return ''; // 隐藏详细统计
    }
    return message; // 显示简洁统计
  } else {
    // 详细模式：显示详细统计（去掉标记），隐藏简洁统计
    if (isDetailedStats) {
      return message.replace('[DETAILED_STATS]\n', ''); // 显示详细统计，去掉标记
    }
    return ''; // 隐藏简洁统计
  }
};
