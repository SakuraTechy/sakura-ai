import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AssertionService } from '../AssertionService';
import { VerificationStrategyRegistry } from '../VerificationStrategyRegistry';
import type {
  Assertion,
  VerificationContext,
  AssertionResult,
  VerificationStrategy
} from '../types';
import { AssertionType } from '../types';

// Mock Playwright Page
const mockPage = {
  goto: jest.fn(),
  waitForSelector: jest.fn(),
  textContent: jest.fn()
} as any;

// Mock 验证策略
class MockVerificationStrategy implements VerificationStrategy {
  readonly name: string;
  readonly priority: number;
  private shouldSucceed: boolean;

  constructor(name: string, priority: number = 10, shouldSucceed: boolean = true) {
    this.name = name;
    this.priority = priority;
    this.shouldSucceed = shouldSucceed;
  }

  canHandle(assertion: Assertion): boolean {
    return true;
  }

  async verify(assertion: Assertion, context: VerificationContext): Promise<AssertionResult> {
    // 添加小延迟以确保有可测量的耗时
    await new Promise(resolve => setTimeout(resolve, 1));
    
    return {
      success: this.shouldSucceed,
      assertionType: assertion.type || 'unknown',
      matchType: 'exact',
      actualValue: 'mock value',
      expectedValue: assertion.value
    };
  }
}

describe('AssertionService Unit Tests', () => {
  let service: AssertionService;
  let registry: VerificationStrategyRegistry;
  let mockContext: VerificationContext;

  beforeEach(() => {
    // 重置单例
    AssertionService.resetInstance();
    VerificationStrategyRegistry.resetInstance();

    // 创建服务实例
    service = AssertionService.getInstance();
    registry = VerificationStrategyRegistry.getInstance();

    // 创建 mock 上下文
    mockContext = {
      page: mockPage,
      runId: 'test-run-123',
      artifactsDir: '/tmp/artifacts',
      logCallback: jest.fn()
    };
  });

  afterEach(() => {
    AssertionService.resetInstance();
    VerificationStrategyRegistry.resetInstance();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = AssertionService.getInstance();
      const instance2 = AssertionService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = AssertionService.getInstance();
      AssertionService.resetInstance();
      const instance2 = AssertionService.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('Assertion Validation', () => {
    it('should reject null assertion', async () => {
      const result = await service.verify(null as any, mockContext);
      expect(result.success).toBe(false);
      expect(result.error).toContain('断言对象不能为空');
    });

    it('should reject assertion without id', async () => {
      const assertion: Assertion = {
        id: '',
        description: 'Test assertion'
      };
      const result = await service.verify(assertion, mockContext);
      expect(result.success).toBe(false);
      expect(result.error).toContain('id');
    });

    it('should reject assertion without description', async () => {
      const assertion: Assertion = {
        id: 'test-1',
        description: ''
      };
      const result = await service.verify(assertion, mockContext);
      expect(result.success).toBe(false);
      expect(result.error).toContain('description');
    });

    it('should accept valid assertion', async () => {
      // 注册 mock 策略
      const mockStrategy = new MockVerificationStrategy('mock-strategy');
      registry.register(AssertionType.TEXT_CONTENT, mockStrategy);

      const assertion: Assertion = {
        id: 'test-1',
        description: 'Valid assertion',
        type: AssertionType.TEXT_CONTENT
      };

      const result = await service.verify(assertion, mockContext);
      expect(result.success).toBe(true);
    });
  });

  describe('Assertion Type Identification', () => {
    beforeEach(() => {
      // 为每种类型注册 mock 策略
      Object.values(AssertionType).forEach(type => {
        registry.register(type, new MockVerificationStrategy(`mock-${type}`));
      });
    });

    it('should identify file download assertion', async () => {
      const assertion: Assertion = {
        id: 'test-1',
        description: '验证文件下载成功'
      };

      const result = await service.verify(assertion, mockContext);
      expect(result.assertionType).toBe(AssertionType.FILE_DOWNLOAD);
    });

    it('should identify popup assertion', async () => {
      const assertion: Assertion = {
        id: 'test-2',
        description: '验证弹窗显示'
      };

      const result = await service.verify(assertion, mockContext);
      expect(result.assertionType).toBe(AssertionType.POPUP);
    });

    it('should identify element state assertion', async () => {
      const assertion: Assertion = {
        id: 'test-3',
        description: '验证按钮已启用'
      };

      const result = await service.verify(assertion, mockContext);
      expect(result.assertionType).toBe(AssertionType.ELEMENT_STATE);
    });

    it('should identify text content assertion with value', async () => {
      const assertion: Assertion = {
        id: 'test-4',
        description: '验证文本内容',
        value: '期望的文本'
      };

      const result = await service.verify(assertion, mockContext);
      expect(result.assertionType).toBe(AssertionType.TEXT_CONTENT);
    });

    it('should identify element visibility assertion with selector', async () => {
      const assertion: Assertion = {
        id: 'test-5',
        description: '验证元素可见',
        selector: '#test-element'
      };

      const result = await service.verify(assertion, mockContext);
      expect(result.assertionType).toBe(AssertionType.ELEMENT_VISIBILITY);
    });
  });

  describe('Strategy Selection', () => {
    it('should return error when no strategy found', async () => {
      const assertion: Assertion = {
        id: 'test-1',
        description: 'Test assertion',
        type: AssertionType.FILE_DOWNLOAD
      };

      const result = await service.verify(assertion, mockContext);
      expect(result.success).toBe(false);
      expect(result.error).toContain('找不到');
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions!.length).toBeGreaterThan(0);
    });

    it('should use registered strategy', async () => {
      const mockStrategy = new MockVerificationStrategy('test-strategy');
      registry.register(AssertionType.TEXT_CONTENT, mockStrategy);

      const assertion: Assertion = {
        id: 'test-1',
        description: 'Test assertion',
        type: AssertionType.TEXT_CONTENT
      };

      const result = await service.verify(assertion, mockContext);
      expect(result.success).toBe(true);
      expect(result.assertionType).toBe(AssertionType.TEXT_CONTENT);
    });
  });

  describe('Verification Results', () => {
    beforeEach(() => {
      const mockStrategy = new MockVerificationStrategy('test-strategy', 10, true);
      registry.register(AssertionType.TEXT_CONTENT, mockStrategy);
    });

    it('should include duration in result', async () => {
      const assertion: Assertion = {
        id: 'test-1',
        description: 'Test assertion',
        type: AssertionType.TEXT_CONTENT
      };

      const result = await service.verify(assertion, mockContext);
      expect(result.duration).toBeDefined();
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should call log callback on success', async () => {
      const assertion: Assertion = {
        id: 'test-1',
        description: 'Test assertion',
        type: AssertionType.TEXT_CONTENT
      };

      await service.verify(assertion, mockContext);
      expect(mockContext.logCallback).toHaveBeenCalled();
    });

    it('should handle verification failure', async () => {
      // 注册会失败的策略
      const failStrategy = new MockVerificationStrategy('fail-strategy', 10, false);
      registry.register(AssertionType.TEXT_CONTENT, failStrategy);

      const assertion: Assertion = {
        id: 'test-1',
        description: 'Test assertion',
        type: AssertionType.TEXT_CONTENT
      };

      const result = await service.verify(assertion, mockContext);
      expect(result.success).toBe(false);
    });
  });

  describe('Batch Verification', () => {
    beforeEach(() => {
      const mockStrategy = new MockVerificationStrategy('test-strategy');
      registry.register(AssertionType.TEXT_CONTENT, mockStrategy);
    });

    it('should verify multiple assertions', async () => {
      const assertions: Assertion[] = [
        { id: 'test-1', description: 'Assertion 1', type: AssertionType.TEXT_CONTENT },
        { id: 'test-2', description: 'Assertion 2', type: AssertionType.TEXT_CONTENT },
        { id: 'test-3', description: 'Assertion 3', type: AssertionType.TEXT_CONTENT }
      ];

      const results = await service.verifyBatch(assertions, mockContext);
      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('should handle empty assertion array', async () => {
      const results = await service.verifyBatch([], mockContext);
      expect(results).toHaveLength(0);
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      const mockStrategy = new MockVerificationStrategy('test-strategy');
      registry.register(AssertionType.TEXT_CONTENT, mockStrategy);
      service.resetStats();
    });

    it('should track successful verifications', async () => {
      const assertion: Assertion = {
        id: 'test-1',
        description: 'Test assertion',
        type: AssertionType.TEXT_CONTENT
      };

      await service.verify(assertion, mockContext);
      
      const stats = service.getStats();
      expect(stats.totalVerifications).toBe(1);
      expect(stats.successfulVerifications).toBe(1);
      expect(stats.failedVerifications).toBe(0);
    });

    it('should track failed verifications', async () => {
      const failStrategy = new MockVerificationStrategy('fail-strategy', 10, false);
      registry.register(AssertionType.TEXT_CONTENT, failStrategy);

      const assertion: Assertion = {
        id: 'test-1',
        description: 'Test assertion',
        type: AssertionType.TEXT_CONTENT
      };

      await service.verify(assertion, mockContext);
      
      const stats = service.getStats();
      expect(stats.totalVerifications).toBe(1);
      expect(stats.successfulVerifications).toBe(0);
      expect(stats.failedVerifications).toBe(1);
    });

    it('should track strategy usage', async () => {
      const assertion: Assertion = {
        id: 'test-1',
        description: 'Test assertion',
        type: AssertionType.TEXT_CONTENT
      };

      await service.verify(assertion, mockContext);
      
      const stats = service.getStats();
      expect(stats.strategyUsage['test-strategy']).toBe(1);
    });

    it('should calculate average duration', async () => {
      const assertions: Assertion[] = [
        { id: 'test-1', description: 'Assertion 1', type: AssertionType.TEXT_CONTENT },
        { id: 'test-2', description: 'Assertion 2', type: AssertionType.TEXT_CONTENT }
      ];

      await service.verifyBatch(assertions, mockContext);
      
      const stats = service.getStats();
      expect(stats.averageDuration).toBeGreaterThan(0);
    });

    it('should reset statistics', async () => {
      const assertion: Assertion = {
        id: 'test-1',
        description: 'Test assertion',
        type: AssertionType.TEXT_CONTENT
      };

      await service.verify(assertion, mockContext);
      service.resetStats();
      
      const stats = service.getStats();
      expect(stats.totalVerifications).toBe(0);
      expect(stats.successfulVerifications).toBe(0);
      expect(stats.failedVerifications).toBe(0);
    });
  });

  describe('Configuration', () => {
    it('should use default configuration', () => {
      const config = service.getConfig();
      expect(config.fileDownload.maxAge).toBe(30000);
      expect(config.textMatch.defaultMode).toBe('auto');
      expect(config.elementLocate.defaultTimeout).toBe(5000);
    });

    it('should update configuration', () => {
      service.updateConfig({
        fileDownload: {
          maxAge: 60000,
          excludePatterns: ['*.tmp']
        }
      });

      const config = service.getConfig();
      expect(config.fileDownload.maxAge).toBe(60000);
    });

    it('should get text history manager', () => {
      const textHistory = service.getTextHistory();
      expect(textHistory).toBeDefined();
    });

    it('should get logger', () => {
      const logger = service.getLogger();
      expect(logger).toBeDefined();
    });
  });

  describe('Strategy Registration', () => {
    it('should register new strategy', () => {
      const newStrategy = new MockVerificationStrategy('new-strategy');
      service.registerStrategy(AssertionType.ELEMENT_ATTRIBUTE, newStrategy);

      const registeredStrategy = registry.getStrategy(AssertionType.ELEMENT_ATTRIBUTE);
      expect(registeredStrategy).toBe(newStrategy);
    });
  });
});
