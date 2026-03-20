import { Router, Request, Response } from 'express';
import { InsightsService } from '../services/insightsService.js';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

export function createInsightsRoutes(): Router {
  const router = Router();
  const getService = () => new InsightsService();

  /**
   * GET /api/insights/articles
   */
  router.get('/articles', async (req: Request, res: Response) => {
    try {
      const {
        page = '1',
        pageSize = '10',
        search,
        category,
        source
      } = req.query;

      const service = getService();
      const result = await service.getArticleList({
        page: parseInt(page as string, 10),
        pageSize: parseInt(pageSize as string, 10),
        search: search as string,
        category: category as string,
        source: source as string
      });

      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error('获取文章列表失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/insights/articles/categories
   */
  router.get('/articles/categories', async (_req: Request, res: Response) => {
    try {
      const service = getService();
      const categories = await service.getCategories();
      res.json({ success: true, data: categories });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/insights/articles/:id
   */
  router.get('/articles/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const service = getService();
      const article = await service.getArticleById(id);

      if (!article) {
        return res.status(404).json({ success: false, error: '文章不存在' });
      }

      res.json({ success: true, data: article });
    } catch (error: any) {
      console.error('获取文章详情失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/insights/articles
   */
  router.post('/articles', async (req: Request, res: Response) => {
    try {
      const { title, category, url, content, summary, published_at } = req.body;

      if (!title || !url || !content) {
        return res.status(400).json({ success: false, error: '标题、URL和内容不能为空' });
      }

      const service = getService();
      const article = await service.createArticle({
        title,
        category: category || '其他',
        url,
        content,
        summary,
        published_at: published_at ? new Date(published_at) : new Date()
      });

      res.json({ success: true, data: article });
    } catch (error: any) {
      console.error('创建文章失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/insights/articles/batch-import
   */
  router.post('/articles/batch-import', upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: '请上传Markdown文件' });
      }

      const markdownContent = req.file.buffer.toString('utf-8');
      const service = getService();
      const importedCount = await service.batchImportFromMarkdown(markdownContent);

      res.json({
        success: true,
        message: `成功导入 ${importedCount} 篇文章`,
        count: importedCount
      });
    } catch (error: any) {
      console.error('批量导入文章失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * DELETE /api/insights/articles/:id
   */
  router.delete('/articles/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const service = getService();
      await service.deleteArticle(id);

      res.json({ success: true, message: '文章已删除' });
    } catch (error: any) {
      console.error('删除文章失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}
