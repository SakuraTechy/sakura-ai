/**
 * PopupStrategy 单元测试
 * 
 * 测试弹窗验证策略的各种功能：
 * 1. 弹窗关键词识别
 * 2. 文本历史记录查找
 * 3. 快速超时机制
 * 4. 三种匹配模式
 */

import { PopupStrategy } from '../PopupStrategy';
import type { Assertion, VerificationContext } from '../../types';
import { AssertionType } from '../../types';

describe('PopupStrategy', () => {
  let strategy: PopupStrategy;

  beforeEach(() => {
    strategy = new PopupStrategy();
  });

  describe('canHandle', () => {
    it('应该识别明确指定类型的弹窗断言', () => {
      const assertion: Assertion = {
        id: 'test-1',
        description: '测试断言',
        type: AssertionType.POPUP
      };

      expect(strategy.canHandle(assertion)).toBe(true);
    });

    it('应该通过关键词识别弹窗断言', () => {
      const keywords = [
        '弹窗',
        '提示',
        '对话框',
        '消息',
        '通知',
        '警告',
        'popup',
        'dialog',
        'alert',
        'message',
        'notification',
        'toast'
      ];

      keywords.forEach(keyword => {
        const assertion: Assertion = {
          id: 'test',
          description: `验证${keyword}`
        };
        expect(strategy.canHandle(assertion)).toBe(true);
      });
    });

    it('应该不识别非弹窗断言', () => {
      const assertion: Assertion = {
        id: 'test',
        description: '验证页面标题'
      };

      expect(strategy.canHandle(assertion)).toBe(false);
    });
  });

  describe('verify', () => {
    const createMockPage = () => ({
      getByText: jest.fn().mockReturnValue({
        isVisible: jest.fn().mockResolvedValue(false),
        textContent: jest.fn().mockResolvedValue('')
      })
    });

    const createContext = (textHistory?: Set<string>): VerificationContext => ({
      page: createMockPage() as any,
      runId: 'test-run',
      artifactsDir: '/test/artifacts',
      textHistory
    });

    it('当未提供文本时应该返回失败', async () => {
      const assertion: Assertion = {
        id: 'test',
        description: '验证弹窗',
        type: AssertionType.POPUP
        // 没有 value 字段
      };

      const result = await strategy.verify(assertion, createContext());

      expect(result.success).toBe(false);
      expect(result.error).toContain('未提供要验证的弹窗文本');
      expect(result.suggestions).toBeDefined();
    });

    it('应该优先使用 value 字段作为搜索文本', async () => {
      const textHistory = new Set(['操作成功']);
      const assertion: Assertion = {
        id: 'test',
        description: '验证弹窗显示',
        value: '操作成功',
        type: AssertionType.POPUP
      };

      const result = await strategy.verify(assertion, createContext(textHistory));

      expect(result.success).toBe(true);
      expect(result.actualValue).toBe('操作成功');
    });

    it('当 value 不存在时应该返回失败', async () => {
      const textHistory = new Set(['操作成功']);
      const assertion: Assertion = {
        id: 'test',
        description: '验证弹窗显示',
        type: AssertionType.POPUP
        // 没有 value 字段
      };

      const result = await strategy.verify(assertion, createContext(textHistory));

      expect(result.success).toBe(false);
      expect(result.error).toContain('未提供要验证的弹窗文本');
    });

    describe('文本历史记录查找', () => {
      it('应该在历史记录中找到完全匹配的文本', async () => {
        const textHistory = new Set(['操作成功', '保存失败', '数据已更新']);
        const assertion: Assertion = {
          id: 'test',
          description: '验证弹窗',
          value: '操作成功',
          type: AssertionType.POPUP
        };

        const result = await strategy.verify(assertion, createContext(textHistory));

        expect(result.success).toBe(true);
        expect(result.matchType).toBe('完全匹配');
        expect(result.actualValue).toBe('操作成功');
        expect(result.metadata?.source).toBe('text_history');
      });

      it('应该在历史记录中找到包含匹配的文本', async () => {
        const textHistory = new Set(['操作成功，数据已保存']);
        const assertion: Assertion = {
          id: 'test',
          description: '验证弹窗',
          value: '操作成功',
          type: AssertionType.POPUP,
          matchMode: 'auto'
        };

        const result = await strategy.verify(assertion, createContext(textHistory));

        expect(result.success).toBe(true);
        expect(result.matchType).toBe('包含匹配');
        expect(result.actualValue).toBe('操作成功，数据已保存');
      });

      it('应该在历史记录中找到反向包含匹配的文本', async () => {
        const textHistory = new Set(['操作成功完成']);  // 6个字符
        const assertion: Assertion = {
          id: 'test',
          description: '验证弹窗',
          value: '操作成功完成，数据已保存，请继续下一步操作',  // 明显更长
          type: AssertionType.POPUP,
          matchMode: 'auto'
        };

        const result = await strategy.verify(assertion, createContext(textHistory));

        expect(result.success).toBe(true);
        expect(result.matchType).toBe('反向包含匹配');
        expect(result.actualValue).toBe('操作成功完成');
        expect(result.warnings).toContain('期望文本可能有多余字符，建议检查测试用例');
      });

      it('应该在宽松模式下使用关键词匹配', async () => {
        const textHistory = new Set(['用户信息更新完成']);
        const assertion: Assertion = {
          id: 'test',
          description: '验证弹窗',
          value: '数据删除成功',  // 只有"数据"和"成功"不匹配，需要关键词匹配
          type: AssertionType.POPUP,
          matchMode: 'loose'
        };

        const result = await strategy.verify(assertion, createContext(textHistory));

        // 由于没有匹配的关键词，应该失败
        expect(result.success).toBe(false);
      });

      it('应该在宽松模式下通过关键词匹配成功', async () => {
        const textHistory = new Set(['用户数据保存完成']);
        const assertion: Assertion = {
          id: 'test',
          description: '验证弹窗',
          value: '数据 保存 成功',  // 用空格分隔，产生3个关键词
          type: AssertionType.POPUP,
          matchMode: 'loose'
        };

        const result = await strategy.verify(assertion, createContext(textHistory));

        expect(result.success).toBe(true);
        expect(result.matchType).toContain('关键词匹配');
        expect(result.warnings).toContain('使用了宽松匹配，建议检查期望文本是否准确');
      });

      it('严格模式下只应该匹配完全相同的文本', async () => {
        const textHistory = new Set(['操作成功，数据已保存']);
        const assertion: Assertion = {
          id: 'test',
          description: '验证弹窗',
          value: '操作成功',
          type: AssertionType.POPUP,
          matchMode: 'strict'
        };

        const result = await strategy.verify(assertion, createContext(textHistory));

        expect(result.success).toBe(false);
        expect(result.error).toContain('未找到匹配的弹窗文本');
      });

      it('智能模式下不应该使用关键词匹配', async () => {
        const textHistory = new Set(['用户数据保存成功']);
        const assertion: Assertion = {
          id: 'test',
          description: '验证弹窗',
          value: '保存成功',
          type: AssertionType.POPUP,
          matchMode: 'auto'
        };

        const result = await strategy.verify(assertion, createContext(textHistory));

        // 智能模式下，"保存成功"不能完全匹配或包含匹配"用户数据保存成功"
        // 但"用户数据保存成功"包含"保存成功"，所以应该成功
        expect(result.success).toBe(true);
        expect(result.matchType).toBe('包含匹配');
      });
    });

    describe('当前页面查找', () => {
      it('应该在当前页面找到可见的弹窗', async () => {
        const mockPage = {
          getByText: jest.fn().mockReturnValue({
            isVisible: jest.fn().mockResolvedValue(true),
            textContent: jest.fn().mockResolvedValue('操作成功')
          })
        };

        const context: VerificationContext = {
          page: mockPage as any,
          runId: 'test-run',
          artifactsDir: '/test/artifacts'
        };

        const assertion: Assertion = {
          id: 'test',
          description: '验证弹窗',
          value: '操作成功',
          type: AssertionType.POPUP
        };

        const result = await strategy.verify(assertion, context);

        expect(result.success).toBe(true);
        expect(result.metadata?.source).toBe('current_page');
        expect(mockPage.getByText).toHaveBeenCalledWith('操作成功', { exact: false });
      });

      it('严格模式下应该使用精确匹配', async () => {
        const mockPage = {
          getByText: jest.fn().mockReturnValue({
            isVisible: jest.fn().mockResolvedValue(true),
            textContent: jest.fn().mockResolvedValue('操作成功')
          })
        };

        const context: VerificationContext = {
          page: mockPage as any,
          runId: 'test-run',
          artifactsDir: '/test/artifacts'
        };

        const assertion: Assertion = {
          id: 'test',
          description: '验证弹窗',
          value: '操作成功',
          type: AssertionType.POPUP,
          matchMode: 'strict'
        };

        const result = await strategy.verify(assertion, context);

        expect(result.success).toBe(true);
        expect(mockPage.getByText).toHaveBeenCalledWith('操作成功', { exact: true });
      });

      it('应该使用配置的超时时间', async () => {
        const mockIsVisible = jest.fn().mockResolvedValue(false);
        const mockPage = {
          getByText: jest.fn().mockReturnValue({
            isVisible: mockIsVisible,
            textContent: jest.fn().mockResolvedValue('')
          })
        };

        const context: VerificationContext = {
          page: mockPage as any,
          runId: 'test-run',
          artifactsDir: '/test/artifacts'
        };

        const assertion: Assertion = {
          id: 'test',
          description: '验证弹窗',
          value: '操作成功',
          type: AssertionType.POPUP,
          timeout: 5000
        };

        await strategy.verify(assertion, context);

        expect(mockIsVisible).toHaveBeenCalledWith({ timeout: 5000 });
      });

      it('应该使用默认超时时间3秒', async () => {
        const mockIsVisible = jest.fn().mockResolvedValue(false);
        const mockPage = {
          getByText: jest.fn().mockReturnValue({
            isVisible: mockIsVisible,
            textContent: jest.fn().mockResolvedValue('')
          })
        };

        const context: VerificationContext = {
          page: mockPage as any,
          runId: 'test-run',
          artifactsDir: '/test/artifacts'
        };

        const assertion: Assertion = {
          id: 'test',
          description: '验证弹窗',
          value: '操作成功',
          type: AssertionType.POPUP
        };

        await strategy.verify(assertion, context);

        expect(mockIsVisible).toHaveBeenCalledWith({ timeout: 3000 });
      });
    });

    describe('验证失败场景', () => {
      it('当历史记录和当前页面都未找到时应该返回失败', async () => {
        const textHistory = new Set(['其他文本']);
        const assertion: Assertion = {
          id: 'test',
          description: '验证弹窗',
          value: '操作成功',
          type: AssertionType.POPUP
        };

        const result = await strategy.verify(assertion, createContext(textHistory));

        expect(result.success).toBe(false);
        expect(result.error).toContain('未找到匹配的弹窗文本');
        expect(result.suggestions).toBeDefined();
        expect(result.suggestions!.length).toBeGreaterThan(0);
      });

      it('应该提供有用的调试建议', async () => {
        const assertion: Assertion = {
          id: 'test',
          description: '验证弹窗',
          value: '操作成功',
          type: AssertionType.POPUP
        };

        const result = await strategy.verify(assertion, createContext());

        expect(result.suggestions).toContain('弹窗可能已经消失（检查弹窗显示时间）');
        expect(result.suggestions).toContain('弹窗文本可能不完全匹配（尝试使用宽松匹配模式）');
        expect(result.suggestions).toContain('弹窗可能还未出现（增加等待时间）');
      });

      it('应该在元数据中包含调试信息', async () => {
        const textHistory = new Set(['文本1', '文本2']);
        const assertion: Assertion = {
          id: 'test',
          description: '验证弹窗',
          value: '操作成功',
          type: AssertionType.POPUP,
          matchMode: 'strict',
          timeout: 5000
        };

        const result = await strategy.verify(assertion, createContext(textHistory));

        expect(result.metadata?.matchMode).toBe('strict');
        expect(result.metadata?.historySize).toBe(2);
        expect(result.metadata?.timeout).toBe(5000);
      });
    });

    describe('日志回调', () => {
      it('应该调用日志回调函数', async () => {
        const logCallback = jest.fn();
        const textHistory = new Set(['操作成功']);
        
        const context: VerificationContext = {
          page: createMockPage() as any,
          runId: 'test-run',
          artifactsDir: '/test/artifacts',
          textHistory,
          logCallback
        };

        const assertion: Assertion = {
          id: 'test',
          description: '验证弹窗',
          value: '操作成功',
          type: AssertionType.POPUP
        };

        await strategy.verify(assertion, context);

        expect(logCallback).toHaveBeenCalled();
        expect(logCallback).toHaveBeenCalledWith(expect.stringContaining('匹配模式'), 'info');
        expect(logCallback).toHaveBeenCalledWith(expect.stringContaining('验证弹窗文本'), 'info');
      });
    });

    describe('异常处理', () => {
      it('应该捕获并处理页面查找异常', async () => {
        const mockPage = {
          getByText: jest.fn().mockReturnValue({
            isVisible: jest.fn().mockRejectedValue(new Error('页面错误')),
            textContent: jest.fn()
          })
        };

        const context: VerificationContext = {
          page: mockPage as any,
          runId: 'test-run',
          artifactsDir: '/test/artifacts'
        };

        const assertion: Assertion = {
          id: 'test',
          description: '验证弹窗',
          value: '操作成功',
          type: AssertionType.POPUP
        };

        const result = await strategy.verify(assertion, context);

        // 页面查找失败后，应该返回未找到的错误
        expect(result.success).toBe(false);
        expect(result.error).toContain('未找到匹配的弹窗文本');
        expect(result.suggestions).toBeDefined();
      });
    });
  });
});
