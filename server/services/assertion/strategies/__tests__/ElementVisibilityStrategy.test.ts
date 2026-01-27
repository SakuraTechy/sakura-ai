import { ElementVisibilityStrategy } from '../ElementVisibilityStrategy';
import type { Assertion, VerificationContext } from '../../types';
import { AssertionType } from '../../types';

describe('ElementVisibilityStrategy', () => {
  let strategy: ElementVisibilityStrategy;
  let mockPage: any;
  let mockContext: VerificationContext;

  beforeEach(() => {
    strategy = new ElementVisibilityStrategy();
    
    // Mock Playwright Page
    mockPage = {
      getByRole: jest.fn(),
      getByText: jest.fn(),
      locator: jest.fn()
    };

    mockContext = {
      page: mockPage,
      runId: 'test-run',
      artifactsDir: '/tmp/artifacts',
      logCallback: jest.fn()
    };
  });

  describe('canHandle', () => {
    it('应该识别明确指定的元素可见性类型', () => {
      const assertion: Assertion = {
        id: 'test-1',
        description: '测试断言',
        type: AssertionType.ELEMENT_VISIBILITY
      };

      expect(strategy.canHandle(assertion)).toBe(true);
    });

    it('应该识别包含"元素"关键词的描述', () => {
      const assertion: Assertion = {
        id: 'test-2',
        description: '验证元素是否显示'
      };

      expect(strategy.canHandle(assertion)).toBe(true);
    });

    it('应该识别包含"可见"关键词的描述', () => {
      const assertion: Assertion = {
        id: 'test-3',
        description: '检查按钮是否可见'
      };

      expect(strategy.canHandle(assertion)).toBe(true);
    });

    it('应该识别包含"显示"关键词的描述', () => {
      const assertion: Assertion = {
        id: 'test-4',
        description: '确认对话框已显示'
      };

      expect(strategy.canHandle(assertion)).toBe(true);
    });

    it('应该识别包含"存在"关键词的描述', () => {
      const assertion: Assertion = {
        id: 'test-5',
        description: '验证元素存在'
      };

      expect(strategy.canHandle(assertion)).toBe(true);
    });

    it('应该识别包含"出现"关键词的描述', () => {
      const assertion: Assertion = {
        id: 'test-6',
        description: '等待提示出现'
      };

      expect(strategy.canHandle(assertion)).toBe(true);
    });

    it('应该识别英文关键词', () => {
      const assertions = [
        { id: '1', description: 'verify element is visible' },
        { id: '2', description: 'check if button appears' },
        { id: '3', description: 'element should exist' }
      ];

      assertions.forEach(assertion => {
        expect(strategy.canHandle(assertion)).toBe(true);
      });
    });

    it('不应该识别不相关的描述', () => {
      const assertion: Assertion = {
        id: 'test-7',
        description: '点击提交按钮'
      };

      expect(strategy.canHandle(assertion)).toBe(false);
    });
  });

  describe('verify - 使用 selector 定位', () => {
    it('应该通过 CSS 选择器找到可见元素', async () => {
      const assertion: Assertion = {
        id: 'test-1',
        description: '验证按钮可见',
        selector: '#submit-button'
      };

      const mockElement = {
        count: jest.fn().mockResolvedValue(1),
        first: jest.fn().mockReturnValue({
          waitFor: jest.fn().mockResolvedValue(undefined),
          isVisible: jest.fn().mockResolvedValue(true)
        })
      };

      mockPage.locator.mockReturnValue(mockElement);

      const result = await strategy.verify(assertion, mockContext);

      expect(result.success).toBe(true);
      expect(result.assertionType).toBe('ElementVisibilityStrategy');
      expect(result.actualValue).toBe('visible');
      expect(mockPage.locator).toHaveBeenCalledWith('#submit-button');
    });

    it('应该通过 role:name 格式找到元素', async () => {
      const assertion: Assertion = {
        id: 'test-2',
        description: '验证按钮可见',
        selector: 'button:提交'
      };

      const mockElement = {
        count: jest.fn().mockResolvedValue(1),
        first: jest.fn().mockReturnValue({
          waitFor: jest.fn().mockResolvedValue(undefined),
          isVisible: jest.fn().mockResolvedValue(true)
        })
      };

      mockPage.getByRole.mockReturnValue(mockElement);

      const result = await strategy.verify(assertion, mockContext);

      expect(result.success).toBe(true);
      expect(mockPage.getByRole).toHaveBeenCalledWith('button', { name: '提交', exact: false });
    });

    it('应该处理元素不存在的情况', async () => {
      const assertion: Assertion = {
        id: 'test-3',
        description: '验证元素可见',
        selector: '#non-existent'
      };

      const mockElement = {
        count: jest.fn().mockResolvedValue(0)
      };

      mockPage.locator.mockReturnValue(mockElement);
      mockPage.getByText.mockReturnValue({ count: jest.fn().mockResolvedValue(0) });

      const result = await strategy.verify(assertion, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('未找到元素');
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions!.length).toBeGreaterThan(0);
    });

    it('应该处理元素存在但不可见的情况', async () => {
      const assertion: Assertion = {
        id: 'test-4',
        description: '验证元素可见',
        selector: '#hidden-element'
      };

      const mockElement = {
        count: jest.fn().mockResolvedValue(1),
        first: jest.fn().mockReturnValue({
          waitFor: jest.fn().mockResolvedValue(undefined),
          isVisible: jest.fn().mockResolvedValue(false)
        })
      };

      mockPage.locator.mockReturnValue(mockElement);

      const result = await strategy.verify(assertion, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('存在但不可见');
      expect(result.actualValue).toBe('hidden');
      expect(result.expectedValue).toBe('visible');
    });

    it('应该处理等待超时的情况', async () => {
      const assertion: Assertion = {
        id: 'test-5',
        description: '验证元素可见',
        selector: '#slow-element',
        timeout: 1000
      };

      const mockElement = {
        count: jest.fn().mockResolvedValue(1),
        first: jest.fn().mockReturnValue({
          waitFor: jest.fn().mockRejectedValue(new Error('Timeout')),
          isVisible: jest.fn()
        })
      };

      mockPage.locator.mockReturnValue(mockElement);

      const result = await strategy.verify(assertion, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('超时');
      expect(result.suggestions).toBeDefined();
    });
  });

  describe('verify - 使用 ref 定位', () => {
    it('应该通过 ref 找到元素', async () => {
      const assertion: Assertion = {
        id: 'test-1',
        description: '验证元素可见',
        ref: '.modal-dialog'
      };

      const mockElement = {
        count: jest.fn().mockResolvedValue(1),
        first: jest.fn().mockReturnValue({
          waitFor: jest.fn().mockResolvedValue(undefined),
          isVisible: jest.fn().mockResolvedValue(true)
        })
      };

      mockPage.locator.mockReturnValue(mockElement);

      const result = await strategy.verify(assertion, mockContext);

      expect(result.success).toBe(true);
      expect(mockPage.locator).toHaveBeenCalledWith('.modal-dialog');
    });

    it('应该通过 ref role:name 格式找到元素', async () => {
      const assertion: Assertion = {
        id: 'test-2',
        description: '验证链接可见',
        ref: 'link:查看详情'
      };

      const mockElement = {
        count: jest.fn().mockResolvedValue(1),
        first: jest.fn().mockReturnValue({
          waitFor: jest.fn().mockResolvedValue(undefined),
          isVisible: jest.fn().mockResolvedValue(true)
        })
      };

      mockPage.getByRole.mockReturnValue(mockElement);

      const result = await strategy.verify(assertion, mockContext);

      expect(result.success).toBe(true);
      expect(mockPage.getByRole).toHaveBeenCalledWith('link', { name: '查看详情', exact: false });
    });
  });

  describe('verify - 使用文本内容定位', () => {
    it('应该通过 value 文本找到元素', async () => {
      const assertion: Assertion = {
        id: 'test-1',
        description: '验证文本可见',
        value: '欢迎使用'
      };

      const mockElement = {
        count: jest.fn().mockResolvedValue(1),
        first: jest.fn().mockReturnValue({
          waitFor: jest.fn().mockResolvedValue(undefined),
          isVisible: jest.fn().mockResolvedValue(true)
        })
      };

      mockPage.getByText.mockReturnValue(mockElement);

      const result = await strategy.verify(assertion, mockContext);

      expect(result.success).toBe(true);
      expect(mockPage.getByText).toHaveBeenCalledWith('欢迎使用', { exact: false });
    });

    it('应该从描述中提取文本进行定位', async () => {
      const assertion: Assertion = {
        id: 'test-2',
        description: '验证"操作成功"提示可见'
      };

      const mockElement = {
        count: jest.fn().mockResolvedValue(1),
        first: jest.fn().mockReturnValue({
          waitFor: jest.fn().mockResolvedValue(undefined),
          isVisible: jest.fn().mockResolvedValue(true)
        })
      };

      mockPage.getByText.mockReturnValue(mockElement);

      const result = await strategy.verify(assertion, mockContext);

      expect(result.success).toBe(true);
      expect(mockPage.getByText).toHaveBeenCalledWith('操作成功', { exact: false });
    });
  });

  describe('verify - 无法定位元素', () => {
    it('应该返回未找到元素的错误', async () => {
      const assertion: Assertion = {
        id: 'test-1',
        description: '验证元素可见'
        // 没有提供任何定位信息
      };

      const result = await strategy.verify(assertion, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('未找到元素');
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions!.length).toBeGreaterThan(0);
    });
  });

  describe('verify - 自定义超时', () => {
    it('应该使用自定义超时时间', async () => {
      const assertion: Assertion = {
        id: 'test-1',
        description: '验证元素可见',
        selector: '#element',
        timeout: 10000
      };

      const mockElement = {
        count: jest.fn().mockResolvedValue(1),
        first: jest.fn().mockReturnValue({
          waitFor: jest.fn().mockResolvedValue(undefined),
          isVisible: jest.fn().mockResolvedValue(true)
        })
      };

      mockPage.locator.mockReturnValue(mockElement);

      await strategy.verify(assertion, mockContext);

      expect(mockElement.first().waitFor).toHaveBeenCalledWith({
        state: 'visible',
        timeout: 10000
      });
    });

    it('应该使用默认超时时间（5秒）', async () => {
      const assertion: Assertion = {
        id: 'test-2',
        description: '验证元素可见',
        selector: '#element'
      };

      const mockElement = {
        count: jest.fn().mockResolvedValue(1),
        first: jest.fn().mockReturnValue({
          waitFor: jest.fn().mockResolvedValue(undefined),
          isVisible: jest.fn().mockResolvedValue(true)
        })
      };

      mockPage.locator.mockReturnValue(mockElement);

      await strategy.verify(assertion, mockContext);

      expect(mockElement.first().waitFor).toHaveBeenCalledWith({
        state: 'visible',
        timeout: 5000
      });
    });
  });

  describe('verify - 日志记录', () => {
    it('应该记录验证过程的日志', async () => {
      const assertion: Assertion = {
        id: 'test-1',
        description: '验证按钮可见',
        selector: '#button'
      };

      const mockElement = {
        count: jest.fn().mockResolvedValue(1),
        first: jest.fn().mockReturnValue({
          waitFor: jest.fn().mockResolvedValue(undefined),
          isVisible: jest.fn().mockResolvedValue(true)
        })
      };

      mockPage.locator.mockReturnValue(mockElement);

      await strategy.verify(assertion, mockContext);

      expect(mockContext.logCallback).toHaveBeenCalled();
      expect(mockContext.logCallback).toHaveBeenCalledWith(
        expect.stringContaining('开始元素可见性验证'),
        'info'
      );
      expect(mockContext.logCallback).toHaveBeenCalledWith(
        expect.stringContaining('验证成功'),
        'success'
      );
    });
  });

  describe('verify - 错误处理', () => {
    it('应该捕获并处理异常', async () => {
      const assertion: Assertion = {
        id: 'test-1',
        description: '验证元素可见',
        selector: '#element'
      };

      mockPage.locator.mockImplementation(() => {
        throw new Error('Page is closed');
      });

      const result = await strategy.verify(assertion, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('验证失败');
      expect(result.error).toContain('Page is closed');
      expect(result.suggestions).toBeDefined();
    });
  });

  describe('verify - 返回结果结构', () => {
    it('成功时应该返回完整的结果结构', async () => {
      const assertion: Assertion = {
        id: 'test-1',
        description: '验证元素可见',
        selector: '#element'
      };

      const mockElement = {
        count: jest.fn().mockResolvedValue(1),
        first: jest.fn().mockReturnValue({
          waitFor: jest.fn().mockResolvedValue(undefined),
          isVisible: jest.fn().mockResolvedValue(true)
        })
      };

      mockPage.locator.mockReturnValue(mockElement);

      const result = await strategy.verify(assertion, mockContext);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('assertionType');
      expect(result).toHaveProperty('actualValue');
      expect(result).toHaveProperty('expectedValue');
      expect(result).toHaveProperty('duration');
      expect(typeof result.duration).toBe('number');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('失败时应该返回错误信息和建议', async () => {
      const assertion: Assertion = {
        id: 'test-1',
        description: '验证元素可见',
        selector: '#non-existent'
      };

      const mockElement = {
        count: jest.fn().mockResolvedValue(0)
      };

      mockPage.locator.mockReturnValue(mockElement);

      const result = await strategy.verify(assertion, mockContext);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('assertionType');
      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('suggestions');
      expect(result).toHaveProperty('duration');
      expect(result.success).toBe(false);
      expect(Array.isArray(result.suggestions)).toBe(true);
      expect(result.suggestions!.length).toBeGreaterThan(0);
    });
  });
});
