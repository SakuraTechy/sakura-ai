// 测试计划服务
import { PrismaClient } from '../../src/generated/prisma';
import type {
  TestPlan,
  CreateTestPlanInput,
  UpdateTestPlanInput,
  TestPlanCase,
  AddCasesToPlanInput,
  TestPlanExecution,
  StartTestPlanExecutionInput,
  TestPlanListQuery,
  TestPlanListResponse,
  TestPlanDetailResponse,
  TestPlanStatistics,
  TestPlanCaseResult,
} from '../../src/types/testPlan';
import { TestExecutionService } from './testExecution';
import { broadcastTestPlanExecutionUpdate } from './websocket';

const prisma = new PrismaClient();

/**
 * 等待测试执行完成并获取结果（包含步骤统计数据）
 */
async function waitForTestCompletion(runId: string, maxWaitTime = 300000): Promise<{
  success: boolean;
  result: 'pass' | 'fail' | 'block';
  duration_ms: number;
  // 🔥 新增：步骤统计数据
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  blockedSteps: number;
  completedSteps: number;
  started_at?: string;
  finished_at?: string;
  executor_name?: string;
  executor_id?: number;
  // 🔥 新增：执行状态
  execution_status: 'running' | 'completed' | 'failed' | 'cancelled' | 'error' | 'queued';
}> {
  const startTime = Date.now();
  const pollInterval = 1000; // 每秒轮询一次

  while (Date.now() - startTime < maxWaitTime) {
    try {
      // 🔥 修复：从数据库查询 test_case_executions 记录（UI自动化测试使用此表）
      const testRun = await prisma.test_case_executions.findUnique({
        where: { id: runId },
        include: {
          users: {
            select: {
              id: true,
              username: true,
              account_name: true,
            }
          }
        }
      });

      if (!testRun) {
        console.warn(`⚠️ [waitForTestCompletion] 测试运行记录不存在: ${runId}`);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        continue;
      }

      // 🔥 提取步骤统计数据
      const totalSteps = testRun.total_steps || 0;
      const passedSteps = testRun.passed_steps || 0;
      const failedSteps = testRun.failed_steps || 0;
      const blockedSteps = totalSteps - passedSteps - failedSteps;
      const completedSteps = testRun.completed_steps || 0;
      const executorName = testRun.users?.account_name || testRun.users?.username || 'System';
      const executorId = testRun.users?.id;

      // 检查是否已完成
      if (testRun.status === 'completed') {
        // 🔥 优化：优先使用 test_runs 的统计字段，更准确地判断结果
        let result: 'pass' | 'fail' | 'block' = 'pass';
        
        console.log(`📊 [waitForTestCompletion] 测试统计数据:`, {
          runId,
          status: testRun.status,
          totalSteps,
          passedSteps,
          failedSteps,
          completedSteps,
          duration_ms_in_db: testRun.duration_ms,
        });
        
        // 🔥 判断逻辑优化：
        // 1. 如果有失败步骤，结果为失败
        // 2. 如果没有失败但有未完成的步骤（阻塞），结果为阻塞
        // 3. 否则为通过
        if (failedSteps > 0) {
          result = 'fail';
          console.log(`❌ [waitForTestCompletion] 检测到失败步骤: ${failedSteps} 个`);
        } else if (totalSteps > 0 && passedSteps < totalSteps) {
          // 有步骤但未全部通过，可能是阻塞
          result = 'block';
          console.log(`⚠️ [waitForTestCompletion] 检测到阻塞: 总步骤 ${totalSteps}, 通过 ${passedSteps}`);
        } else if (totalSteps > 0 && passedSteps === totalSteps) {
          result = 'pass';
          console.log(`✅ [waitForTestCompletion] 全部步骤通过: ${passedSteps}/${totalSteps}`);
        }
        
        // 🔥 关键修复：优先使用数据库中的 duration_ms 字段（更精确，包含毫秒）
        // 参考 TestRuns.tsx 中的处理方式，确保时长精确到毫秒
        let duration = 0;
        
        if (testRun.duration_ms && testRun.duration_ms > 0) {
          // 优先使用数据库中已存储的精确时长（由前端或后端从日志中提取）
          duration = testRun.duration_ms;
          console.log(`✅ [waitForTestCompletion] 使用数据库中的精确时长: ${duration}ms`);
        } else if (testRun.finished_at && testRun.started_at) {
          // 备用方案：从时间戳计算
          duration = new Date(testRun.finished_at).getTime() - new Date(testRun.started_at).getTime();
          console.log(`⚠️ [waitForTestCompletion] 从时间戳计算时长: ${duration}ms`);
        } else {
          console.warn(`⚠️ [waitForTestCompletion] 无法计算时长，使用默认值 0ms`);
        }

        console.log(`✅ [waitForTestCompletion] 测试完成: ${runId}, 最终结果: ${result}, 精确耗时: ${duration}ms (${(duration / 1000).toFixed(3)}s)`);
        
        return {
          success: true,
          result,
          duration_ms: duration,
          totalSteps,
          passedSteps,
          failedSteps,
          blockedSteps: blockedSteps > 0 ? blockedSteps : 0,
          completedSteps,
          started_at: testRun.started_at?.toISOString(),
          finished_at: testRun.finished_at?.toISOString(),
          executor_name: executorName,
          executor_id: executorId,
          execution_status: 'completed', // 🔥 新增：执行状态
        };
      } else if (testRun.status === 'failed' || testRun.status === 'error' || testRun.status === 'cancelled') {
        // 🔥 修复：处理失败、错误和取消状态
        // 同样优先使用数据库中的精确时长
        let duration = 0;
        
        if (testRun.duration_ms && testRun.duration_ms > 0) {
          duration = testRun.duration_ms;
        } else if (testRun.finished_at && testRun.started_at) {
          duration = new Date(testRun.finished_at).getTime() - new Date(testRun.started_at).getTime();
        }

        console.log(`❌ [waitForTestCompletion] 测试失败: ${runId}, 状态: ${testRun.status}, 精确耗时: ${duration}ms (${(duration / 1000).toFixed(3)}s)`);
        
        // 🔥 新增：映射执行状态
        const executionStatus = testRun.status === 'failed' ? 'failed' : 
                               testRun.status === 'error' ? 'error' : 
                               testRun.status === 'cancelled' ? 'cancelled' : 'failed';
        
        return {
          success: false,
          result: 'fail',
          duration_ms: duration,
          totalSteps,
          passedSteps,
          failedSteps,
          blockedSteps: blockedSteps > 0 ? blockedSteps : 0,
          completedSteps,
          started_at: testRun.started_at?.toISOString(),
          finished_at: testRun.finished_at?.toISOString(),
          executor_name: executorName,
          executor_id: executorId,
          execution_status: executionStatus as 'running' | 'completed' | 'failed' | 'cancelled' | 'error' | 'queued', // 🔥 新增：执行状态
        };
      }

      // 继续等待
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    } catch (error) {
      console.error(`❌ [waitForTestCompletion] 查询测试状态失败:`, error);
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  // 超时
  console.error(`❌ [waitForTestCompletion] 等待测试完成超时: ${runId}`);
  return {
    success: false,
    result: 'fail',
    duration_ms: 0,
    totalSteps: 0,
    passedSteps: 0,
    failedSteps: 0,
    blockedSteps: 0,
    completedSteps: 0,
    execution_status: 'error', // 🔥 超时视为错误状态
  };
}

/**
 * 获取测试计划列表
 */
export async function getTestPlans(query: TestPlanListQuery): Promise<TestPlanListResponse> {
  const {
    page = 1,
    pageSize = 20,
    search,
    project,
    plan_type,
    status,
    result,
    owner_id,
    start_date,
    end_date,
  } = query;

  // 构建查询条件
  const where: any = {
    deleted_at: null, // 只查询未删除的记录
  };

  if (search) {
    where.OR = [
      { name: { contains: search } },
      { short_name: { contains: search } },
      { description: { contains: search } },
    ];
  }

  if (project) {
    where.project = project;
  }

  if (plan_type) {
    where.plan_type = plan_type;
  }

  if (status) {
    where.status = status;
  }

  if (owner_id) {
    where.owner_id = owner_id;
  }

  if (start_date || end_date) {
    where.start_date = {};
    if (start_date) {
      where.start_date.gte = new Date(start_date);
    }
    if (end_date) {
      where.start_date.lte = new Date(end_date);
    }
  }

  // 如果有 result 参数，需要先获取所有数据再过滤，所以不分页
  // 如果没有 result 参数，正常分页查询
  const skip = (page - 1) * pageSize;
  const take = result ? undefined : pageSize; // 如果有 result，不限制数量

  // 执行查询
  const [total, plans] = await Promise.all([
    prisma.test_plans.count({ where }),
    prisma.test_plans.findMany({
      where,
      skip: result ? undefined : skip, // 如果有 result，不分页
      take,
      orderBy: { created_at: 'desc' },
      include: {
        owner: {
          select: {
            id: true,
            username: true,
            account_name: true,
          },
        },
        _count: {
          select: {
            plan_cases: true,
            plan_executions: true,
          },
        },
      },
    }),
  ]);

  // 为每个计划查询最新执行记录和进度数据
  const plansWithProgress = await Promise.all(
    plans.map(async (plan) => {
      // 获取最新执行记录（按开始时间降序，取第一条）
      // 与 getTestPlanDetail 中的排序方式保持一致
      const latestExecution = await prisma.test_plan_executions.findFirst({
        where: {
          plan_id: plan.id,
        },
        orderBy: {
          started_at: 'desc',
        },
        select: {
          progress: true,
          total_cases: true,
          completed_cases: true,
          passed_cases: true,
          failed_cases: true,
          blocked_cases: true,
          skipped_cases: true,
          status: true,
        },
      });

      // 如果有最新执行记录，使用执行记录的进度数据
      // 如果执行状态是 completed，进度应该是100%
      let progress = 0;
      let completedCases = 0;
      let totalCases = plan._count.plan_cases;
      let passedCases = 0;
      let failedCases = 0;
      let blockedCases = 0;

      if (latestExecution) {
        // 使用执行记录中的 total_cases，如果没有则使用计划的 total_cases
        totalCases = latestExecution.total_cases > 0 
          ? latestExecution.total_cases 
          : plan._count.plan_cases;
        completedCases = latestExecution.completed_cases || 0;
        passedCases = latestExecution.passed_cases || 0;
        failedCases = latestExecution.failed_cases || 0;
        blockedCases = latestExecution.blocked_cases || 0;
        
        // 如果执行状态是 completed，进度应该是100%
        if (latestExecution.status === 'completed') {
          progress = 100;
        } else {
          // 否则使用执行记录的进度值
          progress = latestExecution.progress || 0;
        }
      }

      return {
        ...plan,
        latest_execution_progress: progress,
        latest_execution_completed_cases: completedCases,
        latest_execution_total_cases: totalCases,
        latest_execution_passed_cases: passedCases,
        latest_execution_failed_cases: failedCases,
        latest_execution_blocked_cases: blockedCases,
        latest_execution_status: latestExecution?.status,
      };
    })
  );

  // 转换数据格式
  let data: TestPlan[] = plansWithProgress.map((plan) => ({
    id: plan.id,
    name: plan.name,
    short_name: plan.short_name || undefined,
    description: plan.description || undefined,
    project: plan.project || undefined,
    plan_type: plan.plan_type as any,
    status: plan.status as any,
    members: plan.members ? (plan.members as number[]) : undefined,
    owner_id: plan.owner_id,
    owner_name: plan.owner.account_name || plan.owner.username,
    start_date: plan.start_date?.toISOString(),
    end_date: plan.end_date?.toISOString(),
    created_at: plan.created_at.toISOString(),
    updated_at: plan.updated_at.toISOString(),
    total_cases: plan._count.plan_cases,
    completed_executions: plan._count.plan_executions,
    latest_execution_progress: plan.latest_execution_progress,
    latest_execution_completed_cases: plan.latest_execution_completed_cases,
    latest_execution_total_cases: plan.latest_execution_total_cases,
    latest_execution_passed_cases: plan.latest_execution_passed_cases,
    latest_execution_failed_cases: plan.latest_execution_failed_cases,
    latest_execution_blocked_cases: plan.latest_execution_blocked_cases,
    latest_execution_status: plan.latest_execution_status,
  }));

  // 根据 result 参数筛选数据
  let filteredTotal = total;
  if (result) {
    data = data.filter((plan) => {
      // 计算计划结果（与前端 getPlanResult 逻辑保持一致）
      const executionStatus = plan.latest_execution_status;
      const passedCases = plan.latest_execution_passed_cases || 0;
      const failedCases = plan.latest_execution_failed_cases || 0;
      const blockedCases = plan.latest_execution_blocked_cases || 0;

      let planResult: string | null = null;

      if (executionStatus === 'completed') {
        // 已完成：根据失败和阻塞情况判断
        if (failedCases > 0) {
          planResult = 'fail';
        } else if (blockedCases > 0) {
          planResult = 'block';
        } else if (passedCases > 0) {
          planResult = 'pass';
        }
      } else if (executionStatus === 'failed') {
        planResult = 'fail';
      }

      return planResult === result;
    });

    // 重新计算总数
    filteredTotal = data.length;
    // 应用分页
    const skip = (page - 1) * pageSize;
    data = data.slice(skip, skip + pageSize);
  }

  return {
    data,
    total: filteredTotal,
    page,
    pageSize,
    totalPages: Math.ceil(filteredTotal / pageSize),
  };
}

// 🔥 配置：是否启用自动清理超时执行记录（默认关闭，可通过环境变量开启）
const ENABLE_AUTO_CLEANUP_EXPIRED_EXECUTIONS = process.env.ENABLE_AUTO_CLEANUP_EXPIRED_EXECUTIONS === 'true';
const RUNNING_TIMEOUT_MS = parseInt(process.env.RUNNING_TIMEOUT_MS || '60000'); // 默认1分钟

/**
 * 获取测试计划详情
 */
export async function getTestPlanDetail(planId: number): Promise<TestPlanDetailResponse> {
  // 🔥 自动清理超时的 running 执行记录（默认关闭，可通过环境变量 ENABLE_AUTO_CLEANUP_EXPIRED_EXECUTIONS=true 开启）
  if (ENABLE_AUTO_CLEANUP_EXPIRED_EXECUTIONS) {
    const timeoutThreshold = new Date(Date.now() - RUNNING_TIMEOUT_MS);
    
    try {
      // 🔥 先查找超时的执行记录，以便计算每条记录的 duration_ms
      const expiredExecutions = await prisma.test_plan_executions.findMany({
        where: {
          plan_id: planId,
          status: 'running',
          started_at: {
            lt: timeoutThreshold
          }
        },
        select: {
          id: true,
          started_at: true,
          execution_results: true,
        }
      });
      
      if (expiredExecutions.length > 0) {
        const now = new Date();
        
        // 🔥 逐条更新，计算正确的 duration_ms
        for (const execution of expiredExecutions) {
          // 计算 duration_ms：优先使用 execution_results 中每条用例的 duration_ms 总和
          let durationMs = 0;
          if (execution.execution_results && Array.isArray(execution.execution_results)) {
            durationMs = (execution.execution_results as Array<{ duration_ms?: number }>)
              .filter(r => r.duration_ms && r.duration_ms > 0)
              .reduce((sum, r) => sum + (r.duration_ms || 0), 0);
          }
          // 如果没有用例耗时数据，使用从开始到现在的时间
          if (durationMs === 0 && execution.started_at) {
            durationMs = now.getTime() - execution.started_at.getTime();
          }
          
          await prisma.test_plan_executions.update({
            where: { id: execution.id },
            data: {
              status: 'cancelled',
              finished_at: now,
              duration_ms: durationMs,
              error_message: '执行超时：页面刷新或关闭导致执行被取消'
            }
          });
        }
        
        console.log(`🧹 [testPlanService] 自动清理了 ${expiredExecutions.length} 个超时的 running 执行记录`);
      }
    } catch (error) {
      console.error('❌ [testPlanService] 清理超时执行记录失败:', error);
    }
  }

  // 🔥 修复：将 plan_executions 拆分为单独查询，避免 MySQL sort buffer 溢出
  // 原因：execution_results 是大 JSON 字段，在 include 中排序会导致
  // "Out of sort memory, consider increasing server sort buffer size" 错误
  const plan = await prisma.test_plans.findUnique({
    where: { id: planId },
    include: {
      owner: {
        select: {
          id: true,
          username: true,
          account_name: true,
        },
      },
      plan_cases: {
        orderBy: { sort_order: 'asc' },
      },
    },
  });

  if (!plan) {
    throw new Error('测试计划不存在');
  }

  // 单独查询执行记录，避免与主查询合并导致 sort buffer 溢出
  const planExecutions = await prisma.test_plan_executions.findMany({
    where: { plan_id: planId },
    orderBy: { started_at: 'desc' },
  });

  // 转换测试计划数据
  const planData: TestPlan = {
    id: plan.id,
    name: plan.name,
    short_name: plan.short_name || undefined,
    description: plan.description || undefined,
    project: plan.project || undefined,
    plan_type: plan.plan_type as any,
    status: plan.status as any,
    members: plan.members ? (plan.members as number[]) : undefined,
    owner_id: plan.owner_id,
    owner_name: plan.owner.account_name || plan.owner.username,
    start_date: plan.start_date?.toISOString(),
    end_date: plan.end_date?.toISOString(),
    created_at: plan.created_at.toISOString(),
    updated_at: plan.updated_at.toISOString(),
  };

  // 🔥 关键修复：从测试计划执行记录和test_case_executions表中收集所有用例的最新执行结果
  // 使用双数据源保证批量执行和单个执行都能获取到最新数据
  const caseExecutionMap = new Map<number, {
    result: string;
    executed_at: string;
    executor_name: string;
    execution_id?: string;
    status?: string; // 执行状态
  }>();
  
  console.log(`📋 [testPlanService] 开始构建用例执行状态映射，计划ID: ${planId}`);
  console.log(`📋 [testPlanService] 执行记录总数: ${planExecutions.length}`);
  
  // 🔥 步骤1：从测试计划执行记录的execution_results中获取（批量执行的数据源）
  let step1Count = 0;
  for (const execution of planExecutions) {
    const executionResults = (execution.execution_results as unknown as TestPlanCaseResult[]) || [];
    
    console.log(`📊 [testPlanService] 处理执行记录 ${execution.id}，包含 ${executionResults.length} 个用例结果`);
    
    for (const result of executionResults) {
      const caseId = result.case_id;
      const existing = caseExecutionMap.get(caseId);
      
      // 🔥 修复：获取执行时间，优先使用result.finished_at（用例完成时间），
      // 如果没有finished_at则使用result.executed_at，最后才使用execution.started_at
      const executedAt = result.finished_at || result.executed_at || execution.started_at.toISOString();
      
      // 如果还没有记录，或者当前执行记录更新，则更新
      if (!existing || executedAt > existing.executed_at) {
        // 🔥 修复：优先从execution_results中每个用例的execution_status获取状态
        // 如果execution_status不存在，再回退到整个执行记录的status
        let caseStatus: string | undefined;
        if (result.execution_status) {
          // 直接从execution_results中获取每个用例的执行状态
          caseStatus = result.execution_status;
        } else if (execution.status) {
          // 回退：使用整个执行记录的status
          const statusMap: Record<string, string> = {
            'running': 'running',
            'completed': 'completed',
            'failed': 'failed',
            'cancelled': 'cancelled',
          };
          caseStatus = statusMap[execution.status.toLowerCase()] || 'completed';
        } else {
          caseStatus = 'completed';
        }
        
        caseExecutionMap.set(caseId, {
          result: result.result,
          executed_at: executedAt,
          executor_name: execution.executor_name,
          execution_id: result.execution_id,
          status: caseStatus,
        });
        
        step1Count++;
        console.log(`✅ [步骤1] 用例 ${caseId} 从execution_results获取状态:`, {
          result: result.result,
          status: caseStatus,
          executed_at: executedAt,
          来源: 'execution_results'
        });
      }
    }
  }
  
  console.log(`📊 [步骤1完成] 从execution_results获取了 ${step1Count} 个用例的执行状态`);

  // 🔥 步骤2：从test_case_executions表直接查询UI自动化用例的最新执行记录（单个执行的数据源）
  // 这是关键修复：解决了单个用例执行时execution_results为空的问题
  const uiAutoCaseIds = plan.plan_cases
    .filter(c => c.case_type === 'ui_auto')
    .map(c => c.case_id);
  
  if (uiAutoCaseIds.length > 0) {
    console.log(`🔍 [步骤2开始] 查询 ${uiAutoCaseIds.length} 个UI自动化用例的最新执行记录`);
    console.log(`🔍 [步骤2] 用例ID列表:`, uiAutoCaseIds);
    
    // 为每个UI自动化用例查询最新的执行记录
    const latestExecutions = await Promise.all(
      uiAutoCaseIds.map(async (caseId) => {
        const execution = await prisma.test_case_executions.findFirst({
          where: { test_case_id: caseId },
          orderBy: { started_at: 'desc' },
          take: 1,
          include: {
            users: {
              select: {
                username: true,
                account_name: true,
              }
            }
          }
        });
        
        if (execution) {
          console.log(`🔍 [步骤2] 用例 ${caseId} 查询到执行记录:`, {
            execution_id: execution.id,
            status: execution.status,
            started_at: execution.started_at,
            total_steps: execution.total_steps,
            passed_steps: execution.passed_steps,
            failed_steps: execution.failed_steps
          });
        } else {
          console.log(`⚠️ [步骤2] 用例 ${caseId} 没有找到执行记录`);
        }
        
        return { caseId, execution };
      })
    );
    
    // 更新到caseExecutionMap
    let step2UpdateCount = 0;
    let step2SkipCount = 0;
    
    for (const { caseId, execution } of latestExecutions) {
      if (!execution) {
        console.log(`⚠️ [步骤2] 用例 ${caseId} 跳过：无执行记录`);
        continue;
      }
      
      const existing = caseExecutionMap.get(caseId);
      
      // 🔥 修复：优先使用finished_at（用例完成时间），如果没有则使用started_at
      // 必须有至少一个时间字段才能继续
      const executedAt = execution.finished_at?.toISOString() || execution.started_at?.toISOString();
      if (!executedAt) {
        console.warn(`⚠️ [步骤2] 用例 ${caseId} 跳过：execution.started_at和finished_at均为空`);
        continue;
      }
      
      // 决策逻辑：如果没有记录，或者test_case_executions的记录更新，则使用它
      const shouldUpdate = !existing || executedAt > existing.executed_at;
      
      console.log(`🔍 [步骤2] 用例 ${caseId} 决策:`, {
        shouldUpdate,
        existing: existing ? {
          executed_at: existing.executed_at,
          result: existing.result,
          来源: '步骤1'
        } : null,
        current: {
          executed_at: executedAt,
          来源: 'test_case_executions'
        }
      });
      
      if (shouldUpdate) {
        // 根据步骤统计判断结果
        let result: 'pass' | 'fail' | 'block' = 'pass';
        const failedSteps = execution.failed_steps || 0;
        const totalSteps = execution.total_steps || 0;
        const passedSteps = execution.passed_steps || 0;
        
        if (failedSteps > 0) {
          result = 'fail';
        } else if (totalSteps > 0 && passedSteps < totalSteps) {
          result = 'block';
        }
        
        caseExecutionMap.set(caseId, {
          result,
          executed_at: executedAt,
          executor_name: execution.users?.account_name || execution.users?.username || 'System',
          execution_id: execution.id,
          status: execution.status,
        });
        
        step2UpdateCount++;
        console.log(`✅ [步骤2] 用例 ${caseId} 更新状态:`, {
          result,
          status: execution.status,
          executed_at: executedAt,
          来源: 'test_case_executions',
          步骤统计: { totalSteps, passedSteps, failedSteps }
        });
      } else {
        step2SkipCount++;
        console.log(`⏩ [步骤2] 用例 ${caseId} 跳过更新：现有数据更新`);
      }
    }
    
    console.log(`📊 [步骤2完成] 从test_case_executions更新了 ${step2UpdateCount} 个用例，跳过 ${step2SkipCount} 个`);
  }
  
  console.log(`✅ [完成] caseExecutionMap 最终包含 ${caseExecutionMap.size} 个用例的执行状态`);
  console.log(`📋 [完成] 用例ID列表:`, Array.from(caseExecutionMap.keys()));

  // 转换用例数据，并获取功能用例和UI自动化用例的详细信息
  const cases: TestPlanCase[] = await Promise.all(
    plan.plan_cases.map(async (c) => {
      let caseDetail = undefined;
      let latestCaseName = c.case_name; // 🔥 默认使用 plan_cases 表中的 case_name
      
      // 如果是功能测试用例，获取详细信息
      if (c.case_type === 'functional') {
        const functionalCase = await prisma.functional_test_cases.findUnique({
          where: { id: c.case_id },
          include: {
            project_version: {
              select: {
                id: true,
                version_name: true,
                version_code: true,
              },
            },
          },
        });
        
        if (functionalCase) {
          // 🔥 使用 test_cases 表的最新 name
          latestCaseName = functionalCase.name;
          caseDetail = {
            id: functionalCase.id,
            name: functionalCase.name,
            case_type: functionalCase.case_type,
            priority: functionalCase.priority,
            source: functionalCase.source,
            project_version_id: functionalCase.project_version_id,
            project_version: functionalCase.project_version ? {
              id: functionalCase.project_version.id,
              version_name: functionalCase.project_version.version_name,
              version_code: functionalCase.project_version.version_code,
            } : null,
          };
        }
      }
      // 🔥 新增：如果是UI自动化用例，从文件系统获取详细信息
      else if (c.case_type === 'ui_auto') {
        try {
          // 动态导入 TestExecutionService 以获取 UI 自动化用例详情
          const { TestExecutionService } = await import('./testExecution.js');
          const testExecutionService = new TestExecutionService();
          const uiAutoCase = await testExecutionService.getTestCaseById(c.case_id);
          
          if (uiAutoCase) {
            // 🔥 使用 test_cases 表的最新 title（通过 name 字段返回）
            latestCaseName = uiAutoCase.name;
            console.log(`✅ [testPlanService] 获取UI自动化用例详情成功, ID: ${c.case_id}, 名称: ${uiAutoCase.name}`);
            caseDetail = {
              id: uiAutoCase.id,
              name: uiAutoCase.name,
              description: uiAutoCase.description,
              priority: uiAutoCase.priority,
              version: uiAutoCase.projectVersion, // 🔥 修复：使用 projectVersion 字段
              case_type: uiAutoCase.caseType, // 🔥 新增：用例类型（SMOKE、FULL等）
              module: uiAutoCase.module,
              tags: uiAutoCase.tags,
              author: uiAutoCase.author,
              status: uiAutoCase.status,
            };
          } else {
            console.warn(`⚠️ [testPlanService] UI自动化用例不存在, ID: ${c.case_id}`);
          }
        } catch (error) {
          console.error(`❌ [testPlanService] 获取UI自动化用例详情失败, ID: ${c.case_id}:`, error);
          // 失败时不影响整体流程，caseDetail 保持 undefined，使用默认的 c.case_name
        }
      }
      
      // 🔥 关键修复：从测试计划执行记录中获取最新执行结果
      // 数据来源必须是执行历史的最新数据，确保一致性
      const latestExecution = caseExecutionMap.get(c.case_id);
      
      // 🔥 修复：完全基于执行历史判断执行状态和结果
      // 如果有执行历史，使用执行历史的数据；如果没有，设置为未执行
      let is_executed = false;
      let execution_result = undefined;
      
      if (latestExecution) {
        // 有执行历史：使用执行历史的数据
        is_executed = true;
        execution_result = latestExecution.result;
        
        console.log(`📊 [testPlanService] 用例 ${c.case_id} 从执行历史获取状态:`, {
          is_executed,
          execution_result,
          executed_at: latestExecution.executed_at,
          status: latestExecution.status
        });
        
        // 将最新执行记录信息添加到 case_detail（如果 caseDetail 不存在，创建一个）
        if (!caseDetail) {
          caseDetail = {};
        }
        caseDetail.last_execution = {
          execution_id: latestExecution.execution_id,
          final_result: latestExecution.result,
          executed_at: latestExecution.executed_at,
          executor_name: latestExecution.executor_name,
          status: latestExecution.status || 'completed', // 添加状态字段
        };
      } else {
        // 🔥 修复：没有执行历史，明确设置为未执行状态
        console.log(`📊 [testPlanService] 用例 ${c.case_id} 无执行历史，设置为未执行`);
      }
      
      return {
        id: c.id,
        plan_id: c.plan_id,
        case_id: c.case_id,
        case_type: c.case_type as any,
        case_name: latestCaseName, // 🔥 使用从 test_cases 表获取的最新名称
        sort_order: c.sort_order,
        is_executed: is_executed,
        execution_result: execution_result as any,
        created_at: c.created_at.toISOString(),
        case_detail: caseDetail,
      };
    })
  );

  // 转换执行记录数据
  const executions: TestPlanExecution[] = planExecutions.map((e) => {
    // 🔥 修复：finished_at应该始终从execution_results中获取最后一条用例的finished_at
    // 而不是使用数据库中的finished_at字段，以确保时间戳的准确性
    let finishedAt: string | undefined = undefined;
    const executionResults = (e.execution_results as unknown as TestPlanCaseResult[]) || [];
    // 找出所有有finished_at的结果，按时间降序排序，取最晚的一个
    const finishedResults = executionResults
      .filter(r => r.finished_at)
      .sort((a, b) => {
        const timeA = new Date(a.finished_at!).getTime();
        const timeB = new Date(b.finished_at!).getTime();
        return timeB - timeA; // 降序，最晚的在前面
      });
    if (finishedResults.length > 0) {
      finishedAt = finishedResults[0].finished_at!;
      console.log(`📊 [testPlanService] 执行记录 ${e.id} 的finished_at从execution_results获取: ${finishedAt}`);
    } else {
      // 如果没有execution_results或没有finished_at，回退到数据库中的值
      finishedAt = e.finished_at?.toISOString();
      console.log(`📊 [testPlanService] 执行记录 ${e.id} 的finished_at从数据库字段获取: ${finishedAt}`);
    }
    
    return {
      id: e.id,
      plan_id: e.plan_id,
      plan_name: e.plan_name,
      executor_id: e.executor_id,
      executor_name: e.executor_name,
      execution_type: e.execution_type as any,
      status: e.status as any,
      progress: e.progress,
      total_cases: e.total_cases,
      completed_cases: e.completed_cases,
      passed_cases: e.passed_cases,
      failed_cases: e.failed_cases,
      blocked_cases: e.blocked_cases,
      skipped_cases: e.skipped_cases,
      started_at: e.started_at.toISOString(),
      finished_at: finishedAt,
      duration_ms: e.duration_ms || undefined,
      execution_results: e.execution_results as any,
      error_message: e.error_message || undefined,
      metadata: e.metadata as any,
    };
  });

  // 计算统计信息
  const statistics: TestPlanStatistics = {
    total_cases: cases.length,
    functional_cases: cases.filter((c) => c.case_type === 'functional').length,
    ui_auto_cases: cases.filter((c) => c.case_type === 'ui_auto').length,
    executed_cases: cases.filter((c) => c.is_executed).length,
    passed_cases: cases.filter((c) => c.execution_result === 'pass').length,
    failed_cases: cases.filter((c) => c.execution_result === 'fail').length,
    blocked_cases: cases.filter((c) => c.execution_result === 'block').length,
    skipped_cases: cases.filter((c) => c.execution_result === 'skip').length,
    pass_rate: 0,
    execution_rate: 0,
    total_executions: executions.length,
    latest_execution: executions[0],
  };

  if (statistics.executed_cases > 0) {
    statistics.pass_rate = (statistics.passed_cases / statistics.executed_cases) * 100;
  }

  if (statistics.total_cases > 0) {
    statistics.execution_rate = (statistics.executed_cases / statistics.total_cases) * 100;
  }

  return {
    plan: planData,
    cases,
    executions,
    statistics,
  };
}

/**
 * 创建测试计划
 */
export async function createTestPlan(input: CreateTestPlanInput): Promise<TestPlan> {
  const plan = await prisma.test_plans.create({
    data: {
      name: input.name,
      short_name: input.short_name,
      description: input.description,
      project: input.project,
      plan_type: input.plan_type,
      status: input.status || 'draft',
      members: input.members || [],
      owner_id: input.owner_id,
      start_date: input.start_date ? new Date(input.start_date) : null,
      end_date: input.end_date ? new Date(input.end_date) : null,
    },
    include: {
      owner: {
        select: {
          username: true,
          account_name: true,
        },
      },
    },
  });

  return {
    id: plan.id,
    name: plan.name,
    short_name: plan.short_name || undefined,
    description: plan.description || undefined,
    project: plan.project || undefined,
    plan_type: plan.plan_type as any,
    status: plan.status as any,
    members: plan.members as number[],
    owner_id: plan.owner_id,
    owner_name: plan.owner.account_name || plan.owner.username,
    start_date: plan.start_date?.toISOString(),
    end_date: plan.end_date?.toISOString(),
    created_at: plan.created_at.toISOString(),
    updated_at: plan.updated_at.toISOString(),
  };
}

/**
 * 更新测试计划
 */
export async function updateTestPlan(planId: number, input: UpdateTestPlanInput): Promise<TestPlan> {
  const data: any = {};

  if (input.name !== undefined) data.name = input.name;
  if (input.short_name !== undefined) data.short_name = input.short_name;
  if (input.description !== undefined) data.description = input.description;
  if (input.project !== undefined) data.project = input.project;
  if (input.plan_type !== undefined) data.plan_type = input.plan_type;
  if (input.status !== undefined) data.status = input.status;
  if (input.members !== undefined) data.members = input.members;
  if (input.owner_id !== undefined) data.owner_id = input.owner_id;
  if (input.start_date !== undefined) data.start_date = input.start_date ? new Date(input.start_date) : null;
  if (input.end_date !== undefined) data.end_date = input.end_date ? new Date(input.end_date) : null;

  const plan = await prisma.test_plans.update({
    where: { id: planId },
    data,
    include: {
      owner: {
        select: {
          username: true,
          account_name: true,
        },
      },
    },
  });

  return {
    id: plan.id,
    name: plan.name,
    short_name: plan.short_name || undefined,
    description: plan.description || undefined,
    project: plan.project || undefined,
    plan_type: plan.plan_type as any,
    status: plan.status as any,
    members: plan.members as number[],
    owner_id: plan.owner_id,
    owner_name: plan.owner.account_name || plan.owner.username,
    start_date: plan.start_date?.toISOString(),
    end_date: plan.end_date?.toISOString(),
    created_at: plan.created_at.toISOString(),
    updated_at: plan.updated_at.toISOString(),
  };
}

/**
 * 删除测试计划（软删除）
 */
export async function deleteTestPlan(planId: number): Promise<void> {
  await prisma.test_plans.update({
    where: { id: planId },
    data: {
      deleted_at: new Date(),
    },
  });
}

/**
 * 添加用例到测试计划
 */
export async function addCasesToPlan(input: AddCasesToPlanInput): Promise<TestPlanCase[]> {
  const { plan_id, cases } = input;

  // 获取当前最大排序号
  const maxSortOrder = await prisma.test_plan_cases.findFirst({
    where: { plan_id },
    orderBy: { sort_order: 'desc' },
    select: { sort_order: true },
  });

  let currentSortOrder = maxSortOrder?.sort_order || 0;

  // 批量创建用例关联
  const createdCases = await Promise.all(
    cases.map(async (c, index) => {
      // 检查是否已存在
      const existing = await prisma.test_plan_cases.findFirst({
        where: {
          plan_id,
          case_id: c.case_id,
          case_type: c.case_type,
        },
      });

      if (existing) {
        return existing;
      }

      return prisma.test_plan_cases.create({
        data: {
          plan_id,
          case_id: c.case_id,
          case_type: c.case_type,
          case_name: c.case_name,
          sort_order: ++currentSortOrder,
        },
      });
    })
  );

  return createdCases.map((c) => ({
    id: c.id,
    plan_id: c.plan_id,
    case_id: c.case_id,
    case_type: c.case_type as any,
    case_name: c.case_name,
    sort_order: c.sort_order,
    is_executed: c.is_executed,
    execution_result: c.execution_result as any,
    created_at: c.created_at.toISOString(),
  }));
}

/**
 * 从测试计划中移除用例
 */
export async function removeCaseFromPlan(planId: number, caseId: number, caseType: string): Promise<void> {
  await prisma.test_plan_cases.deleteMany({
    where: {
      plan_id: planId,
      case_id: caseId,
      case_type: caseType,
    },
  });
}

/**
 * 开始执行测试计划
 */
export async function startTestPlanExecution(
  input: StartTestPlanExecutionInput,
  testExecutionService?: TestExecutionService
): Promise<TestPlanExecution> {
  const { plan_id, executor_id, execution_type, case_ids } = input;

  // 获取测试计划信息
  const plan = await prisma.test_plans.findUnique({
    where: { id: plan_id },
    include: {
      owner: {
        select: {
          username: true,
          account_name: true,
        },
      },
    },
  });

  if (!plan) {
    throw new Error('测试计划不存在');
  }

  // 获取执行者信息
  const executor = await prisma.users.findUnique({
    where: { id: executor_id },
    select: {
      username: true,
      account_name: true,
    },
  });

  if (!executor) {
    throw new Error('执行者不存在');
  }

  // 获取要执行的用例列表
  const where: any = {
    plan_id,
    case_type: execution_type,
  };

  if (case_ids && case_ids.length > 0) {
    where.case_id = { in: case_ids };
  }

  const cases = await prisma.test_plan_cases.findMany({
    where,
    orderBy: { case_id: 'asc' },
  });

  if (cases.length === 0) {
    throw new Error('没有找到要执行的用例');
  }

  // 创建执行记录
  const execution = await prisma.test_plan_executions.create({
    data: {
      plan_id,
      plan_name: plan.name,
      executor_id,
      executor_name: executor.account_name || executor.username,
      execution_type,
      status: 'running',
      progress: 0,
      total_cases: cases.length,
      completed_cases: 0,
      passed_cases: 0,
      failed_cases: 0,
      blocked_cases: 0,
      skipped_cases: 0,
      execution_results: [],
    },
  });

  // 🔥 修复：根据 autoExecute 参数决定是否自动执行
  // 单个用例执行时 autoExecute=false，只创建执行记录，不自动执行
  // 批量执行时 autoExecute=true（默认），自动执行所有用例
  const shouldAutoExecute = input.autoExecute !== undefined ? input.autoExecute : true;
  
  if (execution_type === 'ui_auto' && testExecutionService && shouldAutoExecute) {
    console.log(`🚀 [TestPlan] 开始异步执行UI自动化测试计划, 执行记录ID: ${execution.id}, autoExecute: ${shouldAutoExecute}`);
    
    // 🔥 从 executionConfig 获取执行配置，如果没有则使用默认值
    const execConfig = input.executionConfig || {};
    const environment = execConfig.environment || 'staging';
    const executionEngine = execConfig.executionEngine || 'mcp';
    const enableTrace = execConfig.enableTrace !== undefined ? execConfig.enableTrace : false;
    const enableVideo = execConfig.enableVideo !== undefined ? execConfig.enableVideo : false;
    
    console.log(`📋 [TestPlan] 执行配置:`, {
      environment,
      executionEngine,
      enableTrace,
      enableVideo
    });
    
    // 🔥 修复：在开始执行前，初始化所有用例到execution_results
    // 第一个用例状态为running，其他为queued
    const initialResults: TestPlanCaseResult[] = cases.map((testCase, index) => ({
      case_id: testCase.case_id,
      case_name: testCase.case_name,
      case_type: 'ui_auto',
      execution_status: index === 0 ? 'running' : 'queued',
      result: '' as const,
      duration_ms: 0,
      executor_id: executor_id,
      executor_name: executor.account_name || executor.username,
    }));

    // 🔥 调试日志：打印初始化顺序
    console.log(`📋 [TestPlan] 初始化用例顺序:`, initialResults.map((r, idx) => ({
      index: idx,
      case_id: r.case_id,
      case_name: r.case_name,
      execution_status: r.execution_status
    })));

    // 初始化execution_results
    await updateTestPlanExecution(execution.id, {
      status: 'running',
      execution_results: initialResults,
    });

    console.log(`📋 [TestPlan] 初始化 ${initialResults.length} 个用例到execution_results，第一个状态为running，其他为queued`);

    // 异步执行，不等待结果
    (async () => {
      try {
        let completedCount = 0;
        let passedCount = 0;
        let failedCount = 0;
        let blockedCount = 0;
        const results: TestPlanCaseResult[] = [];

        // 逐个执行用例
        for (const testCase of cases) {
          try {
            console.log(`🎬 [TestPlan] 执行用例: ${testCase.case_name} (ID: ${testCase.case_id})`);
            
            // 🔥 使用 executionConfig 中的配置执行用例
            const runId = await testExecutionService.runTest(
              testCase.case_id,
              environment,
              'standard',
              {
                userId: String(executor_id),
                executionEngine: executionEngine as 'mcp' | 'playwright',
                enableTrace: enableTrace,
                enableVideo: enableVideo,
                planExecutionId: execution.id // 🔥 传递执行记录ID，用于同步execution_results
              }
            );

            console.log(`✅ [TestPlan] 用例 ${testCase.case_name} 开始执行, runId: ${runId}`);
            
            // 🔥 等待执行完成并获取真实结果
            const execResult = await waitForTestCompletion(runId);
            
            completedCount++;
            
            // 🔥 根据真实结果更新计数
            if (execResult.result === 'pass') {
              passedCount++;
            } else if (execResult.result === 'fail') {
              failedCount++;
            } else if (execResult.result === 'block') {
              blockedCount++;
            }
            
            console.log(`✅ [TestPlan] 用例 ${testCase.case_name} 执行完成, 结果: ${execResult.result}, 耗时: ${execResult.duration_ms}ms`);
            
            // 🔥 修复：添加步骤统计数据，与功能测试保持一致
            results.push({
              case_id: testCase.case_id,
              case_name: testCase.case_name,
              case_type: 'ui_auto',
              result: execResult.result,
              duration_ms: execResult.duration_ms,
              executed_at: new Date().toISOString(),
              execution_id: runId, // 🔥 保存 runId 用于跳转到详细日志
              // 🔥 新增：步骤统计数据
              totalSteps: execResult.totalSteps,
              passedSteps: execResult.passedSteps,
              failedSteps: execResult.failedSteps,
              blockedSteps: execResult.blockedSteps,
              completedSteps: execResult.completedSteps,
              started_at: execResult.started_at,
              finished_at: execResult.finished_at,
              executor_name: execResult.executor_name,
              executor_id: execResult.executor_id,
              // 🔥 新增：执行状态
              execution_status: execResult.execution_status,
            });

            // 更新进度
            const progress = Math.round((completedCount / cases.length) * 100);
            await updateTestPlanExecution(execution.id, {
              progress,
              completed_cases: completedCount,
              passed_cases: passedCount,
              failed_cases: failedCount,
              blocked_cases: blockedCount,
              execution_results: results,
            });
          } catch (error) {
            console.error(`❌ [TestPlan] 执行用例失败:`, error);
            completedCount++;
            failedCount++;
            
            results.push({
              case_id: testCase.case_id,
              case_name: testCase.case_name,
              case_type: 'ui_auto',
              result: 'fail',
              error_message: error instanceof Error ? error.message : '执行失败',
              duration_ms: 0,
              executed_at: new Date().toISOString(),
            });

            // 更新进度
            const progress = Math.round((completedCount / cases.length) * 100);
            await updateTestPlanExecution(execution.id, {
              progress,
              completed_cases: completedCount,
              passed_cases: passedCount,
              failed_cases: failedCount,
              blocked_cases: blockedCount,
              execution_results: results,
            });
          }
        }

        // 执行完成，更新最终状态
        const totalDuration = results.reduce((sum, r) => sum + (r.duration_ms || 0), 0);
        await updateTestPlanExecution(execution.id, {
          status: 'completed',
          progress: 100,
          finished_at: new Date(),
          duration_ms: totalDuration,
        });

        // 🔥 更新测试计划状态
        await updateTestPlanStatusFromLatestExecution(plan_id);

        console.log(`✅ [TestPlan] 测试计划执行完成, 执行记录ID: ${execution.id}`);
      } catch (error) {
        console.error(`❌ [TestPlan] 测试计划执行失败:`, error);
        await updateTestPlanExecution(execution.id, {
          status: 'failed',
          error_message: error instanceof Error ? error.message : '执行失败',
          finished_at: new Date(),
        });
      }
    })();
  }

  return {
    id: execution.id,
    plan_id: execution.plan_id,
    plan_name: execution.plan_name,
    executor_id: execution.executor_id,
    executor_name: execution.executor_name,
    execution_type: execution.execution_type as any,
    status: execution.status as any,
    progress: execution.progress,
    total_cases: execution.total_cases,
    completed_cases: execution.completed_cases,
    passed_cases: execution.passed_cases,
    failed_cases: execution.failed_cases,
    blocked_cases: execution.blocked_cases,
    skipped_cases: execution.skipped_cases,
    started_at: execution.started_at.toISOString(),
    execution_results: execution.execution_results as any,
  };
}

/**
 * 更新测试计划执行状态
 */
export async function updateTestPlanExecution(
  executionId: string,
  update: {
    status?: string;
    progress?: number;
    total_cases?: number; // 🔥 支持更新总用例数
    completed_cases?: number;
    passed_cases?: number;
    failed_cases?: number;
    blocked_cases?: number;
    skipped_cases?: number;
    execution_results?: TestPlanCaseResult[];
    error_message?: string | null; // 🔥 支持 null
    started_at?: Date | null; // 🔥 支持更新开始时间（继续执行时可能需要）
    finished_at?: Date | null; // 🔥 支持 null（继续执行时需要重置）
    duration_ms?: number | null; // 🔥 支持 null（继续执行时需要重置）
  }
): Promise<TestPlanExecution> {
  // 🔥 调试日志：打印接收到的更新数据
  console.log(`📊 [updateTestPlanExecution] 接收更新请求:`, {
    executionId,
    status: update.status,
    progress: update.progress,
    total_cases: update.total_cases,
    completed_cases: update.completed_cases,
    passed_cases: update.passed_cases,
    failed_cases: update.failed_cases,
    blocked_cases: update.blocked_cases,
    skipped_cases: update.skipped_cases,
    error_message: update.error_message,
    started_at: update.started_at,
    finished_at: update.finished_at,
    duration_ms: update.duration_ms,
    hasExecutionResults: update.execution_results ? update.execution_results.length : 0,
  });

  const data: any = {};

  if (update.status !== undefined) data.status = update.status;
  if (update.progress !== undefined) data.progress = update.progress;
  if (update.total_cases !== undefined) data.total_cases = update.total_cases;
  if (update.completed_cases !== undefined) data.completed_cases = update.completed_cases;
  if (update.passed_cases !== undefined) data.passed_cases = update.passed_cases;
  if (update.failed_cases !== undefined) data.failed_cases = update.failed_cases;
  if (update.blocked_cases !== undefined) data.blocked_cases = update.blocked_cases;
  if (update.skipped_cases !== undefined) data.skipped_cases = update.skipped_cases;
  if (update.execution_results !== undefined) {
    // 🔥 修复：确保 execution_results 按 case_id 正序排序
    data.execution_results = [...update.execution_results].sort((a, b) => a.case_id - b.case_id);
  }
  if (update.error_message !== undefined) data.error_message = update.error_message; // null 也会被设置
  if (update.started_at !== undefined) data.started_at = update.started_at; // 支持更新开始时间
  if (update.finished_at !== undefined) data.finished_at = update.finished_at; // null 也会被设置
  if (update.duration_ms !== undefined) data.duration_ms = update.duration_ms; // null 也会被设置
  
  // 🔥 调试日志：打印将要更新的数据
  console.log(`📊 [updateTestPlanExecution] 将要更新的数据:`, data);

  // 🔥 新增：根据 execution_results 自动计算并更新时间和耗时
  if (update.execution_results && update.execution_results.length > 0) {
    // 🔥 修复：确保 execution_results 按 case_id 正序排序
    const results = [...update.execution_results].sort((a, b) => a.case_id - b.case_id);
    
    // 获取所有有效的开始时间，找出最早的
    const startTimes = results
      .filter(r => r.started_at)
      .map(r => new Date(r.started_at!).getTime())
      .filter(t => !isNaN(t));
    
    // 获取所有有效的结束时间，找出最晚的
    const finishTimes = results
      .filter(r => r.finished_at)
      .map(r => new Date(r.finished_at!).getTime())
      .filter(t => !isNaN(t));
    
    // 计算总耗时（所有用例耗时之和）
    const totalDurationMs = results
      .filter(r => r.duration_ms && r.duration_ms > 0)
      .reduce((sum, r) => sum + (r.duration_ms || 0), 0);
    
    console.log(`📊 [updateTestPlanExecution] 根据 execution_results 计算时间:`, {
      executionId,
      resultsCount: results.length,
      startTimesCount: startTimes.length,
      finishTimesCount: finishTimes.length,
      totalDurationMs,
    });
    
    // 🔥 修改：总是根据 execution_results 更新 started_at
    // 使用所有用例中最早的开始时间
    if (startTimes.length > 0) {
      const earliestStart = new Date(Math.min(...startTimes));
      data.started_at = earliestStart;
      console.log(`📊 [updateTestPlanExecution] 更新 started_at: ${earliestStart.toISOString()}`);
    }
    
    // 🔥 修改：总是根据 execution_results 更新 finished_at 和 duration_ms
    // 当用户返回上一个用例重新执行时，需要使用最新的时间信息
    if (finishTimes.length > 0) {
      const latestFinish = new Date(Math.max(...finishTimes));
      data.finished_at = latestFinish;
      console.log(`📊 [updateTestPlanExecution] 更新 finished_at: ${latestFinish.toISOString()}`);
    }
    
    // 🔥 修改：总是根据 execution_results 重新计算 duration_ms
    if (totalDurationMs > 0) {
      data.duration_ms = totalDurationMs;
      console.log(`📊 [updateTestPlanExecution] 更新 duration_ms: ${totalDurationMs}ms`);
    }
    
    // 🔥 修复：根据 execution_results 自动计算进度
    // 进度公式：进度 = (已完成用例数 + 0.5 * 正在执行用例数) / 总用例数 * 100
    // 这样当第一个用例开始执行时，进度会立即从0%变为约25%（2条用例的情况）
    if (update.progress === undefined) {
      // 只有未传入progress时才自动计算
      const totalCases = update.total_cases !== undefined ? update.total_cases : results.length;
      const completedCases = results.filter(r => 
        r.execution_status === 'completed' || 
        r.execution_status === 'failed' || 
        r.execution_status === 'cancelled' || 
        r.execution_status === 'error' ||
        (r.result && (r.result === 'pass' || r.result === 'fail' || r.result === 'block' || r.result === 'skip'))
      ).length;
      const runningCases = results.filter(r => r.execution_status === 'running').length;
      
      if (totalCases > 0) {
        const calculatedProgress = Math.round(((completedCases + 0.5 * runningCases) / totalCases) * 100);
        data.progress = calculatedProgress;
        console.log(`📊 [updateTestPlanExecution] 自动计算进度: ${calculatedProgress}% (已完成: ${completedCases}, 执行中: ${runningCases}, 总计: ${totalCases})`);
      }
    }
  }

  const execution = await prisma.test_plan_executions.update({
    where: { id: executionId },
    data,
  });

  // 🔥 修复：发送 WebSocket 广播，通知前端执行状态变化
  try {
    broadcastTestPlanExecutionUpdate(executionId, {
      status: execution.status,
      progress: execution.progress,
      total_cases: execution.total_cases,
      completed_cases: execution.completed_cases,
      passed_cases: execution.passed_cases,
      failed_cases: execution.failed_cases,
      blocked_cases: execution.blocked_cases,
      skipped_cases: execution.skipped_cases,
      execution_results: execution.execution_results,
    });
  } catch (wsError) {
    console.warn(`⚠️ [updateTestPlanExecution] WebSocket 广播失败:`, wsError);
    // 不抛出错误，避免影响主流程
  }

  // 🔥 如果执行状态变化（running/completed/failed/cancelled），自动更新测试计划状态
  if (update.status === 'running' || update.status === 'completed' || update.status === 'failed' || update.status === 'cancelled') {
    console.log(`📊 [testPlanService] 执行记录 ${executionId} 状态变为 ${update.status}，触发计划状态更新`);
    // 异步更新计划状态，不阻塞返回
    updateTestPlanStatusFromLatestExecution(execution.plan_id).catch(error => {
      console.error(`❌ [testPlanService] 更新计划状态失败:`, error);
    });
  }

  return {
    id: execution.id,
    plan_id: execution.plan_id,
    plan_name: execution.plan_name,
    executor_id: execution.executor_id,
    executor_name: execution.executor_name,
    execution_type: execution.execution_type as any,
    status: execution.status as any,
    progress: execution.progress,
    total_cases: execution.total_cases,
    completed_cases: execution.completed_cases,
    passed_cases: execution.passed_cases,
    failed_cases: execution.failed_cases,
    blocked_cases: execution.blocked_cases,
    skipped_cases: execution.skipped_cases,
    started_at: execution.started_at.toISOString(),
    finished_at: execution.finished_at?.toISOString(),
    duration_ms: execution.duration_ms || undefined,
    execution_results: execution.execution_results as any,
    error_message: execution.error_message || undefined,
    metadata: execution.metadata as any,
  };
}

/**
 * 更新测试计划用例执行状态
 */
export async function updateTestPlanCaseStatus(
  planId: number,
  caseId: number,
  caseType: string,
  result: string
): Promise<void> {
  await prisma.test_plan_cases.updateMany({
    where: {
      plan_id: planId,
      case_id: caseId,
      case_type: caseType,
    },
    data: {
      is_executed: true,
      execution_result: result,
    },
  });
}

/**
 * 删除测试计划执行记录
 */
export async function deleteTestPlanExecution(executionId: string): Promise<void> {
  await prisma.test_plan_executions.delete({
    where: { id: executionId },
  });
}

/**
 * 🔥 重新执行测试计划执行记录（UI自动化）
 * 重置结果并重新触发执行任务
 */
export async function reExecuteTestPlanExecution(
  executionId: string,
  executionConfig: {
    environment?: string;
    executionEngine?: 'mcp' | 'playwright';
    enableTrace?: boolean;
    enableVideo?: boolean;
  },
  testExecutionService?: TestExecutionService
): Promise<void> {
  console.log(`🔄 [TestPlan] 重新执行测试计划执行记录, executionId: ${executionId}`);
  
  // 获取执行记录
  const execution = await prisma.test_plan_executions.findUnique({
    where: { id: executionId },
  });
  
  if (!execution) {
    throw new Error('执行记录不存在');
  }
  
  if (execution.execution_type !== 'ui_auto') {
    throw new Error('只支持UI自动化执行记录的重新执行');
  }
  
  // 从 execution_results 中获取用例列表
  const executionResults = (execution.execution_results as TestPlanCaseResult[]) || [];
  if (executionResults.length === 0) {
    throw new Error('执行记录中没有用例');
  }
  
  // 获取用例信息（从 test_plan_cases 表）
  const caseIds = executionResults.map(r => r.case_id);
  const cases = await prisma.test_plan_cases.findMany({
    where: {
      plan_id: execution.plan_id,
      case_id: { in: caseIds },
      case_type: 'ui_auto',
    },
    orderBy: { case_id: 'asc' },
  });
  
  if (cases.length === 0) {
    throw new Error('没有找到要执行的用例');
  }
  
  // 获取执行配置
  const execConfig = executionConfig || {};
  const environment = execConfig.environment || 'staging';
  const executionEngine = execConfig.executionEngine || 'mcp';
  const enableTrace = execConfig.enableTrace !== undefined ? execConfig.enableTrace : false;
  const enableVideo = execConfig.enableVideo !== undefined ? execConfig.enableVideo : false;
  
  console.log(`📋 [TestPlan] 重新执行配置:`, {
    environment,
    executionEngine,
    enableTrace,
    enableVideo
  });
  
  // 重置执行结果为 queued 状态（已经在前端重置，这里确保状态正确）
  // 如果提供了 testExecutionService，异步执行用例
  if (testExecutionService) {
    console.log(`🚀 [TestPlan] 开始异步重新执行UI自动化测试计划, 执行记录ID: ${execution.id}`);
    
    // 🔥 修复：在开始执行前，初始化所有用例到execution_results
    // 第一个用例状态为running，其他为queued
    const initialResults: TestPlanCaseResult[] = cases.map((testCase, index) => ({
      case_id: testCase.case_id,
      case_name: testCase.case_name,
      case_type: 'ui_auto',
      execution_status: index === 0 ? 'running' : 'queued',
      result: '' as const,
      duration_ms: 0,
      executor_id: execution.executor_id,
      executor_name: execution.executor_name,
    }));

    // 初始化execution_results
    await updateTestPlanExecution(execution.id, {
      status: 'running',
      execution_results: initialResults,
    });

    console.log(`📋 [TestPlan] 重新执行：初始化 ${initialResults.length} 个用例到execution_results，第一个状态为running，其他为queued`);
    
    // 异步执行，不等待结果（复用 startTestPlanExecution 中的执行逻辑）
    (async () => {
      try {
        let completedCount = 0;
        let passedCount = 0;
        let failedCount = 0;
        let blockedCount = 0;
        const results: TestPlanCaseResult[] = [];

        // 逐个执行用例
        for (const testCase of cases) {
          try {
            console.log(`🎬 [TestPlan] 执行用例: ${testCase.case_name} (ID: ${testCase.case_id})`);
            
            // 🔥 使用 executionConfig 中的配置执行用例
            const runId = await testExecutionService.runTest(
              testCase.case_id,
              environment,
              'standard',
              {
                userId: String(execution.executor_id),
                executionEngine: executionEngine as 'mcp' | 'playwright',
                enableTrace: enableTrace,
                enableVideo: enableVideo,
                planExecutionId: execution.id // 🔥 传递执行记录ID，用于队列分组
              }
            );

            console.log(`✅ [TestPlan] 用例 ${testCase.case_name} 开始执行, runId: ${runId}`);
            
            // 🔥 等待执行完成并获取真实结果
            const execResult = await waitForTestCompletion(runId);
            
            completedCount++;
            
            // 🔥 根据真实结果更新计数
            if (execResult.result === 'pass') {
              passedCount++;
            } else if (execResult.result === 'fail') {
              failedCount++;
            } else if (execResult.result === 'block') {
              blockedCount++;
            }
            
            console.log(`✅ [TestPlan] 用例 ${testCase.case_name} 执行完成, 结果: ${execResult.result}, 耗时: ${execResult.duration_ms}ms`);
            
            // 🔥 修复：添加步骤统计数据，与功能测试保持一致
            results.push({
              case_id: testCase.case_id,
              case_name: testCase.case_name,
              case_type: 'ui_auto',
              result: execResult.result,
              duration_ms: execResult.duration_ms,
              executed_at: new Date().toISOString(),
              execution_id: runId, // 🔥 保存 runId 用于跳转到详细日志
              // 🔥 新增：步骤统计数据
              totalSteps: execResult.totalSteps,
              passedSteps: execResult.passedSteps,
              failedSteps: execResult.failedSteps,
              blockedSteps: execResult.blockedSteps,
              completedSteps: execResult.completedSteps,
              started_at: execResult.started_at,
              finished_at: execResult.finished_at,
              executor_name: execResult.executor_name,
              executor_id: execResult.executor_id,
              // 🔥 新增：执行状态
              execution_status: execResult.execution_status,
            });

            // 更新进度
            const progress = Math.round((completedCount / cases.length) * 100);
            await updateTestPlanExecution(execution.id, {
              progress,
              completed_cases: completedCount,
              passed_cases: passedCount,
              failed_cases: failedCount,
              blocked_cases: blockedCount,
              execution_results: results,
            });
          } catch (error) {
            console.error(`❌ [TestPlan] 执行用例失败:`, error);
            completedCount++;
            failedCount++;
            
            results.push({
              case_id: testCase.case_id,
              case_name: testCase.case_name,
              case_type: 'ui_auto',
              result: 'fail',
              error_message: error instanceof Error ? error.message : '执行失败',
              duration_ms: 0,
              executed_at: new Date().toISOString(),
            });

            // 更新进度
            const progress = Math.round((completedCount / cases.length) * 100);
            await updateTestPlanExecution(execution.id, {
              progress,
              completed_cases: completedCount,
              passed_cases: passedCount,
              failed_cases: failedCount,
              blocked_cases: blockedCount,
              execution_results: results,
            });
          }
        }

        // 执行完成，更新最终状态
        const totalDuration = results.reduce((sum, r) => sum + (r.duration_ms || 0), 0);
        await updateTestPlanExecution(execution.id, {
          status: 'completed',
          progress: 100,
          finished_at: new Date(),
          duration_ms: totalDuration,
          execution_results: results,
        });

        // 🔥 更新测试计划状态
        await updateTestPlanStatusFromLatestExecution(execution.plan_id);

        console.log(`✅ [TestPlan] 测试计划重新执行完成, 执行记录ID: ${execution.id}`);
      } catch (error) {
        console.error(`❌ [TestPlan] 测试计划重新执行失败:`, error);
        await updateTestPlanExecution(execution.id, {
          status: 'failed',
          error_message: error instanceof Error ? error.message : '执行失败',
          finished_at: new Date(),
        });
      }
    })();
  }
  
  console.log(`✅ [TestPlan] 重新执行请求已提交, executionId: ${executionId}`);
}

/**
 * 获取测试计划执行记录的详细信息（包含每个用例的执行日志）
 */
export async function getTestPlanExecutionDetail(executionId: string): Promise<TestPlanExecution> {
  const execution = await prisma.test_plan_executions.findUnique({
    where: { id: executionId },
  });

  if (!execution) {
    throw new Error('执行记录不存在');
  }

  // 获取execution_results中的所有用例ID和execution_id
  const executionResults = (execution.execution_results as TestPlanCaseResult[]) || [];
  
  // 为每个用例获取详细的执行日志
  const resultsWithLogs = await Promise.all(
    executionResults.map(async (result) => {
      if (!result.execution_id) {
        return result;
      }

      // 获取功能测试用例的执行记录
      try {
        const executionRecord = await prisma.functional_test_executions.findUnique({
          where: { id: result.execution_id },
          include: {
            executor: {
              select: {
                id: true,
                username: true,
                account_name: true,
              }
            }
          }
        });

        if (executionRecord) {
          const executorName = executionRecord.executor.account_name || executionRecord.executor.username;
          
          // 调试日志：检查步骤统计数据
          console.log(`[调试] 用例 ${result.case_id} 执行记录步骤统计:`, {
            total_steps: executionRecord.total_steps,
            completed_steps: executionRecord.completed_steps,
            passed_steps: executionRecord.passed_steps,
            failed_steps: executionRecord.failed_steps,
            blocked_steps: executionRecord.blocked_steps,
          });
          
          // 🔥 修复：优先保留原始 result 中的时间和耗时字段（毫秒级精度）
          // 只从数据库中补充缺失的字段（如 stepResults、screenshots 等）
          const caseResult = {
            ...result,
            // 补充详细执行数据（如果原始数据中没有）
            actualResult: result.actualResult || executionRecord.actual_result || undefined,
            comments: result.comments || executionRecord.comments || undefined,
            screenshots: result.screenshots || executionRecord.screenshots || undefined,
            attachments: result.attachments || executionRecord.attachments || undefined,
            stepResults: result.stepResults || executionRecord.step_results || undefined,
            totalSteps: result.totalSteps ?? executionRecord.total_steps ?? undefined,
            completedSteps: result.completedSteps ?? executionRecord.completed_steps ?? undefined,
            passedSteps: result.passedSteps ?? executionRecord.passed_steps ?? undefined,
            failedSteps: result.failedSteps ?? executionRecord.failed_steps ?? undefined,
            blockedSteps: result.blockedSteps ?? executionRecord.blocked_steps ?? undefined,
            // 执行人信息（优先保留原始值）
            executor_id: result.executor_id ?? executionRecord.executor_id,
            executor_name: result.executor_name || executorName,
            // 🔥 时间和耗时字段：优先保留原始值（毫秒级精度），只在缺失时才使用数据库值
            executed_at: result.executed_at || executionRecord.executed_at.toISOString(),
            started_at: result.started_at || executionRecord.executed_at.toISOString(),
            finished_at: result.finished_at || (executionRecord.duration_ms 
              ? new Date(executionRecord.executed_at.getTime() + executionRecord.duration_ms).toISOString()
              : executionRecord.executed_at.toISOString()),
            duration_ms: result.duration_ms ?? executionRecord.duration_ms ?? undefined,
          };
          
          // 调试日志：检查返回的数据
          console.log(`[调试] 用例 ${result.case_id} 返回的步骤统计:`, {
            totalSteps: caseResult.totalSteps,
            completedSteps: caseResult.completedSteps,
            passedSteps: caseResult.passedSteps,
            failedSteps: caseResult.failedSteps,
            blockedSteps: caseResult.blockedSteps,
          });
          
          return caseResult;
        }
      } catch (error) {
        console.error(`获取用例 ${result.case_id} 的执行记录失败:`, error);
      }

      return result;
    })
  );

  return {
    id: execution.id,
    plan_id: execution.plan_id,
    plan_name: execution.plan_name,
    executor_id: execution.executor_id,
    executor_name: execution.executor_name,
    execution_type: execution.execution_type as any,
    status: execution.status as any,
    progress: execution.progress,
    total_cases: execution.total_cases,
    completed_cases: execution.completed_cases,
    passed_cases: execution.passed_cases,
    failed_cases: execution.failed_cases,
    blocked_cases: execution.blocked_cases,
    skipped_cases: execution.skipped_cases,
    started_at: execution.started_at.toISOString(),
    finished_at: execution.finished_at?.toISOString(),
    duration_ms: execution.duration_ms || undefined,
    execution_results: resultsWithLogs,
    error_message: execution.error_message || undefined,
    metadata: execution.metadata as any,
  };
}

/**
 * 🔥 根据最新执行历史更新测试计划状态
 * 用例执行完成后自动调用此函数同步 test_plans 表
 */
export async function updateTestPlanStatusFromLatestExecution(planId: number): Promise<void> {
  try {
    console.log(`🔄 [testPlanService] 开始更新测试计划状态, planId: ${planId}`);

    // 获取测试计划的最新执行记录
    const latestExecution = await prisma.test_plan_executions.findFirst({
      where: {
        plan_id: planId,
      },
      orderBy: {
        started_at: 'desc',
      },
    });

    if (!latestExecution) {
      console.log(`⚠️ [testPlanService] 计划 ${planId} 没有执行记录，跳过状态更新`);
      return;
    }

    // 获取测试计划的用例统计
    const planCases = await prisma.test_plan_cases.findMany({
      where: { plan_id: planId },
    });

    const totalCases = planCases.length;
    const executedCases = latestExecution.completed_cases || 0;
    const passedCases = latestExecution.passed_cases || 0;
    const failedCases = latestExecution.failed_cases || 0;
    const blockedCases = latestExecution.blocked_cases || 0;

    // 获取当前测试计划信息
    const plan = await prisma.test_plans.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      console.warn(`⚠️ [testPlanService] 计划 ${planId} 不存在`);
      return;
    }

    // 🔥 计算新的状态
    let newStatus = plan.status;
    const now = new Date();
    const endDate = plan.end_date;
    const isExpired = endDate && now > endDate;

    // 状态判断逻辑：
    // 1. 如果已归档，保持归档状态
    // 2. 如果计划时间已过且未完成，标记为 expired
    // 3. 如果所有用例都已执行，标记为 completed
    // 4. 如果有用例已执行但未全部完成，标记为 active
    // 5. 如果没有用例执行，保持原状态

    if (plan.status === 'archived') {
      // 已归档的计划不更新状态
      console.log(`📋 [testPlanService] 计划 ${planId} 已归档，保持状态不变`);
    } else if (totalCases === 0) {
      // 没有用例的计划保持草稿状态
      newStatus = 'draft';
    } else if (latestExecution.status === 'running') {
      // 🔥 执行中状态：立即更新计划状态为 active
      newStatus = 'active';
      console.log(`🚀 [testPlanService] 计划 ${planId} 正在执行中，状态更新为 active`);
    } else if (latestExecution.status === 'cancelled') {
      // 🔥 执行被取消：根据已执行情况判断状态
      if (executedCases === totalCases) {
        // 所有用例都已执行完成（可能是取消后恢复的情况）
        newStatus = 'completed';
        console.log(`✅ [testPlanService] 计划 ${planId} 执行已取消但用例已全部完成，状态更新为 completed`);
      } else if (executedCases > 0) {
        // 部分用例已执行，保持进行中
        newStatus = 'active';
        console.log(`⏸️ [testPlanService] 计划 ${planId} 执行已取消，部分用例已完成，状态更新为 active`);
      } else {
        // 没有用例执行，回到未开始状态
        newStatus = 'not_started';
        console.log(`⏹️ [testPlanService] 计划 ${planId} 执行已取消，无用例完成，状态更新为 not_started`);
      }
    } else if (executedCases === totalCases && latestExecution.status === 'completed') {
      // 所有用例都已执行完成
      newStatus = 'completed';
      console.log(`✅ [testPlanService] 计划 ${planId} 所有用例执行完成，状态更新为 completed`);
    } else if (latestExecution.status === 'failed') {
      // 🔥 执行失败：保持进行中状态（因为可能需要重新执行）
      newStatus = 'active';
      console.log(`❌ [testPlanService] 计划 ${planId} 执行失败，状态更新为 active`);
    } else if (isExpired && executedCases < totalCases) {
      // 计划时间已过但未完成
      newStatus = 'expired';
      console.log(`⏰ [testPlanService] 计划 ${planId} 已过期但未完成，状态更新为 expired`);
    } else if (executedCases > 0) {
      // 有用例已执行，进行中
      newStatus = 'active';
      console.log(`🔄 [testPlanService] 计划 ${planId} 进行中，状态更新为 active`);
    }

    // 🔥 更新测试计划状态和更新时间
    await prisma.test_plans.update({
      where: { id: planId },
      data: {
        status: newStatus,
        updated_at: new Date(),
      },
    });

    console.log(`✅ [testPlanService] 计划 ${planId} 状态更新完成: ${plan.status} -> ${newStatus}`);
    console.log(`📊 [testPlanService] 执行统计: 总用例=${totalCases}, 已执行=${executedCases}, 通过=${passedCases}, 失败=${failedCases}, 阻塞=${blockedCases}`);
  } catch (error) {
    console.error(`❌ [testPlanService] 更新计划 ${planId} 状态失败:`, error);
    // 不抛出错误，避免影响主流程
  }
}

export default {
  getTestPlans,
  getTestPlanDetail,
  createTestPlan,
  updateTestPlan,
  deleteTestPlan,
  addCasesToPlan,
  removeCaseFromPlan,
  startTestPlanExecution,
  updateTestPlanExecution,
  updateTestPlanCaseStatus,
  getTestPlanExecutionDetail,
  deleteTestPlanExecution,
  reExecuteTestPlanExecution,
  updateTestPlanStatusFromLatestExecution,
};

