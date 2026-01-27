import { TextContentStrategy } from '../TextContentStrategy';
import type { Assertion, VerificationContext } from '../../types';
import { AssertionType } from '../../types';

describe('TextContentStrategy', () => {
  let strategy: TextContentStrategy;
  let mockPage: any;
  let mockContext: VerificationContext;

  beforeEach(() => {
    strategy = new TextContentStrategy();
    
    mockPage = {
      getByText: jest.fn()
    };

    mockContext = {
      page: mockPage,
      runId: 'test-run',
      artifactsDir: '/tmp/artifacts',
      logCallback: jest.fn(),
      textHistory: new Set<string>()
    };
  });

  describe('canHandle', () => {
    it('应该识别明确指定的文本内容类型', () => {
      const assertion: Assertion = {
        id: 'test-1',
        description: '测试断言',
        type: AssertionType.TEXT_CONTENT
      };

      expect(strategy.canHandle(assertion)).toBe(true);
    });

    it('应该识别包含"文本"关键词的描述', () => {
      expect(strategy.canHandle({ id: '1', description: '验证文本内容' })).toBe(true);
    });

    it('应该识别包含"内容"关键词的描述', () => {
      expect(strategy.canHandle({ id: '1', description: '检查页面内容' })).toBe(true);
    });

    it('应该识别包含"包含"关键词的描述', () => {
      expect(strategy.canHandle({ id: '1', description: '页面包含提示信息' })).toBe(true);
    });

    it('不应该识别不相关的描述', () => {
      expect(strategy.canHandle({ id: '1', description: '点击按钮' })).toBe(false);
    });
  });

  describe('verify', () => {
    it('应该在当前页面找到文本', async () => {
      const assertion: Assertion = {
        id: 'test-1',
        description: '验证文本内容',
        value: '欢迎使用'
      };

      const mockElement = {
        count: jest.fn().mockResolvedValue(1),
        first: jest.fn().mockReturnValue({
          waitFor: jest.fn().mockResolvedValue(undefined)
        })
      };

      mockPage.getByText.mockReturnValue(mockElement);

      const result = await strategy.verify(assertion, mockContext);

      expect(result.success).toBe(true);
      expect(result.matchType).toBe('当前页面匹配');
    });

    it('应该在文本历史记录中找到文本', async () => {
      const assertion: Assertion = {
        id: 'test-2',
        description: '验证文本内容',
        value: '操作成功'
      };

      mockContext.textHistory!.add('操作成功');

      const mockElement = {
        count: jest.fn().mockResolvedValue(0)
      };

      mockPage.getByText.mockReturnValue(mockElement);

      const result = await strategy.verify(assertion, mockContext);

      expect(result.success).toBe(true);
      expect(result.matchType).toContain('完全匹配');
    });

    it('应该处理缺少文本内容的情况', async () => {
      const assertion: Assertion = {
        id: 'test-3',
        description: '验证文本内容'
      };

      const result = await strategy.verify(assertion, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('缺少要验证的文本内容');
    });

    it('应该处理未找到文本的情况', async () => {
      const assertion: Assertion = {
        id: 'test-4',
        description: '验证文本内容',
        value: '不存在的文本'
      };

      const mockElement = {
        count: jest.fn().mockResolvedValue(0),
        first: jest.fn().mockReturnValue({
          waitFor: jest.fn().mockRejectedValue(new Error('Timeout'))
        })
      };

      mockPage.getByText.mockReturnValue(mockElement);

      const result = await strategy.verify(assertion, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('未找到文本内容');
    });
  });
});
