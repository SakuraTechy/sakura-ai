/**
 * AssertionService - 断言验证服务主类
 * 
 * 功能：
 * 1. 统一的断言验证接口
 * 2. 自动识别断言类型并选择合适的验证策略
 * 3. 管理验证策略的注册和调用
 * 4. 提供详细的验证日志和错误信息
 * 5. 支持验证结果的结构化返回
 */

import type {
  Assertion,
  VerificationContext,
  AssertionResult,
  VerificationStrategy,
  AssertionServiceConfig,
  AssertionStats
} from './types';
import { AssertionType, AssertionError, AssertionErrorType } from './types';
import { VerificationStrategyRegistry } from './VerificationStrategyRegistry';
import { AssertionLogger } from './AssertionLogger';
import { TextHistoryManager } from './TextHistoryManager';

/**
 * 默认配置
 */
const DEFAULT_CONFIG: AssertionServiceConfig = {
  fileDownload: {
    maxAge: 30000,
    excludePatterns: ['screenshot-*.png', 'trace-*.zip', 'video-*.webm']
  },
  textMatch: {
    defaultMode: 'auto',
    historyEnabled: true,
    historyMaxSize: 1000
  },
  elementLocate: {
    defaultTimeout: 5000,
    retryInterval: 100,
    maxRetries: 3
  },
  popup: {
    quickTimeout: 2000,
    historyCheckFirst: true
  },
  logging: {
    enabled: true,
    level: 'info'
  }
};

export class AssertionService {
  private static instance: AssertionService;
  private config: AssertionServiceConfig;
  private registry: VerificationStrategyRegistry;
  private logger: AssertionLogger;
  private textHistory: TextHistoryManager;
  private stats: AssertionStats;

  private constructor(config?: Partial<AssertionServiceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.registry = VerificationStrategyRegistry.getInstance();
    this.logger = AssertionLogger.getInstance();
    this.textHistory = TextHistoryManager.getInstance({
      maxSize: this.config.textMatch.historyMaxSize,
      enabled: this.config.textMatch.historyEnabled
    });
    
    // 初始化统计信息
    this.stats = {
      totalVerifications: 0,
      successfulVerifications: 0,
      failedVerifications: 0,
      averageDuration: 0,
      cacheHitRate: 0,
      strategyUsage: {}
    };
  }

  /**
   * 获取单例实例
   */
  public static getInstance(config?: Partial<AssertionServiceConfig>): AssertionService {
    if (!AssertionService.instance) {
      AssertionService.instance = new AssertionService(config);
    }
    return AssertionService.instance;
  }

  /**
   * 重置单例实例（主要用于测试）
   */
  public static resetInstance(): void {
    AssertionService.instance = null as any;
  }

  /**
   * 验证断言
   * 
   * @param assertion - 断言对象
   * @param context - 验证上下文
   * @returns 验证结果
   */
  public async verify(
    assertion: Assertion,
    context: VerificationContext
  ): Promise<AssertionResult> {
    const startTime = Date.now();
    
    try {
      // 1. 验证断言对象
      this.validateAssertion(assertion);
      
      // 2. 记录开始日志
      this.log(`开始验证断言: ${assertion.description}`, 'info', context);
      
      // 3. 识别断言类型（如果未指定）
      if (!assertion.type) {
        assertion.type = this.identifyAssertionType(assertion);
        this.log(`自动识别断言类型: ${assertion.type}`, 'debug', context);
      }
      
      // 4. 选择验证策略
      const strategy = this.registry.getStrategy(assertion.type);
      if (!strategy) {
        throw new AssertionError(
          AssertionErrorType.NO_STRATEGY_FOUND,
          `找不到断言类型 "${assertion.type}" 的验证策略`,
          assertion,
          [
            '请检查断言类型是否正确',
            '确认对应的验证策略已注册',
            `可用的断言类型: ${this.registry.getRegisteredTypes().join(', ')}`
          ]
        );
      }
      
      // 5. 执行验证
      this.log(`使用策略 "${strategy.name}" 进行验证`, 'debug', context);
      const result = await strategy.verify(assertion, context);
      
      // 6. 计算耗时
      const duration = Date.now() - startTime;
      result.duration = duration;
      
      // 7. 更新统计信息
      this.updateStats(strategy.name, result.success, duration);
      
      // 8. 记录结果日志
      if (result.success) {
        this.log(`✓ 断言验证成功: ${assertion.description}`, 'success', context);
        if (result.matchType) {
          this.log(`  匹配类型: ${result.matchType}`, 'info', context);
        }
      } else {
        this.log(`✗ 断言验证失败: ${assertion.description}`, 'error', context);
        if (result.error) {
          this.log(`  错误: ${result.error}`, 'error', context);
        }
      }
      
      // 9. 记录警告和建议
      if (result.warnings && result.warnings.length > 0) {
        for (const warning of result.warnings) {
          this.log(`  ⚠ ${warning}`, 'warning', context);
        }
      }
      
      if (result.suggestions && result.suggestions.length > 0) {
        for (const suggestion of result.suggestions) {
          this.log(`  💡 ${suggestion}`, 'info', context);
        }
      }
      
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // 更新失败统计
      this.stats.totalVerifications++;
      this.stats.failedVerifications++;
      
      // 处理断言错误
      if (error instanceof AssertionError) {
        this.log(`✗ 断言验证失败: ${error.message}`, 'error', context);
        
        return {
          success: false,
          assertionType: error.assertion?.type || 'unknown',
          error: error.message,
          suggestions: error.suggestions,
          duration
        };
      }
      
      // 处理意外错误
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`✗ 断言验证出错: ${errorMessage}`, 'error', context);
      
      return {
        success: false,
        assertionType: assertion?.type || 'unknown',
        error: `验证过程中发生错误: ${errorMessage}`,
        suggestions: [
          '请检查断言配置是否正确',
          '查看详细日志以获取更多信息',
          '如果问题持续，请联系技术支持'
        ],
        duration
      };
    }
  }

  /**
   * 批量验证断言
   * 
   * @param assertions - 断言数组
   * @param context - 验证上下文
   * @returns 验证结果数组
   */
  public async verifyBatch(
    assertions: Assertion[],
    context: VerificationContext
  ): Promise<AssertionResult[]> {
    this.log(`开始批量验证 ${assertions.length} 个断言`, 'info', context);
    
    const results: AssertionResult[] = [];
    
    for (const assertion of assertions) {
      const result = await this.verify(assertion, context);
      results.push(result);
      
      // 如果验证失败且配置了快速失败，则停止后续验证
      if (!result.success && this.config.logging.level === 'error') {
        this.log('检测到验证失败，停止后续验证', 'warning', context);
        break;
      }
    }
    
    // 统计结果
    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;
    
    this.log(
      `批量验证完成: 成功 ${successCount}/${results.length}, 失败 ${failCount}`,
      failCount > 0 ? 'warning' : 'success',
      context
    );
    
    return results;
  }

  /**
   * 注册验证策略
   * 
   * @param type - 断言类型
   * @param strategy - 验证策略
   */
  public registerStrategy(type: AssertionType, strategy: VerificationStrategy): void {
    this.registry.register(type, strategy);
    this.log(`注册验证策略: ${type} -> ${strategy.name}`, 'info');
  }

  /**
   * 获取文本历史管理器
   */
  public getTextHistory(): TextHistoryManager {
    return this.textHistory;
  }

  /**
   * 获取日志管理器
   */
  public getLogger(): AssertionLogger {
    return this.logger;
  }

  /**
   * 获取统计信息
   */
  public getStats(): AssertionStats {
    return { ...this.stats };
  }

  /**
   * 重置统计信息
   */
  public resetStats(): void {
    this.stats = {
      totalVerifications: 0,
      successfulVerifications: 0,
      failedVerifications: 0,
      averageDuration: 0,
      cacheHitRate: 0,
      strategyUsage: {}
    };
  }

  /**
   * 更新配置
   * 
   * @param config - 新的配置
   */
  public updateConfig(config: Partial<AssertionServiceConfig>): void {
    this.config = { ...this.config, ...config };
    
    // 更新文本历史配置
    if (config.textMatch) {
      this.textHistory.updateConfig({
        maxSize: config.textMatch.historyMaxSize,
        enabled: config.textMatch.historyEnabled
      });
    }
  }

  /**
   * 获取当前配置
   */
  public getConfig(): AssertionServiceConfig {
    return { ...this.config };
  }

  /**
   * 验证断言对象的有效性
   */
  private validateAssertion(assertion: Assertion): void {
    if (!assertion) {
      throw new AssertionError(
        AssertionErrorType.INVALID_ASSERTION,
        '断言对象不能为空',
        assertion,
        ['请提供有效的断言对象']
      );
    }
    
    if (!assertion.id) {
      throw new AssertionError(
        AssertionErrorType.INVALID_ASSERTION,
        '断言必须包含 id 字段',
        assertion,
        ['请为断言添加唯一的 id']
      );
    }
    
    if (!assertion.description) {
      throw new AssertionError(
        AssertionErrorType.INVALID_ASSERTION,
        '断言必须包含 description 字段',
        assertion,
        ['请为断言添加描述信息']
      );
    }
  }

  /**
   * 识别断言类型
   * 
   * 根据断言的描述、关键词等信息自动识别断言类型
   */
  private identifyAssertionType(assertion: Assertion): AssertionType {
    const description = assertion.description.toLowerCase();
    
    // 文件下载断言（优先级高于模糊描述）
    if (description.includes('文件下载') || description.includes('下载成功') || 
        description.includes('下载文件') || description.includes('文件保存') ||
        description.includes('保存到本地') || description.includes('保存文件') ||
        description.includes('导出文件') || description.includes('文件导出')) {
      return AssertionType.FILE_DOWNLOAD;
    }
    
    // 弹窗/提示断言
    if (description.includes('弹窗') || description.includes('提示') || 
        description.includes('对话框') || description.includes('alert') ||
        description.includes('toast') || description.includes('notification')) {
      return AssertionType.POPUP;
    }
    
    // 🔥 模糊描述检查（放在具体类型之后）
    // 对于 "正常操作"、"成功" 等模糊描述，使用页面状态验证
    const fuzzyKeywords = ['正常操作', '正常', '成功', '操作成功', '完成', '操作完成', 'ok', 'success'];
    if (fuzzyKeywords.some(keyword => description === keyword || 
        (description.includes(keyword) && !description.includes('下载') && !description.includes('弹窗')))) {
      return AssertionType.PAGE_STATE;
    }
    
    // 弹窗/提示断言
    if (description.includes('弹窗') || description.includes('提示') || 
        description.includes('对话框') || description.includes('alert') ||
        description.includes('toast') || description.includes('notification')) {
      return AssertionType.POPUP;
    }
    
    // 元素状态断言
    if (description.includes('启用') || description.includes('禁用') ||
        description.includes('选中') || description.includes('可编辑') ||
        description.includes('enabled') || description.includes('disabled') ||
        description.includes('checked')) {
      return AssertionType.ELEMENT_STATE;
    }
    
    // 页面状态断言
    if (description.includes('url') || description.includes('标题') ||
        description.includes('加载完成') || description.includes('title')) {
      return AssertionType.PAGE_STATE;
    }
    
    // 文本内容断言（有 value 值）
    if (assertion.value !== undefined && assertion.value !== null) {
      return AssertionType.TEXT_CONTENT;
    }
    
    // 元素可见性断言（有 selector 或 ref）
    if (assertion.selector || assertion.ref) {
      return AssertionType.ELEMENT_VISIBILITY;
    }
    
    // 默认为文本内容断言
    return AssertionType.TEXT_CONTENT;
  }

  /**
   * 记录日志
   */
  private log(
    message: string,
    level: 'debug' | 'info' | 'success' | 'warning' | 'error' = 'info',
    context?: VerificationContext
  ): void {
    // 检查日志级别
    if (!this.config.logging.enabled) {
      return;
    }
    
    // 🔥 修复：只记录到内部日志，不重复输出到 console
    // 内部日志会通过 AssertionLogger 输出到 console
    this.logger.log(message, level as any, { runId: context?.runId || 'default' });
    
    // 🔥 修复：只在有外部回调时才调用，避免重复
    // 优先使用 context.logCallback（来自 playwrightTestRunner）
    // 如果没有，则使用全局配置的 callback
    if (context?.logCallback) {
      const mappedLevel = level === 'debug' ? 'info' : level;
      context.logCallback(message, mappedLevel as any);
    } else if (this.config.logging.callback) {
      this.config.logging.callback(message, level);
    }
  }

  /**
   * 更新统计信息
   */
  private updateStats(strategyName: string, success: boolean, duration: number): void {
    this.stats.totalVerifications++;
    
    if (success) {
      this.stats.successfulVerifications++;
    } else {
      this.stats.failedVerifications++;
    }
    
    // 更新平均耗时
    const totalDuration = this.stats.averageDuration * (this.stats.totalVerifications - 1) + duration;
    this.stats.averageDuration = totalDuration / this.stats.totalVerifications;
    
    // 更新策略使用统计
    if (!this.stats.strategyUsage[strategyName]) {
      this.stats.strategyUsage[strategyName] = 0;
    }
    this.stats.strategyUsage[strategyName]++;
  }
}
