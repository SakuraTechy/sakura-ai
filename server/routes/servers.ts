import express, { Request, Response } from 'express';
import * as serverService from '../services/serverService.js';

const router = express.Router();

/**
 * GET /api/v1/servers
 * 获取服务器配置列表
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const servers = await serverService.getServers();
    res.json(servers);
  } catch (error) {
    console.error('获取服务器配置列表失败:', error);
    res.status(500).json({
      error: '获取服务器配置列表失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * GET /api/v1/servers/:id
 * 根据ID获取服务器配置
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const server = await serverService.getServerById(id);

    if (!server) {
      return res.status(404).json({ error: '服务器配置不存在' });
    }

    res.json(server);
  } catch (error) {
    console.error('获取服务器配置详情失败:', error);
    res.status(500).json({
      error: '获取服务器配置详情失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * POST /api/v1/servers
 * 创建服务器配置
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { project_id, server_type, server_version, host_name, host_port, username, password, description, status, parameters } = req.body;

    if (!project_id) {
      return res.status(400).json({ error: '所属项目不能为空' });
    }

    if (!server_type || !host_name || !host_port || !username || !password) {
      return res.status(400).json({ error: '服务器类型、主机名称、主机端口、用户名和密码不能为空' });
    }

    const server = await serverService.createServer({
      project_id: parseInt(project_id),
      server_type: server_type.trim(),
      server_version: server_version?.trim() || '',
      host_name: host_name.trim(),
      host_port: parseInt(host_port),
      username: username.trim(),
      password,
      description: description?.trim(),
      status,
      parameters
    });

    res.status(201).json(server);
  } catch (error) {
    console.error('创建服务器配置失败:', error);
    res.status(500).json({
      error: '创建服务器配置失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * PUT /api/v1/servers/:id
 * 更新服务器配置
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { server_type, server_version, host_name, host_port, username, password, description, status, parameters } = req.body;

    const updateData: serverService.UpdateServerInput = {};
    if (server_type !== undefined) updateData.server_type = server_type.trim();
    if (server_version !== undefined) updateData.server_version = server_version.trim();
    if (host_name !== undefined) updateData.host_name = host_name.trim();
    if (host_port !== undefined) updateData.host_port = parseInt(host_port);
    if (username !== undefined) updateData.username = username.trim();
    if (password !== undefined) updateData.password = password;
    if (description !== undefined) updateData.description = description?.trim();
    if (status !== undefined) updateData.status = status;
    if (parameters !== undefined) updateData.parameters = parameters;

    const server = await serverService.updateServer(id, updateData);
    res.json(server);
  } catch (error) {
    console.error('更新服务器配置失败:', error);

    if (error instanceof Error && error.message === '服务器配置不存在') {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({
      error: '更新服务器配置失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * DELETE /api/v1/servers/:id
 * 删除服务器配置
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    await serverService.deleteServer(id);
    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('删除服务器配置失败:', error);

    if (error instanceof Error && error.message === '服务器配置不存在') {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({
      error: '删除服务器配置失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * POST /api/v1/servers/:id/test
 * 测试服务器连接
 */
router.post('/:id/test', async (req: Request, res: Response) => {
  try {
    const idParam = req.params.id;
    const id = idParam === 'test' ? null : parseInt(idParam);
    const { config } = req.body || {};
    const result = await serverService.testServerConnection(id, config);
    res.json(result);
  } catch (error) {
    console.error('测试服务器连接失败:', error);

    if (error instanceof Error && (error.message === '服务器配置不存在' || error.message === '服务器ID不能为空')) {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({
      error: '测试服务器连接失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * POST /api/v1/servers/:id/set-default
 * 设置默认服务器
 */
router.post('/:id/set-default', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { project_id } = req.body;

    if (!project_id) {
      return res.status(400).json({ error: '项目ID不能为空' });
    }

    const server = await serverService.setDefaultServer(project_id, id);
    res.json(server);
  } catch (error) {
    console.error('设置默认服务器失败:', error);

    if (error instanceof Error && error.message === '服务器配置不存在') {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({
      error: '设置默认服务器失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

export default router;

