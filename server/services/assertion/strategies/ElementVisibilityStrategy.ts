import type { Page } from 'playwright';
import type { 
  VerificationStrategy, 
  Assertion, 
  VerificationContext, 
  AssertionResult 
} from '../types';
import { AssertionType } from '../types';

/**
 * 元素可见性验证策略
 * 验证页面元素是否存在且可见
 * 
 * 支持的定位方式：
 * 1. selector - CSS选择器或role:name格式
 * 2. ref - 元素引用
 * 3. description中的文本 - 通过文本内容定位
 * 
 * 验证内容：
 * - 元素是否在DOM中存在
 * - 元素是否可见（visible）
 * - 支持等待元素出现
 */
export class ElementVisibilityStrategy implements VerificationStrategy {
  public readonly name = 'ElementVisibilityStrategy';
  public readonly priority = 30; // 中等优先级

  /**
   * 判断是否可以处理该断言
   * 检测关键词：元素、可见、显示、存在、出现等
   */
  public canHandle(assertion: Assertion): boolean {
    // 如果明确指定了类型
    if (assertion.type === AssertionType.ELEMENT_VISIBILITY) {
      return true;
    }

    // 通过描述关键词识别
    const description = (assertion.description || '').toLowerCase();
    const keywords = [
      '元素', '可见', '显示', '存在', '出现',
      'element', 'visible', 'display', 'exist', 'appear',
      '显示出', '展示', '呈现'
    ];

    return keywords.some(keyword => description.includes(keyword));
  }

  /**
   * 执行元素可见性验证
   */
  public async verify(
    assertion: Assertion,
    context: VerificationContext
  ): Promise<AssertionResult> {
    const startTime = Date.now();
    const { page, runId, logCallback } = context;
    const timeout = assertion.timeout || 5000; // 默认5秒超时

    this.log(context, `🔍 开始元素可见性验证`, 'info');
    this.log(context, `📋 断言描述: "${assertion.description}"`, 'info');

    try {
      // 尝试定位元素
      const element = await this.locateElement(assertion, page, context);

      if (!element) {
        const error = `未找到元素`;
        this.log(context, `❌ ${error}`, 'error');
        
        return {
          success: false,
          assertionType: this.name,
          error,
          suggestions: [
            '检查元素选择器是否正确',
            '确认元素是否已加载到页面',
            '尝试增加超时时间',
            '检查页面是否已完全加载'
          ],
          duration: Date.now() - startTime
        };
      }

      // 检查元素是否存在于DOM中
      const count = await element.count();
      if (count === 0) {
        const error = `元素不存在于DOM中`;
        this.log(context, `❌ ${error}`, 'error');
        
        return {
          success: false,
          assertionType: this.name,
          error,
          suggestions: [
            '元素可能尚未加载',
            '检查选择器是否正确',
            '尝试等待页面加载完成'
          ],
          duration: Date.now() - startTime
        };
      }

      // 等待元素可见
      try {
        await element.first().waitFor({ state: 'visible', timeout });
        
        // 验证元素确实可见
        const isVisible = await element.first().isVisible();
        
        if (isVisible) {
          this.log(context, `✅ 元素可见性验证成功`, 'success');
          
          return {
            success: true,
            assertionType: this.name,
            actualValue: 'visible',
            expectedValue: 'visible',
            duration: Date.now() - startTime
          };
        } else {
          const error = `元素存在但不可见`;
          this.log(context, `❌ ${error}`, 'error');
          
          return {
            success: false,
            assertionType: this.name,
            error,
            actualValue: 'hidden',
            expectedValue: 'visible',
            suggestions: [
              '元素可能被CSS隐藏（display: none 或 visibility: hidden）',
              '元素可能在视口之外',
              '检查元素的CSS样式'
            ],
            duration: Date.now() - startTime
          };
        }
      } catch (timeoutError: any) {
        const error = `等待元素可见超时（${timeout}ms）`;
        this.log(context, `❌ ${error}`, 'error');
        
        return {
          success: false,
          assertionType: this.name,
          error,
          suggestions: [
            `增加超时时间（当前${timeout}ms）`,
            '检查元素是否被动态加载',
            '确认元素是否被CSS隐藏',
            '检查页面是否有加载错误'
          ],
          duration: Date.now() - startTime
        };
      }
    } catch (error: any) {
      const errorMsg = `元素可见性验证失败: ${error.message}`;
      this.log(context, `❌ ${errorMsg}`, 'error');
      
      return {
        success: false,
        assertionType: this.name,
        error: errorMsg,
        suggestions: [
          '检查页面是否正常加载',
          '确认选择器格式是否正确',
          '查看浏览器控制台是否有错误'
        ],
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * 定位元素
   * 支持多种定位方式：selector、ref、文本内容
   */
  private async locateElement(
    assertion: Assertion,
    page: Page,
    context: VerificationContext
  ): Promise<any> {
    // 方式1: 使用 selector
    if (assertion.selector) {
      this.log(context, `🔍 使用 selector 定位: "${assertion.selector}"`, 'info');
      
      // 检查是否是 role:name 格式
      if (assertion.selector.includes(':') && !assertion.selector.startsWith('http')) {
        const [role, name] = assertion.selector.split(':', 2);
        
        if (role && name && ['button', 'textbox', 'link', 'checkbox', 'combobox', 'heading'].includes(role)) {
          const element = page.getByRole(role as any, { name: name.trim(), exact: false });
          const count = await element.count();
          
          if (count > 0) {
            this.log(context, `✅ 通过 role:name 找到元素`, 'success');
            return element;
          }
        }
      }
      
      // 作为 CSS 选择器
      if (assertion.selector.startsWith('#') || 
          assertion.selector.startsWith('.') || 
          assertion.selector.startsWith('[')) {
        const element = page.locator(assertion.selector);
        const count = await element.count();
        
        if (count > 0) {
          this.log(context, `✅ 通过 CSS 选择器找到元素`, 'success');
          return element;
        }
      }
    }

    // 方式2: 使用 ref
    if (assertion.ref) {
      this.log(context, `🔍 使用 ref 定位: "${assertion.ref}"`, 'info');
      
      // 检查是否是 role:name 格式
      if (assertion.ref.includes(':') && !assertion.ref.startsWith('http')) {
        const [role, name] = assertion.ref.split(':', 2);
        
        if (role && name && ['button', 'textbox', 'link', 'checkbox', 'combobox', 'heading'].includes(role)) {
          const element = page.getByRole(role as any, { name: name.trim(), exact: false });
          const count = await element.count();
          
          if (count > 0) {
            this.log(context, `✅ 通过 ref role:name 找到元素`, 'success');
            return element;
          }
        }
      }
      
      // 作为 CSS 选择器
      const element = page.locator(assertion.ref);
      const count = await element.count();
      
      if (count > 0) {
        this.log(context, `✅ 通过 ref 找到元素`, 'success');
        return element;
      }
    }

    // 方式3: 使用 value 作为文本内容
    if (assertion.value && typeof assertion.value === 'string') {
      this.log(context, `🔍 使用文本内容定位: "${assertion.value}"`, 'info');
      
      const element = page.getByText(assertion.value, { exact: false });
      const count = await element.count();
      
      if (count > 0) {
        this.log(context, `✅ 通过文本内容找到元素`, 'success');
        return element;
      }
    }

    // 方式4: 从描述中提取文本
    const description = assertion.description || '';
    const textMatch = description.match(/["「『]([^"」』]+)["」』]/);
    
    if (textMatch && textMatch[1]) {
      const text = textMatch[1];
      this.log(context, `🔍 从描述中提取文本定位: "${text}"`, 'info');
      
      const element = page.getByText(text, { exact: false });
      const count = await element.count();
      
      if (count > 0) {
        this.log(context, `✅ 通过描述文本找到元素`, 'success');
        return element;
      }
    }

    this.log(context, `⚠️ 所有定位方式都未找到元素`, 'warning');
    return null;
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
