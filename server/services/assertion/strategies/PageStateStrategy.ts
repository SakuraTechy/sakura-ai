/**
 * PageStateStrategy - 页面状态验证策略
 * 
 * 功能：
 * 1. 验证页面 URL 是否符合预期
 * 2. 验证页面标题是否符合预期
 * 3. 验证页面是否加载完成
 * 4. 验证页面是否有错误提示
 * 5. 对于模糊描述（如"正常操作"、"成功"），提供容错机制
 */

import type {
  Assertion,
  VerificationContext,
  AssertionResult,
  VerificationStrategy
} from '../types';
import { AssertionType } from '../types';

export class PageStateStrategy implements VerificationStrategy {
  readonly name = 'PageStateStrategy';
  readonly priority = 50;

  /**
   * 判断是否可以处理该断言
   */
  canHandle(assertion: Assertion): boolean {
    if (assertion.type === AssertionType.PAGE_STATE) {
      return true;
    }

    const description = assertion.description.toLowerCase();
    
    // 页面状态相关关键词
    if (description.includes('url') || description.includes('地址') ||
        description.includes('标题') || description.includes('title') ||
        description.includes('页面加载') || description.includes('加载完成')) {
      return true;
    }

    // 模糊描述关键词（容错机制）
    if (this.isFuzzyDescription(description)) {
      return true;
    }

    return false;
  }

  /**
   * 判断是否为模糊描述
   */
  private isFuzzyDescription(description: string): boolean {
    const fuzzyKeywords = [
      '正常操作',
      '正常',
      '成功',
      '操作成功',
      '完成',
      '操作完成',
      'ok',
      'success'
    ];

    // 精确匹配或包含完整关键词（避免误判）
    return fuzzyKeywords.some(keyword => {
      // 如果描述就是关键词本身，或者关键词是独立的词（前后有空格或标点）
      return description === keyword || 
             description.includes(keyword + ' ') ||
             description.includes(' ' + keyword) ||
             description.startsWith(keyword) && description.length <= keyword.length + 2;
    });
  }

  /**
   * 执行验证
   */
  async verify(
    assertion: Assertion,
    context: VerificationContext
  ): Promise<AssertionResult> {
    const { page, logCallback } = context;
    const description = assertion.description.toLowerCase();

    this.log('🔍 开始页面状态验证', 'info', logCallback);
    this.log(`📋 断言描述: "${assertion.description}"`, 'info', logCallback);

    try {
      // 检查是否为模糊描述
      const isFuzzy = this.isFuzzyDescription(description);
      
      if (isFuzzy) {
        this.log('⚠️ 检测到模糊描述，启用容错验证模式', 'warning', logCallback);
        return await this.verifyFuzzyAssertion(assertion, context);
      }

      // 具体的页面状态验证
      if (description.includes('url') || description.includes('地址')) {
        return await this.verifyUrl(assertion, context);
      }

      if (description.includes('标题') || description.includes('title')) {
        return await this.verifyTitle(assertion, context);
      }

      if (description.includes('加载') || description.includes('load')) {
        return await this.verifyPageLoaded(assertion, context);
      }

      // 默认：综合验证
      return await this.verifyFuzzyAssertion(assertion, context);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`❌ 页面状态验证出错: ${errorMessage}`, 'error', logCallback);

      return {
        success: false,
        assertionType: AssertionType.PAGE_STATE,
        error: errorMessage,
        suggestions: [
          '检查页面是否已加载',
          '确认浏览器是否正常运行',
          '查看是否有网络错误'
        ]
      };
    }
  }

  /**
   * 验证模糊断言（容错机制）
   * 
   * 对于 "正常操作"、"成功" 等模糊描述，执行以下验证：
   * 1. 页面没有崩溃
   * 2. 页面 URL 有效
   * 3. 没有明显的错误提示
   * 4. 页面可以正常交互
   */
  private async verifyFuzzyAssertion(
    assertion: Assertion,
    context: VerificationContext
  ): Promise<AssertionResult> {
    const { page, logCallback } = context;
    const warnings: string[] = [];
    const checks: string[] = [];

    this.log('🔍 执行容错验证（模糊断言）', 'info', logCallback);

    try {
      // 1. 检查页面是否崩溃
      if (page.isClosed()) {
        return {
          success: false,
          assertionType: AssertionType.PAGE_STATE,
          matchType: '容错验证',
          error: '页面已关闭',
          suggestions: ['检查测试步骤是否正确', '确认没有意外关闭浏览器']
        };
      }
      checks.push('✓ 页面未关闭');

      // 2. 检查 URL 是否有效
      const url = page.url();
      if (!url || url === 'about:blank') {
        warnings.push('页面 URL 为空或为 about:blank');
      } else {
        checks.push(`✓ 页面 URL 有效: ${url}`);
      }

      // 3. 检查是否有常见的错误提示
      const errorIndicators = [
        'text=/错误|error|失败|异常/i',
        '[class*="error"]',
        '[class*="fail"]',
        '[role="alert"]'
      ];

      let hasError = false;
      for (const selector of errorIndicators) {
        try {
          const errorElement = await page.locator(selector).first();
          const count = await errorElement.count();
          if (count > 0) {
            const text = await errorElement.textContent();
            if (text && text.trim()) {
              warnings.push(`检测到可能的错误提示: ${text.trim().substring(0, 50)}`);
              hasError = true;
            }
          }
        } catch {
          // 忽略查找错误
        }
      }

      if (!hasError) {
        checks.push('✓ 未检测到明显错误提示');
      }

      // 4. 检查页面是否可以交互
      try {
        await page.evaluate(() => document.readyState);
        checks.push('✓ 页面可以正常交互');
      } catch {
        warnings.push('页面可能无法正常交互');
      }

      // 5. 输出检查结果
      for (const check of checks) {
        this.log(`  ${check}`, 'info', logCallback);
      }

      // 6. 判断验证结果
      const success = !hasError && checks.length >= 3;

      if (success) {
        this.log('✓ 容错验证通过：页面状态正常', 'success', logCallback);
      } else {
        this.log('⚠️ 容错验证警告：页面可能存在问题', 'warning', logCallback);
      }

      // 🔥 添加模糊描述改进建议
      const improvementSuggestions = [
        '建议改为更具体的描述：',
        '  • "页面正常加载" - 验证页面是否成功加载',
        '  • "显示成功提示" - 验证操作后的提示信息',
        '  • "返回到首页" - 验证页面跳转',
        '  • "数据保存成功" - 验证数据操作结果'
      ];

      return {
        success,
        assertionType: AssertionType.PAGE_STATE,
        matchType: '容错验证（模糊断言）',
        actualValue: {
          url,
          checks,
          hasError
        },
        warnings: warnings.length > 0 ? warnings : undefined,
        suggestions: success ? improvementSuggestions : [
          ...improvementSuggestions,
          '检查页面是否有错误提示',
          '确认操作是否真正成功'
        ]
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        assertionType: AssertionType.PAGE_STATE,
        matchType: '容错验证',
        error: `容错验证失败: ${errorMessage}`,
        warnings,
        suggestions: [
          '页面可能已崩溃或无法访问',
          '建议使用更具体的断言描述'
        ]
      };
    }
  }

  /**
   * 验证 URL
   */
  private async verifyUrl(
    assertion: Assertion,
    context: VerificationContext
  ): Promise<AssertionResult> {
    const { page, logCallback } = context;
    const currentUrl = page.url();
    const expectedUrl = assertion.value || assertion.expectedValue;

    this.log(`🔍 当前 URL: ${currentUrl}`, 'info', logCallback);

    if (expectedUrl) {
      this.log(`🎯 期望 URL: ${expectedUrl}`, 'info', logCallback);

      const matches = currentUrl.includes(expectedUrl) || currentUrl === expectedUrl;

      return {
        success: matches,
        assertionType: AssertionType.PAGE_STATE,
        matchType: 'URL 验证',
        actualValue: currentUrl,
        expectedValue: expectedUrl,
        error: matches ? undefined : `URL 不匹配`,
        suggestions: matches ? undefined : [
          '检查页面是否跳转到正确的地址',
          '确认期望的 URL 是否正确'
        ]
      };
    }

    // 没有期望值，只验证 URL 有效
    const isValid = currentUrl && currentUrl !== 'about:blank';

    return {
      success: isValid,
      assertionType: AssertionType.PAGE_STATE,
      matchType: 'URL 有效性验证',
      actualValue: currentUrl,
      error: isValid ? undefined : 'URL 无效或为空'
    };
  }

  /**
   * 验证标题
   */
  private async verifyTitle(
    assertion: Assertion,
    context: VerificationContext
  ): Promise<AssertionResult> {
    const { page, logCallback } = context;
    const currentTitle = await page.title();
    const expectedTitle = assertion.value || assertion.expectedValue;

    this.log(`🔍 当前标题: ${currentTitle}`, 'info', logCallback);

    if (expectedTitle) {
      this.log(`🎯 期望标题: ${expectedTitle}`, 'info', logCallback);

      const matches = currentTitle.includes(expectedTitle) || currentTitle === expectedTitle;

      return {
        success: matches,
        assertionType: AssertionType.PAGE_STATE,
        matchType: '标题验证',
        actualValue: currentTitle,
        expectedValue: expectedTitle,
        error: matches ? undefined : '标题不匹配',
        suggestions: matches ? undefined : [
          '检查页面标题是否正确',
          '确认期望的标题是否正确'
        ]
      };
    }

    // 没有期望值，只验证标题存在
    const isValid = Boolean(currentTitle && currentTitle.trim().length > 0);

    return {
      success: isValid,
      assertionType: AssertionType.PAGE_STATE,
      matchType: '标题存在性验证',
      actualValue: currentTitle,
      error: isValid ? undefined : '页面标题为空',
      suggestions: isValid ? undefined : [
        '检查页面是否正确加载',
        '确认页面有标题元素'
      ]
    };
  }

  /**
   * 验证页面加载完成
   */
  private async verifyPageLoaded(
    assertion: Assertion,
    context: VerificationContext
  ): Promise<AssertionResult> {
    const { page, logCallback } = context;

    this.log('🔍 检查页面加载状态', 'info', logCallback);

    try {
      // 等待页面加载完成
      await page.waitForLoadState('load', { timeout: 5000 });
      
      const readyState = await page.evaluate(() => document.readyState);
      const isLoaded = readyState === 'complete' || readyState === 'interactive';

      this.log(`📄 页面 readyState: ${readyState}`, 'info', logCallback);

      return {
        success: isLoaded,
        assertionType: AssertionType.PAGE_STATE,
        matchType: '页面加载验证',
        actualValue: readyState,
        error: isLoaded ? undefined : '页面未完全加载',
        suggestions: isLoaded ? undefined : [
          '等待页面完全加载',
          '检查是否有网络问题',
          '确认页面资源是否正常'
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        assertionType: AssertionType.PAGE_STATE,
        matchType: '页面加载验证',
        error: `页面加载检查失败: ${errorMessage}`,
        suggestions: [
          '页面可能加载超时',
          '检查网络连接',
          '确认页面 URL 是否正确'
        ]
      };
    }
  }

  /**
   * 记录日志
   */
  private log(
    message: string,
    level: 'info' | 'success' | 'warning' | 'error',
    callback?: (message: string, level: 'info' | 'success' | 'warning' | 'error') => void
  ): void {
    if (callback) {
      callback(message, level);
    }
  }
}
