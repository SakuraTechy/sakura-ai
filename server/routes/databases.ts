import express, { Request, Response } from 'express';
import * as databaseService from '../services/databaseService.js';

const router = express.Router();

/**
 * GET /api/v1/databases
 * 获取数据库配置列表
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const databases = await databaseService.getDatabases();
    res.json(databases);
  } catch (error) {
    console.error('获取数据库配置列表失败:', error);
    res.status(500).json({
      error: '获取数据库配置列表失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * GET /api/v1/databases/:id
 * 根据ID获取数据库配置
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const database = await databaseService.getDatabaseById(id);

    if (!database) {
      return res.status(404).json({ error: '数据库配置不存在' });
    }

    res.json(database);
  } catch (error) {
    console.error('获取数据库配置详情失败:', error);
    res.status(500).json({
      error: '获取数据库配置详情失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * POST /api/v1/databases
 * 创建数据库配置
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      project_id,
      database_type,
      database_version,
      database_driver,
      database_name,
      database_port,
      database_schema,
      username,
      password,
      connection_string,
      description,
      status,
      parameters
    } = req.body;

    if (!project_id) {
      return res.status(400).json({ error: '所属项目不能为空' });
    }

    if (!database_type || !database_name || !database_port || !database_schema || !username || !password || !connection_string) {
      return res.status(400).json({
        error: '数据库类型、数据库名称、数据库端口、数据库/模式、用户名、密码和连接串不能为空'
      });
    }

    const database = await databaseService.createDatabase({
      project_id: parseInt(project_id),
      database_type: database_type.trim(),
      database_version: database_version?.trim() || '',
      database_driver: database_driver?.trim() || '',
      database_name: database_name.trim(),
      database_port: parseInt(database_port),
      database_schema: database_schema.trim(),
      username: username.trim(),
      password,
      connection_string: connection_string.trim(),
      description: description?.trim(),
      status,
      parameters
    });

    res.status(201).json(database);
  } catch (error) {
    console.error('创建数据库配置失败:', error);
    res.status(500).json({
      error: '创建数据库配置失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * PUT /api/v1/databases/:id
 * 更新数据库配置
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const {
      database_type,
      database_version,
      database_driver,
      database_name,
      database_port,
      database_schema,
      username,
      password,
      connection_string,
      description,
      status,
      parameters
    } = req.body;

    const updateData: databaseService.UpdateDatabaseInput = {};
    if (database_type !== undefined) updateData.database_type = database_type.trim();
    if (database_version !== undefined) updateData.database_version = database_version.trim();
    if (database_driver !== undefined) updateData.database_driver = database_driver.trim();
    if (database_name !== undefined) updateData.database_name = database_name.trim();
    if (database_port !== undefined) updateData.database_port = parseInt(database_port);
    if (database_schema !== undefined) updateData.database_schema = database_schema.trim();
    if (username !== undefined) updateData.username = username.trim();
    if (password !== undefined) updateData.password = password;
    if (connection_string !== undefined) updateData.connection_string = connection_string.trim();
    if (description !== undefined) updateData.description = description?.trim();
    if (status !== undefined) updateData.status = status;
    if (parameters !== undefined) updateData.parameters = parameters;

    const database = await databaseService.updateDatabase(id, updateData);
    res.json(database);
  } catch (error) {
    console.error('更新数据库配置失败:', error);

    if (error instanceof Error && error.message === '数据库配置不存在') {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({
      error: '更新数据库配置失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * DELETE /api/v1/databases/:id
 * 删除数据库配置
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    await databaseService.deleteDatabase(id);
    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('删除数据库配置失败:', error);

    if (error instanceof Error && error.message === '数据库配置不存在') {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({
      error: '删除数据库配置失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * POST /api/v1/databases/:id/test
 * 测试数据库连接
 */
router.post('/:id/test', async (req: Request, res: Response) => {
  try {
    const idParam = req.params.id;
    const id = idParam === 'test' ? null : parseInt(idParam);
    const { config } = req.body || {};
    const result = await databaseService.testDatabaseConnection(id, config);
    res.json(result);
  } catch (error) {
    console.error('测试数据库连接失败:', error);

    if (error instanceof Error && (error.message === '数据库配置不存在' || error.message === '数据库ID不能为空')) {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({
      error: '测试数据库连接失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * POST /api/v1/databases/:id/set-default
 * 设置默认数据库
 */
router.post('/:id/set-default', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { project_id } = req.body;

    if (!project_id) {
      return res.status(400).json({ error: '项目ID不能为空' });
    }

    const database = await databaseService.setDefaultDatabase(project_id, id);
    res.json(database);
  } catch (error) {
    console.error('设置默认数据库失败:', error);

    if (error instanceof Error && error.message === '数据库配置不存在') {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({
      error: '设置默认数据库失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

export default router;

