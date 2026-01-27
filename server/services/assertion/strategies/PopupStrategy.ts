/**
 * PopupStrategy - 弹窗/提示验证策略
 * 
 * 功能：
 * 1. 识别弹窗/提示断言（通过关键词匹配）
 * 2. 优先使用 value 值进行快速查找
 * 3. 先检查文本历史记录（捕获已消失的弹窗）
 * 4. 使用短超时时间快速检测弹窗
 * 5. 支持三种匹配模式：strict、auto、loose
 * 6. 提供详细的匹配信息和警告
 */

import type {
  Assertion,
  VerificationContext,
  AssertionResult,
  VerificationStrategy
} from '../types';
import { AssertionType } from '../types';

export class PopupStrategy implements VerificationStrategy {
  readonly name = 'PopupStrategy';
  readonly priority = 20; // 高优先级

  // 弹窗关键词
  private readonly popupKeywords = [
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

  /**
   * 判断是否可以处理该断言
   */
  canHandle(assertion: Assertion): boolean {
    // 如果明确指定了类型
    if (assertion.type === AssertionType.POPUP) {
      return true;
    }

    // 通过描述中的关键词判断
    const description = assertion.description.toLowerCase();
    return this.popupKeywords.some(keyword => 
      description.includes(keyword.toLowerCase())
    );
  }

  /**
   * 执行验证
   */
  async verify(
    assertion: Assertion,
    context: VerificationContext
  ): Promise<AssertionResult> {
    const startTime = Date.now();

    try {
      // 1. 获取要查找的文本
      const searchText = assertion.value;
      if (!searchText) {
        return {
          success: false,
          assertionType: AssertionType.POPUP,
          error: '未提供要验证的弹窗文本',
          suggestions: [
            '请在断言的 value 字段中提供期望的弹窗文本',
            '或在 description 中包含期望的文本'
          ],
          duration: Date.now() - startTime
        };
      }

      // 2. 获取匹配模式（默认为 auto）
      const matchMode = assertion.matchMode || 'auto';

      // 3. 记录日志
      this.log(context, `⚙️ 匹配模式: ${this.getMatchModeLabel(matchMode)}`, 'info');
      this.log(context, `🔍 验证弹窗文本: "${searchText}"`, 'info');

      // 4. 先检查文本历史记录（优先级最高，因为弹窗可能已经消失）
      if (context.textHistory && context.textHistory.size > 0) {
        this.log(context, `📊 历史记录共有 ${context.textHistory.size} 条文本`, 'info');
        
        const historyResult = this.findInTextHistory(
          searchText,
          context.textHistory,
          matchMode,
          context
        );

        if (historyResult.found) {
          return {
            success: true,
            assertionType: AssertionType.POPUP,
            matchType: historyResult.matchType,
            actualValue: historyResult.matchedText,
            expectedValue: searchText,
            warnings: historyResult.warnings,
            metadata: {
              source: 'text_history',
              historySize: context.textHistory.size
            },
            duration: Date.now() - startTime
          };
        }
      }

      // 5. 在当前页面查找（使用短超时）
      const quickTimeout = assertion.timeout || 3000; // 默认3秒
      this.log(context, `🔍 在当前页面查找弹窗（超时: ${quickTimeout}ms）`, 'info');

      // 尝试在页面中查找文本
      const locator = context.page.getByText(searchText, { exact: matchMode === 'strict' });
      const isVisible = await locator.isVisible({ timeout: quickTimeout }).catch(() => false);

      if (isVisible) {
        const actualText = await locator.textContent();
        this.log(context, `✅ 在当前页面找到弹窗`, 'success');

        return {
          success: true,
          assertionType: AssertionType.POPUP,
          matchType: matchMode === 'strict' ? '完全匹配' : '包含匹配',
          actualValue: actualText,
          expectedValue: searchText,
          metadata: {
            source: 'current_page'
          },
          duration: Date.now() - startTime
        };
      }

      // 6. 验证失败
      this.log(context, `❌ 未找到匹配的弹窗文本`, 'error');

      return {
        success: false,
        assertionType: AssertionType.POPUP,
        error: '未找到匹配的弹窗文本',
        expectedValue: searchText,
        suggestions: [
          '弹窗可能已经消失（检查弹窗显示时间）',
          '弹窗文本可能不完全匹配（尝试使用宽松匹配模式）',
          '弹窗可能还未出现（增加等待时间）',
          '检查弹窗是否真的触发了'
        ],
        metadata: {
          matchMode,
          historySize: context.textHistory?.size || 0,
          timeout: quickTimeout
        },
        duration: Date.now() - startTime
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return {
        success: false,
        assertionType: AssertionType.POPUP,
        error: `弹窗验证失败: ${errorMessage}`,
        suggestions: [
          '检查页面是否正常加载',
          '确认弹窗触发条件是否满足',
          '查看详细错误信息'
        ],
        metadata: {
          errorType: error instanceof Error ? error.constructor.name : 'Unknown'
        },
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * 在文本历史记录中查找匹配的文本
   * 使用分层匹配策略：完全匹配 > 包含匹配 > 反向包含匹配 > 关键词匹配
   */
  private findInTextHistory(
    searchText: string,
    textHistory: Set<string>,
    matchMode: 'strict' | 'auto' | 'loose',
    context: VerificationContext
  ): {
    found: boolean;
    matchedText?: string;
    matchType?: string;
    warnings?: string[];
  } {
    const warnings: string[] = [];

    // 层级1：完全匹配（所有模式都支持）
    if (textHistory.has(searchText)) {
      this.log(context, `✅ 完全匹配成功`, 'success');
      return { found: true, matchedText: searchText, matchType: '完全匹配' };
    }

    // 严格模式：只使用完全匹配
    if (matchMode === 'strict') {
      this.log(context, `❌ 严格模式下未找到完全匹配的文本`, 'error');
      return { found: false };
    }

    // 层级2：包含匹配（智能模式和宽松模式支持）
    // 实际文本包含期望文本
    for (const text of textHistory) {
      if (text.includes(searchText)) {
        this.log(context, `✅ 包含匹配成功: 实际文本 "${text}" 包含期望文本 "${searchText}"`, 'success');
        return { found: true, matchedText: text, matchType: '包含匹配' };
      }
    }

    // 层级3：反向包含匹配（智能模式和宽松模式支持）
    // 期望文本包含实际文本（可能期望文本有多余字符）
    for (const text of textHistory) {
      // 文本长度至少5个字符，且期望文本明显更长（避免误匹配）
      if (text.length >= 5 && searchText.length > text.length && searchText.includes(text)) {
        this.log(context, `⚠️ 反向包含匹配: 期望文本 "${searchText}" 包含实际文本 "${text}"`, 'warning');
        warnings.push('期望文本可能有多余字符，建议检查测试用例');
        return {
          found: true,
          matchedText: text,
          matchType: '反向包含匹配',
          warnings
        };
      }
    }

    // 智能模式：到此为止，不使用关键词匹配
    if (matchMode === 'auto') {
      this.log(context, `❌ 智能模式下未找到匹配的文本（已尝试：完全匹配、包含匹配、反向包含匹配）`, 'error');
      return { found: false };
    }

    // 层级4：关键词匹配（仅宽松模式支持）
    const words = searchText.split(/[：:，,、\s]+/).filter(w => w.length > 1);
    this.log(context, `🔍 宽松模式：尝试关键词匹配，关键词: ${words.join(', ')}`, 'info');

    for (const text of textHistory) {
      // 计算匹配的关键词数量
      let matchedWords = 0;
      for (const word of words) {
        if (text.includes(word)) {
          matchedWords++;
        }
      }

      // 如果匹配了大部分关键词（>= 50%），认为匹配成功
      if (matchedWords >= Math.ceil(words.length * 0.5)) {
        this.log(context, `⚠️ 关键词匹配成功: "${text}" (匹配 ${matchedWords}/${words.length} 个关键词)`, 'warning');
        warnings.push('使用了宽松匹配，建议检查期望文本是否准确');
        return {
          found: true,
          matchedText: text,
          matchType: `关键词匹配 (${matchedWords}/${words.length})`,
          warnings
        };
      }
    }

    this.log(context, `❌ 宽松模式下未找到匹配的文本`, 'error');
    return { found: false };
  }

  /**
   * 记录日志
   */
  private log(
    context: VerificationContext,
    message: string,
    level: 'info' | 'success' | 'warning' | 'error'
  ): void {
    console.log(`[${context.runId}] ${message}`);
    if (context.logCallback) {
      context.logCallback(message, level);
    }
  }

  /**
   * 获取匹配模式标签
   */
  private getMatchModeLabel(matchMode: string): string {
    switch (matchMode) {
      case 'strict':
        return '严格匹配';
      case 'auto':
        return '智能匹配';
      case 'loose':
        return '宽松匹配';
      default:
        return matchMode;
    }
  }
}
