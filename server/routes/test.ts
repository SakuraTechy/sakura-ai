import { Router, Request, Response } from 'express';
import { TestExecutionService } from '../services/testExecution.js';

export function testRoutes(testExecutionService: TestExecutionService): Router {
  const router = Router();

  // 获取所有测试用例（支持分页和过滤）
  router.get('/cases', async (req: Request, res: Response) => {
    try {
      const {
        page = '1',
        pageSize = '10',
        search = '',
        tag = '',
        priority = '',
        status = '',
        system = '',
        module = '', // 🔥 新增：模块参数
        projectVersion = '', // 🔥 新增：版本参数
        executionStatus = '', // 🆕 执行状态筛选
        executionResult = '', // 🆕 执行结果筛选
        author = '' // 🆕 创建者筛选
      } = req.query;

      const pageNum = parseInt(page as string);
      const sizePer = parseInt(pageSize as string);

      // 🔥 获取当前用户信息（从认证中间件）
      const userDepartment = req.user?.project || undefined;
      const isSuperAdmin = req.user?.isSuperAdmin || false;

      console.log('🔍 获取测试用例 - 用户部门:', userDepartment, '超级管理员:', isSuperAdmin);

      // 获取过滤后的测试用例
      const result = await testExecutionService.getTestCasesPaginated({
        page: pageNum,
        pageSize: sizePer,
        search: search as string,
        tag: tag as string,
        priority: priority as string,
        status: status as string,
        system: system as string,
        module: module as string, // 🔥 新增：模块参数
        projectVersion: projectVersion as string, // 🔥 新增：版本参数
        executionStatus: executionStatus as string, // 🆕 执行状态筛选
        executionResult: executionResult as string, // 🆕 执行结果筛选
        author: author as string, // 🆕 创建者筛选
        userDepartment,
        isSuperAdmin
      });

      res.json({
        success: true,
        data: result.data,
        pagination: {
          page: pageNum,
          pageSize: sizePer,
          total: result.total,
          totalPages: Math.ceil(result.total / sizePer)
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // 执行测试用例
  router.post('/execute', async (req: Request, res: Response) => {
    try {
      const { testCaseId, environment = 'staging' } = req.body;

      if (!testCaseId) {
        return res.status(400).json({
          success: false,
          error: '缺少 testCaseId 参数'
        });
      }

      const runId = await testExecutionService.runTest(testCaseId, environment);

      res.json({
        success: true,
        runId,
        message: '测试已开始执行'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // AI解析器配置管理
  router.post('/ai-parser/reload-config', async (req: Request, res: Response) => {
    try {
      await testExecutionService.reloadAIParserConfiguration();
      
      const status = testExecutionService.getAIParserStatus();
      
      res.json({
        success: true,
        message: 'AI解析器配置已重新加载',
        data: {
          modelInfo: status.modelInfo,
          isConfigManagerMode: status.isConfigManagerMode,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: `重新加载AI解析器配置失败: ${error.message}`
      });
    }
  });

  // 获取AI解析器状态
  router.get('/ai-parser/status', async (req: Request, res: Response) => {
    try {
      const status = testExecutionService.getAIParserStatus();
      
      res.json({
        success: true,
        data: {
          ...status,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: `获取AI解析器状态失败: ${error.message}`
      });
    }
  });

  // 🔥 添加：测试用例执行 - 兼容前端路径
  router.post('/cases/execute', async (req: Request, res: Response) => {
    try {
      const { 
        caseId, 
        testCaseId, 
        environment = 'staging',
        executionEngine = 'mcp', // 🔥 新增：执行引擎选择
        enableTrace = false,     // 🔥 新增：是否启用 trace（仅 Playwright）
        enableVideo = false,     // 🔥 新增：是否启用 video（仅 Playwright）
        planExecutionId          // 🔥 新增：测试计划执行记录ID，用于完成后同步数据
      } = req.body;
      const actualCaseId = caseId || testCaseId;

      if (!actualCaseId) {
        return res.status(400).json({
          success: false,
          error: '缺少 caseId 或 testCaseId 参数'
        });
      }

      // 🔥 修复：从认证中间件获取用户ID并传递
      const userId = req.user?.id ? String(req.user.id) : undefined;

      console.log(`📋 [test路由] 执行测试用例:`, {
        caseId: actualCaseId,
        planExecutionId,
        executionEngine,
        userId
      });

      // 🔥 传递执行引擎选项、用户ID和planExecutionId
      const runId = await testExecutionService.runTest(
        actualCaseId, 
        environment,
        'standard',
        {
          userId: userId,
          executionEngine: executionEngine as 'mcp' | 'playwright',
          enableTrace: enableTrace === true,
          enableVideo: enableVideo === true,
          planExecutionId: planExecutionId // 🔥 传递测试计划执行记录ID
        }
      );

      res.json({
        success: true,
        runId,
        message: '测试已开始执行'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // 🔥 批量删除测试运行记录 - 必须在 /runs/:runId 之前
  router.post('/runs/batch-delete', async (req: Request, res: Response) => {
    try {
      const { runIds } = req.body;

      if (!runIds || !Array.isArray(runIds) || runIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: '缺少 runIds 参数或参数格式不正确'
        });
      }

      console.log(`🗑️ 批量删除测试运行，数量: ${runIds.length}`);

      const result = await testExecutionService.batchDeleteTestRuns(runIds);

      res.json({
        success: true,
        data: result,
        message: `成功删除 ${result.deletedCount} 条测试运行记录`
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // 🔥 更新测试运行的执行时长（由前端计算并发送）
  router.patch('/runs/:runId/duration', async (req: Request, res: Response) => {
    try {
      const { runId } = req.params;
      const { durationMs, startedAt, finishedAt } = req.body; // 前端发送的毫秒数和时间戳

      if (!durationMs || typeof durationMs !== 'number' || durationMs < 0) {
        return res.status(400).json({
          success: false,
          error: '无效的 durationMs 参数'
        });
      }

      console.log(`📊 [${runId}] 更新执行时长: ${durationMs}ms`, {
        startedAt: startedAt ? new Date(startedAt).toISOString() : '未提供',
        finishedAt: finishedAt ? new Date(finishedAt).toISOString() : '未提供'
      });

      // 更新内存中的 testRun
      const testRun = testExecutionService.getTestRun(runId);
      if (testRun) {
        // 🔥 修复：保留三位小数，确保精度（如 5.001s）
        testRun.duration = `${(durationMs / 1000).toFixed(3)}s`;
        console.log(`✅ [${runId}] 内存中的 testRun.duration 已更新: ${testRun.duration}`);
      }

      // 同步到数据库
      const executionService = (testExecutionService as any).executionService;
      if (executionService) {
        await executionService.updateExecutionDuration(runId, durationMs, startedAt, finishedAt);
        console.log(`✅ [${runId}] 数据库中的 durationMs、started_at、finished_at 已更新`);
      }

      res.json({
        success: true,
        message: '执行时长已更新'
      });
    } catch (error: any) {
      console.error('更新执行时长失败:', error);
      res.status(500).json({
        success: false,
        error: error.message || '更新执行时长失败'
      });
    }
  });

  // 🚀 性能优化：获取单个测试运行（优先内存，回退到数据库）
  router.get('/runs/:runId', async (req: Request, res: Response) => {
    const startTime = Date.now();
    try {
      const { runId } = req.params;

      // 🚀 优先从内存获取（最快，用于正在运行的测试）
      let testRun = testExecutionService.getTestRun(runId);

      // 如果内存中没有，从数据库查询历史记录
      if (!testRun) {
        console.log(`📊 [${runId}] 内存中未找到，尝试从数据库查询...`);
        const executionService = (testExecutionService as any).executionService;
        const dbRun = await executionService.getExecutionById(runId);

        if (dbRun) {
          // 🔥 修复：获取执行者名称（优先使用用户名，如果没有则使用email或System）
          let executorName = 'System';
          if (dbRun.executorUserId) {
            if ((dbRun as any).executorUsername) {
              executorName = (dbRun as any).executorUsername;
            } else if ((dbRun as any).executorEmail) {
              executorName = (dbRun as any).executorEmail;
            } else {
              executorName = `User-${dbRun.executorUserId}`;
            }
          }

          // 🔥 修复：正确读取执行日志（使用 executionLogs 字段）
          const logs = dbRun.executionLogs || [];

          // 🔥 修复：计算执行时长，优先使用 durationMs（数据库中的准确值）
          let duration = '0s';
          console.log(`📊 [${runId}] 数据库记录:`, {
            durationMs: dbRun.durationMs,
            startedAt: dbRun.startedAt,
            finishedAt: dbRun.finishedAt,
            queuedAt: (dbRun as any).queuedAt
          });
          
          if (dbRun.durationMs && dbRun.durationMs > 0) {
            // 优先使用数据库中的 durationMs（最准确）
            // 🔥 修复：保留三位小数，确保精度（如 5.001s）
            duration = `${(dbRun.durationMs / 1000).toFixed(3)}s`;
            console.log(`✅ [${runId}] 使用数据库 durationMs: ${dbRun.durationMs}ms = ${duration}`);
          } else if (dbRun.startedAt && dbRun.finishedAt) {
            // 如果没有 durationMs，从时间计算
            const durationMs = new Date(dbRun.finishedAt).getTime() - new Date(dbRun.startedAt).getTime();
            if (durationMs > 0) {
              // 🔥 修复：保留三位小数，确保精度（如 5.001s）
              duration = `${(durationMs / 1000).toFixed(3)}s`;
              console.log(`⚠️ [${runId}] durationMs 为空，从时间计算: ${durationMs}ms = ${duration}`);
            }
          } else {
            console.warn(`⚠️ [${runId}] 无法计算执行时长: durationMs=${dbRun.durationMs}, startedAt=${dbRun.startedAt}, finishedAt=${dbRun.finishedAt}`);
          }
          
          // 🔥 修复：从日志中提取开始时间（如果数据库中没有startedAt）
          let actualStartedAt = dbRun.startedAt;
          if (!actualStartedAt && logs && logs.length > 0) {
            // 从日志中提取最早的时间戳作为开始时间
            const sortedLogs = [...logs].sort((a: any, b: any) => {
              const timeA = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
              const timeB = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
              return timeA - timeB;
            });
            if (sortedLogs.length > 0) {
              const firstLog = sortedLogs[0];
              actualStartedAt = firstLog.timestamp instanceof Date ? firstLog.timestamp : new Date(firstLog.timestamp);
              console.log(`📊 [${runId}] 从日志提取开始时间: ${actualStartedAt.toISOString()}`);
            }
          }
          
          // 转换数据库记录到前端格式
          testRun = {
            id: dbRun.id,
            testCaseId: dbRun.testCaseId,
            name: dbRun.testCaseTitle,
            status: dbRun.status,
            // 🔥 优化：统一使用 startedAt 和 finishedAt 字段
            startedAt: dbRun.startedAt || dbRun.queuedAt,
            // 🔥 修复：包含 actualStartedAt 字段，优先使用数据库中的 startedAt，如果没有则使用从日志提取的时间
            actualStartedAt: actualStartedAt || dbRun.startedAt || dbRun.queuedAt,
            finishedAt: dbRun.finishedAt,
            duration: duration, // 🔥 使用从数据库 durationMs 计算的准确值
            progress: dbRun.progress || 0,
            totalSteps: dbRun.totalSteps || 0,
            completedSteps: dbRun.completedSteps || 0,
            passedSteps: dbRun.passedSteps || 0,
            failedSteps: dbRun.failedSteps || 0,
            executor: executorName,
            environment: dbRun.environment || 'default',
            logs: logs,
            screenshots: dbRun.screenshots || []
          } as any;
          console.log(`✅ [${runId}] 从数据库查询成功，执行者: ${executorName}`);
        }
      } else {
        console.log(`⚡ [${runId}] 从内存获取成功`);
        // 🔥 修复：确保从内存获取的 testRun 也包含所有必需字段，使用默认值
        const memoryRun = testRun as any;
        
        // 🔥 修复：对于已完成的测试运行，从数据库同步 duration
        const completedStatuses = ['completed', 'failed', 'cancelled', 'error'];
        let duration = memoryRun.duration || '0s';
        
        if (completedStatuses.includes(memoryRun.status)) {
          try {
            const executionService = (testExecutionService as any).executionService;
            const dbRun = await executionService.getExecutionById(runId);
            if (dbRun && dbRun.durationMs && dbRun.durationMs > 0) {
              // 🔥 修复：保留三位小数，确保精度（如 5.001s）
              const dbDuration = `${(dbRun.durationMs / 1000).toFixed(3)}s`;
              // 同步到内存中的 testRun
              memoryRun.duration = dbDuration;
              duration = dbDuration;
              console.log(`🔄 [${runId}] 已完成的测试运行，同步 duration: ${dbDuration}`);
            }
          } catch (error) {
            console.warn(`⚠️ [${runId}] 同步 duration 失败:`, error);
          }
        }
        
        // 🔥 修复：如果内存中的 testRun 没有 name，通过 testCaseId 查询测试用例名称
        let testCaseName = memoryRun.name;
        if (!testCaseName && memoryRun.testCaseId) {
          try {
            const testCase = await testExecutionService.getTestCaseById(memoryRun.testCaseId);
            if (testCase) {
              testCaseName = testCase.name || testCase.title;
            }
          } catch (error) {
            console.warn(`⚠️ [${runId}] 获取测试用例名称失败:`, error);
          }
        }
        
        // 🔥 修复：从日志中提取开始时间（如果内存中没有actualStartedAt）
        let actualStartedAt = memoryRun.actualStartedAt;
        if (!actualStartedAt && memoryRun.logs && memoryRun.logs.length > 0) {
          // 从日志中提取最早的时间戳作为开始时间
          const sortedLogs = [...memoryRun.logs].sort((a: any, b: any) => {
            const timeA = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
            const timeB = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
            return timeA - timeB;
          });
          if (sortedLogs.length > 0) {
            const firstLog = sortedLogs[0];
            actualStartedAt = firstLog.timestamp instanceof Date ? firstLog.timestamp : new Date(firstLog.timestamp);
            console.log(`📊 [${runId}] 从内存日志提取开始时间: ${actualStartedAt.toISOString()}`);
          }
        }
        
        testRun = {
          ...memoryRun,
          name: testCaseName || memoryRun.name,
          progress: memoryRun.progress ?? 0,
          totalSteps: memoryRun.totalSteps ?? 0,
          completedSteps: memoryRun.completedSteps ?? 0,
          passedSteps: memoryRun.passedSteps ?? 0,
          failedSteps: memoryRun.failedSteps ?? 0,
          duration: duration, // 🔥 使用同步后的 duration
          logs: memoryRun.logs || [],
          screenshots: memoryRun.screenshots || [],
          // 🔥 修复：确保包含 actualStartedAt 字段，优先使用内存中的值，如果没有则使用从日志提取的时间
          actualStartedAt: actualStartedAt || memoryRun.actualStartedAt || memoryRun.startedAt,
          // 🔥 修复：确保 startedAt 字段存在（兼容旧代码）
          startedAt: memoryRun.startedAt || actualStartedAt || memoryRun.actualStartedAt
        } as any;
      }

      if (!testRun) {
        return res.status(404).json({
          success: false,
          error: '测试运行不存在'
        });
      }

      const duration = Date.now() - startTime;
      console.log(`⚡ [${runId}] GET /runs/:runId 响应时间: ${duration}ms`);

      res.json({
        success: true,
        data: testRun
      });
    } catch (error) {
      console.error('获取测试运行失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // 获取所有测试运行（支持数据隔离）
  router.get('/runs', async (req: Request, res: Response) => {
    try {
      // 🔥 获取当前用户信息（从认证中间件）
      const userDepartment = req.user?.project || undefined;
      const userId = req.user?.id;
      const isSuperAdmin = req.user?.isSuperAdmin || false;

      // 🔥 获取排序参数
      const sortBy = (req.query.sortBy as string) || 'startedAt';
      const sortOrder = (req.query.sortOrder as string) || 'desc';

      console.log('📊 [GET /runs] 查询参数:', {
        userId,
        userDepartment,
        isSuperAdmin,
        hasUser: !!req.user,
        sortBy,
        sortOrder
      });

      // 从内存中获取正在运行或最近的测试
      const memoryRuns = testExecutionService.getAllTestRuns();
      console.log(`📊 [GET /runs] 内存中的测试运行数量: ${memoryRuns.length}`);

      // 🔥 从数据库获取历史测试记录（支持数据隔离）
      const executionService = (testExecutionService as any).executionService;
      
      // 🔥 修复：如果是超级管理员或没有用户信息，查询所有记录
      const queryFilters: any = {
        limit: 100
      };
      
      // 只有在非超级管理员且有用户ID时才进行数据隔离
      if (!isSuperAdmin && userId) {
        queryFilters.executorUserId = parseInt(userId);
        if (userDepartment) {
          queryFilters.executorDepartment = userDepartment;
        }
      }
      
      console.log('📊 [GET /runs] 数据库查询过滤器:', queryFilters);
      
      const dbRuns = await executionService.getExecutions(queryFilters);
      console.log(`📊 [GET /runs] 数据库查询结果数量: ${dbRuns.length}`);

      // 合并内存和数据库记录（去重，优先使用内存中的数据）
      const memoryRunIds = new Set(memoryRuns.map(r => r.id));
      
      // 🔥 修复：对于已完成的测试运行，从数据库同步 duration 到内存
      const completedStatuses = ['completed', 'failed', 'cancelled', 'error'];
      const dbRunsMap = new Map(dbRuns.map(r => [r.id, r]));
      
      memoryRuns.forEach(memoryRun => {
        const dbRun = dbRunsMap.get(memoryRun.id);
        // 如果数据库中有该记录且测试已完成，同步 duration
        if (dbRun && completedStatuses.includes(memoryRun.status) && dbRun.durationMs && dbRun.durationMs > 0) {
          // 🔥 修复：保留三位小数，确保精度（如 5.001s）
          const dbDuration = `${(dbRun.durationMs / 1000).toFixed(3)}s`;
          // 只有当数据库中的 duration 与内存中的不一致时才更新
          if (memoryRun.duration !== dbDuration) {
            memoryRun.duration = dbDuration;
            console.log(`🔄 [${memoryRun.id}] 同步 duration: ${memoryRun.duration} -> ${dbDuration}`);
          }
        }
      });
      
      const dbRunsFiltered = dbRuns.filter(r => !memoryRunIds.has(r.id));

      // 转换数据库记录到前端格式
      const dbRunsFormatted = dbRunsFiltered.map(dbRun => {
        // 🔥 修复：获取执行者名称（优先使用用户名，如果没有则使用email或System）
        let executorName = 'System';
        if (dbRun.executorUserId) {
          if ((dbRun as any).executorUsername) {
            executorName = (dbRun as any).executorUsername;
          } else if ((dbRun as any).executorEmail) {
            executorName = (dbRun as any).executorEmail;
          } else {
            executorName = `User-${dbRun.executorUserId}`;
          }
        }

        return {
          id: dbRun.id,
          testCaseId: dbRun.testCaseId,
          name: dbRun.testCaseTitle,
          status: dbRun.status,
          // 🔥 优化：统一使用 startedAt 和 finishedAt 字段
          startedAt: dbRun.startedAt || dbRun.queuedAt,
          finishedAt: dbRun.finishedAt,
          // 🔥 修复：保留三位小数，确保精度（如 5.001s）
          duration: dbRun.durationMs ? `${(dbRun.durationMs / 1000).toFixed(3)}s` : '0s',
          progress: dbRun.progress,
          totalSteps: dbRun.totalSteps,
          completedSteps: dbRun.completedSteps,
          passedSteps: dbRun.passedSteps,
          failedSteps: dbRun.failedSteps,
          executor: executorName,
          environment: dbRun.environment,
          logs: dbRun.executionLogs || [],
          screenshots: dbRun.screenshots || [],
          error: dbRun.errorMessage
        };
      });

      // 🚀 为内存中的测试运行补充测试用例名称和完整时间信息
      const enrichedMemoryRunsWithNull = await Promise.all(
        memoryRuns.map(async (run) => {
          try {
            // 获取测试用例详情
            const testCase = await testExecutionService.getTestCaseById(run.testCaseId);
            
            // 🔥 新增：如果测试用例已删除（返回null），则过滤掉该记录
            if (!testCase) {
              console.log(`🗑️ 测试运行 ${run.id} 的关联用例 #${run.testCaseId} 已被删除，将被过滤`);
              return null;
            }
            
            // 🔥 修复：如果 executor 是 userId 字符串，查询用户名
            let executorName = run.executor || 'System';
            if (run.userId && run.userId !== 'system' && (!run.executor || run.executor === run.userId || run.executor.startsWith('User-'))) {
              try {
                const parsedUserId = parseInt(run.userId);
                if (!isNaN(parsedUserId)) {
                  const executionService = (testExecutionService as any).executionService;
                  const prisma = (executionService as any).prisma;
                  const user = await prisma.users.findUnique({
                    where: { id: parsedUserId },
                    select: { username: true, email: true }
                  });
                  if (user) {
                    executorName = user.username || user.email || `User-${parsedUserId}`;
                  }
                }
              } catch (error) {
                console.warn(`⚠️ 查询用户 ${run.userId} 信息失败:`, error);
              }
            }

            return {
              ...run,
              name: testCase.name,
              // 🔥 优化：统一使用 startedAt 和 finishedAt 字段
              startedAt: run.startedAt || run.queuedAt || new Date(),
              finishedAt: run.finishedAt || run.endedAt,
              // 补充其他可能缺失的字段
              duration: run.duration || '0s',
              progress: run.progress || 0,
              totalSteps: run.totalSteps || 0,
              completedSteps: run.completedSteps || 0,
              passedSteps: run.passedSteps || 0,
              failedSteps: run.failedSteps || 0,
              executor: executorName, // 🔥 修复：使用查询到的用户名
              screenshots: run.screenshots || []
            };
          } catch (error) {
            console.error(`❌ 获取测试用例 #${run.testCaseId} 详情失败:`, error);
            // 🔥 修改：获取失败时也返回 null，不展示该记录
            return null;
          }
        })
      );

      // 🔥 新增：过滤掉 null 值（即关联用例已删除的记录）
      const enrichedMemoryRuns = enrichedMemoryRunsWithNull.filter((run): run is NonNullable<typeof run> => run !== null);

      // 🔥 合并数据并按指定字段排序
      const allRuns = [...enrichedMemoryRuns, ...dbRunsFormatted].sort((a, b) => {
        // 支持按 startedAt、finishedAt 或 startTime 排序
        let valueA: number;
        let valueB: number;

        if (sortBy === 'finishedAt') {
          valueA = a.finishedAt ? new Date(a.finishedAt).getTime() : 0;
          valueB = b.finishedAt ? new Date(b.finishedAt).getTime() : 0;
        } else {
          // 默认使用 startedAt
          valueA = a.startedAt ? new Date(a.startedAt).getTime() : 0;
          valueB = b.startedAt ? new Date(b.startedAt).getTime() : 0;
        }

        // 根据排序顺序返回结果
        return sortOrder === 'desc' ? valueB - valueA : valueA - valueB;
      });

      console.log(`📊 [GET /runs] 最终返回数据: 内存=${enrichedMemoryRuns.length}, 数据库=${dbRunsFormatted.length}, 总计=${allRuns.length}`);

      res.json({
        success: true,
        data: allRuns,
        meta: {
          memoryCount: enrichedMemoryRuns.length,
          dbCount: dbRunsFormatted.length,
          total: allRuns.length
        }
      });
    } catch (error) {
      console.error('获取测试运行列表失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // 🔥 调试端点：直接查询数据库中的所有测试执行记录
  router.get('/runs/debug/all', async (req: Request, res: Response) => {
    try {
      const executionService = (testExecutionService as any).executionService;
      
      // 直接查询所有记录，不做任何过滤
      const allExecutions = await executionService.getExecutions({
        limit: 1000
      });
      
      console.log(`🔍 [DEBUG] 数据库中的总记录数: ${allExecutions.length}`);
      
      res.json({
        success: true,
        data: {
          total: allExecutions.length,
          executions: allExecutions.map(exec => ({
            id: exec.id,
            testCaseId: exec.testCaseId,
            testCaseTitle: exec.testCaseTitle,
            status: exec.status,
            executorUserId: exec.executorUserId,
            executorDepartment: exec.executorDepartment,
            queuedAt: exec.queuedAt,
            startedAt: exec.startedAt,
            finishedAt: exec.finishedAt,
            progress: exec.progress
          }))
        }
      });
    } catch (error) {
      console.error('调试查询失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // 取消测试执行
  router.post('/runs/:runId/cancel', async (req: Request, res: Response) => {
    try {
      const { runId } = req.params;
      const success = await testExecutionService.cancelTest(runId);

      if (!success) {
        return res.status(400).json({
          success: false,
          error: '无法取消测试，测试可能已完成或不存在'
        });
      }

      res.json({
        success: true,
        message: '测试已取消'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // 🔥 更新：创建测试用例API
  router.post('/cases', async (req: Request, res: Response) => {
    try {
      // The body now aligns with the conceptual TestCase interface
      const testCaseData = req.body;

      // 🔥 修复：如果前端未提供有效的 author，从 req.user 获取
      if (!testCaseData.author || testCaseData.author === '未知用户' || testCaseData.author === 'System') {
        if (req.user) {
          testCaseData.author = req.user.accountName || req.user.username || req.user.email || 'System';
          console.log('🔧 [POST /cases] 从 req.user 获取 author:', testCaseData.author);
        }
      }

      // 🔥 调试日志：检查接收到的请求数据
      console.log('📥 [POST /cases] 接收到的请求数据:', {
        name: testCaseData.name,
        author: testCaseData.author,
        hasSteps: !!testCaseData.steps,
        reqUser: req.user ? {
          id: req.user.id,
          username: req.user.username,
          accountName: req.user.accountName,
          email: req.user.email
        } : null
      });

      if (!testCaseData.name || !testCaseData.steps) {
        return res.status(400).json({
          success: false,
          error: '缺少必要参数：name 和 steps'
        });
      }

      const newTestCase = await testExecutionService.addTestCase(testCaseData);

      console.log('✅ 测试用例创建成功:', {
        id: newTestCase.id,
        name: newTestCase.name,
        author: newTestCase.author
      });

      res.json({
        success: true,
        data: newTestCase,
        message: '测试用例创建成功'
      });
    } catch (error: any) {
      console.error('❌ 创建测试用例失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // 🔥 新增：根据ID获取单个测试用例
  router.get('/cases/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // 使用 testExecutionService 获取测试用例
      const testCase = await testExecutionService.getTestCaseById(parseInt(id));

      if (!testCase) {
        return res.status(404).json({
          success: false,
          error: '测试用例不存在',
        });
      }

      res.json(testCase);
    } catch (error: any) {
      console.error('获取测试用例失败:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // 🔥 更新：更新测试用例API
  router.put('/cases/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const testCaseData = req.body;

      // 🔥 修复：如果前端未提供有效的 author，从 req.user 获取
      if (!testCaseData.author || testCaseData.author === '未知用户' || testCaseData.author === 'System') {
        if (req.user) {
          testCaseData.author = req.user.accountName || req.user.username || req.user.email || 'System';
          console.log('🔧 [PUT /cases/:id] 从 req.user 获取 author:', testCaseData.author);
        }
      }

      // 🔥 调试日志：检查接收到的请求数据
      console.log('📥 [PUT /cases/:id] 接收到的请求数据:', {
        id,
        name: testCaseData.name,
        author: testCaseData.author,
        hasSteps: !!testCaseData.steps,
        reqUser: req.user ? {
          id: req.user.id,
          username: req.user.username,
          accountName: req.user.accountName,
          email: req.user.email
        } : null
      });

      const updatedTestCase = await testExecutionService.updateTestCase(parseInt(id), testCaseData);

      if (!updatedTestCase) {
        return res.status(404).json({
          success: false,
          error: '测试用例不存在或更新失败'
        });
      }

      console.log('✅ 测试用例更新成功:', {
        id: updatedTestCase.id,
        name: updatedTestCase.name,
        author: updatedTestCase.author
      });

      res.json({
        success: true,
        data: updatedTestCase,
        message: '测试用例更新成功'
      });
    } catch (error: any) {
      console.error('❌ 更新测试用例失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // 🔥 更新：删除测试用例API
  router.delete('/cases/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const success = await testExecutionService.deleteTestCase(parseInt(id));

      if (!success) {
        return res.status(404).json({
          success: false,
          error: '测试用例不存在'
        });
      }

      res.json({
        success: true,
        message: '测试用例删除成功'
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
} 