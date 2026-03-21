import { Router, Request, Response } from 'express';
import { AnalysisService } from '../services/analysisService.js';
import { MARKET_INSIGHT_REQUIREMENT_DOC_SYSTEM_PROMPT } from '../services/aiParser1.js';
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
      const content = await service.generateRequirementDoc(text, model, {
        systemPrompt: MARKET_INSIGHT_REQUIREMENT_DOC_SYSTEM_PROMPT,
        logScene: 'requirementAnalysisPage',
      });

      res.json({
        success: true,
        data: { content }
      });
    } catch (error: any) {
      console.error('AI 生成需求文档失败:', error);
      res.status(500).json({ success: false, error: error.message });
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
