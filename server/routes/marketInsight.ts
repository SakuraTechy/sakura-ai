import { Router, Request, Response, NextFunction } from 'express';
import { MarketInsightService } from '../services/marketInsightService.js';
import { MarketInsightScheduler } from '../services/marketInsightScheduler.js';
import { AnalysisService } from '../services/analysisService.js';
import multer from 'multer';

/** 与 /api/analysis/upload 一致，避免 multipart 直传时解析差异 */
const REPORT_IMPORT_ALLOWED = [
  '.pdf', '.docx', '.doc', '.txt', '.md', '.markdown',
  '.html', '.htm', '.json', '.csv',
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = '.' + file.originalname.toLowerCase().split('.').pop();
    if (REPORT_IMPORT_ALLOWED.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`不支持的文件格式: ${ext}，支持 ${REPORT_IMPORT_ALLOWED.join('、')}`));
    }
  },
});

function uploadSingleReportFile(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(400).json({ success: false, error: message || '文件上传失败' });
    }
    next();
  });
}

export function createMarketInsightRoutes(): Router {
  const router = Router();
  const getService = () => new MarketInsightService();

  // ========== Task Routes ==========

  router.get('/tasks', async (req: Request, res: Response) => {
    try {
      const { page = '1', pageSize = '20' } = req.query;
      const service = getService();
      const result = await service.getTaskList({
        page: parseInt(page as string, 10),
        pageSize: parseInt(pageSize as string, 10),
      });
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get('/tasks/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const service = getService();
      const task = await service.getTaskById(id);
      if (!task) return res.status(404).json({ success: false, error: '任务不存在' });
      res.json({ success: true, data: task });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.post('/tasks', async (req: Request, res: Response) => {
    try {
      const { title, description, trigger_type, trigger_time, trigger_day, data_sources, source_configs, is_active } = req.body;
      if (!title || !trigger_type || !trigger_time) {
        return res.status(400).json({ success: false, error: '标题、触发类型和触发时间不能为空' });
      }

      const service = getService();
      const task = await service.createTask({ title, description, trigger_type, trigger_time, trigger_day, data_sources, source_configs, is_active });

      if (task.is_active) {
        const scheduler = MarketInsightScheduler.getInstance();
        scheduler.scheduleTask(task);
      }

      res.json({ success: true, data: task });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.put('/tasks/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const service = getService();
      const task = await service.updateTask(id, req.body);

      const scheduler = MarketInsightScheduler.getInstance();
      if (task.is_active) {
        scheduler.scheduleTask(task);
      } else {
        scheduler.unscheduleTask(id);
      }

      res.json({ success: true, data: task });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.delete('/tasks/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const scheduler = MarketInsightScheduler.getInstance();
      scheduler.unscheduleTask(id);

      const service = getService();
      await service.deleteTask(id);
      res.json({ success: true, message: '任务已删除' });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.post('/tasks/batch-delete', async (req: Request, res: Response) => {
    try {
      const ids = Array.isArray(req.body?.ids)
        ? req.body.ids.map((id: unknown) => parseInt(String(id), 10)).filter((id: number) => Number.isFinite(id))
        : [];
      if (!ids.length) {
        return res.status(400).json({ success: false, error: '请选择要删除的任务' });
      }
      const scheduler = MarketInsightScheduler.getInstance();
      ids.forEach((id) => scheduler.unscheduleTask(id));
      const service = getService();
      const result = await service.batchDeleteTasks(ids);
      res.json({ success: true, message: `成功删除 ${result.deletedCount} 个任务`, data: result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.post('/tasks/:id/execute', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const service = getService();
      const reportId = await service.executeTask(id);
      res.json({ success: true, data: { reportId }, message: '任务已开始执行' });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.post('/tasks/quick-create-and-execute', async (req: Request, res: Response) => {
    try {
      const {
        industry,
        displayName,
        maxItems,
        timeWindow,
        executeNow = true,
        fetchMode,
        reportOutputStyle,
      } = req.body || {};
      const normalizedIndustry = typeof industry === 'string' ? industry.trim() : '';
      if (!normalizedIndustry) {
        return res.status(400).json({ success: false, error: 'industry 不能为空' });
      }

      if (maxItems != null && (!Number.isFinite(Number(maxItems)) || Number(maxItems) < 1 || Number(maxItems) > 100)) {
        return res.status(400).json({ success: false, error: 'maxItems 必须是 1-100 的数字' });
      }
      if (fetchMode != null && !['pure_ai', 'sources_plus_ai'].includes(String(fetchMode))) {
        return res.status(400).json({ success: false, error: 'fetchMode 仅支持 pure_ai 或 sources_plus_ai' });
      }
      if (
        reportOutputStyle != null &&
        !['default', 'angkai', 'sample'].includes(String(reportOutputStyle))
      ) {
        return res.status(400).json({ success: false, error: 'reportOutputStyle 仅支持 default、angkai 或 sample' });
      }

      const ros = String(reportOutputStyle ?? 'default').toLowerCase();
      const normalizedReportStyle =
        ros === 'angkai' ? 'angkai' : ros === 'sample' ? 'sample' : 'default';

      const service = getService();
      const result = await service.quickCreateAndExecuteByIndustry({
        industry: normalizedIndustry,
        displayName: typeof displayName === 'string' ? displayName.trim() : undefined,
        maxItems: maxItems != null ? Number(maxItems) : undefined,
        timeWindow: typeof timeWindow === 'string' ? timeWindow.trim() : undefined,
        executeNow: Boolean(executeNow),
        fetchMode: fetchMode === 'pure_ai' ? 'pure_ai' : 'sources_plus_ai',
        reportOutputStyle: normalizedReportStyle,
      });
      res.json({
        success: true,
        data: result,
        message: result.status === 'running' ? '任务已创建并开始执行' : '任务已创建',
      });
    } catch (error: any) {
      const msg = String(error?.message || '');
      if (msg.includes('行业不能为空')) {
        return res.status(400).json({ success: false, error: msg });
      }
      if (msg.includes('暂无可用数据源')) {
        return res.status(422).json({ success: false, error: msg });
      }
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ========== Report Routes ==========

  router.get('/reports', async (req: Request, res: Response) => {
    try {
      const { page = '1', pageSize = '10', taskId, startDate, endDate, status, category, search } = req.query;
      const service = getService();
      const result = await service.getReportList({
        page: parseInt(page as string, 10),
        pageSize: parseInt(pageSize as string, 10),
        taskId: taskId ? parseInt(taskId as string, 10) : undefined,
        startDate: startDate as string,
        endDate: endDate as string,
        status: status as string,
        category: category as string,
        search: search as string,
      });
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get('/reports/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const service = getService();
      const report = await service.getReportById(id);
      if (!report) return res.status(404).json({ success: false, error: '报告不存在' });
      res.json({ success: true, data: report });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /** 与需求分析相同：先由 /api/analysis/upload 提取正文，再 JSON 提交（前端默认走此路径） */
  router.post('/reports/import-from-text', async (req: Request, res: Response) => {
    try {
      const { content, filename, taskId } = req.body as {
        content?: string;
        filename?: string;
        taskId?: number | string | null;
      };
      const text = typeof content === 'string' ? content : '';
      if (!text.trim()) {
        return res.status(400).json({ success: false, error: '正文内容不能为空' });
      }
      let taskIdNum: number | null = null;
      if (taskId !== undefined && taskId !== null && taskId !== '') {
        const n = parseInt(String(taskId), 10);
        if (Number.isFinite(n)) taskIdNum = n;
      }
      const service = getService();
      const reportId = await service.importReportFromMarkdown(
        taskIdNum,
        text,
        typeof filename === 'string' ? filename : undefined
      );
      res.json({ success: true, data: { reportId }, message: '报告导入成功' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('市场洞察 import-from-text 失败:', error);
      res.status(500).json({ success: false, error: message || '导入失败' });
    }
  });

  /** 直接 multipart 上传（与 import-from-text 二选一） */
  router.post('/reports/import', uploadSingleReportFile, async (req: Request, res: Response) => {
    try {
      const taskId = req.body.taskId ? parseInt(req.body.taskId, 10) : null;

      if (!req.file) {
        return res.status(400).json({ success: false, error: '请选择要导入的报告文件' });
      }

      const analysis = new AnalysisService();
      const content = await analysis.extractTextFromFile(req.file);
      if (!content.trim()) {
        return res.status(400).json({ success: false, error: '文件内容为空或无法解析为文本' });
      }

      const service = getService();
      const reportId = await service.importReportFromMarkdown(taskId, content, req.file.originalname);

      res.json({ success: true, data: { reportId }, message: '报告导入成功' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('市场洞察 reports/import 失败:', error);
      res.status(500).json({ success: false, error: message || '导入失败' });
    }
  });

  router.delete('/reports/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const service = getService();
      await service.deleteReport(id);
      res.json({ success: true, message: '报告已删除' });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.post('/reports/batch-delete', async (req: Request, res: Response) => {
    try {
      const ids = Array.isArray(req.body?.ids)
        ? req.body.ids.map((id: unknown) => parseInt(String(id), 10)).filter((id: number) => Number.isFinite(id))
        : [];
      if (!ids.length) {
        return res.status(400).json({ success: false, error: '请选择要删除的报告' });
      }
      const service = getService();
      const result = await service.batchDeleteReports(ids);
      res.json({ success: true, message: `成功删除 ${result.deletedCount} 份报告`, data: result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.post('/reports/:id/convert', async (req: Request, res: Response) => {
    try {
      const reportId = parseInt(req.params.id, 10);
      const { title, projectId, projectVersionId } = req.body;
      const userId = (req as any).user?.id || 1;

      if (!title) {
        return res.status(400).json({ success: false, error: '需求文档标题不能为空' });
      }

      const service = getService();
      const doc = await service.convertToRequirement({
        reportId,
        title,
        projectId: projectId ? parseInt(projectId, 10) : undefined,
        projectVersionId: projectVersionId ? parseInt(projectVersionId, 10) : undefined,
        userId,
      });

      res.json({ success: true, data: doc, message: '已成功转化为需求文档' });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}
