import { Router } from 'express';
import { PrismaClient } from '../../src/generated/prisma/index.js';
import { AIBulkUpdateService } from '../services/aiBulkUpdateService.js';
import { VersionService } from '../services/versionService.js';
import { EmbeddingService } from '../services/embeddingService.js';
import { AITestParser } from '../services/aiParser.js';
import { WebSocketManager } from '../services/websocket.js';
import { authenticateUser, requireRoles, PermissionService, AuditActions } from '../middleware/auth.js';
import { requireBulkUpdateFeature } from '../middleware/featureFlag.js';
import Joi from 'joi';

// 🔥 新增：UTF-8编码验证和修复函数
function validateAndFixUTF8(text: string): string | null {
  try {
    if (!text || typeof text !== 'string') {
      return null;
    }
    
    // 移除无效的UTF-8字符和控制字符
    let cleaned = text
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // 移除控制字符
      .replace(/[\uFFFD\uFFF0-\uFFFF]/g, '') // 移除替换字符和其他无效Unicode
      .replace(/[^\u0000-\u007F\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uff00-\uffef\u2000-\u206f\u3000-\u303f]/g, ''); // 只保留ASCII、中文、日文、标点等
    
    // 修复乱码模式
    cleaned = cleaned
      .replace(/\uFFFD+/g, '') // 移除连续的替换字符
      .replace(/\u{FFFD}+/gu, '') // 移除常见乱码模式
      .replace(/Â·/g, '·') // 修复常见中文标点乱码
      .replace(/â€/g, '"') // 修复引号乱码
      .replace(/â€™/g, "'") // 修复单引号乱码
      .trim();
    
    // 检查清理后的文本是否有意义
    if (cleaned.length < 2) {
      return null; // 太短无意义
    }
    
    // 验证UTF-8编码完整性
    const buffer = Buffer.from(cleaned, 'utf8');
    const reconstructed = buffer.toString('utf8');
    
    if (reconstructed !== cleaned) {
      console.warn('⚠️ [UTF8-Fix] 文本编码不完整，使用重构版本');
      return reconstructed.length >= 2 ? reconstructed : null;
    }
    
    console.log(`✅ [UTF8-Fix] 文本验证通过: "${cleaned.substring(0, 50)}${cleaned.length > 50 ? '...' : ''}"`);
    return cleaned;
    
  } catch (error) {
    console.error('❌ [UTF8-Fix] 编码验证失败:', error);
    return null;
  }
}

// 请求验证模式
const bulkUpdateRequestSchema = Joi.object({
  system: Joi.string().required().trim().allow('').max(100), // 允许空字符串表示"所有系统"
  module: Joi.string().required().trim().allow('').max(100), // 允许空字符串表示"所有模块"
  tagFilter: Joi.array().items(Joi.string().trim()).optional(),
  priorityFilter: Joi.string().valid('high', 'medium', 'low', '').optional(),
  changeBrief: Joi.string().required().trim().min(10).max(2000),
  userId: Joi.number().integer().optional() // 允许但会被后端忽略
});

const applyProposalsSchema = Joi.object({
  sessionId: Joi.number().integer().positive().required(),
  selectedProposals: Joi.array().items(Joi.number().integer().positive()).min(1).required()
});

const rollbackSchema = Joi.object({
  toVersion: Joi.number().integer().positive().required()
});

/**
 * 创建AI批量更新路由
 */
export function createAiBulkUpdateRoutes(
  prisma: PrismaClient,
  aiParser: AITestParser,
  wsManager: WebSocketManager
): Router {
  const router = Router();

  // 初始化服务实例
  const embeddingService = new EmbeddingService(prisma);
  const versionService = new VersionService(prisma);
  const aiBulkService = new AIBulkUpdateService(
    prisma,
    aiParser,
    embeddingService,
    versionService,
    wsManager
  );

  // 应用中间件：身份验证 + 功能开关 (移除角色限制，所有用户可用)
  router.use(authenticateUser);
  router.use(requireBulkUpdateFeature);

  // 错误处理函数
  const handleError = (res: any, error: any, defaultMessage: string) => {
    console.error('API错误:', error);
    const statusCode = error.statusCode || 500;
    const message = error.message || defaultMessage;
    
    res.status(statusCode).json({
      ok: false,
      error: message,
      code: error.code || 'INTERNAL_ERROR'
    });
  };

  /**
   * POST /api/v1/ai-bulk/dry-run
   * 创建批量编辑会话，生成修改提案
   */
  router.post('/dry-run', async (req, res) => {
    try {
      console.log(`🚀 [API] 收到批量更新请求 from 用户 ${req.user!.id}`);
      
      // 请求参数验证
      const { error, value } = bulkUpdateRequestSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          ok: false,
          error: '请求参数验证失败: ' + error.details.map(d => d.message).join(', '),
          code: 'VALIDATION_ERROR'
        });
      }

      // 排除请求体中的userId，使用认证状态的用户ID
      const { userId: requestUserId, ...validatedData } = value;
      
      // 🔥 新增：UTF-8编码验证和修复
      const cleanChangeBrief = validateAndFixUTF8(validatedData.changeBrief);
      if (!cleanChangeBrief) {
        return res.status(400).json({
          ok: false,
          error: '变更描述包含无效字符，请使用标准中文或英文字符',
          code: 'ENCODING_ERROR'
        });
      }
      
      const params = {
        ...validatedData,
        changeBrief: cleanChangeBrief, // 使用清理后的文本
        userId: req.user!.id
      };

      // 记录操作开始
      await PermissionService.logBulkUpdateAction(
        req.user!.id,
        AuditActions.BULK_SESSION_CREATED,
        'bulk_edit_session',
        0,
        {
          request_params: params,
          user_agent: req.get('User-Agent'),
          ip: req.ip
        }
      );

      // 调用服务层
      const result = await aiBulkService.createBulkEditSession(params);

      // 记录操作完成
      await PermissionService.logBulkUpdateAction(
        req.user!.id,
        AuditActions.BULK_SESSION_CREATED,
        'bulk_edit_session',
        result.sessionId,
        {
          result_summary: {
            session_id: result.sessionId,
            status: result.status,
            proposals_count: result.proposals.length,
            relevant_cases: result.relevantCases
          }
        }
      );

      console.log(`✅ [API] 批量更新请求处理完成，会话ID: ${result.sessionId}`);

      res.json({ 
        ok: true, 
        data: result 
      });

    } catch (error: any) {
      await PermissionService.logBulkUpdateAction(
        req.user!.id,
        `${AuditActions.BULK_SESSION_CREATED}_failed`,
        'bulk_edit_session',
        0,
        { error: error.message }
      );

      handleError(res, error, '创建批量编辑会话失败');
    }
  });

  /**
   * POST /api/v1/ai-bulk/apply  
   * 应用选中的修改提案
   */
  router.post('/apply', async (req, res) => {
    try {
      console.log(`🔄 [API] 收到应用提案请求 from 用户 ${req.user!.id}`);

      // 请求参数验证
      const { error, value } = applyProposalsSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          ok: false,
          error: '请求参数验证失败: ' + error.details.map(d => d.message).join(', '),
          code: 'VALIDATION_ERROR'
        });
      }

      const { sessionId, selectedProposals } = value;

      // 验证会话所有权（用户只能操作自己创建的会话）
      const session = await prisma.bulk_edit_sessions.findFirst({
        where: { 
          id: sessionId, 
          created_by: req.user!.id 
        }
      });

      if (!session) {
        return res.status(404).json({
          ok: false,
          error: '会话不存在或您没有权限操作此会话',
          code: 'SESSION_NOT_FOUND'
        });
      }

      if (session.status !== 'dry_run') {
        return res.status(400).json({
          ok: false,
          error: '会话状态不允许应用提案',
          code: 'INVALID_SESSION_STATUS'
        });
      }

      // 记录操作开始
      await PermissionService.logBulkUpdateAction(
        req.user!.id,
        AuditActions.BULK_PROPOSALS_APPLIED,
        'bulk_edit_session',
        sessionId,
        {
          selected_proposals: selectedProposals,
          proposal_count: selectedProposals.length
        }
      );

      // 调用服务层
      const result = await aiBulkService.applyProposals(sessionId, selectedProposals);

      console.log(`✅ [API] 提案应用完成: ${result.appliedCount} 成功, ${result.failedCount} 失败`);

      res.json({ 
        ok: true, 
        data: result 
      });

    } catch (error: any) {
      await PermissionService.logBulkUpdateAction(
        req.user!.id,
        `${AuditActions.BULK_PROPOSALS_APPLIED}_failed`,
        'bulk_edit_session',
        req.body.sessionId || 0,
        { error: error.message }
      );

      handleError(res, error, '应用修改提案失败');
    }
  });

  /**
   * POST /api/v1/ai-bulk/cancel
   * 取消整个会话
   */
  router.post('/cancel', async (req, res) => {
    try {
      const { sessionId } = req.body;

      if (!sessionId || !Number.isInteger(sessionId)) {
        return res.status(400).json({
          ok: false,
          error: '会话ID参数无效',
          code: 'INVALID_SESSION_ID'
        });
      }

      // 验证会话所有权
      const session = await prisma.bulk_edit_sessions.findFirst({
        where: { 
          id: sessionId, 
          created_by: req.user!.id 
        }
      });

      if (!session) {
        return res.status(404).json({
          ok: false,
          error: '会话不存在或您没有权限操作此会话',
          code: 'SESSION_NOT_FOUND'
        });
      }

      // 记录操作
      await PermissionService.logBulkUpdateAction(
        req.user!.id,
        AuditActions.BULK_SESSION_CANCELLED,
        'bulk_edit_session',
        sessionId,
        { session_status: session.status }
      );

      // 调用服务层
      await aiBulkService.cancelSession(sessionId);

      console.log(`✅ [API] 会话已取消: ${sessionId}`);

      res.json({ 
        ok: true,
        message: '会话已取消'
      });

    } catch (error: any) {
      handleError(res, error, '取消会话失败');
    }
  });

  /**
   * GET /api/v1/ai-bulk/session/:id
   * 获取会话详情和进度
   */
  router.get('/session/:id', async (req, res) => {
    try {
      const sessionId = parseInt(req.params.id);

      if (isNaN(sessionId)) {
        return res.status(400).json({
          ok: false,
          error: '会话ID参数无效',
          code: 'INVALID_SESSION_ID'
        });
      }

      // 验证会话所有权
      const session = await prisma.bulk_edit_sessions.findFirst({
        where: { 
          id: sessionId, 
          created_by: req.user!.id 
        }
      });

      if (!session) {
        return res.status(404).json({
          ok: false,
          error: '会话不存在或您没有权限查看此会话',
          code: 'SESSION_NOT_FOUND'
        });
      }

      // 调用服务层
      const details = await aiBulkService.getSessionDetails(sessionId);

      res.json({ 
        ok: true, 
        data: details 
      });

    } catch (error: any) {
      handleError(res, error, '获取会话详情失败');
    }
  });

  /**
   * GET /api/v1/ai-bulk/sessions
   * 获取用户的会话列表
   */
  router.get('/sessions', async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
      const offset = (page - 1) * limit;

      const [sessions, total] = await Promise.all([
        prisma.bulk_edit_sessions.findMany({
          where: { created_by: req.user!.id },
          include: {
            _count: {
              select: { proposals: true }
            }
          },
          orderBy: { created_at: 'desc' },
          skip: offset,
          take: limit
        }),
        prisma.bulk_edit_sessions.count({
          where: { created_by: req.user!.id }
        })
      ]);

      const sessionList = sessions.map(s => ({
        id: s.id,
        system: s.system,
        module: s.module,
        change_brief: s.change_brief.substring(0, 100) + (s.change_brief.length > 100 ? '...' : ''),
        status: s.status,
        proposals_count: s._count.proposals,
        created_at: s.created_at,
        applied_at: s.applied_at
      }));

      res.json({
        ok: true,
        data: {
          sessions: sessionList,
          pagination: {
            page,
            limit,
            total,
            total_pages: Math.ceil(total / limit)
          }
        }
      });

    } catch (error: any) {
      handleError(res, error, '获取会话列表失败');
    }
  });

  return router;
}

/**
 * 创建版本管理路由（扩展现有测试用例路由）
 */
export function createVersionRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const versionService = new VersionService(prisma);

  // 应用身份验证中间件
  router.use(authenticateUser);

  /**
   * GET /api/testcases/:id/versions
   * 获取测试用例的版本历史
   */
  router.get('/:id/versions', async (req, res) => {
    try {
      const caseId = parseInt(req.params.id);

      if (isNaN(caseId)) {
        return res.status(400).json({
          ok: false,
          error: '测试用例ID参数无效'
        });
      }

      // 检查测试用例是否存在
      const testCase = await prisma.test_cases.findUnique({
        where: { id: caseId },
        select: { id: true, title: true }
      });

      if (!testCase) {
        return res.status(404).json({
          ok: false,
          error: '测试用例不存在'
        });
      }

      const versions = await versionService.getVersionHistory(caseId);

      res.json({
        ok: true,
        data: {
          case_info: testCase,
          versions
        }
      });

    } catch (error: any) {
      console.error('获取版本历史失败:', error);
      res.status(500).json({
        ok: false,
        error: '获取版本历史失败'
      });
    }
  });

  /**
   * POST /api/testcases/:id/rollback
   * 回滚测试用例到指定版本
   */
  router.post('/:id/rollback', async (req, res) => {
    try {
      const caseId = parseInt(req.params.id);

      if (isNaN(caseId)) {
        return res.status(400).json({
          ok: false,
          error: '测试用例ID参数无效'
        });
      }

      // 请求参数验证
      const { error, value } = rollbackSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          ok: false,
          error: '请求参数验证失败: ' + error.details.map(d => d.message).join(', ')
        });
      }

      const { toVersion } = value;

      // 记录操作
      await PermissionService.logBulkUpdateAction(
        req.user!.id,
        AuditActions.TEST_CASE_ROLLBACK,
        'test_case',
        caseId,
        { target_version: toVersion }
      );

      // 调用服务层
      const result = await versionService.rollbackTestCase(caseId, toVersion, req.user!.id);

      if (result.success) {
        console.log(`✅ [API] 用例回滚成功: ${caseId} -> v${toVersion}`);
        res.json({
          ok: true,
          data: result
        });
      } else {
        res.status(500).json({
          ok: false,
          error: result.error
        });
      }

    } catch (error: any) {
      console.error('回滚失败:', error);
      res.status(500).json({
        ok: false,
        error: '回滚失败'
      });
    }
  });

  /**
   * GET /api/testcases/:id/versions/compare
   * 比较两个版本的差异
   */
  router.get('/:id/versions/compare', async (req, res) => {
    try {
      const caseId = parseInt(req.params.id);
      const fromVersion = parseInt(req.query.from as string);
      const toVersion = parseInt(req.query.to as string);

      if (isNaN(caseId) || isNaN(fromVersion) || isNaN(toVersion)) {
        return res.status(400).json({
          ok: false,
          error: '参数无效'
        });
      }

      const diff = await versionService.compareVersions(caseId, fromVersion, toVersion);

      res.json({
        ok: true,
        data: diff
      });

    } catch (error: any) {
      console.error('版本比较失败:', error);
      res.status(500).json({
        ok: false,
        error: '版本比较失败'
      });
    }
  });

  return router;
}