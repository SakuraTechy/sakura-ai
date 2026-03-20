import { Router, Request, Response } from 'express';
import { AuthService } from '../services/authService.js';
import { createAuthMiddleware } from '../middleware/authMiddleware.js';
import { PrismaClient } from '../../src/generated/prisma/index.js';

export function createAuthRoutes(prisma: PrismaClient) {
  const router = Router();
  const authService = new AuthService(prisma);
  const { authenticate } = createAuthMiddleware(prisma);

  /**
   * POST /api/auth/login
   * 用户登录
   */
  router.post('/login', async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;

      // 验证输入
      if (!username || !password) {
        return res.status(400).json({
          success: false,
          error: '用户名和密码不能为空'
        });
      }

      // 执行登录
      const result = await authService.login({ username, password });

      res.json({
        success: true,
        data: {
          user: result.user,
          token: result.token
        }
      });
    } catch (error: any) {
      console.error('登录失败:', error);
      res.status(401).json({
        success: false,
        error: error.message || '登录失败'
      });
    }
  });

  /**
   * POST /api/auth/logout
   * 用户登出（前端删除token即可，后端无需处理）
   */
  router.post('/logout', (req: Request, res: Response) => {
    res.json({
      success: true,
      message: '登出成功'
    });
  });

  /**
   * GET /api/auth/me
   * 获取当前登录用户信息
   */
  router.get('/me', authenticate, (req: Request, res: Response) => {
    res.json({
      success: true,
      data: req.user
    });
  });

  /**
   * POST /api/auth/change-password
   * 修改密码
   */
  router.post('/change-password', authenticate, async (req: Request, res: Response) => {
    try {
      const { oldPassword, newPassword } = req.body;

      if (!oldPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          error: '旧密码和新密码不能为空'
        });
      }

      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: '未认证'
        });
      }

      await authService.changePassword(req.user.id, oldPassword, newPassword);

      res.json({
        success: true,
        message: '密码修改成功'
      });
    } catch (error: any) {
      console.error('修改密码失败:', error);
      res.status(400).json({
        success: false,
        error: error.message || '修改密码失败'
      });
    }
  });

  /**
   * POST /api/auth/register (可选 - 仅在需要时启用)
   * 注册新用户
   */
  router.post('/register', async (req: Request, res: Response) => {
    try {
      const { email, username, password, accountName, department } = req.body;

      // 验证输入
      if (!email || !username || !password) {
        return res.status(400).json({
          success: false,
          error: '邮箱、用户名和密码不能为空'
        });
      }

      // 创建用户
      const user = await authService.createUser({
        email,
        username,
        password,
        accountName,
        department,
        isSuperAdmin: false // 普通注册用户不能是超级管理员
      });

      res.status(201).json({
        success: true,
        data: user,
        message: '注册成功'
      });
    } catch (error: any) {
      console.error('注册失败:', error);
      res.status(400).json({
        success: false,
        error: error.message || '注册失败'
      });
    }
  });

  /**
   * POST /api/auth/send-reset-code
   * 发送重置密码验证码
   */
  router.post('/send-reset-code', async (req: Request, res: Response) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          error: '邮箱不能为空'
        });
      }

      await authService.sendResetCode(email);

      res.json({
        success: true,
        message: '验证码已发送'
      });
    } catch (error: any) {
      console.error('发送验证码失败:', error);
      res.status(400).json({
        success: false,
        error: error.message || '发送验证码失败'
      });
    }
  });

  /**
   * POST /api/auth/reset-password
   * 重置密码
   */
  router.post('/reset-password', async (req: Request, res: Response) => {
    try {
      const { email, code, newPassword } = req.body;

      if (!email || !code || !newPassword) {
        return res.status(400).json({
          success: false,
          error: '邮箱、验证码和新密码不能为空'
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          error: '密码长度至少6位'
        });
      }

      await authService.resetPassword(email, code, newPassword);

      res.json({
        success: true,
        message: '密码重置成功'
      });
    } catch (error: any) {
      console.error('重置密码失败:', error);
      res.status(400).json({
        success: false,
        error: error.message || '重置密码失败'
      });
    }
  });

  return router;
}
