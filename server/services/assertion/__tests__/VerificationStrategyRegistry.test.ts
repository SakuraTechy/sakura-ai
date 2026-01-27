import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fc from 'fast-check';
import { VerificationStrategyRegistry } from '../VerificationStrategyRegistry';
import type { Assertion, VerificationStrategy, VerificationContext, AssertionResult } from '../types';

// 创建模拟策略的工厂函数
function createMockStrategy(
  name: string,
  priority: number,
  canHandleFn: (assertion: Assertion) => boolean
): VerificationStrategy {
  return {
    name,
    priority,
    canHandle: canHandleFn,
    verify: async (assertion: Assertion, context: VerificationContext): Promise<AssertionResult> => {
      return {
        success: true,
        assertionType: name
      };
    }
  };
}

describe('VerificationStrategyRegistry', () => {
  let registry: VerificationStrategyRegistry;
  
  beforeEach(() => {
    VerificationStrategyRegistry.resetInstance();
    registry = VerificationStrategyRegistry.getInstance();
  });
  
  afterEach(() => {
    VerificationStrategyRegistry.resetInstance();
  });
  
  describe('Basic functionality', () => {
    test('should register and retrieve strategies', () => {
      const strategy = createMockStrategy('test-strategy', 1, () => true);
      
      registry.register(strategy);
      
      expect(registry.getStrategyCount()).toBe(1);
      expect(registry.getStrategyByName('test-strategy')).toBe(strategy);
    });
    
    test('should sort strategies by priority', () => {
      const strategy1 = createMockStrategy('strategy-1', 3, () => true);
      const strategy2 = createMockStrategy('strategy-2', 1, () => true);
      const strategy3 = createMockStrategy('strategy-3', 2, () => true);
      
      registry.register(strategy1);
      registry.register(strategy2);
      registry.register(strategy3);
      
      const strategies = registry.getAllStrategies();
      expect(strategies[0].name).toBe('strategy-2'); // priority 1
      expect(strategies[1].name).toBe('strategy-3'); // priority 2
      expect(strategies[2].name).toBe('strategy-1'); // priority 3
    });
    
    test('should replace existing strategy with same name', () => {
      const strategy1 = createMockStrategy('test-strategy', 1, () => true);
      const strategy2 = createMockStrategy('test-strategy', 2, () => false);
      
      registry.register(strategy1);
      registry.register(strategy2);
      
      expect(registry.getStrategyCount()).toBe(1);
      expect(registry.getStrategyByName('test-strategy')?.priority).toBe(2);
    });
    
    test('should unregister strategy', () => {
      const strategy = createMockStrategy('test-strategy', 1, () => true);
      
      registry.register(strategy);
      expect(registry.getStrategyCount()).toBe(1);
      
      const result = registry.unregister('test-strategy');
      expect(result).toBe(true);
      expect(registry.getStrategyCount()).toBe(0);
    });
    
    test('should return false when unregistering non-existent strategy', () => {
      const result = registry.unregister('non-existent');
      expect(result).toBe(false);
    });
    
    test('should clear all strategies', () => {
      registry.register(createMockStrategy('strategy-1', 1, () => true));
      registry.register(createMockStrategy('strategy-2', 2, () => true));
      
      expect(registry.getStrategyCount()).toBe(2);
      
      registry.clear();
      expect(registry.getStrategyCount()).toBe(0);
    });
  });
  
  describe('Strategy selection', () => {
    test('should select first matching strategy', () => {
      const strategy1 = createMockStrategy('strategy-1', 1, (a) => a.description.includes('test1'));
      const strategy2 = createMockStrategy('strategy-2', 2, (a) => a.description.includes('test'));
      
      registry.register(strategy1);
      registry.register(strategy2);
      
      const assertion: Assertion = {
        id: 'test',
        description: 'test assertion'
      };
      
      const selected = registry.selectStrategy(assertion);
      expect(selected?.name).toBe('strategy-2');
    });
    
    test('should return null when no strategy matches', () => {
      const strategy = createMockStrategy('strategy-1', 1, () => false);
      
      registry.register(strategy);
      
      const assertion: Assertion = {
        id: 'test',
        description: 'test assertion'
      };
      
      const selected = registry.selectStrategy(assertion);
      expect(selected).toBeNull();
    });
    
    test('should respect priority order', () => {
      const strategy1 = createMockStrategy('low-priority', 10, () => true);
      const strategy2 = createMockStrategy('high-priority', 1, () => true);
      
      registry.register(strategy1);
      registry.register(strategy2);
      
      const assertion: Assertion = {
        id: 'test',
        description: 'test assertion'
      };
      
      const selected = registry.selectStrategy(assertion);
      expect(selected?.name).toBe('high-priority');
    });
  });
  
  describe('Property 1: 断言类型识别的确定性', () => {
    // Feature: assertion-service, Property 1: 断言类型识别的确定性
    test('对于相同的断言，应该始终选择相同的策略', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            description: fc.string(),
            selector: fc.option(fc.string()),
            value: fc.option(fc.anything())
          }),
          async (assertionData) => {
            // 创建测试策略
            const strategy1 = createMockStrategy('strategy-1', 1, (a) => a.description.length > 5);
            const strategy2 = createMockStrategy('strategy-2', 2, (a) => a.description.length > 0);
            
            registry.register(strategy1);
            registry.register(strategy2);
            
            const assertion: Assertion = {
              id: 'test',
              ...assertionData
            };
            
            // 多次选择策略，应该得到相同的结果
            const selected1 = registry.selectStrategy(assertion);
            const selected2 = registry.selectStrategy(assertion);
            const selected3 = registry.selectStrategy(assertion);
            
            expect(selected1?.name).toBe(selected2?.name);
            expect(selected2?.name).toBe(selected3?.name);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
  
  describe('Property 2: 验证策略的唯一性', () => {
    // Feature: assertion-service, Property 2: 验证策略的唯一性
    test('对于任何断言，应该只选择一个策略', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            description: fc.string(),
            selector: fc.option(fc.string()),
            value: fc.option(fc.anything())
          }),
          async (assertionData) => {
            // 创建多个可能匹配的策略
            const strategy1 = createMockStrategy('strategy-1', 1, () => true);
            const strategy2 = createMockStrategy('strategy-2', 2, () => true);
            const strategy3 = createMockStrategy('strategy-3', 3, () => true);
            
            registry.register(strategy1);
            registry.register(strategy2);
            registry.register(strategy3);
            
            const assertion: Assertion = {
              id: 'test',
              ...assertionData
            };
            
            const selected = registry.selectStrategy(assertion);
            
            // 应该只选择一个策略（或者null）
            expect(selected === null || typeof selected === 'object').toBe(true);
            
            // 如果选择了策略，应该是优先级最高的那个
            if (selected !== null) {
              expect(selected.name).toBe('strategy-1');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    
    test('选择的策略应该是第一个匹配的策略', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            description: fc.string(),
            matchPattern: fc.string()
          }),
          async ({ description, matchPattern }) => {
            // 创建策略，第一个匹配特定模式，第二个匹配所有
            const strategy1 = createMockStrategy(
              'specific-strategy',
              1,
              (a) => a.description.includes(matchPattern)
            );
            const strategy2 = createMockStrategy(
              'general-strategy',
              2,
              () => true
            );
            
            registry.register(strategy1);
            registry.register(strategy2);
            
            const assertion: Assertion = {
              id: 'test',
              description
            };
            
            const selected = registry.selectStrategy(assertion);
            
            // 如果描述包含匹配模式，应该选择第一个策略
            if (description.includes(matchPattern)) {
              expect(selected?.name).toBe('specific-strategy');
            } else {
              // 否则应该选择第二个策略
              expect(selected?.name).toBe('general-strategy');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
  
  describe('Edge cases', () => {
    test('should handle empty registry', () => {
      const assertion: Assertion = {
        id: 'test',
        description: 'test assertion'
      };
      
      const selected = registry.selectStrategy(assertion);
      expect(selected).toBeNull();
    });
    
    test('should handle strategies with same priority', () => {
      const strategy1 = createMockStrategy('strategy-1', 1, () => true);
      const strategy2 = createMockStrategy('strategy-2', 1, () => true);
      
      registry.register(strategy1);
      registry.register(strategy2);
      
      const assertion: Assertion = {
        id: 'test',
        description: 'test assertion'
      };
      
      const selected = registry.selectStrategy(assertion);
      // 应该选择第一个注册的策略
      expect(selected?.name).toBe('strategy-1');
    });
  });
});
