import { Router, Request, Response } from 'express';
import { PrismaClient } from '../../src/generated/prisma/index.js';
import { createAuthMiddleware } from '../middleware/authMiddleware.js';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export function createUserRoutes(prisma: PrismaClient) {
  const router = Router();
  const { authenticate, requireAdmin } = createAuthMiddleware(prisma);

  // 所有用户管理路由都需要管理员权限
  router.use(authenticate);
  router.use(requireAdmin);

  /**
   * GET /api/users
   * 获取所有用户列表
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const users = await prisma.users.findMany({
        select: {
          id: true,
          email: true,
          username: true,
          account_name: true,
          project: true,
          department: true,
          is_super_admin: true,
          created_at: true,
        },
        orderBy: {
          created_at: 'desc',
        },
      });

      // 转换字段名为驼峰命名
      const formattedUsers = users.map(user => ({
        id: user.id,
        email: user.email,
        username: user.username,
        accountName: user.account_name,
        project: user.project,
        department: user.department,
        isSuperAdmin: user.is_super_admin,
        createdAt: user.created_at,
      }));

      res.json(formattedUsers);
    } catch (error: any) {
      console.error('获取用户列表失败:', error);
      res.status(500).json({
        success: false,
        error: '获取用户列表失败',
      });
    }
  });

  /**
   * GET /api/users/:id
   * 获取单个用户信息
   */
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);

      if (isNaN(userId)) {
        return res.status(400).json({
          success: false,
          error: '无效的用户ID',
        });
      }

      const user = await prisma.users.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          username: true,
          account_name: true,
          project: true,
          department: true,
          is_super_admin: true,
          created_at: true,
        },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: '用户不存在',
        });
      }

      res.json({
        id: user.id,
        email: user.email,
        username: user.username,
        accountName: user.account_name,
        project: user.project,
        department: user.department,
        isSuperAdmin: user.is_super_admin,
        createdAt: user.created_at,
      });
    } catch (error: any) {
      console.error('获取用户信息失败:', error);
      res.status(500).json({
        success: false,
        error: '获取用户信息失败',
      });
    }
  });

  /**
   * POST /api/users
   * 创建新用户
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { email, username, password, accountName, project, department, isSuperAdmin } = req.body;

      // 验证必填字段
      if (!email || !username || !password) {
        return res.status(400).json({
          success: false,
          error: '邮箱、用户名和密码不能为空',
        });
      }

      // 验证密码长度
      if (password.length < 6) {
        return res.status(400).json({
          success: false,
          error: '密码至少需要6个字符',
        });
      }

      // 检查邮箱是否已存在
      const existingEmail = await prisma.users.findUnique({
        where: { email },
      });

      if (existingEmail) {
        return res.status(400).json({
          success: false,
          error: '该邮箱已被使用',
        });
      }

      // 检查用户名是否已存在
      const existingUsername = await prisma.users.findUnique({
        where: { username },
      });

      if (existingUsername) {
        return res.status(400).json({
          success: false,
          error: '该用户名已被使用',
        });
      }

      // 加密密码
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

      // 创建用户
      const user = await prisma.users.create({
        data: {
          email,
          username,
          password_hash: passwordHash,
          account_name: accountName,
          project: project,
          department: department,
          is_super_admin: isSuperAdmin || false,
        },
        select: {
          id: true,
          email: true,
          username: true,
          account_name: true,
          project: true,
          department: true,
          is_super_admin: true,
          created_at: true,
        },
      });

      res.status(201).json({
        id: user.id,
        email: user.email,
        username: user.username,
        accountName: user.account_name,
        project: user.project,
        department: user.department,
        isSuperAdmin: user.is_super_admin,
        createdAt: user.created_at,
      });
    } catch (error: any) {
      console.error('创建用户失败:', error);
      res.status(500).json({
        success: false,
        error: '创建用户失败',
      });
    }
  });

  /**
   * PUT /api/users/:id
   * 更新用户信息
   */
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);

      if (isNaN(userId)) {
        return res.status(400).json({
          success: false,
          error: '无效的用户ID',
        });
      }

      const { email, username, accountName, project, department, isSuperAdmin } = req.body;

      // 验证必填字段
      if (!email || !username) {
        return res.status(400).json({
          success: false,
          error: '邮箱和用户名不能为空',
        });
      }

      // 检查用户是否存在
      const existingUser = await prisma.users.findUnique({
        where: { id: userId },
      });

      if (!existingUser) {
        return res.status(404).json({
          success: false,
          error: '用户不存在',
        });
      }

      // 检查邮箱是否被其他用户使用
      if (email !== existingUser.email) {
        const emailExists = await prisma.users.findUnique({
          where: { email },
        });

        if (emailExists) {
          return res.status(400).json({
            success: false,
            error: '该邮箱已被使用',
          });
        }
      }

      // 检查用户名是否被其他用户使用
      if (username !== existingUser.username) {
        const usernameExists = await prisma.users.findUnique({
          where: { username },
        });

        if (usernameExists) {
          return res.status(400).json({
            success: false,
            error: '该用户名已被使用',
          });
        }
      }

      // 更新用户
      const updatedUser = await prisma.users.update({
        where: { id: userId },
        data: {
          email,
          username,
          account_name: accountName,
          project: project,
          department: department,
          is_super_admin: isSuperAdmin !== undefined ? isSuperAdmin : existingUser.is_super_admin,
        },
        select: {
          id: true,
          email: true,
          username: true,
          account_name: true,
          project: true,
          department: true,
          is_super_admin: true,
          created_at: true,
        },
      });

      res.json({
        id: updatedUser.id,
        email: updatedUser.email,
        username: updatedUser.username,
        accountName: updatedUser.account_name,
        project: updatedUser.project,
        department: updatedUser.department,
        isSuperAdmin: updatedUser.is_super_admin,
        createdAt: updatedUser.created_at,
      });
    } catch (error: any) {
      console.error('更新用户失败:', error);
      res.status(500).json({
        success: false,
        error: '更新用户失败',
      });
    }
  });

  /**
   * PUT /api/users/:id/password
   * 修改用户密码
   */
  router.put('/:id/password', async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);

      if (isNaN(userId)) {
        return res.status(400).json({
          success: false,
          error: '无效的用户ID',
        });
      }

      const { newPassword } = req.body;

      // 验证新密码
      if (!newPassword || typeof newPassword !== 'string') {
        return res.status(400).json({
          success: false,
          error: '新密码不能为空',
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          error: '密码至少需要6个字符',
        });
      }

      // 检查用户是否存在
      const user = await prisma.users.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: '用户不存在',
        });
      }

      // 加密新密码
      const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

      // 更新密码
      await prisma.users.update({
        where: { id: userId },
        data: {
          password_hash: passwordHash,
        },
      });

      res.json({
        success: true,
        message: '密码修改成功',
      });
    } catch (error: any) {
      console.error('修改密码失败:', error);
      res.status(500).json({
        success: false,
        error: '修改密码失败',
      });
    }
  });

  /**
   * DELETE /api/users/:id
   * 删除用户
   */
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);

      if (isNaN(userId)) {
        return res.status(400).json({
          success: false,
          error: '无效的用户ID',
        });
      }

      // 防止删除自己
      if (req.user && req.user.id === userId) {
        return res.status(400).json({
          success: false,
          error: '不能删除当前登录的用户',
        });
      }

      // 检查用户是否存在
      const user = await prisma.users.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: '用户不存在',
        });
      }

      // 删除用户（关联数据会根据schema设置自动处理）
      await prisma.users.delete({
        where: { id: userId },
      });

      res.json({
        success: true,
        message: '用户删除成功',
      });
    } catch (error: any) {
      console.error('删除用户失败:', error);
      res.status(500).json({
        success: false,
        error: '删除用户失败',
      });
    }
  });

  return router;
}
