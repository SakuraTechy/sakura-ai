import crypto from 'crypto';
import { PrismaClient } from '../../src/generated/prisma/index.js';

/**
 * 🔥 智能元素缓存系统
 * 双层缓存策略：内存缓存（L1）+ 数据库持久化（L2）
 * 用于缓存AI元素识别结果，避免重复调用AI API，并确保服务重启后缓存不丢失
 */

const prisma = new PrismaClient();

export interface CachedElement {
  ref: string;           // 元素引用
  text: string;          // 元素文本
  confidence: number;    // 置信度
  timestamp: number;     // 缓存时间
  hitCount: number;      // 命中次数
}

export interface CacheStats {
  totalRequests: number;    // 总请求数
  cacheHits: number;        // 缓存命中数
  cacheMisses: number;      // 缓存未命中数
  hitRate: number;          // 命中率
  totalElements: number;    // 缓存元素总数
  memoryUsage: number;      // 内存占用(KB)
  trendData?: Array<{       // 趋势数据
    time: string;
    hitRate: number;
    requests: number;
  }>;
}

export class ElementCache {
  private cache: Map<string, CachedElement> = new Map();
  private stats = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0
  };

  // 趋势数据记录 (最多保留24小时数据)
  private trendData: Array<{
    timestamp: number;
    requests: number;
    hits: number;
  }> = [];

  // 配置参数
  private readonly maxCacheSize: number;
  private readonly cacheTTL: number; // 缓存过期时间(毫秒)
  private readonly enableCache: boolean;
  private readonly enablePersistence: boolean; // 是否启用持久化
  private syncInterval: NodeJS.Timeout | null = null; // 同步定时器

  constructor(options?: {
    maxSize?: number;
    ttl?: number;
    enabled?: boolean;
    persistence?: boolean;
  }) {
    this.maxCacheSize = options?.maxSize || 1000;
    this.cacheTTL = options?.ttl || 24 * 60 * 60 * 1000; // 默认24小时
    this.enableCache = options?.enabled !== false; // 默认启用
    this.enablePersistence = options?.persistence !== false; // 默认启用持久化
    
    if (this.enableCache) {
      console.log('🔥 元素缓存系统已启用');
      console.log(`   最大缓存数: ${this.maxCacheSize}`);
      console.log(`   过期时间: ${this.cacheTTL / 1000 / 60}分钟`);
      console.log(`   持久化: ${this.enablePersistence ? '✅ 已启用' : '❌ 已禁用'}`);
      
      if (this.enablePersistence) {
        // 从数据库加载缓存
        this.loadFromDatabase().catch(err => {
          console.error('❌ 从数据库加载缓存失败:', err);
        });
        
        // 定期同步到数据库（每5分钟）
        this.startPeriodicSync();
      }
    } else {
      console.log('⚠️ 元素缓存系统已禁用');
    }
  }

  /**
   * 生成缓存Key
   * 基于: URL + 元素描述 + 页面结构指纹
   */
  generateCacheKey(
    url: string,
    selector: string,
    snapshotFingerprint: string
  ): string {
    const rawKey = `${url}::${selector}::${snapshotFingerprint}`;
    return crypto.createHash('md5').update(rawKey).digest('hex');
  }

  /**
   * 生成页面快照指纹
   * 提取页面核心元素特征,忽略动态内容
   */
  generateSnapshotFingerprint(snapshot: string): string {
    if (!snapshot) return '';

    // 提取所有元素的ref和role,忽略动态文本
    const lines = snapshot.split('\n');
    const elements: string[] = [];

    for (const line of lines) {
      const trimmedLine = line.trim();
      const refMatch = trimmedLine.match(/\[ref=([a-zA-Z0-9_-]+)\]/);
      
      if (refMatch) {
        const ref = refMatch[1];
        let role = '';
        
        // 提取角色信息
        if (trimmedLine.includes('textbox')) role = 'textbox';
        else if (trimmedLine.includes('button')) role = 'button';
        else if (trimmedLine.includes('link')) role = 'link';
        else if (trimmedLine.includes('checkbox')) role = 'checkbox';
        else if (trimmedLine.includes('combobox')) role = 'combobox';
        
        if (role) {
          elements.push(`${ref}:${role}`);
        }
      }
    }

    // 对元素列表排序并生成哈希
    elements.sort();
    const fingerprint = elements.join('|');
    return crypto.createHash('md5').update(fingerprint).digest('hex').substring(0, 16);
  }

  /**
   * 获取缓存的元素
   */
  async get(cacheKey: string): Promise<CachedElement | null> {
    if (!this.enableCache) {
      return null;
    }

    this.stats.totalRequests++;
    this.recordTrendData(false);

    // L1: 尝试从内存缓存获取
    let cached: CachedElement | null = this.cache.get(cacheKey) || null;
    
    if (!cached && this.enablePersistence) {
      // L2: 从数据库获取
      cached = await this.getFromDatabase(cacheKey);
      if (cached) {
        // 加载到内存缓存
        this.cache.set(cacheKey, cached);
        console.log(`💾 从数据库加载缓存: ${cached.text}`);
      }
    }
    
    if (!cached) {
      this.stats.cacheMisses++;
      return null;
    }

    // 检查是否过期
    const age = Date.now() - cached.timestamp;
    if (age > this.cacheTTL) {
      this.cache.delete(cacheKey);
      if (this.enablePersistence) {
        await this.deleteFromDatabase(cacheKey);
      }
      this.stats.cacheMisses++;
      console.log(`🗑️ 缓存已过期: ${cacheKey.substring(0, 8)}... (${Math.round(age / 1000 / 60)}分钟前)`);
      return null;
    }

    // 缓存命中
    this.stats.cacheHits++;
    cached.hitCount++;
    this.recordTrendData(true);
    
    // 异步更新数据库中的命中统计
    if (this.enablePersistence) {
      this.updateHitCount(cacheKey, cached.hitCount).catch(err => {
        console.error('更新命中统计失败:', err);
      });
    }
    
    console.log(`✅ 缓存命中: ${cached.text} (命中${cached.hitCount}次)`);
    return cached;
  }

  /**
   * 设置缓存
   */
  async set(
    cacheKey: string,
    element: {
      ref: string;
      text: string;
      confidence?: number;
    },
    metadata?: {
      url?: string;
      selector?: string;
      snapshotFingerprint?: string;
    }
  ): Promise<void> {
    if (!this.enableCache) {
      return;
    }

    // 如果缓存已满，清理最旧的条目
    if (this.cache.size >= this.maxCacheSize) {
      await this.evictOldest();
    }

    const cachedElement: CachedElement = {
      ref: element.ref,
      text: element.text,
      confidence: element.confidence || 100,
      timestamp: Date.now(),
      hitCount: 0
    };

    // L1: 存入内存缓存
    this.cache.set(cacheKey, cachedElement);
    console.log(`💾 元素已缓存: ${element.text} (${cacheKey.substring(0, 8)}...)`);
    
    // L2: 持久化到数据库
    if (this.enablePersistence) {
      await this.saveToDatabase(cacheKey, cachedElement, metadata);
    }
  }

  /**
   * 清理最旧的缓存条目
   */
  private async evictOldest(): Promise<void> {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    // 找到最旧的条目
    for (const [key, value] of this.cache.entries()) {
      if (value.timestamp < oldestTime) {
        oldestTime = value.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const evicted = this.cache.get(oldestKey);
      this.cache.delete(oldestKey);
      
      // 从数据库中删除
      if (this.enablePersistence) {
        await this.deleteFromDatabase(oldestKey);
      }
      
      console.log(`🗑️ 缓存已满,移除最旧条目: ${evicted?.text} (${Math.round((Date.now() - oldestTime) / 1000 / 60)}分钟前)`);
    }
  }

  /**
   * 清空指定URL的缓存
   */
  clearByUrl(url: string): number {
    let count = 0;
    const urlHash = crypto.createHash('md5').update(url).digest('hex').substring(0, 16);
    
    for (const [key] of this.cache.entries()) {
      if (key.includes(urlHash)) {
        this.cache.delete(key);
        count++;
      }
    }

    if (count > 0) {
      console.log(`🗑️ 已清理URL相关缓存: ${url} (${count}条)`);
    }
    
    return count;
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`🗑️ 已清空所有缓存 (${size}条)`);
  }

  /**
   * 🔥 清空所有缓存（包括数据库）
   */
  async clearAll(): Promise<number> {
    // 清空内存缓存
    const memorySize = this.cache.size;
    this.cache.clear();
    console.log(`🗑️ 已清空内存缓存 (${memorySize}条)`);
    
    // 清空数据库缓存
    if (this.enablePersistence) {
      try {
        const result = await prisma.ai_element_cache.deleteMany({});
        console.log(`🗑️ 已清空数据库缓存 (${result.count}条)`);
        return result.count;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        console.error('❌ 清空数据库缓存失败:', errorMessage);
        return 0;
      }
    }
    
    return 0;
  }

  /**
   * 记录趋势数据
   */
  private recordTrendData(isHit: boolean): void {
    const now = Date.now();
    const currentMinute = Math.floor(now / 60000) * 60000; // 取整到分钟
    
    // 查找当前分钟的记录
    let record = this.trendData.find(r => r.timestamp === currentMinute);
    
    if (!record) {
      record = { timestamp: currentMinute, requests: 0, hits: 0 };
      this.trendData.push(record);
      
      // 保留最近24小时的数据
      const cutoff = now - 24 * 60 * 60 * 1000;
      this.trendData = this.trendData.filter(r => r.timestamp > cutoff);
    }
    
    record.requests++;
    if (isHit) {
      record.hits++;
    }
  }

  /**
   * 获取缓存统计信息（同步版本，仅从内存获取）
   */
  getStats(): CacheStats {
    const hitRate = this.stats.totalRequests > 0
      ? (this.stats.cacheHits / this.stats.totalRequests) * 100
      : 0;

    // 估算内存占用
    let memoryUsage = 0;
    for (const [key, value] of this.cache.entries()) {
      memoryUsage += key.length * 2; // key是字符串
      memoryUsage += value.ref.length * 2;
      memoryUsage += value.text.length * 2;
      memoryUsage += 32; // 其他字段的估算大小
    }

    // 生成趋势数据（最近6小时，每小时一个点）
    const trendData = this.generateTrendData();

    return {
      totalRequests: this.stats.totalRequests,
      cacheHits: this.stats.cacheHits,
      cacheMisses: this.stats.cacheMisses,
      hitRate: Math.round(hitRate * 100) / 100,
      totalElements: this.cache.size,
      memoryUsage: Math.round(memoryUsage / 1024),
      trendData
    };
  }

  /**
   * 🔥 获取缓存统计信息（异步版本，从数据库聚合数据）
   * 合并内存统计和数据库统计，确保服务重启后仍能获取历史数据
   */
  async getStatsFromDatabase(): Promise<CacheStats> {
    try {
      console.log('📊 [缓存统计] 开始从数据库获取统计数据...');
      console.log('📊 [缓存统计] 内存统计:', {
        totalRequests: this.stats.totalRequests,
        cacheHits: this.stats.cacheHits,
        cacheMisses: this.stats.cacheMisses,
        memorySize: this.cache.size
      });
      
      // 从数据库聚合统计数据
      const [dbStats, dbCount] = await Promise.all([
        // 聚合数据库中的命中统计
        prisma.ai_element_cache.aggregate({
          _sum: {
            hit_count: true
          },
          where: {
            expires_at: {
              gt: new Date()
            }
          }
        }),
        // 统计数据库中的缓存项总数
        prisma.ai_element_cache.count({
          where: {
            expires_at: {
              gt: new Date()
            }
          }
        })
      ]);
      
      console.log('📊 [缓存统计] 数据库查询结果:', {
        dbHitCount: dbStats._sum.hit_count,
        dbCacheCount: dbCount
      });

      // 数据库中的总命中次数（这是持久化的历史累计数据）
      // 注意：这是所有缓存项的 hit_count 总和，表示历史累计命中次数
      const dbHits = dbStats._sum.hit_count || 0;
      
      // 合并内存统计和数据库统计
      // 数据库统计是历史累计数据，内存统计是当前会话的增量
      // 总命中数 = 数据库历史命中数 + 当前会话新增命中数
      const totalHits = dbHits + this.stats.cacheHits;
      
      // 总请求数的计算：
      // - 当前会话的总请求数 = this.stats.totalRequests（包含命中和未命中）
      // - 历史总请求数无法准确获取（因为未命中请求没有被记录）
      // - 我们使用：历史命中数（作为历史请求的下限）+ 当前会话请求数
      //   这样至少能反映当前会话的完整统计和历史命中的累计
      const totalRequests = this.stats.totalRequests > 0 
        ? dbHits + this.stats.totalRequests  // 历史命中数（作为历史请求的下限）+ 当前会话请求数
        : (dbHits > 0 ? dbHits : 0);  // 如果当前会话没有请求，且历史有命中，使用历史命中数作为估算
      
      // 计算命中率
      const hitRate = totalRequests > 0
        ? (totalHits / totalRequests) * 100
        : 0;

      // 估算内存占用
      let memoryUsage = 0;
      for (const [key, value] of this.cache.entries()) {
        memoryUsage += key.length * 2;
        memoryUsage += value.ref.length * 2;
        memoryUsage += value.text.length * 2;
        memoryUsage += 32;
      }

      // 生成趋势数据
      const trendData = this.generateTrendData();

      // 总元素数：内存缓存数 + 数据库缓存数（去重）
      const totalElements = Math.max(this.cache.size, dbCount);

      const result = {
        totalRequests: totalRequests,
        cacheHits: totalHits,
        cacheMisses: totalRequests - totalHits,
        hitRate: Math.round(hitRate * 100) / 100,
        totalElements: totalElements,
        memoryUsage: Math.round(memoryUsage / 1024),
        trendData
      };
      
      console.log('📊 [缓存统计] 最终统计结果:', result);
      
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      console.error('❌ [缓存统计] 从数据库获取统计失败:', errorMessage);
      console.error('❌ [缓存统计] 错误详情:', error);
      
      // 如果数据库查询失败，回退到内存统计
      console.log('⚠️ [缓存统计] 回退到内存统计');
      return this.getStats();
    }
  }

  /**
   * 生成趋势图表数据
   */
  private generateTrendData(): Array<{ time: string; hitRate: number; requests: number }> {
    if (this.trendData.length === 0) {
      // 如果没有趋势数据，返回空数组
      return [];
    }

    const now = Date.now();
    const result: Array<{ time: string; hitRate: number; requests: number }> = [];
    
    // 生成最近6小时的数据点（每小时一个）
    for (let i = 5; i >= 0; i--) {
      const hourStart = now - i * 60 * 60 * 1000;
      const hourEnd = hourStart + 60 * 60 * 1000;
      
      // 收集这个小时内的所有数据
      const hourData = this.trendData.filter(
        r => r.timestamp >= hourStart && r.timestamp < hourEnd
      );
      
      if (hourData.length > 0) {
        const totalRequests = hourData.reduce((sum, r) => sum + r.requests, 0);
        const totalHits = hourData.reduce((sum, r) => sum + r.hits, 0);
        const hitRate = totalRequests > 0 ? (totalHits / totalRequests) * 100 : 0;
        
        const date = new Date(hourStart);
        const timeLabel = `${date.getHours().toString().padStart(2, '0')}:00`;
        
        result.push({
          time: timeLabel,
          hitRate: Math.round(hitRate * 10) / 10,
          requests: totalRequests
        });
      } else {
        // 如果这个小时没有数据，使用0
        const date = new Date(hourStart);
        const timeLabel = `${date.getHours().toString().padStart(2, '0')}:00`;
        result.push({
          time: timeLabel,
          hitRate: 0,
          requests: 0
        });
      }
    }
    
    return result;
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
    console.log('📊 缓存统计信息已重置');
  }

  /**
   * 打印缓存统计报告
   */
  printStatsReport(): void {
    const stats = this.getStats();
    
    console.log('\n📊 ========== 元素缓存统计报告 ==========');
    console.log(`   总请求数: ${stats.totalRequests}`);
    console.log(`   缓存命中: ${stats.cacheHits} ✅`);
    console.log(`   缓存未命中: ${stats.cacheMisses} ❌`);
    console.log(`   命中率: ${stats.hitRate}%`);
    console.log(`   缓存元素数: ${stats.totalElements}/${this.maxCacheSize}`);
    console.log(`   内存占用: ${stats.memoryUsage}KB`);
    
    if (stats.totalRequests > 0) {
      const savedCalls = stats.cacheHits;
      console.log(`   💰 节省AI调用: ${savedCalls}次`);
      console.log(`   ⚡ 性能提升: ${stats.hitRate}%`);
    }
    
    console.log('==========================================\n');
  }

  /**
   * 导出缓存数据(用于持久化)
   */
  exportCache(): string {
    const cacheData = Array.from(this.cache.entries()).map(([key, value]) => ({
      key,
      value
    }));
    
    return JSON.stringify({
      version: '1.0',
      timestamp: Date.now(),
      data: cacheData
    });
  }

  /**
   * 导入缓存数据(用于恢复)
   */
  importCache(jsonData: string): number {
    try {
      const parsed = JSON.parse(jsonData);
      
      if (!parsed.data || !Array.isArray(parsed.data)) {
        throw new Error('无效的缓存数据格式');
      }

      let imported = 0;
      for (const item of parsed.data) {
        if (item.key && item.value && this.cache.size < this.maxCacheSize) {
          this.cache.set(item.key, item.value);
          imported++;
        }
      }

      console.log(`📥 已导入缓存: ${imported}条`);
      return imported;
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      console.error('❌ 导入缓存失败:', errorMessage);
      return 0;
    }
  }

  /**
   * 🔥 从数据库加载缓存到内存
   */
  private async loadFromDatabase(): Promise<void> {
    try {
      const now = new Date();
      
      // 从数据库加载未过期的缓存
      const cachedItems = await prisma.ai_element_cache.findMany({
        where: {
          expires_at: {
            gt: now
          }
        },
        orderBy: {
          created_at: 'desc'
        },
        take: this.maxCacheSize
      });

      let loaded = 0;
      for (const item of cachedItems) {
        if (this.cache.size >= this.maxCacheSize) break;
        
        const cachedElement: CachedElement = {
          ref: item.element_ref,
          text: item.element_text,
          confidence: item.confidence,
          timestamp: item.created_at.getTime(),
          hitCount: item.hit_count
        };
        
        this.cache.set(item.cache_key, cachedElement);
        loaded++;
      }

      console.log(`📥 从数据库加载缓存: ${loaded}条`);
      
      // 清理过期的数据库记录
      const deleted = await prisma.ai_element_cache.deleteMany({
        where: {
          expires_at: {
            lte: now
          }
        }
      });
      
      if (deleted.count > 0) {
        console.log(`🗑️ 清理过期缓存: ${deleted.count}条`);
      }
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      console.error('❌ 从数据库加载缓存失败:', errorMessage);
    }
  }

  /**
   * 🔥 从数据库获取单个缓存
   */
  private async getFromDatabase(cacheKey: string): Promise<CachedElement | null> {
    try {
      const item = await prisma.ai_element_cache.findUnique({
        where: { cache_key: cacheKey }
      });

      if (!item) {
        return null;
      }

      // 检查是否过期
      if (item.expires_at <= new Date()) {
        await this.deleteFromDatabase(cacheKey);
        return null;
      }

      return {
        ref: item.element_ref,
        text: item.element_text,
        confidence: item.confidence,
        timestamp: item.created_at.getTime(),
        hitCount: item.hit_count
      };
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      console.error('❌ 从数据库获取缓存失败:', errorMessage);
      return null;
    }
  }

  /**
   * 🔥 保存缓存到数据库
   */
  private async saveToDatabase(
    cacheKey: string,
    element: CachedElement,
    metadata?: {
      url?: string;
      selector?: string;
      snapshotFingerprint?: string;
    }
  ): Promise<void> {
    try {
      const expiresAt = new Date(element.timestamp + this.cacheTTL);
      
      await prisma.ai_element_cache.upsert({
        where: { cache_key: cacheKey },
        update: {
          element_ref: element.ref,
          element_text: element.text,
          confidence: element.confidence,
          hit_count: element.hitCount,
          expires_at: expiresAt
        },
        create: {
          cache_key: cacheKey,
          url: metadata?.url || '',
          selector: metadata?.selector || '',
          snapshot_fp: metadata?.snapshotFingerprint || '',
          element_ref: element.ref,
          element_text: element.text,
          confidence: element.confidence,
          hit_count: 0,
          expires_at: expiresAt
        }
      });
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      console.error('❌ 保存缓存到数据库失败:', errorMessage);
    }
  }

  /**
   * 🔥 从数据库删除缓存
   */
  private async deleteFromDatabase(cacheKey: string): Promise<void> {
    try {
      await prisma.ai_element_cache.delete({
        where: { cache_key: cacheKey }
      }).catch(() => {
        // 忽略删除不存在的记录的错误
      });
    } catch {
      // 忽略删除错误
    }
  }

  /**
   * 🔥 更新缓存命中统计
   */
  private async updateHitCount(cacheKey: string, hitCount: number): Promise<void> {
    try {
      await prisma.ai_element_cache.update({
        where: { cache_key: cacheKey },
        data: {
          hit_count: hitCount,
          last_hit_at: new Date()
        }
      }).catch(() => {
        // 忽略更新不存在的记录的错误
      });
    } catch {
      // 忽略更新错误
    }
  }

  /**
   * 🔥 启动定期同步任务
   */
  private startPeriodicSync(): void {
    // 每5分钟同步一次内存缓存到数据库
    this.syncInterval = setInterval(() => {
      this.syncToDatabase().catch(err => {
        console.error('定期同步缓存失败:', err);
      });
    }, 5 * 60 * 1000);
    
    console.log('⏰ 已启动缓存定期同步任务（每5分钟）');
  }

  /**
   * 🔥 同步内存缓存到数据库
   */
  private async syncToDatabase(): Promise<void> {
    try {
      let synced = 0;
      for (const [key, value] of this.cache.entries()) {
        await this.saveToDatabase(key, value);
        synced++;
      }
      
      if (synced > 0) {
        console.log(`🔄 同步缓存到数据库: ${synced}条`);
      }
    } catch {
      console.error('❌ 同步缓存失败');
    }
  }

  /**
   * 🔥 停止定期同步任务
   */
  stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('⏹️ 已停止缓存定期同步任务');
    }
  }

  /**
   * 🔥 优雅关闭（确保同步所有缓存）
   */
  async shutdown(): Promise<void> {
    console.log('🔄 正在同步缓存到数据库...');
    this.stopPeriodicSync();
    await this.syncToDatabase();
    console.log('✅ 缓存系统已关闭');
  }
}

// 导出单例实例
export const elementCache = new ElementCache({
  maxSize: parseInt(process.env.ELEMENT_CACHE_SIZE || '1000'),
  ttl: parseInt(process.env.ELEMENT_CACHE_TTL || String(24 * 60 * 60 * 1000)),
  enabled: process.env.ELEMENT_CACHE_ENABLED !== 'false',
  persistence: process.env.ELEMENT_CACHE_PERSISTENCE !== 'false' // 默认启用持久化
});

// 🔥 进程退出时确保缓存同步
process.on('SIGTERM', async () => {
  await elementCache.shutdown();
});

process.on('SIGINT', async () => {
  await elementCache.shutdown();
});

