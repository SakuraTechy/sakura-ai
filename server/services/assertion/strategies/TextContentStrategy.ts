import type { Page } from 'playwright';
import type { 
  VerificationStrategy, 
  Assertion, 
  VerificationContext, 
  AssertionResult 
} from '../types';
import { AssertionType } from '../types';

/**
 * 文本内容验证策略
 * 验证页面上是否存在指定的文本内容
 * 
 * 支持三种匹配模式：
 * - strict: 严格匹配（完全相等）
 * - auto: 智能匹配（完全匹配 > 包含匹配 > 反向包含匹配）
 * - loose: 宽松匹配（包含关键词匹配）
 * 
 * 验证策略：
 * 1. 优先在当前页面查找文本
 * 2. 如果当前页面未找到，在文本历史记录中查找
 * 3. 使用宽松匹配时提供警告信息
 */
export class TextContentStrategy implements VerificationStrategy {
  public readonly name = 'TextContentStrategy';
  public readonly priority = 40; // 较低优先级

  /**
   * 判断是否可以处理该断言
   * 检测关键词：文本、内容、包含等
   */
  public canHandle(assertion: Assertion): boolean {
    // 如果明确指定了类型
    if (assertion.type === AssertionType.TEXT_CONTENT) {
      return true;
    }

    // 通过描述关键词识别
    const description = (assertion.description || '').toLowerCase();
    const keywords = [
      '文本', '内容', '包含', '显示文字',
      'text', 'content', 'contain', 'include',
      '文字', '字样'
    ];

    return keywords.some(keyword => description.includes(keyword));
  }

  /**
   * 执行文本内容验证
   */
  public async verify(
    assertion: Assertion,
    context: VerificationContext
  ): Promise<AssertionResult> {
    const startTime = Date.now();
    const { page, runId, logCallback, textHistory } = context;
    const matchMode = assertion.matchMode || 'auto';
    const timeout = assertion.timeout || 3000; // 默认3秒超时
    const searchText = assertion.expectedValue || assertion.value;

    if (!searchText || typeof searchText !== 'string') {
      const error = '缺少要验证的文本内容';
      this.log(context, `❌ ${error}`, 'error');
      
      return {
        success: false,
        assertionType: this.name,
        error,
        suggestions: [
          '请在断言中提供 expectedValue 或 value 字段',
          '确保文本内容不为空'
        ],
        duration: Date.now() - startTime
      };
    }

    this.log(context, `🔍 开始文本内容验证`, 'info');
    this.log(context, `📋 期望文本: "${searchText}"`, 'info');
    this.log(context, `⚙️ 匹配模式: ${matchMode === 'strict' ? '严格' : matchMode === 'auto' ? '智能' : '宽松'}`, 'info');

    try {
      // 步骤1: 在当前页面查找文本
      this.log(context, `🔍 在当前页面查找文本...`, 'info');
      
      const pageResult = await this.findInCurrentPage(page, searchText, timeout, context);
      
      if (pageResult.found) {
        this.log(context, `✅ 在当前页面找到文本`, 'success');
        
        return {
          success: true,
          assertionType: this.name,
          matchType: '当前页面匹配',
          actualValue: pageResult.matchedText || searchText,
          expectedValue: searchText,
          duration: Date.now() - startTime
        };
      }

      // 步骤2: 在文本历史记录中查找
      if (textHistory && textHistory.size > 0) {
        this.log(context, `🔍 在文本历史记录中查找...`, 'info');
        this.log(context, `📊 历史记录共有 ${textHistory.size} 条文本`, 'info');
        
        const historyResult = this.findInTextHistory(searchText, textHistory, matchMode);
        
        if (historyResult.found) {
          this.log(context, `✅ 在文本历史记录中找到: "${historyResult.matchedText}"`, 'success');
          this.log(context, `📊 匹配类型: ${historyResult.matchType}`, 'info');
          
          // 如果是宽松匹配，给出警告
          if (historyResult.matchType?.includes('反向包含') || historyResult.matchType?.includes('关键词')) {
            this.log(context, `⚠️ 警告：使用了宽松匹配策略`, 'warning');
            this.log(context, `   期望文本: "${searchText}"`, 'warning');
            this.log(context, `   实际文本: "${historyResult.matchedText}"`, 'warning');
            
            return {
              success: true,
              assertionType: this.name,
              matchType: historyResult.matchType,
              actualValue: historyResult.matchedText,
              expectedValue: searchText,
              warnings: [
                '使用了宽松匹配策略',
                '建议检查期望文本是否准确'
              ],
              duration: Date.now() - startTime
            };
          }
          
          return {
            success: true,
            assertionType: this.name,
            matchType: `历史记录-${historyResult.matchType}`,
            actualValue: historyResult.matchedText,
            expectedValue: searchText,
            duration: Date.now() - startTime
          };
        }
      }

      // 未找到文本
      const error = `未找到文本内容: "${searchText}"`;
      this.log(context, `❌ ${error}`, 'error');
      
      return {
        success: false,
        assertionType: this.name,
        error,
        expectedValue: searchText,
        suggestions: [
          '检查文本内容是否正确',
          '确认页面是否已完全加载',
          '尝试使用更宽松的匹配模式',
          '检查文本是否在动态加载的内容中'
        ],
        duration: Date.now() - startTime
      };
    } catch (error: any) {
      const errorMsg = `文本内容验证失败: ${error.message}`;
      this.log(context, `❌ ${errorMsg}`, 'error');
      
      return {
        success: false,
        assertionType: this.name,
        error: errorMsg,
        suggestions: [
          '检查页面是否正常加载',
          '查看浏览器控制台是否有错误'
        ],
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * 在当前页面查找文本
   */
  private async findInCurrentPage(
    page: Page,
    searchText: string,
    timeout: number,
    context: VerificationContext
  ): Promise<{ found: boolean; matchedText?: string }> {
    try {
      const element = page.getByText(searchText, { exact: false });
      const count = await element.count();
      
      if (count > 0) {
        return { found: true, matchedText: searchText };
      }
      
      // 尝试等待文本出现
      try {
        await element.first().waitFor({ state: 'visible', timeout });
        return { found: true, matchedText: searchText };
      } catch {
        return { found: false };
      }
    } catch {
      return { found: false };
    }
  }

  /**
   * 在文本历史记录中查找匹配的文本
   * 使用分层匹配策略：完全匹配 > 包含匹配 > 反向包含匹配 > 关键词匹配
   */
  private findInTextHistory(
    searchText: string,
    textHistory: Set<string>,
    matchMode: 'strict' | 'auto' | 'loose'
  ): { found: boolean; matchedText?: string; matchType?: string } {
    // 层级1：完全匹配（所有模式都支持）
    if (textHistory.has(searchText)) {
      return { found: true, matchedText: searchText, matchType: '完全匹配' };
    }
    
    // 严格模式：只使用完全匹配
    if (matchMode === 'strict') {
      return { found: false };
    }
    
    // 层级2：包含匹配（智能模式和宽松模式支持）
    for (const text of textHistory) {
      if (text.includes(searchText)) {
        return { found: true, matchedText: text, matchType: '包含匹配' };
      }
    }
    
    // 层级3：反向包含匹配（智能模式和宽松模式支持）
    for (const text of textHistory) {
      if (searchText.includes(text) && text.length > 5) {
        return { found: true, matchedText: text, matchType: '反向包含匹配' };
      }
    }
    
    // 智能模式：到此为止
    if (matchMode === 'auto') {
      return { found: false };
    }
    
    // 层级4：关键词匹配（仅宽松模式支持）
    const words = searchText.split(/[：:，,、\s]+/).filter(w => w.length > 1);
    
    for (const text of textHistory) {
      let matchedWords = 0;
      for (const word of words) {
        if (text.includes(word)) {
          matchedWords++;
        }
      }
      
      if (matchedWords >= Math.ceil(words.length * 0.5)) {
        return { 
          found: true, 
          matchedText: text, 
          matchType: `关键词匹配 (${matchedWords}/${words.length})` 
        };
      }
    }
    
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
    const { runId, logCallback } = context;
    console.log(`[${runId}] ${message}`);
    
    if (logCallback) {
      logCallback(message, level);
    }
  }
}
