/**
 * 增强版 formatSummary 方法
 * 用于替换 midsceneLogParser.ts 中的 formatSummary 方法
 */

export function formatSummaryEnhanced(summary: any): string {
  const lines: string[] = [];
  const cnyRate = 7.3; // 美元转人民币汇率

  // 统一的格式化函数
  const formatValue = (value: number, prefix: string = '$'): string => {
    if (value === 0) return `${prefix}0`;
    
    // 对于非常小的数字，使用固定小数位数显示
    if (Math.abs(value) < 0.000001) {
      // 小于 0.000001 的数字，显示更多小数位（最多12位）
      return `${prefix}${value.toFixed(12).replace(/\.?0+$/, '')}`;
    } else if (Math.abs(value) < 0.01) {
      // 0.000001 到 0.01 之间，显示 9 位小数
      return `${prefix}${value.toFixed(9).replace(/\.?0+$/, '')}`;
    } else {
      // 大于 0.01，使用 toPrecision 保留 6 位有效数字
      return `${prefix}${Number(value.toPrecision(6))}`;
    }
  };

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('📊 Midscene AI 调用详细统计');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // 核心指标（单行展示）
  const avgTokens = summary.tokenStats.length > 0 
    ? Math.round(summary.totalTokens / summary.tokenStats.length) 
    : 0;
  const avgDuration = summary.tokenStats.length > 0 
    ? (summary.totalDuration / summary.tokenStats.length / 1000).toFixed(1) 
    : '0.0';
  const avgCost = summary.tokenStats.length > 0
    ? summary.totalCost / summary.tokenStats.length
    : 0;
  
  lines.push(`💰 总成本: ${formatValue(summary.totalCost, '$')} | ⏱️ 总耗时: ${(summary.totalDuration / 1000).toFixed(1)}s | 📊 调用: ${summary.tokenStats.length}次`);
  lines.push(`🎯 总Token: ${summary.totalTokens.toLocaleString()} (输入: ${summary.totalInputTokens.toLocaleString()}, 输出: ${summary.totalOutputTokens.toLocaleString()})`);
  lines.push(`📈 平均: ${avgTokens} tokens/次 | ${avgDuration}s/次 | ${formatValue(avgCost, '$')}/次`);
  
  // 成本计算详情
  if (summary.tokenStats.length > 0) {
    lines.push('');
    lines.push('💵 成本计算详情:');
    
    // 按模型分组计算
    const modelCostDetails = new Map<string, {
      inputTokens: number;
      outputTokens: number;
      inputPrice: number;
      outputPrice: number;
      inputCost: number;
      outputCost: number;
      totalCost: number;
    }>();
    
    for (const stat of summary.tokenStats) {
      const model = stat.model || 'unknown';
      const existing = modelCostDetails.get(model) || {
        inputTokens: 0,
        outputTokens: 0,
        inputPrice: stat.inputPrice || 0,
        outputPrice: stat.outputPrice || 0,
        inputCost: 0,
        outputCost: 0,
        totalCost: 0
      };
      
      existing.inputTokens += stat.inputTokens;
      existing.outputTokens += stat.outputTokens;
      existing.inputCost += (stat.inputTokens / 1000) * (stat.inputPrice || 0);
      existing.outputCost += (stat.outputTokens / 1000) * (stat.outputPrice || 0);
      existing.totalCost += stat.cost;
      
      modelCostDetails.set(model, existing);
    }
    
    for (const [model, details] of modelCostDetails) {
      lines.push(`   • ${model}:`);
      lines.push(`     输入: ${details.inputTokens.toLocaleString()} tokens × ${formatValue(details.inputPrice, '$')} = ${formatValue(details.inputCost, '$')}`);
      lines.push(`     输出: ${details.outputTokens.toLocaleString()} tokens × ${formatValue(details.outputPrice, '$')} = ${formatValue(details.outputCost, '$')}`);
      lines.push(`     小计: ${formatValue(details.totalCost, '$')}`);
    }
  }
  
  // 缓存统计（带可视化进度条）
  if (summary.cacheStats.totalCalls > 0) {
    const hitRate = summary.cacheStats.cacheHitRate;
    const hitBar = '█'.repeat(Math.round(hitRate / 5));
    const missBar = '░'.repeat(20 - Math.round(hitRate / 5));
    
    lines.push('');
    lines.push(`📦 缓存命中率: ${hitRate.toFixed(1)}% [${hitBar}${missBar}] ${summary.cacheStats.cacheHits}/${summary.cacheStats.totalCalls}`);
    
    // 缓存收益估算
    if (summary.cacheStats.cacheHits > 0) {
      const savedCost = (summary.totalCost / summary.tokenStats.length) * summary.cacheStats.cacheHits;
      const savedTime = (summary.totalDuration / summary.tokenStats.length / 1000) * summary.cacheStats.cacheHits;
      const savedCostCny = savedCost * cnyRate;
      lines.push(`💡 缓存收益: 节省约 ${formatValue(savedCost, '$')} (${formatValue(savedCostCny, '¥')}) 成本, ${savedTime.toFixed(1)}s 时间`);
    }
  }
  
  // 模型使用统计
  if (summary.tokenStats.length > 0) {
    lines.push('');
    lines.push(`📋 模型调用详情:`);
    
    // 按模型分组统计
    const modelStats = new Map<string, { 
      count: number; 
      tokens: number; 
      inputTokens: number;
      outputTokens: number;
      duration: number;
      cost: number;
    }>();
    
    for (const stat of summary.tokenStats) {
      const model = stat.model || 'unknown';
      const existing = modelStats.get(model) || { 
        count: 0, 
        tokens: 0, 
        inputTokens: 0,
        outputTokens: 0,
        duration: 0,
        cost: 0
      };
      existing.count++;
      existing.tokens += stat.totalTokens;
      existing.inputTokens += stat.inputTokens;
      existing.outputTokens += stat.outputTokens;
      existing.duration += stat.duration;
      existing.cost += stat.cost;
      modelStats.set(model, existing);
    }
    
    for (const [model, stats] of modelStats) {
      const avgTime = (stats.duration / stats.count / 1000).toFixed(1);
      const percentage = ((stats.count / summary.tokenStats.length) * 100).toFixed(0);
      lines.push(`   • ${model}`);
      lines.push(`     └─ ${stats.count}次 (${percentage}%) | ${stats.tokens.toLocaleString()} tokens | ${avgTime}s/次 | ${formatValue(stats.cost, '$')}`);
    }
  }
  
  // 性能分析
  if (summary.tokenStats.length > 1) {
    const durations = summary.tokenStats.map((s: any) => s.duration).sort((a: number, b: number) => a - b);
    const fastest = (durations[0] / 1000).toFixed(1);
    const slowest = (durations[durations.length - 1] / 1000).toFixed(1);
    const median = (durations[Math.floor(durations.length / 2)] / 1000).toFixed(1);
    
    lines.push('');
    lines.push(`⚡ 性能分析: 最快 ${fastest}s | 中位数 ${median}s | 最慢 ${slowest}s`);
  }
  
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  return lines.join('\n');
}

/**
 * 使用示例输出：
 * 
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 📊 Midscene AI 调用详细统计
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 💰 总成本: $0.0166 | ⏱️ 总耗时: 24.7s | 📊 调用: 4次
 * 🎯 总Token: 15,824 (输入: 15,036, 输出: 788)
 * 📈 平均: 3956 tokens/次 | 6.2s/次 | $0.004153/次
 * 
 * 💵 成本计算详情:
 *    • glm-4.6v:
 *      输入: (15,036 / 1000) × $0.000300 = $0.004511
 *      输出: (788 / 1000) × $0.000900 = $0.000709
 *      小计: $0.004511 + $0.000709 = $0.005220
 * 
 * 📦 缓存命中率: 0.0% [░░░░░░░░░░░░░░░░░░░░] 0/2
 * 
 * 📋 模型调用详情:
 *    • glm-4.6v
 *      └─ 4次 (100%) | 15,824 tokens | 6.2s/次 | $0.0166
 * 
 * ⚡ 性能分析: 最快 2.9s | 中位数 6.2s | 最慢 9.5s
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */
