/**
 * TextHistoryManager - 文本历史记录管理器
 * 
 * 功能：
 * 1. 记录页面上曾经出现过的所有文本
 * 2. 支持快速查找文本是否曾经出现
 * 3. 支持限制历史记录大小
 * 4. 提供清空和重置功能
 * 
 * 用途：
 * - 捕获快速消失的弹窗文本
 * - 验证临时提示信息
 * - 支持文本断言的历史查找
 */

export interface TextHistoryEntry {
  text: string;
  timestamp: number;
  source?: string; // 文本来源（如 'popup', 'notification', 'page'）
}

export interface TextHistoryConfig {
  maxSize: number; // 最大记录数量，默认 1000
  enabled: boolean; // 是否启用历史记录，默认 true
}

export class TextHistoryManager {
  private static instance: TextHistoryManager;
  private history: TextHistoryEntry[] = [];
  private textSet: Set<string> = new Set(); // 用于快速查找
  private config: TextHistoryConfig;

  private constructor(config?: Partial<TextHistoryConfig>) {
    this.config = {
      maxSize: config?.maxSize ?? 1000,
      enabled: config?.enabled ?? true
    };
  }

  /**
   * 获取单例实例
   */
  public static getInstance(config?: Partial<TextHistoryConfig>): TextHistoryManager {
    if (!TextHistoryManager.instance) {
      TextHistoryManager.instance = new TextHistoryManager(config);
    }
    return TextHistoryManager.instance;
  }

  /**
   * 重置单例实例（主要用于测试）
   */
  public static resetInstance(): void {
    TextHistoryManager.instance = null as any;
  }

  /**
   * 添加文本到历史记录
   * 
   * @param text - 要添加的文本
   * @param source - 文本来源（可选）
   */
  public addText(text: string, source?: string): void {
    if (!this.config.enabled) {
      return;
    }

    // 忽略空文本
    if (!text || text.trim().length === 0) {
      return;
    }

    const normalizedText = text.trim();

    // 检查是否需要移除最旧的记录（在添加前检查）
    while (this.history.length >= this.config.maxSize) {
      const removed = this.history.shift();
      if (removed) {
        // 检查是否还有其他相同文本的记录
        const hasOther = this.history.some(e => e.text === removed.text);
        if (!hasOther) {
          this.textSet.delete(removed.text);
        }
      }
    }

    // 添加到历史记录
    const entry: TextHistoryEntry = {
      text: normalizedText,
      timestamp: Date.now(),
      source
    };

    this.history.push(entry);
    this.textSet.add(normalizedText);
  }

  /**
   * 批量添加文本
   * 
   * @param texts - 文本数组
   * @param source - 文本来源（可选）
   */
  public addTexts(texts: string[], source?: string): void {
    for (const text of texts) {
      this.addText(text, source);
    }
  }

  /**
   * 检查文本是否在历史记录中
   * 
   * @param text - 要查找的文本
   * @returns 是否存在
   */
  public hasText(text: string): boolean {
    if (!text || text.trim().length === 0) {
      return false;
    }
    return this.textSet.has(text.trim());
  }

  /**
   * 查找包含指定文本的历史记录
   * 
   * @param text - 要查找的文本
   * @returns 匹配的历史记录数组
   */
  public findText(text: string): TextHistoryEntry[] {
    if (!text || text.trim().length === 0) {
      return [];
    }

    const normalizedText = text.trim().toLowerCase();
    return this.history.filter(entry => 
      entry.text.toLowerCase().includes(normalizedText)
    );
  }

  /**
   * 获取所有历史记录
   * 
   * @param source - 可选的来源过滤
   * @returns 历史记录数组
   */
  public getHistory(source?: string): TextHistoryEntry[] {
    if (source) {
      return this.history.filter(entry => entry.source === source);
    }
    return [...this.history];
  }

  /**
   * 获取最近的 N 条记录
   * 
   * @param count - 记录数量
   * @returns 最近的历史记录数组
   */
  public getRecent(count: number): TextHistoryEntry[] {
    if (count <= 0) {
      return [];
    }
    return this.history.slice(-count);
  }

  /**
   * 清空历史记录
   */
  public clear(): void {
    this.history = [];
    this.textSet.clear();
  }

  /**
   * 获取历史记录数量
   */
  public size(): number {
    return this.history.length;
  }

  /**
   * 获取唯一文本数量
   */
  public uniqueSize(): number {
    return this.textSet.size;
  }

  /**
   * 更新配置
   * 
   * @param config - 新的配置
   */
  public updateConfig(config: Partial<TextHistoryConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };

    // 如果最大大小减小，需要裁剪历史记录
    if (config.maxSize !== undefined && this.history.length > config.maxSize) {
      const removeCount = this.history.length - config.maxSize;
      const removed = this.history.splice(0, removeCount);
      
      // 重建 textSet
      this.textSet.clear();
      for (const entry of this.history) {
        this.textSet.add(entry.text);
      }
    }
  }

  /**
   * 获取当前配置
   */
  public getConfig(): TextHistoryConfig {
    return { ...this.config };
  }

  /**
   * 导出历史记录（用于调试）
   */
  public export(): {
    history: TextHistoryEntry[];
    config: TextHistoryConfig;
    stats: {
      totalEntries: number;
      uniqueTexts: number;
      oldestTimestamp?: number;
      newestTimestamp?: number;
    };
  } {
    return {
      history: [...this.history],
      config: { ...this.config },
      stats: {
        totalEntries: this.history.length,
        uniqueTexts: this.textSet.size,
        oldestTimestamp: this.history[0]?.timestamp,
        newestTimestamp: this.history[this.history.length - 1]?.timestamp
      }
    };
  }
}
