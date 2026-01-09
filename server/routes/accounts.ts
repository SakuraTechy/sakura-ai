import express, { Request, Response } from 'express';
import * as accountService from '../services/accountService.js';

const router = express.Router();

/**
 * GET /api/v1/accounts
 * 获取账号配置列表
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const accounts = await accountService.getAccounts();
    res.json(accounts);
  } catch (error) {
    console.error('获取账号配置列表失败:', error);
    res.status(500).json({
      error: '获取账号配置列表失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * GET /api/v1/accounts/:id
 * 根据ID获取账号配置
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const account = await accountService.getAccountById(id);

    if (!account) {
      return res.status(404).json({ error: '账号配置不存在' });
    }

    res.json(account);
  } catch (error) {
    console.error('获取账号配置详情失败:', error);
    res.status(500).json({
      error: '获取账号配置详情失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * POST /api/v1/accounts
 * 创建账号配置
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { project_id, account_type, account_name, account_password, account_description, status } = req.body;

    if (!project_id) {
      return res.status(400).json({ error: '所属项目不能为空' });
    }

    if (!account_type || !account_name || !account_password) {
      return res.status(400).json({ error: '账号类型、账号名称和账号密码不能为空' });
    }

    if (!['admin', 'security', 'auditor'].includes(account_type)) {
      return res.status(400).json({ error: '账号类型无效' });
    }

    const account = await accountService.createAccount({
      project_id: parseInt(project_id),
      account_type,
      account_name: account_name.trim(),
      account_password,
      account_description: account_description?.trim(),
      status
    });

    res.status(201).json(account);
  } catch (error) {
    console.error('创建账号配置失败:', error);

    if (error instanceof Error && error.message === '账号名称已存在') {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({
      error: '创建账号配置失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * PUT /api/v1/accounts/:id
 * 更新账号配置
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { account_type, account_name, account_password, account_description, status } = req.body;

    const updateData: accountService.UpdateAccountInput = {};
    if (account_type !== undefined) {
      if (!['admin', 'security', 'auditor'].includes(account_type)) {
        return res.status(400).json({ error: '账号类型无效' });
      }
      updateData.account_type = account_type;
    }
    if (account_name !== undefined) updateData.account_name = account_name.trim();
    if (account_password !== undefined) updateData.account_password = account_password;
    if (account_description !== undefined) updateData.account_description = account_description?.trim();
    if (status !== undefined) updateData.status = status;

    const account = await accountService.updateAccount(id, updateData);
    res.json(account);
  } catch (error) {
    console.error('更新账号配置失败:', error);

    if (error instanceof Error) {
      if (error.message === '账号配置不存在') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message === '账号名称已存在') {
        return res.status(400).json({ error: error.message });
      }
    }

    res.status(500).json({
      error: '更新账号配置失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * DELETE /api/v1/accounts/:id
 * 删除账号配置
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    await accountService.deleteAccount(id);
    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('删除账号配置失败:', error);

    if (error instanceof Error && error.message === '账号配置不存在') {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({
      error: '删除账号配置失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * POST /api/v1/accounts/:id/set-default
 * 设置默认账号
 */
router.post('/:id/set-default', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { project_id } = req.body;

    if (!project_id) {
      return res.status(400).json({ error: '项目ID不能为空' });
    }

    const account = await accountService.setDefaultAccount(project_id, id);
    res.json(account);
  } catch (error) {
    console.error('设置默认账号失败:', error);

    if (error instanceof Error && error.message === '账号配置不存在') {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({
      error: '设置默认账号失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

export default router;

