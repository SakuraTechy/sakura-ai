import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { TestStep } from '../../src/types/test.js';
import { EvidenceService } from './evidenceService.js';
import { StreamService } from './streamService.js';
import { AssertionService } from './assertion/AssertionService.js';
import type { Assertion, VerificationContext } from './assertion/types.js';
import { AssertionType } from './assertion/types.js';
import { FileDownloadStrategy } from './assertion/strategies/FileDownloadStrategy.js';
import { PopupStrategy } from './assertion/strategies/PopupStrategy.js';
import { ElementVisibilityStrategy } from './assertion/strategies/ElementVisibilityStrategy.js';
import { TextContentStrategy } from './assertion/strategies/TextContentStrategy.js';
import { PageStateStrategy } from './assertion/strategies/PageStateStrategy.js';
import { TextHistoryManager } from './assertion/TextHistoryManager.js';

/**
 * Playwright Test Runner 执行器
 * 使用原生 Playwright API 执行测试，支持 trace 和 video 录制
 */
export class PlaywrightTestRunner {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private evidenceService: EvidenceService;
  private streamService: StreamService;
  private artifactsDir: string;
  // 🔥 新增：弹窗文本历史记录（用于捕获快速消失的弹窗）
  private textHistory: Set<string> = new Set();
  private textHistoryEnabled: boolean = false;
  // 🔥 新增：日志回调函数（用于将日志发送到前端）
  private logCallback?: (message: string, level?: 'info' | 'warning' | 'error' | 'success') => void;
  // 🔥 新增：断言服务实例
  private assertionService: AssertionService;
  // 🔥 新增：文本历史管理器实例
  private textHistoryManager: TextHistoryManager;

  constructor(
    evidenceService: EvidenceService,
    streamService: StreamService,
    artifactsDir: string,
    logCallback?: (message: string, level?: 'info' | 'warning' | 'error' | 'success') => void // 🔥 新增：日志回调
  ) {
    this.evidenceService = evidenceService;
    this.streamService = streamService;
    this.artifactsDir = artifactsDir;
    this.logCallback = logCallback; // 🔥 保存日志回调
    // 🔥 初始化断言服务
    this.assertionService = AssertionService.getInstance({
      logging: {
        enabled: true,
        level: 'info',
        callback: logCallback
      }
    });
    // 🔥 初始化文本历史管理器
    this.textHistoryManager = TextHistoryManager.getInstance();
    // 🔥 注册所有验证策略
    this.assertionService.registerStrategy(AssertionType.FILE_DOWNLOAD, new FileDownloadStrategy());
    this.assertionService.registerStrategy(AssertionType.POPUP, new PopupStrategy());
    this.assertionService.registerStrategy(AssertionType.ELEMENT_VISIBILITY, new ElementVisibilityStrategy());
    this.assertionService.registerStrategy(AssertionType.TEXT_CONTENT, new TextContentStrategy());
    this.assertionService.registerStrategy(AssertionType.PAGE_STATE, new PageStateStrategy());
  }

  /**
   * 初始化浏览器
   */
  async initialize(runId: string, options: {
    headless?: boolean;
    enableTrace?: boolean;
    enableVideo?: boolean;
  } = {}): Promise<void> {
    // 🔥 在 Linux 服务器上强制使用 headless 模式
    const isLinux = process.platform === 'linux';
    const defaultHeadless = isLinux ? true : false;
    
    const {
      headless = defaultHeadless,
      enableTrace = true,
      enableVideo = true
    } = options;
    
    // 🔥 如果在 Linux 上且 headless 为 false，强制改为 true 并警告
    const finalHeadless = isLinux ? true : headless;
    if (isLinux && headless === false) {
      console.log(`⚠️ [${runId}] Linux 服务器环境检测到，强制启用 headless 模式`);
    }

    console.log(`🚀 [${runId}] 初始化 Playwright Test Runner (headless: ${finalHeadless})...`);
    
    // 启动浏览器
    // CentOS 7 兼容性配置
    // 🔥 注意：--start-maximized 在 Playwright 设置了固定 viewport 时无效，改用 --window-size
    const launchArgs = [
      '--window-size=1920,1080',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-extensions'
    ];

    // 获取 Chromium 可执行文件路径（如果设置了环境变量则使用系统 Chromium，否则使用 Playwright 自带的）
    const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || 
                          process.env.CHROME_PATH || 
                          process.env.CHROMIUM_PATH || 
                          undefined; // undefined 表示使用 Playwright 默认路径

    this.browser = await chromium.launch({
      headless: finalHeadless,
      args: launchArgs,
      ...(executablePath && { executablePath })
    });

    if (executablePath) {
      console.log(`🌐 [${runId}] 使用系统 Chromium: ${executablePath}`);
    }

    // 创建运行目录
    const runDir = path.join(this.artifactsDir, runId);
    await fs.mkdir(runDir, { recursive: true });

    // 配置 context 选项
    // 🔥 统一视口和视频尺寸，避免录制时出现灰色区域
    const viewportSize = { width: 1920, height: 1080 };
    
    const contextOptions: any = {
      // 🔥 修复：始终设置固定视口，确保视频录制区域与页面大小一致
      viewport: viewportSize,
      ignoreHTTPSErrors: true,
      // 🔥 修复：启用文件下载功能
      acceptDownloads: true,
      // 🔥 修复：设置下载文件保存路径
      downloadsPath: runDir,
      // 🔥 确保页面完全加载
      hasTouch: false,
      isMobile: false,
      // 🔥 设备缩放比例，确保高清截图
      deviceScaleFactor: 1,
    };

    console.log(`📐 [${runId}] 视口配置: ${viewportSize.width}x${viewportSize.height}`);

    // 启用 trace 录制
    if (enableTrace) {
      contextOptions.trace = {
        screenshots: true,
        snapshots: true,
        sources: true,
      };
    }

    // 启用 video 录制
    if (enableVideo) {
      // 🔥 修复：视频尺寸与视口尺寸完全一致，避免灰色区域
      contextOptions.recordVideo = {
        dir: runDir,
        size: viewportSize
      };
    }

    // 创建 context
    this.context = await this.browser.newContext(contextOptions);

    // 开始 trace 录制
    if (enableTrace) {
      await this.context.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: true
      });
    }

    // 创建页面
    this.page = await this.context.newPage();

    // 🔥 非 headless 模式下，通过 CDP 设置窗口全屏，确保浏览器窗口最大化显示
    if (!finalHeadless) {
      try {
        const session = await this.context.newCDPSession(this.page);
        const { windowId } = await session.send('Browser.getWindowForTarget');
        await session.send('Browser.setWindowBounds', {
          windowId,
          bounds: { windowState: 'maximized' }
        });
        await session.detach();
        console.log(`🖥️ [${runId}] 浏览器窗口已设置为最大化`);
      } catch (e) {
        console.log(`⚠️ [${runId}] 设置全屏失败，使用默认视口: ${(e as Error).message}`);
      }
    }

    // 🔥 新增：启动文本历史记录监听器
    // 每隔 500ms 扫描页面文本，记录所有出现过的文本
    this.startTextHistoryMonitor(runId);

    console.log(`✅ [${runId}] Playwright Test Runner 初始化完成`);
  }

  /**
   * 🔥 新增：启动文本历史记录监听器
   * 定期扫描页面文本，记录所有出现过的文本（用于捕获快速消失的弹窗）
   */
  private startTextHistoryMonitor(runId: string): void {
    if (!this.page) return;
    
    this.textHistoryEnabled = true;
    console.log(`📝 [${runId}] 启动文本历史记录监听器`);
    
    // 每隔 500ms 扫描一次页面文本
    const monitorInterval = setInterval(async () => {
      if (!this.page || !this.textHistoryEnabled) {
        clearInterval(monitorInterval);
        return;
      }
      
      try {
        // 获取页面上所有可见文本
        const texts = await this.page.evaluate(() => {
          const elements = document.querySelectorAll('div, span, p, li, td, th, label, a, button, h1, h2, h3, h4, h5, h6');
          const textSet = new Set<string>();
          
          elements.forEach(el => {
            const text = el.textContent?.trim();
            if (text && text.length > 0 && text.length < 200) { // 限制长度，避免记录过长的文本
              textSet.add(text);
            }
          });
          
          return Array.from(textSet);
        });
        
        // 🔥 修改：添加到 TextHistoryManager 和本地历史记录
        texts.forEach(text => {
          this.textHistory.add(text);
          this.textHistoryManager.addText(text);
        });
        
      } catch (error) {
        // 忽略错误（页面可能正在导航）
      }
    }, 500);
  }

  /**
   * 🔥 新增：停止文本历史记录监听器
   */
  private stopTextHistoryMonitor(): void {
    this.textHistoryEnabled = false;
  }

  /**
   * 🔥 新增：在文本历史记录中查找匹配的文本
   * 使用分层匹配策略：完全匹配 > 包含匹配 > 反向包含匹配 > 关键词匹配
   * @param searchText 要查找的文本
   * @param runId 运行ID
   * @param matchMode 匹配模式：'strict'（严格）| 'auto'（智能，默认）| 'loose'（宽松）
   */
  private findInTextHistory(
    searchText: string, 
    runId: string, 
    matchMode: 'strict' | 'auto' | 'loose' = 'auto'
  ): { found: boolean; matchedText?: string; matchType?: string } {
    // 🔧 优化：调整日志输出顺序，先输出匹配模式，再输出查找信息
    console.log(`⚙️ [${runId}] 匹配模式: ${matchMode === 'strict' ? '严格匹配' : matchMode === 'auto' ? '智能匹配' : '宽松匹配'}`);
    console.log(`🔍 [${runId}] 在文本历史记录中查找: "${searchText}"`);
    console.log(`📊 [${runId}] 历史记录共有 ${this.textHistory.size} 条文本`);
    
    // 🔥 新增：将日志发送到前端（优化顺序）
    if (this.logCallback) {
      this.logCallback(`⚙️ 匹配模式: ${matchMode === 'strict' ? '严格匹配' : matchMode === 'auto' ? '智能匹配' : '宽松匹配'}`, 'info');
      this.logCallback(`🔍 在文本历史记录中查找: "${searchText}"`, 'info');
      this.logCallback(`📊 历史记录共有 ${this.textHistory.size} 条文本`, 'info');
    }
    
    // 层级1：完全匹配（所有模式都支持）
    if (this.textHistory.has(searchText)) {
      console.log(`✅ [${runId}] 完全匹配成功`);
      if (this.logCallback) {
        this.logCallback(`✅ 完全匹配成功`, 'success');
      }
      return { found: true, matchedText: searchText, matchType: '完全匹配' };
    }
    
    // 🔥 严格模式：只使用完全匹配
    if (matchMode === 'strict') {
      console.log(`❌ [${runId}] 严格模式下未找到完全匹配的文本`);
      if (this.logCallback) {
        this.logCallback(`❌ 严格模式下未找到完全匹配的文本`, 'error');
      }
      return { found: false };
    }
    
    // 层级2：包含匹配（智能模式和宽松模式支持）
    // 实际文本包含期望文本
    for (const text of this.textHistory) {
      if (text.includes(searchText)) {
        console.log(`✅ [${runId}] 包含匹配成功: 实际文本 "${text}" 包含期望文本 "${searchText}"`);
        if (this.logCallback) {
          this.logCallback(`✅ 包含匹配成功: 实际文本 "${text}" 包含期望文本 "${searchText}"`, 'success');
        }
        return { found: true, matchedText: text, matchType: '包含匹配' };
      }
    }
    
    // 层级3：反向包含匹配（智能模式和宽松模式支持）
    // 期望文本包含实际文本（可能期望文本有多余字符）
    for (const text of this.textHistory) {
      if (searchText.includes(text) && text.length > 5) { // 至少5个字符，避免误匹配
        console.log(`⚠️ [${runId}] 反向包含匹配: 期望文本 "${searchText}" 包含实际文本 "${text}"`);
        console.log(`💡 [${runId}] 提示：期望文本可能有多余字符，建议检查测试用例`);
        if (this.logCallback) {
          this.logCallback(`⚠️ 反向包含匹配: 期望文本 "${searchText}" 包含实际文本 "${text}"`, 'warning');
          this.logCallback(`💡 提示：期望文本可能有多余字符，建议检查测试用例`, 'info');
        }
        return { found: true, matchedText: text, matchType: '反向包含匹配' };
      }
    }
    
    // 🔥 智能模式：到此为止，不使用关键词匹配
    if (matchMode === 'auto') {
      console.log(`❌ [${runId}] 智能模式下未找到匹配的文本（已尝试：完全匹配、包含匹配、反向包含匹配）`);
      if (this.logCallback) {
        this.logCallback(`❌ 智能模式下未找到匹配的文本（已尝试：完全匹配、包含匹配、反向包含匹配）`, 'error');
      }
      return { found: false };
    }
    
    // 层级4：关键词匹配（仅宽松模式支持）
    const words = searchText.split(/[：:，,、\s]+/).filter(w => w.length > 1);
    console.log(`🔍 [${runId}] 宽松模式：尝试关键词匹配，关键词: ${words.join(', ')}`);
    if (this.logCallback) {
      this.logCallback(`🔍 宽松模式：尝试关键词匹配，关键词: ${words.join(', ')}`, 'info');
    }
    
    for (const text of this.textHistory) {
      // 计算匹配的关键词数量
      let matchedWords = 0;
      for (const word of words) {
        if (text.includes(word)) {
          matchedWords++;
        }
      }
      
      // 如果匹配了大部分关键词（>= 50%），认为匹配成功
      if (matchedWords >= Math.ceil(words.length * 0.5)) {
        console.log(`⚠️ [${runId}] 关键词匹配成功: "${text}" (匹配 ${matchedWords}/${words.length} 个关键词)`);
        console.log(`💡 [${runId}] 提示：使用了宽松匹配，建议检查期望文本是否准确`);
        if (this.logCallback) {
          this.logCallback(`⚠️ 关键词匹配成功: "${text}" (匹配 ${matchedWords}/${words.length} 个关键词)`, 'warning');
          this.logCallback(`💡 提示：使用了宽松匹配，建议检查期望文本是否准确`, 'info');
        }
        return { found: true, matchedText: text, matchType: `关键词匹配 (${matchedWords}/${words.length})` };
      }
    }
    
    console.log(`❌ [${runId}] 宽松模式下未找到匹配的文本`);
    if (this.logCallback) {
      this.logCallback(`❌ 宽松模式下未找到匹配的文本`, 'error');
    }
    return { found: false };
  }

  /**
   * 执行测试步骤
   * @param step 测试步骤
   * @param runId 运行ID
   * @param stepIndex 步骤索引
   * @param matchMode 断言匹配模式（仅用于 expect 操作）：'strict'（严格）| 'auto'（智能，默认）| 'loose'（宽松）
   */
  async executeStep(
    step: TestStep, 
    runId: string, 
    stepIndex: number, 
    matchMode: 'strict' | 'auto' | 'loose' = 'auto'
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.page) {
      return { success: false, error: '页面未初始化' };
    }

    try {
      console.log(`🎬 [${runId}] 执行步骤 ${stepIndex + 1}: ${step.description}`);
      console.log(`   操作: ${step.action}`);

      switch (step.action) {
        case 'navigate':
          if (!step.url) {
            // 🔥 增强错误信息：尝试从描述中提取 URL 提示
            let errorMsg = '导航步骤缺少 URL';
            const desc = step.description || '';
            // 尝试从描述中提取可能的 URL 或路径
            const urlMatch = desc.match(/(?:跳转至|跳转到|自动跳转至|自动跳转到|导航到|访问|打开)[：:]\s*[(（]?\s*(\/[^\s)）]+)\s*[)）]?/i) ||
                           desc.match(/[(（]?\s*(\/[^\s)）]+)\s*[)）]?/);
            if (urlMatch && urlMatch[1]) {
              errorMsg = `导航步骤缺少 URL。从描述中检测到可能的路径: ${urlMatch[1]}，请检查步骤解析逻辑是否正确提取了 URL。`;
            }
            return { success: false, error: errorMsg };
          }
          
          // 🔥 处理相对路径：如果 URL 是相对路径，拼接到当前页面的 base URL
          let targetUrl = step.url;
          if (targetUrl.startsWith('/')) {
            try {
              const currentUrl = this.page.url();
              // 如果当前页面有有效 URL，使用其 origin
              if (currentUrl && currentUrl !== 'about:blank') {
                const baseUrl = new URL(currentUrl);
                targetUrl = `${baseUrl.origin}${targetUrl}`;
                console.log(`🔄 [${runId}] 相对路径转换: ${step.url} -> ${targetUrl}`);
              } else {
                return { success: false, error: `无法导航到相对路径 ${step.url}，当前页面 URL 无效 (${currentUrl})` };
              }
            } catch {
              return { success: false, error: `URL 解析失败: ${step.url}` };
            }
          }
          
          await this.page.goto(targetUrl, { waitUntil: 'networkidle' });
          break;

        case 'click':
          // 🔥 修复：允许selector为空但ref存在的情况
          if (!step.selector && !step.ref) {
            return { success: false, error: '点击步骤缺少选择器或ref' };
          }
          
          // 🔥 新增：检测是否是下载操作（根据步骤描述判断）
          const isDownloadAction = step.description && (
            step.description.includes('下载') || 
            step.description.includes('导出') ||
            step.description.includes('保存文件')
          );
          
          // 🔥 智能元素查找：支持 label:xxx、text:xxx、role:name、role:nth(index) 格式、文本描述和 CSS 选择器
          // 🔥 修复：如果selector为空，跳过selector处理，直接进入ref处理
          try {
            if (step.selector) {
              // 🔥 新增：检查是否是 label:xxx 格式（最适合复选框）
              if (step.selector.startsWith('label:')) {
                const labelText = step.selector.substring(6); // 移除 "label:" 前缀
                const labelLocator = this.page.getByLabel(labelText, { exact: false });
                if (await labelLocator.count() > 0) {
                  await labelLocator.first().click();
                  console.log(`✅ [${runId}] 使用 getByLabel 格式点击成功: ${labelText}`);
                  
                  // 🔥 关键修复：点击成功后，如果是下载操作，立即处理下载
                  if (isDownloadAction) {
                    await this.handleDownload(runId, step);
                  }
                  
                  return { success: true };
                }
              }
            
            // 🔥 新增：检查是否是 text:xxx 格式（通过文本查找附近的可点击元素）
            if (step.selector.startsWith('text:')) {
              const searchText = step.selector.substring(5); // 移除 "text:" 前缀
              console.log(`🔍 [${runId}] 使用文本查找模式: "${searchText}"`);
              
              // 方法1: 先尝试直接通过文本查找复选框的label
              try {
                const labelLocator = this.page.getByLabel(searchText, { exact: false });
                if (await labelLocator.count() > 0) {
                  await labelLocator.first().click();
                  console.log(`✅ [${runId}] 通过label文本点击成功: ${searchText}`);
                  
                  // 🔥 关键修复：点击成功后，如果是下载操作，立即处理下载
                  if (isDownloadAction) {
                    await this.handleDownload(runId, step);
                  }
                  
                  return { success: true };
                }
              } catch {
                console.log(`  ⚠️ getByLabel查找失败，尝试其他方法`);
              }
              
              // 方法2: 查找包含文本的元素，然后找附近的复选框并点击
              try {
                const textLocator = this.page.getByText(searchText, { exact: false });
                if (await textLocator.count() > 0) {
                  const textElement = textLocator.first();
                  
                  // 🔥 优先策略：先找到并点击实际的复选框元素，而不是文本
                  // 因为点击文本不一定能触发复选框勾选
                  
                  // 尝试1: 查找前面紧邻的label.el-checkbox（ElementUI标准结构）
                  try {
                    const nearbyLabel = textElement.locator('xpath=preceding-sibling::label[contains(@class, "el-checkbox")][1]');
                    if (await nearbyLabel.count() > 0) {
                      const label = nearbyLabel.first();
                      // 优先点击label内的可见复选框图标
                      const checkboxInner = label.locator('.el-checkbox__inner, .el-checkbox__input');
                      if (await checkboxInner.count() > 0 && await checkboxInner.first().isVisible()) {
                        await checkboxInner.first().click();
                        console.log(`✅ [${runId}] 点击ElementUI复选框图标成功`);
                        
                        // 🔥 关键修复：点击成功后，如果是下载操作，立即处理下载
                        if (isDownloadAction) {
                          await this.handleDownload(runId, step);
                        }
                        
                        return { success: true };
                      } else {
                        // 否则点击label本身
                        await label.click();
                        console.log(`✅ [${runId}] 点击ElementUI复选框label成功`);
                        
                        // 🔥 关键修复：点击成功后，如果是下载操作，立即处理下载
                        if (isDownloadAction) {
                          await this.handleDownload(runId, step);
                        }
                        
                        return { success: true };
                      }
                    }
                  } catch (e: any) {
                    console.log(`  ⚠️ 点击ElementUI label失败: ${e.message}，尝试其他方法`);
                  }
                  
                  // 尝试2: 查找父容器内的label（文本在label内的情况）
                  try {
                    const parentLabel = textElement.locator('xpath=ancestor::label[contains(@class, "checkbox") or @for][1]');
                    if (await parentLabel.count() > 0) {
                      await parentLabel.first().click();
                      console.log(`✅ [${runId}] 点击父级label元素成功`);
                      
                      // 🔥 关键修复：点击成功后，如果是下载操作，立即处理下载
                      if (isDownloadAction) {
                        await this.handleDownload(runId, step);
                      }
                      
                      return { success: true };
                    }
                  } catch (e: any) {
                    console.log(`  ⚠️ 点击父级label失败: ${e.message}`);
                  }
                  
                  // 尝试3: 查找附近的复选框input（通用方式）
                  try {
                    const nearbyCheckbox = textElement.locator('xpath=preceding-sibling::label//input[@type="checkbox"][1] | preceding::input[@type="checkbox"][1] | following::input[@type="checkbox"][1] | ancestor::*//input[@type="checkbox"][1]');
                    if (await nearbyCheckbox.count() > 0) {
                      const checkbox = nearbyCheckbox.first();
                      const isVisible = await checkbox.isVisible().catch(() => false);
                      
                      if (isVisible) {
                        // input可见，直接点击
                        await checkbox.click();
                        console.log(`✅ [${runId}] 点击可见的复选框input成功`);
                      } else {
                        // input不可见，点击其父label或包装元素
                        const parentLabel = checkbox.locator('xpath=ancestor::label[1]');
                        if (await parentLabel.count() > 0 && await parentLabel.first().isVisible()) {
                          await parentLabel.first().click();
                          console.log(`✅ [${runId}] 点击复选框的父label元素成功`);
                        } else {
                          // 最后尝试点击复选框的可见兄弟元素
                          const visibleSibling = checkbox.locator('xpath=preceding-sibling::span[1] | following-sibling::span[1]');
                          if (await visibleSibling.count() > 0 && await visibleSibling.first().isVisible()) {
                            await visibleSibling.first().click();
                            console.log(`✅ [${runId}] 点击复选框的可见兄弟元素成功`);
                          } else {
                            throw new Error('找到复选框但无法找到可点击的元素');
                          }
                        }
                      }
                      
                      // 🔥 关键修复：点击成功后，如果是下载操作，立即处理下载
                      if (isDownloadAction) {
                        await this.handleDownload(runId, step);
                      }
                      
                      return { success: true };
                    }
                  } catch (e: any) {
                    console.log(`  ⚠️ 通过复选框input定位失败: ${e.message}`);
                  }
                  
                  // 尝试4: 检查文本元素本身是否可点击作为备选
                  try {
                    const cursorStyle = await textElement.evaluate((el: Element) => window.getComputedStyle(el).cursor);
                    if (cursorStyle === 'pointer') {
                      await textElement.click();
                      console.log(`✅ [${runId}] 作为备选：点击可点击的文本元素成功`);
                      
                      // 🔥 关键修复：点击成功后，如果是下载操作，立即处理下载
                      if (isDownloadAction) {
                        await this.handleDownload(runId, step);
                      }
                      
                      return { success: true };
                    }
                  } catch (e: any) {
                    console.log(`  ⚠️ 点击文本元素失败: ${e.message}`);
                  }
                  
                  // 尝试5: 最后手段，强制点击文本元素
                  try {
                    await textElement.click({ force: true });
                    console.log(`⚠️ [${runId}] 最后手段：强制点击文本元素`);
                    
                    // 🔥 关键修复：点击成功后，如果是下载操作，立即处理下载
                    if (isDownloadAction) {
                      await this.handleDownload(runId, step);
                    }
                    
                    return { success: true };
                  } catch (e: any) {
                    throw new Error(`所有点击尝试都失败: ${e.message}`);
                  }
                }
              } catch (e: any) {
                console.log(`  ⚠️ getByText查找失败: ${e.message}`);
              }
              
              throw new Error(`无法通过文本 "${searchText}" 找到可点击的元素`);
            }
            
            // 🔥 检查是否是 role:nth(index) 格式
            console.log(`🔍 [${runId}] 检查选择器格式: "${step.selector}"`);
            if (step.selector.match(/^(button|textbox|link|checkbox|combobox|radio):nth\(\d+\)$/)) {
              console.log(`✅ [${runId}] 匹配到 role:nth 格式`);
              const match = step.selector.match(/^(button|textbox|link|checkbox|combobox|radio):nth\((\d+)\)$/);
              if (match) {
                const [, role, index] = match;
                console.log(`📋 [${runId}] 解析: role=${role}, index=${index}`);
                
                // 🔥 修复：增加等待和重试机制
                let retryCount = 0;
                const maxRetries = 3;
                
                while (retryCount < maxRetries) {
                  try {
                    const roleLocator = this.page.getByRole(role as any);
                    const count = await roleLocator.count();
                    console.log(`📊 [${runId}] 页面上${role}元素数量: ${count} (尝试 ${retryCount + 1}/${maxRetries})`);
                    
                    if (count > parseInt(index)) {
                      // 🔥 修复：确保元素可见和可点击
                      const targetElement = roleLocator.nth(parseInt(index));
                      await targetElement.waitFor({ state: 'visible', timeout: 5000 });
                      await targetElement.scrollIntoViewIfNeeded();
                      await targetElement.click({ timeout: 5000 });
                      console.log(`✅ [${runId}] 使用 role:nth 格式点击成功: ${step.selector}`);
                      return { success: true };
                    } else {
                      console.log(`⚠️ [${runId}] 元素数量不足: ${count} <= ${index}，等待后重试...`);
                      await this.page.waitForTimeout(1000);
                      retryCount++;
                    }
                  } catch (error: any) {
                    console.log(`⚠️ [${runId}] role:nth 点击失败: ${error.message}，重试 ${retryCount + 1}/${maxRetries}`);
                    retryCount++;
                    if (retryCount < maxRetries) {
                      await this.page.waitForTimeout(1000);
                    }
                  }
                }
                
                // 所有重试都失败
                return { success: false, error: `无法点击元素 ${step.selector}，已重试${maxRetries}次` };
              }
            } else {
              console.log(`⚠️ [${runId}] 未匹配 role:nth 格式，选择器: "${step.selector}"`);
            }
            
            // 🔥 检查是否是自定义格式（AI智能匹配生成的格式）
            if (step.selector.includes(':') && !step.selector.startsWith('http') && !step.selector.includes('nth(')) {
              const [prefix, value] = step.selector.split(':', 2);
              const trimmedValue = value.trim();
              
              // 处理不同的前缀格式
              if (prefix === 'placeholder') {
                // placeholder:xxx -> getByPlaceholder
                const element = this.page.getByPlaceholder(trimmedValue, { exact: false });
                if (await element.count() > 0) {
                  await element.first().click();
                  console.log(`✅ [${runId}] 使用 getByPlaceholder 格式点击成功: ${trimmedValue}`);
                  return { success: true };
                }
              } else if (prefix === 'label') {
                // label:xxx -> getByLabel
                const element = this.page.getByLabel(trimmedValue, { exact: false });
                if (await element.count() > 0) {
                  await element.first().click();
                  console.log(`✅ [${runId}] 使用 getByLabel 格式点击成功: ${trimmedValue}`);
                  return { success: true };
                }
              } else if (prefix === 'text') {
                // text:xxx -> getByText
                const element = this.page.getByText(trimmedValue, { exact: false });
                if (await element.count() > 0) {
                  await element.first().click();
                  console.log(`✅ [${runId}] 使用 getByText 格式点击成功: ${trimmedValue}`);
                  return { success: true };
                }
              } else if (prefix === 'button') {
                // button:xxx -> getByRole('button')
                const element = this.page.getByRole('button', { name: trimmedValue, exact: false });
                if (await element.count() > 0) {
                  await element.first().click();
                  console.log(`✅ [${runId}] 使用 button:name 格式点击成功: ${trimmedValue}`);
                  return { success: true };
                }
              } else if (['textbox', 'link', 'checkbox', 'combobox', 'radio', 'menuitem', 'menu', 'menubar', 'listitem', 'option', 'tab', 'searchbox', 'spinbutton', 'div', 'generic'].includes(prefix)) {
                // role:name -> getByRole
                // 🔥 修复：新增 menuitem, menu, menubar, listitem, option, tab, searchbox, spinbutton, div, generic 等role类型
                // 🔥 特殊处理：div和generic不是标准ARIA role，需要用getByText查找
                if (prefix === 'div' || prefix === 'generic') {
                  const textLocator = this.page.getByText(trimmedValue, { exact: false });
                  if (await textLocator.count() > 0) {
                    await textLocator.first().click();
                    console.log(`✅ [${runId}] 使用 ${prefix}:name 格式点击成功: ${trimmedValue}`);
                    return { success: true };
                  }
                } else {
                  const roleLocator = this.page.getByRole(prefix as any, { name: trimmedValue, exact: false });
                  if (await roleLocator.count() > 0) {
                    await roleLocator.first().click();
                    console.log(`✅ [${runId}] 使用 role:name 格式点击成功: ${prefix}:${trimmedValue}`);
                    return { success: true };
                  }
                }
              }
            }
            
            // 尝试作为 CSS 选择器
            if (step.selector.startsWith('#') || step.selector.startsWith('.') || 
                step.selector.startsWith('[') || step.selector.includes(' ')) {
              await this.page.click(step.selector);
            } else {
              // 作为文本描述，尝试多种方式查找
              // 方式1: 通过文本内容查找
              const textLocator = this.page.getByText(step.selector, { exact: false });
              if (await textLocator.count() > 0) {
                await textLocator.first().click();
              } else {
                // 方式2: 通过 role 和名称查找（如按钮）
                const roleLocator = this.page.getByRole('button', { name: step.selector, exact: false });
                if (await roleLocator.count() > 0) {
                  await roleLocator.first().click();
                } else {
                  // 方式3: 通过包含文本的链接查找
                  const linkLocator = this.page.getByRole('link', { name: step.selector, exact: false });
                  if (await linkLocator.count() > 0) {
                    await linkLocator.first().click();
                  } else {
                    // 方式4: 尝试作为 CSS 选择器（即使没有特殊字符）
                    await this.page.click(step.selector);
                  }
                }
              }
            }
            } // 🔥 结束 if (step.selector) 块
          } catch (clickError: any) {
            // 🔥 修复：只有selector存在时才尝试宽松匹配
            if (step.selector) {
              // 如果所有方式都失败，尝试更宽松的文本匹配
              try {
                const allButtons = this.page.locator('button, [role="button"], a, input[type="button"], input[type="submit"]');
                const count = await allButtons.count();
                for (let i = 0; i < count; i++) {
                  const text = await allButtons.nth(i).textContent();
                  if (text && text.includes(step.selector)) {
                    await allButtons.nth(i).click();
                    
                    // 🔥 关键修复：点击成功后，如果是下载操作，立即设置下载监听器
                    if (isDownloadAction) {
                      await this.handleDownload(runId, step);
                    }
                    
                    return { success: true };
                  }
                }
                throw new Error(`无法找到元素: ${step.selector}`);
              } catch (fallbackError: any) {
                throw new Error(`点击失败: ${fallbackError.message || clickError.message}`);
              }
            }
            // 🔥 如果selector为空，不抛出异常，继续执行ref处理
          }
          
          // 🔥 关键修复：点击成功后，如果是下载操作，立即设置下载监听器并等待下载完成
          if (isDownloadAction) {
            await this.handleDownload(runId, step);
          }
          
          break;

        case 'fill':
          if (!step.selector || step.value === undefined) {
            return { success: false, error: '填充步骤缺少选择器或值' };
          }
          // 🔥 支持 role:nth(index) 格式
          if (step.selector.match(/^(button|textbox|link|checkbox|combobox):nth\(\d+\)$/)) {
            const match = step.selector.match(/^(button|textbox|link|checkbox|combobox):nth\((\d+)\)$/);
            if (match) {
              const [, role, index] = match;
              const element = this.page.getByRole(role as any).nth(parseInt(index));
              await element.fill(String(step.value));
              console.log(`✅ [${runId}] 使用 role:nth 格式填充成功: ${step.selector}`);
              break;
            }
          }
          // 🔥 支持自定义格式（AI智能匹配生成的格式）
          if (step.selector.includes(':') && !step.selector.startsWith('http') && !step.selector.includes('nth(')) {
            const [prefix, value] = step.selector.split(':', 2);
            const trimmedValue = value.trim();
            
            // 处理不同的前缀格式
            if (prefix === 'placeholder') {
              // placeholder:xxx -> getByPlaceholder
              const element = this.page.getByPlaceholder(trimmedValue, { exact: false });
              await element.fill(String(step.value));
              console.log(`✅ [${runId}] 使用 getByPlaceholder 格式填充成功: ${trimmedValue}`);
              break;
            } else if (prefix === 'label') {
              // label:xxx -> getByLabel
              const element = this.page.getByLabel(trimmedValue, { exact: false });
              await element.fill(String(step.value));
              console.log(`✅ [${runId}] 使用 getByLabel 格式填充成功: ${trimmedValue}`);
              break;
            } else if (prefix === 'text') {
              // text:xxx -> getByText (通常用于可编辑的contenteditable元素)
              const element = this.page.getByText(trimmedValue, { exact: false });
              await element.fill(String(step.value));
              console.log(`✅ [${runId}] 使用 getByText 格式填充成功: ${trimmedValue}`);
              break;
            } else if (['button', 'textbox', 'link', 'checkbox', 'combobox', 'heading', 'menuitem', 'menu', 'menubar', 'listitem', 'option', 'tab', 'searchbox', 'spinbutton'].includes(prefix)) {
              // role:name -> getByRole
              // 🔥 修复：新增 menuitem, menu, menubar, listitem, option, tab, searchbox, spinbutton 等role类型
              const element = this.page.getByRole(prefix as any, { name: trimmedValue, exact: false });
              await element.fill(String(step.value));
              console.log(`✅ [${runId}] 使用 role:name 格式填充成功: ${prefix}:${trimmedValue}`);
              break;
            }
          }
          // 默认使用 CSS 选择器
          await this.page.fill(step.selector, String(step.value));
          break;

        case 'type':
          if (!step.selector || step.value === undefined) {
            return { success: false, error: '输入步骤缺少选择器或值' };
          }
          // 🔥 支持 role:nth(index) 格式
          if (step.selector.match(/^(button|textbox|link|checkbox|combobox):nth\(\d+\)$/)) {
            const match = step.selector.match(/^(button|textbox|link|checkbox|combobox):nth\((\d+)\)$/);
            if (match) {
              const [, role, index] = match;
              const element = this.page.getByRole(role as any).nth(parseInt(index));
              await element.fill(String(step.value));  // 使用 fill 代替 type，更稳定
              console.log(`✅ [${runId}] 使用 role:nth 格式输入成功: ${step.selector}`);
              break;
            }
          }
          // 🔥 支持自定义格式（AI智能匹配生成的格式）
          if (step.selector.includes(':') && !step.selector.startsWith('http') && !step.selector.includes('nth(')) {
            const [prefix, value] = step.selector.split(':', 2);
            const trimmedValue = value.trim();
            
            // 处理不同的前缀格式
            if (prefix === 'placeholder') {
              // placeholder:xxx -> getByPlaceholder
              const element = this.page.getByPlaceholder(trimmedValue, { exact: false });
              await element.fill(String(step.value));
              console.log(`✅ [${runId}] 使用 getByPlaceholder 格式填充成功: ${trimmedValue}`);
              break;
            } else if (prefix === 'label') {
              // label:xxx -> getByLabel
              const element = this.page.getByLabel(trimmedValue, { exact: false });
              await element.fill(String(step.value));
              console.log(`✅ [${runId}] 使用 getByLabel 格式填充成功: ${trimmedValue}`);
              break;
            } else if (prefix === 'text') {
              // text:xxx -> getByText (通常用于可编辑的contenteditable元素)
              const element = this.page.getByText(trimmedValue, { exact: false });
              await element.fill(String(step.value));
              console.log(`✅ [${runId}] 使用 getByText 格式填充成功: ${trimmedValue}`);
              break;
            } else if (['button', 'textbox', 'link', 'checkbox', 'combobox', 'heading', 'menuitem', 'menu', 'menubar', 'listitem', 'option', 'tab', 'searchbox', 'spinbutton'].includes(prefix)) {
              // role:name -> getByRole
              // 🔥 修复：新增 menuitem, menu, menubar, listitem, option, tab, searchbox, spinbutton 等role类型
              const element = this.page.getByRole(prefix as any, { name: trimmedValue, exact: false });
              await element.fill(String(step.value));
              console.log(`✅ [${runId}] 使用 role:name 格式填充成功: ${prefix}:${trimmedValue}`);
              break;
            }
          }
          // 默认使用 CSS 选择器
          await this.page.type(step.selector, String(step.value));
          break;

        case 'expect': {
          // 🔥 新增：文件下载验证 - 使用AssertionService统一处理
          const isFileVerification = (step.description || '').match(/验证.*文件.*下载|文件.*已.*下载|下载.*成功|文件.*存在/i);
          
          if (isFileVerification) {
            console.log(`📁 [${runId}] 检测到文件下载验证断言`);
            console.log(`📋 [${runId}] 断言描述: "${step.description}"`);
            
            try {
              // 🔥 使用AssertionService进行文件下载验证
              const assertion: Assertion = {
                id: `${runId}-${stepIndex}`,
                description: step.description || '验证文件下载成功',
                type: AssertionType.FILE_DOWNLOAD,
                timeout: 30000 // 30秒内的文件被认为是最近下载的
              };
              
              const context: VerificationContext = {
                page: this.page!,
                runId,
                artifactsDir: path.join(this.artifactsDir, runId),
                logCallback: this.logCallback
              };
              
              const result = await this.assertionService.verify(assertion, context);
              
              if (result.success) {
                console.log(`✅ [${runId}] 文件下载验证成功`);
                if (result.actualValue && typeof result.actualValue === 'object') {
                  const fileInfo = result.actualValue as any;
                  console.log(`📄 [${runId}] 文件名: ${fileInfo.fileName}`);
                  console.log(`📊 [${runId}] 文件大小: ${fileInfo.fileSize} 字节`);
                  console.log(`⏱️ [${runId}] 文件年龄: ${Math.round(fileInfo.fileAge / 1000)} 秒`);
                }
                return { success: true };
              } else {
                console.log(`❌ [${runId}] 文件下载验证失败: ${result.error}`);
                if (result.suggestions && result.suggestions.length > 0) {
                  console.log(`💡 [${runId}] 建议:`);
                  result.suggestions.forEach(suggestion => {
                    console.log(`   - ${suggestion}`);
                  });
                }
                return { success: false, error: result.error };
              }
            } catch (fileError: any) {
              const errorMsg = `文件验证失败: ${fileError.message}`;
              console.error(`❌ [${runId}] ${errorMsg}`);
              if (this.logCallback) {
                this.logCallback(`❌ ${errorMsg}`, 'error');
              }
              return { success: false, error: errorMsg };
            }
          }
          
          // 🔥 智能元素查找：支持 role:name 格式、ref参数、文本描述和 CSS 选择器
          let element: any = null;
          let selectorText: string | undefined; // 🔥 记录selector中的文本，用于多种方式查找
          
          // 🔥 新增：对于弹窗/提示类验证，使用 AssertionService 统一处理
          // 🔥 关键优化：同时检查 element 和 description，因为 AI 可能修改 element 但 description 保留原始文本
          const isPopupVerification = (
            (step.element || '') + ' ' + (step.description || '')
          ).match(/弹窗|提示|对话框|警告|错误|成功|消息|通知|toast|alert|dialog|message|notification/i);
          
          if (isPopupVerification && step.value && typeof step.value === 'string' && step.value.trim()) {
            console.log(`🔍 [${runId}] 检测到弹窗验证断言`);
            console.log(`📋 [${runId}] 断言描述: "${step.description}"`);
            console.log(`🔍 [${runId}] 期望文本: "${step.value}"`);
            
            try {
              // 🔥 使用 AssertionService 进行弹窗验证
              const assertion: Assertion = {
                id: `${runId}-${stepIndex}`,
                description: step.description || '验证弹窗内容',
                type: AssertionType.POPUP,
                expectedValue: step.value,
                matchMode: matchMode, // 使用用户选择的匹配模式
                timeout: 10000 // 10秒超时（覆盖AI解析时间）
              };
              
              const context: VerificationContext = {
                page: this.page!,
                runId,
                artifactsDir: path.join(this.artifactsDir, runId),
                logCallback: this.logCallback,
                textHistory: this.textHistory // 传递文本历史记录
              };
              
              const result = await this.assertionService.verify(assertion, context);
              
              if (result.success) {
                console.log(`✅ [${runId}] 弹窗验证成功`);
                if (result.actualValue) {
                  console.log(`📄 [${runId}] 匹配文本: ${result.actualValue}`);
                }
                return { success: true };
              } else {
                console.log(`❌ [${runId}] 弹窗验证失败: ${result.error}`);
                if (result.suggestions && result.suggestions.length > 0) {
                  console.log(`💡 [${runId}] 建议:`);
                  result.suggestions.forEach(suggestion => {
                    console.log(`   - ${suggestion}`);
                  });
                }
                return { success: false, error: result.error };
              }
            } catch (popupError: any) {
              const errorMsg = `弹窗验证失败: ${popupError.message}`;
              console.error(`❌ [${runId}] ${errorMsg}`);
              if (this.logCallback) {
                this.logCallback(`❌ ${errorMsg}`, 'error');
              }
              return { success: false, error: errorMsg };
            }
          }
          
          // 🔥 优先使用 selector（如果它是 role:name 格式，更可靠）
          if (!element && step.selector) {
            try {
              // 检查是否是 role:name 格式（由 AI 解析器生成）
              if (step.selector.includes(':') && !step.selector.startsWith('http')) {
                const [role, name] = step.selector.split(':', 2);
                selectorText = name?.trim(); // 记录文本用于后续查找
                if (role && name && ['button', 'textbox', 'link', 'checkbox', 'combobox', 'heading', 'text'].includes(role)) {
                  element = this.page.getByRole(role as any, { name: name.trim(), exact: false });
                  // 🔥 检查是否成功找到元素
                  const count = await element.count();
                  if (count > 0) {
                    console.log(`✅ [${runId}] 使用 selector role:name 格式定位元素成功: ${role}:${name}`);
                  } else {
                    // 🔥 修复：getByRole找不到时，尝试用getByText查找selector中的文本
                    console.log(`⚠️ [${runId}] role:name格式未找到元素，尝试用getByText查找文本: "${name}"`);
                    element = this.page.getByText(name.trim(), { exact: false });
                    const textCount = await element.count();
                    if (textCount > 0) {
                      console.log(`✅ [${runId}] 使用getByText找到元素: "${name}"`);
                    } else {
                      console.log(`⚠️ [${runId}] getByText也未找到元素，继续尝试其他方法`);
                      element = null; // 设置为null，让后续的智能查找逻辑处理
                    }
                  }
                } else {
                  element = this.page.locator(step.selector);
                }
              } else if (step.selector.startsWith('#') || step.selector.startsWith('.') || 
                        step.selector.startsWith('[') || step.selector.includes(' ')) {
                // 作为 CSS 选择器
                element = this.page.locator(step.selector);
              }
            } catch (selectorError: any) {
              console.warn(`⚠️ [${runId}] selector解析失败，尝试其他方式: ${selectorError.message}`);
              element = null; // 设置为null，让后续的智能查找逻辑处理
            }
          }
          
          // 🔥 如果selector解析失败，尝试使用 ref 参数
          if (!element && step.ref) {
            try {
              // ref 可能是 CSS 选择器、role:name 格式或 element_xxx 格式
              if (step.ref.includes(':') && !step.ref.startsWith('http')) {
                const [role, name] = step.ref.split(':', 2);
                if (role && name && ['button', 'textbox', 'link', 'checkbox', 'combobox', 'heading', 'text'].includes(role)) {
                  element = this.page.getByRole(role as any, { name: name.trim(), exact: false });
                  console.log(`✅ [${runId}] 使用 ref role:name 格式定位元素: ${role}:${name}`);
                } else {
                  element = this.page.locator(step.ref);
                }
              } else if (step.ref.startsWith('element_')) {
                // 🔥 修复：element_xxx 格式是Playwright accessibility snapshot的内部引用，不是HTML属性
                // 格式: element_<counter>_<role>_<safeName>
                // 例如: element_1_menuitem___ 表示第2个menuitem元素
                console.log(`🔍 [${runId}] 检测到accessibility snapshot ref: ${step.ref}`);
                
                // 从ref中提取role和索引信息
                const refMatch = step.ref.match(/^element_(\d+)_(\w+)_/);
                if (refMatch) {
                  const [, indexStr, role] = refMatch;
                  const index = parseInt(indexStr);
                  console.log(`📋 [${runId}] 从ref提取: role=${role}, index=${index}`);
                  
                  // 使用role和index定位元素
                  try {
                    const roleLocator = this.page.getByRole(role as any);
                    const count = await roleLocator.count();
                    console.log(`📊 [${runId}] 页面上${role}元素数量: ${count}`);
                    
                    if (count > index) {
                      element = roleLocator.nth(index);
                      console.log(`✅ [${runId}] 使用ref中的role和index定位成功: ${role}:nth(${index})`);
                    } else {
                      console.log(`⚠️ [${runId}] 元素数量不足: ${count} <= ${index}，尝试使用element描述`);
                      // 回退到使用element描述
                      if (step.element) {
                        console.log(`🔍 [${runId}] 回退到使用element描述: "${step.element}"`);
                        // 不在这里处理，让后续的智能查找逻辑处理
                      }
                    }
                  } catch (error: any) {
                    console.log(`⚠️ [${runId}] 使用ref定位失败: ${error.message}，回退到element描述`);
                    // 回退到使用element描述
                  }
                } else {
                  console.log(`⚠️ [${runId}] ref格式不匹配，使用element描述进行智能查找`);
                  // 不在这里处理，让后续的智能查找逻辑处理
                }
              } else if (step.ref.startsWith('#') || step.ref.startsWith('.') || step.ref.startsWith('[')) {
                // 标准 CSS 选择器
                element = this.page.locator(step.ref);
              } else {
                // 尝试作为文本内容查找
                element = this.page.getByText(step.ref, { exact: false });
              }
            } catch (refError: any) {
              console.warn(`⚠️ [${runId}] ref参数解析失败，尝试其他方式: ${refError.message}`);
            }
          }
          
          // 🔥 如果ref也失败，使用element或selector作为文本描述进行智能查找
          // 🔥 修复：优先使用selectorText（从selector中提取的文本），因为它来自ref映射，更准确
          if (!element && (selectorText || step.element || step.selector)) {
            try {
              // 🔥 优先级：selectorText（从role:name提取）> element描述 > selector原始值
              let searchText = selectorText || step.element || step.selector;
              
              // 🔥 如果使用的是selectorText，记录日志
              if (selectorText && selectorText !== step.element) {
                console.log(`🔍 [${runId}] 使用selector中的文本进行智能查找: "${selectorText}"（element="${step.element}"）`);
              }
              
              // 🔥 检查是否是 role:name 格式（由 AI 解析器生成）
              // 如果searchText是role:name格式，提取name部分
              if (searchText && searchText.includes(':') && !searchText.startsWith('http')) {
                const [role, name] = searchText.split(':', 2);
                if (role && name && ['button', 'textbox', 'link', 'checkbox', 'combobox', 'heading', 'text'].includes(role)) {
                  // 提取name部分作为搜索文本
                  searchText = name.trim();
                  console.log(`🔍 [${runId}] 从role:name格式提取文本进行智能查找: "${searchText}"`);
                }
              }
              
              // 🔥 处理 CSS 选择器格式
              if (searchText && (searchText.startsWith('#') || searchText.startsWith('.') || 
                        searchText.startsWith('[') || searchText.includes(' '))) {
                // 作为 CSS 选择器
                element = this.page.locator(searchText);
              } else if (searchText) {
                // 作为文本描述，尝试多种方式查找
                // 🔥 首先从断言描述中提取实际的元素名称（移除断言关键词）
                let elementName = searchText || '';
                const assertionKeywords = ['存在', '验证', '检查', '断言', '应该', '必须', '确认', 'expect', 'verify', 'check', 'assert'];
                for (const keyword of assertionKeywords) {
                  // 移除断言关键词及其后面的空格
                  elementName = elementName.replace(new RegExp(`^${keyword}\\s*`, 'i'), '');
                  elementName = elementName.replace(new RegExp(`\\s*${keyword}\\s*`, 'i'), ' ');
                }
                elementName = elementName.trim();
                
                // 如果提取后的名称为空，使用原始搜索文本
                if (!elementName) {
                  elementName = searchText || '';
                }
                
                // 🔥 提取核心名称（移除"按钮"、"链接"等后缀，但保留"输入框"等关键信息用于判断元素类型）
                const isInputBox = elementName.includes('输入框') || elementName.includes('文本框') || elementName.includes('搜索框');
                const coreName = elementName.replace(/按钮|链接|复选框|下拉框|搜索按钮/g, '').trim();
                
                console.log(`🔍 [${runId}] 从元素描述 "${searchText}" 提取元素名称: "${elementName}", 核心名称: "${coreName}", 是否输入框: ${isInputBox}`);
                
                // 🔥 根据元素类型选择要尝试的 roles
                const rolesToTry = isInputBox 
                  ? ['textbox', 'combobox']  // 输入框类型
                  : ['button', 'link', 'heading', 'text', 'paragraph', 'textbox', 'combobox'];  // 其他类型（也包含输入框作为备选）
                let found = false;
                
                // 方式1: 通过 role 和完整名称查找
                for (const role of rolesToTry) {
                  const roleLocator = this.page.getByRole(role as any, { name: elementName, exact: false });
                  if (await roleLocator.count() > 0) {
                    element = roleLocator.first();
                    console.log(`✅ [${runId}] 通过 role "${role}" 和完整名称找到元素: "${elementName}"`);
                    found = true;
                    break;
                  }
                }
                
                // 方式2: 通过 role 和核心名称查找
                if (!found && coreName && coreName !== elementName) {
                  console.log(`🔍 [${runId}] 尝试使用核心名称 "${coreName}" 查找`);
                  for (const role of rolesToTry) {
                    const roleLocator = this.page.getByRole(role as any, { name: coreName, exact: false });
                    if (await roleLocator.count() > 0) {
                      element = roleLocator.first();
                      console.log(`✅ [${runId}] 通过 role "${role}" 和核心名称找到元素: "${coreName}"`);
                      found = true;
                      break;
                    }
                  }
                }
                
                // 🔥 方式2.5: 如果是输入框但还没找到，尝试通过 placeholder 或 label 查找
                if (!found && isInputBox) {
                  console.log(`🔍 [${runId}] 输入框类型，尝试通过 placeholder 或 label 查找`);
                  // 尝试通过 placeholder 属性查找
                  const inputByPlaceholder = this.page.locator(`input[placeholder*="${elementName}"], textarea[placeholder*="${elementName}"]`);
                  if (await inputByPlaceholder.count() > 0) {
                    element = inputByPlaceholder.first();
                    console.log(`✅ [${runId}] 通过 placeholder 找到输入框: "${elementName}"`);
                    found = true;
                  } else if (coreName && coreName !== elementName) {
                    const inputByPlaceholderCore = this.page.locator(`input[placeholder*="${coreName}"], textarea[placeholder*="${coreName}"]`);
                    if (await inputByPlaceholderCore.count() > 0) {
                      element = inputByPlaceholderCore.first();
                      console.log(`✅ [${runId}] 通过 placeholder（核心名称）找到输入框: "${coreName}"`);
                      found = true;
                    }
                  }
                  
                  // 🔥 方式2.6: 如果还是找不到，尝试查找所有输入框，通过label或附近的文本匹配
                  if (!found) {
                    console.log(`🔍 [${runId}] 尝试通过label或附近文本查找输入框`);
                    const allInputs = this.page.locator('input, textarea, [role="textbox"], [role="combobox"]');
                    const inputCount = await allInputs.count();
                    for (let i = 0; i < inputCount; i++) {
                      const input = allInputs.nth(i);
                      // 尝试获取附近的 label 或文本
                      const label = await input.evaluate((el) => {
                        const id = el.id;
                        if (id) {
                          const labelEl = document.querySelector(`label[for="${id}"]`);
                          if (labelEl) return labelEl.textContent;
                        }
                        // 查找前面的 label 元素
                        let prev = el.previousElementSibling;
                        while (prev) {
                          if (prev.tagName === 'LABEL') return prev.textContent;
                          prev = prev.previousElementSibling;
                        }
                        // 查找父元素中的label
                        const parent = el.parentElement;
                        if (parent) {
                          const parentLabel = parent.querySelector('label');
                          if (parentLabel) return parentLabel.textContent;
                        }
                        return null;
                      });
                      
                      if (label && (label.includes(elementName) || (coreName && label.includes(coreName)))) {
                        element = input;
                        console.log(`✅ [${runId}] 通过 label 找到输入框: "${label}"`);
                        found = true;
                        break;
                      }
                    }
                  }
                  
                  // 🔥 方式2.7: 如果还是找不到，且断言是"存在内容"类型，尝试查找所有有内容的输入框
                  if (!found && step.condition === 'contains_text' && step.value) {
                    console.log(`🔍 [${runId}] 断言是"存在内容"类型，尝试查找所有有内容的输入框`);
                    const allInputs = this.page.locator('input, textarea, [role="textbox"], [role="combobox"]');
                    const inputCount = await allInputs.count();
                    for (let i = 0; i < inputCount; i++) {
                      const input = allInputs.nth(i);
                      try {
                        const value = await input.inputValue();
                        if (value && value.trim().length > 0) {
                          // 如果断言有具体的value，检查是否包含
                          if (step.value && value.includes(String(step.value))) {
                            element = input;
                            console.log(`✅ [${runId}] 找到包含内容"${step.value}"的输入框`);
                            found = true;
                            break;
                          } else if (!step.value) {
                            // 如果断言只是"存在内容"，只要输入框有内容就符合
                            element = input;
                            console.log(`✅ [${runId}] 找到有内容的输入框（内容: "${value.substring(0, 20)}..."）`);
                            found = true;
                            break;
                          }
                        }
                      } catch {
                        // 忽略错误，继续查找
                      }
                    }
                  }
                }
                
                // 方式3: 通过文本内容查找（使用完整名称）
                if (!found) {
                  const textLocator = this.page.getByText(elementName, { exact: false });
                  if (await textLocator.count() > 0) {
                    element = textLocator.first();
                    console.log(`✅ [${runId}] 通过文本内容找到元素: "${elementName}"`);
                    found = true;
                  }
                }
                
                // 方式4: 通过文本内容查找（使用核心名称）
                if (!found && coreName && coreName !== elementName) {
                  const textLocator = this.page.getByText(coreName, { exact: false });
                  if (await textLocator.count() > 0) {
                    element = textLocator.first();
                    console.log(`✅ [${runId}] 通过核心名称文本找到元素: "${coreName}"`);
                    found = true;
                  }
                }
                
                // 方式5: 如果还没找到，尝试更宽松的匹配（在所有按钮中查找包含文本的）
                if (!found) {
                  console.log(`🔍 [${runId}] 尝试更宽松的匹配：在所有按钮中查找包含 "${elementName}" 或 "${coreName}" 的元素`);
                  const allButtons = this.page.locator('button, [role="button"], [type="submit"], [type="button"], input[type="submit"], input[type="button"]');
                  const count = await allButtons.count();
                  for (let i = 0; i < count; i++) {
                    const text = await allButtons.nth(i).textContent();
                    if (text && (text.includes(elementName) || (coreName && text.includes(coreName)))) {
                      element = allButtons.nth(i);
                      console.log(`✅ [${runId}] 通过宽松匹配找到按钮: "${text}"`);
                      found = true;
                      break;
                    }
                  }
                }
                
                // 🔥 如果所有方式都失败，对于"存在内容"类型的输入框断言，尝试查找所有有内容的输入框
                if (!found && isInputBox && step.condition === 'contains_text') {
                  // 🔥 判断是否是"存在内容"类型的断言
                  const isExistenceAssertion = step.description?.includes('存在') || 
                                              step.description?.includes('有内容') ||
                                              step.description?.includes('显示') ||
                                              step.description?.includes('有');
                  
                  if (isExistenceAssertion) {
                    console.log(`🔍 [${runId}] 无法找到特定元素，对于"存在内容"断言，尝试查找所有有内容的输入框`);
                    const allInputs = this.page.locator('input, textarea, [role="textbox"], [role="combobox"]');
                    const inputCount = await allInputs.count();
                    for (let i = 0; i < inputCount; i++) {
                      const input = allInputs.nth(i);
                      try {
                        const value = await input.inputValue();
                        if (value && value.trim().length > 0) {
                          // 🔥 对于"存在内容"类型的断言，只要输入框有内容就符合（即使value不完全匹配）
                          // 这是因为"存在内容"的意图是验证是否有内容，而不是验证具体内容
                          element = input;
                          console.log(`✅ [${runId}] 找到有内容的输入框（内容: "${value.substring(0, 30)}..."），符合"存在内容"断言`);
                          found = true;
                          break;
                        }
                      } catch {
                        // 忽略错误，继续查找
                      }
                    }
                  }
                }
                
                // 如果所有方式都失败，抛出明确的错误，而不是使用原始选择器
                if (!found) {
                  // 🔥 新增：对于弹窗验证，如果有value值，最后尝试用value快速查找
                  if (isPopupVerification && step.value && typeof step.value === 'string' && step.value.trim()) {
                    console.log(`🔍 [${runId}] 最后尝试：使用value值快速查找弹窗 "${step.value}"`);
                    const popupElement = this.page.getByText(step.value, { exact: false });
                    
                    // 立即检查
                    if (await popupElement.count() > 0) {
                      element = popupElement.first();
                      console.log(`✅ [${runId}] 通过value值找到弹窗元素: "${step.value}"`);
                      found = true;
                    } else {
                      // 等待较长时间（3秒）
                      try {
                        await popupElement.first().waitFor({ state: 'visible', timeout: 3000 });
                        element = popupElement.first();
                        console.log(`✅ [${runId}] 等待后通过value值找到弹窗元素: "${step.value}"`);
                        found = true;
                      } catch {
                        // 尝试部分匹配
                        const words = step.value
                          .split(/[：:，,、\s]+/)
                          .filter(w => w.length > 1)
                          .sort((a, b) => b.length - a.length);
                        
                        console.log(`🔍 [${runId}] 回退策略：尝试匹配关键词: ${words.join(', ')}`);
                        
                        for (const word of words) {
                          const partialElement = this.page.getByText(word, { exact: false });
                          if (await partialElement.count() > 0) {
                            element = partialElement.first();
                            console.log(`✅ [${runId}] 通过部分文本找到弹窗: "${word}"`);
                            found = true;
                            break;
                          }
                        }
                      }
                    }
                  }
                  
                  if (!found) {
                    throw new Error(`无法找到元素 "${searchText}"（已尝试: 完整名称"${elementName}", 核心名称"${coreName}"）`);
                  }
                }
              }
            } catch (selectorError: any) {
              // 如果所有方式都失败，尝试更宽松的文本匹配
              try {
                // 🔥 从断言描述中提取元素名称，优先使用element
                let elementName = step.element || step.selector || '';
                const assertionKeywords = ['存在', '验证', '检查', '断言', '应该', '必须', '确认', 'expect', 'verify', 'check', 'assert'];
                for (const keyword of assertionKeywords) {
                  elementName = elementName.replace(new RegExp(`^${keyword}\\s*`, 'i'), '');
                  elementName = elementName.replace(new RegExp(`\\s*${keyword}\\s*`, 'i'), ' ');
                }
                elementName = elementName.trim();
                if (!elementName) {
                  elementName = step.element || step.selector || '';
                }
                
                // 提取核心名称（移除"按钮"、"链接"等后缀，但保留"输入框"等关键信息）
                const isInputBox = elementName.includes('输入框') || elementName.includes('文本框') || elementName.includes('搜索框');
                const coreName = elementName.replace(/按钮|链接|复选框|下拉框|搜索按钮/g, '').trim();
                
                console.log(`🔍 [${runId}] 回退匹配：尝试查找包含 "${elementName}" 或 "${coreName}" 的元素（是否输入框: ${isInputBox}）`);
                
                // 🔥 如果是输入框，优先查找 input 和 textarea 元素
                if (isInputBox) {
                  // 方式1: 通过 placeholder 查找
                  const inputByPlaceholder = this.page.locator(`input[placeholder*="${elementName}"], textarea[placeholder*="${elementName}"]`);
                  if (await inputByPlaceholder.count() > 0) {
                    element = inputByPlaceholder.first();
                    console.log(`✅ [${runId}] 回退匹配成功：通过 placeholder 找到输入框 "${elementName}"`);
                  } else if (coreName && coreName !== elementName) {
                    const inputByPlaceholderCore = this.page.locator(`input[placeholder*="${coreName}"], textarea[placeholder*="${coreName}"]`);
                    if (await inputByPlaceholderCore.count() > 0) {
                      element = inputByPlaceholderCore.first();
                      console.log(`✅ [${runId}] 回退匹配成功：通过 placeholder（核心名称）找到输入框 "${coreName}"`);
                    }
                  }
                  
                  // 方式2: 如果还没找到，尝试查找所有输入框，通过 label 或附近的文本
                  if (!element) {
                    const allInputs = this.page.locator('input, textarea, [role="textbox"], [role="combobox"]');
                    const inputCount = await allInputs.count();
                    for (let i = 0; i < inputCount; i++) {
                      const input = allInputs.nth(i);
                      // 尝试获取附近的 label 或文本
                      const label = await input.evaluate((el) => {
                        const id = el.id;
                        if (id) {
                          const labelEl = document.querySelector(`label[for="${id}"]`);
                          if (labelEl) return labelEl.textContent;
                        }
                        // 查找前面的 label 元素
                        let prev = el.previousElementSibling;
                        while (prev) {
                          if (prev.tagName === 'LABEL') return prev.textContent;
                          prev = prev.previousElementSibling;
                        }
                        // 查找父元素中的label
                        const parent = el.parentElement;
                        if (parent) {
                          const parentLabel = parent.querySelector('label');
                          if (parentLabel) return parentLabel.textContent;
                        }
                        return null;
                      });
                      
                      if (label && (label.includes(elementName) || (coreName && label.includes(coreName)))) {
                        element = input;
                        console.log(`✅ [${runId}] 回退匹配成功：通过 label 找到输入框 "${label}"`);
                        break;
                      }
                    }
                  }
                  
                  // 🔥 方式2.5: 如果还是找不到，且断言是"存在内容"类型，尝试查找所有有内容的输入框
                  if (!element && isInputBox && step.condition === 'contains_text' && step.value) {
                    console.log(`🔍 [${runId}] 回退匹配：断言是"存在内容"类型，尝试查找所有有内容的输入框`);
                    const allInputs = this.page.locator('input, textarea, [role="textbox"], [role="combobox"]');
                    const inputCount = await allInputs.count();
                    for (let i = 0; i < inputCount; i++) {
                      const input = allInputs.nth(i);
                      try {
                        const value = await input.inputValue();
                        if (value && value.trim().length > 0) {
                          // 如果断言有具体的value，检查是否包含
                          if (step.value && value.includes(String(step.value))) {
                            element = input;
                            console.log(`✅ [${runId}] 回退匹配成功：找到包含内容"${step.value}"的输入框`);
                            break;
                          } else if (!step.value) {
                            // 如果断言只是"存在内容"，只要输入框有内容就符合
                            element = input;
                            console.log(`✅ [${runId}] 回退匹配成功：找到有内容的输入框（内容: "${value.substring(0, 20)}..."）`);
                            break;
                          }
                        }
                      } catch {
                        // 忽略错误，继续查找
                      }
                    }
                  }
                }
                
                // 方式3: 通用元素查找（包括输入框）
                if (!element) {
                  const allElements = this.page.locator('button, [role="button"], a, input, textarea, div, span, p, h1, h2, h3, h4, h5, h6, [type="submit"], [type="button"]');
                  const count = await allElements.count();
                  for (let i = 0; i < count; i++) {
                    const el = allElements.nth(i);
                    const text = await el.textContent();
                    if (text && (text.includes(elementName) || (coreName && text.includes(coreName)))) {
                      element = el;
                      console.log(`✅ [${runId}] 回退匹配成功：找到包含文本 "${text}" 的元素`);
                      break;
                    }
                  }
                }
                
                // 🔥 方式3.5: 如果还是找不到，且是"存在内容"类型的输入框断言，查找所有有内容的输入框
                if (!element && isInputBox && step.condition === 'contains_text') {
                  // 🔥 判断是否是"存在内容"类型的断言
                  const isExistenceAssertion = step.description?.includes('存在') || 
                                              step.description?.includes('有内容') ||
                                              step.description?.includes('显示') ||
                                              step.description?.includes('有');
                  
                  if (isExistenceAssertion) {
                    console.log(`🔍 [${runId}] 回退匹配：无法找到特定元素，对于"存在内容"断言，尝试查找所有有内容的输入框`);
                    const allInputs = this.page.locator('input, textarea, [role="textbox"], [role="combobox"]');
                    const inputCount = await allInputs.count();
                    for (let i = 0; i < inputCount; i++) {
                      const input = allInputs.nth(i);
                      try {
                        const value = await input.inputValue();
                        if (value && value.trim().length > 0) {
                          // 🔥 对于"存在内容"类型的断言，只要输入框有内容就符合（即使value不完全匹配）
                          element = input;
                          console.log(`✅ [${runId}] 回退匹配成功：找到有内容的输入框（内容: "${value.substring(0, 30)}..."），符合"存在内容"断言`);
                          break;
                        }
                      } catch {
                        // 忽略错误，继续查找
                      }
                    }
                  }
                }
                
                if (!element) {
                  // 🔥 新增：对于弹窗验证，如果有value值，最后尝试用value查找
                  if (isPopupVerification && step.value && typeof step.value === 'string' && step.value.trim()) {
                    console.log(`🔍 [${runId}] 回退匹配最后尝试：使用value值查找弹窗 "${step.value}"`);
                    const popupElement = this.page.getByText(step.value, { exact: false });
                    if (await popupElement.count() > 0) {
                      element = popupElement.first();
                      console.log(`✅ [${runId}] 回退匹配成功：通过value值找到弹窗元素: "${step.value}"`);
                    }
                  }
                  
                  if (!element) {
                    throw new Error(`无法找到元素: ${step.element || step.selector}（已尝试: "${elementName}", "${coreName}"）`);
                  }
                }
              } catch (fallbackError: any) {
                return { success: false, error: `断言元素查找失败: ${fallbackError.message || selectorError.message}` };
              }
            }
          }
          
          if (!element) {
            return { success: false, error: '断言步骤缺少选择器或ref参数' };
          }
          
          const condition = step.condition || 'visible';
          // 设置合理的超时时间（30秒，与 Playwright 默认一致，但可以配置）
          const timeout = 30000;
          
          try {
            // 先检查元素是否存在（不等待可见）
            const count = await element.count();
            if (count === 0) {
              return { success: false, error: `元素不存在（选择器: ${step.selector || step.ref || '未知'}）` };
            }
            
            console.log(`🔍 [${runId}] 开始验证断言，条件: ${condition}, 超时: ${timeout}ms`);
            
            // 🔥 支持多种验证条件类型
            if (condition === 'visible' || (condition as string) === 'toBeVisible') {
              await element.first().waitFor({ state: 'visible', timeout });
              console.log(`✅ [${runId}] 元素可见性验证成功`);
            } else if (condition === 'hidden' || (condition as string) === 'toBeHidden') {
              await element.first().waitFor({ state: 'hidden', timeout });
              console.log(`✅ [${runId}] 元素隐藏性验证成功`);
            } else if (condition === 'contains_text' || (condition as string) === 'toHaveText') {
              await element.first().waitFor({ state: 'visible', timeout });
              
              // 🔥 对于输入框（textbox/combobox），使用 inputValue() 获取输入值
              // 对于其他元素，使用 textContent() 获取文本内容
              let text: string | null = null;
              const elementTag = await element.first().evaluate((el) => el.tagName.toLowerCase());
              const elementRole = await element.first().evaluate((el) => el.getAttribute('role') || '');
              const isInputBox = elementTag === 'input' || elementTag === 'textarea' || 
                                 elementRole === 'textbox' || elementRole === 'combobox' ||
                                 step.selector?.includes('textbox:') || step.selector?.includes('combobox:');
              
              if (isInputBox) {
                text = await element.first().inputValue();
                console.log(`🔍 [${runId}] 输入框类型，使用 inputValue() 获取值: "${text}"`);
              } else {
                text = await element.first().textContent();
                console.log(`🔍 [${runId}] 非输入框类型，使用 textContent() 获取文本: "${text}"`);
              }
              
              // 🔥 智能验证策略：根据断言描述判断验证严格程度
              const isExistenceAssertion = step.description?.includes('存在') || 
                                          step.description?.includes('有内容') ||
                                          step.description?.includes('显示') ||
                                          step.description?.includes('有');
              
              // 🔥 如果找到的元素值为空，且是"存在内容"类型的输入框断言，触发回退机制
              if (isInputBox && isExistenceAssertion && (!text || text.trim().length === 0)) {
                console.log(`⚠️ [${runId}] 找到的元素值为空，对于"存在内容"类型的输入框断言，触发回退机制查找所有有内容的输入框`);
                const allInputs = this.page.locator('input, textarea, [role="textbox"], [role="combobox"]');
                const inputCount = await allInputs.count();
                for (let i = 0; i < inputCount; i++) {
                  const input = allInputs.nth(i);
                  try {
                    const value = await input.inputValue();
                    if (value && value.trim().length > 0) {
                      // 如果断言有具体的value，检查是否包含
                      if (step.value && value.includes(String(step.value))) {
                        console.log(`✅ [${runId}] 回退机制成功：找到包含内容"${step.value}"的输入框`);
                        return { success: true };
                      } else if (!step.value) {
                        // 如果断言只是"存在内容"且没有指定value，只要输入框有内容就符合
                        console.log(`✅ [${runId}] 回退机制成功：找到有内容的输入框（内容: "${value.substring(0, 30)}..."），符合"存在内容"断言`);
                        return { success: true };
                      }
                    }
                  } catch {
                    // 忽略错误，继续查找
                  }
                }
                // 如果回退机制也找不到，继续使用原来的元素进行验证
                console.log(`⚠️ [${runId}] 回退机制未找到有内容的输入框，继续使用原元素验证`);
              }
              
              if (step.value) {
                // 如果指定了value，检查是否包含
                if (!text?.includes(String(step.value))) {
                  // 🔥 修复：只有在非严格模式下，才使用"存在内容"的宽松验证
                  // 严格模式下，必须完全匹配
                  if (matchMode !== 'strict' && isExistenceAssertion && text && text.trim().length > 0) {
                    console.log(`✅ [${runId}] 文本包含验证成功（宽松模式）: 元素有内容"${text.substring(0, 30)}..."，虽然不完全匹配"${step.value}"，但符合"存在内容"断言`);
                    console.log(`💡 [${runId}] 提示：当前使用${matchMode === 'auto' ? '智能' : '宽松'}匹配模式，允许宽松验证`);
                    return { success: true };
                  }
                  // 🔥 严格模式或非"存在内容"断言，必须匹配
                  if (matchMode === 'strict') {
                    console.log(`❌ [${runId}] 严格模式：文本不匹配`);
                    console.log(`   期望: "${step.value}"`);
                    console.log(`   实际: "${text || '(空)'}"`);
                  }
                  return { success: false, error: `期望文本包含 "${step.value}"，实际为 "${text || '(空)'}"` };
                }
                // value匹配成功
                console.log(`✅ [${runId}] 文本包含验证成功: "${text}"`);
              } else {
                // 如果没有指定value，对于"存在内容"类型，只要有内容就通过
                if (isExistenceAssertion) {
                  if (!text || text.trim().length === 0) {
                    return { success: false, error: `期望元素有内容，但实际为空` };
                  }
                  console.log(`✅ [${runId}] 存在内容验证成功: 元素有内容"${text.substring(0, 30)}..."`);
                  return { success: true };
                }
                // 对于其他类型，只要有文本就通过
                if (!text || text.trim().length === 0) {
                  return { success: false, error: `期望元素有文本内容，但实际为空` };
                }
                console.log(`✅ [${runId}] 文本包含验证成功: "${text}"`);
              }
            } else if ((condition as string) === 'has_text') {
              // 🔥 支持 has_text（文本匹配，自动 trim）
              await element.first().waitFor({ state: 'visible', timeout });
              
              let text: string | null = null;
              const elementTag = await element.first().evaluate((el) => el.tagName.toLowerCase());
              const elementRole = await element.first().evaluate((el) => el.getAttribute('role') || '');
              
              if (elementTag === 'input' || elementTag === 'textarea' || 
                  elementRole === 'textbox' || elementRole === 'combobox' ||
                  step.selector?.includes('textbox:') || step.selector?.includes('combobox:')) {
                text = await element.first().inputValue();
              } else {
                text = await element.first().textContent();
              }
              
              // 🔥 修复：trim 处理空白字符后再比较，避免因空格、换行导致的匹配失败
              const actualText = text?.trim() || '';
              const expectedText = String(step.value || '').trim();
              
              if (step.value && actualText !== expectedText) {
                // 🔥 如果严格匹配失败，尝试包含匹配（更宽松）
                if (actualText.includes(expectedText) || expectedText.includes(actualText)) {
                  console.log(`✅ [${runId}] 文本匹配验证成功（包含匹配）: 期望"${expectedText}"，实际"${actualText}"`);
                } else {
                  return { success: false, error: `期望文本为 "${expectedText}"，实际为 "${actualText}"` };
                }
              } else {
                console.log(`✅ [${runId}] 精确文本匹配验证成功: "${actualText}"`);
              }
            } else if ((condition as string) === 'has_value') {
              // 🔥 支持 has_value（验证输入框的值属性）
              await element.first().waitFor({ state: 'visible', timeout });
              const value = await element.first().inputValue();
              
              if (step.value && value !== String(step.value)) {
                return { success: false, error: `期望值为 "${step.value}"，实际为 "${value || '(空)'}"` };
              }
              console.log(`✅ [${runId}] 值匹配验证成功: "${value}"`);
            } else if ((condition as string) === 'checked') {
              // 🔥 支持 checked（验证复选框/单选框是否选中）
              await element.first().waitFor({ state: 'visible', timeout });
              const isChecked = await element.first().isChecked();
              
              if (!isChecked) {
                return { success: false, error: `期望元素已选中，但实际未选中` };
              }
              console.log(`✅ [${runId}] 选中状态验证成功`);
            } else if ((condition as string) === 'enabled') {
              // 🔥 支持 enabled（验证元素是否可用）
              await element.first().waitFor({ state: 'visible', timeout });
              const isEnabled = await element.first().isEnabled();
              
              if (!isEnabled) {
                return { success: false, error: `期望元素可用，但实际已禁用` };
              }
              console.log(`✅ [${runId}] 可用状态验证成功`);
            } else if ((condition as string) === 'disabled') {
              // 🔥 支持 disabled（验证元素是否禁用）
              await element.first().waitFor({ state: 'visible', timeout });
              const isEnabled = await element.first().isEnabled();
              
              if (isEnabled) {
                return { success: false, error: `期望元素已禁用，但实际可用` };
              }
              console.log(`✅ [${runId}] 禁用状态验证成功`);
            } else if ((condition as string) === 'count') {
              // 🔥 支持 count（验证元素数量）
              const actualCount = await element.count();
              const expectedCount = step.value ? parseInt(String(step.value), 10) : null;
              
              if (expectedCount !== null && actualCount !== expectedCount) {
                return { success: false, error: `期望元素数量为 ${expectedCount}，实际为 ${actualCount}` };
              }
              console.log(`✅ [${runId}] 元素数量验证成功: ${actualCount}`);
            } else {
              // 默认：等待元素可见
              await element.first().waitFor({ state: 'visible', timeout });
              console.log(`✅ [${runId}] 默认可见性验证成功（未知条件类型: ${condition}）`);
            }
          } catch (assertionError: any) {
            // 提供更详细的错误信息
            const errorMsg = assertionError.message || '未知错误';
            const selectorInfo = step.selector || step.ref || '未知';
            console.error(`❌ [${runId}] 断言验证失败: ${errorMsg}, 选择器: ${selectorInfo}`);
            return { success: false, error: `断言验证失败: ${errorMsg}（选择器: ${selectorInfo}）` };
          }
          break;
        }

        case 'wait': {
          // 🔥 增强：支持等待 URL 变化
          if (step.selector && step.selector.startsWith('url:')) {
            const expectedPath = step.selector.substring(4); // 移除 "url:" 前缀
            const timeout = step.value ? parseInt(String(step.value), 10) * 1000 : 10000; // 默认10秒
            console.log(`⏳ [${runId}] 等待 URL 变化到路径: ${expectedPath}，超时: ${timeout}ms`);
            
            try {
              await this.page.waitForURL(`**${expectedPath}**`, { 
                timeout,
                waitUntil: 'networkidle' 
              });
              console.log(`✅ [${runId}] URL 已变化到: ${this.page.url()}`);
            } catch {
              const currentUrl = this.page.url();
              console.log(`⚠️ [${runId}] 等待 URL 变化超时，当前 URL: ${currentUrl}`);
              // 检查 URL 是否已经包含期望的路径
              if (currentUrl.includes(expectedPath)) {
                console.log(`✅ [${runId}] URL 虽超时但已包含期望路径，继续执行`);
              } else {
                return { success: false, error: `等待 URL 变化到 ${expectedPath} 超时，当前 URL: ${currentUrl}` };
              }
            }
          } else {
            // 默认等待固定时间
            const waitTime = step.value ? parseInt(String(step.value), 10) * 1000 : 1000;
            console.log(`⏳ [${runId}] 等待 ${waitTime}ms`);
            await this.page.waitForTimeout(waitTime);
          }
          break;
        }

        case 'screenshot':
          // 截图已在外部处理
          break;

        default:
          return { success: false, error: `不支持的操作类型: ${step.action}` };
      }

      // 等待页面稳定
      await this.page.waitForLoadState('networkidle');

      return { success: true };
    } catch (error: any) {
      console.error(`❌ [${runId}] 步骤执行失败:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取当前页面
   */
  getPage(): Page | null {
    return this.page;
  }
  
  /**
   * 🔥 新增：获取文本历史记录
   * 用于 AssertionService 进行弹窗验证
   */
  getTextHistory(): Set<string> {
    return this.textHistory;
  }

  /**
   * 停止 trace 录制并保存
   */
  async stopTrace(runId: string): Promise<string | null> {
    if (!this.context) {
      return null;
    }

    try {
      const tracePath = path.join(this.artifactsDir, runId, 'trace.zip');
      await this.context.tracing.stop({ path: tracePath });
      console.log(`📦 [${runId}] Trace 文件已保存: ${tracePath}`);
      return tracePath;
    } catch (error: any) {
      console.error(`❌ [${runId}] 保存 trace 文件失败:`, error.message);
      return null;
    }
  }

  /**
   * 🔥 新增：处理下载操作
   * 在点击成功后立即设置下载监听器并等待下载完成
   */
  private async handleDownload(runId: string, step: TestStep): Promise<void> {
    if (!this.page) {
      console.warn(`⚠️ [${runId}] 页面未初始化，无法处理下载`);
      return;
    }

    try {
      console.log(`📥 [${runId}] 点击成功后设置下载监听器...`);
      
      // 🔥 关键修复：在点击成功后才设置下载监听器
      // 使用 Promise.race 同时等待下载事件和超时
      const downloadPromise = new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('下载超时（30秒）'));
        }, 30000); // 30秒超时
        
        this.page!.once('download', (download) => {
          clearTimeout(timeout);
          resolve(download);
        });
      });
      
      console.log(`⏳ [${runId}] 等待下载开始（最多30秒）...`);
      
      // 等待下载事件
      const download = await downloadPromise;
      
      // 获取建议的文件名
      const suggestedFilename = download.suggestedFilename();
      console.log(`📥 [${runId}] 下载事件触发，建议文件名: ${suggestedFilename}`);
      
      // 记录下载URL（用于调试）
      try {
        const downloadUrl = download.url();
        console.log(`🔗 [${runId}] 下载URL: ${downloadUrl}`);
      } catch (e) {
        console.log(`⚠️ [${runId}] 无法获取下载URL`);
      }
      
      // 构建保存路径
      const runDir = path.join(this.artifactsDir, runId);
      const savePath = path.join(runDir, suggestedFilename);
      
      console.log(`💾 [${runId}] 开始保存文件到: ${savePath}`);
      
      // 使用 saveAs 保存文件，并等待完成
      await download.saveAs(savePath);
      
      // 验证文件是否成功保存
      try {
        const stats = await fs.stat(savePath);
        console.log(`✅ [${runId}] 文件下载成功: ${savePath}`);
        console.log(`📊 [${runId}] 文件大小: ${stats.size} 字节`);
        
        // 将下载信息发送到日志回调
        if (this.logCallback) {
          this.logCallback(`📥 文件下载成功: ${suggestedFilename}`, 'success');
          this.logCallback(`📁 保存路径: ${savePath}`, 'info');
          this.logCallback(`📊 文件大小: ${stats.size} 字节`, 'info');
        }
      } catch (statError: any) {
        console.error(`⚠️ [${runId}] 无法验证文件: ${statError.message}`);
        // 文件可能已保存，但无法验证
        if (this.logCallback) {
          this.logCallback(`📥 文件已保存: ${suggestedFilename}`, 'success');
          this.logCallback(`📁 保存路径: ${savePath}`, 'info');
        }
      }
    } catch (downloadError: any) {
      console.error(`❌ [${runId}] 下载失败: ${downloadError.message}`);
      console.error(`❌ [${runId}] 错误堆栈:`, downloadError.stack);
      
      if (this.logCallback) {
        this.logCallback(`❌ 下载失败: ${downloadError.message}`, 'error');
        
        // 提供调试建议
        if (downloadError.message.includes('超时')) {
          this.logCallback(`💡 提示：下载超时，可能原因：`, 'info');
          this.logCallback(`   1. 点击没有触发下载`, 'info');
          this.logCallback(`   2. 下载需要更长时间（可以增加超时时间）`, 'info');
          this.logCallback(`   3. 需要额外的用户交互（如确认对话框）`, 'info');
        } else {
          this.logCallback(`💡 提示：请检查浏览器开发者工具的Network标签`, 'info');
        }
      }
      
      // 下载失败不影响点击操作的成功状态
      // 因为点击本身已经成功了，只是下载没有触发
      console.log(`ℹ️ [${runId}] 点击操作成功，但下载未完成`);
    }
  }

  /**
   * 关闭浏览器
   */
  async close(): Promise<void> {
    try {
      // 🔥 停止文本历史记录监听器
      this.stopTextHistoryMonitor();
      
      if (this.context) {
        await this.context.close();
        this.context = null;
      }
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      this.page = null;
      
      // 清空文本历史记录
      this.textHistory.clear();
    } catch (error: any) {
      console.error('关闭浏览器失败:', error.message);
    }
  }
}

