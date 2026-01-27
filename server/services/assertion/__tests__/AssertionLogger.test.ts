import { describe, it, expect, beforeEach } from '@jest/globals';
import * as fc from 'fast-check';
import { AssertionLogger } from '../AssertionLogger';

describe('AssertionLogger Property Tests', () => {
  let logger: AssertionLogger;

  beforeEach(() => {
    logger = AssertionLogger.getInstance();
    logger.clearLogs();
  });

  /**
   * Property 8: Log Ordering (日志顺序性)
   * 
   * 来自设计文档 design.md:
   * "日志按照添加顺序严格排序，后添加的日志时间戳必须大于等于先添加的日志时间戳"
   * 
   * 验证：
   * 1. 连续添加多条日志
   * 2. 获取的日志列表应保持添加顺序
   * 3. 每条日志的时间戳应单调递增（或相等）
   */
  it('Property 8: logs should maintain strict ordering by timestamp', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            message: fc.string({ minLength: 1, maxLength: 100 }),
            level: fc.constantFrom('info', 'success', 'warning', 'error'), // 移除 debug，因为默认不记录
            metadata: fc.option(fc.dictionary(fc.string(), fc.anything()), { nil: undefined })
          }),
          { minLength: 2, maxLength: 20 }
        ),
        (logEntries) => {
          // Arrange: 清空日志
          logger.clearLogs();

          // Act: 按顺序添加日志
          const addedTimestamps: number[] = [];
          for (const entry of logEntries) {
            const beforeAdd = Date.now();
            logger.log(entry.message, entry.level as any, entry.metadata);
            addedTimestamps.push(beforeAdd);
          }

          // Assert: 获取日志并验证顺序
          const logs = logger.getLogs();
          
          // 验证日志数量
          expect(logs).toHaveLength(logEntries.length);

          // 验证时间戳单调递增
          for (let i = 1; i < logs.length; i++) {
            expect(logs[i].timestamp.getTime()).toBeGreaterThanOrEqual(logs[i - 1].timestamp.getTime());
          }

          // 验证日志内容顺序
          for (let i = 0; i < logs.length; i++) {
            expect(logs[i].message).toBe(logEntries[i].message);
            expect(logs[i].level).toBe(logEntries[i].level);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional Property: Log Level Filtering
   * 验证日志级别过滤功能
   */
  it('should store logs with correct level', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            message: fc.string({ minLength: 1, maxLength: 50 }),
            level: fc.constantFrom('info', 'success', 'warning', 'error') // 只使用会被记录的级别
          }),
          { minLength: 5, maxLength: 15 }
        ),
        (logEntries) => {
          // Arrange
          logger.clearLogs();

          // Act: 添加所有日志
          for (const entry of logEntries) {
            logger.log(entry.message, entry.level as any);
          }

          // 获取所有日志
          const allLogs = logger.getLogs();

          // Assert: 验证日志数量和级别
          expect(allLogs.length).toBe(logEntries.length);

          // 验证所有日志都有正确的级别
          for (const log of allLogs) {
            expect(['info', 'success', 'warning', 'error']).toContain(log.level);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional Property: Clear Logs Idempotency
   * 验证清空日志操作的幂等性
   */
  it('should clear logs idempotently', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            message: fc.string({ minLength: 1, maxLength: 50 }),
            level: fc.constantFrom('debug', 'info', 'warning', 'error')
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (logEntries) => {
          // Arrange: 添加日志
          logger.clearLogs();
          for (const entry of logEntries) {
            logger.log(entry.message, entry.level as any);
          }

          // Act: 多次清空
          logger.clearLogs();
          logger.clearLogs();
          logger.clearLogs();

          // Assert: 验证日志为空
          const logs = logger.getLogs();
          expect(logs).toHaveLength(0);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional Property: Singleton Consistency
   * 验证单例模式的一致性
   */
  it('should maintain singleton consistency across multiple getInstance calls', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        (message) => {
          // Arrange & Act
          const instance1 = AssertionLogger.getInstance();
          instance1.clearLogs();
          instance1.log(message, 'info');

          const instance2 = AssertionLogger.getInstance();
          const logs = instance2.getLogs();

          // Assert: 两个实例应该是同一个对象
          expect(instance1).toBe(instance2);
          expect(logs).toHaveLength(1);
          expect(logs[0].message).toBe(message);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
