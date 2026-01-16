/**
 * 🔥 AI缓存管理器
 * 统一管理所有AI相关的缓存（元素缓存、操作缓存、断言缓存）
 */

import { elementCache } from './elementCache.js';
import { AITestParser } from './aiParser.js';
import { PrismaClient } from '../../src/generated/prisma/index.js';

const prisma = new PrismaClient();

class AICacheManager {
  // 存储所有活跃的 AITestParser 实例
  private parserInstances: Set<AITestParser> = new Set();

  /**
   * 注册 AITestParser 实例
   */
  registerParser(parser: AITestParser): void {
    this.parserInstances.add(parser);
  }

  /**
   * 注销 AITestParser 实例
   */
  unregisterParser(parser: AITestParser): void {
    this.parserInstances.delete(parser);
  }

  /**
   * 清空所有缓存（内存 + 数据库）
   */
  async clearAllCaches(): Promise<{
    elementCacheCleared: boolean;
    databaseCleared: {
      elements: number;
      operations: number;
      assertions: number;
      total: number;
    };
    parserCachesCleared: number;
  }> {
    console.log('🗑️ [缓存管理器] 开始清空所有AI缓存...');

    // 1. 清空元素缓存（内存 + 数据库）
    const elementDbCount = await elementCache.clearAll();
    console.log(`✅ [缓存管理器] 已清空元素缓存（数据库: ${elementDbCount}条）`);

    // 2. 清空所有注册的 AITestParser 实例的缓存（内存）
    let parserCount = 0;
    for (const parser of this.parserInstances) {
      parser.clearAllCaches();
      parserCount++;
    }
    console.log(`✅ [缓存管理器] 已清空 ${parserCount} 个解析器实例的缓存`);

    // 3. 清空操作缓存和断言缓存的数据库持久化数据
    let operationDbCount = 0;
    let assertionDbCount = 0;
    
    try {
      const [operationResult, assertionResult] = await Promise.all([
        prisma.ai_operation_cache.deleteMany({}),
        prisma.ai_assertion_cache.deleteMany({})
      ]);
      
      operationDbCount = operationResult.count;
      assertionDbCount = assertionResult.count;
      
      console.log(`✅ [缓存管理器] 已清空操作缓存数据库: ${operationDbCount}条`);
      console.log(`✅ [缓存管理器] 已清空断言缓存数据库: ${assertionDbCount}条`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      console.error('❌ [缓存管理器] 清空数据库缓存失败:', errorMessage);
    }

    const totalDbCleared = elementDbCount + operationDbCount + assertionDbCount;

    return {
      elementCacheCleared: true,
      databaseCleared: {
        elements: elementDbCount,
        operations: operationDbCount,
        assertions: assertionDbCount,
        total: totalDbCleared
      },
      parserCachesCleared: parserCount
    };
  }

  /**
   * 获取缓存统计信息
   */
  async getCacheStats() {
    const elementStats = await elementCache.getStatsFromDatabase();
    
    // 获取数据库中的操作缓存和断言缓存统计
    let operationCount = 0;
    let assertionCount = 0;
    
    try {
      const [opCount, assCount] = await Promise.all([
        prisma.ai_operation_cache.count({
          where: { expires_at: { gt: new Date() } }
        }),
        prisma.ai_assertion_cache.count({
          where: { expires_at: { gt: new Date() } }
        })
      ]);
      
      operationCount = opCount;
      assertionCount = assCount;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      console.error('❌ [缓存管理器] 获取数据库统计失败:', errorMessage);
    }
    
    return {
      elementCache: elementStats,
      operationCache: {
        databaseCount: operationCount
      },
      assertionCache: {
        databaseCount: assertionCount
      },
      registeredParsers: this.parserInstances.size
    };
  }
}

// 导出单例
export const aiCacheManager = new AICacheManager();
