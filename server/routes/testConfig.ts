import express, { Request, Response } from 'express';
import { TestConfigService } from '../services/testConfigService.js';

const router = express.Router();
const testConfigService = new TestConfigService();

/**
 * 获取项目默认配置
 * GET /api/v1/test-config/projects/:projectId/default-config
 */
router.get('/projects/:projectId/default-config', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId);
    
    if (isNaN(projectId)) {
      return res.status(400).json({ error: '无效的项目ID' });
    }

    const config = await testConfigService.getProjectDefaultConfig(projectId);
    res.json(config);
  } catch (error: any) {
    console.error('获取项目默认配置失败:', error);
    res.status(500).json({ error: error.message || '获取配置失败' });
  }
});

/**
 * 获取测试用例配置
 * GET /api/v1/test-config/test-cases/:testCaseId/config
 */
router.get('/test-cases/:testCaseId/config', async (req: Request, res: Response) => {
  try {
    const testCaseId = parseInt(req.params.testCaseId);
    
    if (isNaN(testCaseId)) {
      return res.status(400).json({ error: '无效的测试用例ID' });
    }

    const config = await testConfigService.getTestCaseConfig(testCaseId);
    res.json(config);
  } catch (error: any) {
    console.error('获取测试用例配置失败:', error);
    res.status(500).json({ error: error.message || '获取配置失败' });
  }
});

/**
 * 验证项目配置
 * GET /api/v1/test-config/projects/:projectId/validate-config
 */
router.get('/projects/:projectId/validate-config', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId);
    
    if (isNaN(projectId)) {
      return res.status(400).json({ error: '无效的项目ID' });
    }

    const validation = await testConfigService.validateProjectConfig(projectId);
    res.json(validation);
  } catch (error: any) {
    console.error('验证项目配置失败:', error);
    res.status(500).json({ error: error.message || '验证配置失败' });
  }
});

/**
 * 获取项目的所有账号配置
 * GET /api/v1/test-config/projects/:projectId/accounts
 */
router.get('/projects/:projectId/accounts', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId);
    
    if (isNaN(projectId)) {
      return res.status(400).json({ error: '无效的项目ID' });
    }

    const accounts = await testConfigService.getProjectAccounts(projectId);
    res.json(accounts);
  } catch (error: any) {
    console.error('获取项目账号配置失败:', error);
    res.status(500).json({ error: error.message || '获取账号配置失败' });
  }
});

/**
 * 获取项目的所有服务器配置
 * GET /api/v1/test-config/projects/:projectId/servers
 */
router.get('/projects/:projectId/servers', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId);
    
    if (isNaN(projectId)) {
      return res.status(400).json({ error: '无效的项目ID' });
    }

    const servers = await testConfigService.getProjectServers(projectId);
    res.json(servers);
  } catch (error: any) {
    console.error('获取项目服务器配置失败:', error);
    res.status(500).json({ error: error.message || '获取服务器配置失败' });
  }
});

/**
 * 获取项目的所有数据库配置
 * GET /api/v1/test-config/projects/:projectId/databases
 */
router.get('/projects/:projectId/databases', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId);
    
    if (isNaN(projectId)) {
      return res.status(400).json({ error: '无效的项目ID' });
    }

    const databases = await testConfigService.getProjectDatabases(projectId);
    res.json(databases);
  } catch (error: any) {
    console.error('获取项目数据库配置失败:', error);
    res.status(500).json({ error: error.message || '获取数据库配置失败' });
  }
});

/**
 * 批量验证多个项目的配置
 * POST /api/v1/test-config/projects/batch-validate
 */
router.post('/projects/batch-validate', async (req: Request, res: Response) => {
  try {
    const { projectIds } = req.body;
    
    if (!Array.isArray(projectIds) || projectIds.length === 0) {
      return res.status(400).json({ error: '请提供有效的项目ID列表' });
    }

    const results = await testConfigService.batchValidateProjects(projectIds);
    res.json(results);
  } catch (error: any) {
    console.error('批量验证项目配置失败:', error);
    res.status(500).json({ error: error.message || '批量验证失败' });
  }
});

export default router;
