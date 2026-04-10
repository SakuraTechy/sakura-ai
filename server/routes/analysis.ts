import { Router, Request, Response } from 'express';
import { AnalysisService } from '../services/analysisService.js';
import { REQUIREMENT_ANALYSIS_SYSTEM_PROMPT_V2 } from '../services/ankkiPrompt.js';
import { RequirementDocService } from '../services/requirementDocService.js';
import multer from 'multer';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedExtensions = [
      '.pdf', '.docx', '.doc', '.txt', '.md', '.markdown',
      '.html', '.htm', '.json', '.csv',
    ];
    const ext = '.' + file.originalname.toLowerCase().split('.').pop();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`不支持的文件格式: ${ext}，支持 PDF、Word、TXT、Markdown、HTML、JSON、CSV`));
    }
  }
});

export function createAnalysisRoutes(): Router {
  const router = Router();
  const getAnalysisService = () => new AnalysisService();
  const getDocService = () => new RequirementDocService();
  const writeNdjson = (res: Response, payload: Record<string, unknown>) => {
    res.write(`${JSON.stringify(payload)}\n`);
  };

  /**
   * POST /api/analysis/upload
   */
  router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: '请上传文件' });
      }

      const service = getAnalysisService();
      const rawText = await service.extractTextFromFile(req.file);
      const full =
        req.query.full === '1' ||
        req.query.full === 'true' ||
        (Array.isArray(req.query.full) && req.query.full[0] === '1');
      const text = full ? rawText : rawText.substring(0, 50000);

      res.json({
        success: true,
        data: {
          filename: req.file.originalname,
          size: req.file.size,
          text
        }
      });
    } catch (error: any) {
      console.error('文件上传处理失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/analysis/generate
   */
  router.post('/generate', async (req: Request, res: Response) => {
    try {
      const { text, model } = req.body;

      if (!text || text.trim().length === 0) {
        return res.status(400).json({ success: false, error: '请提供需求文本内容' });
      }

      const service = getAnalysisService();

      // 轻量日志：用于确认当前使用的系统提示词常量（默认不打印全文，避免泄露与刷屏）
      if (process.env.REQUIREMENT_DOC_LLM_LOG_PROMPTS === 'true') {
        console.log('🧩 [requirementAnalysisPage] systemPromptKey=REQUIREMENT_ANALYSIS_SYSTEM_PROMPT_V2');
        console.log(`   - systemPromptLength=${REQUIREMENT_ANALYSIS_SYSTEM_PROMPT_V2.length}`);
      }
      const { content, inputTruncated } = await service.generateRequirementDoc(text, model, {
        systemPrompt: REQUIREMENT_ANALYSIS_SYSTEM_PROMPT_V2,
        logScene: 'requirementAnalysisPage',
      });

      res.json({
        success: true,
        data: { content, inputTruncated }
      });
    } catch (error: any) {
      console.error('AI 生成需求文档失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/analysis/generate-stream
   * 以 NDJSON 流式返回生成进度与最终结果
   */
  router.post('/generate-stream', async (req: Request, res: Response) => {
    try {
      const { text, model } = req.body;
      if (!text || text.trim().length === 0) {
        return res.status(400).json({ success: false, error: '请提供需求文本内容' });
      }

      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      const service = getAnalysisService();
      writeNdjson(res, { type: 'progress', phase: 'start', message: '开始生成需求文档' });

      const { content, inputTruncated } = await service.generateRequirementDoc(text, model, {
        systemPrompt: REQUIREMENT_ANALYSIS_SYSTEM_PROMPT_V2,
        logScene: 'requirementAnalysisPage',
        onProgress: (event) => writeNdjson(res, { type: 'progress', ...event }),
      });

      writeNdjson(res, { type: 'result', success: true, data: { content, inputTruncated } });
      res.end();
    } catch (error: any) {
      console.error('AI 流式生成需求文档失败:', error);
      writeNdjson(res, { type: 'error', success: false, error: error.message || '生成失败' });
      res.end();
    }
  });

  /**
   * POST /api/analysis/save
   */
  router.post('/save', async (req: Request, res: Response) => {
    try {
      const { title, content, summary, sourceFilename, projectId, projectVersionId, system, module } = req.body;
      const creatorId = (req as any).user?.id || 1;

      if (!title || !content) {
        return res.status(400).json({ success: false, error: '标题和内容不能为空' });
      }

      const service = getDocService();
      const document = await service.create({
        title,
        content,
        summary,
        sourceFilename,
        projectId,
        projectVersionId,
        creatorId,
        system,
        module
      });

      res.json({ success: true, data: document });
    } catch (error: any) {
      console.error('保存需求文档失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/analysis/documents
   */
  router.get('/documents', async (req: Request, res: Response) => {
    try {
      const { page = '1', pageSize = '10', search } = req.query;

      const service = getDocService();
      const result = await service.getList({
        page: parseInt(page as string, 10),
        pageSize: parseInt(pageSize as string, 10),
        search: search as string
      });

      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error('获取需求文档列表失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}
