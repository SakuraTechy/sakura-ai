import { Router, Request, Response } from 'express';
import { MarketInsightService } from '../services/marketInsightService.js';
import { MarketInsightScheduler } from '../services/marketInsightScheduler.js';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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
      const { title, description, trigger_type, trigger_time, trigger_day, data_sources, is_active } = req.body;
      if (!title || !trigger_type || !trigger_time) {
        return res.status(400).json({ success: false, error: '标题、触发类型和触发时间不能为空' });
      }

      const service = getService();
      const task = await service.createTask({ title, description, trigger_type, trigger_time, trigger_day, data_sources, is_active });

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

  // ========== Report Routes ==========

  router.get('/reports', async (req: Request, res: Response) => {
    try {
      const { page = '1', pageSize = '10', taskId, startDate, endDate, status, search } = req.query;
      const service = getService();
      const result = await service.getReportList({
        page: parseInt(page as string, 10),
        pageSize: parseInt(pageSize as string, 10),
        taskId: taskId ? parseInt(taskId as string, 10) : undefined,
        startDate: startDate as string,
        endDate: endDate as string,
        status: status as string,
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

  router.post('/reports/import', upload.single('file'), async (req: Request, res: Response) => {
    try {
      const taskId = req.body.taskId ? parseInt(req.body.taskId, 10) : null;

      if (!req.file) {
        return res.status(400).json({ success: false, error: '请上传 Markdown 文件' });
      }

      const content = req.file.buffer.toString('utf-8');
      const service = getService();
      const reportId = await service.importReportFromMarkdown(taskId, content, req.file.originalname);

      res.json({ success: true, data: { reportId }, message: '报告导入成功' });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
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
