import type { Assertion, AssertionResult, LogEntry, LoggerConfig } from './types.js';

/**
 * 断言日志记录器
 * 负责记录断言验证过程的详细日志
 */
export class AssertionLogger {
  private static instance: AssertionLogger;
  private logCallback?: (message: string, level: 'info' | 'success' | 'warning' | 'error') => void;
  private logs: LogEntry[] = [];
  private config: LoggerConfig;
  
  private constructor(
    logCallback?: (message: string, level: 'info' | 'success' | 'warning' | 'error') => void,
    config?: Partial<LoggerConfig>
  ) {
    this.logCallback = logCallback;
    this.config = {
      enabled: config?.enabled ?? true,
      level: config?.level ?? 'info',
      maxLogs: config?.maxLogs ?? 1000
    };
  }
  
  /**
   * 获取单例实例
   */
  public static getInstance(
    logCallback?: (message: string, level: 'info' | 'success' | 'warning' | 'error') => void,
    config?: Partial<LoggerConfig>
  ): AssertionLogger {
    if (!AssertionLogger.instance) {
      AssertionLogger.instance = new AssertionLogger(logCallback, config);
    }
    return AssertionLogger.instance;
  }
  
  /**
   * 重置单例实例（主要用于测试）
   */
  public static resetInstance(): void {
    AssertionLogger.instance = null as any;
  }
  
  /**
   * 记录日志
   * @param message 日志消息
   * @param level 日志级别
   * @param metadata 可选的元数据（包含 runId）
   */
  public log(
    message: string, 
    level: 'info' | 'success' | 'warning' | 'error',
    metadata?: Record<string, any>
  ): void {
    if (!this.config.enabled) {
      return;
    }
    
    // 检查日志级别
    if (!this.shouldLog(level)) {
      return;
    }
    
    // 创建日志条目
    const entry: LogEntry = {
      timestamp: new Date(),
      runId: metadata?.runId || 'default',
      message,
      level
    };
    
    // 添加到日志列表
    this.logs.push(entry);
    
    // 限制日志数量
    if (this.logs.length > this.config.maxLogs) {
      this.logs.shift(); // 移除最旧的日志
    }
    
    // 🔥 修复：只输出到控制台，不触发回调
    // 回调由 AssertionService 统一管理，避免重复
    this.logToConsole(entry.runId, message, level);
    
    // 🔥 注释掉回调触发，由 AssertionService 统一处理
    // if (this.logCallback) {
    //   this.logCallback(message, level);
    // }
  }
  
  /**
   * 记录验证开始
   * @param runId 运行ID
   * @param assertion 断言对象
   */
  public logVerificationStart(runId: string, assertion: Assertion): void {
    const message = `🔍 开始验证断言: ${assertion.description}`;
    this.log(message, 'info', { runId });
    
    // 记录断言详情
    if (assertion.type) {
      this.log(`   类型: ${assertion.type}`, 'info', { runId });
    }
    if (assertion.selector) {
      this.log(`   选择器: ${assertion.selector}`, 'info', { runId });
    }
    if (assertion.value !== undefined) {
      this.log(`   期望值: ${JSON.stringify(assertion.value)}`, 'info', { runId });
    }
  }
  
  /**
   * 记录验证结果
   * @param runId 运行ID
   * @param result 验证结果
   */
  public logVerificationResult(runId: string, result: AssertionResult): void {
    if (result.success) {
      let message = `✅ 断言验证成功`;
      if (result.matchType) {
        message += ` (${result.matchType})`;
      }
      this.log(message, 'success', { runId });
      
      // 记录警告信息
      if (result.warnings && result.warnings.length > 0) {
        result.warnings.forEach(warning => {
          this.log(`⚠️ ${warning}`, 'warning', { runId });
        });
      }
    } else {
      this.log(`❌ 断言验证失败: ${result.error}`, 'error', { runId });
      
      // 记录调试建议
      if (result.suggestions && result.suggestions.length > 0) {
        result.suggestions.forEach(suggestion => {
          this.log(`💡 ${suggestion}`, 'info', { runId });
        });
      }
    }
    
    // 记录耗时
    if (result.duration !== undefined) {
      this.log(`⏱️ 验证耗时: ${result.duration}ms`, 'info', { runId });
    }
  }
  
  /**
   * 获取所有日志
   * @returns 日志列表
   */
  public getLogs(): LogEntry[] {
    return [...this.logs];
  }
  
  /**
   * 获取指定运行ID的日志
   * @param runId 运行ID
   * @returns 日志列表
   */
  public getLogsByRunId(runId: string): LogEntry[] {
    return this.logs.filter(log => log.runId === runId);
  }
  
  /**
   * 清空日志
   */
  public clearLogs(): void {
    this.logs = [];
  }
  
  /**
   * 设置日志回调
   * @param callback 日志回调函数
   */
  public setLogCallback(callback: (message: string, level: 'info' | 'success' | 'warning' | 'error') => void): void {
    this.logCallback = callback;
  }
  
  /**
   * 更新配置
   * @param config 新配置
   */
  public updateConfig(config: Partial<LoggerConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }
  
  /**
   * 获取当前配置
   * @returns 配置对象
   */
  public getConfig(): LoggerConfig {
    return { ...this.config };
  }
  
  /**
   * 判断是否应该记录该级别的日志
   * @param level 日志级别
   * @returns 是否应该记录
   */
  private shouldLog(level: 'info' | 'success' | 'warning' | 'error'): boolean {
    const levelPriority: Record<string, number> = {
      'debug': 0,
      'info': 1,
      'warning': 2,
      'error': 3
    };
    
    // success 视为 info 级别
    const currentLevel = level === 'success' ? 'info' : level;
    
    return levelPriority[currentLevel] >= levelPriority[this.config.level];
  }
  
  /**
   * 输出日志到控制台
   * @param runId 运行ID
   * @param message 日志消息
   * @param level 日志级别
   */
  private logToConsole(runId: string, message: string, level: 'info' | 'success' | 'warning' | 'error'): void {
    const prefix = `[${runId}]`;
    
    switch (level) {
      case 'info':
      case 'success':
        console.log(`${prefix} ${message}`);
        break;
      case 'warning':
        console.warn(`${prefix} ${message}`);
        break;
      case 'error':
        console.error(`${prefix} ${message}`);
        break;
    }
  }
}
