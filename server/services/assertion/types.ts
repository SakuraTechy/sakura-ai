import type { Page } from 'playwright';

/**
 * 断言类型枚举
 */
export enum AssertionType {
  FILE_DOWNLOAD = 'file_download',
  POPUP = 'popup',
  ELEMENT_VISIBILITY = 'element_visibility',
  TEXT_CONTENT = 'text_content',
  ELEMENT_STATE = 'element_state',
  ELEMENT_ATTRIBUTE = 'element_attribute',
  PAGE_STATE = 'page_state'
}

/**
 * 断言对象
 */
export interface Assertion {
  id: string;
  description: string;
  type?: AssertionType;  // 可选，如果不提供则自动识别
  selector?: string;
  ref?: string;
  value?: any;
  expectedValue?: any;  // 期望值
  condition?: string;
  timeout?: number;
  matchMode?: 'strict' | 'auto' | 'loose';
  metadata?: Record<string, any>;
}

/**
 * 验证上下文
 */
export interface VerificationContext {
  page: Page;  // Playwright Page 对象
  runId: string;
  artifactsDir: string;
  logCallback?: (message: string, level: 'info' | 'success' | 'warning' | 'error') => void;
  textHistory?: Set<string>;  // 可选的文本历史记录
}

/**
 * 验证结果
 */
export interface AssertionResult {
  success: boolean;
  assertionType: string;
  matchType?: string;
  actualValue?: any;
  expectedValue?: any;
  error?: string;
  warnings?: string[];
  suggestions?: string[];
  duration?: number;
  metadata?: Record<string, any>;
}

/**
 * 验证策略接口
 * 所有验证策略必须实现此接口
 */
export interface VerificationStrategy {
  /**
   * 策略名称
   */
  readonly name: string;
  
  /**
   * 策略优先级（数字越小优先级越高）
   */
  readonly priority: number;
  
  /**
   * 判断是否可以处理该断言
   * @param assertion 断言对象
   * @returns 是否可以处理
   */
  canHandle(assertion: Assertion): boolean;
  
  /**
   * 执行验证
   * @param assertion 断言对象
   * @param context 验证上下文
   * @returns 验证结果
   */
  verify(assertion: Assertion, context: VerificationContext): Promise<AssertionResult>;
}

/**
 * 断言服务配置
 */
export interface AssertionServiceConfig {
  // 文件下载配置
  fileDownload: {
    maxAge: number;  // 文件最大年龄（毫秒），默认30000
    excludePatterns: string[];  // 排除的文件模式
  };
  
  // 文本匹配配置
  textMatch: {
    defaultMode: 'strict' | 'auto' | 'loose';  // 默认匹配模式
    historyEnabled: boolean;  // 是否启用文本历史记录
    historyMaxSize: number;  // 文本历史记录最大数量
  };
  
  // 元素定位配置
  elementLocate: {
    defaultTimeout: number;  // 默认超时时间（毫秒）
    retryInterval: number;  // 重试间隔（毫秒）
    maxRetries: number;  // 最大重试次数
  };
  
  // 弹窗检测配置
  popup: {
    quickTimeout: number;  // 快速检测超时（毫秒）
    historyCheckFirst: boolean;  // 是否优先检查历史记录
  };
  
  // 日志配置
  logging: {
    enabled: boolean;  // 是否启用日志
    level: 'debug' | 'info' | 'warning' | 'error';  // 日志级别
    callback?: (message: string, level: string) => void;  // 日志回调
  };
}

/**
 * 文本历史记录配置
 */
export interface TextHistoryConfig {
  enabled: boolean;
  maxSize: number;
  scanInterval: number;  // 扫描间隔（毫秒）
  maxTextLength: number;  // 单条文本最大长度
}

/**
 * 日志条目
 */
export interface LogEntry {
  timestamp: Date;
  runId: string;
  message: string;
  level: 'info' | 'success' | 'warning' | 'error';
}

/**
 * 日志配置
 */
export interface LoggerConfig {
  enabled: boolean;
  level: 'debug' | 'info' | 'warning' | 'error';
  maxLogs: number;
}

/**
 * 断言错误类型
 */
export enum AssertionErrorType {
  INVALID_ASSERTION = 'invalid_assertion',  // 无效的断言对象
  NO_STRATEGY_FOUND = 'no_strategy_found',  // 找不到合适的验证策略
  VERIFICATION_FAILED = 'verification_failed',  // 验证失败
  TIMEOUT = 'timeout',  // 超时
  ELEMENT_NOT_FOUND = 'element_not_found',  // 元素未找到
  FILE_NOT_FOUND = 'file_not_found',  // 文件未找到
  TEXT_NOT_FOUND = 'text_not_found',  // 文本未找到
  UNEXPECTED_ERROR = 'unexpected_error'  // 意外错误
}

/**
 * 断言错误类
 */
export class AssertionError extends Error {
  public readonly type: AssertionErrorType;
  public readonly assertion: Assertion;
  public readonly suggestions: string[];
  
  constructor(
    type: AssertionErrorType,
    message: string,
    assertion: Assertion,
    suggestions: string[] = []
  ) {
    super(message);
    this.name = 'AssertionError';
    this.type = type;
    this.assertion = assertion;
    this.suggestions = suggestions;
    
    // 维护正确的原型链
    Object.setPrototypeOf(this, AssertionError.prototype);
  }
}

/**
 * 断言统计信息
 */
export interface AssertionStats {
  totalVerifications: number;
  successfulVerifications: number;
  failedVerifications: number;
  averageDuration: number;
  cacheHitRate: number;
  strategyUsage: Record<string, number>;
}
