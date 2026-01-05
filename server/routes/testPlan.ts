// 测试计划路由
import { Router, Request, Response } from 'express';
import testPlanService from '../services/testPlanService';
import type {
  CreateTestPlanInput,
  UpdateTestPlanInput,
  AddCasesToPlanInput,
  StartTestPlanExecutionInput,
  TestPlanListQuery,
} from '../../src/types/testPlan';
import { TestExecutionService } from '../services/testExecution';

// 🔥 修改为函数导出，接受testExecutionService参数
export function createTestPlanRoutes(testExecutionService: TestExecutionService): Router {
  const router = Router();

/**
 * 获取测试计划列表
 * GET /api/test-plans
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const query: TestPlanListQuery = {
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : 20,
      search: req.query.search as string,
      project: req.query.project as string,
      plan_type: req.query.plan_type as any,
      status: req.query.status as any,
      result: req.query.result as any,
      owner_id: req.query.owner_id ? parseInt(req.query.owner_id as string) : undefined,
      start_date: req.query.start_date as string,
      end_date: req.query.end_date as string,
    };

    const result = await testPlanService.getTestPlans(query);
    res.json(result);
  } catch (error: any) {
    console.error('获取测试计划列表失败:', error);
    res.status(500).json({ error: error.message || '获取测试计划列表失败' });
  }
});

/**
 * 获取测试计划详情
 * GET /api/test-plans/:id
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const planId = parseInt(req.params.id);
    const result = await testPlanService.getTestPlanDetail(planId);
    res.json(result);
  } catch (error: any) {
    console.error('获取测试计划详情失败:', error);
    res.status(500).json({ error: error.message || '获取测试计划详情失败' });
  }
});

/**
 * 创建测试计划
 * POST /api/test-plans
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const input: CreateTestPlanInput = req.body;
    const result = await testPlanService.createTestPlan(input);
    res.json(result);
  } catch (error: any) {
    console.error('创建测试计划失败:', error);
    res.status(500).json({ error: error.message || '创建测试计划失败' });
  }
});

/**
 * 更新测试计划
 * PUT /api/test-plans/:id
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const planId = parseInt(req.params.id);
    const input: UpdateTestPlanInput = req.body;
    const result = await testPlanService.updateTestPlan(planId, input);
    res.json(result);
  } catch (error: any) {
    console.error('更新测试计划失败:', error);
    res.status(500).json({ error: error.message || '更新测试计划失败' });
  }
});

/**
 * 删除测试计划
 * DELETE /api/test-plans/:id
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const planId = parseInt(req.params.id);
    await testPlanService.deleteTestPlan(planId);
    res.json({ success: true });
  } catch (error: any) {
    console.error('删除测试计划失败:', error);
    res.status(500).json({ error: error.message || '删除测试计划失败' });
  }
});

/**
 * 添加用例到测试计划
 * POST /api/test-plans/:id/cases
 */
router.post('/:id/cases', async (req: Request, res: Response) => {
  try {
    const planId = parseInt(req.params.id);
    const input: AddCasesToPlanInput = {
      plan_id: planId,
      cases: req.body.cases,
    };
    const result = await testPlanService.addCasesToPlan(input);
    res.json(result);
  } catch (error: any) {
    console.error('添加用例到测试计划失败:', error);
    res.status(500).json({ error: error.message || '添加用例到测试计划失败' });
  }
});

/**
 * 从测试计划中移除用例
 * DELETE /api/test-plans/:id/cases/:caseId
 */
router.delete('/:id/cases/:caseId', async (req: Request, res: Response) => {
  try {
    const planId = parseInt(req.params.id);
    const caseId = parseInt(req.params.caseId);
    const caseType = req.query.caseType as string;

    if (!caseType) {
      return res.status(400).json({ error: '缺少caseType参数' });
    }

    await testPlanService.removeCaseFromPlan(planId, caseId, caseType);
    res.json({ success: true });
  } catch (error: any) {
    console.error('从测试计划中移除用例失败:', error);
    res.status(500).json({ error: error.message || '从测试计划中移除用例失败' });
  }
});

/**
 * 开始执行测试计划
 * POST /api/test-plans/:id/execute
 */
router.post('/:id/execute', async (req: Request, res: Response) => {
  try {
    const planId = parseInt(req.params.id);
    
    // 🔥 修复：正确接收 autoExecute 和 executionConfig 参数
    const autoExecute = req.body.autoExecute !== undefined ? req.body.autoExecute : true; // 默认 true
    const executionConfig = req.body.executionConfig || undefined;
    
    console.log(`📋 [testPlan路由] 接收执行请求:`, {
      planId,
      executor_id: req.body.executor_id,
      execution_type: req.body.execution_type,
      case_ids: req.body.case_ids,
      autoExecute,
      executionConfig
    });
    
    const input: StartTestPlanExecutionInput = {
      plan_id: planId,
      executor_id: req.body.executor_id,
      execution_type: req.body.execution_type,
      case_ids: req.body.case_ids,
      autoExecute, // 🔥 传递 autoExecute 参数
      executionConfig, // 🔥 传递 executionConfig 参数
    };
    
    // 🔥 传递testExecutionService实例
    const result = await testPlanService.startTestPlanExecution(input, testExecutionService);
    res.json(result);
  } catch (error: any) {
    console.error('开始执行测试计划失败:', error);
    res.json({ error: error.message || '开始执行测试计划失败' });
  }
});

/**
 * 更新测试计划执行状态
 * PUT /api/test-plans/executions/:executionId
 */
router.put('/executions/:executionId', async (req: Request, res: Response) => {
  try {
    const executionId = req.params.executionId;
    const result = await testPlanService.updateTestPlanExecution(executionId, req.body);
    res.json(result);
  } catch (error: any) {
    console.error('更新测试计划执行状态失败:', error);
    res.status(500).json({ error: error.message || '更新测试计划执行状态失败' });
  }
});

/**
 * 更新测试计划用例执行状态
 * PUT /api/test-plans/:id/cases/:caseId/status
 */
router.put('/:id/cases/:caseId/status', async (req: Request, res: Response) => {
  try {
    const planId = parseInt(req.params.id);
    const caseId = parseInt(req.params.caseId);
    const { case_type, result } = req.body;

    if (!case_type || !result) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    await testPlanService.updateTestPlanCaseStatus(planId, caseId, case_type, result);
    res.json({ success: true });
  } catch (error: any) {
    console.error('更新测试计划用例执行状态失败:', error);
    res.status(500).json({ error: error.message || '更新测试计划用例执行状态失败' });
  }
});

/**
 * 获取测试计划的执行历史
 * GET /api/test-plans/:id/executions
 */
router.get('/:id/executions', async (req: Request, res: Response) => {
  try {
    const planId = parseInt(req.params.id);
    const detail = await testPlanService.getTestPlanDetail(planId);
    res.json(detail.executions);
  } catch (error: any) {
    console.error('获取测试计划执行历史失败:', error);
    res.status(500).json({ error: error.message || '获取测试计划执行历史失败' });
  }
});

/**
 * 获取测试计划执行记录的详细信息
 * GET /api/test-plans/executions/:executionId/detail
 */
router.get('/executions/:executionId/detail', async (req: Request, res: Response) => {
  try {
    const executionId = req.params.executionId;
    const result = await testPlanService.getTestPlanExecutionDetail(executionId);
    res.json(result);
  } catch (error: any) {
    console.error('获取测试计划执行详情失败:', error);
    res.status(500).json({ error: error.message || '获取测试计划执行详情失败' });
  }
});

/**
 * 删除测试计划执行记录
 * DELETE /api/test-plans/executions/:executionId
 */
router.delete('/executions/:executionId', async (req: Request, res: Response) => {
  try {
    const executionId = req.params.executionId;
    await testPlanService.deleteTestPlanExecution(executionId);
    res.json({ success: true });
  } catch (error: any) {
    console.error('删除测试计划执行记录失败:', error);
    res.status(500).json({ error: error.message || '删除测试计划执行记录失败' });
  }
});

/**
 * 🔥 重新执行测试计划执行记录（UI自动化）
 * POST /api/test-plans/executions/:executionId/reexecute
 */
router.post('/executions/:executionId/reexecute', async (req: Request, res: Response) => {
  try {
    const executionId = req.params.executionId;
    const executionConfig = req.body.executionConfig || {};
    
    await testPlanService.reExecuteTestPlanExecution(executionId, executionConfig, testExecutionService);
    res.json({ success: true });
  } catch (error: any) {
    console.error('重新执行测试计划执行记录失败:', error);
    res.status(500).json({ error: error.message || '重新执行测试计划执行记录失败' });
  }
});

  return router;
}

export default createTestPlanRoutes;

