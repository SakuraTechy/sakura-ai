import express from 'express';
import * as path from 'path';
import * as fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { PrismaClient } from '../../src/generated/prisma/index.js';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * 获取Midscene报告
 * GET /api/midscene-report/:runId
 */
router.get('/:runId', async (req, res) => {
  try {
    const { runId } = req.params;
    
    // 🔥 优先从数据库获取报告路径
    try {
      const execution = await prisma.test_case_executions.findUnique({
        where: { id: runId },
        select: { midscene_report_path: true }
      });
      
      if (execution?.midscene_report_path) {
        console.log(`📊 从数据库获取到报告路径: ${execution.midscene_report_path}`);
        const reportContent = await fs.readFile(execution.midscene_report_path, 'utf-8');
        res.setHeader('Content-Type', 'text/html');
        return res.send(reportContent);
      }
    } catch (dbError) {
      console.warn(`⚠️ 从数据库查询报告路径失败:`, dbError);
    }
    
    // 🔥 如果数据库没有，从文件系统查找
    const reportDir = path.join(process.cwd(), 'midscene_run', 'report');
    
    // 读取目录中的所有文件
    const files = await fs.readdir(reportDir);
    
    // 查找包含runId的报告文件
    // Midscene报告格式：playwright-{timestamp}-{hash}.html
    const reportFile = files.find(file => 
      file.startsWith('playwright-') && 
      file.endsWith('.html') &&
      file.includes(runId)
    );
    
    if (!reportFile) {
      // 如果找不到包含runId的文件，返回最新的报告
      const htmlFiles = files.filter(f => f.endsWith('.html'));
      if (htmlFiles.length === 0) {
        return res.status(404).json({ 
          error: 'Report not found',
          message: `未找到runId为 ${runId} 的Midscene报告` 
        });
      }
      
      // 按文件修改时间排序，返回最新的
      const filesWithStats = await Promise.all(
        htmlFiles.map(async (file) => {
          const filePath = path.join(reportDir, file);
          const stats = await fs.stat(filePath);
          return { file, mtime: stats.mtime };
        })
      );
      
      filesWithStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
      const latestFile = filesWithStats[0].file;
      
      // 读取并返回最新报告
      const reportPath = path.join(reportDir, latestFile);
      const reportContent = await fs.readFile(reportPath, 'utf-8');
      res.setHeader('Content-Type', 'text/html');
      return res.send(reportContent);
    }
    
    // 读取并返回报告
    const reportPath = path.join(reportDir, reportFile);
    const reportContent = await fs.readFile(reportPath, 'utf-8');
    res.setHeader('Content-Type', 'text/html');
    res.send(reportContent);
    
  } catch (error: any) {
    console.error('获取Midscene报告失败:', error);
    res.status(500).json({ 
      error: 'Failed to get Midscene report',
      message: error.message 
    });
  }
});

export default router;
