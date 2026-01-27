import * as fs from 'fs/promises';
import * as path from 'path';
import { ModelPricingService } from './modelPricingService.js';

/**
 * Midscene日志解析器
 * 解析 ./midscene_run/log/ 目录下的官方日志文件
 * 
 * 官方日志文件：
 * - ai-profile-detail.log: 详细的token使用情况（JSON格式）
 * - ai-profile-stats.log: 统计信息，包含模型名称和耗时（CSV格式）
 */

export interface MidsceneTokenStats {
  timestamp: string;
  operation: string;
  duration: number; // 毫秒
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  model?: string;
  requestId?: string;
  inputPrice?: number; // 输入价格（美元/1K tokens）
  outputPrice?: number; // 输出价格（美元/1K tokens）
}

export interface MidsceneCacheStats {
  totalCalls: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number; // 百分比
}

export interface MidsceneLogSummary {
  tokenStats: MidsceneTokenStats[];
  cacheStats: MidsceneCacheStats;
  totalCost: number;
  totalDuration: number; // 毫秒
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export class MidsceneLogParser {
  private logDir: string;
  private pricingService: ModelPricingService;
  private cnyRate: number = 7.3; // 美元转人民币汇率，默认值

  constructor(logDir: string = './midscene_run/log') {
    this.logDir = logDir;
    this.pricingService = ModelPricingService.getInstance();
    this.fetchExchangeRate(); // 异步获取汇率
  }

  /**
   * 获取实时汇率（异步）
   */
  private async fetchExchangeRate(): Promise<void> {
    try {
      // 使用免费的汇率API获取实时汇率
      const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      const data = await response.json();
      if (data.rates && data.rates.CNY) {
        this.cnyRate = data.rates.CNY;
        console.log(`✅ 获取实时汇率: 1 USD = ${this.cnyRate} CNY`);
      }
    } catch (error) {
      console.warn(`⚠️ 获取汇率失败，使用默认值: 1 USD = ${this.cnyRate} CNY`);
    }
  }

  /**
   * 初始化解析器（加载价格配置）
   */
  async initialize(): Promise<void> {
    await this.pricingService.initialize();
  }

  /**
   * 解析指定runId的日志文件
   * @param runId 测试运行ID（可选，如果不提供则解析所有最新日志）
   * @param startTime 执行开始时间（用于过滤日志，只统计此时间之后的记录）
   * @returns 日志摘要
   */
  async parseLogForRun(runId?: string, startTime?: Date): Promise<MidsceneLogSummary | null> {
    try {
      // 查找日志文件
      const logFiles = await this.findLogFiles();
      
      if (logFiles.length === 0) {
        console.warn(`⚠️ 未找到Midscene日志文件`);
        console.warn(`   日志目录: ${this.logDir}`);
        return null;
      }

      console.log(`🔍 找到 ${logFiles.length} 个官方日志文件`);
      logFiles.forEach(file => console.log(`   - ${path.basename(file)}`));

      if (startTime) {
        console.log(`⏰ 过滤时间: ${startTime.toISOString()} 之后的记录`);
      }

      // 解析所有相关日志文件
      const tokenStats: MidsceneTokenStats[] = [];
      let cacheHits = 0;
      let cacheMisses = 0;

      for (const logFile of logFiles) {
        const fileName = path.basename(logFile);
        const content = await fs.readFile(logFile, 'utf-8');
        console.log(`📄 解析日志文件: ${fileName} (${content.length} 字节)`);
        
        if (fileName === 'ai-profile-detail.log') {
          // 解析详细token统计
          const tokens = this.parseDetailLog(content, startTime);
          console.log(`   - 提取到 ${tokens.length} 条token统计`);
          tokenStats.push(...tokens);
        } else if (fileName === 'ai-profile-stats.log') {
          // 解析统计信息（模型名称、耗时等）
          const stats = this.parseStatsLog(content, startTime);
          console.log(`   - 提取到 ${stats.length} 条统计信息`);
          // 合并到tokenStats中
          this.mergeStats(tokenStats, stats);
        } else if (fileName === 'cache.log') {
          // 解析缓存统计
          const cache = this.parseCacheStats(content, startTime);
          console.log(`   - 缓存命中: ${cache.hits}, 未命中: ${cache.misses}`);
          cacheHits += cache.hits;
          cacheMisses += cache.misses;
        }
      }

      // 计算汇总数据
      const totalInputTokens = tokenStats.reduce((sum, stat) => sum + stat.inputTokens, 0);
      const totalOutputTokens = tokenStats.reduce((sum, stat) => sum + stat.outputTokens, 0);
      const totalTokens = tokenStats.reduce((sum, stat) => sum + stat.totalTokens, 0);
      const totalDuration = tokenStats.reduce((sum, stat) => sum + stat.duration, 0);
      const totalCost = tokenStats.reduce((sum, stat) => sum + stat.cost, 0);
      
      // 🔥 修复：总调用数 = 缓存命中数 + 缓存未命中数
      // 注意：cacheHits 和 cacheMisses 已经从 cache.log 中直接统计得到
      const totalCalls = cacheHits + cacheMisses;
      const cacheHitRate = totalCalls > 0 ? (cacheHits / totalCalls) * 100 : 0;

      console.log(`📊 汇总统计: ${tokenStats.length} 条记录`);
      console.log(`   - 总Token: ${totalTokens.toLocaleString()} (输入: ${totalInputTokens.toLocaleString()}, 输出: ${totalOutputTokens.toLocaleString()})`);
      console.log(`   - 总耗时: ${(totalDuration / 1000).toFixed(1)}秒`);
      console.log(`   - 总成本: ${this.formatValue(totalCost, '$')}`);
      console.log(`   - 缓存统计: 总调用${totalCalls}次, 命中${cacheHits}次, 未命中${cacheMisses}次, 命中率${cacheHitRate.toFixed(1)}%`);

      return {
        tokenStats,
        cacheStats: {
          totalCalls,
          cacheHits,
          cacheMisses,
          cacheHitRate
        },
        totalCost,
        totalDuration,
        totalTokens,
        totalInputTokens,
        totalOutputTokens
      };
    } catch (error: any) {
      console.error(`❌ 解析Midscene日志失败:`, error.message);
      console.error(error.stack);
      return null;
    }
  }

  /**
   * 格式化数值显示（统一格式化函数）
   * @param value 要格式化的数值
   * @param prefix 前缀（如 $ 或 ¥）
   * @returns 格式化后的字符串
   */
  private formatValue(value: number, prefix: string = '$'): string {
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
  }

  /**
   * 查找官方日志文件
   */
  private async findLogFiles(): Promise<string[]> {
    try {
      // 检查日志目录是否存在
      try {
        await fs.access(this.logDir);
      } catch {
        return [];
      }

      const logFiles: string[] = [];

      // 官方统计日志文件（按优先级排序）
      const officialLogFiles = [
        'ai-profile-detail.log',  // 详细的token使用情况
        'ai-profile-stats.log',   // 统计信息（包含耗时、模型名称）
        'cache.log',              // 缓存统计
      ];

      for (const logFile of officialLogFiles) {
        const filePath = path.join(this.logDir, logFile);
        try {
          await fs.access(filePath);
          logFiles.push(filePath);
        } catch {
          // 文件不存在，跳过
        }
      }

      return logFiles;
    } catch (error: any) {
      console.error(`❌ 查找日志文件失败:`, error.message);
      return [];
    }
  }

  /**
   * 解析 ai-profile-detail.log
   * 格式：[2026-01-21T10:46:58.432+08:00] model usage detail: {"prompt_tokens":4228,"completion_tokens":105,"total_tokens":4333,...}
   */
  private parseDetailLog(content: string, startTime?: Date): MidsceneTokenStats[] {
    const stats: MidsceneTokenStats[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // 匹配格式：[时间戳] model usage detail: {JSON}
      const match = trimmed.match(/\[([^\]]+)\]\s+model usage detail:\s*(\{.+\})/);
      if (match) {
        try {
          const timestamp = match[1];
          
          // 🔥 如果提供了开始时间，过滤掉之前的记录
          if (startTime) {
            const logTime = new Date(timestamp);
            if (logTime < startTime) {
              continue; // 跳过此记录
            }
          }
          
          const jsonData = JSON.parse(match[2]);
          
          const stat: MidsceneTokenStats = {
            timestamp,
            operation: 'ai-call',
            duration: 0, // detail.log中没有耗时，需要从stats.log合并
            inputTokens: jsonData.prompt_tokens || 0,
            outputTokens: jsonData.completion_tokens || 0,
            totalTokens: jsonData.total_tokens || 0,
            cost: this.pricingService.calculateCost(undefined, jsonData.prompt_tokens || 0, jsonData.completion_tokens || 0),
            model: undefined,
            requestId: undefined
          };
          
          stats.push(stat);
        } catch (error) {
          console.warn(`      ⚠️ 解析JSON失败: ${trimmed.substring(0, 100)}`);
        }
      }
    }

    return stats;
  }

  /**
   * 解析 ai-profile-stats.log
   * 格式：[2026-01-21T10:46:58.432+08:00] model, qwen-vl-max-latest, mode, qwen2.5-vl, ..., prompt-tokens, 4228, completion-tokens, 105, total-tokens, 4333, cost-ms, 4877, requestId, xxx, ...
   */
  private parseStatsLog(content: string, startTime?: Date): Array<{
    timestamp: string;
    model?: string;
    duration: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    requestId?: string;
  }> {
    const stats: Array<any> = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // 匹配格式：[时间戳] CSV数据
      const match = trimmed.match(/\[([^\]]+)\]\s+(.+)/);
      if (match) {
        const timestamp = match[1];
        
        // 🔥 如果提供了开始时间，过滤掉之前的记录
        if (startTime) {
          const logTime = new Date(timestamp);
          if (logTime < startTime) {
            continue; // 跳过此记录
          }
        }
        
        const csvData = match[2];
        
        // 解析CSV格式的键值对
        const parts = csvData.split(',').map(p => p.trim());
        const data: Record<string, string> = {};
        
        for (let j = 0; j < parts.length - 1; j += 2) {
          const key = parts[j];
          const value = parts[j + 1];
          if (key && value) {
            data[key] = value;
          }
        }
        
        // 提取统计信息
        const promptTokens = parseInt(data['prompt-tokens'] || '0');
        const completionTokens = parseInt(data['completion-tokens'] || '0');
        const totalTokens = parseInt(data['total-tokens'] || '0');
        const costMs = parseInt(data['cost-ms'] || '0');
        const model = data['model'];
        const requestId = data['requestId'];
        
        if (totalTokens > 0) {
          stats.push({
            timestamp,
            model,
            duration: costMs,
            inputTokens: promptTokens,
            outputTokens: completionTokens,
            totalTokens,
            requestId
          });
        }
      }
    }

    return stats;
  }

  /**
   * 合并 detail.log 和 stats.log 的数据
   * 通过时间戳（秒级）和token数量匹配
   */
  private mergeStats(
    detailStats: MidsceneTokenStats[],
    statsData: Array<{
      timestamp: string;
      model?: string;
      duration: number;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      requestId?: string;
    }>
  ): void {
    // 为每个detail记录找到对应的stats记录
    for (const detail of detailStats) {
      // 提取秒级时间戳（忽略毫秒差异）
      const detailTimeSeconds = detail.timestamp.substring(0, 19); // 2026-01-21T19:40:13
      
      // 通过时间戳（秒级）和token数量匹配
      const matchingStat = statsData.find(stat => {
        const statTimeSeconds = stat.timestamp.substring(0, 19);
        return statTimeSeconds === detailTimeSeconds &&
               stat.totalTokens === detail.totalTokens;
      });
      
      if (matchingStat) {
        detail.duration = matchingStat.duration;
        detail.model = matchingStat.model;
        detail.requestId = matchingStat.requestId;
        // 🔥 重新计算成本（使用实际的模型名称和价格服务）
        detail.cost = this.pricingService.calculateCost(detail.model, detail.inputTokens, detail.outputTokens);
        // 🔥 获取价格信息用于详细展示
        const pricing = this.pricingService.getModelPricing(detail.model);
        if (pricing) {
          detail.inputPrice = pricing.input;
          detail.outputPrice = pricing.output;
        }
      }
    }
  }

  /**
   * 解析缓存统计信息
   * cache.log 格式示例：
   * [时间戳] cache loaded from file, path: xxx (加载缓存文件)
   * [时间戳] cache found and marked as used, type: xxx, prompt: xxx (缓存命中 - 主要日志)
   * [时间戳] cache hit, prompt: xxx (缓存命中的简短日志 - 通常紧跟在上面之后，是重复的)
   * [时间戳] will append cache {...} (准备写入新缓存，表示缓存未命中)
   * [时间戳] cache flushed to file: xxx (缓存写入)
   * 
   * 🔥 重要发现：
   * - "cache found and marked as used" 是主要的缓存命中日志
   * - "cache hit" 通常紧跟在 "cache found and marked as used" 之后（几十毫秒内）
   * - 这两条日志指的是同一次操作，不应该重复计数
   * 
   * 🔥 正确的统计方法：
   * - 只统计 "cache found and marked as used"（主要日志）
   * - 忽略 "cache hit"（避免重复计数）
   * - 缓存未命中数 = "will append cache" 的次数
   */
  private parseCacheStats(content: string, startTime?: Date): { hits: number; misses: number } {
    const lines = content.split('\n');
    let hits = 0;
    let misses = 0;

    for (const line of lines) {
      // 🔥 恢复时间过滤：只统计本次执行的缓存操作
      // executionStartTime 现在在构造函数中设置，可以捕获所有本次执行的日志
      const timestampMatch = line.match(/\[([^\]]+)\]/);
      if (timestampMatch && startTime) {
        const logTime = new Date(timestampMatch[1]);
        if (logTime < startTime) {
          continue; // 跳过此记录
        }
      }
      
      // 🔥 只统计 "cache found and marked as used"（主要日志）
      // 不统计 "cache hit"，因为它通常是重复的
      if (line.includes('cache found and marked as used')) {
        hits++;
      }
      // 注意：不统计 "cache hit"，避免重复计数
      
      // 🔥 统计缓存未命中：匹配 "will append cache"
      if (line.includes('will append cache')) {
        misses++;
      }
    }

    return { hits, misses };
  }

  /**
   * 格式化数字，添加千分位分隔符
   * @param num 要格式化的数字
   * @returns 格式化后的字符串
   */
  private formatNumber(num: number): string {
    return num.toLocaleString();
  }

  /**
   * 生成可视化进度条
   * @param percentage 百分比（0-100）
   * @param length 进度条总长度，默认 20
   * @returns 进度条字符串（使用 █ 和 ░ 字符）
   */
  private generateProgressBar(percentage: number, length: number = 20): string {
    const filled = Math.round(percentage / 5); // 每 5% 一个字符
    const empty = length - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  /**
   * 计算数组的中位数
   * @param numbers 数字数组
   * @returns 中位数
   */
  private calculateMedian(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    
    if (sorted.length % 2 === 0) {
      // 偶数个元素，取中间两个的平均值
      return (sorted[mid - 1] + sorted[mid]) / 2;
    } else {
      // 奇数个元素，取中间的元素
      return sorted[mid];
    }
  }

  /**
   * 格式化日志摘要为可读文本
   * @param summary 日志摘要数据
   * @param options 格式化选项
   */
  formatSummary(summary: MidsceneLogSummary, options?: {
    testCaseId?: number;
    executionId?: string;
    detailed?: boolean;
  }): string {
    const lines: string[] = [];
    const detailed = options?.detailed ?? false;

    // 标题和分隔线
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('📊 Midscene AI 调用详细统计');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // 🔥 检查是否有 AI 调用（token 统计）
    const hasAICalls = summary.tokenStats.length > 0;
    const hasCacheStats = summary.cacheStats.totalCalls > 0;
    
    if (!hasAICalls && !hasCacheStats) {
      // 没有任何统计数据
      lines.push('');
      lines.push('⚠️ 未找到统计数据');
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return lines.join('\n');
    }
    
    if (detailed) {
      // 详细模式：包含缓存操作细节
      lines.push('');
      lines.push('【📦 缓存调用统计】');
      lines.push('• 缓存日志: ./midscene_run/log/cache.log');
      
      // 优先使用 testCaseId，如果没有则使用 executionId
      if (options?.testCaseId) {
        lines.push(`• 缓存文件: ./midscene_run/cache/test-case-${options.testCaseId}.cache.yaml`);
      } else if (options?.executionId) {
        lines.push(`• 缓存文件: ./midscene_run/cache/test-case-${options.executionId}.cache.yaml`);
      }
      
      const totalOps = summary.cacheStats.totalCalls;
      const hits = summary.cacheStats.cacheHits;
      const misses = summary.cacheStats.cacheMisses;
      
      lines.push(`• 总操作: ${totalOps}个`);
      lines.push(`  ├─ ✅ 缓存命中: ${hits} 个`);
      lines.push(`  ├─ ❌ 缓存未命中: ${misses} 个`);
      lines.push(`  └─ 🎯 缓存命中率: ${summary.cacheStats.cacheHitRate.toFixed(1)}% (${hits}/${totalOps})`);
      
      if (hits > 0 && summary.tokenStats.length > 0) {
        const avgCost = summary.totalCost / summary.tokenStats.length;
        const avgTime = summary.totalDuration / summary.tokenStats.length / 1000;
        const savedCost = avgCost * hits;
        const savedCostCny = savedCost * this.cnyRate;
        lines.push('• 缓存收益:');
        lines.push(`  ├─ 节省调用: ${hits} 次`);
        lines.push(`  ├─ 节省时间: ~${(avgTime * hits).toFixed(1)}s (预估)`);
        lines.push(`  └─ 节省成本: ~${this.formatValue(savedCost, '$')} (${this.formatValue(savedCostCny, '¥')}) (预估)`);
      }
      
      lines.push('');
      lines.push('【🤖 模型调用统计】');
      
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
        const costCny = stats.cost * this.cnyRate;
        lines.push(`• ${model}`);
        lines.push(`  ├─ 总调用: ${stats.count} 次`);
        lines.push(`  ├─ 总Token: ${this.formatNumber(stats.tokens)} (输入: ${this.formatNumber(stats.inputTokens)} | 输出: ${this.formatNumber(stats.outputTokens)})`);
        lines.push(`  ├─ 总耗时: ${(stats.duration / 1000).toFixed(1)}s`);
        lines.push(`  └─ 总成本: ${this.formatValue(stats.cost, '$')} (${this.formatValue(costCny, '¥')})`);
      }
      
      // 文件路径信息
      lines.push('');
      lines.push('【📁 相关文件路径】');
      lines.push('📄 缓存文件: ./midscene_run/cache/*.cache.yaml');
      lines.push('📄 日志文件: ./midscene_run/log/*.log');
      lines.push('📊 报告文件: ./midscene_run/report/*.html');
      if (options?.executionId) {
        lines.push(`📸 截图文件: ./artifacts/${options.executionId}/*.png`);
        lines.push(`🎥 视频文件: ./artifacts/${options.executionId}/*.webm`);
      }
      
      // 注意事项和优化建议
      lines.push('');
      lines.push('【⚠️ 注意事项】');
      lines.push('✅ 可以被缓存的操作');
      lines.push('• Plan (计划生成)');
      lines.push('  ├─ 类型: type: plan');
      lines.push('  ├─ 内容: 将自然语言描述转换为具体的操作步骤');
      lines.push('  └─ 示例: "在用户名输入框输入账号: sysadmin" → 生成 workflow');
      lines.push('');
      lines.push('• Locate (元素定位)');
      lines.push('  ├─ 类型: type: locate');
      lines.push('  ├─ 内容: 元素的 XPath 定位信息');
      lines.push('  └─ 示例: "登录名输入框" → /html/body/div[1]/div[1]/div[1]/div[1]/div[3]/input[1]');
      lines.push('');
      lines.push('❌ 不能被缓存的操作');
      lines.push('• Assert (断言验证)');
      lines.push('  ├─ 原因: 断言需要实时验证页面当前状态, 每次执行时页面内容可能不同');
      lines.push('  ├─ 示例: 验证"欢迎回来"文本是否存在');
      lines.push('  └─ 影响: 每次执行都会调用AI进行验证');
      lines.push('');
      lines.push('• Extract (数据提取)');
      lines.push('  ├─ 原因: 提取的数据是动态的, 每次执行时内容可能变化');
      lines.push('  └─ 示例: 使用稳定的元素描述');
      lines.push('');
      lines.push('• 页面内容变化的操作');
      lines.push('  ├─ 原因: 如果页面DOM结构发生变化, 缓存的XPath可能失效');
      lines.push('  └─ Midscene处理: 会自动检测缓存失效并更新缓存');
      lines.push('');
      lines.push('');
      lines.push('【💡 优化建议】');
      lines.push('• 减少断言操作');
      lines.push('  ├─ 断言无法缓存, 每个断言都会调用AI, 产生API费用');
      lines.push('  ├─ 建议: 优化测试用例减少不必要的断言, 减少AI调用次数');
      lines.push('  └─ 示例: 合并多个断言, 用一个断言验证多个条件');
      lines.push('');
      lines.push('• 稳定的页面结构');
      lines.push('  ├─ 页面结构稳定时, locate缓存命中率更高');
      lines.push('  ├─ 建议: 避免频繁修改页面DOM结构');
      lines.push('  └─ 示例: 使用稳定的元素描述');
      lines.push('');
      lines.push('• 缓存失效场景');
      lines.push('  ├─ 页面DOM结构变化');
      lines.push('  ├─ 元素位置或属性改变');
      lines.push('  └─ 系统会自动检测并更新缓存');
      lines.push('');
      lines.push('【🛠️ 参考资料】');
      lines.push('- [Midscene官方缓存文档](https://midscenejs.com/zh/caching)');
      lines.push('- [Midscene调试指南](https://midscenejs.com/zh/debugging)');
      lines.push('- [Midscene API文档](https://midscenejs.com/zh/api)');
      
    } else {
      // 简洁模式：原有的紧凑格式
      const callCount = summary.tokenStats.length;
      
      // 🔥 只有在有 AI 调用时才显示 token 和成本信息
      if (hasAICalls) {
        lines.push(`💰 总成本: ${this.formatValue(summary.totalCost, '$')} | ⏱️ 总耗时: ${(summary.totalDuration / 1000).toFixed(1)}s | 📊 调用: ${callCount}次`);
      
      // Token 统计
      lines.push(`🎯 总Token: ${this.formatNumber(summary.totalTokens)} (输入: ${this.formatNumber(summary.totalInputTokens)}, 输出: ${this.formatNumber(summary.totalOutputTokens)})`);
      
      // 平均值
      if (callCount > 0) {
        const avgTokens = Math.round(summary.totalTokens / callCount);
        const avgDuration = (summary.totalDuration / callCount / 1000).toFixed(1);
        const avgCost = summary.totalCost / callCount;
        lines.push(`📈 平均: ${avgTokens} tokens/次 | ${avgDuration}s/次 | ${this.formatValue(avgCost, '$')}/次`);
      }
      }

      
      // 缓存统计（带可视化进度条）
      if (hasCacheStats) {
        const hitRate = summary.cacheStats.cacheHitRate;
        const progressBar = this.generateProgressBar(hitRate);
        
        lines.push('');
        lines.push(`📦 缓存命中率: ${hitRate.toFixed(1)}% [${progressBar}] ${summary.cacheStats.cacheHits}/${summary.cacheStats.totalCalls}`);
        
        // 🔥 100% 缓存命中时的特殊提示
        if (hitRate === 100 && !hasAICalls) {
          lines.push(`💡 本次执行 100% 命中缓存，无 AI 调用产生，节省成本和时间`);
        } else if (summary.cacheStats.cacheHits > 0 && hasAICalls && callCount > 0 && summary.totalCost > 0) {
          // 缓存收益估算（只有在有实际成本时才显示）
          const savedCost = (summary.totalCost / callCount) * summary.cacheStats.cacheHits;
          const savedTime = (summary.totalDuration / callCount / 1000) * summary.cacheStats.cacheHits;
          const savedCostCny = savedCost * this.cnyRate;
          
          lines.push(`💡 缓存收益: 节省约 ${this.formatValue(savedCost, '$')} (${this.formatValue(savedCostCny, '¥')}) 成本, ${savedTime.toFixed(1)}s 时间`);
        }
      }
      
      // 模型调用详情（按模型分组）- 只有在有 AI 调用时才显示
      if (hasAICalls && summary.tokenStats.length > 0) {
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
          const percentage = ((stats.count / callCount) * 100).toFixed(0);
          const costCny = stats.cost * this.cnyRate;
          lines.push(`   • ${model}`);
          
          // 获取模型价格信息
          const pricing = this.pricingService.getModelPricing(model);
          const inputPrice = pricing?.input || 0;
          const outputPrice = pricing?.output || 0;
          
          // 计算详细成本
          const inputCost = (stats.inputTokens / 1000) * inputPrice;
          const outputCost = (stats.outputTokens / 1000) * outputPrice;
          const totalCost = inputCost + outputCost;
          
          // 转换为人民币
          const inputCostCny = inputCost * this.cnyRate;
          const outputCostCny = outputCost * this.cnyRate;
          const totalCostCny = totalCost * this.cnyRate;
          
          lines.push(`     ├─ ${stats.count}次 (${percentage}%) | ${this.formatNumber(stats.tokens)} tokens | ${avgTime}s/次 | ${this.formatValue(stats.cost, '$')} (${this.formatValue(costCny, '¥')})`);
          lines.push(`     ├─ 输入: ${this.formatNumber(stats.inputTokens)} tokens × ${this.formatValue(inputPrice, '$')} = ${this.formatValue(inputCost, '$')} (${this.formatValue(inputCostCny, '¥')})`);
          lines.push(`     ├─ 输出: ${this.formatNumber(stats.outputTokens)} tokens × ${this.formatValue(outputPrice, '$')} = ${this.formatValue(outputCost, '$')} (${this.formatValue(outputCostCny, '¥')})`);
          lines.push(`     └─ 总计: ${this.formatValue(totalCost, '$')} (${this.formatValue(totalCostCny, '¥')})`);
        }
      }

      // 性能分析（最快/最慢/中位数）- 只有在有 AI 调用时才显示
      if (hasAICalls && summary.tokenStats.length > 1) {
        const durations = summary.tokenStats.map(s => s.duration);
        const fastest = (Math.min(...durations) / 1000).toFixed(1);
        const slowest = (Math.max(...durations) / 1000).toFixed(1);
        const median = (this.calculateMedian(durations) / 1000).toFixed(1);
        
        lines.push('');
        lines.push(`⚡ 性能分析: 最快 ${fastest}s | 中位数 ${median}s | 最慢 ${slowest}s`);
      }
    }
    
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return lines.join('\n');
  }
}
