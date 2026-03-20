import { PrismaClient } from '../../src/generated/prisma/index.js';
import { DatabaseService } from './databaseService.js';
import { llmConfigManager } from '../../src/services/llmConfigManager.js';

// ======================== Types ========================

export interface TaskListParams {
  page?: number;
  pageSize?: number;
}

export interface CreateTaskParams {
  title: string;
  description?: string;
  trigger_type: string;
  trigger_time: string;
  trigger_day?: number;
  data_sources?: string[];
  is_active?: boolean;
}

export interface UpdateTaskParams extends Partial<CreateTaskParams> {}

export interface ReportListParams {
  page?: number;
  pageSize?: number;
  taskId?: number;
  startDate?: string;
  endDate?: string;
  status?: string;
  search?: string;
}

export interface ConvertToRequirementParams {
  reportId: number;
  title: string;
  projectId?: number;
  projectVersionId?: number;
  userId: number;
}

type CategoryId = 'ai-ml' | 'security' | 'engineering' | 'tools' | 'opinion' | 'other';

const CATEGORY_META: Record<CategoryId, { emoji: string; label: string }> = {
  'ai-ml':       { emoji: '🤖', label: '人工智能' },
  'security':    { emoji: '🔒', label: '数据安全' },
  'engineering': { emoji: '⚙️', label: '工程技术' },
  'tools':       { emoji: '🛠', label: '工具开源' },
  'opinion':     { emoji: '💡', label: '观点评论' },
  'other':       { emoji: '📝', label: '其他' },
};

// ======================== Service ========================

export class MarketInsightService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = DatabaseService.getInstance().getClient();
  }

  // ========== Task CRUD ==========

  async getTaskList(params: TaskListParams = {}) {
    const { page = 1, pageSize = 20 } = params;

    const [tasks, total] = await Promise.all([
      this.prisma.market_insight_tasks.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { created_at: 'desc' },
        include: {
          reports: {
            select: { id: true },
            take: 0,
          },
          _count: { select: { reports: true } }
        }
      }),
      this.prisma.market_insight_tasks.count()
    ]);

    return {
      data: tasks,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    };
  }

  async getTaskById(id: number) {
    return this.prisma.market_insight_tasks.findUnique({
      where: { id },
      include: { _count: { select: { reports: true } } }
    });
  }

  async createTask(params: CreateTaskParams) {
    return this.prisma.market_insight_tasks.create({
      data: {
        title: params.title,
        description: params.description || null,
        trigger_type: params.trigger_type,
        trigger_time: params.trigger_time,
        trigger_day: params.trigger_day || null,
        data_sources: params.data_sources ? JSON.stringify(params.data_sources) : null,
        is_active: params.is_active !== undefined ? params.is_active : true,
      }
    });
  }

  async updateTask(id: number, params: UpdateTaskParams) {
    const data: any = {};
    if (params.title !== undefined) data.title = params.title;
    if (params.description !== undefined) data.description = params.description;
    if (params.trigger_type !== undefined) data.trigger_type = params.trigger_type;
    if (params.trigger_time !== undefined) data.trigger_time = params.trigger_time;
    if (params.trigger_day !== undefined) data.trigger_day = params.trigger_day;
    if (params.data_sources !== undefined) data.data_sources = JSON.stringify(params.data_sources);
    if (params.is_active !== undefined) data.is_active = params.is_active;

    return this.prisma.market_insight_tasks.update({ where: { id }, data });
  }

  async deleteTask(id: number) {
    await this.prisma.market_insight_reports.deleteMany({ where: { task_id: id } });
    return this.prisma.market_insight_tasks.delete({ where: { id } });
  }

  // ========== Report CRUD ==========

  async getReportList(params: ReportListParams = {}) {
    const { page = 1, pageSize = 10, taskId, startDate, endDate, status, search } = params;
    const where: any = {};

    if (taskId) where.task_id = taskId;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { summary: { contains: search } }
      ];
    }
    if (startDate || endDate) {
      where.executed_at = {};
      if (startDate) where.executed_at.gte = new Date(startDate);
      if (endDate) where.executed_at.lte = new Date(endDate);
    }

    const [reports, total] = await Promise.all([
      this.prisma.market_insight_reports.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { executed_at: 'desc' },
        include: {
          task: { select: { id: true, title: true } }
        }
      }),
      this.prisma.market_insight_reports.count({ where })
    ]);

    return {
      data: reports,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    };
  }

  async getReportById(id: number) {
    return this.prisma.market_insight_reports.findUnique({
      where: { id },
      include: { task: { select: { id: true, title: true } } }
    });
  }

  async deleteReport(id: number) {
    return this.prisma.market_insight_reports.delete({ where: { id } });
  }

  // ========== Execute Task ==========

  async executeTask(taskId: number): Promise<number> {
    const task = await this.prisma.market_insight_tasks.findUnique({ where: { id: taskId } });
    if (!task) throw new Error('任务不存在');

    const report = await this.prisma.market_insight_reports.create({
      data: {
        task_id: taskId,
        title: `${task.title} - ${new Date().toISOString().slice(0, 10)}`,
        content: '',
        category: '市场洞察',
        status: 'running',
        executed_at: new Date(),
      }
    });

    this.runTaskInBackground(task, report.id).catch(err => {
      console.error(`[MarketInsight] 任务 ${taskId} 执行失败:`, err.message);
    });

    return report.id;
  }

  private async runTaskInBackground(task: any, reportId: number) {
    try {
      let dataSources: string[] = [];
      try {
        dataSources = task.data_sources ? JSON.parse(task.data_sources) : [];
      } catch { /* ignore */ }

      const dbArticles = await this.fetchArticlesFromDB(48);
      let rssArticles: any[] = [];

      if (dataSources.length > 0) {
        console.log(`[MarketInsight] 从 ${dataSources.length} 个 RSS 源抓取文章...`);
        rssArticles = await this.fetchArticlesFromRSS(dataSources);
        console.log(`[MarketInsight] RSS 抓取到 ${rssArticles.length} 篇文章`);
      }

      const allArticles = [...dbArticles, ...rssArticles];

      if (allArticles.length === 0) {
        const diagLines: string[] = [
          '## 执行诊断',
          '',
          `- 数据库文章（48小时内）：${dbArticles.length} 篇`,
          `- 配置的 RSS 源数量：${dataSources.length}`,
          `- RSS 抓取到的文章：${rssArticles.length} 篇`,
        ];
        if (this.rssErrors.length > 0) {
          diagLines.push('', '### RSS 抓取错误详情', '');
          for (const e of this.rssErrors) {
            diagLines.push(`- \`${e.url}\` → **${e.error}**`);
          }
        }
        if (dataSources.length === 0) {
          diagLines.push('', '> 未配置任何 RSS 数据源，建议在任务设置中添加 RSS URL。');
        }
        await this.prisma.market_insight_reports.update({
          where: { id: reportId },
          data: {
            status: 'failed',
            content: diagLines.join('\n'),
            summary: '执行失败：无可用数据'
          }
        });
        return;
      }

      const { content, summary, stats } = await this.generateReportContent(allArticles, task.title);

      await this.prisma.market_insight_reports.update({
        where: { id: reportId },
        data: {
          title: `${task.title} - ${new Date().toISOString().slice(0, 10)}`,
          content,
          summary,
          stats_json: JSON.stringify(stats),
          status: 'success',
        }
      });

      await this.prisma.market_insight_tasks.update({
        where: { id: task.id },
        data: { last_executed_at: new Date() }
      });

      if (rssArticles.length > 0) {
        const savedCount = await this.syncArticlesToInsights(rssArticles);
        console.log(`[MarketInsight] 同步 ${savedCount} 篇新文章到 insights_articles`);
      }

      console.log(`[MarketInsight] 任务 ${task.id} 执行成功，报告 ${reportId}（DB: ${dbArticles.length}, RSS: ${rssArticles.length}）`);
    } catch (error: any) {
      console.error(`[MarketInsight] 报告生成失败:`, error.message);
      await this.prisma.market_insight_reports.update({
        where: { id: reportId },
        data: {
          status: 'failed',
          content: `执行失败: ${error.message}`,
          summary: `执行失败: ${error.message}`
        }
      });
    }
  }

  private async syncArticlesToInsights(articles: any[]): Promise<number> {
    let savedCount = 0;

    const urls = articles.map(a => a.url).filter(Boolean);
    const existing = await this.prisma.insights_articles.findMany({
      where: { url: { in: urls } },
      select: { url: true }
    });
    const existingUrls = new Set(existing.map(e => e.url));

    const newArticles = articles.filter(a => a.url && !existingUrls.has(a.url));

    for (const article of newArticles) {
      try {
        await this.prisma.insights_articles.create({
          data: {
            title: article.title,
            category: article.category || '其他',
            url: article.url,
            content: article.content || `# ${article.title}\n\n> ${article.summary || ''}\n\n原文链接: ${article.url}`,
            summary: article.summary || article.title,
            source: 'market_insight',
            published_at: article.published_at instanceof Date ? article.published_at : new Date(article.published_at || Date.now()),
          }
        });
        savedCount++;
      } catch (err: any) {
        console.warn(`[MarketInsight] 同步文章失败 "${article.title}": ${err.message}`);
      }
    }

    return savedCount;
  }

  private async fetchArticlesFromDB(hours: number) {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.prisma.insights_articles.findMany({
      where: { published_at: { gte: cutoff } },
      orderBy: { published_at: 'desc' },
      take: 100,
    });
  }

  // ========== RSS Feed Fetching (复用 digest.ts 核心逻辑) ==========

  private rssErrors: Array<{ url: string; error: string }> = [];

  private async fetchArticlesFromRSS(rssUrls: string[]): Promise<any[]> {
    const allArticles: any[] = [];
    this.rssErrors = [];
    const TIMEOUT_MS = 20000;
    const CONCURRENCY = 5;

    for (let i = 0; i < rssUrls.length; i += CONCURRENCY) {
      const batch = rssUrls.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(url => this.fetchSingleFeed(url, TIMEOUT_MS))
      );
      for (const r of results) {
        if (r.status === 'fulfilled') allArticles.push(...r.value);
      }
    }

    return allArticles;
  }

  private async fetchSingleFeed(xmlUrl: string, timeoutMs: number): Promise<any[]> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(xmlUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml,application/atom+xml,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const errMsg = `HTTP ${response.status} ${response.statusText}`;
        this.rssErrors.push({ url: xmlUrl, error: errMsg });
        console.warn(`[MarketInsight] RSS 抓取失败 ${xmlUrl}: ${errMsg}`);
        return [];
      }
      const xml = await response.text();
      const articles = this.parseRSSToArticles(xml, xmlUrl);
      console.log(`[MarketInsight] RSS 源 ${xmlUrl} 解析到 ${articles.length} 篇文章`);
      return articles;
    } catch (error: any) {
      const errMsg = error.name === 'AbortError' ? `超时 (${timeoutMs}ms)` : error.message;
      this.rssErrors.push({ url: xmlUrl, error: errMsg });
      console.warn(`[MarketInsight] RSS 抓取失败 ${xmlUrl}: ${errMsg}`);
      return [];
    }
  }

  private parseRSSToArticles(xml: string, sourceUrl: string): any[] {
    const articles: any[] = [];
    const isAtom = xml.includes('<feed') && (xml.includes('xmlns="http://www.w3.org/2005/Atom"') || xml.includes('<feed '));

    const stripHtml = (html: string) =>
      html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ').trim();

    const extractCDATA = (text: string) => {
      const m = text.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
      return m ? m[1] : text;
    };

    const getTag = (src: string, tag: string) => {
      const m = src.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
      return m?.[1] ? extractCDATA(m[1]).trim() : '';
    };

    const getAttr = (src: string, tag: string, attr: string) => {
      const m = src.match(new RegExp(`<${tag}[^>]*\\s${attr}=["']([^"']*)["'][^>]*/?>`, 'i'));
      return m?.[1] || '';
    };

    const itemPattern = isAtom
      ? /<entry[\s>]([\s\S]*?)<\/entry>/gi
      : /<item[\s>]([\s\S]*?)<\/item>/gi;

    let match;
    while ((match = itemPattern.exec(xml)) !== null) {
      const chunk = match[1];
      const title = stripHtml(getTag(chunk, 'title'));

      let link: string;
      if (isAtom) {
        link = getAttr(chunk, 'link', 'href');
      } else {
        link = getTag(chunk, 'link') || getTag(chunk, 'guid');
      }

      const pubDateStr = isAtom
        ? (getTag(chunk, 'published') || getTag(chunk, 'updated'))
        : (getTag(chunk, 'pubDate') || getTag(chunk, 'dc:date'));
      const pubDate = pubDateStr ? new Date(pubDateStr) : new Date();

      const desc = stripHtml(
        getTag(chunk, isAtom ? 'summary' : 'description') || getTag(chunk, 'content:encoded') || getTag(chunk, 'content')
      ).slice(0, 500);

      if (title && title.length >= 3) {
        articles.push({
          title,
          url: link || sourceUrl,
          category: '其他',
          summary: desc || title,
          content: `# ${title}\n\n> ${desc}\n\n原文链接: ${link}`,
          published_at: isNaN(pubDate.getTime()) ? new Date() : pubDate,
        });
      }
    }

    return articles;
  }

  private async generateReportContent(
    articles: any[],
    taskTitle: string
  ): Promise<{ content: string; summary: string; stats: any }> {
    const categoryGroups = new Map<string, any[]>();
    for (const a of articles) {
      const cat = a.category || '其他';
      if (!categoryGroups.has(cat)) categoryGroups.set(cat, []);
      categoryGroups.get(cat)!.push(a);
    }

    const stats = {
      totalArticles: articles.length,
      categories: Array.from(categoryGroups.entries()).map(([cat, arts]) => ({
        name: cat,
        count: arts.length
      })),
      generatedAt: new Date().toISOString(),
    };

    let highlightsSummary = '';
    try {
      highlightsSummary = await this.generateAIHighlights(articles);
    } catch (err: any) {
      console.warn('[MarketInsight] AI 摘要生成失败，使用默认摘要:', err.message);
      highlightsSummary = `共收录 ${articles.length} 篇文章，涵盖 ${categoryGroups.size} 个分类。`;
    }

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];

    let report = `# 📰 ${taskTitle} — ${dateStr}\n\n`;
    report += `> 自动聚合洞察报告，共收录 ${articles.length} 篇文章\n\n`;

    if (highlightsSummary) {
      report += `## 📝 今日看点\n\n${highlightsSummary}\n\n---\n\n`;
    }

    report += `## 📊 数据概览\n\n`;
    report += `| 分类 | 文章数 |\n|:---:|:---:|\n`;
    for (const [cat, arts] of categoryGroups) {
      report += `| ${cat} | ${arts.length} |\n`;
    }
    report += `\n---\n\n`;

    const sortedCategories = Array.from(categoryGroups.entries())
      .sort((a, b) => b[1].length - a[1].length);

    for (const [cat, catArticles] of sortedCategories) {
      report += `## ${cat}\n\n`;
      for (const a of catArticles.slice(0, 10)) {
        report += `### ${a.title}\n\n`;
        report += `[${a.title}](${a.url}) · ${new Date(a.published_at).toLocaleString('zh-CN')}\n\n`;
        if (a.summary) {
          report += `> ${a.summary}\n\n`;
        }
        report += `---\n\n`;
      }
    }

    report += `*生成于 ${dateStr} ${now.toISOString().split('T')[1]?.slice(0, 5) || ''} | 共 ${articles.length} 篇文章*\n`;

    return { content: report, summary: highlightsSummary, stats };
  }

  private async generateAIHighlights(articles: any[]): Promise<string> {
    const config = llmConfigManager.getCurrentConfig();
    const apiKey = config.apiKey || process.env.OPENROUTER_API_KEY || '';
    const baseUrl = config.baseUrl || process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
    const model = config.model || 'openai/gpt-4o';

    if (!apiKey) {
      return `共收录 ${articles.length} 篇文章。`;
    }

    const articleList = articles.slice(0, 15).map((a, i) =>
      `${i + 1}. [${a.category}] ${a.title}`
    ).join('\n');

    const prompt = `根据以下今日精选技术文章列表，写一段 3-5 句话的"今日看点"总结。
要求：
- 提炼出今天的 2-3 个主要趋势或话题
- 不要逐篇列举，要做宏观归纳
- 风格简洁有力，像新闻导语
- 用中文回答

文章列表：
${articleList}

直接返回纯文本总结，不要 JSON，不要 markdown 格式。`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 500
        }),
        signal: controller.signal
      });

      if (!response.ok) throw new Error(`AI API error: ${response.status}`);

      const data = await response.json() as any;
      return data.choices?.[0]?.message?.content?.trim() || '';
    } finally {
      clearTimeout(timeout);
    }
  }

  // ========== Import Markdown Report ==========

  async importReportFromMarkdown(taskId: number | null, markdownContent: string, filename?: string): Promise<number> {
    const title = this.extractTitleFromMarkdown(markdownContent) || filename || '导入报告';
    const summary = this.extractSummaryFromMarkdown(markdownContent);
    const stats = this.extractStatsFromMarkdown(markdownContent);

    const report = await this.prisma.market_insight_reports.create({
      data: {
        task_id: taskId,
        title,
        summary,
        content: markdownContent,
        stats_json: stats ? JSON.stringify(stats) : null,
        category: '市场洞察',
        status: 'success',
        executed_at: new Date(),
      }
    });

    return report.id;
  }

  private extractTitleFromMarkdown(content: string): string {
    const match = content.match(/^#\s+(.+)/m);
    return match ? match[1].replace(/[📰🤖🔒⚙️🛠💡📝]/g, '').trim() : '';
  }

  private extractSummaryFromMarkdown(content: string): string {
    const match = content.match(/## 📝 今日看点\n\n([\s\S]*?)\n\n---/);
    return match ? match[1].trim() : '';
  }

  private extractStatsFromMarkdown(content: string): any {
    const tableMatch = content.match(/\| 扫描源.*?\n\|.*?\n\|(.+?)\|/s);
    if (!tableMatch) return null;

    const cells = tableMatch[1].split('|').map(c => c.trim());
    return {
      scanInfo: cells[0] || '',
      articleInfo: cells[1] || '',
      timeRange: cells[2] || '',
      selected: cells[3] || '',
    };
  }

  // ========== Convert to Requirement ==========

  async convertToRequirement(params: ConvertToRequirementParams) {
    const report = await this.prisma.market_insight_reports.findUnique({
      where: { id: params.reportId }
    });

    if (!report) throw new Error('报告不存在');

    const doc = await this.prisma.requirement_documents.create({
      data: {
        title: params.title,
        content: report.content,
        summary: report.summary || '',
        source_filename: `market-insight-report-${report.id}`,
        creator_id: params.userId,
        project_id: params.projectId || null,
        project_version_id: params.projectVersionId || null,
        status: 'ACTIVE',
      }
    });

    return doc;
  }
}
