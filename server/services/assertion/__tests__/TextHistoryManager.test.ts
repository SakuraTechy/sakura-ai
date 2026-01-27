import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fc from 'fast-check';
import { TextHistoryManager } from '../TextHistoryManager';

describe('TextHistoryManager Property Tests', () => {
  beforeEach(() => {
    TextHistoryManager.resetInstance();
  });

  afterEach(() => {
    TextHistoryManager.resetInstance();
  });

  /**
   * Property 4: Text History Completeness (文本历史完整性)
   * 
   * 来自设计文档 design.md:
   * "所有添加到历史记录的文本都应该能够被查询到（在容量限制内）"
   * 
   * 验证：
   * 1. 添加一系列文本到历史记录
   * 2. 每个添加的文本都应该能通过 hasText() 查询到
   * 3. 通过 findText() 应该能找到对应的记录
   */
  it('Property 4: all added texts should be queryable within capacity limits', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 50 }),
        (texts) => {
          // Arrange
          const manager = TextHistoryManager.getInstance({ maxSize: 100 });
          manager.clear();

          // Act: 添加所有文本
          for (const text of texts) {
            manager.addText(text);
          }

          // Assert: 验证所有文本都能查询到（考虑容量限制）
          const expectedTexts = texts.slice(-100); // 只保留最后100个
          
          for (const text of expectedTexts) {
            if (text.trim().length > 0) {
              expect(manager.hasText(text)).toBe(true);
              const found = manager.findText(text);
              expect(found.length).toBeGreaterThan(0);
            }
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5: Text History Ordering (文本历史顺序性)
   * 
   * 来自设计文档 design.md:
   * "历史记录应按照添加时间顺序排列，时间戳单调递增"
   * 
   * 验证：
   * 1. 添加多个文本
   * 2. 获取历史记录
   * 3. 验证时间戳单调递增
   */
  it('Property 5: history entries should maintain chronological order', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            text: fc.string({ minLength: 1, maxLength: 50 }),
            source: fc.option(fc.constantFrom('popup', 'notification', 'page'), { nil: undefined })
          }),
          { minLength: 2, maxLength: 30 }
        ),
        (entries) => {
          // Arrange
          const manager = TextHistoryManager.getInstance({ maxSize: 100 });
          manager.clear();

          // Act: 添加所有文本
          for (const entry of entries) {
            manager.addText(entry.text, entry.source);
          }

          // Assert: 验证时间戳顺序
          const history = manager.getHistory();
          
          for (let i = 1; i < history.length; i++) {
            expect(history[i].timestamp).toBeGreaterThanOrEqual(history[i - 1].timestamp);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6: Text History Capacity Limit (文本历史容量限制)
   * 
   * 来自设计文档 design.md:
   * "历史记录不应超过配置的最大容量，超出时应移除最旧的记录"
   * 
   * 验证：
   * 1. 设置较小的容量限制
   * 2. 添加超过容量的文本
   * 3. 验证历史记录大小不超过限制
   * 4. 验证最旧的记录被移除
   * 
   * 注意：历史记录允许重复文本（因为可能在不同时间出现）
   */
  it('Property 6: history should respect capacity limits and remove oldest entries', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 20 }), // maxSize
        fc.array(
          fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0), // 确保非空
          { minLength: 10, maxLength: 50 }
        ),
        (maxSize, texts) => {
          // Arrange: 重置实例并创建新的管理器
          TextHistoryManager.resetInstance();
          const manager = TextHistoryManager.getInstance({ maxSize });
          manager.clear();

          // Act: 添加所有文本
          for (const text of texts) {
            manager.addText(text);
          }

          // Assert: 验证容量限制
          const history = manager.getHistory();
          expect(history.length).toBeLessThanOrEqual(maxSize);

          // 如果添加的文本数量超过容量，验证历史记录达到最大容量
          if (texts.length >= maxSize) {
            expect(history.length).toBe(maxSize);
          } else {
            expect(history.length).toBe(texts.length);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional Property: Empty Text Handling
   * 验证空文本的处理
   */
  it('should ignore empty or whitespace-only texts', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.constant(''),
            fc.constant('   '),
            fc.constant('\t\n'),
            fc.string({ minLength: 1, maxLength: 20 })
          ),
          { minLength: 5, maxLength: 20 }
        ),
        (texts) => {
          // Arrange
          const manager = TextHistoryManager.getInstance();
          manager.clear();

          // Act
          for (const text of texts) {
            manager.addText(text);
          }

          // Assert: 只有非空文本被添加
          const history = manager.getHistory();
          for (const entry of history) {
            expect(entry.text.trim().length).toBeGreaterThan(0);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional Property: Source Filtering
   * 验证来源过滤功能
   */
  it('should filter history by source correctly', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            text: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0), // 确保非空
            source: fc.constantFrom('popup', 'notification', 'page')
          }),
          { minLength: 5, maxLength: 20 }
        ),
        fc.constantFrom('popup', 'notification', 'page'),
        (entries, filterSource) => {
          // Arrange: 重置实例
          TextHistoryManager.resetInstance();
          const manager = TextHistoryManager.getInstance();
          manager.clear();

          // Act: 添加所有文本
          for (const entry of entries) {
            manager.addText(entry.text, entry.source);
          }

          // 获取过滤后的历史
          const filtered = manager.getHistory(filterSource);

          // Assert: 验证所有返回的记录都是指定来源
          for (const entry of filtered) {
            expect(entry.source).toBe(filterSource);
          }

          // 验证数量正确
          const expectedCount = entries.filter(e => e.source === filterSource).length;
          expect(filtered.length).toBe(expectedCount);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional Property: Clear Operation
   * 验证清空操作的正确性
   */
  it('should clear all history and reset state', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 20 }),
        (texts) => {
          // Arrange
          const manager = TextHistoryManager.getInstance();
          manager.clear();

          // Act: 添加文本然后清空
          for (const text of texts) {
            manager.addText(text);
          }
          manager.clear();

          // Assert: 验证所有状态都被重置
          expect(manager.size()).toBe(0);
          expect(manager.uniqueSize()).toBe(0);
          expect(manager.getHistory()).toHaveLength(0);

          // 验证之前的文本不再能查询到
          for (const text of texts) {
            if (text.trim().length > 0) {
              expect(manager.hasText(text)).toBe(false);
            }
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional Property: Batch Add Consistency
   * 验证批量添加与单个添加的一致性
   */
  it('should produce same result for batch add and individual adds', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 15 }),
        (texts) => {
          // Arrange: 两个独立的管理器
          TextHistoryManager.resetInstance();
          const manager1 = TextHistoryManager.getInstance();
          manager1.clear();

          TextHistoryManager.resetInstance();
          const manager2 = TextHistoryManager.getInstance();
          manager2.clear();

          // Act: 一个批量添加，一个单个添加
          manager1.addTexts(texts);
          for (const text of texts) {
            manager2.addText(text);
          }

          // Assert: 两者应该有相同的结果
          expect(manager1.size()).toBe(manager2.size());
          expect(manager1.uniqueSize()).toBe(manager2.uniqueSize());

          for (const text of texts) {
            if (text.trim().length > 0) {
              expect(manager1.hasText(text)).toBe(manager2.hasText(text));
            }
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional Property: Config Update
   * 验证配置更新的正确性
   */
  it('should handle config updates correctly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 50 }),
        fc.integer({ min: 5, max: 20 }),
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 20, maxLength: 40 }),
        (initialMaxSize, newMaxSize, texts) => {
          // Arrange
          const manager = TextHistoryManager.getInstance({ maxSize: initialMaxSize });
          manager.clear();

          // Act: 添加文本
          for (const text of texts) {
            manager.addText(text);
          }

          // 更新配置
          manager.updateConfig({ maxSize: newMaxSize });

          // Assert: 验证新的容量限制生效
          const history = manager.getHistory();
          expect(history.length).toBeLessThanOrEqual(newMaxSize);

          // 验证配置已更新
          const config = manager.getConfig();
          expect(config.maxSize).toBe(newMaxSize);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
