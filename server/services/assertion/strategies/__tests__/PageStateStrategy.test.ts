/**
 * PageStateStrategy 测试
 */

import { PageStateStrategy } from '../PageStateStrategy';
import type { Assertion, VerificationContext } from '../../types';
import { AssertionType } from '../../types';

describe('PageStateStrategy', () => {
  let strategy: PageStateStrategy;
  let mockPage: any;
  let mockContext: VerificationContext;

  beforeEach(() => {
    strategy = new PageStateStrategy();

    // Mock Playwright Page
    mockPage = {
      url: jest.fn().mockReturnValue('https://example.com/dashboard'),
      title: jest.fn().mockResolvedValue('Dashboard - Example App'),
      isClosed: jest.fn().mockReturnValue(false),
      locator: jest.fn().mockReturnValue({
        first: jest.fn().mockReturnThis(),
        count: jest.fn().mockResolvedValue(0),
        textContent: jest.fn().mockResolvedValue('')
      }),
      evaluate: jest.fn().mockResolvedValue('complete'),
      waitForLoadState: jest.fn().mockResolvedValue(undefined)
    };

    mockContext = {
      page: mockPage,
      runId: 'test-run-123',
      artifactsDir: '/tmp/artifacts',
      logCallback: jest.fn()
    };
  });

  describe('canHandle', () => {
    it('应该处理 PAGE_STATE 类型的断言', () => {
      const assertion: Assertion = {
        id: '1',
        description: '验证页面状态',
        type: AssertionType.PAGE_STATE
      };

      expect(strategy.canHandle(assertion)).toBe(true);
    });

    it('应该处理包含 URL 关键词的断言', () => {
      const assertion: Assertion = {
        id: '1',
        description: '验证页面 URL 正确'
      };

      expect(strategy.canHandle(assertion)).toBe(true);
    });

    it('应该处理包含标题关键词的断言', () => {
      const assertion: Assertion = {
        id: '1',
        description: '验证页面标题'
      };

      expect(strategy.canHandle(assertion)).toBe(true);
    });

    it('应该处理模糊描述的断言', () => {
      const fuzzyDescriptions = [
        '正常操作',
        '成功',
        '操作成功',
        '完成',
        'ok'
      ];

      fuzzyDescriptions.forEach(description => {
        const assertion: Assertion = {
          id: '1',
          description
        };
        expect(strategy.canHandle(assertion)).toBe(true);
      });
    });

    it('不应该处理不相关的断言', () => {
      const assertion: Assertion = {
        id: '1',
        description: '点击按钮'
      };

      expect(strategy.canHandle(assertion)).toBe(false);
    });
  });

  describe('verify - 模糊断言容错验证', () => {
    it('应该通过模糊断言验证（正常操作）', async () => {
      const assertion: Assertion = {
        id: '1',
        description: '正常操作'
      };

      const result = await strategy.verify(assertion, mockContext);

      expect(result.success).toBe(true);
      expect(result.assertionType).toBe(AssertionType.PAGE_STATE);
      expect(result.matchType).toContain('容错验证');
      expect(mockPage.isClosed).toHaveBeenCalled();
      expect(mockPage.url).toHaveBeenCalled();
    });

    it('应该通过模糊断言验证（成功）', async () => {
      const assertion: Assertion = {
        id: '1',
        description: '成功'
      };

      const result = await strategy.verify(assertion, mockContext);

      expect(result.success).toBe(true);
      expect(result.matchType).toContain('模糊断言');
    });

    it('应该检测到页面已关闭', async () => {
      mockPage.isClosed.mockReturnValue(true);

      const assertion: Assertion = {
        id: '1',
        description: '正常操作'
      };

      const result = await strategy.verify(assertion, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('页面已关闭');
    });

    it('应该检测到错误提示', async () => {
      mockPage.locator.mockReturnValue({
        first: jest.fn().mockReturnThis(),
        count: jest.fn().mockResolvedValue(1),
        textContent: jest.fn().mockResolvedValue('操作失败：权限不足')
      });

      const assertion: Assertion = {
        id: '1',
        description: '正常操作'
      };

      const result = await strategy.verify(assertion, mockContext);

      expect(result.success).toBe(false);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.some(w => w.includes('错误提示'))).toBe(true);
    });

    it('应该处理 URL 为 about:blank 的情况', async () => {
      mockPage.url.mockReturnValue('about:blank');

      const assertion: Assertion = {
        id: '1',
        description: '正常操作'
      };

      const result = await strategy.verify(assertion, mockContext);

      expect(result.warnings).toBeDefined();
      expect(result.warnings?.some(w => w.includes('about:blank'))).toBe(true);
    });
  });

  describe('verify - URL 验证', () => {
    it('应该验证 URL 匹配', async () => {
      const assertion: Assertion = {
        id: '1',
        description: '验证页面 URL',
        value: 'dashboard'
      };

      const result = await strategy.verify(assertion, mockContext);

      expect(result.success).toBe(true);
      expect(result.matchType).toBe('URL 验证');
      expect(result.actualValue).toBe('https://example.com/dashboard');
      expect(result.expectedValue).toBe('dashboard');
    });

    it('应该验证 URL 不匹配', async () => {
      const assertion: Assertion = {
        id: '1',
        description: '验证页面 URL',
        value: 'login'
      };

      const result = await strategy.verify(assertion, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('URL 不匹配');
    });

    it('应该验证 URL 有效性（无期望值）', async () => {
      const assertion: Assertion = {
        id: '1',
        description: '验证页面 URL 有效'
      };

      const result = await strategy.verify(assertion, mockContext);

      expect(result.success).toBe(true);
      expect(result.matchType).toBe('URL 有效性验证');
    });
  });

  describe('verify - 标题验证', () => {
    it('应该验证标题匹配', async () => {
      const assertion: Assertion = {
        id: '1',
        description: '验证页面标题',
        value: 'Dashboard'
      };

      const result = await strategy.verify(assertion, mockContext);

      expect(result.success).toBe(true);
      expect(result.matchType).toBe('标题验证');
      expect(result.actualValue).toBe('Dashboard - Example App');
    });

    it('应该验证标题不匹配', async () => {
      const assertion: Assertion = {
        id: '1',
        description: '验证页面标题',
        value: 'Login'
      };

      const result = await strategy.verify(assertion, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('标题不匹配');
    });

    it('应该验证标题存在性（无期望值）', async () => {
      const assertion: Assertion = {
        id: '1',
        description: '验证页面标题存在'
      };

      const result = await strategy.verify(assertion, mockContext);

      expect(result.success).toBe(true);
      expect(result.matchType).toBe('标题存在性验证');
    });

    it('应该检测到标题为空', async () => {
      mockPage.title.mockResolvedValue('');

      const assertion: Assertion = {
        id: '1',
        description: '验证页面标题存在'
      };

      const result = await strategy.verify(assertion, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('标题为空');
      expect(result.suggestions).toBeDefined();
    });
  });

  describe('verify - 页面加载验证', () => {
    it('应该验证页面加载完成', async () => {
      const assertion: Assertion = {
        id: '1',
        description: '验证页面加载完成'
      };

      const result = await strategy.verify(assertion, mockContext);

      expect(result.success).toBe(true);
      expect(result.matchType).toBe('页面加载验证');
      expect(result.actualValue).toBe('complete');
      expect(mockPage.waitForLoadState).toHaveBeenCalledWith('load', { timeout: 5000 });
    });

    it('应该处理页面加载超时', async () => {
      mockPage.waitForLoadState.mockRejectedValue(new Error('Timeout'));

      const assertion: Assertion = {
        id: '1',
        description: '验证页面加载'
      };

      const result = await strategy.verify(assertion, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('加载检查失败');
    });
  });

  describe('priority', () => {
    it('应该有正确的优先级', () => {
      expect(strategy.priority).toBe(50);
    });
  });

  describe('name', () => {
    it('应该有正确的名称', () => {
      expect(strategy.name).toBe('PageStateStrategy');
    });
  });
});
