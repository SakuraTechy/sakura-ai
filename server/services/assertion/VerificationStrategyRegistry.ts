import type { Assertion, VerificationStrategy } from './types.js';
import { AssertionType } from './types.js';

/**
 * 验证策略注册表
 * 负责管理和选择验证策略
 */
export class VerificationStrategyRegistry {
  private static instance: VerificationStrategyRegistry;
  private strategies: VerificationStrategy[] = [];
  private strategyMap: Map<AssertionType, VerificationStrategy> = new Map();
  
  private constructor() {}
  
  /**
   * 获取单例实例
   */
  public static getInstance(): VerificationStrategyRegistry {
    if (!VerificationStrategyRegistry.instance) {
      VerificationStrategyRegistry.instance = new VerificationStrategyRegistry();
    }
    return VerificationStrategyRegistry.instance;
  }
  
  /**
   * 重置单例实例（主要用于测试）
   */
  public static resetInstance(): void {
    VerificationStrategyRegistry.instance = null as any;
  }
  
  /**
   * 注册验证策略（通过类型）
   * @param type 断言类型
   * @param strategy 验证策略
   */
  public register(type: AssertionType, strategy: VerificationStrategy): void;
  /**
   * 注册验证策略（直接注册）
   * @param strategy 验证策略
   */
  public register(strategy: VerificationStrategy): void;
  public register(typeOrStrategy: AssertionType | VerificationStrategy, strategy?: VerificationStrategy): void {
    // 处理重载
    if (typeof typeOrStrategy === 'string' && strategy) {
      // register(type, strategy) 形式
      this.strategyMap.set(typeOrStrategy, strategy);
      
      // 同时添加到策略列表
      const existingIndex = this.strategies.findIndex(s => s.name === strategy.name);
      if (existingIndex >= 0) {
        this.strategies[existingIndex] = strategy;
      } else {
        this.strategies.push(strategy);
      }
      
      console.log(`✅ 注册验证策略: ${typeOrStrategy} -> ${strategy.name} (优先级: ${strategy.priority})`);
    } else if (typeof typeOrStrategy === 'object') {
      // register(strategy) 形式
      const strat = typeOrStrategy as VerificationStrategy;
      const existingIndex = this.strategies.findIndex(s => s.name === strat.name);
      
      if (existingIndex >= 0) {
        console.log(`⚠️ 策略 "${strat.name}" 已存在，将被替换`);
        this.strategies[existingIndex] = strat;
      } else {
        this.strategies.push(strat);
        console.log(`✅ 注册验证策略: ${strat.name} (优先级: ${strat.priority})`);
      }
    }
    
    // 按优先级排序（数字越小优先级越高）
    this.strategies.sort((a, b) => a.priority - b.priority);
  }
  
  /**
   * 根据类型获取策略
   * @param type 断言类型
   * @returns 验证策略，如果找不到则返回null
   */
  public getStrategy(type: AssertionType): VerificationStrategy | null {
    return this.strategyMap.get(type) || null;
  }
  
  /**
   * 获取已注册的断言类型列表
   * @returns 断言类型数组
   */
  public getRegisteredTypes(): AssertionType[] {
    return Array.from(this.strategyMap.keys());
  }
  
  /**
   * 选择合适的验证策略
   * @param assertion 断言对象
   * @returns 验证策略，如果找不到则返回null
   */
  public selectStrategy(assertion: Assertion): VerificationStrategy | null {
    // 按优先级顺序查找第一个可以处理该断言的策略
    for (const strategy of this.strategies) {
      if (strategy.canHandle(assertion)) {
        return strategy;
      }
    }
    
    return null;
  }
  
  /**
   * 获取所有已注册的策略
   * @returns 策略列表（按优先级排序）
   */
  public getAllStrategies(): VerificationStrategy[] {
    return [...this.strategies];
  }
  
  /**
   * 根据名称获取策略
   * @param name 策略名称
   * @returns 策略，如果找不到则返回undefined
   */
  public getStrategyByName(name: string): VerificationStrategy | undefined {
    return this.strategies.find(s => s.name === name);
  }
  
  /**
   * 取消注册策略
   * @param name 策略名称
   * @returns 是否成功取消注册
   */
  public unregister(name: string): boolean {
    const index = this.strategies.findIndex(s => s.name === name);
    
    if (index >= 0) {
      this.strategies.splice(index, 1);
      console.log(`✅ 取消注册验证策略: ${name}`);
      return true;
    }
    
    return false;
  }
  
  /**
   * 清空所有策略
   */
  public clear(): void {
    this.strategies = [];
    console.log(`🗑️ 清空所有验证策略`);
  }
  
  /**
   * 获取策略数量
   * @returns 策略数量
   */
  public getStrategyCount(): number {
    return this.strategies.length;
  }
}
