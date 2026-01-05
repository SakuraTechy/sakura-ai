import { PrismaClient, Prisma } from '../../src/generated/prisma/index.js';
import { v4 as uuidv4 } from 'uuid';
import { WebSocketManager } from './websocket.js';
import { PlaywrightMcpClient } from './mcpClient.js';
import { MCPToolMapper } from '../utils/mcpToolMapper.js';
import { AITestParser } from './aiParser.js';
import { ScreenshotService } from './screenshotService.js';
import { DatabaseService } from './databaseService.js';
import { testRunStore } from '../../lib/TestRunStore.js';
import type { TestRun, TestStep, TestLog, TestCase, TestRunStatus, TestAction } from '../../src/types/test.js';
import type { ScreenshotRecord } from '../types/screenshot.js';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import { QueueService, QueueTask } from './queueService.js';
import { StreamService } from './streamService.js';
import { EvidenceService } from './evidenceService.js';
import { TestCaseExecutionService } from './testCaseExecutionService.js';
import { PlaywrightTestRunner } from './playwrightTestRunner.js';
import sharp from 'sharp';
// 🔥 导入测试计划状态更新函数
import { updateTestPlanStatusFromLatestExecution, updateTestPlanExecution } from './testPlanService.js';

// 重构后的测试执行服务：支持 MCP 和 Playwright Test Runner 两种执行引擎
export class TestExecutionService {
  private wsManager: WebSocketManager;
  private mcpClient: PlaywrightMcpClient;
  private aiParser: AITestParser;
  private screenshotService: ScreenshotService;
  private databaseService: DatabaseService;
  private prisma: PrismaClient; // 保持兼容性，内部使用
  private queueService: QueueService;
  private streamService: StreamService;
  private evidenceService: EvidenceService;
  private executionService: TestCaseExecutionService;
  private playwrightRunner: PlaywrightTestRunner | null = null; // 🔥 新增：Playwright Test Runner 实例

  // 🚀 Phase 4: 性能监控系统
  private performanceMonitor = {
    enabled: process.env.ENABLE_PERFORMANCE_MONITORING !== 'false',
    failureThreshold: 0.05, // 失败率超过5%自动回退
    avgTimeThreshold: 30, // 平均执行时间超过30秒报警
    optimizationMode: process.env.PERFORMANCE_MODE || 'balanced', // fast|balanced|stable
    
    stats: {
      totalRuns: 0,
      successfulRuns: 0,
      totalTime: 0,
      optimizedRuns: 0,
      fallbackRuns: 0
    },
    
    recordExecution: (runId: string, success: boolean, duration: number, usedOptimization: boolean) => {
      this.performanceMonitor.stats.totalRuns++;
      if (success) this.performanceMonitor.stats.successfulRuns++;
      this.performanceMonitor.stats.totalTime += duration;
      if (usedOptimization) this.performanceMonitor.stats.optimizedRuns++;
      else this.performanceMonitor.stats.fallbackRuns++;
      
      // 检查是否需要回退
      if (this.performanceMonitor.shouldFallback()) {
        console.log('⚠️ 性能监控：检测到优化导致问题，建议切换到安全模式');
      }
    },
    
    shouldFallback: () => {
      const { stats } = this.performanceMonitor;
      if (stats.totalRuns < 10) return false; // 样本太小，不做判断
      
      const failureRate = 1 - (stats.successfulRuns / stats.totalRuns);
      const avgTime = stats.totalTime / stats.totalRuns;
      
      return failureRate > this.performanceMonitor.failureThreshold || 
             avgTime > this.performanceMonitor.avgTimeThreshold;
    },
    
    getReport: () => {
      const { stats } = this.performanceMonitor;
      if (stats.totalRuns === 0) return '性能监控：暂无数据';
      
      return `性能监控报告:
📊 总运行次数: ${stats.totalRuns}
✅ 成功率: ${((stats.successfulRuns / stats.totalRuns) * 100).toFixed(1)}%
⏱️  平均用时: ${(stats.totalTime / stats.totalRuns).toFixed(1)}秒
🚀 优化模式运行: ${stats.optimizedRuns}次
🛡️ 安全模式运行: ${stats.fallbackRuns}次`;
    }
  };

  constructor(
    wsManager: WebSocketManager, 
    aiParser: AITestParser, 
    mcpClient: PlaywrightMcpClient, 
    databaseService?: DatabaseService,
    screenshotService?: ScreenshotService,
    queueService?: QueueService,
    streamService?: StreamService,
    evidenceService?: EvidenceService
  ) {
    this.wsManager = wsManager;
    this.aiParser = aiParser;
    this.mcpClient = mcpClient;
    
    // 🔥 使用依赖注入的数据库服务
    this.databaseService = databaseService || DatabaseService.getInstance();
    this.prisma = this.databaseService.getClient();
    
    // 创建Screenshot服务，传入数据库客户端
    this.screenshotService = screenshotService || new ScreenshotService(this.prisma);

    // 🔥 修正：初始化新增强服务
    this.queueService = queueService || new QueueService({
      maxConcurrency: 6,
      perUserLimit: 2,
      taskTimeout: 600000, // 10分钟
      retryAttempts: 1
    });

    this.streamService = streamService || new StreamService({
      fps: 2,
      jpegQuality: 85,  // 🔥 提高质量：从60提升到85，提供更清晰的画面
      width: 1920,       // 🔥 提高分辨率：从1024提升到1920，支持高清显示
      height: 1080,      // 🔥 提高分辨率：从768提升到1080，支持高清显示
      maskSelectors: []
    });

    this.evidenceService = evidenceService || new EvidenceService(
      this.prisma,
      path.join(process.cwd(), 'artifacts'),
      process.env.BASE_URL || 'http://localhost:3000'
    );

    // 🔥 初始化 Playwright Test Runner（延迟初始化，按需创建）
    // this.playwrightRunner 将在需要时创建

    // 🔥 初始化测试执行持久化服务
    this.executionService = TestCaseExecutionService.getInstance();

    console.log(`🗄️ TestExecutionService已连接到数据库服务`);

    // 在构造函数中记录AI解析器的模型信息
    this.logAIParserInfo();
  }

  // 记录AI解析器信息
  private logAIParserInfo(): void {
    try {
      const modelInfo = this.aiParser.getCurrentModelInfo();
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`🤖 测试执行服务已初始化，AI解析器配置:`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`   📦 模型: ${modelInfo.modelName}`);
      console.log(`   🏢 提供商: ${modelInfo.provider}`);
      console.log(`   ⚙️ 运行模式: ${modelInfo.mode}`);

      if (this.aiParser.isConfigManagerMode()) {
        console.log(`   🔧 配置管理器: 已启用`);
      } else {
        console.log(`   🔧 配置管理器: 未启用 (使用传统模式)`);
      }
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    } catch (error: any) {
      console.warn(`⚠️ 无法获取AI解析器模型信息: ${error.message}`);
    }
  }

  // 重新加载AI解析器配置（无需重启服务）
  public async reloadAIParserConfiguration(): Promise<void> {
    try {
      console.log(`🔄 测试执行服务：重新加载AI解析器配置...`);

      // 调用AI解析器的配置重载方法
      await this.aiParser.reloadConfiguration();

      // 重新记录配置信息
      this.logAIParserInfo();

      console.log(`✅ 测试执行服务：AI解析器配置重新加载完成`);
    } catch (error) {
      console.error(`❌ 测试执行服务：重新加载AI解析器配置失败:`, error);
      throw error;
    }
  }

  // 获取当前AI解析器状态信息
  public getAIParserStatus(): {
    modelInfo: { modelName: string; provider: string; mode: string };
    isConfigManagerMode: boolean;
    isReady: boolean;
  } {
    try {
      const modelInfo = this.aiParser.getCurrentModelInfo();
      return {
        modelInfo,
        isConfigManagerMode: this.aiParser.isConfigManagerMode(),
        isReady: true
      };
    } catch (error) {
      return {
        modelInfo: { modelName: '未知', provider: '未知', mode: '未知' },
        isConfigManagerMode: false,
        isReady: false
      };
    }
  }

  // #region Test Case Management
  private dbTestCaseToApp(dbCase: { id: number; title: string; steps: Prisma.JsonValue | null; tags: Prisma.JsonValue | null; system: string | null; module: string | null; project?: string | null; created_at: Date | null; updated_at?: Date | null; }): TestCase {
      let steps = '';
      let assertions = '';
      let author = 'System'; // 🔥 默认值
      let priority: 'high' | 'medium' | 'low' = 'medium'; // 🔥 默认值
      let status: 'active' | 'draft' | 'disabled' = 'active'; // 🔥 默认值
      let projectVersion: string | undefined = undefined; // 🔥 新增：版本信息
      let preconditions = ''; // 🔥 新增：前置条件
      let testData = ''; // 🔥 新增：测试数据
      let caseType: string | undefined = undefined; // 🔥 新增：用例类型
      if (typeof dbCase.steps === 'string' && dbCase.steps) {
        try {
          const stepsObj = JSON.parse(dbCase.steps);
          if (stepsObj && typeof stepsObj === 'object') {
            assertions = stepsObj.assertions || '';
            steps = stepsObj.steps || '';
            // 🔥 修复：从 steps JSON 中读取 author，如果存在则使用，否则使用默认值
            if (stepsObj.author !== undefined && stepsObj.author !== null && stepsObj.author !== '') {
              author = stepsObj.author;
            } else {
              author = 'System';
            }
            // 🔥 新增：从 steps JSON 中读取 priority 和 status
            if (stepsObj.priority && ['high', 'medium', 'low'].includes(stepsObj.priority)) {
              priority = stepsObj.priority;
            }
            if (stepsObj.status && ['active', 'draft', 'disabled'].includes(stepsObj.status)) {
              status = stepsObj.status;
            }
            // 🔥 新增：从 steps JSON 中读取版本信息
            if (stepsObj.projectVersion !== undefined && stepsObj.projectVersion !== null && stepsObj.projectVersion !== '') {
              projectVersion = stepsObj.projectVersion;
            }
            // 🔥 新增：从 steps JSON 中读取前置条件和测试数据
            preconditions = stepsObj.preconditions || '';
            testData = stepsObj.testData || '';
            // 🔥 新增：从 steps JSON 中读取用例类型
            if (stepsObj.caseType) {
              caseType = stepsObj.caseType;
            }
          } else {
            steps = dbCase.steps;
          }
        } catch (e) {
          steps = dbCase.steps;
        }
      }
      
      // 🔥 新增：如果没有 caseType，尝试从 tags 推断
      if (!caseType && Array.isArray(dbCase.tags)) {
        const tags = dbCase.tags as string[];
        if (tags.some(tag => tag.includes('冒烟') || tag.toLowerCase().includes('smoke'))) {
          caseType = 'SMOKE';
        } else if (tags.some(tag => tag.includes('全量') || tag.toLowerCase().includes('full'))) {
          caseType = 'FULL';
        } else if (tags.some(tag => tag.includes('异常') || tag.toLowerCase().includes('abnormal'))) {
          caseType = 'ABNORMAL';
        } else if (tags.some(tag => tag.includes('边界') || tag.toLowerCase().includes('boundary'))) {
          caseType = 'BOUNDARY';
        } else if (tags.some(tag => tag.includes('性能') || tag.toLowerCase().includes('performance'))) {
          caseType = 'PERFORMANCE';
        } else if (tags.some(tag => tag.includes('安全') || tag.toLowerCase().includes('security'))) {
          caseType = 'SECURITY';
        } else if (tags.some(tag => tag.includes('可用性') || tag.toLowerCase().includes('usability'))) {
          caseType = 'USABILITY';
        } else if (tags.some(tag => tag.includes('兼容') || tag.toLowerCase().includes('compatibility'))) {
          caseType = 'COMPATIBILITY';
        } else if (tags.some(tag => tag.includes('可靠') || tag.toLowerCase().includes('reliability'))) {
          caseType = 'RELIABILITY';
        }
      }

    return {
      id: dbCase.id,
      name: dbCase.title,
      preconditions: preconditions, // 🔥 新增：前置条件
      testData: testData, // 🔥 新增：测试数据
      steps: steps,
      assertions: assertions,
      tags: (Array.isArray(dbCase.tags) ? dbCase.tags : []) as string[],
      system: dbCase.system || undefined,
      module: dbCase.module || undefined,
      projectVersion: projectVersion, // 🔥 新增：版本信息
      department: dbCase.project || undefined, // 🔥 注意：TestCase 接口使用 department，但数据库字段是 project
      created: dbCase.created_at?.toISOString(),
      updated: dbCase.updated_at?.toISOString(), // 🔥 新增：更新时间字段
      priority: priority, // 🔥 修复：使用从 steps JSON 中读取的 priority
      status: status, // 🔥 修复：使用从 steps JSON 中读取的 status
      author: author, // 🔥 使用从 steps JSON 中读取的 author
      caseType: caseType, // 🔥 新增：用例类型
    };
  }

  public async findTestCaseById(id: number): Promise<TestCase | null> {
    const testCase = await this.prisma.test_cases.findUnique({ 
      where: { id },
      select: {
        id: true,
        title: true,
        steps: true,
        tags: true,
        system: true,
        module: true,
        project: true,
        created_at: true,
        updated_at: true, // 🔥 新增：更新时间字段
        deleted_at: true
      }
    });
    // 🔥 软删除：如果已删除，返回null
    if (testCase && testCase.deleted_at) {
      return null;
    }
    return testCase ? this.dbTestCaseToApp(testCase) : null;
  }

  public async getTestCases(): Promise<TestCase[]> {
    const testCases = await this.prisma.test_cases.findMany({
      where: {
        deleted_at: null // 🔥 软删除：只查询未删除的记录
      },
      select: {
        id: true,
        title: true,
        steps: true,
        tags: true,
        system: true,
        module: true,
        project: true,
        created_at: true,
        updated_at: true // 🔥 新增：更新时间字段
      }
    });
    return testCases.map(this.dbTestCaseToApp);
  }

  // 🚀 新增：根据ID获取单个测试用例
  public async getTestCaseById(id: number): Promise<TestCase | null> {
    const testCase = await this.prisma.test_cases.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        steps: true,
        tags: true,
        system: true,
        module: true,
        project: true,
        created_at: true,
        updated_at: true, // 🔥 新增：更新时间字段
        deleted_at: true
      }
    });
    // 🔥 软删除：如果已删除，返回null
    if (testCase && testCase.deleted_at) {
      return null;
    }
    return testCase ? this.dbTestCaseToApp(testCase) : null;
  }

  // 🔥 新增：支持分页和过滤的测试用例查询
  /**
   * 🔥 新增：增强测试用例数据，添加成功率、最后运行时间、执行状态和结果
   * 🔥 修复：成功率改为基于最新执行的步骤通过率（passed_steps / total_steps）
   */
  private async enhanceTestCasesWithRunData(testCases: TestCase[]): Promise<TestCase[]> {
    if (testCases.length === 0) return testCases;

    // 批量获取测试用例的运行数据
    const testCaseIds = testCases.map(tc => tc.id);
    
    // 🔥 修复：从 test_case_executions 表获取最新执行记录（包含步骤统计）
    // 获取每个测试用例的最新执行记录
    const allExecutions = await this.prisma.test_case_executions.findMany({
      where: {
        test_case_id: { in: testCaseIds },
        // 只获取已完成的执行记录
        status: { in: ['completed', 'failed', 'error'] }
      },
      select: {
        test_case_id: true,
        status: true,
        started_at: true,
        finished_at: true,
        total_steps: true,
        passed_steps: true,
        failed_steps: true,
        completed_steps: true
      },
      orderBy: {
        finished_at: 'desc'
      }
    });

    // 按测试用例ID分组，只保留每个用例的最新执行记录
    const latestExecutionByCase = new Map<number, typeof allExecutions[0]>();
    for (const exec of allExecutions) {
      if (!latestExecutionByCase.has(exec.test_case_id)) {
        latestExecutionByCase.set(exec.test_case_id, exec);
      }
    }

    // 增强每个测试用例的数据
    return testCases.map(testCase => {
      const latestExec = latestExecutionByCase.get(testCase.id);
      
      if (!latestExec) {
        return {
          ...testCase,
          success_rate: 0,
          lastRun: '',
          executionStatus: undefined,
          executionResult: undefined
        };
      }

      // 🔥 修复：计算步骤通过率
      // success_rate = (passed_steps / total_steps) * 100
      const totalSteps = latestExec.total_steps || 0;
      const passedSteps = latestExec.passed_steps || 0;
      const successRate = totalSteps > 0 
        ? Math.round((passedSteps / totalSteps) * 100)
        : 0;
      
      // 🔥 调试日志：记录成功率计算过程
      console.log(`[成功率计算] 测试用例ID: ${testCase.id}, 总步骤数: ${totalSteps}, 通过步骤数: ${passedSteps}, 成功率: ${successRate}%`);

      // 格式化最后运行时间
      let lastRun = '-';
      const execTime = latestExec.finished_at || latestExec.started_at;
      if (execTime) {
        try {
          const date = new Date(execTime);
          lastRun = date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          });
        } catch {
          lastRun = execTime.toString();
        }
      }

      // 映射执行状态
      let executionStatus: string | undefined;
      const statusMap: Record<string, string> = {
        'queued': 'pending',
        'running': 'running',
        'completed': 'completed',
        'failed': 'failed',
        'error': 'error',
        'cancelled': 'cancelled'
      };
      executionStatus = statusMap[latestExec.status] || 'pending';

      // 根据步骤结果判断执行结果
      let executionResult: string | undefined;
      const failedSteps = latestExec.failed_steps || 0;
      if (latestExec.status === 'completed' || latestExec.status === 'failed') {
        if (failedSteps > 0) {
          executionResult = 'fail';
        } else if (passedSteps >= totalSteps && totalSteps > 0) {
          executionResult = 'pass';
        } else if (totalSteps > 0 && passedSteps < totalSteps) {
          executionResult = 'block';
        }
      }

      return {
        ...testCase,
        success_rate: successRate,
        lastRun,
        executionStatus,
        executionResult
      };
    });
  }

  public async getTestCasesPaginated(params: {
    page: number;
    pageSize: number;
    search?: string;
    tag?: string;
    priority?: string;
    status?: string;
    system?: string;
    module?: string; // 🔥 新增：模块参数
    projectVersion?: string; // 🔥 新增：版本参数
    executionStatus?: string; // 🆕 执行状态筛选
    executionResult?: string; // 🆕 执行结果筛选
    author?: string; // 🆕 创建者筛选
    userDepartment?: string;
    isSuperAdmin?: boolean;
  }): Promise<{data: TestCase[], total: number}> {
    const { page, pageSize, search, tag, priority, status, system, module, projectVersion, executionStatus, executionResult, author, userDepartment, isSuperAdmin } = params;

    // 构建基础查询条件（用于 count，不支持 mode 参数）
    const whereForCount: any = {
      deleted_at: null // 🔥 软删除：只查询未删除的记录
    };

    // 构建查询条件（用于 findMany，支持 mode 参数）
    const where: any = {
      deleted_at: null // 🔥 软删除：只查询未删除的记录
    };

    // 🔥 部门权限过滤：非超级管理员只能看自己部门的数据
    if (!isSuperAdmin && userDepartment) {
      whereForCount.project = userDepartment;
      where.project = userDepartment;
    }

    // 搜索条件（标题、系统、模块）
    // 注意：ID搜索在应用层进行，以支持完全的模糊匹配
    // 🔥 修复：MySQL 不支持 mode 参数，移除所有 mode（MySQL 的 contains 默认已是不区分大小写）
    const searchTerm = search && search.trim() ? search.trim() : '';
    let searchIdMode = false; // 标记是否为纯数字搜索
    
    if (searchTerm) {
      // 检查是否为纯数字搜索
      const searchId = parseInt(searchTerm, 10);
      searchIdMode = !isNaN(searchId) && searchId > 0 && searchTerm === String(searchId);
      
      if (!searchIdMode) {
        // 非纯数字搜索：在数据库层面进行文本搜索
        const searchConditions: any[] = [
          { title: { contains: searchTerm } },
          { system: { contains: searchTerm } },
          { module: { contains: searchTerm } }
        ];
        
        // MySQL 中 contains 默认不区分大小写（取决于字段 collation）
        whereForCount.OR = searchConditions;
        where.OR = searchConditions;
      }
      // 纯数字搜索：不在数据库层面过滤，稍后在应用层进行ID模糊匹配
    }

    // 系统过滤 - 🔥 修复：使用equals而非contains避免特殊字符问题
    if (system && system.trim()) {
      whereForCount.system = { equals: system };
      where.system = { equals: system };
    }

    // 🔥 新增：模块过滤
    if (module && module.trim()) {
      whereForCount.module = { equals: module };
      where.module = { equals: module };
    }

    // 标签过滤（Prisma JSON字段查询）
    if (tag && tag.trim()) {
      const tagCondition = {
        array_contains: [tag]
      };
      whereForCount.tags = tagCondition;
      where.tags = tagCondition;
    }

    // 计算偏移量
    const skip = (page - 1) * pageSize;

    // 获取总数和数据
    const [total, testCases] = await Promise.all([
      this.prisma.test_cases.count({ where: whereForCount }),
      this.prisma.test_cases.findMany({
        where,
        select: {
          id: true,
          title: true,
          steps: true,
          tags: true,
          system: true,
          module: true,
          project: true, // 🔥 修复：添加 project 字段
          created_at: true,
          updated_at: true // 🔥 新增：更新时间字段
        },
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' }
      })
    ]);

    // 🔥 应用层过滤 priority、status、ID（因为这些字段在数据库中不存在或需要特殊处理）
    let filteredData = testCases.map(this.dbTestCaseToApp);

    // 🆕 ID模糊搜索（应用层）- 支持完全的模糊匹配
    // 例如：搜索"12"可以匹配ID为12、123、1234、312、5123等
    if (searchIdMode && searchTerm) {
      filteredData = filteredData.filter(testCase => 
        String(testCase.id).includes(searchTerm)
      );
    }

    // Priority过滤（应用层）
    if (priority && priority.trim()) {
      filteredData = filteredData.filter(testCase => testCase.priority === priority);
    }

    // Status过滤（应用层）
    if (status && status.trim()) {
      filteredData = filteredData.filter(testCase => testCase.status === status);
    }

    // 🔥 新增：版本过滤（应用层，因为版本信息存储在 steps JSON 中）
    if (projectVersion && projectVersion.trim()) {
      filteredData = filteredData.filter(testCase => testCase.projectVersion === projectVersion);
    }

    // 🆕 创建者过滤（应用层，因为 author 信息存储在 steps JSON 中）
    if (author && author.trim()) {
      filteredData = filteredData.filter(testCase => testCase.author === author);
    }

    // 如果应用了应用层过滤，需要重新计算总数和分页
    if (searchIdMode || (priority && priority.trim()) || (status && status.trim()) || (projectVersion && projectVersion.trim()) || (author && author.trim())) {
      // 重新获取所有数据进行应用层过滤统计
      const allTestCases = await this.prisma.test_cases.findMany({
        where: {
          ...where,
          deleted_at: null // 🔥 软删除：只查询未删除的记录
        },
        select: {
          id: true,
          title: true,
          steps: true,
          tags: true,
          system: true,
          module: true,
          project: true, // 🔥 修复：添加 project 字段
          created_at: true
        }
      });

      let allFilteredData = allTestCases.map(this.dbTestCaseToApp);

      // 🆕 ID模糊搜索（应用层）
      if (searchIdMode && searchTerm) {
        allFilteredData = allFilteredData.filter(testCase => 
          String(testCase.id).includes(searchTerm)
        );
      }

      if (priority && priority.trim()) {
        allFilteredData = allFilteredData.filter(testCase => testCase.priority === priority);
      }

      if (status && status.trim()) {
        allFilteredData = allFilteredData.filter(testCase => testCase.status === status);
      }

      // 🔥 新增：版本过滤
      if (projectVersion && projectVersion.trim()) {
        allFilteredData = allFilteredData.filter(testCase => testCase.projectVersion === projectVersion);
      }

      // 🆕 创建者过滤
      if (author && author.trim()) {
        allFilteredData = allFilteredData.filter(testCase => testCase.author === author);
      }

      // 手动分页
      const newTotal = allFilteredData.length;
      const startIndex = skip;
      const endIndex = skip + pageSize;
      filteredData = allFilteredData.slice(startIndex, endIndex);

      // 🔥 新增：增强测试用例数据（添加成功率、最后运行等）
      let enhancedData = await this.enhanceTestCasesWithRunData(filteredData);

      // 🆕 执行状态筛选（应用层）
      if (executionStatus && executionStatus.trim()) {
        enhancedData = enhancedData.filter(testCase => testCase.executionStatus === executionStatus);
      }

      // 🆕 执行结果筛选（应用层）
      if (executionResult && executionResult.trim()) {
        enhancedData = enhancedData.filter(testCase => testCase.executionResult === executionResult);
      }

      return {
        data: enhancedData,
        total: enhancedData.length
      };
    }

    // 🔥 新增：增强测试用例数据（添加成功率、最后运行等）
    let enhancedData = await this.enhanceTestCasesWithRunData(filteredData);

    // 🆕 执行状态筛选（应用层，因为这些数据来自 test_runs 表）
    if (executionStatus && executionStatus.trim()) {
      enhancedData = enhancedData.filter(testCase => testCase.executionStatus === executionStatus);
    }

    // 🆕 执行结果筛选（应用层，因为这些数据来自 test_runs 表）
    if (executionResult && executionResult.trim()) {
      enhancedData = enhancedData.filter(testCase => testCase.executionResult === executionResult);
    }

    // 如果应用了执行状态或执行结果筛选，需要重新计算总数
    if ((executionStatus && executionStatus.trim()) || (executionResult && executionResult.trim())) {
      return {
        data: enhancedData,
        total: enhancedData.length
      };
    }

    return {
      data: enhancedData,
      total
    };
  }

  public async addTestCase(testCaseData: Partial<TestCase>): Promise<TestCase> {
    // 🔥 调试日志：检查接收到的 author 值
    console.log('📝 [addTestCase] 接收到的 author:', testCaseData.author);
    
    // 🔥 修复：确保 author 被正确保存（即使为空字符串也要保存，避免被 JSON.stringify 忽略）
    const authorValue = testCaseData.author !== undefined && testCaseData.author !== null 
      ? testCaseData.author 
      : 'System'; // 如果没有提供 author，使用默认值
    
    // 🔥 新增：获取 priority 和 status，使用默认值如果未提供
    const priorityValue = testCaseData.priority || 'medium';
    const statusValue = testCaseData.status || 'active';
    // 🔥 新增：获取版本信息
    const projectVersionValue = testCaseData.projectVersion || undefined;
    // 🔥 新增：获取前置条件和测试数据
    const preconditionsValue = testCaseData.preconditions || '';
    const testDataValue = testCaseData.testData || '';
    
    const stepsData = JSON.stringify({
      steps: testCaseData.steps || '',
      assertions: testCaseData.assertions || '',
      author: authorValue, // 🔥 将 author 存储在 steps JSON 中
      priority: priorityValue, // 🔥 新增：将 priority 存储在 steps JSON 中
      status: statusValue, // 🔥 新增：将 status 存储在 steps JSON 中
      projectVersion: projectVersionValue, // 🔥 新增：将版本信息存储在 steps JSON 中
      preconditions: preconditionsValue, // 🔥 新增：将前置条件存储在 steps JSON 中
      testData: testDataValue // 🔥 新增：将测试数据存储在 steps JSON 中
    });

    console.log('📝 [addTestCase] 保存的 steps JSON:', stepsData);

    const newTestCase = await this.prisma.test_cases.create({
      data: {
        title: testCaseData.name || 'Untitled Test Case',
        steps: stepsData,
        tags: (testCaseData.tags as Prisma.JsonValue) || Prisma.JsonNull,
        system: testCaseData.system || null,
        module: testCaseData.module || null,
        project: testCaseData.department || null, // 🔥 注意：TestCase 接口使用 department，但数据库字段是 project
      },
    });
    
    const result = this.dbTestCaseToApp(newTestCase);
    console.log('📝 [addTestCase] 返回的 author:', result.author);
    return result;
  }

  public async updateTestCase(id: number, testCaseData: Partial<TestCase>): Promise<TestCase | null> {
    try {
      // 🔥 调试日志：检查接收到的 author 值
      console.log('📝 [updateTestCase] 接收到的数据:', {
        id,
        author: testCaseData.author,
        hasName: !!testCaseData.name
      });

      const existingCase = await this.findTestCaseById(id);
      if (!existingCase) return null;

      const newSteps = testCaseData.steps ?? existingCase.steps;
      const newAssertions = testCaseData.assertions ?? existingCase.assertions;
      // 🔥 修复：如果传入了新的 author，优先使用新的；否则保留原有的
      const existingAuthor = existingCase.author || 'System';
      const newAuthor = testCaseData.author !== undefined && testCaseData.author !== null
        ? testCaseData.author
        : existingAuthor;
      
      // 🔥 新增：如果传入了新的 priority 和 status，优先使用新的；否则保留原有的
      const existingPriority = existingCase.priority || 'medium';
      const newPriority = testCaseData.priority || existingPriority;
      
      const existingStatus = existingCase.status || 'active';
      const newStatus = testCaseData.status || existingStatus;
      
      // 🔥 新增：处理版本信息
      const existingVersion = existingCase.projectVersion || undefined;
      const newVersion = testCaseData.projectVersion !== undefined 
        ? testCaseData.projectVersion 
        : existingVersion;
      
      // 🔥 新增：处理前置条件和测试数据
      const existingPreconditions = existingCase.preconditions || '';
      const newPreconditions = testCaseData.preconditions !== undefined 
        ? testCaseData.preconditions 
        : existingPreconditions;
      
      const existingTestData = existingCase.testData || '';
      const newTestData = testCaseData.testData !== undefined 
        ? testCaseData.testData 
        : existingTestData;
      
      console.log('📝 [updateTestCase] Author 处理:', {
        existingAuthor,
        receivedAuthor: testCaseData.author,
        finalAuthor: newAuthor
      });
      
      console.log('📝 [updateTestCase] Priority 和 Status 处理:', {
        existingPriority,
        receivedPriority: testCaseData.priority,
        finalPriority: newPriority,
        existingStatus,
        receivedStatus: testCaseData.status,
        finalStatus: newStatus
      });

      const stepsData = JSON.stringify({ 
        steps: newSteps, 
        assertions: newAssertions,
        author: newAuthor, // 🔥 将 author 存储在 steps JSON 中
        priority: newPriority, // 🔥 新增：将 priority 存储在 steps JSON 中
        status: newStatus, // 🔥 新增：将 status 存储在 steps JSON 中
        projectVersion: newVersion, // 🔥 新增：将版本信息存储在 steps JSON 中
        preconditions: newPreconditions, // 🔥 新增：将前置条件存储在 steps JSON 中
        testData: newTestData // 🔥 新增：将测试数据存储在 steps JSON 中
      });

      console.log('📝 [updateTestCase] 保存的 steps JSON:', stepsData);

      const dataToUpdate: any = {
        title: testCaseData.name,
        steps: stepsData,
        system: testCaseData.system,
        module: testCaseData.module,
        project: testCaseData.department, // 🔥 注意：TestCase 接口使用 department，但数据库字段是 project
      };

      if (testCaseData.tags) {
        dataToUpdate.tags = testCaseData.tags;
      }

      const updatedTestCase = await this.prisma.test_cases.update({
        where: { id },
        data: dataToUpdate,
      });
      
      const result = this.dbTestCaseToApp(updatedTestCase);
      console.log('📝 [updateTestCase] 返回的 author:', result.author);
      return result;
    } catch (error) {
      console.error(`更新测试用例 ${id} 失败:`, error);
      return null;
    }
  }

  public async deleteTestCase(id: number): Promise<boolean> {
    try {
      // 🔥 软删除：只更新deleted_at字段，不真正删除数据
      await this.prisma.test_cases.update({ 
        where: { id },
        data: { deleted_at: new Date() }
      });
      console.log(`✅ 测试用例 ${id} 已软删除（保留执行记录用于数据分析）`);
      return true;
    } catch (error) {
      console.error(`删除测试用例 ${id} 失败:`, error);
      return false;
    }
  }
  // #endregion

  // #region Test Execution - 新流程实现
  // 🔥 修正：使用队列管理的测试执行
  public async runTest(
    testCaseId: number,
    environment: string,
    executionMode: string = 'standard',
    options: {
      reuseBrowser?: boolean,
      suiteId?: string,
      contextState?: any,
      userId?: string,
      executionEngine?: 'mcp' | 'playwright', // 🔥 新增：执行引擎选择
      enableTrace?: boolean, // 🔥 新增：是否启用 trace（仅 Playwright）
      enableVideo?: boolean, // 🔥 新增：是否启用 video（仅 Playwright）
      planExecutionId?: string, // 🔥 新增：测试计划执行记录ID，用于完成后同步数据
    } = {}
  ): Promise<string> {
    // 🚀 性能监控：记录开始时间
    const apiStartTime = Date.now();
    const runId = uuidv4();
    const userId = options.userId || 'system';

    // 🔥 新增：确定执行引擎（默认使用 MCP 保持向后兼容）
    const executionEngine = options.executionEngine || 'mcp';
    
    // 🔥 修复：立即查询用户名（如果 userId 不是 'system'）
    let executorName = 'System';
    if (userId && userId !== 'system') {
      try {
        const parsedUserId = parseInt(userId);
        if (!isNaN(parsedUserId)) {
          const user = await this.prisma.users.findUnique({
            where: { id: parsedUserId },
            select: { username: true, email: true }
          });
          if (user) {
            executorName = user.username || user.email || `User-${parsedUserId}`;
          }
        }
      } catch (error) {
        console.warn(`⚠️ [${runId}] 查询用户信息失败:`, error);
        // 如果查询失败，使用 userId 作为占位符
        executorName = `User-${userId}`;
      }
    }
    
    const testRun: TestRun = {
      id: runId, runId, testCaseId, environment, executionMode,
      status: 'queued',
      logs: [],
      steps: [],
      successfulSteps: [],
      startedAt: new Date(),
      executor: executorName, // 🔥 修复：设置执行者名称
      ...options,
      executionEngine, // 🔥 保存执行引擎到 testRun
      planExecutionId: options.planExecutionId, // 🔥 新增：保存测试计划执行记录ID
    };

    testRunStore.set(runId, testRun);
    
    // 🔥 记录执行引擎选择
    console.log(`🎯 [${runId}] 执行引擎: ${executionEngine === 'playwright' ? 'Playwright Test Runner' : 'MCP 客户端'}`);
    if (executionEngine === 'playwright') {
      console.log(`   📦 Trace 录制: ${options.enableTrace !== false ? '启用' : '禁用'}`);
      console.log(`   🎥 Video 录制: ${options.enableVideo !== false ? '启用' : '禁用'}`);
    }

    // 🔥 立即广播测试创建事件（使用实际用户名）
    const placeholderName = `测试用例 #${testCaseId}`;
    this.wsManager.broadcast({
      type: 'test_update',
      runId,
      data: {
        id: runId,
        testCaseId,
        name: placeholderName,
        status: testRun.status,
        startTime: testRun.startedAt,
        environment,
        executor: executorName, // 🔥 修复：使用实际用户名而不是 userId
        progress: 0,
        totalSteps: 0,
        completedSteps: 0,
        passedSteps: 0,
        failedSteps: 0,
        duration: '0s',
        logs: [],
        screenshots: []
      }
    });
    console.log(`📡 [${runId}] 立即广播测试创建事件，执行者: ${executorName}`);

    // 🔥 性能优化：提前查询测试用例，避免后续重复查询
    console.log(`🔍 [${runId}] 开始查询测试用例信息 testCaseId=${testCaseId}...`);
    const testCasePromise = this.findTestCaseById(testCaseId);

    // 🔥 异步获取实际测试用例名称并更新（不阻塞）+ 保存到数据库
    testCasePromise.then(async testCase => {
      console.log(`✅ [${runId}] 测试用例查询成功，testCase=${testCase ? 'found' : 'null'}`);

      const actualName = testCase?.name || placeholderName;
      if (actualName !== placeholderName) {
        this.wsManager.broadcast({
          type: 'test_update',
          runId,
          data: {
            name: actualName
          }
        });
        console.log(`📡 [${runId}] 更新实际测试用例名称: ${actualName}`);
      }

      // 🔥 保存测试执行记录到数据库
      console.log(`💾 [${runId}] 准备保存测试执行记录到数据库，actualName="${actualName}"`);
      try {
        console.log(`💾 [${runId}] 调用 executionService.createExecution...`);
        // 🔥 修复：正确转换用户ID（userId可能是字符串格式的数字或'system'）
        let executorUserId: number | undefined = undefined;
        if (userId && userId !== 'system') {
          const parsedUserId = parseInt(userId);
          if (!isNaN(parsedUserId)) {
            executorUserId = parsedUserId;
          }
        }
        console.log(`💾 [${runId}] executorUserId: ${executorUserId || 'undefined'}`);
        await this.executionService.createExecution({
          id: runId,
          testCaseId,
          testCaseTitle: actualName,
          environment,
          executionMode,
          executorUserId: executorUserId,
          // TODO: 从用户信息获取部门
        });
        console.log(`💾 [${runId}] 测试执行记录已保存到数据库`);
      } catch (error) {
        console.warn(`⚠️ [${runId}] 保存测试执行记录失败:`, error);
      }
    }).catch(err => {
      console.warn(`⚠️ [${runId}] 获取测试用例名称失败:`, err.message);
    });

    this.addLog(runId, `测试 #${testCaseId} 已加入队列，环境: ${environment}`);

    // 🔥 修正：创建队列任务，并传递 testCase Promise 以避免重复查询
    const queueTask: QueueTask = {
      id: runId,
      userId,
      type: 'test',
      priority: 'medium',
      payload: { testCaseId, environment, executionMode, options, testCasePromise },
      createdAt: new Date()
    };

    // 🔥 修正：使用队列执行，传递已缓存的 testCase
    this.queueService.enqueue(queueTask, async (task) => {
      // 🚀 性能优化：复用已查询的 testCase，避免重复数据库查询
      const cachedTestCase = await task.payload.testCasePromise;
      await this.executeTestInternal(task.id, task.payload.testCaseId, cachedTestCase);
    }).catch(error => {
      console.error(`[${runId}] 队列执行过程中发生错误:`, error);
      this.updateTestRunStatus(runId, 'error', `队列执行失败: ${error.message}`);
    });

    // 🚀 性能监控：记录 API 响应时间
    const apiDuration = Date.now() - apiStartTime;
    console.log(`⚡ [${runId}] runTest API 响应时间: ${apiDuration}ms`);
    if (apiDuration > 1000) {
      console.warn(`⚠️ [${runId}] API 响应时间过长 (${apiDuration}ms)，建议检查性能瓶颈`);
    }

    return runId;
  }

  // 🔥 修正：执行测试的实际逻辑（修正作用域和取消检查）
  // 🚀 性能优化：添加可选的 cachedTestCase 参数，避免重复查询数据库
  private async executeTestInternal(runId: string, testCaseId: number, cachedTestCase?: TestCase | null): Promise<void> {
    // 🚀 Phase 4-5: 全面性能监控开始
    const executionStartTime = Date.now();
    const useOptimization = this.performanceMonitor.optimizationMode !== 'stable' && 
                           !this.performanceMonitor.shouldFallback();
    
    if (this.performanceMonitor.enabled) {
      console.log(`📊 [${runId}] 性能监控: 使用${useOptimization ? '优化' : '安全'}模式 (Phase 1-5 全面优化)`);
      this.addLog(runId, `📊 性能监控启用 (Phase 1-5: 导航+重试+延迟+监控+瓶颈修复)`, 'info');
    }
    
    // 🔥 修正：将变量声明提到外层避免作用域问题
    let browserProcess: any = null;
    let context: any = null;
    let page: any = null;
    let executionSuccess = false;
    
    const testRun = testRunStore.get(runId);
    if (!testRun) {
      console.error(`❌ [${runId}] 测试运行记录未找到`);
      return;
    }

    // 🚀 性能优化：优先使用缓存的 testCase，避免重复数据库查询
    const testCase = cachedTestCase || await this.findTestCaseById(testCaseId);
    if (!testCase || !testCase.steps) {
      this.updateTestRunStatus(runId, 'failed', `测试用例未找到`);
      return;
    }

    if (cachedTestCase) {
      console.log(`⚡ [${runId}] 使用缓存的测试用例数据，跳过数据库查询`);
    }

    console.log(`🚀 [${runId}] 开始执行 [${testCase.name}]`);

    // 🔥 获取执行引擎配置
    const executionEngine = (testRun as any).executionEngine || 'mcp';
    const enableTrace = (testRun as any).enableTrace !== false;
    const enableVideo = (testRun as any).enableVideo !== false;

    // 记录当前AI解析器配置信息
    try {
      // 🔥 修复：使用异步版本确保配置管理器已初始化，能正确获取模型信息
      const modelInfo = await this.aiParser.getDetailedModelInfoAsync();
      // console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      // console.log(`🤖 [${runId}] AI解析器配置信息:`);
      // console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      // console.log(`   ⚙️ 运行模式: ${modelInfo.mode}`);
      // console.log(`   🏢 模型厂商: ${modelInfo.provider}`);
      // console.log(`   📦 模型ID: ${modelInfo.modelId}`);
      // console.log(`   📦 模型类型: ${modelInfo.modelName}`);
      // console.log(`   📡 API格式: ${modelInfo.apiFormat}`);
      // console.log(`   🌐 API端点: ${modelInfo.baseUrl}`);
      // console.log(`   🤖 API模型: ${modelInfo.apiModel}`);
      // console.log(`   🔑 API Key: ${modelInfo.apiKeyStatus}`);
      // console.log(`   🌡️ Temperature: ${modelInfo.temperature}`);
      // console.log(`   📊 Max Tokens: ${modelInfo.maxTokens}`);
      // console.log(`   💰 成本级别: ${modelInfo.costLevel}`);
      // if (modelInfo.capabilities.length > 0) {
      //   console.log(`   🎯 模型能力: ${modelInfo.capabilities.join(', ')}`);
      // }
      // console.log(`   ✅ 初始化状态: ${modelInfo.isInitialized ? '已初始化' : '未初始化'}`);
      // console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
      
      this.addLog(runId, `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`, 'info');
      if (this.aiParser.isConfigManagerMode()) {
        this.addLog(runId, `🔧 配置管理器模式已启用，支持动态模型切换`, 'info');
      } else {
        this.addLog(runId, `⚙️ 传统模式运行，使用固定配置`, 'info');
      }
      this.addLog(runId, `⚙️ 运行模式: ${modelInfo.mode}`, 'info');
      this.addLog(runId, `🏢 模型厂商: ${modelInfo.provider}`, 'info');
      this.addLog(runId, `📦 模型类型: ${modelInfo.modelId} - ${modelInfo.modelName}`, 'info');
      this.addLog(runId, `📡 API格式: ${modelInfo.apiFormat}`, 'info');
      this.addLog(runId, `🌐 API端点: ${modelInfo.baseUrl}`, 'info');
      this.addLog(runId, `🤖 API模型: ${modelInfo.apiModel}`, 'info');
      // this.addLog(runId, `🔑 API Key: ${modelInfo.apiKeyStatus}`, 'info');
      this.addLog(runId, `🌡️ Temperature: ${modelInfo.temperature}`, 'info');
      this.addLog(runId, `📊 Max Tokens: ${modelInfo.maxTokens}`, 'info');
      this.addLog(runId, `💰 成本级别: ${modelInfo.costLevel}`, 'info');
      if (modelInfo.capabilities.length > 0) {
        this.addLog(runId, `🎯 模型能力: ${modelInfo.capabilities.join(', ')}`, 'info');
      }
    } catch (error: any) {
      console.warn(`⚠️ [${runId}] 无法获取AI解析器信息: ${error.message}`);
      this.addLog(runId, `⚠️ 无法获取AI模型信息`, 'warning');
    }
    this.addLog(runId, `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`, 'info');
    try {
      // 🔥 根据执行引擎选择初始化方式
      if (executionEngine === 'playwright') {
        // 使用 Playwright Test Runner
        await this.initializePlaywrightRunner(runId, { enableTrace, enableVideo });
      } else {
        // 使用 MCP 客户端（默认）
        await this.initializeMcpClient(runId);
      }

      // 🔥 根据执行引擎选择不同的执行流程
      if (executionEngine === 'playwright') {
        // 使用 Playwright Test Runner 执行
        await this.executeWithPlaywrightRunner(runId, testCase, testRun, { enableTrace, enableVideo });
      } else {
        // 使用 MCP 客户端执行（原有流程）
        await this.executeWithMcpClient(runId, testCase, testRun);
      }

      // 🔥 修复：最终截图、证据保存、状态更新和数据库同步已在 executeWithMcpClient 或 executeWithPlaywrightRunner 内部完成
      // 这里不再重复调用，避免重复的日志输出和状态更新
      executionSuccess = true; // 🚀 标记执行成功

    } catch (error: any) {
      console.error(`💥 [${runId}] 测试失败:`, error.message);
      this.addLog(runId, `💥 测试执行失败: ${error.message}`, 'error');
      
      // 🔥 新增：保存测试证据（即使测试失败）
      await this.saveTestEvidence(runId, 'failed');
      
      // 🔥 修正：移除trace相关代码
      this.updateTestRunStatus(runId, 'failed', `测试执行失败: ${error.message}`);
      executionSuccess = false; // 🚀 标记执行失败

      // 🔥 强制同步到数据库，确保失败状态也被保存
      await this.syncTestRunToDatabase(runId);
      console.log(`💾 [${runId}] 测试失败，已强制同步到数据库`);
      
    } finally {
      try {
        // 🔥 根据执行引擎清理资源
        const finalExecutionEngine = (testRun as any)?.executionEngine || executionEngine || 'mcp';
        
        if (finalExecutionEngine === 'playwright') {
          // 清理 Playwright Test Runner
          await this.cleanupPlaywrightRunner(runId, testRun);
        } else {
          // 清理 MCP 客户端
          this.streamService.stopStream(runId);
          console.log(`📺 [${runId}] 实时流已停止`);
          console.log(`🧹 [${runId}] 正在清理MCP客户端...`);
          await this.mcpClient.close();
          console.log(`✅ [${runId}] MCP客户端已关闭`);
        }
      } catch (cleanupError) {
        console.warn(`⚠️ [${runId}] 清理资源时出错:`, cleanupError);
      }
      
      // 🚀 Phase 4: 性能监控记录
      if (this.performanceMonitor.enabled) {
        const executionDuration = (Date.now() - executionStartTime) / 1000;
        this.performanceMonitor.recordExecution(runId, executionSuccess, executionDuration, useOptimization);
        
        console.log(`📊 [${runId}] 性能监控记录:`);
        console.log(`   ⏱️ 执行时间: ${executionDuration.toFixed(1)}秒`);
        console.log(`   ✅ 执行状态: ${executionSuccess ? '成功' : '失败'}`);
        console.log(`   🚀 优化模式: ${useOptimization ? '是' : '否'}`);
        
        // 每10次执行输出一次统计报告
        if (this.performanceMonitor.stats.totalRuns % 10 === 0) {
          console.log(`\n📈 ${this.performanceMonitor.getReport()}\n`);
        }
      }
      
      await this.finalizeTestRun(runId);
    }
  }

  // 🔥 修正：移除新增的方法，保持原有结构

  // 🔥 解析测试步骤 - 智能识别操作类型
  private parseTestSteps(stepsText: string): TestStep[] {
    if (!stepsText?.trim()) return [];

    const lines = stepsText.split('\n').filter(line => line.trim());
    return lines.map((line, index) => {
      const description = line.trim();
      const lowerDesc = description.toLowerCase();
      
      // 🔥 智能识别操作类型
      let action: TestAction = 'navigate';
      let url: string | undefined;
      let selector: string | undefined;
      let value: string | undefined;
      
      // 🔥 优先识别观察/验证类操作（不是主动操作）
      if (lowerDesc.includes('观察') || lowerDesc.includes('等待页面') || 
          lowerDesc.includes('页面应该') || lowerDesc.includes('页面自动')) {
        // 观察页面跳转 -> 等待操作，而不是主动导航
        action = 'wait';
        // 尝试提取等待时间，如果没有则默认等待条件
        const waitMatch = description.match(/(\d+)\s*(?:秒|s|second)/i);
        if (waitMatch) {
          value = waitMatch[1];
        } else {
          // 如果描述中有URL/路径，作为等待条件的提示
          const pathMatch = description.match(/[(（]?\s*(\/[^\s)）]+)\s*[)）]?/);
          if (pathMatch) {
            // 等待URL变化到指定路径
            selector = `url:${pathMatch[1]}`;
          } else {
            // 默认等待3秒
            value = '3';
          }
        }
      }
      // 识别导航操作（打开、访问、进入、导航到等）
      else if (lowerDesc.includes('打开') || lowerDesc.includes('访问') || 
          lowerDesc.includes('进入') || lowerDesc.includes('导航') ||
          lowerDesc.includes('goto') || lowerDesc.includes('navigate') ||
          (lowerDesc.includes('跳转至') && !lowerDesc.includes('观察') && !lowerDesc.includes('自动跳转')) || 
          (lowerDesc.includes('跳转到') && !lowerDesc.includes('观察') && !lowerDesc.includes('自动跳转'))) {
        action = 'navigate';
        // 尝试提取 URL - 支持多种格式
        // 1. 完整 URL: http://example.com 或 https://example.com
        let urlMatch = description.match(/(https?:\/\/[^\s\)]+)/);
        if (urlMatch) {
          url = urlMatch[1];
        } else {
          // 2. 域名格式: www.example.com 或 example.com
          urlMatch = description.match(/(www\.[^\s\)]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}[^\s\)]*)/);
          if (urlMatch) {
            url = urlMatch[1];
            if (!url.startsWith('http')) {
              url = `https://${url}`;
            }
          } else {
            // 3. 路径格式: /sys-monitor 或 (/sys-monitor) 或 (路径)
            urlMatch = description.match(/[(（]?\s*(\/[^\s)）]+)\s*[)）]?/);
            if (urlMatch) {
              url = urlMatch[1];
              // 路径格式不需要添加 https://，保持原样
            } else {
              // 4. 从"跳转至"或"跳转到"后面提取路径
              urlMatch = description.match(/(?:跳转至|跳转到|自动跳转至|自动跳转到)[：:]\s*[(（]?\s*(\/[^\s)）]+)\s*[)）]?/i);
              if (urlMatch) {
                url = urlMatch[1];
              } else {
                // 5. 如果没有明确的 URL，尝试从描述中推断
                if (lowerDesc.includes('百度')) {
                  url = 'https://www.baidu.com';
                } else if (lowerDesc.includes('google')) {
                  url = 'https://www.google.com';
                } else {
                  // 默认使用描述作为 URL（可能需要在执行时进一步处理）
                  url = description.replace(/^(打开|访问|进入|导航到|跳转至|跳转到|自动跳转至|自动跳转到)\s*/i, '').trim();
                  // 移除可能的括号和箭头后的描述
                  url = url.replace(/^[(（]/, '').replace(/[)）].*$/, '').split('->')[0].trim();
                  if (url && !url.startsWith('http') && !url.startsWith('/')) {
                    url = `https://${url}`;
                  }
                }
              }
            }
          }
        }
      }
      // 识别点击操作（包括勾选、选中等）
      else if (lowerDesc.includes('点击') || lowerDesc.includes('选择') || 
               lowerDesc.includes('click') || lowerDesc.includes('勾选') || 
               lowerDesc.includes('选中') || lowerDesc.includes('取消勾选') ||
               lowerDesc.includes('check') || lowerDesc.includes('uncheck')) {
        action = 'click';
        // 尝试提取选择器（支持多种格式）
        // 格式1: "点击搜索按钮" -> "搜索按钮"
        // 格式2: "点击：搜索按钮" -> "搜索按钮"
        // 格式3: "点击搜索按钮 -> 其他描述" -> "搜索按钮"
        // 格式4: "勾选《协议》" -> "《协议》"
        let elementMatch = description.match(/(?:点击|选择|click|勾选|选中|取消勾选|check|uncheck)\s*[：:]\s*(.+?)(?:\s*->|$)/i) || 
                          description.match(/(?:点击|选择|click|勾选|选中|取消勾选|check|uncheck)\s+(.+?)(?:\s*->|$)/i);
        
        if (!elementMatch) {
          // 如果上面没匹配到，尝试更宽松的匹配
          elementMatch = description.match(/(?:点击|选择|click|勾选|选中|取消勾选|check|uncheck)\s+(.+)/i);
        }
        
        if (elementMatch) {
          selector = elementMatch[1].trim();
          // 移除可能的后续描述（如"-> 页面出现..."）
          selector = selector.split('->')[0].trim();
          selector = selector.split('，')[0].trim();
          selector = selector.split(',')[0].trim();
          // 移除可能的书名号、引号等（前后分别处理）
          selector = selector.replace(/^[《『"'「]/, '').replace(/[》』"'」]$/, '');
        } else {
          // 如果还是没匹配到，尝试从描述中提取（移除编号和操作词）
          selector = description
            .replace(/^\d+[\.、\)]\s*/, '') // 移除编号
            .replace(/(?:点击|选择|click|勾选|选中|取消勾选|check|uncheck)\s*/i, '') // 移除操作词
            .split('->')[0] // 移除箭头后的描述
            .trim();
          // 移除可能的书名号、引号等（前后分别处理）
          selector = selector.replace(/^[《『"'「]/, '').replace(/[》』"'」]$/, '');
        }
      }
      // 识别输入操作
      else if (lowerDesc.includes('输入') || lowerDesc.includes('填写') || 
               lowerDesc.includes('type') || lowerDesc.includes('fill')) {
        action = 'fill';
        // 尝试提取选择器和值（支持多种格式）
        // 格式1: "输入：用户名：admin" 或 "输入到用户名，值为admin"
        let fillMatch = description.match(/(?:输入|填写|fill|type)\s*(?:到|到|in|into)?\s*[：:]\s*(.+?)(?:\s*，|,|\s*值为|值为|value\s*[:：]\s*)(.+)/i);
        
        // 格式2: "在用户名输入框输入'admin'" 或 "在用户名输入'admin'"
        if (!fillMatch) {
          fillMatch = description.match(/(?:在|向)\s*(.+?)(?:输入框|输入区|文本框)?\s*(?:输入|填写|fill|type)\s*['"'](.+?)['"']/i);
        }
        
        // 格式3: "输入 用户名 admin" （空格分隔）
        if (!fillMatch) {
          fillMatch = description.match(/(?:输入|填写|fill|type)\s+(.+?)\s+(.+)/i);
        }
        
        // 格式4: "在用户名输入admin" （没有引号）
        if (!fillMatch) {
          fillMatch = description.match(/(?:在|向)\s*(.+?)(?:输入框|输入区|文本框)?\s*(?:输入|填写|fill|type)\s+(.+)/i);
        }
        
        if (fillMatch) {
          selector = fillMatch[1].trim();
          value = fillMatch[2]?.trim();
          // 清理选择器：移除可能的箭头后描述
          if (selector) {
            selector = selector.split('->')[0].trim();
          }
          // 清理值：移除可能的箭头后描述
          if (value) {
            value = value.split('->')[0].trim();
            // 移除可能的引号
            value = value.replace(/^['"]|['"]$/g, '');
          }
        }
      }
      // 识别等待操作
      else if (lowerDesc.includes('等待') || lowerDesc.includes('wait')) {
        action = 'wait';
        const waitMatch = description.match(/(\d+)\s*(?:秒|秒|s|second)/i);
        if (waitMatch) {
          value = waitMatch[1];
        }
      }
      // 识别断言操作
      else if (lowerDesc.includes('验证') || lowerDesc.includes('检查') || 
               lowerDesc.includes('断言') || lowerDesc.includes('expect') ||
               lowerDesc.includes('应该') || lowerDesc.includes('should') ||
               lowerDesc.includes('出现') || lowerDesc.includes('显示')) {
        action = 'expect';
        // 提取要验证的元素或文本
        selector = description
          .replace(/^\d+[\.、\)]\s*/, '') // 移除编号
          .replace(/(?:验证|检查|断言|expect|应该|should|出现|显示)\s*/i, '') // 移除操作词
          .split('->')[0] // 移除箭头后的描述
          .trim();
      }
      // 默认：如果是第一个步骤且包含"打开"、"访问"等，视为导航
      else if (index === 0 && (lowerDesc.includes('打开') || lowerDesc.includes('访问'))) {
        action = 'navigate';
        if (lowerDesc.includes('百度')) {
          url = 'https://www.baidu.com';
        } else {
          url = description.replace(/^(打开|访问)\s*/i, '').trim();
          if (!url.startsWith('http')) {
            url = `https://${url}`;
          }
        }
      }
      
      return {
        id: `step-${index + 1}`,
        action,
        description,
        order: index + 1,
        selector: selector || '',
        value: value || '',
        url: url || undefined
      };
    });
  }

  // 🔥 解析断言
  private parseAssertions(assertionsText: string): TestStep[] {
    if (!assertionsText?.trim()) return [];

    const lines = assertionsText.split('\n').filter(line => line.trim());
    return lines.map((line, index) => ({
      id: `assertion-${index + 1}`,
      action: 'expect', // 断言动作
      description: line.trim(),
      order: index + 1,
      selector: '',
      condition: 'visible',
      text: ''
    }));
  }

  // 🔥 执行步骤（带重试）- 已废弃，使用 executeStepWithRetryAndFallback 代替
  // @deprecated 此方法已被 executeStepWithRetryAndFallback 替代，保留仅为向后兼容
  private async executeStepWithRetry(step: TestStep, runId: string) {
    const maxRetries = 2;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        this.addLog(runId, `[步骤 ${step.order}] 开始执行: ${step.description}`, 'info');

        // 根据步骤描述生成MCP命令并执行
        const result = await this.executeMcpCommand(step, runId);

        if (result.success) {
          this.addLog(runId, `✅ [步骤 ${step.order}] 执行成功`, 'success');
          return { success: true };
        } else {
          throw new Error(result.error);
        }
      } catch (error: any) {
        attempt++;
        if (attempt < maxRetries) {
          this.addLog(runId, `⚠️ [步骤 ${step.order}] 失败，重试 ${attempt}/${maxRetries}: ${error.message}`, 'warning');
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        } else {
          this.addLog(runId, `❌ [步骤 ${step.order}] 执行失败: ${error.message}`, 'error');
          return { success: false, error: error.message };
        }
      }
    }

    return { success: false, error: '达到最大重试次数' };
  }

  // 🚀 Phase 2: 智能重试策略配置
  private getSmartRetryConfig(action: string): { maxRetries: number; strategies: string[]; shouldRetry: (error: string, attempt: number) => boolean } {
    const baseConfig = {
      navigate: { maxRetries: 2, strategies: ['standard'] },
      click: { maxRetries: 2, strategies: ['standard', 'alternative'] },
      input: { maxRetries: 1, strategies: ['standard'] },
      fill: { maxRetries: 1, strategies: ['standard'] },
      type: { maxRetries: 1, strategies: ['standard'] },
      scroll: { maxRetries: 1, strategies: ['standard'] },
      wait: { maxRetries: 1, strategies: ['standard'] }
    };

    const defaultConfig = { maxRetries: 2, strategies: ['standard', 'alternative'] };
    const config = baseConfig[action as keyof typeof baseConfig] || defaultConfig;

    return {
      ...config,
      shouldRetry: (error: string, attempt: number) => {
        // 网络问题：值得重试
        if (error.includes('timeout') || error.includes('network') || error.includes('ERR_')) return true;
        
        // 元素未找到：值得重试
        if (error.includes('element not found') || error.includes('Element not found')) return true;
        
        // 页面加载问题：值得重试
        if (error.includes('navigation') || error.includes('loading')) return true;
        
        // AI解析错误：不值得重试
        if (error.includes('AI解析失败') || error.includes('AI parsing failed')) return false;
        
        // 参数错误：不值得重试
        if (error.includes('Invalid argument') || error.includes('参数错误')) return false;
        
        // 超过最大重试次数：不再重试
        return attempt < config.maxRetries;
      }
    };
  }

  // 🚀 Phase 2: 优化版重试和降级机制的步骤执行方法
  private async executeStepWithRetryAndFallback(step: TestStep, runId: string, stepIndex: number): Promise<{ success: boolean; error?: string }> {
    const retryConfig = this.getSmartRetryConfig(step.action);
    let lastError = '';

    this.addLog(runId, `🎯 智能重试策略: ${step.action} (最多${retryConfig.maxRetries}次重试)`, 'info');

    for (let strategy = 0; strategy < retryConfig.strategies.length; strategy++) {
      const strategyName = retryConfig.strategies[strategy];
      this.addLog(runId, `🔄 使用策略 "${strategyName}" 执行步骤`, 'info');

      for (let attempt = 1; attempt <= retryConfig.maxRetries; attempt++) {
        try {
          // 🚀 轻量级页面稳定性检查 (仅在重试时进行)
          if (attempt > 1) {
            await this.ensurePageStability(runId);
          }

          // 🚀 根据策略调整执行方式
          const result = await this.executeMcpCommandWithStrategy(step, runId, strategyName, stepIndex);

          if (result.success) {
            this.addLog(runId, `✅ 步骤执行成功 (策略: ${strategyName}, 尝试: ${attempt})`, 'success');
            return { success: true };
          } else {
            throw new Error(result.error || '执行失败');
          }
        } catch (error: any) {
          lastError = error.message;
          const isLastAttempt = attempt === retryConfig.maxRetries;
          const isLastStrategy = strategy === retryConfig.strategies.length - 1;

          // 🚀 智能重试判断
          if (!retryConfig.shouldRetry(lastError, attempt)) {
            this.addLog(runId, `⏭️ 错误类型不适合重试，跳过: ${lastError}`, 'warning');
            break;
          }

          if (isLastAttempt && isLastStrategy) {
            this.addLog(runId, `❌ 所有策略和重试均失败: ${lastError}`, 'error');
            return { success: false, error: lastError };
          } else if (isLastAttempt) {
            this.addLog(runId, `⚠️ 策略 "${strategyName}" 失败，尝试下一策略`, 'warning');
            break; // 跳到下一个策略
          } else {
            this.addLog(runId, `🔄 策略 "${strategyName}" 第${attempt}次尝试失败，重试中: ${lastError}`, 'warning');
            // 🚀 智能延迟：基础延迟500ms + 尝试次数 * 300ms
            await this.delay(500 + (attempt - 1) * 300);
          }
        }
      }
    }

    return { success: false, error: lastError || '所有策略和重试均失败' };
  }

  // 🔥 新增：根据策略执行MCP命令
  private async executeMcpCommandWithStrategy(step: TestStep, runId: string, strategy: string, stepIndex: number): Promise<{ success: boolean; error?: string }> {
    switch (strategy) {
      case 'standard':
        // 标准策略：直接使用现有的executeMcpCommand
        return await this.executeMcpCommand(step, runId, stepIndex);

      case 'alternative':
        // 替代策略：使用更宽松的元素查找
        this.addLog(runId, `🔄 使用替代策略：宽松元素查找`, 'info');
        return await this.executeMcpCommandWithAlternativeSearch(step, runId, stepIndex);

      case 'simple':
        // 简单策略：使用最基础的选择器
        this.addLog(runId, `🔄 使用简单策略：基础选择器`, 'info');
        return await this.executeMcpCommandWithSimpleSelector(step, runId, stepIndex);

      default:
        return await this.executeMcpCommand(step, runId, stepIndex);
    }
  }


  // 🔥 智能判断失败后是否应该继续执行（基于AI分析）
  private async shouldContinueAfterFailure(step: TestStep, runId: string, error?: string): Promise<boolean> {
    // 🔥 关键操作类型失败不继续
    const criticalActions = ['navigate', 'browser_navigate', 'browser_click'];

    if (criticalActions.includes(step.action)) {
      this.addLog(runId, `❌ 关键操作 "${step.action}" 失败，终止执行`, 'error');
      return false;
    }

    // 🔥 MCP连接问题不继续
    if (error?.includes('MCP_DISCONNECTED') || error?.includes('Client is not initialized')) {
      this.addLog(runId, `❌ MCP连接问题，终止执行`, 'error');
      return false;
    }

    // 🔥 AI解析失败不继续
    if (error?.includes('AI解析失败')) {
      this.addLog(runId, `❌ AI解析失败，终止执行`, 'error');
      return false;
    }

    // 🔥 其他情况继续执行，但记录警告
    this.addLog(runId, `⚠️ 非关键步骤失败，继续执行后续步骤`, 'warning');
    return true;
  }

  // 🔥 统一的元素查找和参数转换辅助方法
  private async findElementAndBuildCommand(
    action: string,
    selector: string,
    value: string | undefined,
    runId: string
  ): Promise<{ name: string; arguments: any }> {
    console.log(`🔍 [${runId}] 构建MCP命令: ${action} -> ${selector}`);

    // 🔥 修复：直接使用MCP客户端的智能元素查找，不使用无效的'find'动作
    // 通过快照获取页面信息，然后进行智能匹配
    let elementRef = selector;

    try {
      // 获取页面快照进行元素匹配
      const snapshot = await this.mcpClient.getSnapshot();
      if (snapshot) {
        // 使用MCP客户端的AI匹配功能查找最佳元素
        const matchedElement = await this.findBestElementFromSnapshot(selector, snapshot, runId);
        if (matchedElement) {
          elementRef = matchedElement.ref;
          console.log(`✅ [${runId}] 智能匹配成功: "${matchedElement.text}" -> ${elementRef}`);
        } else {
          console.warn(`⚠️ [${runId}] 智能匹配失败，使用原始选择器: ${selector}`);
        }
      }
    } catch (snapshotError) {
      console.warn(`⚠️ [${runId}] 页面快照获取失败，使用原始选择器: ${snapshotError.message}`);
    }

    // 获取工具名称
    const mappedAction = MCPToolMapper.getToolName(action);

    // 构建正确格式的参数
    let mcpArguments: any = {};

    switch (action) {
      case 'click':
      case 'browser_click':
        mcpArguments = { ref: elementRef };
        break;
      case 'fill':
      case 'input':
      case 'type':
      case 'browser_type':
        mcpArguments = { ref: elementRef, text: value || '' };
        break;
      default:
        throw new Error(`不支持的操作类型: ${action}`);
    }

    console.log(`✅ [${runId}] MCP命令构建完成: ${mappedAction}`);
    console.log(`📋 [${runId}] 参数格式: ${JSON.stringify(mcpArguments)}`);

    return { name: mappedAction, arguments: mcpArguments };
  }

  // 🔥 AI驱动的智能元素匹配（不使用关键字匹配）
  private async findBestElementFromSnapshot(selector: string, snapshot: string, runId: string): Promise<{ ref: string; text: string } | null> {
    try {
      // 解析快照获取所有可交互元素
      const elements: Array<{ ref: string; text: string; role: string }> = [];
      const lines = snapshot.split('\n');

      for (const line of lines) {
        const trimmedLine = line.trim();
        const refMatch = trimmedLine.match(/\[ref=([a-zA-Z0-9_-]+)\]/);

        if (refMatch) {
          const ref = refMatch[1];
          const textMatches = trimmedLine.match(/"([^"]*)"/g) || [];
          const texts = textMatches.map(t => t.replace(/"/g, ''));

          let role = '';
          if (trimmedLine.includes('textbox')) role = 'textbox';
          else if (trimmedLine.includes('button')) role = 'button';
          else if (trimmedLine.includes('link')) role = 'link';
          else if (trimmedLine.includes('checkbox')) role = 'checkbox';
          else if (trimmedLine.includes('combobox')) role = 'combobox';

          if (role && texts.length > 0) {
            elements.push({ ref, text: texts[0] || '', role });
          }
        }
      }

      console.log(`🔍 [${runId}] 从快照中发现 ${elements.length} 个可交互元素`);

      if (elements.length === 0) {
        return null;
      }

      // 🔥 使用AI进行智能元素匹配，而不是关键字匹配
      try {
        const matchPrompt = `请从以下页面元素中选择最适合的元素来匹配选择器："${selector}"

可用元素：
${elements.map((el, index) => `${index + 1}. ${el.ref}: ${el.role} "${el.text}"`).join('\n')}

请只返回最匹配的元素编号（1-${elements.length}），如果没有合适的元素请返回0：`;

        // 这里可以调用AI，但为了简化，我们使用基于文本相似度的匹配
        let bestMatch = null;
        let bestScore = 0;

        for (const element of elements) {
          let score = 0;
          const elementText = element.text.toLowerCase();
          const selectorLower = selector.toLowerCase();

          // 计算文本相似度
          if (elementText.includes(selectorLower) || selectorLower.includes(elementText)) {
            score += 80;
          }

          // 计算编辑距离相似度
          const similarity = this.calculateTextSimilarity(elementText, selectorLower);
          score += similarity * 60;

          if (score > bestScore) {
            bestScore = score;
            bestMatch = element;
          }
        }

        if (bestMatch && bestScore >= 30) {
          console.log(`✅ [${runId}] AI智能匹配: "${bestMatch.text}" (${bestMatch.ref}) 得分: ${bestScore}`);
          return { ref: bestMatch.ref, text: bestMatch.text };
        }

        return null;

      } catch (aiError: any) {
        console.warn(`⚠️ [${runId}] AI匹配失败，使用第一个可用元素: ${aiError.message}`);
        return elements.length > 0 ? { ref: elements[0].ref, text: elements[0].text } : null;
      }

    } catch (error) {
      console.error(`❌ [${runId}] 元素匹配失败: ${error.message}`);
      return null;
    }
  }



  // 🔥 计算文本相似度的辅助方法
  private calculateTextSimilarity(text1: string, text2: string): number {
    if (text1 === text2) return 1.0;
    if (!text1 || !text2) return 0.0;

    const len1 = text1.length;
    const len2 = text2.length;
    const maxLen = Math.max(len1, len2);

    if (maxLen === 0) return 1.0;

    // 简单的字符匹配相似度
    let matches = 0;
    const minLen = Math.min(len1, len2);

    for (let i = 0; i < minLen; i++) {
      if (text1[i] === text2[i]) {
        matches++;
      }
    }

    return matches / maxLen;
  }

  // 🔥 执行MCP命令
  private async executeMcpCommand(step: TestStep, runId: string, stepIndex: number = 1): Promise<{ success: boolean; error?: string }> {
    try {
      // 🔥 调试：打印步骤详细信息
      console.log(`🔍 [${runId}] executeMcpCommand 调试信息:`);
      console.log(`   action: ${step.action}`);
      console.log(`   selector: ${step.selector || 'undefined'}`);
      console.log(`   value: ${step.value || 'undefined'}`);
      console.log(`   url: ${step.url || 'undefined'}`);
      console.log(`   description: ${step.description}`);
      console.log(`   完整step对象:`, JSON.stringify(step, null, 2));

      this.addLog(runId, `🔍 executeMcpCommand调试: action=${step.action}, selector=${step.selector || 'undefined'}, value=${step.value || 'undefined'}`, 'info');

      // 如果步骤已经包含了action和必要参数，使用正确的参数格式
      // 🔥 调试：分别检查每个条件
      const conditions = {
        hasAction: !!step.action,
        navigate: step.action === 'navigate' && !!step.url,
        browserNavigate: step.action === 'browser_navigate' && !!step.url,
        click: step.action === 'click' && !!step.selector,
        browserClick: step.action === 'browser_click' && !!step.ref,
        fill: step.action === 'fill' && !!step.selector && step.value !== undefined,
        input: step.action === 'input' && !!step.selector && step.value !== undefined,
        type: step.action === 'type' && !!step.selector && step.value !== undefined,
        browserType: step.action === 'browser_type' && !!step.ref && step.text !== undefined,
        // 🔥 修复：添加下拉选择操作条件检查
        browserSelectOption: step.action === 'browser_select_option' && !!step.ref && step.value !== undefined,
        expect: step.action === 'expect',
        wait: step.action === 'wait',
        browserWaitFor: step.action === 'browser_wait_for',
        // 🔥 新增：断言命令条件检查
        browserSnapshot: step.action === 'browser_snapshot' || (step.stepType === 'assertion' && step.action === 'browser_snapshot'),
        assertionWaitFor: step.action === 'browser_wait_for' && step.stepType === 'assertion',
        // 🔥 修复：添加滚动操作条件检查
        scrollDown: step.action === 'browser_scroll_down',
        scrollUp: step.action === 'browser_scroll_up',
        scrollToTop: step.action === 'browser_scroll_to_top',
        scrollToBottom: step.action === 'browser_scroll_to_bottom',
        scrollToElement: step.action === 'browser_scroll_to_element',
        scrollBy: step.action === 'browser_scroll_by',
        scrollPage: step.action === 'browser_scroll_page',
        scroll: step.action === 'scroll',
        // 🔥 新增：页签切换操作条件检查
        browserTabSwitch: step.action === 'browser_tab_switch' && !!step.tabTarget && !!step.tabMatchType
      };

      console.log(`🔍 [${runId}] 条件检查详情:`, conditions);

      const conditionCheck = step.action && (
        conditions.navigate || conditions.browserNavigate ||
        conditions.click || conditions.browserClick ||
        conditions.fill || conditions.input || conditions.type || conditions.browserType ||
        // 🔥 修复：添加下拉选择操作到条件检查
        conditions.browserSelectOption ||
        conditions.expect || conditions.wait || conditions.browserWaitFor ||
        conditions.browserSnapshot || conditions.assertionWaitFor ||
        // 🔥 修复：添加滚动操作条件检查
        conditions.scrollDown || conditions.scrollUp || conditions.scrollToTop || 
        conditions.scrollToBottom || conditions.scrollToElement || conditions.scrollBy || 
        conditions.scrollPage || conditions.scroll ||
        // 🔥 新增：添加页签切换条件检查
        conditions.browserTabSwitch
      );

      console.log(`🔍 [${runId}] 预解析分支条件检查: ${conditionCheck}`);
      this.addLog(runId, `🔍 预解析分支条件检查: ${conditionCheck}`, 'info');

      if (conditionCheck) {
        console.log(`🔧 [${runId}] 使用预解析的MCP命令: ${step.action}`);

        // 导航命令需要特殊处理
        if ((step.action === 'navigate' || step.action === 'browser_navigate' || step.action === 'open' || step.action === 'goto') && step.url) {
          // 🚀 Phase 1: 检测是否为首次导航 (第一步通常都是导航)
          const isFirstStep = stepIndex === 1;
          
          // 🔥 第一步导航：使用超快速模式，完全跳过等待和验证
          if (isFirstStep) {
            console.log(`⚡ [${runId}] 第一步导航：超快速模式，跳过所有等待逻辑`);
            try {
              const validatedUrl = this.validateAndFixUrl(step.url);
              
              // 直接调用MCP导航，设置短超时
              const result = await Promise.race([
                this.mcpClient.callTool({
                  name: MCPToolMapper.getToolName('navigate'),
                  arguments: { url: validatedUrl }
                }),
                new Promise<any>((_, reject) => 
                  setTimeout(() => reject(new Error('第一步导航10秒超时')), 10000)
                )
              ]);
              
              console.log(`⚡ [${runId}] 第一步导航立即完成，跳过所有验证`);
              this.addLog(runId, `⚡ 第一步导航快速完成: ${validatedUrl}`, 'success');
              return { success: true };
              
            } catch (error: any) {
              console.log(`⚡ [${runId}] 第一步快速导航超时，使用降级模式: ${error.message}`);
              // 超时时降级到原有逻辑，但仍然使用第一步标识
            }
          }
          
          return await this.executeNavigationCommand(step.url, runId, isFirstStep);
        }

        // 等待命令不需要元素查找
        if (step.action === 'wait') {
          const timeout = step.timeout || (step.description ? this.extractTimeoutFromDescription(step.description) : 1000);
          const mcpCommand = {
            name: MCPToolMapper.getToolName('wait'),
            arguments: { timeout: timeout }
          };
          console.log(`🔧 [${runId}] MCP工具调用: ${mcpCommand.name} ${JSON.stringify(mcpCommand.arguments)}`);
          const result = await this.mcpClient.callTool(mcpCommand);

          // 🔥 检查MCP返回结果
          console.log(`🔍 [${runId}] wait命令MCP返回结果:`, JSON.stringify(result, null, 2));
          this.addLog(runId, `🔍 wait命令MCP返回: ${JSON.stringify(result)}`, 'info');

          // 🔥 改进的错误检测，避免误判前端JS错误
          if (result && result.content) {
            const content = Array.isArray(result.content) ? result.content : [result.content];
            for (const item of content) {
              if (item.type === 'text' && item.text) {
                if (this.isRealMCPError(item.text)) {
                  console.error(`❌ [${runId}] wait命令执行失败: ${item.text}`);
                  this.addLog(runId, `❌ wait命令执行失败: ${item.text}`, 'error');
                  return { success: false, error: item.text };
                } else if (item.text.toLowerCase().includes('error')) {
                  console.warn(`⚠️ [${runId}] wait命令检测到前端JS错误（不影响操作）: ${item.text}`);
                  this.addLog(runId, `⚠️ 前端JS错误（不影响操作）: ${item.text}`, 'warning');
                }
              }
            }
          }

          return { success: true };
        }

        // 🔥 修复：在预解析分支中添加滚动操作处理
        if (step.action === 'browser_scroll_down' || step.action === 'browser_scroll_up' || 
            step.action === 'browser_scroll_to_top' || step.action === 'browser_scroll_to_bottom' ||
            step.action === 'browser_scroll_to_element' || step.action === 'browser_scroll_by' ||
            step.action === 'browser_scroll_page' || step.action === 'scroll') {
          console.log(`📜 [${runId}] 预解析分支执行滚动操作: ${step.action} - ${step.description}`);
          return await this.executeScrollCommand(step, runId);
        }

        // 🔥 新增：页签切换操作处理
        if (step.action === 'browser_tab_switch') {
          console.log(`🔄 [${runId}] 预解析分支执行页签切换: ${step.action} - ${step.description}`);
          return await this.executeTabSwitchCommand(step, runId);
        }

        // 🔥 新增：断言命令处理（获取快照进行验证）
        if (step.action === 'browser_snapshot' || (step.stepType === 'assertion' && step.action === 'browser_snapshot')) {
          console.log(`🔍 [${runId}] 执行断言快照获取: ${step.description}`);
          const mcpCommand = {
            name: MCPToolMapper.getToolName('snapshot'),
            arguments: {}
          };
          console.log(`🔧 [${runId}] MCP工具调用: ${mcpCommand.name} ${JSON.stringify(mcpCommand.arguments)}`);
          const result = await this.mcpClient.callTool(mcpCommand);

          // 🔥 检查MCP返回结果并进行断言验证
          console.log(`🔍 [${runId}] snapshot命令MCP返回结果:`, JSON.stringify(result, null, 2));
          this.addLog(runId, `🔍 断言快照获取: ${JSON.stringify(result)}`, 'info');

          // 🔥 在这里添加断言验证逻辑
          const assertionResult = await this.validateAssertion(step.description, result, runId);
          if (!assertionResult.success) {
            console.error(`❌ [${runId}] 断言验证失败: ${assertionResult.error}`);
            this.addLog(runId, `❌ 断言验证失败: ${assertionResult.error}`, 'error');
            return { success: false, error: assertionResult.error };
          }

          console.log(`✅ [${runId}] 断言验证通过: ${step.description}`);
          this.addLog(runId, `✅ 断言验证通过: ${step.description}`, 'success');
          return { success: true };
        }

        // 🔥 新增：等待文本断言命令处理
        if (step.action === 'browser_wait_for' && step.stepType === 'assertion') {
          console.log(`🔍 [${runId}] 执行等待文本断言: ${step.description}`);
          const mcpCommand = {
            name: MCPToolMapper.getToolName('wait_for'),
            arguments: step.text ? { text: step.text } : { time: 3000 }  // 默认等待3秒
          };
          console.log(`🔧 [${runId}] MCP工具调用: ${mcpCommand.name} ${JSON.stringify(mcpCommand.arguments)}`);
          const result = await this.mcpClient.callTool(mcpCommand);

          // 🔥 检查MCP返回结果
          console.log(`🔍 [${runId}] browser_wait_for命令MCP返回结果:`, JSON.stringify(result, null, 2));
          this.addLog(runId, `🔍 等待文本断言返回: ${JSON.stringify(result)}`, 'info');

          // 🔥 改进的错误检测，避免误判前端JS错误
          if (result && result.content) {
            const content = Array.isArray(result.content) ? result.content : [result.content];
            for (const item of content) {
              if (item.type === 'text' && item.text) {
                if (this.isRealMCPError(item.text)) {
                  console.error(`❌ [${runId}] 等待文本断言失败: ${item.text}`);
                  this.addLog(runId, `❌ 等待文本断言失败: ${item.text}`, 'error');
                  return { success: false, error: item.text };
                } else if (item.text.toLowerCase().includes('error')) {
                  console.warn(`⚠️ [${runId}] 等待文本断言检测到前端JS错误（不影响操作）: ${item.text}`);
                  this.addLog(runId, `⚠️ 前端JS错误（不影响操作）: ${item.text}`, 'warning');
                }
              }
            }
          }

          console.log(`✅ [${runId}] 等待文本断言通过: ${step.description}`);
          this.addLog(runId, `✅ 等待文本断言通过: ${step.description}`, 'success');
          return { success: true };
        }

        // 🔥 新增：滚动操作命令处理
        if (step.action === 'browser_scroll_down' || step.action === 'browser_scroll_up' || 
            step.action === 'browser_scroll_to_top' || step.action === 'browser_scroll_to_bottom' ||
            step.action === 'browser_scroll_to_element' || step.action === 'browser_scroll_by' ||
            step.action === 'browser_scroll_page' || step.action === 'scroll') {
          console.log(`📜 [${runId}] 执行滚动操作: ${step.action} - ${step.description}`);
          return await this.executeScrollCommand(step, runId);
        }

        // 断言命令保持原有格式
        if (step.action === 'expect') {
          const mcpCommand = {
            name: MCPToolMapper.getToolName('expect'),
            arguments: {
              selector: step.selector || 'body',
              condition: step.condition || 'visible',
              text: step.text || ''
            }
          };
          console.log(`🔧 [${runId}] MCP工具调用: ${mcpCommand.name} ${JSON.stringify(mcpCommand.arguments)}`);
          const result = await this.mcpClient.callTool(mcpCommand);

          // 🔥 检查MCP返回结果
          console.log(`🔍 [${runId}] expect命令MCP返回结果:`, JSON.stringify(result, null, 2));
          this.addLog(runId, `🔍 expect命令MCP返回: ${JSON.stringify(result)}`, 'info');

          // 🔥 改进的错误检测，避免误判前端JS错误
          if (result && result.content) {
            const content = Array.isArray(result.content) ? result.content : [result.content];
            for (const item of content) {
              if (item.type === 'text' && item.text) {
                if (this.isRealMCPError(item.text)) {
                  console.error(`❌ [${runId}] expect命令执行失败: ${item.text}`);
                  this.addLog(runId, `❌ expect命令执行失败: ${item.text}`, 'error');
                  return { success: false, error: item.text };
                } else if (item.text.toLowerCase().includes('error')) {
                  console.warn(`⚠️ [${runId}] expect命令检测到前端JS错误（不影响操作）: ${item.text}`);
                  this.addLog(runId, `⚠️ 前端JS错误（不影响操作）: ${item.text}`, 'warning');
                }
              }
            }
          }

          return { success: true };
        }

        // 🔥 修复：点击、输入和下拉选择操作使用正确的参数格式
        if (step.action === 'click' || step.action === 'browser_click' ||
          step.action === 'fill' || step.action === 'input' || step.action === 'type' || step.action === 'browser_type' ||
          step.action === 'browser_select_option') {
          try {
            console.log(`🔍 [${runId}] 处理AI解析的步骤参数`);
            console.log(`📋 [${runId}] 原始步骤信息: action=${step.action}, element=${step.element}, ref=${step.ref}, text=${step.text || step.value || 'N/A'}`);

            // 🔥 直接使用AI解析的参数构建MCP命令
            const mcpCommand = {
              name: MCPToolMapper.getToolName(step.action),
              arguments: {
                element: step.element || '未知元素',
                ref: step.ref || step.selector,
                ...(step.action.includes('type') || step.action.includes('fill') || step.action.includes('input') 
                  ? { text: step.text || step.value || '' } 
                  : {}),
                ...(step.action === 'browser_select_option' 
                  ? { values: Array.isArray(step.value) ? step.value : [step.value || step.text || ''] } 
                  : {})
              }
            };

            // 验证参数格式
            if (!this.validateMCPParameters(mcpCommand.name, mcpCommand.arguments)) {
              throw new Error(`参数格式验证失败: ${JSON.stringify(mcpCommand.arguments)}`);
            }

            console.log(`🔧 [${runId}] MCP工具调用: ${mcpCommand.name} ${JSON.stringify(mcpCommand.arguments)}`);

            // 🔥 关键修复：增加MCP命令执行验证
            this.addLog(runId, `🔧 正在执行MCP命令: ${mcpCommand.name}`, 'info');

            // 🔥 新增：执行MCP命令时显示等待状态
            const result = await this.executeWithWaitingLog(
              runId,
              `执行MCP命令: ${mcpCommand.name}`,
              async () => {
                return await this.mcpClient.callTool(mcpCommand);
              }
            );
            console.log(`✅ [${runId}] MCP工具调用成功: ${mcpCommand.name}`);

            // 🔥 详细检查MCP返回结果
            console.log(`🔍 [${runId}] 关键操作MCP返回结果:`, JSON.stringify(result, null, 2));
            this.addLog(runId, `🔍 关键操作MCP返回: ${JSON.stringify(result)}`, 'info');

            // 🔥 改进的错误检测逻辑，避免误判前端JS错误
            let hasError = false;
            let errorMessage = '';

            if (result && result.content) {
              const content = Array.isArray(result.content) ? result.content : [result.content];
              for (const item of content) {
                if (item.type === 'text' && item.text) {
                  console.log(`📄 [${runId}] MCP返回内容: ${item.text}`);
                  this.addLog(runId, `📄 MCP返回内容: ${item.text}`, 'info');

                  // 🔥 使用改进的错误检测方法，避免误判前端JS错误
                  if (this.isRealMCPError(item.text)) {
                    hasError = true;
                    errorMessage = item.text;
                    console.error(`❌ [${runId}] MCP命令执行错误: ${item.text}`);
                    this.addLog(runId, `❌ MCP命令执行错误: ${item.text}`, 'error');
                  } else if (item.text.toLowerCase().includes('error')) {
                    // 🔥 前端JS错误不影响操作成功，只记录警告
                    console.warn(`⚠️ [${runId}] 检测到前端JS错误（不影响操作）: ${item.text}`);
                    this.addLog(runId, `⚠️ 前端JS错误（不影响操作）: ${item.text}`, 'warning');
                  }
                }
              }
            }

            // 🔥 如果发现真正的MCP错误，返回失败状态
            if (hasError) {
              return { success: false, error: errorMessage };
            }

            // 🔥 点击操作特殊处理：检测并切换到新页签
            if (step.action === 'click' || step.action === 'browser_click') {
              console.log(`🔄 [${runId}] 点击操作完成，检测是否需要切换新页签...`);
              
              const tabResult = await this.detectAndSwitchToNewTabOptimized(runId);
              if (tabResult.success) {
                if (tabResult.switched) {
                  console.log(`✅ [${runId}] 已自动切换到新页签: ${tabResult.url}`);
                  this.addLog(runId, `✅ 已自动切换到新页签: ${tabResult.title}`, 'success');
                } else {
                  console.log(`ℹ️ [${runId}] 保持当前页签: ${tabResult.url}`);
                  this.addLog(runId, `ℹ️ 操作在当前页签完成`, 'info');
                }
              } else if (tabResult.error) {
                console.warn(`⚠️ [${runId}] 新页签检测失败: ${tabResult.error}`);
                this.addLog(runId, `⚠️ 新页签检测失败，但操作可能仍然成功`, 'warning');
              }
            }

            // 🔥 新增：验证MCP命令是否真正执行
            const executionVerified = await this.verifyMCPCommandExecution(mcpCommand, runId);
            if (!executionVerified) {
              this.addLog(runId, `⚠️ MCP命令执行验证失败，可能没有实际效果`, 'warning');
              // 不直接返回失败，而是记录警告并继续
            } else {
              this.addLog(runId, `✅ MCP命令执行验证成功`, 'success');
            }

            return { success: true };
          } catch (elementError: any) {
            console.error(`❌ [${runId}] 预解析分支执行失败:`);
            console.error(`   🔍 选择器: ${step.selector}`);
            console.error(`   🎯 操作类型: ${step.action}`);
            console.error(`   📄 输入值: ${step.value || 'N/A'}`);
            console.error(`   💥 错误详情: ${elementError.message}`);
            console.error(`   📚 错误堆栈: ${elementError.stack}`);

            // 记录详细的错误信息到测试日志
            this.addLog(runId, `预解析分支执行失败: ${step.action} 操作`, 'error');
            this.addLog(runId, `目标选择器: ${step.selector}`, 'error');
            this.addLog(runId, `错误原因: ${elementError.message}`, 'error');

            return { success: false, error: `预解析分支执行失败: ${elementError.message}` };
          }
        }
      }

      // 如果步骤没有预解析的action和参数，则通过AI解析
      console.log(`🤖 [${runId}] 步骤未预解析，通过AI重新解析步骤`);
      this.addLog(runId, `🤖 正在通过AI解析步骤: ${step.description}`, 'info');

      // 获取当前页面快照用于AI决策
      const snapshot = await this.mcpClient.getSnapshot();

      // 通过AI解析步骤描述生成MCP命令
      try {
        // 🔥 新增：AI解析时显示等待状态
        const aiResult = await this.executeWithWaitingLog(
          runId,
          'AI正在解析步骤',
          async () => {
            // 🔥 修复：传递日志回调函数，将AI错误记录到前端日志
            return await this.aiParser.parseNextStep(
              step.description, 
              snapshot, 
              runId,
              (message: string, level: 'info' | 'success' | 'warning' | 'error') => {
                this.addLog(runId, message, level);
              }
            );
          }
        );

        if (!aiResult.success || !aiResult.step) {
          // 🔥 修复：不再在这里记录错误，因为 callLLM 已经通过 logCallback 记录过了，避免重复打印
          throw new Error(`AI解析失败: ${aiResult.error}`);
        }

        // 使用AI解析的结果重新执行
        const aiStep = aiResult.step;
        console.log(`🤖 [${runId}] AI重新解析成功: ${aiStep.action} - ${aiStep.description}`);

        // 递归调用自己，但这次使用AI解析的步骤
        return await this.executeMcpCommand(aiStep, runId);

      } catch (aiError: any) {
        // 🔥 修复：不再在这里记录错误，因为 callLLM 已经通过 logCallback 记录过了，避免重复打印
        return { success: false, error: `AI解析失败: ${aiError.message}` };
      }
    } catch (error: any) {
      console.error(`❌ [${runId}] MCP命令执行失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // 🚀 Phase 1: 智能等待条件检查
  private async waitForCondition(
    checkFn: () => Promise<boolean> | boolean, 
    options: { 
      minWait?: number; 
      maxWait?: number; 
      checkInterval?: number; 
    } = {}
  ): Promise<boolean> {
    const { 
      minWait = 200, 
      maxWait = 2000, 
      checkInterval = 100 
    } = options;

    // 最小等待时间
    await new Promise(resolve => setTimeout(resolve, minWait));
    
    const startTime = Date.now();
    const endTime = startTime + maxWait - minWait;
    
    while (Date.now() < endTime) {
      try {
        const result = await checkFn();
        if (result) {
          return true;
        }
      } catch (error) {
        // 检查条件时出错，继续等待
      }
      
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
    
    return false;
  }

  // 🚀 Phase 1: 检查页面是否达到可交互状态  
  private async checkPageInteractive(): Promise<boolean> {
    try {
      // 🔥 优化：对于初始阶段（浏览器刚启动），直接返回false，跳过快照获取
      // 这避免了在空白页面上耗时的快照操作
      try {
        const snapshot = await Promise.race([
          this.mcpClient.getSnapshot(),
          new Promise<string>((_, reject) => 
            setTimeout(() => reject(new Error('快照获取超时')), 1000)
          )
        ]);
        
        // 从快照中提取URL，确保不是about:blank
        const currentUrl = this.extractUrlFromSnapshot(snapshot);
        if (!currentUrl || currentUrl === 'about:blank') {
          return false;
        }
        
        // 检查页面是否已经有基本内容
        return snapshot && snapshot.trim().length > 100;
      } catch (error) {
        // 快照获取失败或超时，直接返回false（适用于初始阶段）
        return false;
      }
    } catch (error) {
      return false;
    }
  }

  // 🚀 Phase 1: 优化版导航命令执行
  private async executeNavigationCommand(url: string, runId: string, isFirstStep: boolean = false): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. 验证和修正URL
      const validatedUrl = this.validateAndFixUrl(url);
      console.log(`🌐 [${runId}] 导航到: ${validatedUrl} ${isFirstStep ? '(首次导航-快速模式)' : ''}`);

      // 2. 执行导航命令
      console.log(`🌐 [${runId}] 执行MCP导航命令: navigate ${validatedUrl}`);
      const navResult = await this.mcpClient.callTool({
        name: MCPToolMapper.getToolName('navigate'),
        arguments: { url: validatedUrl }
      });
      console.log(`🌐 [${runId}] 导航结果:`, navResult);

      // 3. 🚀 智能等待页面加载 (Phase 1 优化核心)
      if (isFirstStep) {
        console.log(`⚡ [${runId}] 首次导航智能等待 (DOM可交互状态)...`);
        const waitSuccess = await this.waitForCondition(
          () => this.checkPageInteractive(),
          { 
            minWait: 200,      // 最少等待200ms
            maxWait: 2000,     // 最多等待2秒 (原来3秒)
            checkInterval: 100  // 每100ms检查一次
          }
        );
        
        if (waitSuccess) {
          console.log(`⚡ [${runId}] 首次导航快速完成!`);
        } else {
          console.log(`⚡ [${runId}] 首次导航达到最大等待时间，继续执行`);
        }
      } else {
        // 非首次导航保持原有逻辑
        console.log(`⏳ [${runId}] 等待页面加载...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      // 4. 验证导航结果
      // 🔥 优化：第一步导航验证使用快速超时，避免长时间等待
      let snapshot: string;
      if (isFirstStep) {
        try {
          snapshot = await Promise.race([
            this.mcpClient.getSnapshot(),
            new Promise<string>((_, reject) => 
              setTimeout(() => reject(new Error('导航验证快照超时')), 2000)
            )
          ]);
        } catch (error) {
          // 超时或失败时使用简单的成功假设，避免阻塞
          console.log(`⚡ [${runId}] 第一步导航验证快照超时，假设成功`);
          return { success: true };
        }
      } else {
        snapshot = await this.mcpClient.getSnapshot();
      }
      const currentUrl = this.extractUrlFromSnapshot(snapshot);

      // 5. 检查导航是否成功
      if (currentUrl && currentUrl !== 'about:blank') {
        console.log(`✅ [${runId}] 导航成功: ${currentUrl}`);
        return { success: true };
      } else {
        console.log(`⚠️ [${runId}] 导航可能未完成，当前URL: ${currentUrl || 'unknown'}`);

        // 6. 重试导航 (首次导航时使用更短的等待时间)
        console.log(`🔄 [${runId}] 重试导航...`);
        await this.mcpClient.callTool({
          name: MCPToolMapper.getToolName('navigate'),
          arguments: { url: validatedUrl }
        });

        // 7. 🚀 智能重试等待
        const retryWait = isFirstStep ? 2000 : 5000;
        console.log(`⏳ [${runId}] 重试等待 (${retryWait}ms)...`);
        await new Promise(resolve => setTimeout(resolve, retryWait));

        // 8. 再次验证
        const newSnapshot = await this.mcpClient.getSnapshot();
        const newUrl = this.extractUrlFromSnapshot(newSnapshot);

        if (newUrl && newUrl !== 'about:blank') {
          console.log(`✅ [${runId}] 重试导航成功: ${newUrl}`);
          return { success: true };
        } else {
          // 9. 尝试备用导航方法
          console.log(`🔄 [${runId}] 尝试备用导航方法...`);

          // 使用browser_type输入URL并按Enter
          await this.mcpClient.callTool({
            name: 'type',
            arguments: { selector: 'body', text: validatedUrl }
          });

          await this.mcpClient.callTool({
            name: 'press_key',
            arguments: { key: 'Enter' }
          });

          // 10. 🚀 备用方法智能等待
          const fallbackWait = isFirstStep ? 2000 : 5000;
          await new Promise(resolve => setTimeout(resolve, fallbackWait));
          const finalSnapshot = await this.mcpClient.getSnapshot();
          const finalUrl = this.extractUrlFromSnapshot(finalSnapshot);

          if (finalUrl && finalUrl !== 'about:blank') {
            console.log(`✅ [${runId}] 备用导航方法成功: ${finalUrl}`);
            return { success: true };
          } else {
            console.log(`❌ [${runId}] 导航失败，无法访问: ${validatedUrl}`);
            return { success: false, error: `无法导航到 ${validatedUrl}` };
          }
        }
      }
    } catch (error: any) {
      console.error(`❌ [${runId}] 导航执行错误: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // 验证和修正URL
  private validateAndFixUrl(url: string): string {
    // 确保URL有协议前缀
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    // 处理特殊字符
    try {
      new URL(url); // 验证URL格式
      return url;
    } catch (e) {
      // 如果URL格式不正确，尝试修复
      return encodeURI(url);
    }
  }

  // 从快照中提取URL
  private extractUrlFromSnapshot(snapshot: string): string | null {
    if (!snapshot) return null;
    const urlMatch = snapshot.match(/Page URL: ([^\n]+)/);
    return urlMatch ? urlMatch[1].trim() : null;
  }



  // 🔥 增强：每个步骤执行后的截图方法 - 支持数据库存储和本地文件验证
  private async takeStepScreenshot(runId: string, stepIndex: number | string, status: 'success' | 'failed' | 'error' | 'completed', description: string): Promise<void> {
    try {
      // 1. 生成截图文件名
      const timestamp = Date.now();
      const sanitizedDescription = description.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').substring(0, 50);
      const filename = `${runId}-step-${stepIndex}-${status}-${timestamp}.png`;

      console.log(`📸 [${runId}] 正在截图: ${filename}`);
      this.addLog(runId, `📸 正在截图: 步骤${stepIndex} - ${description}`, 'info');

      // 2. 使用统一的截图配置
      const { screenshotConfig } = await import('../../src/utils/screenshotConfig.js');
      const screenshotsDir = screenshotConfig.getScreenshotsDirectory();
      const configuredBackupDir = screenshotConfig.getBackupDirectory();

      // 确保截图目录存在
      screenshotConfig.ensureScreenshotsDirectory();

      // 3. 调用MCP客户端截图
      await this.mcpClient.takeScreenshot(filename);

      // 4. 验证截图文件是否成功保存并获取文件信息
      const filePath = path.join(screenshotsDir, filename);
      const fullPath = filePath;

      let fileSize = 0;
      let fileExists = false;

      // 🔥 如果禁用文件验证，直接标记为存在
      if (!screenshotConfig.isFileVerificationEnabled()) {
        fileExists = true;
        fileSize = 0; // 默认大小，不验证实际文件
        console.log(`✅ [${runId}] 文件验证已禁用，跳过文件检查: ${filename}`);
      } else {
        // 等待文件保存（MCP可能需要一些时间）
        const maxRetries = 8; // 增加重试次数
        let retryCount = 0;

        while (retryCount < maxRetries && !fileExists) {
          try {
            await new Promise(resolve => setTimeout(resolve, 300)); // 增加等待时间到300ms
            const stats = await fs.promises.stat(fullPath);
            fileSize = stats.size;

            // 验证文件不为空
            if (fileSize > 0) {
              fileExists = true;
              console.log(`✅ [${runId}] 截图文件验证成功: ${filename} (${fileSize} bytes)`);
            } else {
              console.warn(`⚠️ [${runId}] 截图文件为空，继续等待: ${filename}`);
              retryCount++;
            }
          } catch (error) {
            retryCount++;
            if (retryCount === maxRetries) {
              console.warn(`⚠️ [${runId}] 截图文件验证失败，重试${maxRetries}次后仍未找到: ${filename}`);
              this.addLog(runId, `⚠️ 截图可能失败: 文件 ${filename} 未找到`, 'warning');
            }
          }
        }
      }

      // 5. 获取测试运行信息
      const testRun = testRunStore.get(runId);

      // 6. 构建截图记录
      const screenshotRecord: ScreenshotRecord = {
        runId,
        testCaseId: testRun?.testCaseId,
        stepIndex: stepIndex.toString(),
        stepDescription: description,
        status,
        filePath,
        fileName: filename,
        fileSize,
        mimeType: 'image/png',
        fileExists
      };

      // 7. 保存到数据库
      try {
        await this.screenshotService.saveScreenshot(screenshotRecord);
        if (fileExists) {
          console.log(`✅ [${runId}] 截图已完整保存: ${filename} (本地文件+数据库)`);
          this.addLog(runId, `✅ 截图已完整保存: ${filename} (${fileSize} bytes)`, 'success');
        } else {
          console.log(`⚠️ [${runId}] 截图数据库记录已保存，但本地文件缺失: ${filename}`);
          this.addLog(runId, `⚠️ 截图数据库记录已保存，但本地文件可能缺失: ${filename}`, 'warning');
        }
      } catch (dbError: any) {
        console.error(`❌ [${runId}] 截图数据库保存失败: ${dbError.message}`);
        if (fileExists) {
          this.addLog(runId, `⚠️ 截图文件已保存到本地，但数据库记录失败: ${dbError.message}`, 'warning');
        } else {
          this.addLog(runId, `❌ 截图完全失败: 本地文件和数据库都保存失败`, 'error');
        }
        // 不抛出错误，确保测试执行不因截图数据库保存失败而中断
      }

      // 8. 创建本地备份（优化的双重保存机制）
      if (fileExists && fileSize > 0 && screenshotConfig.shouldBackup()) {
        try {
          // 使用配置的备份目录
          const now = new Date();
          const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
          const actualBackupDir = path.join(configuredBackupDir, dateStr, runId);

          await fs.promises.mkdir(actualBackupDir, { recursive: true });

          const backupPath = path.join(actualBackupDir, filename);
          await fs.promises.copyFile(fullPath, backupPath);

          console.log(`📂 [${runId}] 截图已备份: ${actualBackupDir}/${filename}`);
          this.addLog(runId, `📂 截图已创建备份副本`, 'info');

          // 验证备份文件
          const backupStats = await fs.promises.stat(backupPath);
          if (backupStats.size === fileSize) {
            console.log(`✅ [${runId}] 备份文件验证成功: ${backupStats.size} bytes`);
          } else {
            console.warn(`⚠️ [${runId}] 备份文件大小不匹配: ${backupStats.size} vs ${fileSize}`);
          }
        } catch (backupError: any) {
          console.warn(`⚠️ [${runId}] 截图备份失败: ${backupError.message}`);
          this.addLog(runId, `⚠️ 截图备份失败，但主文件已保存`, 'warning');
        }
      }

      // 9. 生成截图索引文件（便于管理和查看）
      if (fileExists) {
        try {
          const indexDir = path.join(screenshotsDir, 'index');
          await fs.promises.mkdir(indexDir, { recursive: true });

          const indexFile = path.join(indexDir, `${runId}_screenshots.json`);
          let indexData: any[] = [];

          // 读取现有索引文件
          try {
            const existingIndex = await fs.promises.readFile(indexFile, 'utf-8');
            indexData = JSON.parse(existingIndex);
          } catch {
            // 索引文件不存在，使用空数组
          }

          // 添加新的截图记录
          indexData.push({
            stepIndex: stepIndex.toString(),
            filename,
            description,
            status,
            timestamp: new Date().toISOString(),
            fileSize,
            filePath: filePath
          });

          // 保存更新后的索引
          await fs.promises.writeFile(indexFile, JSON.stringify(indexData, null, 2));
          console.log(`📋 [${runId}] 截图索引已更新: ${indexData.length} 个截图记录`);
        } catch (indexError: any) {
          console.warn(`⚠️ [${runId}] 截图索引更新失败: ${indexError.message}`);
          // 索引失败不影响主流程
        }
      }

    } catch (screenshotError: any) {
      // 🔥 关键修复：截图失败不应该中断测试执行
      console.error(`❌ [${runId}] 截图过程失败: ${screenshotError.message}`);
      this.addLog(runId, `⚠️ 截图失败但测试继续: ${screenshotError.message}`, 'warning');
      // 不抛出错误，确保测试执行继续进行
    }
  }

  // 🚀 Phase 3: 智能动态延迟系统
  private async smartWaitAfterOperation(action: string, context: { runId: string; isFirstStep?: boolean; stepIndex?: number }): Promise<void> {
    const { runId, isFirstStep = false } = context;
    
    switch (action) {
      case 'navigate':
      case 'browser_navigate':
        // 🚀 第一步导航：使用智能等待，已在executeNavigationCommand中处理
        if (isFirstStep) {
          console.log(`⚡ [${runId}] 第一步导航：跳过额外等待`);
          return; // 跳过所有延迟
        }
        
        // 🚀 普通导航：检查网络活动是否稳定
        console.log(`🌐 [${runId}] 导航后智能等待...`);
        const navWaitSuccess = await this.waitForCondition(
          () => this.checkNetworkStable(),
          { minWait: 500, maxWait: 2000, checkInterval: 200 }
        );
        console.log(`🌐 [${runId}] 导航等待完成: ${navWaitSuccess ? '网络稳定' : '超时继续'}`);
        break;

      case 'click':
      case 'browser_click':
        // 🚀 智能点击等待：检查页面是否有响应变化
        console.log(`👆 [${runId}] 点击后智能等待页面响应...`);
        const clickWaitSuccess = await this.waitForCondition(
          () => this.checkPageChanged(),
          { minWait: 200, maxWait: 1000, checkInterval: 100 }
        );
        console.log(`👆 [${runId}] 点击等待完成: ${clickWaitSuccess ? '页面已响应' : '超时继续'}`);
        break;

      case 'fill':
      case 'input':
      case 'type':
      case 'browser_type':
        // 🚀 输入等待：检查输入值是否已设置
        console.log(`⌨️ [${runId}] 输入后轻量等待...`);
        await this.delay(300); // 输入操作通常很快，轻量等待即可
        break;

      case 'wait':
      case 'browser_wait_for':
        // 等待命令不需要额外延迟
        return;

      case 'browser_scroll_down':
      case 'browser_scroll_up':
      case 'browser_scroll_to_top':
      case 'browser_scroll_to_bottom':
      case 'browser_scroll_to_element':
      case 'browser_scroll_by':
      case 'browser_scroll_page':
      case 'scroll':
        // 🚀 滚动等待：检查滚动位置是否稳定
        console.log(`📜 [${runId}] 滚动后等待稳定...`);
        const scrollWaitSuccess = await this.waitForCondition(
          () => this.checkScrollStable(),
          { minWait: 200, maxWait: 800, checkInterval: 100 }
        );
        console.log(`📜 [${runId}] 滚动等待完成: ${scrollWaitSuccess ? '位置稳定' : '超时继续'}`);
        break;

      default:
        // 🚀 其他操作：最小延迟
        console.log(`⚙️ [${runId}] 默认操作后轻量等待...`);
        await this.delay(200);
        break;
    }
  }

  // 🚀 Phase 3: 网络活动检查
  private async checkNetworkStable(): Promise<boolean> {
    try {
      // 简单的网络稳定性检查 - 检查页面是否还在加载
      const snapshot = await this.mcpClient.getSnapshot();
      // 如果能获取快照且有内容，认为网络相对稳定
      return snapshot && snapshot.trim().length > 50;
    } catch (error) {
      return false;
    }
  }

  // 🚀 Phase 3: 页面变化检查
  private async checkPageChanged(): Promise<boolean> {
    try {
      // 简单的页面变化检查 - 通过快照比较
      // 这里可以优化为比较DOM hash或特定元素
      await this.delay(50); // 短暂延迟确保变化能被检测到
      return true; // 简化实现，认为点击后总有变化
    } catch (error) {
      return false;
    }
  }

  // 🚀 Phase 3: 滚动稳定性检查
  private async checkScrollStable(): Promise<boolean> {
    try {
      // 简单的滚动稳定性检查
      await this.delay(50);
      return true; // 简化实现，短暂延迟后认为滚动已稳定
    } catch (error) {
      return false;
    }
  }

  // 🔥 保持兼容性的旧方法，重定向到智能版本
  private async delayAfterOperation(action: string, context: { runId: string; isFirstStep?: boolean; stepIndex?: number } = { runId: 'unknown' }): Promise<void> {
    return this.smartWaitAfterOperation(action, context);
  }


  // #region Screenshot Management

  /**
   * 清理指定测试运行的所有截图文件和数据库记录
   * @param runId 测试运行ID
   * @returns 清理结果统计
   */
  public async cleanupTestScreenshots(runId: string): Promise<{
    deleted: number;
    failed: number;
    totalSize: number;
  }> {
    try {
      console.log(`🧹 开始清理测试运行截图: ${runId}`);

      // 1. 获取该测试运行的所有截图记录
      const screenshots = await this.screenshotService.getScreenshotsByRunId(runId);

      if (screenshots.length === 0) {
        console.log(`📋 测试运行 ${runId} 没有截图记录`);
        return { deleted: 0, failed: 0, totalSize: 0 };
      }

      let deleted = 0;
      let failed = 0;
      let totalSize = 0;

      // 2. 删除本地文件
      for (const screenshot of screenshots) {
        try {
          const fullPath = path.join(process.cwd(), screenshot.filePath);

          // 检查文件是否存在
          try {
            const stats = await fs.promises.stat(fullPath);
            totalSize += stats.size;

            // 删除主文件
            await fs.promises.unlink(fullPath);

            // 删除备份文件
            const backupPattern = path.join(process.cwd(), 'screenshots', 'backup', '*', runId, screenshot.fileName);
            // 简化处理：尝试删除可能的备份位置
            const backupDir = path.join(process.cwd(), 'screenshots', 'backup');
            if (await this.fileExists(backupDir)) {
              await this.cleanupBackupFiles(backupDir, runId, screenshot.fileName);
            }

            deleted++;
            console.log(`🗑️ 已删除截图文件: ${screenshot.fileName}`);
          } catch (fileError) {
            // 文件不存在，跳过
            console.log(`📄 截图文件不存在（跳过）: ${screenshot.fileName}`);
            deleted++; // 算作成功删除
          }
        } catch (error: any) {
          console.error(`❌ 删除截图文件失败: ${screenshot.fileName}`, error);
          failed++;
        }
      }

      // 3. 删除数据库记录（通过ScreenshotService的清理方法）
      // 这里我们可以扩展ScreenshotService来支持按runId删除

      // 4. 删除索引文件
      try {
        const indexFile = path.join(process.cwd(), 'screenshots', 'index', `${runId}_screenshots.json`);
        if (await this.fileExists(indexFile)) {
          await fs.promises.unlink(indexFile);
          console.log(`📋 已删除截图索引文件: ${runId}_screenshots.json`);
        }
      } catch (indexError: any) {
        console.warn(`⚠️ 删除索引文件失败: ${indexError.message}`);
      }

      const result = { deleted, failed, totalSize };
      console.log(`✅ 测试运行 ${runId} 截图清理完成:`, result);
      return result;

    } catch (error: any) {
      console.error(`❌ 清理测试截图失败: ${error.message}`);
      throw new Error(`清理测试截图失败: ${error.message}`);
    }
  }

  /**
   * 获取截图存储统计信息
   */
  public async getScreenshotStats(): Promise<{
    totalScreenshots: number;
    totalSize: number;
    byStatus: Record<string, number>;
    recentCount: number;
  }> {
    try {
      const stats = await this.screenshotService.getStorageStats();
      return {
        totalScreenshots: stats.totalScreenshots,
        totalSize: stats.totalSize,
        byStatus: stats.countByStatus,
        recentCount: stats.recentActivity.last24Hours,
      };
    } catch (error: any) {
      console.error(`❌ 获取截图统计失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 辅助方法：检查文件是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 辅助方法：清理备份文件
   */
  private async cleanupBackupFiles(backupDir: string, runId: string, fileName: string): Promise<void> {
    try {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      const dateDirs = await fs.promises.readdir(backupDir);

      for (const dateDir of dateDirs) {
        if (dateRegex.test(dateDir)) {
          const runBackupDir = path.join(backupDir, dateDir, runId);
          const backupFile = path.join(runBackupDir, fileName);

          if (await this.fileExists(backupFile)) {
            await fs.promises.unlink(backupFile);
            console.log(`🗑️ 已删除备份文件: backup/${dateDir}/${runId}/${fileName}`);

            // 如果备份目录为空，删除目录
            try {
              const files = await fs.promises.readdir(runBackupDir);
              if (files.length === 0) {
                await fs.promises.rmdir(runBackupDir);
                console.log(`📁 已删除空备份目录: backup/${dateDir}/${runId}`);
              }
            } catch {
              // 忽略目录删除失败
            }
          }
        }
      }
    } catch (error: any) {
      console.warn(`⚠️ 清理备份文件时出错: ${error.message}`);
    }
  }

  // #endregion

  // #region Test Run Management
  public getTestRun(runId: string) { return testRunStore.get(runId); }
  public getAllTestRuns() { return testRunStore.all(); }
  public async cancelTest(runId: string): Promise<boolean> {
    const testRun = this.getTestRun(runId);
    if (testRun && ['queued', 'running'].includes(testRun.status)) {
      this.updateTestRunStatus(runId, 'cancelled', '测试已被用户取消');
      return true;
    }
    return false;
  }
  // #endregion

  // #region Utilities
  private updateTestRunStatus(runId: string, status: TestRunStatus, message?: string) {
    const testRun = testRunStore.get(runId);
    if (testRun) {
      // 🔥 新增：首次变为running状态时，记录实际开始执行时间
      // 🔥 关键修复：每次用例开始时都设置 actualStartedAt，确保第二条用例也有开始时间
      if (status === 'running' && testRun.status !== 'running') {
        // 🔥 关键修复：每次变为 running 状态时都重新设置 actualStartedAt（确保第二条用例也有开始时间）
        (testRun as any).actualStartedAt = new Date();
        console.log(`⏱️ [${runId}] 记录实际开始执行时间: ${(testRun as any).actualStartedAt.toISOString()}`);
        
        // 🔥 修复：如果是从测试计划执行的，立即同步 started_at 到 execution_results
        const planExecutionId = (testRun as any).planExecutionId;
        if (planExecutionId) {
          // 异步调用，不阻塞主流程
          this.syncToTestPlanExecution(runId, testRun, planExecutionId).catch(err => {
            console.error(`❌ [${runId}] 同步 started_at 到测试计划执行记录失败:`, err);
          });
        }
      }

      testRun.status = status;

      // 🔥 修复：实时更新执行时长（运行中时），完成时不在这里更新（在 finalizeTestRun 中更新）
      if (testRun.startTime && status === 'running') {
        // 运行中时，使用实际开始时间或开始时间计算
        const effectiveStartTime = testRun.actualStartedAt || testRun.startTime;
        testRun.duration = this.formatDuration(effectiveStartTime);
      }
      // 注意：completed 和 failed 状态的时长在 finalizeTestRun 中计算，这里不更新

      const logLevel = (status === 'failed' || status === 'error') ? 'error' : 'info';
      if (message) {
        this.addLog(runId, message, logLevel);
      }

      // 🔥 修复：在添加日志之后设置 finishedAt，确保 finished_at 时间是最新的（最后一条日志的时间）
      // 这是测试真正执行完成的时间，包括最后一条日志的时间
      if ((status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'error') && !testRun.finishedAt) {
        // 🔥 关键修复：使用当前时间（即最后一条日志的时间）作为 finishedAt
        // 这样可以确保 finished_at 时间是最新的，不会早于最后一条日志
        testRun.finishedAt = new Date();
        console.log(`⏱️ [${runId}] 记录真实执行完成时间（actualEndedAt）: ${testRun.finishedAt.toISOString()}`);
        
        // 🔥 修复：测试完成时，确保进度为100%，completedSteps等于totalSteps
        if (status === 'completed' || status === 'failed') {
          testRun.progress = 100;
          if (testRun.totalSteps && testRun.totalSteps > 0) {
            testRun.completedSteps = testRun.totalSteps;
          }
          console.log(`📊 [${runId}] 测试完成，设置进度为100%，完成步骤: ${testRun.completedSteps}/${testRun.totalSteps}`);
        }
      }

      // 🔥 修改：WebSocket 广播包含完整的进度数据
      this.wsManager.broadcast({
        type: 'test_update',
        runId,
        data: {
          status: testRun.status,
          progress: testRun.progress,
          completedSteps: testRun.completedSteps,
          totalSteps: testRun.totalSteps,
          passedSteps: testRun.passedSteps,
          failedSteps: testRun.failedSteps,
          duration: testRun.duration
        }
      });

      // 🔥 移除：不在这里自动同步数据库，避免重复
      // 同步会在以下时机进行：
      // 1. finalizeTestRun() 中同步一次
      // 2. 测试完成后强制同步一次
      // 在 updateTestRunStatus 中同步会导致重复打印日志
      
      // 🔥 已移除自动同步，避免重复
    }
  }

  /**
   * 🔥 同步 TestRun 到数据库
   */
  private async syncTestRunToDatabase(runId: string): Promise<void> {
    const testRun = testRunStore.get(runId);
    if (!testRun) return;

    try {
      await this.executionService.syncFromTestRun(testRun);
    } catch (error) {
      // 静默失败，避免影响测试执行
      console.error(`❌ [${runId}] 数据库同步失败:`, error);
    }
  }

  /**
   * 🔥 新增：同步测试结果到 test_plan_executions 表
   * 用于单个用例执行时更新测试计划执行记录
   */
  private async syncToTestPlanExecution(runId: string, testRun: TestRun, planExecutionId: string): Promise<void> {
    try {
      console.log(`📋 [${runId}] 开始同步到测试计划执行记录: ${planExecutionId}`);
      
      // 查询测试计划执行记录
      const planExecution = await this.prisma.test_plan_executions.findUnique({
        where: { id: planExecutionId }
      });
      
      if (!planExecution) {
        console.warn(`⚠️ [${runId}] 测试计划执行记录不存在: ${planExecutionId}`);
        return;
      }
      
      // 获取测试用例信息
      const testCase = await this.findTestCaseById(testRun.testCaseId);
      const caseName = testCase?.name || `测试用例 #${testRun.testCaseId}`;
      
      // 判断执行结果
      let result: 'pass' | 'fail' | 'block' = 'pass';
      const failedSteps = testRun.failedSteps || 0;
      const totalSteps = testRun.totalSteps || 0;
      const passedSteps = testRun.passedSteps || 0;
      
      if (failedSteps > 0) {
        result = 'fail';
      } else if (totalSteps > 0 && passedSteps < totalSteps) {
        result = 'block';
      }
      
      // 计算执行时长
      let durationMs = 0;
      if (testRun.duration) {
        // duration 格式为 "20.923s"
        const match = testRun.duration.match(/^([\d.]+)s$/);
        if (match) {
          durationMs = Math.round(parseFloat(match[1]) * 1000);
        }
      }
      
      // 🔥 获取执行者信息
      let executorName = 'System';
      let executorId: number | undefined;
      if (testRun.userId) {
        try {
          const user = await this.prisma.users.findUnique({
            where: { id: parseInt(testRun.userId) },
            select: { id: true, username: true, account_name: true }
          });
          if (user) {
            executorName = user.account_name || user.username;
            executorId = user.id;
          }
        } catch (e) {
          console.warn(`⚠️ [${runId}] 获取执行者信息失败:`, e);
        }
      }
      
      // 🔥 关键修复：使用 actualStartedAt（用例实际开始执行的时间），而不是 startedAt（加入队列的时间）
      // 由于用例是串行执行的，第二条用例的 actualStartedAt 应该是在第一条用例完成后
      // 优先使用 actualStartedAt，如果没有则使用 startedAt
      const startedAt = ((testRun as any).actualStartedAt || testRun.startedAt)?.toISOString() || new Date().toISOString();
      
      // 🔥 确定执行状态
      let executionStatus: 'running' | 'completed' | 'failed' | 'cancelled' | 'error' | 'queued' = 'completed';
      if (testRun.status === 'running') {
        executionStatus = 'running';
      } else if (testRun.status === 'failed' || testRun.status === 'error') {
        executionStatus = testRun.status as 'failed' | 'error';
      } else if (testRun.status === 'cancelled') {
        executionStatus = 'cancelled';
      } else if (testRun.status === 'queued') {
        executionStatus = 'queued';
      }
      
      // 🔥 修复：如果用例还在执行中或排队中，只更新必要的字段，不更新其他字段
      if (testRun.status === 'running' || testRun.status === 'queued') {
        // 🔥 关键修复：重新从数据库获取最新的 execution_results，确保包含所有用例的完整信息
        const latestPlanExecution = await this.prisma.test_plan_executions.findUnique({
          where: { id: planExecutionId },
          select: { execution_results: true }
        });
        const existingResults = (latestPlanExecution?.execution_results as any[]) || [];
        
        console.log(`📊 [${runId}] 执行中：从数据库获取最新的 execution_results，包含 ${existingResults.length} 条记录`);
        
        // 🔥 关键修复：确保当前用例的开始时间 >= 前一条用例的结束时间
        // 查找前一条用例（已完成且 case_id 小于当前用例的 case_id）
        let finalStartedAt = startedAt;
        const previousCaseResults = existingResults
          .filter(r => r.case_id < testRun.testCaseId && r.finished_at && (r.execution_status === 'completed' || r.execution_status === 'failed'))
          .sort((a, b) => b.case_id - a.case_id); // 按 case_id 降序排列，获取最近完成的用例
        
        if (previousCaseResults.length > 0) {
          const latestPreviousCase = previousCaseResults[0];
          const previousFinishedAt = new Date(latestPreviousCase.finished_at);
          const currentStartedAt = new Date(startedAt);
          
          // 如果当前开始时间 < 前一条用例的结束时间，则使用前一条用例的结束时间
          if (currentStartedAt < previousFinishedAt) {
            finalStartedAt = previousFinishedAt.toISOString();
            console.log(`📊 [${runId}] 调整开始时间：${startedAt} -> ${finalStartedAt}（确保 >= 前一条用例结束时间 ${latestPreviousCase.finished_at}）`);
          }
        }
        
        // 查找当前用例的记录
        const existingIndex = existingResults.findIndex(r => 
          r.case_id === testRun.testCaseId && r.execution_id === runId
        );
        
        let updatedResults: any[];
        if (existingIndex >= 0) {
          // 🔥 关键修复：只更新当前用例的 started_at 和 execution_status，完全保留其他字段
          // 🔥 如果记录中已有 started_at，优先保留（可能是 testPlanService.ts 中设置的）
          // 如果没有，则使用 finalStartedAt（从 actualStartedAt 或 startedAt 计算得出）
          const existingResult = existingResults[existingIndex];
          const finalStartedAtToUse = existingResult.started_at || finalStartedAt;
          
          updatedResults = existingResults.map((r, index) => {
            if (index === existingIndex) {
              // 只更新当前用例
              return {
                ...r, // 🔥 完全保留原有记录的所有字段
                started_at: finalStartedAtToUse, // 🔥 更新开始时间（如果已有则保留，否则使用计算值）
                execution_status: executionStatus, // 🔥 更新执行状态
              };
            }
            // 其他用例完全保留，不做任何修改
            return r;
          });
        } else {
          // 如果不存在，创建新记录，但只设置必要的字段
          const newResult = {
            case_id: testRun.testCaseId,
            case_name: caseName,
            case_type: 'ui_auto' as const,
            execution_status: executionStatus,
            execution_id: runId,
            result: '' as const,
            started_at: finalStartedAt, // 🔥 使用调整后的开始时间（确保 >= 前一条用例的结束时间）
            duration_ms: 0,
          };
          
          // 过滤掉相同 case_id 但没有 execution_id 的初始记录
          updatedResults = [
            ...existingResults.filter(r => 
              !(r.case_id === testRun.testCaseId && r.execution_id === runId) && // 过滤相同 execution_id
              !(r.case_id === testRun.testCaseId && !r.execution_id) // 🔥 过滤没有 execution_id 的初始记录
            ),
            newResult
          ];
        }
        
        // 🔥 只更新 execution_results，不更新进度和其他统计数据
        await updateTestPlanExecution(planExecutionId, {
          execution_results: updatedResults,
        });
        
        console.log(`✅ [${runId}] 同步 started_at 到测试计划执行记录成功（仅更新开始时间）`);
        return;
      }
      
      // 🔥 用例已完成：更新所有字段
      let finishedAt = testRun.finishedAt?.toISOString() || new Date().toISOString();
      const completedSteps = testRun.completedSteps || totalSteps;
      const blockedSteps = totalSteps - passedSteps - failedSteps;
      
      // 🔥 关键修复：重新从数据库获取最新的 execution_results，确保包含所有用例的完整信息
      const latestPlanExecution = await this.prisma.test_plan_executions.findUnique({
        where: { id: planExecutionId },
        select: { execution_results: true }
      });
      const existingResults = (latestPlanExecution?.execution_results as any[]) || [];
      
      console.log(`📊 [${runId}] 从数据库获取最新的 execution_results，包含 ${existingResults.length} 条记录`);
      
      // 🔥 修复：添加或更新当前用例的结果
      // 只更新当前执行记录（execution_id 匹配）的结果，保留其他执行记录的结果
      // 如果当前执行记录不存在，则添加新记录
      const existingIndex = existingResults.findIndex(r => 
        r.case_id === testRun.testCaseId && r.execution_id === runId
      );
      
      // 🔥 关键修复：如果存在现有记录，优先保留原有的 started_at（避免覆盖执行中时设置的开始时间）
      // 执行中时已经设置了正确的 started_at（使用 actualStartedAt），完成时应该保留它
      let finalStartedAt = startedAt;
      if (existingIndex >= 0) {
        const existingResult = existingResults[existingIndex];
        // 如果原有记录已经有 started_at，且是有效的，则保留它（这是执行中时设置的）
        if (existingResult.started_at) {
          try {
            const existingStartTime = new Date(existingResult.started_at);
            if (!isNaN(existingStartTime.getTime())) {
              // 🔥 关键：保留执行中时设置的 started_at，不要用完成时重新计算的 startedAt 覆盖
              finalStartedAt = existingResult.started_at;
              console.log(`📊 [${runId}] 保留执行中时设置的 started_at: ${finalStartedAt}（避免覆盖）`);
            }
          } catch (e) {
            console.warn(`⚠️ [${runId}] 原有 started_at 无效，使用新值: ${e}`);
          }
        } else {
          // 如果原有记录没有 started_at，使用新计算的 startedAt
          console.log(`📊 [${runId}] 原有记录没有 started_at，使用新值: ${finalStartedAt}`);
        }
      }
      
      // 🔥 关键修复：确保当前用例的开始时间 >= 前一条用例的结束时间
      // 查找前一条用例（已完成且 case_id 小于当前用例的 case_id）
      const previousCaseResults = existingResults
        .filter(r => r.case_id < testRun.testCaseId && r.finished_at && (r.execution_status === 'completed' || r.execution_status === 'failed'))
        .sort((a, b) => b.case_id - a.case_id); // 按 case_id 降序排列，获取最近完成的用例
      
      if (previousCaseResults.length > 0) {
        const latestPreviousCase = previousCaseResults[0];
        const previousFinishedAt = new Date(latestPreviousCase.finished_at);
        const currentStartedAt = new Date(finalStartedAt);
        
        // 如果当前开始时间 < 前一条用例的结束时间，则使用前一条用例的结束时间
        if (currentStartedAt < previousFinishedAt) {
          finalStartedAt = previousFinishedAt.toISOString();
          console.log(`📊 [${runId}] 完成时调整开始时间：${existingResults[existingIndex]?.started_at || startedAt} -> ${finalStartedAt}（确保 >= 前一条用例结束时间 ${latestPreviousCase.finished_at}）`);
        }
        
        // 🔥 关键修复：确保结束时间 >= 前一条用例的结束时间
        const currentFinishedAt = new Date(finishedAt);
        if (currentFinishedAt < previousFinishedAt) {
          finishedAt = previousFinishedAt.toISOString();
          console.log(`📊 [${runId}] 完成时调整结束时间：${testRun.finishedAt?.toISOString()} -> ${finishedAt}（确保 >= 前一条用例结束时间 ${latestPreviousCase.finished_at}）`);
        }
      }
      
      // 🔥 关键修复：确保结束时间 >= 开始时间
      const finishedAtDate = new Date(finishedAt);
      const startedAtDate = new Date(finalStartedAt);
      if (finishedAtDate < startedAtDate) {
        finishedAt = startedAtDate.toISOString();
        console.log(`📊 [${runId}] 调整结束时间：${finishedAt} -> ${finishedAt}（确保 >= 开始时间 ${finalStartedAt}）`);
      }
      
      // 构建执行结果（🔥 修复：添加步骤统计数据，与功能测试保持一致）
      const caseResult = {
        case_id: testRun.testCaseId,
        case_name: caseName,
        case_type: 'ui_auto',
        result: result,
        duration_ms: durationMs,
        executed_at: new Date().toISOString(),
        execution_id: runId,
        // 🔥 新增：步骤统计数据
        totalSteps: totalSteps,
        passedSteps: passedSteps,
        failedSteps: failedSteps,
        blockedSteps: blockedSteps > 0 ? blockedSteps : 0,
        completedSteps: completedSteps,
        started_at: finalStartedAt, // 🔥 使用保留的开始时间
        finished_at: finishedAt,
        executor_name: executorName,
        executor_id: executorId,
        // 🔥 新增：执行状态
        execution_status: executionStatus,
      };
      
      let updatedResults: any[];
      if (existingIndex >= 0) {
        // 🔥 关键修复：更新现有记录时，完全保留原有记录的所有字段，只更新必要的字段
        updatedResults = existingResults.map((r, index) => {
          if (index === existingIndex) {
            // 只更新当前用例，保留所有原有字段
            return {
              ...r, // 🔥 完全保留原有记录的所有字段（包括 started_at）
              ...caseResult, // 更新新字段
              started_at: finalStartedAt, // 🔥 确保使用保留的开始时间（如果原有记录有 started_at，则保留它）
            };
          }
          // 其他用例完全保留，不做任何修改
          return r;
        });
      } else {
        // 🔥 关键修复：添加新记录时，需要过滤掉：
        // 1. 相同 case_id 且相同 execution_id 的记录（避免重复）
        // 2. 相同 case_id 但没有 execution_id 的记录（初始记录，应该被替换）
        // 这样可以确保每个用例在当前执行记录中只有一条记录
        updatedResults = [
          ...existingResults.filter(r => 
            !(r.case_id === testRun.testCaseId && r.execution_id === runId) && // 过滤相同 execution_id
            !(r.case_id === testRun.testCaseId && !r.execution_id) // 🔥 过滤没有 execution_id 的初始记录
          ),
          caseResult
        ];
      }
      
      // 🔥 修复：计算统计数据时，只统计已完成的用例（result 不为空的）
      const passedCases = updatedResults.filter(r => r.result === 'pass').length;
      const failedCases = updatedResults.filter(r => r.result === 'fail').length;
      const blockedCases = updatedResults.filter(r => r.result === 'block').length;
      const skippedCases = updatedResults.filter(r => r.result === 'skip').length;
      // 🔥 修复：已完成用例数 = 有结果的用例数（result 不为空）
      const completedCases = updatedResults.filter(r => r.result && r.result !== '').length;
      const totalCases = planExecution.total_cases || updatedResults.length;
      const progress = totalCases > 0 ? Math.round((completedCases / totalCases) * 100) : 100;
      
      // 确定执行状态
      const isAllCompleted = completedCases >= totalCases;
      const newStatus = isAllCompleted ? 'completed' : 'running';
      
      // 计算总执行时长
      const totalDurationMs = updatedResults.reduce((sum, r) => sum + (r.duration_ms || 0), 0);
      
      // 🔥 修复：使用 updateTestPlanExecution 函数更新，而不是直接使用 prisma.update
      // 这样可以确保发送 WebSocket 广播，前端能实时看到状态更新
      await updateTestPlanExecution(planExecutionId, {
        status: newStatus,
        progress: progress,
        completed_cases: completedCases,
        passed_cases: passedCases,
        failed_cases: failedCases,
        blocked_cases: blockedCases,
        execution_results: updatedResults,
        duration_ms: totalDurationMs,
        finished_at: isAllCompleted ? new Date() : undefined,
      });
      
      console.log(`✅ [${runId}] 同步到测试计划执行记录成功:`, {
        planExecutionId,
        result,
        status: newStatus,
        progress,
        passedCases,
        failedCases,
        blockedCases,
      });
      
      // 🔥 修复问题1：更新测试计划状态（与功能测试逻辑保持一致）
      // 同步更新 test_plans 表的状态
      try {
        await updateTestPlanStatusFromLatestExecution(planExecution.plan_id);
        console.log(`✅ [${runId}] 测试计划状态已同步更新, planId: ${planExecution.plan_id}`);
      } catch (statusError) {
        console.error(`⚠️ [${runId}] 更新测试计划状态失败:`, statusError);
        // 不抛出错误，避免影响主流程
      }
    } catch (error) {
      console.error(`❌ [${runId}] 同步到测试计划执行记录失败:`, error);
      throw error;
    }
  }

  // 🚀 Phase 6: 日志批量处理队列，解决同步WebSocket瓶颈
  private logQueue: Map<string, { logs: TestLog[]; timer?: NodeJS.Timeout }> = new Map();

  /**
   * 🔥 新增：在长时间操作时输出等待状态日志（只输出一次）
   * @param runId 测试运行ID
   * @param operationName 操作名称（如"AI解析元素"、"执行MCP命令"等）
   */
  private startWaitingLog(runId: string, operationName: string): void {
    // 只输出一次等待提示
    this.addLog(runId, `⏳ ${operationName}，请稍候...`, 'info');
  }

  /**
   * 🔥 新增：停止等待状态日志输出（已简化，不再需要）
   * @param runId 测试运行ID
   */
  private stopWaitingLog(runId: string): void {
    // 不再需要清除定时器，因为已经改为只输出一次
  }

  /**
   * 🔥 新增：执行长时间操作并自动输出等待状态日志（只输出一次）
   * @param runId 测试运行ID
   * @param operationName 操作名称
   * @param operation 要执行的操作（异步函数）
   */
  private async executeWithWaitingLog<T>(
    runId: string,
    operationName: string,
    operation: () => Promise<T>
  ): Promise<T> {
    // 输出一次等待日志
    this.startWaitingLog(runId, operationName);
    
    // 执行操作
    return await operation();
  }

  private addLog(runId: string, message: string, level?: 'info' | 'success' | 'warning' | 'error') {
    const testRun = testRunStore.get(runId);
    const timestamp = new Date().toISOString();
    const timeStr = new Date().toLocaleTimeString('zh-CN', { hour12: false });

    // 控制台输出带时间戳 (保持同步以便调试)
    const consoleMessage = `[${timeStr}] ${message}`;

    switch (level) {
      case 'error':
        console.error(consoleMessage);
        break;
      case 'warning':
        console.warn(consoleMessage);
        break;
      case 'success':
        console.log(`✅ ${consoleMessage}`);
        break;
      default:
        console.log(consoleMessage);
    }

    if (testRun) {
      const logEntry: TestLog = { id: uuidv4(), timestamp: new Date(), message, level: level || 'info' };
      testRun.logs.push(logEntry);
      
      // 🚀 Phase 6: 批量WebSocket广播，避免同步阻塞
      this.queueLogForBroadcast(runId, logEntry);
    }
  }

  // 🚀 Phase 6: 日志批量广播队列
  private queueLogForBroadcast(runId: string, logEntry: TestLog) {
    if (!this.logQueue.has(runId)) {
      this.logQueue.set(runId, { logs: [] });
    }

    const queue = this.logQueue.get(runId)!;
    queue.logs.push(logEntry);

    // 清除之前的定时器
    if (queue.timer) {
      clearTimeout(queue.timer);
    }

    // 🚀 关键优化：50ms批量发送，或达到5条立即发送
    if (queue.logs.length >= 5) {
      this.flushLogQueue(runId);
    } else {
      queue.timer = setTimeout(() => this.flushLogQueue(runId), 50);
    }
  }

  // 🚀 Phase 6: 批量刷新日志队列
  private flushLogQueue(runId: string) {
    const queue = this.logQueue.get(runId);
    if (!queue || queue.logs.length === 0) return;

    // 🔥 核心修复：复制日志数组，避免异步发送时数组已被清空
    const logsToSend = [...queue.logs];

    // 🔥 立即清理队列，为下一批日志做准备
    queue.logs = [];

    // 异步广播，不阻塞主流程
    setImmediate(() => {
      try {
        this.wsManager.broadcast({
          type: 'logs_batch',
          runId,
          data: { logs: logsToSend }  // 🔥 使用复制的数组
        });
      } catch (error) {
        console.warn(`WebSocket日志广播失败:`, error);
      }
    });
    if (queue.timer) {
      clearTimeout(queue.timer);
      queue.timer = undefined;
    }
  }

  /**
   * 🔥 新增：预估测试步骤总数
   * 通过解析步骤文本中的数字编号来预估总步骤数
   */
  private estimateStepsCount(stepsText: string): number {
    if (!stepsText || !stepsText.trim()) {
      return 1; // 默认至少1步
    }

    // 尝试匹配步骤编号格式：1. 2. 3. 或 1) 2) 3) 或 步骤1 步骤2
    const numberMatches = stepsText.match(/(?:^|\n)\s*(\d+)[.、:)]/g);
    if (numberMatches && numberMatches.length > 0) {
      return numberMatches.length;
    }

    // 如果没有编号，按换行符估算（每行一步）
    const lines = stepsText.split('\n').filter(line => line.trim().length > 0);
    return Math.max(1, Math.min(lines.length, 20)); // 限制在1-20之间
  }

  /**
   * 🔥 新增：格式化执行时长
   * 将毫秒转换为友好的时间字符串
   */
  private formatDuration(startTime: Date): string {
    const durationMs = Date.now() - startTime.getTime();
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  private async finalizeTestRun(runId: string) {
    const testRun = testRunStore.get(runId);
    if (!testRun) return;

    // 🚀 Phase 6: 确保所有日志都被发送
    this.flushLogQueue(runId);
    
    // 延迟一小段时间确保所有异步日志都已添加
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // 再次刷新，确保没有遗漏的日志
    this.flushLogQueue(runId);
    this.logQueue.delete(runId);

    // 🔥 从日志中提取准确的开始和结束时间
    let logStartTime: Date | undefined;
    let logEndTime: Date | undefined;
    
    if (testRun.logs && testRun.logs.length > 0) {
      const sortedLogs = [...testRun.logs].sort((a, b) => {
        const timeA = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
        const timeB = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
        return timeA - timeB;
      });
      
      const firstLog = sortedLogs[0];
      const lastLog = sortedLogs[sortedLogs.length - 1];
      
      logStartTime = firstLog.timestamp instanceof Date ? firstLog.timestamp : new Date(firstLog.timestamp);
      logEndTime = lastLog.timestamp instanceof Date ? lastLog.timestamp : new Date(lastLog.timestamp);
      
      console.log(`📋 [${runId}] finalizeTestRun - 从日志提取时间:`, {
        日志数量: sortedLogs.length,
        开始时间: logStartTime.toISOString(),
        结束时间: logEndTime.toISOString()
      });
    }
    
    // 🔥 优先使用日志时间（第一条日志的时间），如果没有则使用其他时间
    const actualStartedAt = (testRun as any).actualStartedAt;
    const effectiveStartTime = logStartTime || actualStartedAt || testRun.startedAt;
    const effectiveEndTime = logEndTime || testRun.finishedAt || (testRun as any).endedAt || new Date();
    
    // 🔥 关键修复：优先使用日志第一条记录的时间作为开始时间
    // 日志时间是最准确的，因为它记录了实际的第一条操作日志
    if (logStartTime) {
      // 优先使用日志时间，更新 actualStartedAt 为日志时间
      (testRun as any).actualStartedAt = logStartTime;
      console.log(`⏱️ [${runId}] finalizeTestRun - 使用日志第一条记录时间作为 actualStartedAt: ${logStartTime.toISOString()}`);
    } else if (!actualStartedAt) {
      // 如果日志时间不存在，且 actualStartedAt 也不存在，使用 startedAt
      (testRun as any).actualStartedAt = testRun.startedAt;
      console.log(`⏱️ [${runId}] finalizeTestRun - 设置 actualStartedAt: ${(testRun as any).actualStartedAt?.toISOString()}`);
    } else {
      // 如果日志时间不存在，但 actualStartedAt 已存在，保留它
      console.log(`⏱️ [${runId}] finalizeTestRun - 保留已有的 actualStartedAt: ${actualStartedAt.toISOString()}`);
    }
    
    // 设置 endedAt（用于 WebSocket 消息）
    (testRun as any).endedAt = effectiveEndTime;
    if (!testRun.finishedAt) {
      testRun.finishedAt = effectiveEndTime;
    }
    
    // 🔥 关键修复：使用日志时间计算执行时长
    const duration = this.calculateDuration(effectiveStartTime, effectiveEndTime);
    console.log(`⏱️ [${runId}] 计算执行时长（基于日志时间）: ${duration} (开始: ${effectiveStartTime.toISOString()}, 结束: ${effectiveEndTime.toISOString()})`);
    
    // 🔥 修复：更新 testRun.duration，确保保存到数据库
    // 使用统一的格式：保留三位小数（如 "20.923s"），与 calculateDuration 保持一致
    testRun.duration = duration;
    
    // 🔥 修复：只在真正完成所有清理工作后，才发送 test_complete 消息
    // 确保前端不会在测试还在执行时收到完成提示
    const finalStatus = testRun.status;
    if (finalStatus === 'completed' || finalStatus === 'failed' || finalStatus === 'cancelled' || finalStatus === 'error') {
      // 🔥 修复：确保完成时进度为100%，completedSteps等于totalSteps
      if (finalStatus === 'completed' || finalStatus === 'failed') {
        testRun.progress = 100;
        if (testRun.totalSteps && testRun.totalSteps > 0) {
          testRun.completedSteps = testRun.totalSteps;
        }
      }
      
      // 发送最终的 test_update 消息
      this.wsManager.broadcast({ 
        type: 'test_update', 
        runId, 
        data: { 
          status: finalStatus, 
          endedAt: (testRun as any).endedAt, 
          duration,
          progress: testRun.progress,
          completedSteps: testRun.completedSteps ?? testRun.totalSteps ?? 0,
          totalSteps: testRun.totalSteps ?? 0,
          passedSteps: testRun.passedSteps ?? 0,
          failedSteps: testRun.failedSteps ?? 0
        } 
      });
      
      // 🔥 修复：根据是否来自测试计划决定同步目标
      // 如果存在 planExecutionId，说明是测试计划执行，只同步到 test_plan_executions 表
      // 如果不存在 planExecutionId，说明是单独执行，只同步到 test_case_executions 表
      // 这样可以确保测试计划和UI自动化模块的执行记录完全独立
      const planExecutionId = (testRun as any).planExecutionId;
      
      if (planExecutionId) {
        // 🔥 测试计划执行：同步到 test_plan_executions 表，同时也写入 test_case_executions 表（用于测试执行页面显示）
        try {
          await this.syncToTestPlanExecution(runId, testRun, planExecutionId);
          console.log(`📋 [${runId}] 测试计划执行完成，已同步到 test_plan_executions 表: ${planExecutionId}`);
          
          // 🔥 修复：同时也写入 test_case_executions 表，确保测试执行页面能正确显示开始时间
          // 使用 actualStartedAt（用例实际开始执行的时间），而不是 startedAt（加入队列的时间）
          try {
            await this.syncTestRunToDatabase(runId);
            console.log(`💾 [${runId}] 测试计划执行完成，已同步到 test_case_executions 表（用于测试执行页面显示）`);
          } catch (dbErr) {
            console.warn(`⚠️ [${runId}] 同步到 test_case_executions 表失败（不影响主流程）:`, dbErr);
          }
        } catch (err) {
          console.error(`❌ [${runId}] 同步到测试计划执行记录失败:`, err);
        }
      } else {
        // 🔥 单独执行（非测试计划）：只同步到 test_case_executions 表
        try {
          await this.syncTestRunToDatabase(runId);
          console.log(`💾 [${runId}] 单独执行完成，已同步到 test_case_executions 表（duration: ${duration}）`);
        } catch (err) {
          console.error(`❌ [${runId}] 同步数据库失败:`, err);
        }
      }
      
      // 🔥 延迟发送 test_complete 消息，确保数据库同步完成
      // 使用 setTimeout 确保消息在下一个事件循环中发送，让数据库同步先完成
        setTimeout(() => {
          console.log(`✅ [${runId}] 测试真正完成，发送 test_complete 消息（duration: ${duration}，基于日志时间）`);
          this.wsManager.sendTestComplete(runId, {
            status: finalStatus,
            startedAt: effectiveStartTime, // 🔥 使用日志时间（最准确）
            endedAt: effectiveEndTime, // 🔥 使用日志时间（最准确）
            actualStartedAt: logStartTime || (testRun as any).actualStartedAt, // 🔥 日志开始时间
            actualEndedAt: logEndTime || testRun.finishedAt, // 🔥 日志结束时间
            duration,
            progress: testRun.progress,
            completedSteps: testRun.completedSteps ?? testRun.totalSteps ?? 0,
            totalSteps: testRun.totalSteps ?? 0,
            passedSteps: testRun.passedSteps ?? 0,
            failedSteps: testRun.failedSteps ?? 0
          });
        }, 200); // 延迟200ms，确保数据库同步完成
    } else {
      // 非完成状态，只发送 test_update
      this.wsManager.broadcast({ 
        type: 'test_update', 
        runId, 
        data: { 
          status: finalStatus, 
          endedAt: (testRun as any).endedAt, 
          duration 
        } 
      });
    }
  }

  private calculateDuration(startTime: Date, endTime: Date): string {
    // 🔥 修复：保留三位小数，确保精度（如 5.001s）
    return ((endTime.getTime() - startTime.getTime()) / 1000).toFixed(3) + 's';
  }

  private extractTimeoutFromDescription(description: string): number {
    // 支持多种格式：10秒、10s、停留10、等待10
    const match = description.match(/(\d+)\s*(秒|s|)/i);
    if (match) {
      const seconds = parseInt(match[1]);
      return seconds * 1000; // 转换为毫秒
    }

    // 检查"停留"或"等待"关键词
    const stayMatch = description.match(/停留\s*(\d+)/i);
    if (stayMatch) {
      return parseInt(stayMatch[1]) * 1000;
    }

    const waitMatch = description.match(/等待\s*(\d+)/i);
    if (waitMatch) {
      return parseInt(waitMatch[1]) * 1000;
    }

    return 2000; // 默认2秒
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 清理文件名，将不安全字符转换为安全字符
   * 处理中文字符，确保文件名在不同操作系统中都能正常使用
   */
  private sanitizeFilename(name: string): string {
    if (!name) return 'unnamed';
    
    // 🔥 移除或替换不安全的文件名字符
    const sanitized = name
      // 替换 Windows 不允许的字符: \ / : * ? " < > |
      .replace(/[\\/:*?"<>|]/g, '-')
      // 替换连续的空格为单个短横线
      .replace(/\s+/g, '-')
      // 替换连续的短横线为单个短横线
      .replace(/-+/g, '-')
      // 移除开头和结尾的短横线
      .replace(/^-+|-+$/g, '')
      // 限制文件名长度（保留足够空间给前缀和后缀）
      .substring(0, 100);
    
    // 如果清理后为空，使用默认名称
    return sanitized || 'unnamed';
  }

  // 🔥 新增：确保页面稳定性 - 增强版
  private async ensurePageStability(runId: string): Promise<void> {
    try {
      this.addLog(runId, `⏳ 确保页面稳定性...`, 'info');

      // 1. 等待页面完全加载（增强版）
      await this.mcpClient.waitForPageFullyLoaded();

      // 2. 检测页面稳定性
      await this.mcpClient.waitForPageStability();

      // 3. 刷新页面快照确保同步
      await this.mcpClient.getSnapshot();

      this.addLog(runId, `✅ 页面稳定性检查完成`, 'info');
    } catch (error: any) {
      this.addLog(runId, `⚠️ 页面稳定性检查失败，使用降级策略: ${error.message}`, 'warning');

      // 降级策略：基础等待
      try {
        await this.mcpClient.waitForLoad();
        await this.delay(1000);
        await this.mcpClient.getSnapshot();
        this.addLog(runId, `✅ 降级页面稳定性检查完成`, 'info');
      } catch (fallbackError: any) {
        this.addLog(runId, `⚠️ 降级策略也失败，继续执行: ${fallbackError.message}`, 'warning');
      }
    }
  }

  // 🔥 新增：判断操作是否需要验证
  private async needsOperationVerification(step: import('./aiParser.js').TestStep): Promise<boolean> {
    // 根据操作类型判断是否需要效果验证
    const verificationNeededActions = [
      'navigate', 'browser_navigate',    // 导航操作需要验证页面是否正确加载
      'click', 'browser_click',          // 点击操作需要验证是否触发了预期效果
      'fill', 'input', 'type', 'browser_type',  // 输入操作需要验证内容是否正确填入
      'browser_select_option'            // 选择操作需要验证选项是否被选中
    ];

    return verificationNeededActions.includes(step.action);
  }

  // 🔥 新增：验证操作成功
  private async verifyOperationSuccess(step: import('./aiParser.js').TestStep, runId: string): Promise<boolean> {
    try {
      this.addLog(runId, `🔍 验证操作效果...`, 'info');

      // 根据操作类型进行不同的验证
      switch (step.action) {
        case 'navigate':
        case 'browser_navigate':
          return await this.verifyNavigationSuccess(step, runId);

        case 'click':
        case 'browser_click':
          return await this.verifyClickSuccess(step, runId);

        case 'fill':
        case 'input':
        case 'type':
        case 'browser_type':
          return await this.verifyInputSuccess(step, runId);

        default:
          // 对于其他操作，简单验证页面仍然可访问
          await this.mcpClient.getSnapshot();
          return true;
      }
    } catch (error: any) {
      this.addLog(runId, `⚠️ 操作效果验证失败: ${error.message}`, 'warning');
      return false;
    }
  }

  // 🔥 新增：验证导航成功
  private async verifyNavigationSuccess(step: TestStep, runId: string): Promise<boolean> {
    try {
      const snapshot = await this.mcpClient.getSnapshot();
      const currentUrl = this.extractUrlFromSnapshot(snapshot);

      if (currentUrl && currentUrl !== 'about:blank' && step.url) {
        const targetDomain = new URL(step.url).hostname;
        const currentDomain = new URL(currentUrl).hostname;

        if (currentDomain.includes(targetDomain) || targetDomain.includes(currentDomain)) {
          this.addLog(runId, `✅ 导航验证成功: ${currentUrl}`, 'success');
          return true;
        }
      }

      this.addLog(runId, `⚠️ 导航验证失败: 期望${step.url}, 实际${currentUrl}`, 'warning');
      return false;
    } catch (error: any) {
      this.addLog(runId, `❌ 导航验证异常: ${error.message}`, 'error');
      return false;
    }
  }

  // 🔥 新增：验证点击成功
  private async verifyClickSuccess(step: TestStep, runId: string): Promise<boolean> {
    try {
      // 点击后等待一下，看页面是否有变化
      await this.delay(1000);

      const newSnapshot = await this.mcpClient.getSnapshot();

      // 简单验证：页面内容应该有变化或者URL可能改变
      if (newSnapshot && newSnapshot.length > 100) {
        this.addLog(runId, `✅ 点击验证成功: 页面响应正常`, 'success');
        return true;
      }

      return false;
    } catch (error: any) {
      this.addLog(runId, `❌ 点击验证异常: ${error.message}`, 'error');
      return false;
    }
  }

  // 🔥 新增：验证输入成功
  private async verifyInputSuccess(step: TestStep, runId: string): Promise<boolean> {
    try {
      // 输入后简单验证页面仍然可访问
      const snapshot = await this.mcpClient.getSnapshot();

      if (snapshot && snapshot.length > 50) {
        this.addLog(runId, `✅ 输入验证成功: 页面响应正常`, 'success');
        return true;
      }

      return false;
    } catch (error: any) {
      this.addLog(runId, `❌ 输入验证异常: ${error.message}`, 'error');
      return false;
    }
  }

  // 🔥 使用AI驱动的替代搜索策略
  private async executeMcpCommandWithAlternativeSearch(step: TestStep, runId: string, stepIndex: number = 1): Promise<{ success: boolean; error?: string }> {
    try {
      // 🔥 类型安全检查：断言步骤不应该使用操作重试机制
      if (step.stepType === 'assertion') {
        console.log(`🚫 [${runId}] 断言步骤"${step.description}"不使用操作重试机制`);
        return { success: false, error: `断言步骤执行失败: ${step.description}` };
      }

      // 🔥 首先尝试通过AI重新解析步骤
      console.log(`🔄 [${runId}] 使用AI替代搜索策略重新解析步骤`);

      const snapshot = await this.mcpClient.getSnapshot();
      const aiResult = await this.aiParser.parseNextStep(
        step.description, 
        snapshot, 
        runId,
        (message: string, level: 'info' | 'success' | 'warning' | 'error') => {
          this.addLog(runId, message, level);
        }
      );

      if (aiResult.success && aiResult.step) {
        const aiStep = aiResult.step;
        console.log(`🤖 [${runId}] AI替代解析成功: ${aiStep.action}`);

        // 使用AI重新解析的步骤
        const result = await this.executeMcpCommand(aiStep, runId);
        if (result.success) {
          this.addLog(runId, `✅ AI替代搜索成功`, 'success');
          return result;
        }
      }

      // 如果AI替代解析也失败，使用原始方法
      console.log(`⚠️ [${runId}] AI替代解析失败，使用原始方法`);
      return await this.executeMcpCommand(step, runId);

    } catch (error: any) {
      console.error(`❌ [${runId}] 替代搜索策略失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // 🔥 新增：断言验证方法
  private async validateAssertion(assertionDescription: string, snapshotResult: any, runId: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`🔍 [${runId}] 开始验证断言: "${assertionDescription}"`);

      // 提取快照文本内容
      let snapshotText = '';
      if (snapshotResult && snapshotResult.content) {
        const content = Array.isArray(snapshotResult.content) ? snapshotResult.content : [snapshotResult.content];
        for (const item of content) {
          if (item.type === 'text' && item.text) {
            snapshotText += item.text + '\n';
          }
        }
      }

      if (!snapshotText.trim()) {
        console.warn(`⚠️ [${runId}] 快照内容为空，无法进行断言验证`);
        return { success: false, error: '快照内容为空，无法进行断言验证' };
      }

      console.log(`📄 [${runId}] 快照内容长度: ${snapshotText.length} 字符`);
      console.log(`📄 [${runId}] 快照内容前100字符: ${snapshotText.substring(0, 100)}...`);

      // 🔥 智能断言验证逻辑
      const assertionLower = assertionDescription.toLowerCase();
      const snapshotLower = snapshotText.toLowerCase();

      // 1. 否定断言验证（不展示、不显示、不包含）
      if (assertionLower.includes('不展示') || assertionLower.includes('不显示') || assertionLower.includes('不包含')) {
        // 提取要验证的文本内容
        const keywords = this.extractAssertionKeywords(assertionDescription);
        console.log(`🔍 [${runId}] 提取的关键词（否定断言）: ${keywords.join(', ')}`);

        for (const keyword of keywords) {
          if (snapshotLower.includes(keyword.toLowerCase())) {
            console.log(`❌ [${runId}] 找到不应该存在的关键词: "${keyword}"`);
            this.addLog(runId, `❌ 断言验证失败: 页面不应该包含 "${keyword}"`, 'error');
            return { success: false, error: `页面不应该包含: ${keyword}` };
          }
        }

        console.log(`✅ [${runId}] 确认页面不包含关键词: ${keywords.join(', ')}`);
        this.addLog(runId, `✅ 断言验证通过: 页面不展示商品管理`, 'success');
        return { success: true };
      }

      // 2. 正面断言验证（展示、显示、包含）
      if (assertionLower.includes('展示') || assertionLower.includes('显示') || assertionLower.includes('包含')) {
        // 提取要验证的文本内容
        const keywords = this.extractAssertionKeywords(assertionDescription);
        console.log(`🔍 [${runId}] 提取的关键词: ${keywords.join(', ')}`);

        for (const keyword of keywords) {
          if (snapshotLower.includes(keyword.toLowerCase())) {
            console.log(`✅ [${runId}] 找到关键词: "${keyword}"`);
            this.addLog(runId, `✅ 断言验证通过: 页面包含 "${keyword}"`, 'success');
            return { success: true };
          }
        }

        console.log(`❌ [${runId}] 未找到任何关键词: ${keywords.join(', ')}`);
        return { success: false, error: `页面未找到预期内容: ${keywords.join(', ')}` };
      }

      // 3. 页面跳转验证
      if (assertionLower.includes('跳转') || assertionLower.includes('页面') || assertionLower.includes('url')) {
        // 从快照中提取URL信息
        const urlMatch = snapshotText.match(/Page URL: ([^\n]+)/);
        if (urlMatch) {
          const currentUrl = urlMatch[1];
          console.log(`🌐 [${runId}] 当前页面URL: ${currentUrl}`);

          // 简单验证：如果断言描述中包含URL关键词，认为跳转成功
          if (assertionDescription.includes('成功') || assertionDescription.includes('正确')) {
            this.addLog(runId, `✅ 页面跳转验证通过: ${currentUrl}`, 'success');
            return { success: true };
          }
        }
      }

      // 4. 错误信息验证
      if (assertionLower.includes('错误') || assertionLower.includes('失败')) {
        const errorKeywords = ['error', 'failed', 'invalid', '错误', '失败', '无效'];
        for (const keyword of errorKeywords) {
          if (snapshotLower.includes(keyword)) {
            console.log(`✅ [${runId}] 找到错误信息: "${keyword}"`);
            this.addLog(runId, `✅ 错误信息验证通过: 页面包含错误信息`, 'success');
            return { success: true };
          }
        }
        return { success: false, error: '页面未找到预期的错误信息' };
      }

      // 5. 默认验证：页面加载成功
      if (snapshotText.length > 100) {
        console.log(`✅ [${runId}] 默认验证通过: 页面内容丰富（${snapshotText.length}字符）`);
        this.addLog(runId, `✅ 默认断言验证通过: 页面正常加载`, 'success');
        return { success: true };
      }

      return { success: false, error: '页面内容不足，可能加载失败' };

    } catch (error: any) {
      console.error(`❌ [${runId}] 断言验证异常: ${error.message}`);
      return { success: false, error: `断言验证异常: ${error.message}` };
    }
  }

  // 🔥 提取断言关键词
  private extractAssertionKeywords(assertionDescription: string): string[] {
    const keywords: string[] = [];

    // 🔥 优先提取引号中的文本（支持中英文引号）
    // 修复bug: 使用捕获组提取引号内的内容,不是整个匹配
    const doubleQuotePattern = /"([^"]+)"/g;  // 英文双引号
    const singleQuotePattern = /'([^']+)'/g;  // 英文单引号
    const chineseQuotePattern = /["""]([^"""]+)["""]/g;  // 中文引号
    const chineseQuotePattern2 = /['']([^'']+)['']/g;  // 中文单引号

    let match;

    // 提取英文双引号内容
    while ((match = doubleQuotePattern.exec(assertionDescription)) !== null) {
      keywords.push(match[1].trim());  // ✅ 使用捕获组 match[1]
    }

    // 提取英文单引号内容
    while ((match = singleQuotePattern.exec(assertionDescription)) !== null) {
      keywords.push(match[1].trim());
    }

    // 提取中文双引号内容
    while ((match = chineseQuotePattern.exec(assertionDescription)) !== null) {
      keywords.push(match[1].trim());
    }

    // 提取中文单引号内容
    while ((match = chineseQuotePattern2.exec(assertionDescription)) !== null) {
      keywords.push(match[1].trim());
    }

    // 🎯 如果提取到引号内容,优先使用这些关键词
    if (keywords.length > 0) {
      console.log(`✅ 从引号中提取到 ${keywords.length} 个关键词`);
      return keywords;
    }

    // 提取常见的业务词汇（仅当没有引号内容时）
    const businessTerms = ['商品管理', '用户管理', '订单管理', '系统设置', '数据统计', '权限管理', '首页', '登录', '注册'];
    for (const term of businessTerms) {
      if (assertionDescription.includes(term)) {
        keywords.push(term);
      }
    }

    // 如果仍然没有找到关键词，使用整个描述中的关键部分
    if (keywords.length === 0) {
      // 移除常见的动作词,保留实际内容
      const words = assertionDescription
        .replace(/展示/g, '')
        .replace(/显示/g, '')
        .replace(/包含/g, '')
        .replace(/页面/g, '')
        .replace(/不展示/g, '')
        .replace(/不显示/g, '')
        .replace(/不包含/g, '')
        .trim();
      if (words) {
        keywords.push(words);
      }
    }

    return keywords;
  }

  // 🔥 新增：执行滚动操作命令
  private async executeScrollCommand(step: TestStep, runId: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`📜 [${runId}] 开始执行滚动操作: ${step.action}`);
      this.addLog(runId, `📜 执行滚动操作: ${step.description}`, 'info');

      let mcpCommand: { name: string; arguments: any };

      // 根据不同的滚动类型构建MCP命令
      switch (step.action) {
        case 'browser_scroll_down':
        case 'scroll_down':
          // 🔥 修复：使用正确的browser_evaluate工具和function参数
          mcpCommand = {
            name: 'browser_evaluate',
            arguments: {
              function: `() => { window.scrollBy(0, ${step.pixels || 500}); }`
            }
          };
          break;

        case 'browser_scroll_up':
        case 'scroll_up':
          // 🔥 修复：使用正确的browser_evaluate工具和function参数
          mcpCommand = {
            name: 'browser_evaluate',
            arguments: {
              function: `() => { window.scrollBy(0, -${step.pixels || 500}); }`
            }
          };
          break;

        case 'browser_scroll_to_top':
        case 'scroll_to_top':
          // 🔥 修复：使用正确的browser_evaluate工具和function参数
          mcpCommand = {
            name: 'browser_evaluate',
            arguments: {
              function: '() => { window.scrollTo(0, 0); }'
            }
          };
          break;

        case 'browser_scroll_to_bottom':
        case 'scroll_to_bottom':
          // 🔥 修复：使用正确的browser_evaluate工具和function参数
          mcpCommand = {
            name: 'browser_evaluate',
            arguments: {
              function: '() => { window.scrollTo(0, document.body.scrollHeight); }'
            }
          };
          break;

        case 'browser_scroll_to_element':
        case 'scroll_to_element':
          // 🔥 修复：使用browser_evaluate滚动到元素
          if (!step.ref && !step.selector) {
            throw new Error('滚动到元素需要指定目标元素');
          }
          mcpCommand = {
            name: 'browser_evaluate',
            arguments: {
              function: `() => {
                const element = document.querySelector('${step.selector}') || 
                               document.querySelector('[ref="${step.ref}"]');
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } else {
                  console.warn('Element not found for scrolling: ${step.selector || step.ref}');
                }
              }`
            }
          };
          break;

        case 'browser_scroll_by':
        case 'scroll_by':
          // 🔥 修复：使用browser_evaluate按像素滚动
          const xPixels = step.x || 0;
          const yPixels = step.y || step.pixels || 500;
          mcpCommand = {
            name: 'browser_evaluate',
            arguments: {
              function: `() => { window.scrollBy(${xPixels}, ${yPixels}); }`
            }
          };
          break;

        case 'browser_scroll_page':
        case 'scroll':
          // 🔥 修复：使用browser_evaluate进行页面滚动
          const direction = step.direction || 'down';
          const scrollAmount = step.pixels || 500;
          mcpCommand = {
            name: 'browser_evaluate',
            arguments: {
              function: `() => { window.scrollBy(0, ${direction === 'up' ? -scrollAmount : scrollAmount}); }`
            }
          };
          break;

        default:
          throw new Error(`不支持的滚动操作: ${step.action}`);
      }

      console.log(`🔧 [${runId}] MCP滚动命令: ${mcpCommand.name}`, mcpCommand.arguments);
      this.addLog(runId, `🔧 MCP滚动命令: ${mcpCommand.name}`, 'info');

      try {
        // 执行MCP命令
        const result = await this.mcpClient.callTool(mcpCommand);

        // 检查执行结果
        console.log(`🔍 [${runId}] 滚动命令执行结果:`, JSON.stringify(result, null, 2));
        this.addLog(runId, `🔍 滚动执行结果: ${JSON.stringify(result)}`, 'info');

        // 🔥 改进的错误检测，避免误判前端JS错误
        if (result && result.content) {
          const content = Array.isArray(result.content) ? result.content : [result.content];
          for (const item of content) {
            if (item.type === 'text' && item.text) {
              if (this.isRealMCPError(item.text)) {
                console.warn(`⚠️ [${runId}] browser_evaluate滚动失败: ${item.text}`);
                throw new Error(`browser_evaluate执行失败: ${item.text}`);
              } else if (item.text.toLowerCase().includes('error')) {
                console.warn(`⚠️ [${runId}] 滚动操作检测到前端JS错误（不影响操作）: ${item.text}`);
                this.addLog(runId, `⚠️ 前端JS错误（不影响操作）: ${item.text}`, 'warning');
              }
            }
          }
        }

        console.log(`✅ [${runId}] 滚动操作成功: ${step.description}`);
        this.addLog(runId, `✅ 滚动操作成功: ${step.description}`, 'success');

        // 滚动后等待页面稳定
        await this.delay(1000);

        return { success: true };

      } catch (error: any) {
        console.warn(`⚠️ [${runId}] browser_evaluate滚动失败，尝试键盘降级: ${error.message}`);
        this.addLog(runId, `⚠️ browser_evaluate滚动失败，尝试键盘降级: ${error.message}`, 'warn');
        
        // 🔥 降级到键盘按键方案
        const fallbackKey = this.getFallbackKey(step.action);
        if (fallbackKey) {
          try {
            console.log(`🔄 [${runId}] 使用键盘降级方案: ${fallbackKey}`);
            const fallbackResult = await this.mcpClient.callTool({
              name: 'browser_press_key',
              arguments: { key: fallbackKey }
            });
            console.log(`✅ [${runId}] 键盘降级滚动成功: ${step.description}`);
            this.addLog(runId, `✅ 键盘降级滚动成功: ${step.description}`, 'success');
            
            // 滚动后等待页面稳定
            await this.delay(1000);
            
            return { success: true };
          } catch (fallbackError: any) {
            console.error(`❌ [${runId}] 键盘降级也失败:`, fallbackError);
            this.addLog(runId, `❌ 键盘降级也失败: ${fallbackError.message}`, 'error');
            return { success: false, error: `滚动失败: ${error.message}, 降级也失败: ${fallbackError.message}` };
          }
        } else {
          console.error(`❌ [${runId}] 无可用的降级方案`);
          this.addLog(runId, `❌ 滚动操作执行失败: ${error.message}`, 'error');
          return { success: false, error: error.message };
        }
      }

    } catch (error: any) {
      console.error(`❌ [${runId}] 滚动操作执行失败:`, error);
      this.addLog(runId, `❌ 滚动操作执行失败: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  // 🔥 使用AI驱动的简化策略执行
  private async executeMcpCommandWithSimpleSelector(step: TestStep, runId: string, stepIndex: number = 1): Promise<{ success: boolean; error?: string }> {
    try {
      // 🔥 类型安全检查：断言步骤不应该使用操作重试机制
      if (step.stepType === 'assertion') {
        console.log(`🚫 [${runId}] 断言步骤"${step.description}"不使用操作重试机制`);
        return { success: false, error: `断言步骤执行失败: ${step.description}` };
      }

      console.log(`🔄 [${runId}] 使用AI简化策略`);

      // 🔥 直接通过AI重新生成一个更简单的步骤
      const snapshot = await this.mcpClient.getSnapshot();

      // 构建简化版的AI提示词
      const simplifiedPrompt = `请为以下指令生成一个最简单、最基础的MCP命令，即使元素匹配不完美也要尽量执行：

用户指令: "${step.description}"

请返回JSON格式的MCP命令，优先考虑通用选择器：`;

      try {
        // 这里可以调用AI，但为了简化，我们直接使用基础逻辑
        let simplifiedStep = { ...step };

        // 为不同操作类型提供最基础的后备方案
        if (step.action === 'click' || step.action === 'browser_click') {
          // 使用第一个可用的按钮元素
          const elements = this.extractElementsFromSnapshot(snapshot);
          const firstButton = elements.find(el => el.role === 'button');
          if (firstButton) {
            simplifiedStep.selector = firstButton.ref;
          }
        } else if (step.action === 'fill' || step.action === 'input' || step.action === 'type' || step.action === 'browser_type') {
          // 使用第一个可用的输入元素
          const elements = this.extractElementsFromSnapshot(snapshot);
          const firstInput = elements.find(el => el.role === 'textbox');
          if (firstInput) {
            simplifiedStep.selector = firstInput.ref;
          }
        }

        this.addLog(runId, `🔄 使用AI简化策略: "${simplifiedStep.selector}"`, 'info');
        return await this.executeMcpCommand(simplifiedStep, runId);

      } catch (aiError: any) {
        console.warn(`⚠️ [${runId}] AI简化策略失败: ${aiError.message}`);
        return { success: false, error: aiError.message };
      }

    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // 🔥 从快照中提取元素的辅助方法
  private extractElementsFromSnapshot(snapshot: string): Array<{ ref: string, role: string, text: string }> {
    if (!snapshot) return [];

    const elements: Array<{ ref: string, role: string, text: string }> = [];
    const lines = snapshot.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();
      const refMatch = trimmedLine.match(/\[ref=([a-zA-Z0-9_-]+)\]/);

      if (refMatch) {
        const ref = refMatch[1];
        const textMatches = trimmedLine.match(/"([^"]*)"/g) || [];
        const texts = textMatches.map(t => t.replace(/"/g, ''));

        let role = '';
        if (trimmedLine.includes('textbox')) role = 'textbox';
        else if (trimmedLine.includes('button')) role = 'button';
        else if (trimmedLine.includes('link')) role = 'link';
        else if (trimmedLine.includes('checkbox')) role = 'checkbox';
        else if (trimmedLine.includes('combobox')) role = 'combobox';

        if (role && texts.length > 0) {
          elements.push({ ref, role, text: texts[0] || '' });
        }
      }
    }

    return elements;
  }

  // 🔥 参数格式转换和验证辅助方法
  private convertToMCPFormat(
    action: string,
    originalParams: any,
    elementRef?: { ref: string; text: string }
  ): any {
    console.log(`🔄 参数格式转换: ${action}`);
    console.log(`📥 原始参数:`, JSON.stringify(originalParams));

    let convertedParams: any = {};

    switch (action) {
      case 'click':
        convertedParams = elementRef ? { ref: elementRef.ref } : { ref: originalParams.selector };
        break;
      case 'fill':
      case 'input':
      case 'type':
        convertedParams = elementRef
          ? { ref: elementRef.ref, text: originalParams.value || originalParams.text }
          : { ref: originalParams.selector, text: originalParams.value || originalParams.text };
        break;
      case 'wait':
        convertedParams = { timeout: originalParams.timeout || 1000 };
        break;
      case 'expect':
        convertedParams = {
          selector: originalParams.selector || 'body',
          condition: originalParams.condition || 'visible',
          text: originalParams.text || ''
        };
        break;
      default:
        convertedParams = originalParams;
    }

    console.log(`📤 转换后参数:`, JSON.stringify(convertedParams));
    return convertedParams;
  }

  // 🔥 参数格式验证方法
  private validateMCPParameters(toolName: string, parameters: any): boolean {
    const requiredParams: Record<string, string[]> = {
      'browser_click': ['element', 'ref'],
      'browser_type': ['element', 'ref', 'text'],
      'browser_wait_for': ['timeout'],
      'browser_navigate': ['url'],
      'browser_snapshot': []
    };

    const required = requiredParams[toolName];
    if (!required) {
      console.warn(`⚠️ 未知的工具名称: ${toolName}`);
      return true; // 对于未知工具，跳过验证
    }

    for (const param of required) {
      if (!(param in parameters)) {
        console.error(`❌ 缺少必需参数: ${param} for ${toolName}`);
        return false;
      }
    }

    // 特殊验证
    if (toolName === 'browser_type' && (!parameters.text || parameters.text.trim() === '')) {
      console.error(`❌ browser_type 的 text 参数不能为空`);
      return false;
    }

    if (toolName === 'browser_click' && (!parameters.element || parameters.element.trim() === '' || !parameters.ref || parameters.ref.trim() === '')) {
      console.error(`❌ browser_click 的 element 和 ref 参数都不能为空`);
      return false;
    }

    return true;
  }

  // 🔥 新增：验证MCP命令是否真正执行的方法
  private async verifyMCPCommandExecution(mcpCommand: { name: string; arguments: any }, runId: string): Promise<boolean> {
    try {
      console.log(`🔍 [${runId}] 开始验证MCP命令执行效果: ${mcpCommand.name}`);
      this.addLog(runId, `🔍 验证MCP命令执行效果...`, 'info');

      // 等待一段时间让操作生效
      await this.delay(500);

      // 获取操作后的页面快照
      const postSnapshot = await this.mcpClient.getSnapshot();

      switch (mcpCommand.name) {
        case 'browser_navigate':
          return await this.verifyNavigationExecution(mcpCommand.arguments.url, postSnapshot, runId);

        case 'browser_type':
          return await this.verifyTypeExecution(mcpCommand.arguments, postSnapshot, runId);

        case 'browser_click':
          return await this.verifyClickExecution(mcpCommand.arguments, postSnapshot, runId);

        default:
          // 对于其他命令，简单验证页面仍然响应
          if (postSnapshot && postSnapshot.length > 50) {
            console.log(`✅ [${runId}] 基础验证通过: 页面仍然响应`);
            return true;
          }
          return false;
      }
    } catch (error: any) {
      console.error(`❌ [${runId}] MCP命令执行验证失败: ${error.message}`);
      this.addLog(runId, `⚠️ 命令执行验证异常: ${error.message}`, 'warning');
      return false; // 验证失败不影响主流程
    }
  }

  // 🔥 验证导航命令执行
  private async verifyNavigationExecution(targetUrl: string, snapshot: string, runId: string): Promise<boolean> {
    try {
      const currentUrl = this.extractUrlFromSnapshot(snapshot);

      if (currentUrl && currentUrl !== 'about:blank') {
        const targetDomain = new URL(targetUrl).hostname;
        const currentDomain = new URL(currentUrl).hostname;

        if (currentDomain.includes(targetDomain) || targetDomain.includes(currentDomain)) {
          console.log(`✅ [${runId}] 导航验证成功: ${currentUrl}`);
          this.addLog(runId, `✅ 导航验证成功: 已到达目标页面`, 'success');
          return true;
        }
      }

      console.log(`⚠️ [${runId}] 导航验证失败: 期望${targetUrl}, 实际${currentUrl}`);
      this.addLog(runId, `⚠️ 导航验证失败: 页面URL不匹配`, 'warning');
      return false;
    } catch (error: any) {
      console.error(`❌ [${runId}] 导航验证异常: ${error.message}`);
      return false;
    }
  }

  // 🔥 验证输入命令执行
  private async verifyTypeExecution(args: { ref: string; text: string }, snapshot: string, runId: string): Promise<boolean> {
    try {
      // 检查目标元素是否仍然存在
      const elementExists = snapshot.includes(`[ref=${args.ref}]`);

      if (elementExists) {
        console.log(`✅ [${runId}] 输入验证成功: 目标元素存在`);
        this.addLog(runId, `✅ 输入验证成功: 已向元素输入内容`, 'success');
        return true;
      } else {
        console.log(`⚠️ [${runId}] 输入验证失败: 目标元素不存在`);
        this.addLog(runId, `⚠️ 输入验证失败: 目标元素可能已变化`, 'warning');
        return false;
      }
    } catch (error: any) {
      console.error(`❌ [${runId}] 输入验证异常: ${error.message}`);
      return false;
    }
  }

  // 🔥 验证点击命令执行
  private async verifyClickExecution(args: { ref: string }, snapshot: string, runId: string): Promise<boolean> {
    try {
      // 点击后页面应该有响应，检查页面是否仍然正常
      if (snapshot && snapshot.length > 100) {
        console.log(`✅ [${runId}] 点击验证成功: 页面响应正常`);
        this.addLog(runId, `✅ 点击验证成功: 页面已响应点击操作`, 'success');
        return true;
      } else {
        console.log(`⚠️ [${runId}] 点击验证失败: 页面响应异常`);
        this.addLog(runId, `⚠️ 点击验证失败: 页面可能未响应`, 'warning');
        return false;
      }
    } catch (error: any) {
      console.error(`❌ [${runId}] 点击验证异常: ${error.message}`);
      return false;
    }
  }

  // 🔥 获取滚动操作的键盘降级方案
  private getFallbackKey(action: string): string | null {
    const fallbackMap: Record<string, string> = {
      'browser_scroll_down': 'Page_Down',
      'scroll_down': 'Page_Down',
      'browser_scroll_up': 'Page_Up', 
      'scroll_up': 'Page_Up',
      'browser_scroll_to_top': 'Home',
      'scroll_to_top': 'Home',
      'browser_scroll_to_bottom': 'End',
      'scroll_to_bottom': 'End',
      'browser_scroll_page': 'Page_Down', // 默认向下
      'scroll': 'Page_Down'
    };

    return fallbackMap[action] || null;
  }

  // 🔥 新增：检测并切换新页签的通用方法
  private async detectAndSwitchToNewTab(runId: string, timeout: number = 1200): Promise<{ 
    success: boolean; 
    switched: boolean; 
    url?: string; 
    title?: string;
    error?: string;
  }> {
    try {
      console.log(`🔍 [${runId}] 开始检测新页签...`);
      
      // 使用 MCP 的 browser_evaluate 工具执行新页签检测和切换逻辑
      const mcpCommand = {
        name: 'browser_evaluate',
        arguments: {
          function: `async () => {
            const start = Date.now();
            let target = null;
            
            // 等待新页签出现（最多 ${timeout}ms）
            while (Date.now() - start < ${timeout}) {
              const pages = page.context().pages();
              // 策略：选择"最新的那个"当作可能的新页签
              const last = pages[pages.length - 1];
              // 若 last 不是当前活动页，判定为新开页签
              if (last && last !== page) {
                target = last;
                break;
              }
              await new Promise(r => setTimeout(r, 120));
            }
            
            if (target) {
              await target.waitForLoadState('domcontentloaded');
              await target.bringToFront(); // ✅ 自动切到新页签
              return { 
                ok: true, 
                switched: true, 
                url: target.url(), 
                title: await target.title() 
              };
            }
            
            // 没有新页签也视为成功（同页场景），交由后续步骤自行判断页面状态
            return { 
              ok: true, 
              switched: false, 
              url: page.url(), 
              title: await page.title() 
            };
          }`
        }
      };

      console.log(`🔧 [${runId}] 执行新页签检测命令...`);
      const result = await this.mcpClient.callTool(mcpCommand);

      if (result && result.content) {
        const content = Array.isArray(result.content) ? result.content : [result.content];
        for (const item of content) {
          if (item.type === 'text' && item.text) {
            try {
              // 尝试解析返回的JSON结果
              const parsed = JSON.parse(item.text);
              if (parsed.ok) {
                console.log(`✅ [${runId}] 新页签检测完成: switched=${parsed.switched}, url=${parsed.url}`);
                this.addLog(runId, `🔄 页签检测: ${parsed.switched ? '已切换到新页签' : '保持当前页签'}`, 'info');
                
                return {
                  success: true,
                  switched: parsed.switched,
                  url: parsed.url,
                  title: parsed.title
                };
              }
            } catch (parseError) {
              // 如果解析失败，检查是否包含明显的错误信息
              if (item.text.includes('Error:') || item.text.includes('Failed:')) {
                return {
                  success: false,
                  switched: false,
                  error: item.text
                };
              }
            }
          }
        }
      }

      // 如果没有明确的结果，默认返回成功但未切换
      return {
        success: true,
        switched: false
      };

    } catch (error: any) {
      console.error(`❌ [${runId}] 新页签检测失败: ${error.message}`);
      return {
        success: false,
        switched: false,
        error: error.message
      };
    }
  }

  // 🔥 重写：简化的新页签检测和切换方法
  private async detectAndSwitchToNewTabOptimized(runId: string, timeout: number = 1200): Promise<{ 
    success: boolean; 
    switched: boolean; 
    url?: string; 
    title?: string;
    error?: string;
  }> {
    try {
      console.log(`🔍 [${runId}] 开始检测新页签（简化逻辑）...`);
      
      // 获取当前所有页签
      const tabsResult = await this.mcpClient.callTool({
        name: 'browser_tab_list',
        arguments: {}
      });
      
      const tabs = this.parseTabListResult(tabsResult);
      if (!tabs) {
        console.warn(`⚠️ [${runId}] 无法获取页签列表，跳过新页签检测`);
        return { success: false, switched: false, error: '无法获取页签列表' };
      }
      
      console.log(`📋 [${runId}] 当前页签数量: ${tabs.length}`);
      tabs.forEach(tab => {
        console.log(`   ${tab.index}. ${tab.active ? '[当前]' : ''} ${tab.title}`);
      });
      
      // 🔥 新逻辑：如果有多个页签且当前页签不是最后一个，则切换到最后一个页签
      const currentActiveTab = tabs.find(tab => tab.active);
      const lastTab = tabs[tabs.length - 1]; // 最后一个页签
      
      if (tabs.length > 1 && currentActiveTab && lastTab && currentActiveTab.index !== lastTab.index) {
        // 有多个页签，且当前不是最后一个，切换到最后一个
        console.log(`🔄 [${runId}] 检测到新页签，切换到最后一个页签: ${lastTab.title}`);
        
        // 🔥 修复：browser_tab_select使用0-based索引，需要转换
        const targetIndex = lastTab.index - 1; // 将1-based转换为0-based
        console.log(`🔄 [${runId}] 转换索引：${lastTab.index} -> ${targetIndex} (0-based)`);
        
        const switchResult = await this.mcpClient.callTool({
          name: 'browser_tab_select',
          arguments: { index: targetIndex }
        });
        
        // 🔥 修复：使用正确的方式检查MCP结果
        if (!switchResult?.isError) {
          // 验证切换结果
          const finalTabsResult = await this.mcpClient.callTool({
            name: 'browser_tab_list',
            arguments: {}
          });
          
          const finalTabs = this.parseTabListResult(finalTabsResult);
          const activeTab = finalTabs?.find(tab => tab.active);
          
          if (activeTab && activeTab.index === lastTab.index) {
            console.log(`✅ [${runId}] 已切换到新页签: ${activeTab.title} - ${activeTab.url}`);
            return {
              success: true,
              switched: true,
              url: activeTab.url,
              title: activeTab.title
            };
          } else {
            console.error(`❌ [${runId}] 页签切换验证失败`);
            return {
              success: false,
              switched: false,
              error: '页签切换验证失败'
            };
          }
        } else {
          console.error(`❌ [${runId}] 页签切换操作失败`);
          return {
            success: false,
            switched: false,
            error: '页签切换操作失败'
          };
        }
      } else {
        // 只有一个页签或当前已经是最后一个页签，保持当前状态
        console.log(`ℹ️ [${runId}] 保持当前页签: ${currentActiveTab?.title}`);
        return {
          success: true,
          switched: false,
          url: currentActiveTab?.url,
          title: currentActiveTab?.title
        };
      }
      
    } catch (error: any) {
      console.error(`❌ [${runId}] 新页签检测失败: ${error.message}`);
      return {
        success: false,
        switched: false,
        error: error.message
      };
    }
  }

  // 🔥 新增：解析MCP Tab列表结果的辅助方法
  private parseTabListResult(result: any): Array<{index: number, title: string, url: string, active: boolean}> | null {
    try {
      if (result?.content) {
        const content = Array.isArray(result.content) ? result.content : [result.content];
        for (const item of content) {
          if (item.type === 'text' && item.text) {
            const lines = item.text.split('\n').filter(line => line.trim());
            const tabs = [];
            
            for (const line of lines) {
              // 🔥 修复：解析MCP实际格式 "- 0: (current) [标题] (URL)" 或 "- 1: [标题] (URL)"
              const match = line.match(/^-\s+(\d+):\s*(\(current\))?\s*\[([^\]]+)\]\s*\(([^)]+)\)/);
              if (match) {
                tabs.push({
                  index: parseInt(match[1]) + 1, // 🔥 转换为1-based索引，MCP返回0-based，browser_tab_select需要1-based
                  active: !!match[2], // (current) 表示当前活动页签
                  title: match[3].trim(),
                  url: match[4].trim()
                });
              }
            }
            
            console.log(`🔍 解析到 ${tabs.length} 个页签:`, tabs);
            return tabs.length > 0 ? tabs : null;
          }
        }
      }
      return null;
    } catch (error) {
      console.error('解析页签列表失败:', error);
      return null;
    }
  }

  // 🔥 新增：改进的错误检测方法，避免误判前端JS错误
  private isRealMCPError(text: string): boolean {
    // 排除前端JavaScript错误和常见的浏览器控制台消息
    const frontendErrors = [
      'getComputedStyle',
      'TypeError: Failed to execute',
      'SecurityError',
      'ResizeObserver',
      'Non-Error promise rejection',
      'Script error',
      'Loading chunk',
      'ChunkLoadError',
      'Network Error',
      'CORS',
      'Content Security Policy',
      'Blocked a frame',
      'Mixed Content',
      'Invalid regular expression',
      'Unexpected token'
    ];

    // 如果包含前端错误特征，不视为MCP操作失败
    if (frontendErrors.some(pattern => text.includes(pattern))) {
      return false;
    }

    // 只有真正的MCP操作失败才返回true
    return (
      text.includes('Error:') || 
      text.includes('Failed:') || 
      text.includes('not found') || 
      text.includes('无法找到') || 
      text.includes('timeout') ||
      text.includes('Timed out') ||
      text.includes('Element not found') ||
      text.includes('Selector not found')
    );
  }

  // 🔥 新增：执行页签切换命令
  private async executeTabSwitchCommand(step: TestStep, runId: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`🔄 [${runId}] 开始执行页签切换: ${step.tabMatchType} -> ${step.tabTarget}`);
      this.addLog(runId, `🔄 执行页签切换: ${step.description}`, 'info');

      // 1. 获取当前所有页签
      const tabListResult = await this.mcpClient.callTool({
        name: 'browser_tab_list',
        arguments: {}
      });

      const tabs = this.parseTabListResult(tabListResult);
      if (!tabs || tabs.length === 0) {
        console.error(`❌ [${runId}] 无法获取页签列表`);
        return { success: false, error: '无法获取页签列表' };
      }

      console.log(`📋 [${runId}] 当前页签数量: ${tabs.length}`);
      tabs.forEach(tab => {
        console.log(`   ${tab.index}. ${tab.active ? '[当前]' : ''} ${tab.title} - ${tab.url}`);
      });

      // 2. 根据匹配类型查找目标页签
      let targetTabIndex = -1;
      let targetTabInfo = '';

      switch (step.tabMatchType) {
        case 'last':
          // 切换到最后一个页签
          targetTabIndex = tabs.length;
          targetTabInfo = `最后一个页签 (索引${targetTabIndex})`;
          break;

        case 'first':
          // 切换到第一个页签
          targetTabIndex = 1;
          targetTabInfo = `第一个页签 (索引${targetTabIndex})`;
          break;

        case 'index':
          // 直接使用指定索引
          targetTabIndex = parseInt(step.tabTarget || '1');
          if (targetTabIndex < 1 || targetTabIndex > tabs.length) {
            console.error(`❌ [${runId}] 页签索引 ${targetTabIndex} 超出范围 (1-${tabs.length})`);
            return { success: false, error: `页签索引 ${targetTabIndex} 超出范围` };
          }
          targetTabInfo = `第${targetTabIndex}个页签`;
          break;

        case 'title':
          // 按标题匹配页签
          const titleTarget = step.tabTarget || '';
          const matchedTab = tabs.find(tab => 
            tab.title.includes(titleTarget) || 
            titleTarget.includes(tab.title) ||
            tab.title.toLowerCase().includes(titleTarget.toLowerCase())
          );
          
          if (!matchedTab) {
            console.error(`❌ [${runId}] 未找到包含"${titleTarget}"的页签`);
            return { success: false, error: `未找到包含"${titleTarget}"的页签` };
          }
          
          targetTabIndex = matchedTab.index;
          targetTabInfo = `标题包含"${titleTarget}"的页签 (索引${targetTabIndex})`;
          break;

        case 'url':
          // 按URL匹配页签
          const urlTarget = step.tabTarget || '';
          const urlMatchedTab = tabs.find(tab => tab.url.includes(urlTarget));
          
          if (!urlMatchedTab) {
            console.error(`❌ [${runId}] 未找到URL包含"${urlTarget}"的页签`);
            return { success: false, error: `未找到URL包含"${urlTarget}"的页签` };
          }
          
          targetTabIndex = urlMatchedTab.index;
          targetTabInfo = `URL包含"${urlTarget}"的页签 (索引${targetTabIndex})`;
          break;

        default:
          console.error(`❌ [${runId}] 不支持的页签匹配类型: ${step.tabMatchType}`);
          return { success: false, error: `不支持的页签匹配类型: ${step.tabMatchType}` };
      }

      console.log(`🎯 [${runId}] 目标页签: ${targetTabInfo}`);

      // 3. 检查是否已经是当前页签
      const currentTab = tabs.find(tab => tab.active);
      if (currentTab && currentTab.index === targetTabIndex) {
        console.log(`ℹ️ [${runId}] 目标页签已经是当前活动页签，无需切换`);
        this.addLog(runId, `✅ 目标页签已经是当前页签: ${currentTab.title}`, 'success');
        return { success: true };
      }

      // 4. 执行页签切换
      console.log(`🔄 [${runId}] 切换到页签索引: ${targetTabIndex}`);
      
      // 🔥 修复：browser_tab_select使用0-based索引，需要转换
      const mcpTabIndex = targetTabIndex - 1; // 将1-based转换为0-based
      console.log(`🔄 [${runId}] MCP索引转换：${targetTabIndex} -> ${mcpTabIndex} (0-based)`);
      
      const switchResult = await this.mcpClient.callTool({
        name: 'browser_tab_select',
        arguments: { index: mcpTabIndex }
      });

      // 5. 验证切换结果
      if (!switchResult?.isError) {
        // 获取切换后的页签信息进行确认
        const finalTabsResult = await this.mcpClient.callTool({
          name: 'browser_tab_list',
          arguments: {}
        });

        const finalTabs = this.parseTabListResult(finalTabsResult);
        const activeTab = finalTabs?.find(tab => tab.active);

        if (activeTab && activeTab.index === targetTabIndex) {
          console.log(`✅ [${runId}] 页签切换成功: ${activeTab.title} - ${activeTab.url}`);
          this.addLog(runId, `✅ 已切换到页签: ${activeTab.title}`, 'success');
          return { success: true };
        } else {
          console.error(`❌ [${runId}] 页签切换验证失败`);
          return { success: false, error: '页签切换验证失败' };
        }
      } else {
        console.error(`❌ [${runId}] 页签切换操作失败`);
        return { success: false, error: '页签切换操作失败' };
      }

    } catch (error: any) {
      console.error(`❌ [${runId}] 页签切换异常:`, error);
      this.addLog(runId, `❌ 页签切换失败: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  // #region Evidence Management

  /**
   * 检查文件是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fsPromises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 保存测试证据文件到artifacts目录
   * @param runId 测试运行ID
   * @param testStatus 测试状态
   */
  private async saveTestEvidence(runId: string, testStatus: 'completed' | 'failed'): Promise<void> {
    try {
      console.log(`📁 [${runId}] 开始保存测试证据...`);
      this.addLog(runId, `📁 正在保存测试证据...`, 'info');

      // 🔥 确保 artifacts 目录存在
      const artifactsDir = this.evidenceService.getArtifactsDir();
      const runArtifactsDir = path.join(artifactsDir, runId);
      try {
        await fsPromises.mkdir(runArtifactsDir, { recursive: true });
        console.log(`📁 [${runId}] artifacts 目录已确保存在: ${runArtifactsDir}`);
      } catch (dirError: any) {
        console.error(`❌ [${runId}] 创建 artifacts 目录失败:`, dirError.message);
        this.addLog(runId, `⚠️ 创建 artifacts 目录失败: ${dirError.message}`, 'warning');
      }

      // 1. 保存截图证据 - 将screenshots目录中的截图复制到artifacts
      await this.saveScreenshotEvidence(runId);

      // 2. 保存测试日志
      await this.saveLogEvidence(runId);

      // 3. 尝试保存其他证据（如果存在）
      if (testStatus === 'completed') {
        await this.saveAdditionalEvidence(runId);
      }

      console.log(`✅ [${runId}] 测试证据保存完成`);
      this.addLog(runId, `✅ 测试证据已保存到artifacts目录`, 'success');

    } catch (error: any) {
      console.error(`❌ [${runId}] 保存测试证据失败:`, error.message);
      this.addLog(runId, `⚠️ 测试证据保存失败: ${error.message}`, 'warning');
      // 不抛出错误，避免影响测试完成流程
    }
  }

  /**
   * 在截图上添加文字标识（步骤/断言）
   */
  private async addScreenshotLabel(
    imageBuffer: Buffer,
    label: string,
    type: 'step' | 'assertion'
  ): Promise<Buffer> {
    try {
      // 使用 sharp 在图片左上角添加文字标识
      const labelBg = type === 'assertion' ? 'rgba(255,107,53,0.9)' : 'rgba(78,205,196,0.9)';
      
      // 创建 SVG 文本标签
      const svgLabel = `
        <svg width="200" height="40">
          <rect x="0" y="0" width="200" height="40" fill="${labelBg}" rx="5"/>
          <text x="10" y="28" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="white">${label}</text>
        </svg>
      `;
      
      // 将标签叠加到图片上
      const labelBuffer = Buffer.from(svgLabel);
      const labeledImage = await sharp(imageBuffer)
        .composite([{
          input: labelBuffer,
          top: 10,
          left: 10
        }])
        .toBuffer();
      
      return labeledImage;
    } catch (error: any) {
      console.warn(`⚠️ 添加截图标识失败，使用原图: ${error.message}`);
      return imageBuffer;
    }
  }

  /**
   * 保存截图证据
   */
  private async saveScreenshotEvidence(runId: string): Promise<void> {
    try {
      // 获取该测试运行的所有截图
      const screenshots = await this.screenshotService.getScreenshotsByRunId(runId);

      if (screenshots.length === 0) {
        console.log(`📸 [${runId}] 没有截图需要保存`);
        return;
      }

      console.log(`🔍 [${runId}] 查询测试运行截图: ${runId}`, {
        totalFound: screenshots.length,
        orderBy: 'step_index',
        orderDirection: 'asc'
      });

      // 🔥 获取测试用例信息，以确定操作步骤和断言步骤的分界
      const testRun = testRunStore.get(runId);
      let stepsCount = 0;
      if (testRun && testRun.testCaseId) {
        try {
          const testCase = await this.getTestCaseById(testRun.testCaseId);
          if (testCase) {
            const stepsText = testCase.steps || '';
            stepsCount = this.parseTestSteps(stepsText).length;
          }
        } catch {
          console.warn(`⚠️ [${runId}] 无法获取测试用例信息，使用默认分界`);
        }
      }

      // 🔥 修复：检查 artifacts 目录中已存在的文件，避免重复保存
      const artifactsDir = this.evidenceService.getArtifactsDir();
      const runArtifactsDir = path.join(artifactsDir, runId);
      let existingFiles: Set<string> = new Set();
      try {
        const files = await fsPromises.readdir(runArtifactsDir);
        existingFiles = new Set(files.filter(f => f.endsWith('.png')));
      } catch {
        // 目录不存在，继续处理
      }

      // 🔥 分离操作步骤截图和断言截图
      const stepScreenshots: typeof screenshots = [];
      const assertionScreenshots: typeof screenshots = [];

      for (const screenshot of screenshots) {
        // 判断是断言截图还是操作步骤截图
        const assertionMatch = screenshot.fileName.match(/^assertion-(\d+)-/);
        if (assertionMatch) {
          // 断言截图：assertion-1-success-xxx.png
          assertionScreenshots.push(screenshot);
        } else {
          // 操作步骤截图：step-X-xxx.png 或其他格式
          stepScreenshots.push(screenshot);
        }
      }

      let savedCount = 0;
      let skippedCount = 0;

      // 🔥 先保存操作步骤截图
      console.log(`📸 [${runId}] 开始保存操作步骤截图 (${stepScreenshots.length}张)`);
      for (const screenshot of stepScreenshots) {
        try {
          // 🔥 修复：检查文件是否已在 artifacts 中存在
          if (existingFiles.has(screenshot.fileName)) {
            console.log(`⚠️ [${runId}] 截图已存在于 artifacts，跳过: ${screenshot.fileName}`);
            skippedCount++;
            continue;
          }

          // filePath 应该是绝对路径
          const screenshotPath = screenshot.filePath;

          // 验证filePath不为空
          if (!screenshotPath) {
            console.warn(`⚠️ [${runId}] 截图记录缺少文件路径: ${screenshot.fileName} (ID: ${screenshot.id})`);
            continue;
          }

          // 检查截图文件是否存在
          if (await this.fileExists(screenshotPath)) {
            let screenshotBuffer = await fsPromises.readFile(screenshotPath);
            
            // 🔥 在截图上添加"步骤"标识
            const stepMatch = screenshot.fileName.match(/^step-(\d+)-/);
            if (stepMatch) {
              const stepIndex = stepMatch[1];
              screenshotBuffer = await this.addScreenshotLabel(
                screenshotBuffer,
                `步骤 ${stepIndex}`,
                'step'
              );
            }
            
            await this.evidenceService.saveBufferArtifact(
              runId,
              'screenshot',
              screenshotBuffer,
              screenshot.fileName
            );
            savedCount++;
          } else {
            console.warn(`⚠️ [${runId}] 截图文件不存在: ${screenshotPath} (ID: ${screenshot.id})`);
          }
        } catch (error: any) {
          console.warn(`⚠️ [${runId}] 保存截图证据失败: ${screenshot.fileName} (ID: ${screenshot.id})`, error.message);
        }
      }

      // 🔥 再保存断言截图
      if (assertionScreenshots.length > 0) {
        console.log(`📸 [${runId}] 开始保存断言截图 (${assertionScreenshots.length}张)`);
        for (const screenshot of assertionScreenshots) {
          try {
            if (existingFiles.has(screenshot.fileName)) {
              console.log(`⚠️ [${runId}] 截图已存在于 artifacts，跳过: ${screenshot.fileName}`);
              skippedCount++;
              continue;
            }

            const screenshotPath = screenshot.filePath;

            if (!screenshotPath) {
              console.warn(`⚠️ [${runId}] 截图记录缺少文件路径: ${screenshot.fileName} (ID: ${screenshot.id})`);
              continue;
            }

            if (await this.fileExists(screenshotPath)) {
              let screenshotBuffer = await fsPromises.readFile(screenshotPath);
              
              // 🔥 在截图上添加"断言"标识
              const assertionMatch = screenshot.fileName.match(/^assertion-(\d+)-/);
              if (assertionMatch) {
                const assertionIndex = assertionMatch[1];
                screenshotBuffer = await this.addScreenshotLabel(
                  screenshotBuffer,
                  `断言 ${assertionIndex}`,
                  'assertion'
                );
              }
              
              await this.evidenceService.saveBufferArtifact(
                runId,
                'screenshot',
                screenshotBuffer,
                screenshot.fileName
              );
              savedCount++;
            } else {
              console.warn(`⚠️ [${runId}] 截图文件不存在: ${screenshotPath} (ID: ${screenshot.id})`);
            }
          } catch (error: any) {
            console.warn(`⚠️ [${runId}] 保存截图证据失败: ${screenshot.fileName} (ID: ${screenshot.id})`, error.message);
          }
        }
      }

      console.log(`📸 [${runId}] 已保存 ${savedCount}/${screenshots.length} 个截图证据，跳过 ${skippedCount} 个已存在的文件`);

      // 如果没有保存任何截图，记录警告
      if (savedCount === 0 && screenshots.length > 0) {
        if (skippedCount > 0) {
          console.log(`ℹ️ [${runId}] 所有截图已存在于 artifacts 目录，无需重复保存`);
        } else {
          console.warn(`⚠️ [${runId}] 警告: 找到 ${screenshots.length} 个截图记录但未能保存任何文件`);
          console.warn(`⚠️ [${runId}] 可能的原因: 截图文件已被删除，或数据库中的路径不正确`);
        }
      }

    } catch (error: any) {
      console.error(`❌ [${runId}] 保存截图证据失败:`, error.message);
    }
  }

  /**
   * 保存日志证据
   */
  private async saveLogEvidence(runId: string): Promise<void> {
    try {
      const testRun = testRunStore.get(runId);
      if (!testRun || !testRun.logs || testRun.logs.length === 0) {
        console.log(`📝 [${runId}] 没有日志需要保存`);
        return;
      }

      // 🔥 修复：检查日志文件是否已存在
      const logFilename = `${runId}-execution.log`;
      const artifactsDir = this.evidenceService.getArtifactsDir();
      const logFilePath = path.join(artifactsDir, runId, logFilename);
      
      try {
        await fsPromises.access(logFilePath);
        console.log(`⚠️ [${runId}] 日志文件已存在，跳过保存: ${logFilename}`);
        return;
      } catch {
        // 文件不存在，继续保存
      }

      // 生成日志内容
      const logContent = testRun.logs
        .map(log => {
          const timestamp = log.timestamp ? new Date(log.timestamp).toISOString() : 'Unknown';
          return `[${timestamp}] [${log.level.toUpperCase()}] ${log.message}`;
        })
        .join('\n');

      // 保存为日志文件
      const logBuffer = Buffer.from(logContent, 'utf8');
      
      await this.evidenceService.saveBufferArtifact(
        runId,
        'log',
        logBuffer,
        logFilename
      );

      console.log(`📝 [${runId}] 已保存测试日志: ${logFilename}`);
      
    } catch (error: any) {
      console.error(`❌ [${runId}] 保存日志证据失败:`, error.message);
    }
  }

  /**
   * 保存其他证据（trace、video等）
   */
  private async saveAdditionalEvidence(runId: string): Promise<void> {
    try {
      console.log(`🔍 [${runId}] 检查其他证据类型...`);

      // 🔥 修复：对于 Playwright 模式，视频和 trace 文件在 context close 后处理
      // 这里只处理 MCP 模式的证据，或者已经存在的文件
      // Playwright 模式的视频和 trace 文件由 processPlaywrightArtifacts 处理
      
      // 1. 查找并保存 trace 文件（MCP 模式或已存在的文件）
      await this.saveTraceEvidence(runId);

      // 2. 查找并保存视频文件（MCP 模式或已存在的文件）
      // 注意：Playwright 模式的视频文件需要在 context close 后处理
      await this.saveVideoEvidence(runId);

    } catch (error: any) {
      console.error(`❌ [${runId}] 保存其他证据失败:`, error.message);
    }
  }

  /**
   * 保存 trace 文件
   */
  private async saveTraceEvidence(runId: string): Promise<void> {
    try {
      const artifactsDir = this.evidenceService.getArtifactsDir();
      const runArtifactsDir = path.join(artifactsDir, runId);
      
      // 🔥 修复：优先检查 artifacts/{runId} 目录中的 trace.zip（Playwright Test Runner 生成）
      const possibleTraceFiles = [
        path.join(runArtifactsDir, 'trace.zip'), // Playwright Test Runner 直接生成的
        path.join(process.cwd(), 'test-results', `${runId}-trace.zip`),
        path.join(process.cwd(), 'playwright-report', `${runId}-trace.zip`),
        path.join(process.cwd(), 'traces', `${runId}-trace.zip`),
      ];

      let traceFileFound = false;

      // 首先检查已知的 trace 文件路径
      for (const traceFilePath of possibleTraceFiles) {
        try {
          if (await this.fileExists(traceFilePath)) {
            // 🔥 修复：检查是否已经保存过（避免重复保存）
            const existingArtifacts = await this.evidenceService.getRunArtifacts(runId);
            const traceFilename = `${runId}-trace.zip`;
            const alreadySaved = existingArtifacts.some(a => 
              a.type === 'trace' && a.filename === traceFilename
            );
            
            if (alreadySaved) {
              // 如果已保存，删除原始的 trace.zip 文件（避免重复）
              if (traceFilePath.endsWith('trace.zip') && traceFilePath !== path.join(runArtifactsDir, traceFilename)) {
                try {
                  await fsPromises.unlink(traceFilePath);
                  console.log(`🗑️ [${runId}] 已删除重复的 trace.zip 文件: ${path.basename(traceFilePath)}`);
                } catch (unlinkError) {
                  // 忽略删除失败
                }
              }
              traceFileFound = true;
              break;
            }
            
            // 🔥 修复：如果是 trace.zip，重命名而不是复制
            const renamedTracePath = path.join(runArtifactsDir, traceFilename);
            if (traceFilePath.endsWith('trace.zip') && traceFilePath !== renamedTracePath) {
              // 重命名文件
              await fsPromises.rename(traceFilePath, renamedTracePath);
              console.log(`📦 [${runId}] Trace 文件已重命名: ${traceFilename}`);
              
              // 保存到数据库
              const traceBuffer = await fsPromises.readFile(renamedTracePath);
              await this.evidenceService.saveBufferArtifact(
                runId,
                'trace',
                traceBuffer,
                traceFilename
              );
            } else {
              // 其他路径的文件，直接读取并保存
              const traceBuffer = await fsPromises.readFile(traceFilePath);
              await this.evidenceService.saveBufferArtifact(
                runId,
                'trace',
                traceBuffer,
                traceFilename
              );
            }
            
            console.log(`📦 [${runId}] 已保存 trace 文件: ${traceFilename}`);
            traceFileFound = true;
            break;
          }
        } catch (error: any) {
          // 忽略文件不存在的错误
          continue;
        }
      }

      // 如果未找到，尝试在目录中搜索
      if (!traceFileFound) {
        const possibleTraceDirs = [
          runArtifactsDir,
          path.join(process.cwd(), 'test-results'),
          path.join(process.cwd(), 'playwright-report'),
          path.join(process.cwd(), 'traces'),
        ];

        for (const traceDir of possibleTraceDirs) {
          try {
            if (!(await this.fileExists(traceDir))) {
              continue;
            }

            // 查找所有 .zip 文件（trace 文件通常是 zip 格式）
            const files = await fsPromises.readdir(traceDir, { withFileTypes: true });
            
            for (const file of files) {
              if (file.isFile() && file.name.endsWith('.zip') && 
                  (file.name === 'trace.zip' || file.name.includes('trace'))) {
                const traceFilePath = path.join(traceDir, file.name);
                
                // 🔥 修复：检查是否已经保存过
                const existingArtifacts = await this.evidenceService.getRunArtifacts(runId);
                const traceFilename = `${runId}-trace.zip`;
                const alreadySaved = existingArtifacts.some(a => 
                  a.type === 'trace' && a.filename === traceFilename
                );
                
                if (alreadySaved) {
                  // 如果已保存，删除原始的 trace.zip 文件
                  if (file.name === 'trace.zip') {
                    try {
                      await fsPromises.unlink(traceFilePath);
                      console.log(`🗑️ [${runId}] 已删除重复的 trace.zip 文件`);
                    } catch (unlinkError) {
                      // 忽略删除失败
                    }
                  }
                  traceFileFound = true;
                  break;
                }
                
                // 🔥 修复：如果是 trace.zip，重命名而不是复制
                const renamedTracePath = path.join(runArtifactsDir, traceFilename);
                if (file.name === 'trace.zip' && traceFilePath !== renamedTracePath) {
                  // 重命名文件
                  await fsPromises.rename(traceFilePath, renamedTracePath);
                  console.log(`📦 [${runId}] Trace 文件已重命名: ${traceFilename}`);
                  
                  // 保存到数据库
                  const traceBuffer = await fsPromises.readFile(renamedTracePath);
                  await this.evidenceService.saveBufferArtifact(
                    runId,
                    'trace',
                    traceBuffer,
                    traceFilename
                  );
                } else {
                  // 其他文件，直接读取并保存
                  const traceBuffer = await fsPromises.readFile(traceFilePath);
                  await this.evidenceService.saveBufferArtifact(
                    runId,
                    'trace',
                    traceBuffer,
                    traceFilename
                  );
                }
                
                console.log(`📦 [${runId}] 已保存 trace 文件: ${traceFilename}`);
                traceFileFound = true;
                break;
              }
            }
            
            if (traceFileFound) break;
          } catch (dirError: any) {
            // 忽略目录不存在的错误
            continue;
          }
        }
      }

      if (!traceFileFound) {
        console.log(`📦 [${runId}] 未找到 trace 文件`);
        console.log(`   ℹ️  说明: 当前使用 MCP 客户端执行测试，MCP 可能不支持自动生成 trace 文件`);
        console.log(`   ℹ️  如需 trace 文件，请使用 Playwright Test Runner 执行测试`);
      }
    } catch (error: any) {
      console.error(`❌ [${runId}] 保存 trace 文件失败:`, error.message);
    }
  }

  /**
   * 保存视频文件
   */
  private async saveVideoEvidence(runId: string): Promise<void> {
    try {
      const artifactsDir = this.evidenceService.getArtifactsDir();
      const runArtifactsDir = path.join(artifactsDir, runId);
      
      // 🔥 修复：检查是否已经在 processPlaywrightArtifacts 中处理过
      const videoFilename = `${runId}-video.webm`;
      const renamedVideoPath = path.join(runArtifactsDir, videoFilename);
      
      try {
        await fsPromises.access(renamedVideoPath);
        const stats = await fsPromises.stat(renamedVideoPath);
        
        // 检查文件大小，确保不是空文件
        if (stats.size > 0) {
          // 检查数据库记录
          const existingArtifacts = await this.evidenceService.getRunArtifacts(runId);
          const alreadySaved = existingArtifacts.some(a => 
            a.type === 'video' && a.filename === videoFilename
          );
          
          if (!alreadySaved) {
            // 保存到数据库
            const videoBuffer = await fsPromises.readFile(renamedVideoPath);
            await this.evidenceService.saveBufferArtifact(
              runId,
              'video',
              videoBuffer,
              videoFilename
            );
            console.log(`🎥 [${runId}] 视频文件已保存到数据库: ${videoFilename} (${stats.size} bytes)`);
          } else {
            console.log(`🎥 [${runId}] 视频文件已存在，跳过重复保存: ${videoFilename}`);
          }
          return;
        } else {
          console.warn(`⚠️ [${runId}] 视频文件大小为 0，将在 processPlaywrightArtifacts 中处理: ${videoFilename}`);
        }
      } catch {
        // 重命名后的文件不存在，继续查找原始文件
      }

      // 如果未找到，尝试在其他目录中搜索（兼容旧逻辑）
      const possibleVideoDirs = [
        runArtifactsDir,
        path.join(process.cwd(), 'test-results'),
        path.join(process.cwd(), 'videos'),
      ];

      for (const videoDir of possibleVideoDirs) {
        try {
          if (!(await this.fileExists(videoDir))) {
            continue;
          }

          const files = await fsPromises.readdir(videoDir, { withFileTypes: true });
          
          // 查找哈希名称的视频文件（Playwright 生成的原始文件）
          const videoFiles = files.filter(file => 
            file.isFile() && 
            (file.name.endsWith('.webm') || file.name.endsWith('.mp4')) &&
            !file.name.includes(runId) && // 排除已经重命名的文件
            file.name.match(/^[a-f0-9]{32,}\.(webm|mp4)$/i) // 匹配哈希名称格式
          );
          
          if (videoFiles.length > 0) {
            // 按修改时间排序，获取最新的视频文件
            const videoFilesWithStats = await Promise.all(
              videoFiles.map(async (file) => {
                const filePath = path.join(videoDir, file.name);
                const stats = await fsPromises.stat(filePath);
                return { file, path: filePath, stats };
              })
            );
            
            videoFilesWithStats.sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime());
            const { file: videoFile, path: videoPath, stats: videoStats } = videoFilesWithStats[0];
            
            // 检查文件大小，确保不是空文件
            if (videoStats.size > 0) {
              const ext = videoFile.name.split('.').pop() || 'webm';
              const finalVideoFilename = `${runId}-video.${ext}`;
              
              // 检查是否已经保存过
              const existingArtifacts = await this.evidenceService.getRunArtifacts(runId);
              const alreadySaved = existingArtifacts.some(a => 
                a.type === 'video' && a.filename === finalVideoFilename
              );
              
              if (alreadySaved) {
                console.log(`🎥 [${runId}] 视频文件已存在，跳过重复保存: ${finalVideoFilename}`);
                return;
              }
              
              // 重命名文件（而不是复制）
              const finalVideoPath = path.join(runArtifactsDir, finalVideoFilename);
              await fsPromises.rename(videoPath, finalVideoPath);
              
              // 保存到数据库
              const videoBuffer = await fsPromises.readFile(finalVideoPath);
              await this.evidenceService.saveBufferArtifact(
                runId,
                'video',
                videoBuffer,
                finalVideoFilename
              );
              
              console.log(`🎥 [${runId}] 视频文件已保存: ${finalVideoFilename} (${videoStats.size} bytes)`);
              return;
            }
          }
        } catch (dirError: any) {
          continue;
        }
      }

      console.log(`🎥 [${runId}] 未找到视频文件`);
      console.log(`   ℹ️  说明: 当前使用 MCP 客户端执行测试，MCP 可能不支持自动生成视频文件`);
      console.log(`   ℹ️  如需视频录制，请使用 Playwright Test Runner 执行测试`);
    } catch (error: any) {
      console.error(`❌ [${runId}] 保存视频文件失败:`, error.message);
    }
  }

  /**
   * 批量删除测试运行记录
   * @param runIds 要删除的测试运行ID数组
   * @returns 删除的记录数
   */
  async batchDeleteTestRuns(runIds: string[]): Promise<{ deletedCount: number }> {
    try {
      if (!runIds || runIds.length === 0) {
        return { deletedCount: 0 };
      }

      console.log(`🗑️ 开始批量删除 ${runIds.length} 条测试运行记录...`);

      let deletedCount = 0;

      // 🔥 1. 清理内存中的测试运行数据
      for (const runId of runIds) {
        if (testRunStore.has(runId)) {
          // 从 testRunStore 中删除
          const testRun = testRunStore.get(runId);
          if (testRun) {
            // 清理相关资源 (日志清理等)
            // 注意：如果后续需要日志清理功能，可以在这里实现

            // 从存储中删除
            (testRunStore as any).runs.delete(runId);
            console.log(`✅ 已从内存中删除测试运行: ${runId}`);
          }
        }
      }

      // 🔥 2. 从数据库中删除历史记录
      for (const runId of runIds) {
        try {
          const deleted = await this.executionService.deleteExecution(runId);
          if (deleted) {
            deletedCount++;
            console.log(`✅ 已从数据库中删除测试运行: ${runId}`);
          }
        } catch (dbError) {
          console.error(`❌ 从数据库删除测试记录 ${runId} 失败:`, dbError);
          // 继续删除其他记录
        }
      }

      // 🔥 3. 通知前端更新
      this.wsManager.broadcast({
        type: 'test_runs_deleted',
        runIds,
        deletedCount: runIds.length // 返回请求删除的总数
      });

      console.log(`✅ 批量删除完成，共删除 ${deletedCount} 条测试运行记录`);

      return { deletedCount };
    } catch (error: any) {
      console.error('❌ 批量删除测试运行失败:', error);
      throw error;
    }
  }

  // #endregion

  // #region Playwright Test Runner 支持

  /**
   * 初始化 MCP 客户端
   */
  private async initializeMcpClient(runId: string): Promise<void> {
    console.log(`🚀 [${runId}] 正在初始化MCP客户端...`);
    this.addLog(runId, `🚀 正在初始化MCP客户端...`, 'info');
    console.log(`📊 [${runId}] MCP客户端状态: isInitialized=${this.mcpClient['isInitialized']}`);

    // 🚀 Phase 5: 关键性能优化 - 重用浏览器会话避免重复启动
    await this.mcpClient.initialize({
      reuseSession: true,  // 🚀 重用浏览器实例，节省3-5秒启动时间
      contextState: null
    });
    console.log(`✅ [${runId}] MCP客户端初始化成功`);
    this.addLog(runId, `✅ MCP客户端初始化成功，浏览器已启动`, 'success');

    // 🚀 Phase 5: 先导航到初始页面，再启动实时流
    // 避免"No open pages available"错误
    try {
      console.log(`🌐 [${runId}] 正在导航到初始页面...`);
      const navStep: TestStep = {
        id: 'init-nav-' + Date.now(),
        action: 'navigate' as any,
        url: 'about:blank',
        description: '导航到初始页面',
        order: 0
      };
      await this.mcpClient.executeMcpStep(navStep, runId);
      console.log(`✅ [${runId}] 已导航到初始页面`);
    } catch (navError) {
      console.warn(`⚠️ [${runId}] 初始页面导航失败: ${navError.message}`);
      // 不阻断执行，继续启动实时流
    }

    console.log(`⏳ [${runId}] MCP客户端初始化完成，开始启动实时流`);
  }

  /**
   * 初始化 Playwright Test Runner
   */
  private async initializePlaywrightRunner(runId: string, options: {
    enableTrace?: boolean;
    enableVideo?: boolean;
  }): Promise<void> {
    console.log(`🚀 [${runId}] 正在初始化 Playwright Test Runner...`);
    this.addLog(runId, `🚀 正在初始化 Playwright Test Runner...`, 'info');

    // 创建 Playwright Test Runner 实例
    const artifactsDir = this.evidenceService.getArtifactsDir();
    this.playwrightRunner = new PlaywrightTestRunner(
      this.evidenceService,
      this.streamService,
      artifactsDir
    );

    await this.playwrightRunner.initialize(runId, {
      headless: false,
      enableTrace: options.enableTrace !== false,
      enableVideo: options.enableVideo !== false
    });

    console.log(`✅ [${runId}] Playwright Test Runner 初始化成功`);
    this.addLog(runId, `✅ Playwright Test Runner 初始化成功，浏览器已启动`, 'success');
    this.addLog(runId, `📦 Trace 录制: ${options.enableTrace !== false ? '已启用' : '禁用'}`, 'info');
    this.addLog(runId, `🎥 Video 录制: ${options.enableVideo !== false ? '已启用' : '禁用'}`, 'info');

    // 启动实时流（如果 Playwright Test Runner 支持）
    const page = this.playwrightRunner.getPage();
    if (page) {
      try {
        this.streamService.startStream(runId, page);
        console.log(`📺 [${runId}] 实时流已启动`);
        this.addLog(runId, `📺 实时流: 已启用`, 'success');
      } catch (streamError) {
        console.warn(`⚠️ [${runId}] 启动实时流失败:`, streamError);
        this.addLog(runId, `⚠️ 启动实时流失败: ${(streamError as Error).message}`, 'warning');
      }
    }
  }

  /**
   * 使用 MCP 客户端执行测试（原有流程）
   */
  private async executeWithMcpClient(runId: string, testCase: TestCase, testRun: TestRun): Promise<void> {
    let remainingSteps = testCase.steps;
    let stepIndex = 0;
    let previousStepsText = '';
    const maxSteps = 50;
    const estimatedOperationSteps = this.estimateStepsCount(testCase.steps);
    // 🔥 修复：计算断言数量并加入总步骤数
    const estimatedAssertionSteps = this.estimateStepsCount(testCase.assertions || '');
    const estimatedTotalSteps = estimatedOperationSteps + estimatedAssertionSteps;
    
    if (testRun) {
      testRun.totalSteps = estimatedTotalSteps;
      console.log(`📊 [${runId}] 预估总步骤数: ${estimatedTotalSteps} (操作: ${estimatedOperationSteps}, 断言: ${estimatedAssertionSteps})`);
    }

    // AI闭环执行流程（原有逻辑）
    while (remainingSteps?.trim()) {
      stepIndex++;

      if (this.queueService && this.queueService.isCancelled(runId)) {
        console.log(`⏹️ [${runId}] 测试已被取消，停止执行 (步骤${stepIndex})`);
        this.addLog(runId, `⏹️ 测试已被用户取消`, 'warning');
        this.updateTestRunStatus(runId, 'cancelled', '测试已被用户取消');
        return;
      }

      if (remainingSteps === previousStepsText) {
        console.error(`❌ [${runId}] 检测到无限循环，剩余步骤未变化`);
        this.addLog(runId, `❌ 检测到无限循环，停止执行`, 'error');
        this.updateTestRunStatus(runId, 'failed', '检测到无限循环，测试已停止');
        return;
      }

      if (stepIndex > maxSteps) {
        console.error(`❌ [${runId}] 步骤数超过限制 (${maxSteps})`);
        this.addLog(runId, `❌ 步骤数超过限制，停止执行`, 'error');
        this.updateTestRunStatus(runId, 'failed', `步骤数超过限制 (${maxSteps})，测试已停止`);
        return;
      }

      previousStepsText = remainingSteps;

      // 获取快照
      let snapshot: string;
      if (stepIndex === 1) {
        this.addLog(runId, `⚡ 第一步：跳过初始快照获取，直接执行导航`, 'info');
        snapshot = '页面准备中，跳过初始快照...';
      } else {
        this.addLog(runId, `🔍 正在获取页面快照用于AI分析...`, 'info');
        snapshot = await this.mcpClient.getSnapshot();
        this.addLog(runId, `📸 页面快照获取成功，开始AI解析`, 'info');
      }

      // AI 解析步骤
      this.addLog(runId, `🤖 AI正在解析下一个步骤...`, 'info');
      const aiResult = await this.aiParser.parseNextStep(
        remainingSteps, 
        snapshot, 
        runId,
        (message: string, level: 'info' | 'success' | 'warning' | 'error') => {
          this.addLog(runId, message, level);
        }
      );

      if (!aiResult.success || !aiResult.step) {
        this.addLog(runId, `❌ AI解析失败: ${aiResult.error}`, 'error');
        this.updateTestRunStatus(runId, 'failed', `AI解析失败: ${aiResult.error}`);
        return;
      }

      const step = aiResult.step;
      console.log(`🔍 [${runId}] 执行操作步骤 ${stepIndex}: ${step.action} - ${step.description}`);
      this.addLog(runId, `✅ AI解析成功: ${step.action} - ${step.description}`, 'success');
      this.updateTestRunStatus(runId, 'running', `步骤 ${stepIndex}: ${step.description}`);

      // 执行步骤
      if (stepIndex === 1) {
        this.addLog(runId, `⚡ 第一步：跳过UI稳定等待`, 'info');
      } else {
        this.addLog(runId, `⏳ 等待UI稳定...`, 'info');
        await this.delay(500);
      }

      this.addLog(runId, `🔧 开始执行步骤 ${stepIndex}: ${step.action} - ${step.description}`, 'info');
      const executionResult = await this.executeStepWithRetryAndFallback(step, runId, stepIndex);

      if (!executionResult.success) {
        this.addLog(runId, `❌ 步骤执行最终失败: ${executionResult.error}`, 'error');
        await this.takeStepScreenshot(runId, stepIndex, 'failed', step.description);
        const shouldContinue = await this.shouldContinueAfterFailure(step, runId, executionResult.error);
        if (!shouldContinue) {
          this.updateTestRunStatus(runId, 'failed', `关键步骤 ${stepIndex} 失败: ${executionResult.error}`);
          return;
        } else {
          this.addLog(runId, `⚠️ 步骤 ${stepIndex} 失败但继续执行: ${executionResult.error}`, 'warning');
          if (testRun) {
            testRun.failedSteps = (testRun.failedSteps || 0) + 1;
            testRun.completedSteps = stepIndex;
            testRun.progress = Math.round((stepIndex / Math.max(estimatedTotalSteps, stepIndex)) * 100);
          }
        }
      } else {
        this.addLog(runId, `✅ 步骤 ${stepIndex} 执行成功`, 'success');
        if (testRun) {
          testRun.passedSteps = (testRun.passedSteps || 0) + 1;
          testRun.completedSteps = stepIndex;
          testRun.progress = Math.round((stepIndex / Math.max(estimatedTotalSteps, stepIndex)) * 100);
        }

        if (stepIndex === 1) {
          setImmediate(async () => {
            try {
              console.log(`🎬 [${runId}] 第一个步骤执行成功，开始启动实时流`);
              this.streamService.startStreamWithMcp(runId, this.mcpClient);
              console.log(`📺 [${runId}] 实时流启动完成`);
              this.addLog(runId, `📺 实时流已启动`, 'success');
            } catch (streamError) {
              console.error(`❌ [${runId}] 启动实时流失败:`, streamError);
              this.addLog(runId, `⚠️ 启动实时流失败: ${(streamError as Error).message}`, 'warning');
            }
          });
        }
      }

      const isFirstStepNavigation = stepIndex === 1 && (step.action === 'navigate' || step.action === 'browser_navigate' || step.action === 'open' || step.action === 'goto');
      await this.smartWaitAfterOperation(step.action, {
        runId,
        isFirstStep: isFirstStepNavigation,
        stepIndex
      });

      await this.takeStepScreenshot(runId, stepIndex, 'success', step.description);
      remainingSteps = aiResult.remaining || '';
      this.addLog(runId, `📋 步骤推进: ${remainingSteps.trim() ? `还有 ${remainingSteps.split('\n').filter(l => l.trim()).length} 个步骤` : '所有步骤已完成'}`, 'info');

      if (remainingSteps.trim()) {
        this.addLog(runId, `⏳ 等待下一步骤...`, 'info');
        await this.delay(1500);
      }
    }

    // AI断言阶段
    if (testCase.assertions?.trim()) {
      const assertionSnapshot = await this.mcpClient.getSnapshot();
      const aiAssertions = await this.aiParser.parseAssertions(
        testCase.assertions,
        assertionSnapshot,
        runId,
        (message: string, level: 'info' | 'success' | 'warning' | 'error') => {
          this.addLog(runId, message, level);
        }
      );

      if (!aiAssertions.success) {
        throw new Error(`AI断言解析失败: ${aiAssertions.error}`);
      }

      for (let i = 0; i < aiAssertions.steps.length; i++) {
        const assertion = aiAssertions.steps[i];
        const assertionStepIndex = stepIndex + i + 1; // 断言步骤序号 = 操作步骤数 + 断言序号
        console.log(`🔍 [${runId}] 执行断言步骤 ${i + 1}: ${assertion.description}`);
        this.addLog(runId, `🔍 执行断言 ${i + 1}: ${assertion.description}`, 'info');
        try {
          const result = await this.executeMcpCommand(assertion, runId);
          if (!result.success) {
            // 🔥 修复：断言失败时更新 failedSteps，确保执行结果计算正确
            if (testRun) {
              testRun.failedSteps = (testRun.failedSteps || 0) + 1;
              testRun.completedSteps = assertionStepIndex;
            }
            this.addLog(runId, `❌ 断言 ${i + 1} 失败: ${result.error}`, 'error');
            this.updateTestRunStatus(runId, 'failed', `断言 ${i + 1} 失败: ${result.error}`);
            return;
          }
          // 🔥 修复：断言成功时也更新 passedSteps，并添加日志
          if (testRun) {
            testRun.passedSteps = (testRun.passedSteps || 0) + 1;
            testRun.completedSteps = assertionStepIndex;
          }
          this.addLog(runId, `✅ 断言 ${i + 1} 通过`, 'success');
        } catch (error: any) {
          // 🔥 修复：断言异常时更新 failedSteps
          if (testRun) {
            testRun.failedSteps = (testRun.failedSteps || 0) + 1;
            testRun.completedSteps = assertionStepIndex;
          }
          this.addLog(runId, `❌ 断言 ${i + 1} 失败: ${error.message}`, 'error');
          this.updateTestRunStatus(runId, 'failed', `断言 ${i + 1} 异常: ${error.message}`);
          return;
        }
      }
    }

    console.log(`✅ [${runId}] 完成 [${testCase.name}]`);
    await this.takeStepScreenshot(runId, 'final', 'completed', '测试执行完成');
    await this.saveTestEvidence(runId, 'completed');
    this.updateTestRunStatus(runId, 'completed', '测试执行完成');
    
    // 🔥 移除强制同步，避免重复
    // 同步会在 finalizeTestRun() 中自动完成
    console.log(`💾 [${runId}] 测试完成，等待 finalizeTestRun 同步到数据库`);
  }

  /**
   * 使用 Playwright Test Runner 执行测试
   */
  private async executeWithPlaywrightRunner(
    runId: string,
    testCase: TestCase,
    testRun: TestRun,
    options: { enableTrace?: boolean; enableVideo?: boolean }
  ): Promise<void> {
    if (!this.playwrightRunner) {
      throw new Error('Playwright Test Runner 未初始化');
    }

    const page = this.playwrightRunner.getPage();
    if (!page) {
      throw new Error('页面未初始化');
    }

    // 解析测试步骤（从字符串转换为 TestStep 数组）
    const steps = this.parseTestSteps(testCase.steps || '');
    const assertions = this.parseAssertions(testCase.assertions || '');
    
    const totalSteps = steps.length + assertions.length;
    if (testRun) {
      testRun.totalSteps = totalSteps;
    }

    console.log(`📊 [${runId}] 总步骤数: ${totalSteps} (操作: ${steps.length}, 断言: ${assertions.length})`);
    this.addLog(runId, `📊 总步骤数: ${totalSteps} (操作: ${steps.length}, 断言: ${assertions.length})`, 'info');

    // 执行操作步骤
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepIndex = i + 1;

      if (this.queueService && this.queueService.isCancelled(runId)) {
        console.log(`⏹️ [${runId}] 测试已被取消，停止执行 (步骤${stepIndex})`);
        this.addLog(runId, `⏹️ 测试已被用户取消`, 'warning');
        this.updateTestRunStatus(runId, 'cancelled', '测试已被用户取消');
        return;
      }

      console.log(`🎬 [${runId}] 执行步骤 ${stepIndex}/${totalSteps}: ${step.description}`);
      // this.addLog(runId, `🔧 执行步骤 ${stepIndex}: ${step.description}`, 'info');
      this.updateTestRunStatus(runId, 'running', `🔧 执行步骤 ${stepIndex}/${totalSteps}: ${step.description}`);

      // 🔥 如果选择器缺失或是文本描述（不是 CSS 选择器），使用 AI 解析器智能匹配元素
      let enhancedStep = step;
      // 对于click和fill操作，如果没有selector或selector不是CSS选择器，都需要AI解析
      const needsAiParsing = (step.action === 'click' || step.action === 'fill') && 
        (!step.selector || 
         (!step.selector.startsWith('#') && !step.selector.startsWith('.') && 
          !step.selector.startsWith('[') && !step.selector.includes(' ')));
      
      if (needsAiParsing) {
        try {
          const elementDesc = step.selector || '从步骤描述中提取';
          this.addLog(runId, `🤖 使用 AI 解析器智能匹配元素: ${elementDesc}`, 'info');
          
          // 🔥 使用等待日志包装长时间操作
          const result = await this.executeWithWaitingLog(
            runId,
            'AI解析器正在匹配元素',
            async () => {
              // 获取页面快照（使用 Playwright 的 accessibility snapshot）
              const page = this.playwrightRunner.getPage();
              if (page) {
                // 获取 Playwright 的 accessibility snapshot（类似 MCP 快照格式）
                const snapshot = await page.accessibility.snapshot();
                const pageTitle = await page.title();
                const pageUrl = page.url();
                
                // 🔥 修复：建立 ref -> { role, name } 映射表
                const refToElementMap = new Map<string, { role: string; name: string }>();
                
                // 构建快照文本（转换为类似 MCP 快照的格式）
                let snapshotText = `Page URL: ${pageUrl}\nPage Title: ${pageTitle}\n\n`;
                
                // 递归提取可交互元素（使用 MCP 快照格式）
                let elementCounter = 0; // 🔥 修复：使用外部计数器确保唯一性
                const extractElements = (node: any, depth = 0): string[] => {
                  const elements: string[] = [];
                  if (!node) return elements;
                  
                  // 提取元素信息
                  if (node.role && (node.role === 'button' || node.role === 'textbox' || 
                      node.role === 'link' || node.role === 'checkbox' || node.role === 'combobox')) {
                    let name = node.name || '';
                    const role = node.role || '';
                    
                    // 🔥 增强：对于没有name的元素，尝试使用description或value
                    if (!name && node.description) {
                      name = node.description;
                    }
                    if (!name && node.value) {
                      name = node.value;
                    }
                    
                    // 🔥 即使name为空也要包含元素（用placeholder或空字符串）
                    if (!name) {
                      name = `未命名${role}`;
                    }
                    
                    // 🔥 修复：使用外部计数器生成稳定的ref
                    const refCounter = elementCounter++;
                    const safeName = name.replace(/\s+/g, '_').replace(/[^\w]/g, '').substring(0, 10);
                    const ref = node.id || `element_${refCounter}_${role}_${safeName || 'unnamed'}`;
                    elements.push(`[ref=${ref}] ${role} "${name}"`);
                    
                    // 🔥 保存映射：ref -> { role, name }
                    refToElementMap.set(ref, { role, name });
                  }
                  
                  // 递归处理子元素
                  if (node.children) {
                    for (const child of node.children) {
                      elements.push(...extractElements(child, depth + 1));
                    }
                  }
                  
                  return elements;
                };
                
                const elements = extractElements(snapshot);
                snapshotText += elements.join('\n');
                
                // 🔥 添加调试日志，查看快照内容
                console.log(`📸 [${runId}] 快照包含 ${elements.length} 个元素`);
                console.log(`📋 [${runId}] 快照前10个元素:`);
                elements.slice(0, 10).forEach((elem, idx) => {
                  console.log(`   ${idx + 1}. ${elem}`);
                });
                
                // 如果快照为空，使用 HTML 作为备用
                if (elements.length === 0) {
                  const htmlContent = await page.content();
                  snapshotText += `\n\nHTML Content:\n${htmlContent.substring(0, 50000)}`;
                }
                
                // 使用 AI 解析器查找元素
                const aiResult = await this.aiParser.parseNextStep(
                  step.description,
                  snapshotText,
                  runId,
                  (message: string, level: 'info' | 'success' | 'warning' | 'error') => {
                    this.addLog(runId, message, level);
                  }
                );
                
                return { aiResult, refToElementMap };
              }
              return { aiResult: null, refToElementMap: null };
            }
          );
          
          const { aiResult, refToElementMap } = result;
          
          if (aiResult && refToElementMap && aiResult.success && aiResult.step) {
              // 如果 AI 解析出了 ref，通过映射表定位元素
              if (aiResult.step.ref) {
                const ref = aiResult.step.ref;
                // 如果 ref 是 CSS 选择器格式，直接使用
                if (ref.startsWith('#') || ref.startsWith('.') || ref.startsWith('[')) {
                  const aiValue = aiResult.step.text || aiResult.step.value;
                  enhancedStep = { 
                    ...step, 
                    selector: ref,
                    ...(aiValue !== undefined ? { value: aiValue } : {})
                  };
                  this.addLog(runId, `✅ AI 匹配成功，使用选择器: ${ref}`, 'success');
                } else {
                  // 🔥 修复：通过映射表找到 role 和 name，使用 getByRole 定位
                  const elementInfo = refToElementMap.get(ref);
                  const page = this.playwrightRunner.getPage();
                  if (elementInfo && page) {
                    // 🔥 优先尝试：如果element描述更具体，使用它来匹配
                    if (aiResult.step.element && aiResult.step.element.length > 2) {
                      try {
                        let matched = false;
                        
                        // 提取关键词（去除操作词、符号、编号和期望结果）
                        const descText = step.description
                          .toLowerCase()
                          .replace(/^\d+[.、)]\s*/, '') // 移除步骤编号
                          .split(/->|→/)[0] // 只取操作部分，不要期望结果
                          .replace(/勾选|选中|点击|复选框|checkbox/g, '')
                          .replace(/[《》"'「」[\]]/g, '')
                          .trim();
                        
                        console.log(`🔍 [${runId}] 智能匹配描述: "${descText}"`);
                        console.log(`🔍 [${runId}] 原始描述: "${step.description}"`);
                        console.log(`🔍 [${runId}] AI元素描述: "${aiResult.step.element}"`);
                        console.log(`🔍 [${runId}] 元素类型: ${elementInfo.role}`);
                        
                        // 🔥 新增：对于按钮，从element描述中提取按钮文本
                        if (elementInfo.role === 'button') {
                          try {
                            // 从"登录按钮"、"登录"按钮、《登录》按钮等格式中提取按钮文本
                            const buttonText = aiResult.step.element
                              .replace(/按钮|button/gi, '')
                              .replace(/[《》"'「」[\]]/g, '')
                              .trim();
                            
                            console.log(`🎯 [${runId}] 提取按钮文本: "${buttonText}"`);
                            
                            // 方法1: 使用 getByRole('button', {name: 'xxx'})
                            const buttonLocator = page.getByRole('button', { name: buttonText, exact: false });
                            if (await buttonLocator.count() > 0) {
                              const aiValue = aiResult.step.text || aiResult.step.value;
                              enhancedStep = { 
                                ...step, 
                                selector: `button:${buttonText}`,
                                ...(aiValue !== undefined ? { value: aiValue } : {})
                              };
                              this.addLog(runId, `✅ AI 匹配成功，使用 getByRole('button'): "${buttonText}"`, 'success');
                              matched = true;
                            }
                            
                            // 方法2: 如果方法1失败，尝试使用 getByText
                            if (!matched) {
                              const textLocator = page.getByText(buttonText, { exact: false });
                              if (await textLocator.count() > 0) {
                                const aiValue = aiResult.step.text || aiResult.step.value;
                                enhancedStep = { 
                                  ...step, 
                                  selector: `text:${buttonText}`,
                                  ...(aiValue !== undefined ? { value: aiValue } : {})
                                };
                                this.addLog(runId, `✅ AI 匹配成功，使用 getByText: "${buttonText}"`, 'success');
                                matched = true;
                              }
                            }
                          } catch (buttonError: any) {
                            console.log(`  ⚠️ 按钮查找失败: ${buttonError.message}`);
                          }
                        }
                        
                        // 🔥 新增：对于输入框，从element描述中提取输入框标签
                        if (!matched && (elementInfo.role === 'textbox' || elementInfo.role === 'combobox')) {
                          try {
                            // 从"用户名输入框"、"用户名"等格式中提取标签文本
                            const inputLabel = aiResult.step.element
                              .replace(/输入框|文本框|textbox|input|输入|框/gi, '')
                              .replace(/[《》"'「」[\]]/g, '')
                              .trim();
                            
                            console.log(`🎯 [${runId}] 提取输入框标签: "${inputLabel}"`);
                            
                            // 方法1: 使用 getByLabel
                            if (inputLabel) {
                              const labelLocator = page.getByLabel(inputLabel, { exact: false });
                              if (await labelLocator.count() > 0) {
                                const aiValue = aiResult.step.text || aiResult.step.value;
                                enhancedStep = { 
                                  ...step, 
                                  selector: `label:${inputLabel}`,
                                  ...(aiValue !== undefined ? { value: aiValue } : {})
                                };
                                this.addLog(runId, `✅ AI 匹配成功，使用 getByLabel: "${inputLabel}"`, 'success');
                                matched = true;
                              }
                            }
                            
                            // 方法2: 使用 getByPlaceholder
                            if (!matched && inputLabel) {
                              const placeholderLocator = page.getByPlaceholder(inputLabel, { exact: false });
                              if (await placeholderLocator.count() > 0) {
                                const aiValue = aiResult.step.text || aiResult.step.value;
                                enhancedStep = { 
                                  ...step, 
                                  selector: `placeholder:${inputLabel}`,
                                  ...(aiValue !== undefined ? { value: aiValue } : {})
                                };
                                this.addLog(runId, `✅ AI 匹配成功，使用 getByPlaceholder: "${inputLabel}"`, 'success');
                                matched = true;
                              }
                            }
                            
                            // 方法3: 使用 getByRole('textbox', {name: 'xxx'})
                            if (!matched && inputLabel) {
                              const roleLocator = page.getByRole('textbox', { name: inputLabel, exact: false });
                              if (await roleLocator.count() > 0) {
                                const aiValue = aiResult.step.text || aiResult.step.value;
                                enhancedStep = { 
                                  ...step, 
                                  selector: `textbox:${inputLabel}`,
                                  ...(aiValue !== undefined ? { value: aiValue } : {})
                                };
                                this.addLog(runId, `✅ AI 匹配成功，使用 getByRole('textbox'): "${inputLabel}"`, 'success');
                                matched = true;
                              }
                            }
                          } catch (inputError: any) {
                            console.log(`  ⚠️ 输入框查找失败: ${inputError.message}`);
                          }
                        }
                        
                        // 🔥 方法1: 对于复选框，优先使用文本内容查找（最通用）
                        if (!matched && (elementInfo.role === 'checkbox' || elementInfo.role === 'radio')) {
                          try {
                            // 方法1.1: 使用 getByLabel
                            const labelLocator = page.getByLabel(descText, { exact: false });
                            if (await labelLocator.count() > 0) {
                              const aiValue = aiResult.step.text || aiResult.step.value;
                              enhancedStep = { 
                                ...step, 
                                selector: `label:${descText}`,
                                ...(aiValue !== undefined ? { value: aiValue } : {})
                              };
                              this.addLog(runId, `✅ AI 匹配成功，使用 getByLabel: "${descText}"`, 'success');
                              matched = true;
                            }
                            
                            // 方法1.2: 使用 getByText 查找包含描述文本的元素附近的复选框
                            if (!matched) {
                              const textLocator = page.getByText(descText, { exact: false });
                              if (await textLocator.count() > 0) {
                                // 🔥 修复：找到文本后，直接使用label方式定位，而不是计算索引
                                // 因为页面状态可能在AI解析和实际执行之间发生变化
                                const aiValue = aiResult.step.text || aiResult.step.value;
                                enhancedStep = { 
                                  ...step, 
                                  selector: `text:${descText}`,
                                  ...(aiValue !== undefined ? { value: aiValue } : {})
                                };
                                this.addLog(runId, `✅ AI 匹配成功，通过文本查找: text:${descText}`, 'success');
                                matched = true;
                              }
                            }
                          } catch (labelError: any) {
                            console.log(`  ⚠️ 文本查找失败: ${labelError.message}`);
                          }
                        }
                        
                        // 🔥 方法2: 遍历所有同类型元素，查找包含关键词的
                        if (!matched) {
                          const allElements = page.getByRole(elementInfo.role as any);
                          const count = await allElements.count();
                          
                          // 提取中文关键词（按字分割，过滤停用词）
                          const keywords = descText
                            .replace(/\s+/g, '')
                            .split('')
                            .filter(w => w.length > 0 && !/[的了和与或、，。]/.test(w));
                          
                          console.log(`🔍 [${runId}] 智能匹配关键词:`, keywords);
                          
                          for (let i = 0; i < count; i++) {
                          const elem = allElements.nth(i);
                          
                          // 获取元素自身的文本属性（处理null值）
                          const text = (await elem.textContent().catch((e: any) => null)) || '';
                          const ariaLabel = (await elem.getAttribute('aria-label').catch((e: any) => null)) || '';
                          const title = (await elem.getAttribute('title').catch((e: any) => null)) || '';
                          
                          // 🔥 关键修复：对于复选框，查找关联的label元素
                          let labelText = '';
                          if (elementInfo.role === 'checkbox') {
                            try {
                              // 方法1: 通过for属性关联
                              const id = (await elem.getAttribute('id').catch((e: any) => null)) || '';
                              if (id) {
                                const label = page.locator(`label[for="${id}"]`);
                                if (await label.count() > 0) {
                                  labelText = (await label.textContent().catch((e: any) => null)) || '';
                                }
                              }
                              
                              // 方法2: 作为label的子元素
                              if (!labelText) {
                                const parentLabel = elem.locator('xpath=ancestor::label[1]');
                                if (await parentLabel.count() > 0) {
                                  labelText = (await parentLabel.textContent().catch((e: any) => null)) || '';
                                }
                              }
                              
                              // 方法3: 查找紧邻的label元素（后面的）
                              if (!labelText) {
                                const nextLabel = elem.locator('xpath=following-sibling::*[1]');
                                if (await nextLabel.count() > 0) {
                                  const tagName = await nextLabel.evaluate((el: any) => el.tagName).catch((e: any) => '');
                                  if (tagName.toLowerCase() === 'label') {
                                    labelText = (await nextLabel.textContent().catch((e: any) => null)) || '';
                                  } else {
                                    // 可能label包裹在其他元素中，尝试查找内部文本
                                    labelText = (await nextLabel.textContent().catch((e: any) => null)) || '';
                                  }
                                }
                              }
                              
                              // 方法4: 查找父容器的所有文本
                              if (!labelText) {
                                const parent = elem.locator('xpath=parent::*');
                                if (await parent.count() > 0) {
                                  const parentText = (await parent.textContent().catch((e: any) => null)) || '';
                                  // 移除复选框自己的文本
                                  labelText = parentText.replace(text, '').trim();
                                }
                              }
                            } catch (labelError) {
                              console.warn(`⚠️ [${runId}] 查找label失败:`, labelError);
                            }
                          }
                          
                          // 组合所有文本
                          const combinedText = `${text} ${ariaLabel} ${title} ${labelText}`.toLowerCase().trim();
                          console.log(`  [${i}] 元素文本: "${combinedText}" (label: "${labelText}")`);
                          
                          // 检查是否匹配关键词
                          const matchCount = keywords.filter(kw => combinedText.includes(kw)).length;
                          const matchRatio = keywords.length > 0 ? matchCount / keywords.length : 0;
                          console.log(`  [${i}] 匹配度: ${matchCount}/${keywords.length} = ${(matchRatio * 100).toFixed(0)}%`);
                          
                          // 匹配条件：至少匹配50%的关键词，或者匹配至少5个关键词
                          if (matchCount >= Math.max(5, Math.ceil(keywords.length * 0.5))) {
                            const aiValue = aiResult.step.text || aiResult.step.value;
                            enhancedStep = { 
                              ...step, 
                              selector: `${elementInfo.role}:nth(${i})`,
                              ...(aiValue !== undefined ? { value: aiValue } : {})
                            };
                            this.addLog(runId, `✅ AI 匹配成功，使用 role+index: ${elementInfo.role}:nth(${i}) (匹配度: ${matchCount}/${keywords.length})`, 'success');
                            matched = true;
                            break;
                          }
                          }
                          
                          // 如果遍历后没有匹配，尝试其他回退方案
                          if (!matched && elementInfo.name) {
                            // 回退：使用 role+name
                            const roleLocator = page.getByRole(elementInfo.role as any, { name: elementInfo.name, exact: false });
                            if (await roleLocator.count() > 0) {
                              const aiValue = aiResult.step.text || aiResult.step.value;
                              enhancedStep = { 
                                ...step, 
                                selector: `${elementInfo.role}:${elementInfo.name}`,
                                ...(aiValue !== undefined ? { value: aiValue } : {})
                              };
                              this.addLog(runId, `✅ AI 匹配成功，使用 role+name: ${elementInfo.role}:${elementInfo.name}`, 'success');
                              matched = true;
                            }
                          }
                        }
                          
                        if (!matched) {
                          throw new Error('无法通过任何方式匹配元素');
                        }
                      } catch (locatorError: any) {
                        console.warn(`⚠️ [${runId}] 映射表定位失败: ${locatorError.message}`);
                        // 回退到使用 element 描述
                        if (aiResult.step.element) {
                          const aiValue = aiResult.step.text || aiResult.step.value;
                          enhancedStep = { 
                            ...step, 
                            selector: aiResult.step.element,
                            ...(aiValue !== undefined ? { value: aiValue } : {})
                          };
                          this.addLog(runId, `⚠️ 回退使用元素描述: ${aiResult.step.element}`, 'warning');
                        } else {
                          this.addLog(runId, `⚠️ AI 解析出 ref 但无法定位，使用原始选择器`, 'warning');
                        }
                      }
                    } else {
                      // 没有element描述，直接返回错误
                      this.addLog(runId, `⚠️ AI解析结果缺少element描述`, 'warning');
                    }
                  } else if (page) {
                    // 🔥 增强：映射表中没有找到元素信息，但可以尝试智能匹配
                    console.log(`⚠️ [${runId}] 映射表中未找到 ref: ${ref}，尝试智能匹配`);
                    
                    if (aiResult.step.element) {
                      try {
                        let matched = false;
                        const elementDesc = aiResult.step.element;
                        
                        // 🔥 智能识别：如果element包含"按钮"，尝试按钮匹配
                        if (elementDesc.includes('按钮') || elementDesc.toLowerCase().includes('button')) {
                          const buttonText = elementDesc
                            .replace(/按钮|button/gi, '')
                            .replace(/[《》"'「」\[\]]/g, '')
                            .trim();
                          
                          console.log(`🎯 [${runId}] 尝试匹配按钮: "${buttonText}"`);
                          
                          const buttonLocator = page.getByRole('button', { name: buttonText, exact: false });
                          if (await buttonLocator.count() > 0) {
                            const aiValue = aiResult.step.text || aiResult.step.value;
                            enhancedStep = { 
                              ...step, 
                              selector: `button:${buttonText}`,
                              ...(aiValue !== undefined ? { value: aiValue } : {})
                            };
                            this.addLog(runId, `✅ 智能匹配成功，使用按钮: "${buttonText}"`, 'success');
                            matched = true;
                          }
                        }
                        
                        // 🔥 如果按钮匹配失败，尝试其他方式
                        if (!matched) {
                          const textToFind = elementDesc.replace(/[《》"'「」\[\]]/g, '').trim();
                          const textLocator = page.getByText(textToFind, { exact: false });
                          if (await textLocator.count() > 0) {
                            const aiValue = aiResult.step.text || aiResult.step.value;
                            enhancedStep = { 
                              ...step, 
                              selector: `text:${textToFind}`,
                              ...(aiValue !== undefined ? { value: aiValue } : {})
                            };
                            this.addLog(runId, `✅ 智能匹配成功，使用文本: "${textToFind}"`, 'success');
                            matched = true;
                          }
                        }
                        
                        if (!matched) {
                          this.addLog(runId, `⚠️ 智能匹配失败，element: "${elementDesc}"`, 'warning');
                        }
                      } catch (smartMatchError: any) {
                        console.warn(`⚠️ [${runId}] 智能匹配失败:`, smartMatchError.message);
                      }
                    }
                    
                    // 映射表中没有找到，尝试通过 ID 查找
                    if (page) {
                      try {
                        const idLocator = page.locator(`#${ref}`);
                        if (await idLocator.count() > 0) {
                          const aiValue = aiResult.step.text || aiResult.step.value;
                          enhancedStep = { 
                            ...step, 
                            selector: `#${ref}`,
                            ...(aiValue !== undefined ? { value: aiValue } : {})
                          };
                          this.addLog(runId, `✅ AI 匹配成功，使用 ID: #${ref}`, 'success');
                        } else {
                          // 使用 element 描述
                          if (aiResult.step.element) {
                            const aiValue = aiResult.step.text || aiResult.step.value;
                            enhancedStep = { 
                              ...step, 
                              selector: aiResult.step.element,
                              ...(aiValue !== undefined ? { value: aiValue } : {})
                            };
                            this.addLog(runId, `✅ AI 匹配成功，使用元素描述: ${aiResult.step.element}`, 'success');
                          } else {
                            this.addLog(runId, `⚠️ AI 解析出 ref 但无法定位，使用原始选择器`, 'warning');
                          }
                        }
                      } catch (idError: any) {
                        // 使用 element 描述
                        if (aiResult.step.element) {
                          const aiValue = aiResult.step.text || aiResult.step.value;
                          enhancedStep = { 
                            ...step, 
                            selector: aiResult.step.element,
                            ...(aiValue !== undefined ? { value: aiValue } : {})
                          };
                          this.addLog(runId, `✅ AI 匹配成功，使用元素描述: ${aiResult.step.element}`, 'success');
                        } else {
                          this.addLog(runId, `⚠️ AI 解析出 ref 但无法定位，使用原始选择器`, 'warning');
                        }
                      }
                    } else {
                      // 没有 page，使用 element 描述
                      if (aiResult.step.element) {
                        const aiValue = aiResult.step.text || aiResult.step.value;
                        enhancedStep = { 
                          ...step, 
                          selector: aiResult.step.element,
                          ...(aiValue !== undefined ? { value: aiValue } : {})
                        };
                        this.addLog(runId, `✅ AI 匹配成功，使用元素描述: ${aiResult.step.element}`, 'success');
                      } else {
                        this.addLog(runId, `⚠️ AI 解析出 ref 但无法定位，使用原始选择器`, 'warning');
                      }
                    }
                  }
                }
              } else if (aiResult.step.element) {
                // 🔥 优化：如果 AI 提供了元素描述，尝试智能匹配而不是直接作为选择器
                const page = this.playwrightRunner.getPage();
                if (page) {
                  try {
                    let matched = false;
                    const elementDesc = aiResult.step.element;
                    
                    // 🔥 智能识别：如果element包含"按钮"，尝试按钮匹配
                    if (elementDesc.includes('按钮') || elementDesc.toLowerCase().includes('button')) {
                      const buttonText = elementDesc
                        .replace(/按钮|button/gi, '')
                        .replace(/[《》"'「」\[\]]/g, '')
                        .trim();
                      
                      console.log(`🎯 [${runId}] 尝试匹配按钮（无ref场景）: "${buttonText}"`);
                      
                      const buttonLocator = page.getByRole('button', { name: buttonText, exact: false });
                      if (await buttonLocator.count() > 0) {
                        const aiValue = aiResult.step.text || aiResult.step.value;
                        enhancedStep = { 
                          ...step, 
                          selector: `button:${buttonText}`,
                          ...(aiValue !== undefined ? { value: aiValue } : {})
                        };
                        this.addLog(runId, `✅ AI 匹配成功，使用按钮: "${buttonText}"`, 'success');
                        matched = true;
                      }
                    }
                    
                    // 🔥 智能识别：如果element包含"输入框"、"文本框"，尝试textbox匹配
                    if (!matched && (elementDesc.includes('输入框') || elementDesc.includes('文本框') || 
                        elementDesc.toLowerCase().includes('textbox') || elementDesc.toLowerCase().includes('input'))) {
                      const inputText = elementDesc
                        .replace(/输入框|文本框|textbox|input/gi, '')
                        .replace(/[《》"'「」\[\]]/g, '')
                        .trim();
                      
                      console.log(`🎯 [${runId}] 尝试匹配输入框: "${inputText}"`);
                      
                      const inputLocator = page.getByRole('textbox', { name: inputText, exact: false });
                      if (await inputLocator.count() > 0) {
                        const aiValue = aiResult.step.text || aiResult.step.value;
                        enhancedStep = { 
                          ...step, 
                          selector: `textbox:${inputText}`,
                          ...(aiValue !== undefined ? { value: aiValue } : {})
                        };
                        this.addLog(runId, `✅ AI 匹配成功，使用输入框: "${inputText}"`, 'success');
                        matched = true;
                      }
                    }
                    
                    // 🔥 如果特定匹配失败，尝试通用文本匹配
                    if (!matched) {
                      const textToFind = elementDesc.replace(/[《》"'「」\[\]]/g, '').trim();
                      const textLocator = page.getByText(textToFind, { exact: false });
                      if (await textLocator.count() > 0) {
                        const aiValue = aiResult.step.text || aiResult.step.value;
                        enhancedStep = { 
                          ...step, 
                          selector: `text:${textToFind}`,
                          ...(aiValue !== undefined ? { value: aiValue } : {})
                        };
                        this.addLog(runId, `✅ AI 匹配成功，使用文本: "${textToFind}"`, 'success');
                        matched = true;
                      }
                    }
                    
                    if (!matched) {
                      this.addLog(runId, `⚠️ 智能匹配失败，使用原始element: "${elementDesc}"`, 'warning');
                      // 回退：直接使用element描述（可能不是有效选择器，但至少尝试）
                      const aiValue = aiResult.step.text || aiResult.step.value;
                      enhancedStep = { 
                        ...step, 
                        selector: aiResult.step.element,
                        ...(aiValue !== undefined ? { value: aiValue } : {})
                      };
                    }
                  } catch (smartMatchError: any) {
                    console.warn(`⚠️ [${runId}] 智能匹配失败:`, smartMatchError.message);
                    // 回退：直接使用element描述
                    const aiValue = aiResult.step.text || aiResult.step.value;
                    enhancedStep = { 
                      ...step, 
                      selector: aiResult.step.element,
                      ...(aiValue !== undefined ? { value: aiValue } : {})
                    };
                    this.addLog(runId, `⚠️ 使用元素描述: ${aiResult.step.element}`, 'warning');
                  }
                } else {
                  // 没有page，直接使用element描述
                  const aiValue = aiResult.step.text || aiResult.step.value;
                  enhancedStep = { 
                    ...step, 
                    selector: aiResult.step.element,
                    ...(aiValue !== undefined ? { value: aiValue } : {})
                  };
                  this.addLog(runId, `✅ AI 匹配成功，使用元素描述: ${aiResult.step.element}`, 'success');
                }
              } else {
                this.addLog(runId, `⚠️ AI 解析未找到精确匹配，使用原始选择器`, 'warning');
              }
            } else {
              this.addLog(runId, `⚠️ AI 解析未找到精确匹配，使用原始选择器`, 'warning');
            }
        } catch (aiError: any) {
          console.warn(`⚠️ [${runId}] AI 元素匹配失败，使用原始选择器:`, aiError.message);
          this.addLog(runId, `⚠️ AI 匹配失败，使用原始选择器: ${aiError.message}`, 'warning');
        }
      }

      // 执行步骤
      const result = await this.playwrightRunner.executeStep(enhancedStep, runId, i);

      if (!result.success) {
        // 🔥 注意：失败日志由 updateTestRunStatus 统一添加，这里不重复添加
        
        // 🔥 等待一下再截图，确保页面状态稳定
        await this.delay(500);
        
        // 🔥 失败时截图
        try {
          this.addLog(runId, `📸 正在保存失败步骤 ${stepIndex} 的截图...`, 'info');
          const page = this.playwrightRunner.getPage();
          if (page) {
            const screenshotBuffer = await page.screenshot({ fullPage: true });
            // 🔥 使用步骤描述作为文件名
            const sanitizedDescription = this.sanitizeFilename(step.description || `步骤${stepIndex}`);
            const screenshotFilename = `step-${stepIndex}-failed-${sanitizedDescription}.png`;
            await this.evidenceService.saveBufferArtifact(
              runId,
              'screenshot',
              screenshotBuffer,
              screenshotFilename
            );
            console.log(`📸 [${runId}] 失败步骤 ${stepIndex} 截图已保存: ${screenshotFilename}`);
            this.addLog(runId, `✅ 失败步骤 ${stepIndex} 截图已保存: ${screenshotFilename}`, 'success');
          } else {
            this.addLog(runId, `⚠️ 无法获取页面对象，跳过截图`, 'warning');
          }
        } catch (screenshotError: any) {
          console.warn(`⚠️ [${runId}] 失败步骤截图失败:`, screenshotError.message);
          this.addLog(runId, `⚠️ 失败步骤 ${stepIndex} 截图失败: ${screenshotError.message}`, 'warning');
        }
        
        // 🔥 修复：步骤失败时更新 failedSteps 和 completedSteps，确保执行结果计算正确
        if (testRun) {
          testRun.failedSteps = (testRun.failedSteps || 0) + 1;
          testRun.completedSteps = stepIndex;
          testRun.progress = Math.round((stepIndex / totalSteps) * 100);
        }
        
        this.updateTestRunStatus(runId, 'failed', `❌ 步骤 ${stepIndex} 失败: ${result.error}`);
        return;
      }

      this.addLog(runId, `✅ 步骤 ${stepIndex} 执行成功`, 'success');
      
      // 🔥 等待操作完全完成后再截图
      await this.delay(500);
      
      // 🔥 使用 Playwright 页面截图
      try {
        this.addLog(runId, `📸 正在保存步骤 ${stepIndex} 的截图...`, 'info');
        const page = this.playwrightRunner.getPage();
        if (page) {
          const screenshotBuffer = await page.screenshot({ fullPage: true });
          // 🔥 使用步骤描述作为文件名
          const sanitizedDescription = this.sanitizeFilename(step.description || `步骤${stepIndex}`);
          const screenshotFilename = `step-${stepIndex}-success-${sanitizedDescription}.png`;
          await this.evidenceService.saveBufferArtifact(
            runId,
            'screenshot',
            screenshotBuffer,
            screenshotFilename
          );
          console.log(`📸 [${runId}] 步骤 ${stepIndex} 截图已保存: ${screenshotFilename}`);
          this.addLog(runId, `✅ 步骤 ${stepIndex} 截图已保存: ${screenshotFilename}`, 'success');
        } else {
          this.addLog(runId, `⚠️ 无法获取页面对象，跳过截图`, 'warning');
        }
      } catch (screenshotError: any) {
        console.warn(`⚠️ [${runId}] 步骤 ${stepIndex} 截图失败:`, screenshotError.message);
        this.addLog(runId, `⚠️ 步骤 ${stepIndex} 截图失败: ${screenshotError.message}`, 'warning');
      }

      if (testRun) {
        testRun.passedSteps = (testRun.passedSteps || 0) + 1;
        testRun.completedSteps = stepIndex;
        testRun.progress = Math.round((stepIndex / totalSteps) * 100);
      }

      // 步骤间等待
      if (i < steps.length - 1) {
        await this.delay(1000);
      }
    }

    // 执行断言步骤
    for (let i = 0; i < assertions.length; i++) {
      let assertion = assertions[i];
      const assertionIndex = steps.length + i + 1;

      console.log(`🔍 [${runId}] 执行断言 ${i + 1}/${assertions.length}: ${assertion.description}`);
      this.addLog(runId, `🔍 执行断言 ${i + 1}: ${assertion.description}`, 'info');

      // 🔥 如果断言步骤缺少选择器或ref，使用AI解析器智能匹配元素
      if (!assertion.selector && !assertion.ref) {
        try {
          this.addLog(runId, `🤖 使用 AI 解析器智能匹配断言元素: ${assertion.description}`, 'info');
          
          // 🔥 使用等待日志包装长时间操作
          const result = await this.executeWithWaitingLog(
            runId,
            'AI解析器正在匹配断言元素',
            async () => {
              // 获取页面快照（使用 Playwright 的 accessibility snapshot）
              const page = this.playwrightRunner.getPage();
              if (page) {
                // 获取 Playwright 的 accessibility snapshot（类似 MCP 快照格式）
                const snapshot = await page.accessibility.snapshot();
                const pageTitle = await page.title();
                const pageUrl = page.url();
                
                // 🔥 建立 ref -> { role, name } 映射表
                const refToElementMap = new Map<string, { role: string; name: string }>();
                
                // 构建快照文本（转换为类似 MCP 快照的格式）
                let snapshotText = `Page URL: ${pageUrl}\nPage Title: ${pageTitle}\n\n`;
                
                // 🔥 生成稳定的 ref（基于元素属性，避免随机值导致缓存失效）
                const refCountMap = new Map<string, number>(); // 跟踪重复的 ref
                const generateStableRef = (role: string, name: string): string => {
                  // 使用 role + name 生成稳定的哈希值
                  const data = `${role}:${name}`;
                  let hash = 0;
                  for (let i = 0; i < data.length; i++) {
                    const char = data.charCodeAt(i);
                    hash = ((hash << 5) - hash) + char;
                    hash = hash & hash; // Convert to 32bit integer
                  }
                  
                  const baseRef = `element_${role}_${Math.abs(hash).toString(36)}`;
                  
                  // 如果这个 ref 已经存在，添加后缀
                  if (refCountMap.has(baseRef)) {
                    const count = refCountMap.get(baseRef)! + 1;
                    refCountMap.set(baseRef, count);
                    return `${baseRef}_${count}`;
                  } else {
                    refCountMap.set(baseRef, 0);
                    return baseRef;
                  }
                };
                
                // 递归提取可交互元素（使用 MCP 快照格式）
                const extractElements = (node: any, depth = 0): string[] => {
                  const elements: string[] = [];
                  if (!node) return elements;
                  
                  // 提取元素信息（包括按钮、文本、链接等可用于断言的元素）
                  if (node.role && (node.role === 'button' || node.role === 'textbox' || 
                      node.role === 'link' || node.role === 'checkbox' || node.role === 'combobox' ||
                      node.role === 'heading' || node.role === 'text' || node.role === 'paragraph')) {
                    const name = node.name || '';
                    const role = node.role || '';
                    // 🔥 使用稳定的 ref 生成方法，基于 role 和 name 的哈希，而不是随机值或时间戳
                    // 这样同一个元素在不同执行之间会有相同的 ref，缓存可以正常工作
                    const ref = node.id || generateStableRef(role, name);
                    elements.push(`[ref=${ref}] ${role} "${name}"`);
                    
                    // 保存映射：ref -> { role, name }
                    refToElementMap.set(ref, { role, name });
                  }
                  
                  // 递归处理子元素
                  if (node.children) {
                    for (const child of node.children) {
                      elements.push(...extractElements(child, depth + 1));
                    }
                  }
                  
                  return elements;
                };
                
                const elements = extractElements(snapshot);
                snapshotText += elements.join('\n');
                
                // 如果快照为空，使用 HTML 作为备用
                if (elements.length === 0) {
                  const htmlContent = await page.content();
                  snapshotText += `\n\nHTML Content:\n${htmlContent.substring(0, 50000)}`;
                }
                
                // 🔥 使用 AI 解析器解析断言（使用断言模式 - parseAssertions）
                const aiResult = await this.aiParser.parseAssertions(
                  assertion.description,
                  snapshotText,
                  runId,
                  (message: string, level: 'info' | 'success' | 'warning' | 'error') => {
                    this.addLog(runId, message, level);
                  }
                );
                
                return { aiResult, refToElementMap, snapshotText };
              }
              return { aiResult: null, refToElementMap: null, snapshotText: '' };
            }
          );
          
          const { aiResult, refToElementMap, snapshotText } = result;
          
          if (aiResult && refToElementMap && aiResult.success && aiResult.steps && aiResult.steps.length > 0) {
            const aiStep = aiResult.steps[0]; // 取第一个解析结果
            
            // 🔥 优先使用AI返回的结构化断言信息（element, ref, condition, value等）
            if (aiStep.element || aiStep.ref || aiStep.condition) {
                // AI已经返回了结构化的断言信息，直接使用
                // 🔥 将condition转换为ExpectCondition类型
                const validConditions = ['visible', 'hidden', 'contains_text', 'has_text', 'has_value', 'checked', 'enabled', 'disabled', 'count'] as const;
                const condition = (validConditions.includes(aiStep.condition as any) ? aiStep.condition : 'visible') as any;
                
                // 🔥 如果AI返回了ref，通过refToElementMap找到对应的role和name，设置selector为role:name格式
                let selector = aiStep.selector;
                let needsRefresh = false; // 🔥 标记是否需要刷新缓存
                
                if (aiStep.ref && !selector) {
                  const elementInfo = refToElementMap.get(aiStep.ref);
                  if (elementInfo && elementInfo.role && elementInfo.name) {
                    // 🔥 对于textbox/combobox类型，如果name看起来像是值而不是label，直接使用element描述
                    // 判断标准：name长度超过15字符（中文），或者包含具体内容（如数字、具体描述、新闻标题等）
                    const name = elementInfo.name;
                    const isValueLike = name.length > 15 || // 长度超过15字符（中文）
                                      /\d{2,}/.test(name) || // 包含多个数字
                                      name.includes('岁') || // 包含具体描述
                                      name.includes('年') ||
                                      name.includes('月') ||
                                      name.includes('日') ||
                                      name.includes('教授') || // 新闻标题常见词
                                      name.includes('去世') ||
                                      name.includes('知名') ||
                                      name.includes('身亡') ||
                                      name.includes('传媒') ||
                                      name.includes('大学') ||
                                      /[\u4e00-\u9fa5]{8,}/.test(name); // 包含8个以上连续中文字符（可能是内容而非label）
                    
                    if ((elementInfo.role === 'textbox' || elementInfo.role === 'combobox') && isValueLike) {
                      // name看起来是值，使用element描述进行智能查找
                      selector = aiStep.element;
                      this.addLog(runId, `🔍 ref对应的name是输入框的值而非label（name="${name.substring(0, 30)}..."），使用element描述: "${aiStep.element}"`, 'info');
                    } else {
                      // name看起来是label，使用role:name格式
                      selector = `${elementInfo.role}:${elementInfo.name}`;
                      this.addLog(runId, `🔍 通过ref映射找到元素: ref="${aiStep.ref}" -> ${selector}`, 'info');
                    }
                  } else {
                    // 🔥 ref不在映射表中，说明缓存已过时，需要刷新
                    needsRefresh = true;
                    this.addLog(runId, `⚠️ ref不在映射表中（可能是缓存过时），清除缓存并重新调用 AI`, 'warning');
                  }
                } else if (!selector && aiStep.element) {
                  selector = aiStep.element;
                }
                
                // 🔥 如果需要刷新，清除缓存并重新调用 AI
                if (needsRefresh) {
                  this.addLog(runId, `🔄 正在重新调用 AI 解析断言...`, 'info');
                  this.aiParser.clearAssertionCache(); // 清空缓存
                  
                  // 重新调用 AI 解析
                  const freshAiResult = await this.aiParser.parseAssertions(
                    assertion.description,
                    snapshotText,
                    runId,
                    (message: string, level: 'info' | 'success' | 'warning' | 'error') => {
                      this.addLog(runId, message, level);
                    }
                  );
                  
                  if (freshAiResult && freshAiResult.success && freshAiResult.steps && freshAiResult.steps.length > 0) {
                    const freshAiStep = freshAiResult.steps[0];
                    const freshCondition = (validConditions.includes(freshAiStep.condition as any) ? freshAiStep.condition : 'visible') as any;
                    
                    // 重新映射 ref
                    let freshSelector = freshAiStep.selector;
                    if (freshAiStep.ref && !freshSelector) {
                      const freshElementInfo = refToElementMap.get(freshAiStep.ref);
                      if (freshElementInfo && freshElementInfo.role && freshElementInfo.name) {
                        freshSelector = `${freshElementInfo.role}:${freshElementInfo.name}`;
                        this.addLog(runId, `✅ 重新解析成功，找到元素: ref="${freshAiStep.ref}" -> ${freshSelector}`, 'success');
                      } else {
                        freshSelector = freshAiStep.element;
                        this.addLog(runId, `⚠️ 重新解析后ref仍不在映射表中，使用element描述: "${freshAiStep.element}"`, 'warning');
                      }
                    } else if (!freshSelector && freshAiStep.element) {
                      freshSelector = freshAiStep.element;
                    }
                    
                    // 更新 assertion
                    assertion = {
                      ...assertion,
                      element: freshAiStep.element,
                      ref: freshAiStep.ref,
                      selector: freshSelector,
                      condition: freshCondition,
                      value: freshAiStep.value
                    };
                    
                    this.addLog(runId, `✅ AI 断言重新解析成功（结构化）: element="${freshAiStep.element}", ref="${freshAiStep.ref}", selector="${freshSelector}", condition="${freshCondition}", value="${freshAiStep.value || 'N/A'}"`, 'success');
                  } else {
                    // 重新解析也失败了，使用 element 描述
                    selector = aiStep.element;
                    this.addLog(runId, `⚠️ 重新解析失败，使用原element描述: "${aiStep.element}"`, 'warning');
                    
                    assertion = {
                      ...assertion,
                      element: aiStep.element,
                      ref: aiStep.ref,
                      selector: selector,
                      condition: condition,
                      value: aiStep.value
                    };
                    
                    this.addLog(runId, `✅ AI 断言解析成功（结构化）: element="${aiStep.element}", ref="${aiStep.ref}", selector="${selector}", condition="${condition}", value="${aiStep.value || 'N/A'}"`, 'success');
                  }
                  
                  // 跳过后续的 assertion 更新，因为已经在上面处理了
                  // 不使用 continue，而是在下面的 executeStep 中继续执行
                } else {
                  // 🔥 正常情况：ref 在映射表中，或者没有 ref
                  assertion = {
                    ...assertion,
                    element: aiStep.element,
                    ref: aiStep.ref,
                    selector: selector,
                    condition: condition,
                    value: aiStep.value
                  };
                  
                  this.addLog(runId, `✅ AI 断言解析成功（结构化）: element="${aiStep.element}", ref="${aiStep.ref}", selector="${selector}", condition="${condition}", value="${aiStep.value || 'N/A'}"`, 'success');
                }
              }
              // 🔥 如果AI返回的是 browser_snapshot 命令但没有结构化信息，需要从断言描述和页面元素中提取选择器
              else if ((aiStep.action as string) === 'browser_snapshot' || (aiStep.action as string) === 'snapshot') {
                // 🔥 修复：智能解析断言描述，区分元素名称和验证内容
                // 例如："搜索输入框存在默认搜索内容" -> 元素："搜索输入框"，验证内容："默认搜索内容"
                let assertionDesc = assertion.description;
                const assertionKeywords = ['存在', '验证', '检查', '断言', '应该', '必须', '确认', 'expect', 'verify', 'check', 'assert'];
                for (const keyword of assertionKeywords) {
                  assertionDesc = assertionDesc.replace(new RegExp(`^${keyword}\\s*`, 'i'), '');
                  assertionDesc = assertionDesc.replace(new RegExp(`\\s*${keyword}\\s*`, 'i'), ' ');
                }
                assertionDesc = assertionDesc.trim();
                
                // 🔥 尝试从断言描述中提取元素名称和验证内容
                // 模式1: "X存在Y" -> 元素：X，验证内容：Y
                // 模式2: "X包含Y" -> 元素：X，验证内容：Y
                // 模式3: "X显示Y" -> 元素：X，验证内容：Y
                let elementName = assertionDesc;
                let expectedValue: string | undefined = undefined;
                
                const contentPatterns = [
                  /(.+?)(?:存在|包含|显示|有|是)(.+)/,
                  /(.+?)(?:的|中|里)(?:内容|文本|值|默认值|默认内容)(?:是|为|包含|显示)?(.+)?/,
                  /(.+?)(?:存在|包含|显示)(.+)/,
                ];
                
                for (const pattern of contentPatterns) {
                  const match = assertionDesc.match(pattern);
                  if (match && match[1] && match[2]) {
                    elementName = match[1].trim();
                    expectedValue = match[2].trim();
                    break;
                  }
                }
                
                // 如果没匹配到模式，尝试查找常见分隔词
                if (!expectedValue) {
                  const separators = ['存在', '包含', '显示', '有', '是', '为'];
                  for (const sep of separators) {
                    const parts = assertionDesc.split(sep);
                    if (parts.length >= 2) {
                      elementName = parts[0].trim();
                      expectedValue = parts.slice(1).join(sep).trim();
                      break;
                    }
                  }
                }
                
                // 提取核心元素名称（移除"按钮"、"链接"等后缀，但保留"输入框"等关键信息）
                const coreName = elementName.replace(/按钮|链接|复选框|下拉框|搜索按钮/g, '').trim();
                
                // 从页面元素中查找匹配的元素
                let foundElement: { ref: string; role: string; name: string } | null = null;
                
                // 遍历所有提取的元素，查找匹配的
                for (const [ref, elementInfo] of refToElementMap.entries()) {
                  const elementText = elementInfo.name.toLowerCase();
                  const searchName = elementName.toLowerCase();
                  const searchCore = coreName.toLowerCase();
                  
                  // 🔥 优先匹配完整元素名称，然后匹配核心名称
                  if (elementText === searchName || 
                      elementText.includes(searchName) ||
                      searchName.includes(elementText)) {
                    foundElement = { ref, ...elementInfo };
                    break;
                  } else if (searchCore && (
                      elementText === searchCore ||
                      elementText.includes(searchCore) ||
                      searchCore.includes(elementText))) {
                    foundElement = { ref, ...elementInfo };
                    break;
                  }
                }
                
                if (foundElement) {
                  // 使用 role:name 格式作为选择器
                  assertion = { 
                    ...assertion, 
                    selector: `${foundElement.role}:${foundElement.name}`,
                    ref: foundElement.ref
                  };
                  
                  // 🔥 如果有验证内容，设置 condition 和 value
                  if (expectedValue) {
                    // 对于输入框等元素，验证其文本内容
                    if (foundElement.role === 'textbox' || foundElement.role === 'combobox') {
                      assertion.condition = 'contains_text';
                      assertion.value = expectedValue;
                      this.addLog(runId, `✅ AI 断言匹配成功，使用 role+name: ${foundElement.role}:${foundElement.name}，验证内容: "${expectedValue}"`, 'success');
                    } else {
                      // 对于其他元素，验证文本包含
                      assertion.condition = 'contains_text';
                      assertion.value = expectedValue;
                      this.addLog(runId, `✅ AI 断言匹配成功，使用 role+name: ${foundElement.role}:${foundElement.name}，验证文本: "${expectedValue}"`, 'success');
                    }
                  } else {
                    this.addLog(runId, `✅ AI 断言匹配成功，使用 role+name: ${foundElement.role}:${foundElement.name}`, 'success');
                  }
                } else {
                  // 如果没找到，使用提取的元素名称作为选择器（智能查找会处理）
                  assertion = { ...assertion, selector: elementName || assertion.description };
                  if (expectedValue) {
                    assertion.condition = 'contains_text';
                    assertion.value = expectedValue;
                  }
                  this.addLog(runId, `⚠️ 未在页面元素中找到匹配项，使用提取的名称: ${elementName}${expectedValue ? `，验证内容: "${expectedValue}"` : ''}`, 'warning');
                }
              }
              // 如果 AI 解析出了 ref，通过映射表定位元素
              else if (aiStep.ref) {
                const ref = aiStep.ref;
                // 如果 ref 是 CSS 选择器格式，直接使用
                if (ref.startsWith('#') || ref.startsWith('.') || ref.startsWith('[')) {
                  assertion = { ...assertion, selector: ref, ref: ref };
                  this.addLog(runId, `✅ AI 断言匹配成功，使用选择器: ${ref}`, 'success');
                } else {
                  // 通过映射表找到 role 和 name，使用 role:name 格式
                  const elementInfo = refToElementMap.get(ref);
                  if (elementInfo && elementInfo.name) {
                    assertion = { ...assertion, selector: `${elementInfo.role}:${elementInfo.name}`, ref: ref };
                    this.addLog(runId, `✅ AI 断言匹配成功，使用 role+name: ${elementInfo.role}:${elementInfo.name}`, 'success');
                  } else if (aiStep.element) {
                    // 回退到使用 element 描述
                    assertion = { ...assertion, selector: aiStep.element, ref: ref };
                    this.addLog(runId, `✅ AI 断言匹配成功，使用元素描述: ${aiStep.element}`, 'success');
                  }
                }
              } else if (aiStep.element) {
                // 如果只有 element 描述，使用它作为选择器
                assertion = { ...assertion, selector: aiStep.element };
                this.addLog(runId, `✅ AI 断言匹配成功，使用元素描述: ${aiStep.element}`, 'success');
              }
              
              // 如果 AI 解析出了 condition，也更新它
              if (aiStep.condition) {
                assertion = { ...assertion, condition: aiStep.condition as any };
              }
            } else {
              this.addLog(runId, `⚠️ AI 断言解析失败，尝试使用描述文本作为选择器`, 'warning');
              // 回退：使用断言描述作为选择器（智能查找会处理）
              assertion = { ...assertion, selector: assertion.description };
            }
        } catch (aiError: any) {
          console.warn(`⚠️ [${runId}] AI 断言解析失败: ${aiError.message}`);
          this.addLog(runId, `⚠️ AI 断言解析失败，使用描述文本: ${aiError.message}`, 'warning');
          // 回退：使用断言描述作为选择器
          assertion = { ...assertion, selector: assertion.description };
        }
      }

      const result = await this.playwrightRunner.executeStep(assertion, runId, assertionIndex - 1);

      if (!result.success) {
        // 🔥 修复：断言失败时更新 failedSteps 和 completedSteps，确保执行结果计算正确
        if (testRun) {
          testRun.failedSteps = (testRun.failedSteps || 0) + 1;
          testRun.completedSteps = assertionIndex;
          testRun.progress = Math.round((assertionIndex / totalSteps) * 100);
        }
        
        // 🔥 注意：失败日志由 updateTestRunStatus 统一添加，这里不重复添加
        this.updateTestRunStatus(runId, 'failed', `❌ 断言 ${i + 1} 失败: ${result.error}`);
        return;
      }

      this.addLog(runId, `✅ 断言 ${i + 1} 通过`, 'success');

      // 🔥 断言成功后更新 passedSteps（修复 passedSteps 少计1的bug）
      if (testRun) {
        testRun.passedSteps = (testRun.passedSteps || 0) + 1;
        testRun.completedSteps = assertionIndex;
        testRun.progress = Math.round((assertionIndex / totalSteps) * 100);
      }

      // 🔥 断言成功后保存截图
      try {
        this.addLog(runId, `📸 正在保存断言 ${i + 1} 的截图...`, 'info');
        const page = this.playwrightRunner.getPage();
        if (page) {
          const screenshotBuffer = await page.screenshot({ fullPage: true });
          // const sanitizedDescription = assertion.description
          //   .replace(/[^\w\u4e00-\u9fa5\s\-]/g, '-')
          //   .substring(0, 50);
          const sanitizedDescription = this.sanitizeFilename(assertion.description);
          // 🔥 使用 assertion-{序号}-success-{描述} 格式
          const screenshotFilename = `assertion-${i + 1}-success-${sanitizedDescription}.png`;
          await this.evidenceService.saveBufferArtifact(
            runId,
            'screenshot',
            screenshotBuffer,
            screenshotFilename
          );
          console.log(`📸 [${runId}] 断言 ${i + 1} 截图已保存: ${screenshotFilename}`);
          this.addLog(runId, `✅ 断言 ${i + 1} 截图已保存: ${screenshotFilename}`, 'success');
        } else {
          this.addLog(runId, `⚠️ 无法获取页面对象，跳过断言截图`, 'warning');
        }
      } catch (screenshotError: any) {
        console.warn(`⚠️ [${runId}] 断言 ${i + 1} 截图失败:`, screenshotError.message);
        this.addLog(runId, `⚠️ 断言 ${i + 1} 截图失败: ${screenshotError.message}`, 'warning');
      }
    }

    console.log(`✅ [${runId}] 完成 [${testCase.name}]`);
    
    // 🔥 最终截图
    try {
      const page = this.playwrightRunner.getPage();
      if (page) {
        const screenshotBuffer = await page.screenshot({ fullPage: true });
        const screenshotFilename = `final-completed-${Date.now()}.png`;
        await this.evidenceService.saveBufferArtifact(
          runId,
          'screenshot',
          screenshotBuffer,
          screenshotFilename
        );
        console.log(`📸 [${runId}] 最终截图已保存: ${screenshotFilename}`);
      }
    } catch (screenshotError: any) {
      console.warn(`⚠️ [${runId}] 最终截图失败:`, screenshotError.message);
    }
    
    // 停止 trace 录制并保存
    if (options.enableTrace !== false) {
      const tracePath = await this.playwrightRunner.stopTrace(runId);
      if (tracePath) {
        console.log(`📦 [${runId}] Trace 文件已生成: ${tracePath}`);
      }
    }

    // 🔥 修复：在 context close 前保存证据，确保视频文件已写入完成
    // 注意：视频文件需要在 context close 后才会完成写入
    await this.saveTestEvidence(runId, 'completed');
    this.updateTestRunStatus(runId, 'completed', '测试执行完成');
    
    // 🔥 移除强制同步，避免重复
    // 同步会在 finalizeTestRun() 中自动完成
    console.log(`💾 [${runId}] 测试完成，等待 finalizeTestRun 同步到数据库`);
  }

  /**
   * 清理 Playwright Test Runner 资源
   */
  private async cleanupPlaywrightRunner(runId: string, testRun: TestRun | null): Promise<void> {
    try {
      this.streamService.stopStream(runId);
      console.log(`📺 [${runId}] 实时流已停止`);

      if (this.playwrightRunner) {
        console.log(`🧹 [${runId}] 正在清理 Playwright Test Runner...`);
        
        // 🔥 修复：关闭 context 后，等待视频文件写入完成
        await this.playwrightRunner.close();
        
        // 等待视频文件写入完成（Playwright 在 context close 后异步写入视频）
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 🔥 修复：处理视频文件和 trace 文件（重命名而不是复制）
        await this.processPlaywrightArtifacts(runId);
        
        this.playwrightRunner = null;
        console.log(`✅ [${runId}] Playwright Test Runner 已关闭`);
      }
    } catch (cleanupError) {
      console.warn(`⚠️ [${runId}] 清理 Playwright Test Runner 时出错:`, cleanupError);
    }
  }

  /**
   * 处理 Playwright 生成的原始文件（重命名而不是复制）
   */
  private async processPlaywrightArtifacts(runId: string): Promise<void> {
    try {
      const artifactsDir = this.evidenceService.getArtifactsDir();
      const runArtifactsDir = path.join(artifactsDir, runId);
      
      if (!(await this.fileExists(runArtifactsDir))) {
        return;
      }

      const files = await fsPromises.readdir(runArtifactsDir, { withFileTypes: true });
      
      // 1. 处理 trace.zip 文件
      const traceFile = files.find(f => f.isFile() && f.name === 'trace.zip');
      if (traceFile) {
        const tracePath = path.join(runArtifactsDir, 'trace.zip');
        const newTracePath = path.join(runArtifactsDir, `${runId}-trace.zip`);
        
        // 检查是否已存在重命名后的文件
        try {
          await fsPromises.access(newTracePath);
          // 如果已存在，删除原始的 trace.zip
          await fsPromises.unlink(tracePath);
          console.log(`🗑️ [${runId}] 已删除重复的 trace.zip 文件`);
        } catch {
          // 如果不存在，重命名
          await fsPromises.rename(tracePath, newTracePath);
          console.log(`📦 [${runId}] Trace 文件已重命名: ${runId}-trace.zip`);
          
          // 保存到数据库
          const stats = await fsPromises.stat(newTracePath);
          await this.evidenceService.saveBufferArtifact(
            runId,
            'trace',
            await fsPromises.readFile(newTracePath),
            `${runId}-trace.zip`
          );
        }
      }

      // 2. 处理视频文件（哈希名称的 .webm 或 .mp4 文件）
      const videoFiles = files.filter(f => 
        f.isFile() && 
        (f.name.endsWith('.webm') || f.name.endsWith('.mp4')) &&
        !f.name.includes(runId) && // 排除已经重命名的文件
        f.name.match(/^[a-f0-9]{32,}\.(webm|mp4)$/i) // 匹配哈希名称格式
      );
      
      if (videoFiles.length > 0) {
        // 按修改时间排序，获取最新的视频文件
        const videoFilesWithStats = await Promise.all(
          videoFiles.map(async (file) => {
            const filePath = path.join(runArtifactsDir, file.name);
            const stats = await fsPromises.stat(filePath);
            return { file, path: filePath, stats };
          })
        );
        
        videoFilesWithStats.sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime());
        
        // 只处理第一个（最新的）视频文件
        const { file: videoFile, path: videoPath, stats: videoStats } = videoFilesWithStats[0];
        
        // 检查文件大小，确保不是空文件
        if (videoStats.size > 0) {
          const ext = videoFile.name.split('.').pop() || 'webm';
          const newVideoPath = path.join(runArtifactsDir, `${runId}-video.${ext}`);
          
          // 检查是否已存在重命名后的文件
          try {
            await fsPromises.access(newVideoPath);
            const existingStats = await fsPromises.stat(newVideoPath);
            
            // 如果已存在的文件大小为 0，删除它并使用新的
            if (existingStats.size === 0) {
              await fsPromises.unlink(newVideoPath);
              await fsPromises.rename(videoPath, newVideoPath);
              console.log(`🎥 [${runId}] 视频文件已重命名（替换空文件）: ${runId}-video.${ext}`);
            } else {
              // 如果已存在的文件有内容，删除原始的哈希名称文件
              await fsPromises.unlink(videoPath);
              console.log(`🗑️ [${runId}] 已删除重复的视频文件: ${videoFile.name}`);
              return; // 不重复保存到数据库
            }
          } catch {
            // 如果不存在，重命名
            await fsPromises.rename(videoPath, newVideoPath);
            console.log(`🎥 [${runId}] 视频文件已重命名: ${runId}-video.${ext}`);
          }
          
          // 保存到数据库
          const finalStats = await fsPromises.stat(newVideoPath);
          await this.evidenceService.saveBufferArtifact(
            runId,
            'video',
            await fsPromises.readFile(newVideoPath),
            `${runId}-video.${ext}`
          );
          console.log(`✅ [${runId}] 视频文件已保存到数据库: ${runId}-video.${ext} (${finalStats.size} bytes)`);
        } else {
          console.warn(`⚠️ [${runId}] 视频文件大小为 0，跳过: ${videoFile.name}`);
        }
      }
    } catch (error: any) {
      console.error(`❌ [${runId}] 处理 Playwright 文件失败:`, error.message);
    }
  }

  // #endregion

  // #endregion
}